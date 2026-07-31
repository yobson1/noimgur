import { afterEach, describe, expect, it, vi } from 'vitest';
import { API_FETCH_TIMEOUT_MS, API_URLS } from './constants';
import bundledInstances from './instances.json';
import { fetchInstancesWithSource } from './instances';

const remoteInstances = [
	{
		domain: 'remote.example',
		url: 'https://remote.example',
		country: 'GB',
		provider: 'Test provider',
		note: '✅ Data not collected'
	},
	{
		domain: 'insecure.example',
		url: 'http://insecure.example',
		country: 'GB',
		provider: 'Test provider'
	}
];

function apiResponse(instances = remoteInstances): Response {
	return new Response(JSON.stringify({ clearnet: instances }), {
		status: 200,
		headers: { 'content-type': 'application/json' }
	});
}

function pendingUntilAborted(signal: AbortSignal): Promise<Response> {
	return new Promise((_resolve, reject) => {
		signal.addEventListener(
			'abort',
			() => reject(new DOMException('The operation was aborted', 'AbortError')),
			{ once: true }
		);
	});
}

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('fetchInstancesWithSource', () => {
	it('uses the backup API when the primary returns an error', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn((url: string | URL | Request) =>
				Promise.resolve(url === API_URLS[0] ? new Response(null, { status: 502 }) : apiResponse())
			)
		);

		const result = await fetchInstancesWithSource();

		expect(result.source).toBe(API_URLS[1]);
		expect(result.instances).toEqual([remoteInstances[0]]);
	});

	it('uses the first valid response and aborts the slower request', async () => {
		let backupSignal: AbortSignal | undefined;
		vi.stubGlobal(
			'fetch',
			vi.fn((url: string | URL | Request, init?: RequestInit) => {
				if (url === API_URLS[0]) return Promise.resolve(apiResponse());
				backupSignal = init?.signal ?? undefined;
				return pendingUntilAborted(backupSignal!);
			})
		);

		const result = await fetchInstancesWithSource();

		expect(result.source).toBe(API_URLS[0]);
		expect(backupSignal?.aborted).toBe(true);
	});

	it('uses the bundled list when neither API returns a valid response', async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		vi.stubGlobal(
			'fetch',
			vi.fn((url: string | URL | Request) =>
				Promise.resolve(
					url === API_URLS[0]
						? new Response(null, { status: 502 })
						: new Response(JSON.stringify({}), { status: 200 })
				)
			)
		);

		const result = await fetchInstancesWithSource();

		expect(result.source).toBe('bundled');
		expect(result.instances).toEqual(
			bundledInstances.clearnet.filter((instance) => instance.url.startsWith('https'))
		);
	});

	it('aborts both requests and uses the bundled list after five seconds', async () => {
		vi.useFakeTimers();
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		const signals: AbortSignal[] = [];
		vi.stubGlobal(
			'fetch',
			vi.fn((_url: string | URL | Request, init?: RequestInit) => {
				const signal = init?.signal;
				if (!signal) throw new Error('Expected an abort signal');
				signals.push(signal);
				return pendingUntilAborted(signal);
			})
		);

		const resultPromise = fetchInstancesWithSource();
		await vi.advanceTimersByTimeAsync(API_FETCH_TIMEOUT_MS - 1);
		expect(signals.every((signal) => !signal.aborted)).toBe(true);

		await vi.advanceTimersByTimeAsync(1);
		const result = await resultPromise;

		expect(result.source).toBe('bundled');
		expect(signals).toHaveLength(API_URLS.length);
		expect(signals.every((signal) => signal.aborted)).toBe(true);
	});
});
