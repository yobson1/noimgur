import type { RimgoApiResponse, RimgoInstance, StoredState, StoredPrefs } from './types';
import {
	API_URLS,
	API_FETCH_TIMEOUT_MS,
	RULE_ID,
	IMGUR_REGEX_CAPTURE,
	STATE_KEYS,
	PREFS_KEYS
} from './constants';
import { isPrivate } from './utils';
import { healthImageUrl } from './image-health';
import { probeInstanceImages } from './health-check';
import bundledInstances from './instances.json';

export type InstanceSource = (typeof API_URLS)[number] | 'bundled';

export interface InstanceFetchResult {
	instances: RimgoInstance[];
	source: InstanceSource;
}

async function fetchInstancesFromUrl(url: string, signal: AbortSignal): Promise<RimgoInstance[]> {
	const res = await fetch(url, { signal });
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	const data: RimgoApiResponse = await res.json();
	if (!Array.isArray(data.clearnet)) throw new Error('Response has no clearnet instances');
	return data.clearnet.filter((i) => i.url.startsWith('https'));
}

export async function fetchInstancesWithSource(): Promise<InstanceFetchResult> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), API_FETCH_TIMEOUT_MS);

	try {
		return await Promise.any(
			API_URLS.map(async (url) => ({
				instances: await fetchInstancesFromUrl(url, controller.signal),
				source: url
			}))
		);
	} catch (err) {
		console.warn('[noimgur] Remote instance lists unavailable, using bundled list.', err);
		return {
			instances: bundledInstances.clearnet.filter((i) => i.url.startsWith('https')),
			source: 'bundled'
		};
	} finally {
		clearTimeout(timeout);
		controller.abort();
	}
}

export async function fetchInstances(): Promise<RimgoInstance[]> {
	return (await fetchInstancesWithSource()).instances;
}

async function supportsCrossOriginFrames(base: string): Promise<boolean> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 4000);
	try {
		const healthCheckUrl = new URL(healthImageUrl(base));
		healthCheckUrl.searchParams.set('noimgur-health', Date.now().toString());
		const res = await fetch(healthCheckUrl, {
			method: 'HEAD',
			cache: 'no-store',
			credentials: 'omit',
			signal: controller.signal
		});
		if (!res.ok) return false;
		const frameOptions = (res.headers.get('x-frame-options') ?? '').toUpperCase();
		if (frameOptions.includes('SAMEORIGIN') || frameOptions.includes('DENY')) return false;
		const csp = res.headers.get('content-security-policy') ?? '';
		if (/(?:^|[;,])\s*frame-ancestors\s/i.test(csp)) return false;
		const ct = res.headers.get('content-type') ?? '';
		return ct.startsWith('image/');
	} catch {
		return false;
	} finally {
		clearTimeout(timeout);
	}
}

let healthRefresh: Promise<string[]> | undefined;

// Check all instances in parallel and persist the passing set to storage.
// Called on install, startup, and before each periodic alarm rotation.
export function refreshHealthySet(instances: RimgoInstance[]): Promise<string[]> {
	healthRefresh ??= (async () => {
		console.log(`[noimgur] Health checking ${instances.length} instances...`);
		const results = await probeInstanceImages(instances.map((i) => healthImageUrl(i.url)));
		const healthySet = instances.filter((_, index) => results[index]).map((i) => i.domain);
		await browser.storage.local.set({ healthySet });
		console.log(`[noimgur] ${healthySet.length}/${instances.length} instances healthy`);
		return healthySet;
	})().finally(() => {
		healthRefresh = undefined;
	});
	return healthRefresh;
}

export async function applyInstance(instance: RimgoInstance): Promise<void> {
	const base = instance.url.replace(/\/$/, '');
	const resourceTypes = ['main_frame', 'image'] as Browser.declarativeNetRequest.ResourceType[];
	if (await supportsCrossOriginFrames(base)) {
		resourceTypes.push('sub_frame' as Browser.declarativeNetRequest.ResourceType);
	}

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
					resourceTypes
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
		healthySet: (result.healthySet as string[] | undefined) ?? null,
		autoRotate: (result.autoRotate as boolean) ?? true
	};
}

export function filterInstances(instances: RimgoInstance[], prefs: StoredPrefs): RimgoInstance[] {
	return instances.filter((i) => {
		if (prefs.healthySet && !prefs.healthySet.includes(i.domain)) return false;
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

		const picked = eligible[Math.floor(Math.random() * eligible.length)]!;
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
