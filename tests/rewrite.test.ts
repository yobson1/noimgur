import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, beforeEach } from 'vitest';
import {
	rewriteImg,
	rewriteAll,
	rewriteElementStyle,
	rewriteUrl,
	rewriteStyleSheets
} from '../lib/rewrite';

const PROXY = 'https://rimgo.example.com';
const FIXTURE_HTML = readFileSync(resolve(__dirname, 'fixture.html'), 'utf-8');

// Helpers

function el<T extends HTMLElement>(id: string): T {
	return document.getElementById(id) as T;
}

function img(id: string): HTMLImageElement {
	return el<HTMLImageElement>(id);
}

describe('rewriteUrl', () => {
	it('rewrites i.imgur.com URLs', () => {
		expect(rewriteUrl('https://i.imgur.com/CzXTtJV.jpg', PROXY)).toBe(`${PROXY}/CzXTtJV.jpg`);
	});

	it('rewrites imgur.com URLs (no subdomain)', () => {
		expect(rewriteUrl('https://imgur.com/CzXTtJV.jpg', PROXY)).toBe(`${PROXY}/CzXTtJV.jpg`);
	});

	it('rewrites http imgur URLs', () => {
		expect(rewriteUrl('http://i.imgur.com/CzXTtJV.jpg', PROXY)).toBe(`${PROXY}/CzXTtJV.jpg`);
	});

	it('does not rewrite non-imgur URLs', () => {
		const url = 'https://example.com/safe.jpg';
		expect(rewriteUrl(url, PROXY)).toBe(url);
	});
});

describe('rewriteImg', () => {
	beforeEach(() => {
		document.body.innerHTML = FIXTURE_HTML;
	});

	it('rewrites plain <img src>', () => {
		rewriteImg(img('img-src'), PROXY);
		expect(img('img-src').src).toBe(`${PROXY}/CzXTtJV.jpg`);
	});

	it('rewrites <img src> with no subdomain', () => {
		rewriteImg(img('img-src-nodomain'), PROXY);
		expect(img('img-src-nodomain').src).toBe(`${PROXY}/CzXTtJV.jpg`);
	});

	it('rewrites single-entry srcset', () => {
		rewriteImg(img('img-srcset-single'), PROXY);
		expect(img('img-srcset-single').srcset).toBe(`${PROXY}/CzXTtJV.jpg 1x`);
	});

	it('rewrites multi-entry srcset, leaving non-imgur entries untouched', () => {
		rewriteImg(img('img-srcset-multi'), PROXY);
		const srcset = img('img-srcset-multi').srcset;
		expect(srcset).toContain(`${PROXY}/CzXTtJV.jpg 480w`);
		expect(srcset).toContain(`${PROXY}/OB0y6MR.jpg 1080w`);
		expect(srcset).toContain('https://example.com/other.jpg   1440w');
	});

	it('rewrites both src and srcset when both are present', () => {
		rewriteImg(img('img-src-and-srcset'), PROXY);
		expect(img('img-src-and-srcset').src).toBe(`${PROXY}/CzXTtJV.jpg`);
		expect(img('img-src-and-srcset').srcset).toContain(`${PROXY}/CzXTtJV.jpg 1x`);
		expect(img('img-src-and-srcset').srcset).toContain(`${PROXY}/OB0y6MR.jpg 2x`);
	});

	it('does not touch non-imgur <img src>', () => {
		rewriteImg(img('img-other'), PROXY);
		expect(img('img-other').src).toBe('https://example.com/safe.jpg');
	});
});

describe('rewriteElementStyle', () => {
	beforeEach(() => {
		document.body.innerHTML = FIXTURE_HTML;
	});

	it('rewrites background-image in inline style', () => {
		rewriteElementStyle(el('div-bg-image'), PROXY);
		expect(el('div-bg-image').getAttribute('style')).toContain(`${PROXY}/CzXTtJV.jpg`);
	});

	it('rewrites multiple imgur URLs in a multi-background style', () => {
		rewriteElementStyle(el('div-bg-multi'), PROXY);
		const style = el('div-bg-multi').getAttribute('style')!;
		expect(style).toContain(`${PROXY}/CzXTtJV.jpg`);
		expect(style).toContain(`${PROXY}/OB0y6MR.jpg`);
	});

	it('does not touch non-imgur inline styles', () => {
		rewriteElementStyle(el('div-bg-other'), PROXY);
		expect(el('div-bg-other').getAttribute('style')).toContain('example.com/safe.jpg');
	});
});

describe('rewriteAll', () => {
	beforeEach(() => {
		document.body.innerHTML = FIXTURE_HTML;
	});

	it('rewrites all <img src> elements in the document', () => {
		rewriteAll(document, PROXY);
		expect(img('img-src').src).toBe(`${PROXY}/CzXTtJV.jpg`);
		expect(img('img-src-nodomain').src).toBe(`${PROXY}/CzXTtJV.jpg`);
		expect(img('img-src-and-srcset').src).toBe(`${PROXY}/CzXTtJV.jpg`);
	});

	it('rewrites srcset on all matching images', () => {
		rewriteAll(document, PROXY);
		expect(img('img-srcset-single').srcset).toBe(`${PROXY}/CzXTtJV.jpg 1x`);
		expect(img('img-srcset-multi').srcset).toContain(`${PROXY}/CzXTtJV.jpg 480w`);
	});

	it('rewrites inline style background-image', () => {
		rewriteAll(document, PROXY);
		expect(el('div-bg-image').getAttribute('style')).toContain(`${PROXY}/CzXTtJV.jpg`);
	});

	it('rewrites multi-background inline styles', () => {
		rewriteAll(document, PROXY);
		const style = el('div-bg-multi').getAttribute('style')!;
		expect(style).toContain(`${PROXY}/CzXTtJV.jpg`);
		expect(style).toContain(`${PROXY}/OB0y6MR.jpg`);
	});

	it('leaves non-imgur inline styles untouched', () => {
		rewriteAll(document, PROXY);
		expect(el('div-bg-other').getAttribute('style')).toContain('example.com/safe.jpg');
	});

	it('leaves non-imgur images untouched', () => {
		rewriteAll(document, PROXY);
		expect(img('img-other').src).toBe('https://example.com/safe.jpg');
	});

	it('rewrites deeply nested images', () => {
		rewriteAll(document, PROXY);
		expect(img('img-nested').src).toBe(`${PROXY}/OB0y6MR.jpg`);
	});

	it('works when called on a subtree element rather than document', () => {
		rewriteAll(el('container-nested'), PROXY);
		expect(img('img-nested').src).toBe(`${PROXY}/OB0y6MR.jpg`);
		expect(img('img-src').src).toBe('https://i.imgur.com/CzXTtJV.jpg');
	});
});

describe('rewriteStyleSheets', () => {
	beforeEach(() => {
		while (document.styleSheets.length > 0) {
			(document.styleSheets[0].ownerNode as Element)?.remove();
		}
	});

	function injectSheet(cssText: string): CSSStyleSheet {
		const style = document.createElement('style');
		style.textContent = cssText;
		document.head.appendChild(style);
		return style.sheet as CSSStyleSheet;
	}

	it('rewrites imgur URL in a stylesheet rule', () => {
		injectSheet(`.imgur-bg { background-image: url('https://i.imgur.com/CzXTtJV.jpg'); }`);
		rewriteStyleSheets(document, PROXY);
		const rule = document.styleSheets[0].cssRules[0] as CSSStyleRule;
		expect(rule.style.backgroundImage).toContain(PROXY);
		expect(rule.style.backgroundImage).not.toContain('imgur.com');
	});

	it('rewrites multiple imgur URLs in the same rule', () => {
		injectSheet(
			`.multi { background: url('https://i.imgur.com/CzXTtJV.jpg') top, url('https://i.imgur.com/OB0y6MR.jpg') bottom; }`
		);
		rewriteStyleSheets(document, PROXY);
		const rule = document.styleSheets[0].cssRules[0] as CSSStyleRule;
		const bg = rule.style.background;
		expect(bg).toContain(`${PROXY}/CzXTtJV.jpg`);
		expect(bg).toContain(`${PROXY}/OB0y6MR.jpg`);
	});

	it('leaves non-imgur rules untouched', () => {
		injectSheet(`.safe { background-image: url('https://example.com/safe.jpg'); }`);
		rewriteStyleSheets(document, PROXY);
		const rule = document.styleSheets[0].cssRules[0] as CSSStyleRule;
		expect(rule.style.backgroundImage).toContain('example.com/safe.jpg');
	});

	it('rewrites sheets via rewriteAll', () => {
		document.body.innerHTML = FIXTURE_HTML;
		injectSheet(`.imgur-bg { background-image: url('https://i.imgur.com/CzXTtJV.jpg'); }`);
		rewriteAll(document, PROXY);
		const rule = document.styleSheets[0].cssRules[0] as CSSStyleRule;
		expect(rule.style.backgroundImage).toContain(PROXY);
	});
});
