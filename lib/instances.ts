import type { RimgoApiResponse, RimgoInstance, StoredState } from './types';
import { API_URL, RULE_ID, IMGUR_REGEX_CAPTURE } from './constants';

export async function fetchInstances(): Promise<RimgoInstance[]> {
	const res = await fetch(API_URL);
	if (!res.ok) throw new Error(`Failed to fetch instances: ${res.status}`);
	const data: RimgoApiResponse = await res.json();
	// Only clearnet, only https
	return data.clearnet.filter((i) => i.url.startsWith('https'));
}

export async function checkInstanceHealth(instance: RimgoInstance): Promise<boolean> {
	try {
		// Ping the instance root with a short timeout
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 4000);
		const res = await fetch(instance.url, {
			method: 'HEAD',
			signal: controller.signal
		});
		clearTimeout(timeout);
		return res.ok;
	} catch {
		return false;
	}
}

export async function pickHealthyInstance(
	instances: RimgoInstance[]
): Promise<RimgoInstance | null> {
	// Shuffle so we don't hammer the same ones first
	const shuffled = [...instances].sort(() => Math.random() - 0.5);
	for (const instance of shuffled) {
		const healthy = await checkInstanceHealth(instance);
		if (healthy) return instance;
	}
	return null;
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
						// \1 captures everything after imgur.com/ and appends to proxy base
						regexSubstitution: `${base}/\\1`
					}
				},
				condition: {
					regexFilter: IMGUR_REGEX_CAPTURE,
					resourceTypes: [
						'main_frame',
						'sub_frame'
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

export async function rotateInstance(): Promise<void> {
	try {
		const instances = await fetchInstances();
		const picked = await pickHealthyInstance(instances);
		if (picked) {
			await applyInstance(picked);
		} else {
			console.warn('[noimgur] No healthy instances found, keeping current.');
		}
	} catch (err) {
		console.error('[noimgur] Failed to rotate instance:', err);
	}
}

export async function getStoredState(): Promise<StoredState | null> {
	const result: StoredState = await browser.storage.local.get([
		'proxyBase',
		'instanceDomain',
		'lastUpdated'
	]);
	if (!result.proxyBase) return null;
	return result;
}
