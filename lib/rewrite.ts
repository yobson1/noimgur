import { IMGUR_REGEX } from './constants';

export function isImgurSrc(src: string): boolean {
	return IMGUR_REGEX.test(src);
}

export function rewriteUrl(url: string, proxyBase: string): string {
	return url.replace(IMGUR_REGEX, `${proxyBase}/`);
}

export function rewriteImg(img: HTMLImageElement, proxyBase: string): void {
	if (isImgurSrc(img.src)) {
		img.src = rewriteUrl(img.src, proxyBase);
	}

	if (img.srcset) {
		img.srcset = img.srcset
			.split(',')
			.map((entry) => {
				const [url, descriptor] = entry.trim().split(/\s+/);
				if (isImgurSrc(url)) {
					return descriptor
						? `${rewriteUrl(url, proxyBase)} ${descriptor}`
						: rewriteUrl(url, proxyBase);
				}
				return entry.trim();
			})
			.join(', ');
	}
}

// Rewrite CSS properties that may contain imgur URLs:
// background-image, --custom-props, content, etc.
export function rewriteElementStyle(el: HTMLElement, proxyBase: string): void {
	const style = el.getAttribute('style');
	if (style && IMGUR_REGEX.test(style)) {
		el.setAttribute(
			'style',
			style.replace(new RegExp(IMGUR_REGEX.source, 'g'), `${proxyBase}/`)
		);
	}
}

export function rewriteAll(root: Document | Element, proxyBase: string): void {
	// Rewrite <img src> and <img srcset>
	root.querySelectorAll<HTMLImageElement>('img').forEach((img) => {
		rewriteImg(img, proxyBase);
	});

	// Rewrite inline style attributes containing imgur URLs on any element
	root.querySelectorAll<HTMLElement>('[style*="imgur.com"]').forEach((el) => {
		rewriteElementStyle(el, proxyBase);
	});

	// Handle the root element itself if it has an inline style
	if (root instanceof HTMLElement && root.getAttribute('style')?.includes('imgur.com')) {
		rewriteElementStyle(root, proxyBase);
	}
}
