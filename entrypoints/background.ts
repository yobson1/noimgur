import {
	rotateInstance,
	getStoredState,
	fetchInstances,
	applyInstance,
	refreshHealthySet
} from '../lib/instances';
import { ALARM_NAME, ROTATE_INTERVAL_MINUTES, MAX_STATE_AGE_MS } from '../lib/constants';

export default defineBackground(() => {
	browser.runtime.onInstalled.addListener(async ({ reason }) => {
		if (reason === 'install') {
			console.log('[noimgur] Extension installed, checking instances...');
			const instances = await fetchInstances();
			await refreshHealthySet(instances);
			await rotateInstance();
		}

		await browser.alarms.create(ALARM_NAME, {
			periodInMinutes: ROTATE_INTERVAL_MINUTES
		});
	});

	browser.runtime.onStartup.addListener(async () => {
		const state = await getStoredState();
		const stale = !state || Date.now() - state.lastUpdated > MAX_STATE_AGE_MS;

		// Always refresh healthy set on startup so we have fresh data
		const instances = await fetchInstances();
		await refreshHealthySet(instances);

		if (stale) {
			console.log('[noimgur] State is stale on startup, rotating instance...');
			await rotateInstance();
		} else {
			// Re-apply the stored instance — dynamic rules don't persist across browser restarts
			const stored = instances.find((i) => i.domain === state.instanceDomain);
			if (stored) {
				await applyInstance(stored);
			} else {
				await rotateInstance();
			}
		}

		const existing = await browser.alarms.get(ALARM_NAME);
		if (!existing) {
			await browser.alarms.create(ALARM_NAME, {
				periodInMinutes: ROTATE_INTERVAL_MINUTES
			});
		}
	});

	// Popup requests an immediate rotation (no health check — trusts healthySet)
	browser.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
		const m = msg as { type: string; domain?: string };
		if (m.type === 'ROTATE_NOW') {
			rotateInstance().then(() => sendResponse({ ok: true }));
			return true;
		}
		if (m.type === 'SET_INSTANCE' && m.domain) {
			fetchInstances()
				.then((instances) => {
					const target = instances.find((i) => i.domain === m.domain);
					if (target) return applyInstance(target);
				})
				.then(() => sendResponse({ ok: true }));
			return true;
		}
	});

	// Alarm: re-check health first, then rotate
	browser.alarms.onAlarm.addListener(async (alarm) => {
		if (alarm.name === ALARM_NAME) {
			console.log('[noimgur] Alarm fired, refreshing healthy set then rotating...');
			const instances = await fetchInstances();
			await refreshHealthySet(instances);
			await rotateInstance();
		}
	});
});
