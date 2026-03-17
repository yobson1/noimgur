import { rotateInstance, getStoredState, fetchInstances, applyInstance } from '../lib/instances';
import { ALARM_NAME, ROTATE_INTERVAL_MINUTES, MAX_STATE_AGE_MS } from '../lib/constants';

export default defineBackground(() => {
	// On first install, fetch and apply an instance immediately
	browser.runtime.onInstalled.addListener(async ({ reason }) => {
		if (reason === 'install') {
			console.log('[noimgur] Extension installed, fetching rimgo instances...');
			await rotateInstance();
		}

		// Set up the recurring alarm (safe to call on update too — recreates if missing)
		await browser.alarms.create(ALARM_NAME, {
			periodInMinutes: ROTATE_INTERVAL_MINUTES
		});
	});

	// On browser startup the service worker spins up fresh — check if state is stale
	browser.runtime.onStartup.addListener(async () => {
		const state = await getStoredState();
		const stale = !state || Date.now() - state.lastUpdated > MAX_STATE_AGE_MS;
		if (stale) {
			console.log('[noimgur] State is stale on startup, rotating instance...');
			await rotateInstance();
		} else {
			// Re-apply the stored instance — dynamic rules don't persist across browser restarts
			const instances = await fetchInstances();
			const stored = instances.find((i) => i.domain === state.instanceDomain);
			if (stored) {
				await applyInstance(stored);
			} else {
				await rotateInstance();
			}
		}

		// Ensure alarm is still registered (can be cleared if the browser cleans up)
		const existing = await browser.alarms.get(ALARM_NAME);
		if (!existing) {
			await browser.alarms.create(ALARM_NAME, {
				periodInMinutes: ROTATE_INTERVAL_MINUTES
			});
		}
	});

	// Rotate on alarm tick
	browser.alarms.onAlarm.addListener(async (alarm) => {
		if (alarm.name === ALARM_NAME) {
			console.log('[noimgur] Alarm fired, rotating instance...');
			await rotateInstance();
		}
	});
});
