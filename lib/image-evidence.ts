import { IMGUR_REGEX_CAPTURE } from './constants';
import type { RimgoInstance, StoredPrefs } from './types';
import { isPrivate } from './utils';

export type ImageHealth = 'verified' | 'healthy' | 'probe-blocked' | 'failed' | 'unknown';
type Header = { name: string; value?: string };

export function imageHealth(domain: string, prefs: StoredPrefs, now = Date.now()): ImageHealth {
	const observed = prefs.imageEvidence?.[domain];
	if (observed && now - observed.at < (observed.ok ? 60 : 5) * 60_000) {
		return observed.ok ? 'verified' : 'failed';
	}
	if (prefs.healthySet?.includes(domain)) return 'healthy';
	if (prefs.probeBlocked?.includes(domain)) return 'probe-blocked';
	return prefs.healthySet === null ? 'unknown' : 'failed';
}

export function allowedInstance(instance: RimgoInstance, prefs: StoredPrefs): boolean {
	return !prefs.blacklist.includes(instance.domain) && (!prefs.privacyOnly || isPrivate(instance));
}

export function imageCandidateRank(status: ImageHealth): number {
	return ['verified', 'healthy', 'probe-blocked', 'unknown', 'failed'].indexOf(status);
}

export function headerValue(headers: Header[] | undefined, name: string): string {
	return headers?.find((header) => header.name.toLowerCase() === name)?.value?.trim().toLowerCase() ?? '';
}

export function isChallengeResponse(headers?: Header[]): boolean {
	return headerValue(headers, 'cf-mitigated') === 'challenge' ||
		/^(challenge|deny|denied|reject|rejected|blocked)$/.test(headerValue(headers, 'x-anubis-status'));
}

export function isAnubisPage(html: string): boolean {
	return /\bid=["']anubis_(?:challenge|version)["']|\/\.within\.website\/x\/cmd\/anubis\/|Protected by Anubis\b/i.test(html);
}

export function imageResponse(status: number, headers?: Header[]): 'image' | 'failed' | 'ignore' {
	const contentType = headerValue(headers, 'content-type');
	if (isChallengeResponse(headers) || status === 401 || status === 403 || status === 429 || status >= 500) {
		return 'failed';
	}
	if (status < 200 || status >= 300) return 'ignore';
	if (contentType.startsWith('image/')) return 'image';
	return contentType.includes('text/html') ? 'failed' : 'ignore';
}

const imagePattern = new RegExp(IMGUR_REGEX_CAPTURE, 'i');

export function imgurImagePath(url: string): string | undefined {
	return imagePattern.exec(url.split('#', 1)[0]!)?.[1];
}
