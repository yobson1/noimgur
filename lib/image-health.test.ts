import { expect, it, vi } from 'vitest';
import { healthImageUrl, loadHealthImage } from './image-health';

const url = healthImageUrl('https://rimgo.example/');

function probe(width: number, height: number) {
	const image = {
		onload: null as (() => void) | null,
		onerror: null as (() => void) | null,
		naturalWidth: width,
		naturalHeight: height,
		removeAttribute: vi.fn(),
		src: '',
		referrerPolicy: ''
	};
	const doc = { createElement: () => image } as unknown as Document;
	return { image, result: loadHealthImage(url, doc) };
}

it('accepts the decoded probe image at the normal image URL', async () => {
	const { image, result } = probe(603, 450);
	expect(image.src).toBe('https://rimgo.example/CzXTtJV.jpg');
	expect(image.referrerPolicy).toBe('no-referrer');
	image.onload?.();
	await expect(result).resolves.toBe(true);
});

it('rejects a decoded error placeholder', async () => {
	const { image, result } = probe(512, 512);
	image.onload?.();
	await expect(result).resolves.toBe(false);
});

it('stops a probe that never finishes loading', async () => {
	vi.useFakeTimers();
	try {
		const { image, result } = probe(0, 0);
		await vi.runAllTimersAsync();
		await expect(result).resolves.toBe(false);
		expect(image.removeAttribute).toHaveBeenCalledWith('src');
	} finally {
		vi.useRealTimers();
	}
});
