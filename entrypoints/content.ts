import type { StoredState } from '../lib/types';
import { rewriteImg, rewriteAll } from '../lib/rewrite';

export default defineContentScript({
	matches: ['<all_urls>'],
	runAt: 'document_start',

	async main() {
		const result = await browser.storage.local.get(['proxyBase']);
		const { proxyBase } = result as Partial<StoredState>;

		if (!proxyBase) {
			browser.storage.onChanged.addListener((changes, area) => {
				if (area === 'local' && changes.proxyBase?.newValue) {
					init(changes.proxyBase.newValue as string);
				}
			});
			return;
		}

		init(proxyBase);
	}
});

function init(proxyBase: string): void {
	const observer = new MutationObserver((mutations) => {
		observer.disconnect();

		for (const mutation of mutations) {
			for (const node of mutation.addedNodes) {
				if (node instanceof HTMLImageElement) {
					rewriteImg(node, proxyBase);
				} else if (node instanceof Element) {
					rewriteAll(node, proxyBase);
				}
			}

			if (
				mutation.type === 'attributes' &&
				mutation.target instanceof HTMLImageElement &&
				(mutation.attributeName === 'src' || mutation.attributeName === 'srcset')
			) {
				rewriteImg(mutation.target, proxyBase);
			}
		}

		observer.observe(document.documentElement, observerConfig);
	});

	const observerConfig: MutationObserverInit = {
		childList: true,
		subtree: true,
		attributes: true,
		attributeFilter: ['src', 'srcset', 'style']
	};

	if (document.body) {
		rewriteAll(document, proxyBase);
	} else {
		document.addEventListener('DOMContentLoaded', () => rewriteAll(document, proxyBase), {
			once: true
		});
	}

	observer.observe(document.documentElement, observerConfig);
}
