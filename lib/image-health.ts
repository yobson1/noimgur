const IMAGE_PATH = '/CzXTtJV.jpg';
const IMAGE_WIDTH = 603;
const IMAGE_HEIGHT = 450;
const IMAGE_TIMEOUT_MS = 8000;

export const IMAGE_HEALTH_DOCUMENT = 'image-health.html';
export const IMAGE_HEALTH_MESSAGE = 'PROBE_INSTANCE_IMAGES';

export function healthImageUrl(base: string): string {
	return base.replace(/\/$/, '') + IMAGE_PATH;
}

export function loadHealthImage(url: string, doc: Document = document): Promise<boolean> {
	return new Promise((resolve) => {
		const image = doc.createElement('img');
		const finish = (ok: boolean) => {
			clearTimeout(timeout);
			image.onload = null;
			image.onerror = null;
			image.removeAttribute('src');
			resolve(ok);
		};
		const timeout = setTimeout(() => finish(false), IMAGE_TIMEOUT_MS);
		image.referrerPolicy = 'no-referrer';
		image.onload = () =>
			finish(image.naturalWidth === IMAGE_WIDTH && image.naturalHeight === IMAGE_HEIGHT);
		image.onerror = () => finish(false);
		image.src = url;
	});
}

export async function loadHealthImages(urls: string[], doc: Document = document): Promise<boolean[]> {
	return Promise.all(urls.map((url) => loadHealthImage(url, doc)));
}
