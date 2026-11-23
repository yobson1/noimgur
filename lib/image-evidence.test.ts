import { expect, it } from 'vitest';
import { imageHealth, imageResponse, imgurImagePath, isAnubisPage, isChallengeResponse } from './image-evidence';
import type { StoredPrefs } from './types';

const prefs: StoredPrefs = {
	blacklist: [],
	privacyOnly: false,
	healthySet: ['healthy.example'],
	probeBlocked: ['blocked.example'],
	autoRotate: true
};

it('keeps a challenge separate from verified availability', () => {
	expect(isChallengeResponse([{ name: 'Cf-Mitigated', value: 'challenge' }])).toBe(true);
	expect(isChallengeResponse([{ name: 'Server', value: 'cloudflare' }])).toBe(false);
	expect(isAnubisPage('<script id="anubis_challenge" type="application/json">')).toBe(true);
	expect(isAnubisPage('<p>About Anubis</p>')).toBe(false);
	expect(imageHealth('blocked.example', prefs)).toBe('probe-blocked');
});

it('promotes a blocked instance on a real success and demotes a failing healthy instance', () => {
	const now = 7_200_000;
	const observed = { ...prefs, imageEvidence: {
		'blocked.example': { ok: true, at: now },
		'healthy.example': { ok: false, at: now }
	} };
	expect(imageHealth('blocked.example', observed, now)).toBe('verified');
	expect(imageHealth('healthy.example', observed, now)).toBe('failed');
	expect(imageHealth('healthy.example', observed, now + 300_000)).toBe('healthy');
	expect(imageHealth('blocked.example', observed, now + 3_600_000)).toBe('probe-blocked');
});

it('rejects failed image responses without treating a missing image as an instance failure', () => {
	const image = [{ name: 'Content-Type', value: 'image/png' }];
	expect(imageResponse(200, image)).toBe('image');
	expect(imageResponse(429, image)).toBe('failed');
	expect(imageResponse(502)).toBe('failed');
	expect(imageResponse(404, image)).toBe('ignore');
	expect(imageResponse(200, [{ name: 'Content-Type', value: 'text/html' }])).toBe('failed');
});

it('recognizes only Imgur request URLs and preserves the original query', () => {
	const original = 'https://i.imgur.com/example.jpg?size=large';
	expect(imgurImagePath(original)).toBe('example.jpg?size=large');
	expect(imgurImagePath('https://example.org/?url=https://i.imgur.com/example.jpg')).toBeUndefined();
});
