import { IMAGE_HEALTH_DOCUMENT, IMAGE_HEALTH_MESSAGE, loadHealthImages } from './image-health';

const PROBE_RULE_ID = 2;

export async function probeInstanceImages(urls: string[]): Promise<boolean[]> {
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
