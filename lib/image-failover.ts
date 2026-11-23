import { IMGUR_REGEX_CAPTURE } from './constants';
import { allowedInstance, imageCandidateRank, imageHealth, imageResponse, imgurImagePath } from './image-evidence';
import { applyInstance, fetchInstances, getStoredPrefs, getStoredState } from './instances';
import type { ImageEvidence, RimgoInstance } from './types';

// IDs 1 and 2 are the default redirect and the background probe header rule.
const HEADER_RULE_ID = 3;
const FIRST_TAB_RULE_ID = 4;
const TAB_RULE_PRIORITY = 2;
const REQUEST_MAX_AGE_MS = 120_000;
const OBSERVATION_INTERVAL_MS = 60_000;

type Request = {
	tabId: number;
	base: string;
	path: string;
	redirects: number;
	startedAt: number;
	response?: ReturnType<typeof imageResponse>;
};

const pending = new Map<string, Request>();
const verifiedAt = new Map<string, number>();
let updates = Promise.resolve();
let canArmHeaderRedirect = !import.meta.env.FIREFOX;

function serialize<T>(update: () => Promise<T>): Promise<T> {
	const result = updates.then(update);
	updates = result.then(() => undefined, () => undefined);
	return result;
}

const baseOf = (instance: RimgoInstance) => instance.url.replace(/\/$/, '');
type Rule = Browser.declarativeNetRequest.Rule;

function tabRules(rules: Rule[], tabId: number): Rule[] {
	return rules.filter((rule) => rule.id >= FIRST_TAB_RULE_ID && rule.condition.tabIds?.includes(tabId));
}

function freeRuleId(rules: Rule[]): number {
	const taken = new Set(rules.map((rule) => rule.id));
	let id = FIRST_TAB_RULE_ID;
	while (taken.has(id)) id++;
	return id;
}

function tabBase(rules: Rule[], tabId: number): string | undefined {
	const primary = tabRules(rules, tabId).find((rule) => rule.condition.regexFilter === IMGUR_REGEX_CAPTURE);
	return primary?.action.redirect?.regexSubstitution?.slice(0, -3);
}

async function knownInstances(): Promise<RimgoInstance[]> {
	const { checkedInstances } = await browser.storage.local.get('checkedInstances');
	return (checkedInstances as RimgoInstance[] | undefined) ?? fetchInstances();
}

async function recordImageEvidence(
	prefs: Awaited<ReturnType<typeof getStoredPrefs>>,
	domain: string,
	ok: boolean,
	at: number
): Promise<void> {
	const previous = prefs.imageEvidence?.[domain];
	if (previous && (previous.at > at ||
		(previous.ok === ok && at - previous.at < OBSERVATION_INTERVAL_MS))) return;
	const evidence: ImageEvidence = Object.fromEntries(
		Object.entries(prefs.imageEvidence ?? {}).filter(([, value]) => at - value.at < 3_600_000)
	);
	evidence[domain] = { ok, at };
	await browser.storage.local.set({ imageEvidence: evidence });
	prefs.imageEvidence = evidence;
}

async function routeTabImages(tabId: number, base: string, rules: Rule[]): Promise<void> {
	const existing = tabRules(rules, tabId);
	const headerRule = rules.find((rule) => rule.id === HEADER_RULE_ID);
	const addRules: Rule[] = [{
		id: existing[0]?.id ?? freeRuleId(rules),
		priority: TAB_RULE_PRIORITY,
		action: {
			type: 'redirect' as Browser.declarativeNetRequest.RuleActionType,
			redirect: { regexSubstitution: `${base}/\\1` }
		},
		condition: {
			tabIds: [tabId],
			regexFilter: IMGUR_REGEX_CAPTURE,
			resourceTypes: ['image' as Browser.declarativeNetRequest.ResourceType]
		}
	}];
	const removeRuleIds = existing.map((rule) => rule.id);
	if (headerRule && !headerRule.condition.excludedTabIds?.includes(tabId)) {
		removeRuleIds.push(HEADER_RULE_ID);
		addRules.push({
			...headerRule,
			condition: {
				...headerRule.condition,
				excludedTabIds: [...(headerRule.condition.excludedTabIds ?? [-1]), tabId]
			}
		});
	}
	await browser.declarativeNetRequest.updateSessionRules({
		removeRuleIds,
		addRules
	});
}

async function verifyImage(request: Request): Promise<void> {
	if ((verifiedAt.get(request.base) ?? 0) + OBSERVATION_INTERVAL_MS > Date.now()) return;
	verifiedAt.set(request.base, Date.now());
	const promotion = await serialize(async () => {
		const [instances, prefs] = await Promise.all([knownInstances(), getStoredPrefs()]);
		const instance = instances.find((i) => baseOf(i) === request.base);
		if (!instance) return;
		await recordImageEvidence(prefs, instance.domain, true, request.startedAt);
		if (imageHealth(instance.domain, prefs) !== 'verified' || !allowedInstance(instance, prefs)) return;

		const [state, rules] = await Promise.all([
			getStoredState(), browser.declarativeNetRequest.getSessionRules()
		]);
		if (state && state.instanceDomain !== instance.domain &&
			imageHealth(state.instanceDomain, prefs) === 'failed' &&
			tabBase(rules, request.tabId) === request.base) {
			return { instance, previous: state };
		}
	});
	if (!promotion) return;

	const { instance, previous } = promotion;
	await applyInstance(instance, async () => {
		const [state, prefs] = await Promise.all([getStoredState(), getStoredPrefs()]);
		// The frame check can take several seconds. Revalidate the choice so an
		// old success cannot override a more recent selection or failure.
		return state?.instanceDomain === previous.instanceDomain &&
			state.lastUpdated === previous.lastUpdated &&
			imageHealth(state.instanceDomain, prefs) === 'failed' &&
			imageHealth(instance.domain, prefs) === 'verified' &&
			allowedInstance(instance, prefs);
	});
}

function candidatesFor(
	instances: RimgoInstance[],
	prefs: Awaited<ReturnType<typeof getStoredPrefs>>,
	previous: string
): string[] {
	return instances
		.filter((i) => baseOf(i) !== previous && allowedInstance(i, prefs))
		.map((i) => ({ base: baseOf(i), rank: imageCandidateRank(imageHealth(i.domain, prefs)) }))
		.filter(({ rank }) => rank < imageCandidateRank('failed'))
		.sort((a, b) => a.rank - b.rank)
		.map(({ base }) => base);
}

function switchAfterFailure(request: Request, preferred?: string): Promise<string | undefined> {
	return serialize(async () => {
		const [instances, prefs, state, rules] = await Promise.all([
			knownInstances(), getStoredPrefs(), getStoredState(), browser.declarativeNetRequest.getSessionRules()
		]);
		const override = tabBase(rules, request.tabId);
		const failed = instances.find((i) => baseOf(i) === request.base);
		if (!failed && state?.proxyBase !== request.base && override !== request.base) return;
		if (failed) {
			await recordImageEvidence(prefs, failed.domain, false, request.startedAt);
			verifiedAt.delete(request.base);
		}
		// A late response from an earlier instance must not replace the route
		// established by another request in this tab.
		const current = override ?? state?.proxyBase;
		const candidates = candidatesFor(instances, prefs, request.base);
		if (current !== request.base) return current && candidates.includes(current) ? current : undefined;
		const next = preferred && candidates.includes(preferred) ? preferred : candidates[0];
		if (next) {
			await routeTabImages(request.tabId, next, rules);
			// A previously verified instance still needs to prove this failover.
			verifiedAt.delete(next);
		}
		return next;
	});
}

function refreshHeaderRedirect(clearTabs = false): Promise<void> {
	return serialize(async () => {
		const rules = await browser.declarativeNetRequest.getSessionRules();
		const removeRuleIds = rules.filter((rule) =>
			rule.id === HEADER_RULE_ID || (clearTabs && rule.id >= FIRST_TAB_RULE_ID)
		).map((rule) => rule.id);
		if (!canArmHeaderRedirect) {
			if (removeRuleIds.length) await browser.declarativeNetRequest.updateSessionRules({ removeRuleIds });
			return;
		}
		const [instances, prefs, state] = await Promise.all([
			knownInstances(), getStoredPrefs(), getStoredState()
		]);
		const backup = state && candidatesFor(instances, prefs, state.proxyBase)[0];
		if (!state || !backup) {
			if (removeRuleIds.length) await browser.declarativeNetRequest.updateSessionRules({ removeRuleIds });
			return;
		}

		// Response conditions must be in place before Chromium starts the
		// request. Only match third-party image URLs on the selected proxy.
		const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		const regexFilter = `^${escape(state.proxyBase)}/((?:stack/)?[a-z0-9]+\\.(?:jpe?g|png|gif|webp|avif|svg)(?:\\?.*)?)$`;
		const excludedTabIds = clearTabs ? [-1] : [
			-1, ...rules.filter((rule) => rule.id >= FIRST_TAB_RULE_ID)
				.flatMap((rule) => rule.condition.tabIds ?? [])
		];
		const headerRule: Rule = {
			id: HEADER_RULE_ID,
			priority: TAB_RULE_PRIORITY + 1,
			action: {
				type: 'redirect' as Browser.declarativeNetRequest.RuleActionType,
				redirect: { regexSubstitution: `${backup}/\\1` }
			},
			condition: {
				excludedTabIds,
				domainType: 'thirdParty' as Browser.declarativeNetRequest.DomainType,
				regexFilter,
				resourceTypes: ['image' as Browser.declarativeNetRequest.ResourceType],
				responseHeaders: [
					{ header: 'cf-mitigated', values: ['challenge'] },
					{ header: 'content-type', values: ['text/html*'] }
				]
			}
		};
		try {
			await browser.declarativeNetRequest.updateSessionRules({
				removeRuleIds,
				addRules: [headerRule]
			});
		} catch {
			// Older Chromium versions still get next-request failover.
			canArmHeaderRedirect = false;
			if (removeRuleIds.length) await browser.declarativeNetRequest.updateSessionRules({ removeRuleIds });
		}
	});
}

function handle(promise: Promise<unknown>): void {
	promise.catch((err) => console.warn('[noimgur] Could not handle image redirect:', err));
}

export function registerImageFailover(): void {
	const imageType = 'image' as Browser.webRequest.ResourceType;
	const images = { urls: ['http://*/*', 'https://*/*'], types: [imageType] };
	browser.webRequest.onBeforeRedirect.addListener((details) => {
		if (details.tabId < 0) return;
		const previous = pending.get(details.requestId);
		const path = previous?.path ?? imgurImagePath(details.url);
		const suffix = `/${path}`;
		if (path === undefined || !details.redirectUrl.startsWith('https://') ||
			!details.redirectUrl.endsWith(suffix) || imgurImagePath(details.redirectUrl) !== undefined) return;
		const base = details.redirectUrl.slice(0, -suffix.length);
		if (previous && base === previous.base) return;
		for (const [id, request] of pending) {
			if (details.timeStamp - request.startedAt > REQUEST_MAX_AGE_MS) pending.delete(id);
		}
		const request = {
			tabId: details.tabId,
			base,
			path,
			redirects: (previous?.redirects ?? 0) + 1,
			startedAt: details.timeStamp
		};
		pending.set(details.requestId, request);
		if (previous?.response === 'failed') handle(switchAfterFailure(previous, base));
	}, images);

	const onHeaders = (details: Browser.webRequest.OnHeadersReceivedDetails) => {
		const request = pending.get(details.requestId);
		if (!request) return;
		request.response = imageResponse(details.statusCode, details.responseHeaders);
		if (import.meta.env.FIREFOX && request.response === 'failed' && request.redirects === 1) {
			return switchAfterFailure(request)
				.then((base) => base ? { redirectUrl: `${base}/${request.path}` } : undefined)
				.catch(() => undefined);
		}
	};
	// Gecko accepts a promise from an asynchronous blocking listener. The
	// shared browser types model Chromium's synchronous return value.
	const headerOptions = ['responseHeaders' as Browser.webRequest.OnHeadersReceivedOptions];
	if (import.meta.env.FIREFOX) headerOptions.push('blocking' as Browser.webRequest.OnHeadersReceivedOptions);
	browser.webRequest.onHeadersReceived.addListener(
		onHeaders as Parameters<typeof browser.webRequest.onHeadersReceived.addListener>[0],
		images,
		headerOptions
	);
	browser.webRequest.onCompleted.addListener(({ requestId }) => {
		const request = pending.get(requestId);
		pending.delete(requestId);
		if (request?.response === 'failed') handle(switchAfterFailure(request));
		if (request?.response === 'image') handle(verifyImage(request));
	}, images);
	browser.webRequest.onErrorOccurred.addListener(({ requestId, error }) => {
		const request = pending.get(requestId);
		pending.delete(requestId);
		// Ignore cancellation, CSP, ad blocking and offline events. Those are
		// not evidence of an instance failure.
		if (request && (request.response === 'failed' ||
			/ERR_(?:NAME_NOT_RESOLVED|TIMED_OUT|CONNECTION_(?:REFUSED|RESET|CLOSED)|SSL_|CERT_|HTTP2_|BLOCKED_BY_(?:RESPONSE|ORB))|NS_ERROR_(?:UNKNOWN_HOST|NET_TIMEOUT|CONNECTION_REFUSED|NET_RESET)|MOZILLA_PKIX_ERROR|SSL_ERROR/i.test(error))) {
			handle(switchAfterFailure(request));
		}
	}, images);
	browser.tabs.onRemoved.addListener((tabId) => {
		for (const [id, request] of pending) {
			if (request.tabId === tabId) pending.delete(id);
		}
		handle(serialize(async () => {
			const rules = tabRules(await browser.declarativeNetRequest.getSessionRules(), tabId);
			if (rules.length) {
				await browser.declarativeNetRequest.updateSessionRules({ removeRuleIds: rules.map((rule) => rule.id) });
			}
		}));
		if (canArmHeaderRedirect) handle(refreshHeaderRedirect());
	});
	browser.storage.onChanged.addListener((changes, area) => {
		if (area !== 'local') return;
		if (changes.blacklist || changes.privacyOnly || changes.instanceDomain) {
			handle(refreshHeaderRedirect(true));
		} else if (canArmHeaderRedirect && (changes.healthySet || changes.probeBlocked || changes.imageEvidence)) {
			handle(refreshHeaderRedirect());
		}
	});
}
