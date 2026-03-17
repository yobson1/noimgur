import type { RimgoApiResponse, RimgoInstance, StoredState, StoredPrefs } from './types';
import { API_URL, RULE_ID, IMGUR_REGEX_CAPTURE, STATE_KEYS, PREFS_KEYS } from './constants';
import { isPrivate } from './utils';

export async function fetchInstances(): Promise<RimgoInstance[]> {
	const res = await fetch(API_URL);
	if (!res.ok) throw new Error(`Failed to fetch instances: ${res.status}`);
	const data: RimgoApiResponse = await res.json();
	return data.clearnet.filter((i) => i.url.startsWith('https'));
}

export async function checkInstanceHealth(instance: RimgoInstance): Promise<boolean> {
	try {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 4000);
		const base = instance.url.replace(/\/$/, '');
		const res = await fetch(`${base}/CzXTtJV.jpg`, {
			method: 'HEAD',
			signal: controller.signal
		});
		clearTimeout(timeout);
		if (!res.ok) return false;
		if (res.headers.get('x-frame-options')?.toUpperCase().includes('SAMEORIGIN')) return false;
		const ct = res.headers.get('content-type') ?? '';
		if (!ct.startsWith('image/') || ct.includes('text/html')) return false;
		return true;
	} catch {
		return false;
	}
}

// Check all instances in parallel and persist the passing set to storage.
// Called on install, startup, and before each periodic alarm rotation.
export async function refreshHealthySet(instances: RimgoInstance[]): Promise<string[]> {
	console.log(`[noimgur] Health checking ${instances.length} instances...`);
	const results = await Promise.all(
		instances.map(async (i) => ({ domain: i.domain, healthy: await checkInstanceHealth(i) }))
	);
	const healthySet = results.filter((r) => r.healthy).map((r) => r.domain);
	await browser.storage.local.set({ healthySet });
	console.log(`[noimgur] ${healthySet.length}/${instances.length} instances healthy`);
	return healthySet;
}

export async function applyInstance(instance: RimgoInstance): Promise<void> {
	const base = instance.url.replace(/\/$/, '');

	await browser.declarativeNetRequest.updateDynamicRules({
		removeRuleIds: [RULE_ID],
		addRules: [
			{
				id: RULE_ID,
				priority: 1,
				action: {
					type: 'redirect' as Browser.declarativeNetRequest.RuleActionType,
					redirect: {
						regexSubstitution: `${base}/\\1`
					}
				},
				condition: {
					regexFilter: IMGUR_REGEX_CAPTURE,
					resourceTypes: [
						'main_frame',
						'sub_frame',
						'image'
					] as Browser.declarativeNetRequest.ResourceType[]
				}
			}
		]
	});

	const state: StoredState = {
		proxyBase: base,
		instanceDomain: instance.domain,
		lastUpdated: Date.now()
	};
	await browser.storage.local.set(state);

	console.log(`[noimgur] Using instance: ${instance.domain} (${instance.country})`);
}

export async function getStoredPrefs(): Promise<StoredPrefs> {
	const result = await browser.storage.local.get([...PREFS_KEYS]);
	return {
		blacklist: (result.blacklist as string[]) ?? [],
		privacyOnly: (result.privacyOnly as boolean) ?? false,
		healthySet: (result.healthySet as string[]) ?? []
	};
}

export function filterInstances(instances: RimgoInstance[], prefs: StoredPrefs): RimgoInstance[] {
	return instances.filter((i) => {
		if (prefs.healthySet.length > 0 && !prefs.healthySet.includes(i.domain)) return false;
		if (prefs.blacklist.includes(i.domain)) return false;
		if (prefs.privacyOnly && !isPrivate(i)) return false;
		return true;
	});
}

// trusts the persisted healthySet
export async function rotateInstance(): Promise<void> {
	try {
		const [instances, prefs, state] = await Promise.all([
			fetchInstances(),
			getStoredPrefs(),
			getStoredState()
		]);
		const eligible = filterInstances(instances, prefs).filter(
			(i) => i.domain !== state?.instanceDomain
		);

		if (eligible.length === 0) {
			console.warn('[noimgur] No eligible instances to rotate to.');
			return;
		}

		const picked = eligible[Math.floor(Math.random() * eligible.length)];
		await applyInstance(picked);
	} catch (err) {
		console.error('[noimgur] Failed to rotate instance:', err);
	}
}

export async function getStoredState(): Promise<StoredState | null> {
	const result: StoredState = await browser.storage.local.get([...STATE_KEYS]);
	if (!result.proxyBase) return null;
	return result;
}
