import { IMGUR_REGEX } from './constants';

export function isImgurSrc(src: string): boolean {
	return IMGUR_REGEX.test(src);
}

export function rewriteUrl(url: string, proxyBase: string): string {
	return url.replace(IMGUR_REGEX, `${proxyBase}/`);
}

export function rewriteImg(img: HTMLImageElement, proxyBase: string): void {
	if (isImgurSrc(img.src)) {
		const next = rewriteUrl(img.src, proxyBase);
		if (next !== img.src) img.src = next;
	}

	if (img.srcset) {
		const next = img.srcset
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
		if (next !== img.srcset) img.srcset = next;
	}
}

// Rewrite CSS properties that may contain imgur URLs:
// background-image, --custom-props, content, etc.
export function rewriteElementStyle(el: HTMLElement, proxyBase: string): void {
	const style = el.getAttribute('style');
	if (style && IMGUR_REGEX.test(style)) {
		const next = style.replace(new RegExp(IMGUR_REGEX.source, 'g'), `${proxyBase}/`);
		if (next !== style) el.setAttribute('style', next);
	}
}

// Rewrite imgur URLs in all accessible CSSStyleSheets (linked or embedded).
// Cross-origin sheets will throw on access and are silently skipped.
export function rewriteStyleSheets(doc: Document, proxyBase: string): void {
	for (const sheet of Array.from(doc.styleSheets)) {
		let rules: CSSRuleList;
		try {
			rules = sheet.cssRules;
		} catch {
			// Cross-origin sheet, can't access rules. skip.
			continue;
		}

		for (let i = 0; i < rules.length; i++) {
			const rule = rules[i];
			if (!(rule instanceof CSSStyleRule)) continue;

			const text = rule.style.cssText;
			if (!IMGUR_REGEX.test(text)) continue;

			const rewritten = text.replace(new RegExp(IMGUR_REGEX.source, 'g'), `${proxyBase}/`);
			// Replace the rule in-place: delete + insert at same index
			const selector = rule.selectorText;
			sheet.deleteRule(i);
			sheet.insertRule(`${selector} { ${rewritten} }`, i);
		}
	}
}

export function rewriteAll(root: Document | Element, proxyBase: string): void {
	// Rewrite linked/embedded stylesheets — only possible from a Document root
	if (root instanceof Document) {
		rewriteStyleSheets(root, proxyBase);
	}

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
