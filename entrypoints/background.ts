import {
	rotateInstance,
	getStoredState,
	fetchInstances,
	applyInstance,
	refreshHealthySet
} from '../lib/instances';
import { ALARM_NAME, ROTATE_INTERVAL_MINUTES, MAX_STATE_AGE_MS } from '../lib/constants';

async function initAndBroadcast() {
	const instances = await fetchInstances();
	await refreshHealthySet(instances);
	await rotateInstance();

	// Notify all tabs that the proxy is now ready
	const tabs = await browser.tabs.query({});
	for (const tab of tabs) {
		if (tab.id) {
			browser.tabs.sendMessage(tab.id, { type: 'NOIMGUR_INIT' }).catch(() => {
				// Tab may not have the content script, ignore
			});
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
