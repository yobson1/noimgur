import { afterEach, describe, expect, it, vi } from 'vitest';
import { API_FETCH_TIMEOUT_MS, API_URLS } from './constants';
import bundledInstances from './instances.json';
import { applyInstance, fetchInstancesWithSource, filterInstances } from './instances';

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

describe('filterInstances', () => {
	it('keeps all instances ineligible when a completed check finds none healthy', () => {
		const prefs = { blacklist: [], privacyOnly: false, autoRotate: true };
		expect(filterInstances(remoteInstances, { ...prefs, healthySet: [] })).toEqual([]);
		expect(filterInstances(remoteInstances, { ...prefs, healthySet: null })).toEqual(remoteInstances);
	});
});

describe('applyInstance', () => {
	it('leaves the default unchanged when a pending promotion becomes stale', async () => {
		const updateDynamicRules = vi.fn();
		const set = vi.fn();
		vi.stubGlobal('browser', {
			declarativeNetRequest: { updateDynamicRules },
			storage: { local: { set } }
		});
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 403 })));

		await applyInstance(remoteInstances[0]!, async () => false);

		expect(updateDynamicRules).not.toHaveBeenCalled();
		expect(set).not.toHaveBeenCalled();
	});

	it('still redirects images and top-level pages when the instance denies framing', async () => {
		const updateDynamicRules = vi.fn().mockResolvedValue(undefined);
		vi.stubGlobal('browser', {
			declarativeNetRequest: { updateDynamicRules },
			storage: { local: { set: vi.fn().mockResolvedValue(undefined) } }
		});
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(
				new Response(null, {
					headers: { 'content-type': 'image/jpeg', 'x-frame-options': 'SAMEORIGIN' }
				})
			)
		);
		vi.spyOn(console, 'log').mockImplementation(() => {});

		await applyInstance(remoteInstances[0]!);

		expect(updateDynamicRules).toHaveBeenCalledWith(
			expect.objectContaining({
				addRules: [
					expect.objectContaining({
						condition: expect.objectContaining({ resourceTypes: ['main_frame', 'image'] })
					})
				]
			})
		);
	});
});
