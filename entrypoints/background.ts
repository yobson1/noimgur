import {
	rotateInstance,
	getStoredState,
	fetchInstances,
	applyInstance,
	refreshHealthySet,
	getStoredPrefs
} from '../lib/instances';
import { ALARM_NAME, ROTATE_INTERVAL_MINUTES, MAX_STATE_AGE_MS } from '../lib/constants';

async function initAndBroadcast() {
	const instances = await fetchInstances();
	await refreshHealthySet(instances);

	const prefs = await getStoredPrefs();
	if (prefs.autoRotate) {
		await rotateInstance();
	} else {
		// Still need to re-apply the stored instance so DNR rules are in place
		const state = await getStoredState();
		if (state) {
			const stored = instances.find((i) => i.domain === state.instanceDomain);
			if (stored) await applyInstance(stored);
			else await rotateInstance();
		} else {
			await rotateInstance();
		}
	}

	// Notify all tabs that the proxy is now ready
	const tabs = await browser.tabs.query({});
	for (const tab of tabs) {
		if (tab.id) {
			browser.tabs.sendMessage(tab.id, { type: 'NOIMGUR_INIT' }).catch(() => {});
		}
	}

	const existing = await browser.alarms.get(ALARM_NAME);
	if (!existing) {
		await browser.alarms.create(ALARM_NAME, {
			periodInMinutes: ROTATE_INTERVAL_MINUTES
		});
	}
}

export default defineBackground(() => {
	browser.runtime.onInstalled.addListener(async ({ reason }) => {
		if (reason === 'install') {
			console.log('[noimgur] Extension installed, checking instances...');
			await initAndBroadcast();
		}
	});

	browser.runtime.onStartup.addListener(async () => {
		await initAndBroadcast();
	});

	browser.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
		const m = msg as { type: string; domain?: string };
		if (m.type === 'ROTATE_NOW') {
			rotateInstance().then(() => sendResponse({ ok: true }));
			return true;
		}
		if (m.type === 'RECHECK_NOW') {
			(async () => {
				const instances = await fetchInstances();
				const healthySet = await refreshHealthySet(instances);
				const state = await getStoredState();
				// Only rotate if the current instance failed the health check
				if (state && !healthySet.includes(state.instanceDomain)) {
					await rotateInstance();
				}
				sendResponse({ ok: true });
			})();
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

	// Alarm: re-check health, then rotate only if autoRotate is enabled
	browser.alarms.onAlarm.addListener(async (alarm) => {
		if (alarm.name === ALARM_NAME) {
			console.log('[noimgur] Alarm fired, refreshing healthy set...');
			const instances = await fetchInstances();
			await refreshHealthySet(instances);

			const prefs = await getStoredPrefs();
			if (prefs.autoRotate) {
				console.log('[noimgur] Auto-rotate enabled, rotating instance...');
				await rotateInstance();
			} else {
				console.log('[noimgur] Auto-rotate disabled, skipping rotation.');
			}
		}
	});
});
