import type { StoredState } from '../lib/types';
import { IMGUR_REGEX } from '../lib/constants';

export default defineContentScript({
	// Run on all pages — imgur images can be embedded anywhere (Reddit, Steam, forums, etc.)
	matches: ['<all_urls>'],
	// Run at document_start so we can catch images before they fire off requests,
	// but we also handle document_idle images and mutations for SPAs
	runAt: 'document_start',

	async main() {
		const result = await browser.storage.local.get(['proxyBase']);
		const { proxyBase } = result as Partial<StoredState>;

		if (!proxyBase) {
			// Background hasn't set an instance yet (e.g. very first install, race condition).
			// Listen for storage changes and retry once it's set.
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

function isImgurSrc(src: string): boolean {
	return IMGUR_REGEX.test(src);
}

function rewriteSrc(src: string, proxyBase: string): string {
	return src.replace(IMGUR_REGEX, `${proxyBase}/`);
}

function rewriteImg(img: HTMLImageElement, proxyBase: string): void {
	if (isImgurSrc(img.src)) {
		img.src = rewriteSrc(img.src, proxyBase);
	}
	// Also handle srcset (e.g. <img srcset="...imgur.com/x.jpg 1x, ...imgur.com/x@2x.jpg 2x">)
	if (img.srcset) {
		img.srcset = img.srcset
			.split(',')
			.map((entry) => {
				const [url, descriptor] = entry.trim().split(/\s+/);
				if (isImgurSrc(url)) {
					return descriptor
						? `${rewriteSrc(url, proxyBase)} ${descriptor}`
						: rewriteSrc(url, proxyBase);
				}
				return entry.trim();
			})
			.join(', ');
	}
}

function rewriteAll(root: Document | Element, proxyBase: string): void {
	root.querySelectorAll<HTMLImageElement>('img').forEach((img) => {
		rewriteImg(img, proxyBase);
	});
}

function init(proxyBase: string): void {
	const observer = new MutationObserver((mutations) => {
		// Disconnect before making any DOM changes to prevent our own
		// src assignments from re-triggering this observer infinitely.
		observer.disconnect();

		for (const mutation of mutations) {
			for (const node of mutation.addedNodes) {
				if (node instanceof HTMLImageElement) {
					rewriteImg(node, proxyBase);
				} else if (node instanceof Element) {
					rewriteAll(node, proxyBase);
				}
			}

			// Handle src/srcset attribute changes on existing images (e.g. SPA lazy loaders)
			if (
				mutation.type === 'attributes' &&
				mutation.target instanceof HTMLImageElement &&
				(mutation.attributeName === 'src' || mutation.attributeName === 'srcset')
			) {
				rewriteImg(mutation.target, proxyBase);
			}
		}

		// Reconnect after all mutations in this batch are processed.
		observer.observe(document.documentElement, observerConfig);
	});

	const observerConfig: MutationObserverInit = {
		childList: true,
		subtree: true,
		attributes: true,
		attributeFilter: ['src', 'srcset']
	};

	// Rewrite anything already in the DOM
	if (document.body) {
		rewriteAll(document, proxyBase);
	} else {
		// document_start — body isn't ready yet, wait for it
		document.addEventListener('DOMContentLoaded', () => rewriteAll(document, proxyBase), {
			once: true
		});
	}

	observer.observe(document.documentElement, observerConfig);
}
