import { IMAGE_HEALTH_DOCUMENT, IMAGE_HEALTH_MESSAGE, loadHealthImages } from './image-health';
import { headerValue, isAnubisPage, isChallengeResponse } from './image-evidence';

const PROBE_RULE_ID = 2;

export type ProbeOutcome = 'healthy' | 'probe-blocked' | 'failed';

async function hasChallengePage(url: string): Promise<boolean> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 3500);
	try {
		const response = await fetch(url, {
			cache: 'no-store',
			credentials: 'omit',
			redirect: 'error',
			signal: controller.signal
		});
		if (response.headers.get('cf-mitigated') === 'challenge') return true;
		if (!response.headers.get('content-type')?.includes('text/html') || !response.body) return false;
		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let html = '';
		while (html.length < 32768) {
			const { value, done } = await reader.read();
			if (done) break;
			html += decoder.decode(value.subarray(0, 32768 - html.length), { stream: true });
			if (isAnubisPage(html)) return true;
		}
		return false;
	} catch {
		return false;
	} finally {
		clearTimeout(timeout);
		controller.abort();
	}
}

export async function probeInstanceImages(urls: string[]): Promise<ProbeOutcome[]> {
	const targets = new Set(urls);
	const challenged = new Set<string>();
	const htmlResponses = new Set<string>();
	const observe = ({ url, tabId, responseHeaders }: Browser.webRequest.OnHeadersReceivedDetails): undefined => {
		const requestUrl = url.split('#', 1)[0]!;
		if (tabId !== -1 || !targets.has(requestUrl)) return;
		if (isChallengeResponse(responseHeaders)) challenged.add(requestUrl);
		if (headerValue(responseHeaders, 'content-type').includes('text/html')) {
			htmlResponses.add(requestUrl);
		}
		return undefined;
	};

	browser.webRequest.onHeadersReceived.addListener(observe, {
		urls: ['http://*/*', 'https://*/*'],
		types: ['image' as Browser.webRequest.ResourceType]
	}, ['responseHeaders' as Browser.webRequest.OnHeadersReceivedOptions]);
	try {
		const results = await loadProbeImages(urls);
		return await Promise.all(urls.map(async (url, index) => {
			if (results[index]) return 'healthy';
			if (challenged.has(url) || (htmlResponses.has(url) && await hasChallengePage(url))) {
				return 'probe-blocked';
			}
			return 'failed';
		}));
	} finally {
		browser.webRequest.onHeadersReceived.removeListener(observe);
	}
}

async function loadProbeImages(urls: string[]): Promise<boolean[]> {
	const { declarativeNetRequest, offscreen, runtime } = browser;
	const { hostname } = new URL(runtime.getURL('/'));
	// Use the normal image URL. Revalidate it and prevent the probe from storing
	// credentials or populating the browser cache with a year-long response.
	await declarativeNetRequest.updateSessionRules({
		removeRuleIds: [PROBE_RULE_ID],
		addRules: [
			{
				id: PROBE_RULE_ID,
				priority: 1,
				condition: {
					initiatorDomains: [hostname],
					tabIds: [-1],
					urlFilter: '|http',
					resourceTypes: ['image' as Browser.declarativeNetRequest.ResourceType]
				},
				action: {
					type: 'modifyHeaders' as Browser.declarativeNetRequest.RuleActionType,
					requestHeaders: [
						{ header: 'Cookie', operation: 'remove' },
						{ header: 'Authorization', operation: 'remove' },
						{ header: 'Cache-Control', operation: 'set', value: 'no-cache, no-store' }
					],
					responseHeaders: [
						{ header: 'Set-Cookie', operation: 'remove' },
						{ header: 'Cache-Control', operation: 'set', value: 'no-store' }
					]
				}
			}
		]
	});

	try {
		if (typeof document !== 'undefined') {
			// Firefox can reuse a decoded image in the background document before
			// the request headers are applied. A fragment changes its image cache
			// key without changing the URL sent to the server.
			const probeId = crypto.randomUUID();
			return await loadHealthImages(urls.map((url) => `${url}#${probeId}`));
		}

		const documentUrl = runtime.getURL(`/${IMAGE_HEALTH_DOCUMENT}`);
		// Close a document left by an interrupted worker before starting a new batch.
		const worker = globalThis as unknown as { clients: { matchAll(): Promise<{ url: string }[]> } };
		if ((await worker.clients.matchAll()).some((client) => client.url === documentUrl)) {
			await offscreen.closeDocument();
		}
		await offscreen.createDocument({
			url: IMAGE_HEALTH_DOCUMENT,
			reasons: ['DOM_SCRAPING' as Browser.offscreen.Reason],
			justification: 'Load probe images in an isolated frame and check their decoded dimensions.'
		});
		try {
			const results: boolean[] | null = await runtime.sendMessage({
				type: IMAGE_HEALTH_MESSAGE,
				urls
			});
			if (!results || results.length !== urls.length) {
				throw new Error('Image probe did not return results');
			}
			return results;
		} finally {
			await offscreen.closeDocument();
		}
	} finally {
		await declarativeNetRequest.updateSessionRules({ removeRuleIds: [PROBE_RULE_ID] });
	}
}
