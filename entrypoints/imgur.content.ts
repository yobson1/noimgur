import type { StoredState } from '../lib/types';
import { rewriteUrl } from '../lib/rewrite';

export default defineContentScript({
	matches: ['*://*.imgur.com/*', '*://imgur.com/*'],
	runAt: 'document_start',

	async main() {
		const result = await browser.storage.local.get(['proxyBase']);
		const { proxyBase } = result as Partial<StoredState>;

		if (proxyBase) {
			redirect(proxyBase);
			return;
		}

		browser.storage.onChanged.addListener((changes, area) => {
			if (area === 'local' && changes.proxyBase?.newValue) {
				redirect(changes.proxyBase.newValue as string);
			}
		});
	}
});

function redirect(proxyBase: string): void {
	const proxied = rewriteUrl(location.href, proxyBase);
	if (proxied !== location.href) {
		location.replace(proxied);
	}
}
