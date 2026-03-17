import type { StoredState } from '../lib/types';
import { IMGUR_REGEX } from '../lib/constants';

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
	const proxied = location.href.replace(IMGUR_REGEX, `${proxyBase}/`);
	if (proxied !== location.href) {
		location.replace(proxied);
	}
}
