import './style.css';
import type { RimgoInstance, StoredState, StoredPrefs } from '../../lib/types';
import { API_URL, STATE_KEYS, PREFS_KEYS, ALARM_NAME } from '../../lib/constants';
import { isPrivate, collectsData, countryFlag } from '../../lib/utils';
import { filterInstances } from '../../lib/instances';
import refreshIconUrl from '@/assets/refresh.svg?url';

const app = document.getElementById('app')!;

// ── State ────────────────────────────────────────────────────────────────────

let instances: RimgoInstance[] = [];
let prefs: StoredPrefs = {
	blacklist: [],
	privacyOnly: false,
	healthySet: [],
	autoRotate: true
};
let currentDomain = '';
let loading = true;
let nextAlarmMs = 0;
let countdownInterval: ReturnType<typeof setInterval> | null = null;

// ── Boot ─────────────────────────────────────────────────────────────────────

async function boot() {
	// so that the popup fills the screen when opened from a tab
	// and more importantly also on firefox mobile
	const isTab = (await browser.tabs.getCurrent()) !== undefined;
	const ua = navigator.userAgent;
	const isMobile = ua.includes('Android');
	if (isTab || isMobile) {
		document.documentElement.classList.add('fullscreen');
	}
	renderShell();

	const [stateResult, prefsResult, apiResult] = await Promise.allSettled([
		browser.storage.local.get([...STATE_KEYS]) as Promise<StoredState>,
		browser.storage.local.get([...PREFS_KEYS]),
		fetch(API_URL).then((r) => r.json())
	]);

	if (stateResult.status === 'fulfilled' && stateResult.value.instanceDomain) {
		currentDomain = stateResult.value.instanceDomain;
	}

	if (prefsResult.status === 'fulfilled') {
		const p = prefsResult.value as Record<string, unknown>;
		prefs = {
			blacklist: (p.blacklist as string[]) ?? [],
			privacyOnly: (p.privacyOnly as boolean) ?? false,
			healthySet: (p.healthySet as string[]) ?? [],
			autoRotate: (p.autoRotate as boolean) ?? true
		};
	}

	if (apiResult.status === 'fulfilled') {
		instances = (apiResult.value.clearnet as RimgoInstance[]).filter((i) =>
			i.url.startsWith('https')
		);
	}

	loading = false;
	renderAll();

	const alarm = await browser.alarms.get(ALARM_NAME);
	if (alarm) {
		nextAlarmMs = alarm.scheduledTime;
		startCountdown();
	}

	browser.storage.onChanged.addListener((changes, area) => {
		if (area !== 'local') return;
		let dirty = false;

		if (changes.healthySet?.newValue) {
			prefs.healthySet = changes.healthySet.newValue as string[];
			dirty = true;
		}
		if (changes.instanceDomain?.newValue) {
			currentDomain = changes.instanceDomain.newValue as string;
			dirty = true;
		}
		if (changes.blacklist?.newValue) {
			prefs.blacklist = changes.blacklist.newValue as string[];
			dirty = true;
		}
		if (changes.autoRotate !== undefined) {
			prefs.autoRotate = changes.autoRotate.newValue as boolean;
			dirty = true;
		}

		if (dirty) renderAll();
	});
}

// ── Persist prefs ─────────────────────────────────────────────────────────────

async function savePrefs() {
	await browser.storage.local.set(prefs);
}

// ── Countdown ─────────────────────────────────────────────────────────────────

function formatCountdown(ms: number): string {
	if (ms <= 0) return 'now';
	const totalSecs = Math.ceil(ms / 1000);
	const h = Math.floor(totalSecs / 3600);
	const m = Math.floor((totalSecs % 3600) / 60);
	const s = totalSecs % 60;
	if (h > 0) return `${h}h ${m}m`;
	if (m > 0) return `${m}m ${s}s`;
	return `${s}s`;
}

function startCountdown() {
	if (countdownInterval) clearInterval(countdownInterval);
	countdownInterval = setInterval(() => {
		const el = document.getElementById('next-rotation');
		if (!el) return;
		if (!prefs.autoRotate) {
			el.textContent = 'disabled';
			return;
		}
		const remaining = nextAlarmMs - Date.now();
		el.textContent = formatCountdown(remaining);
	}, 1000);
}

// ── Trigger background tasks ────────────────────────────────────────────────────

async function triggerTask(btn: HTMLButtonElement, task: 'ROTATE_NOW' | 'RECHECK_NOW') {
	btn.disabled = true;
	try {
		await browser.runtime.sendMessage({ type: task });
		const result = (await browser.storage.local.get([
			'instanceDomain'
		])) as Partial<StoredState>;
		if (result.instanceDomain) currentDomain = result.instanceDomain;
		renderInstanceList();
		updateCurrentLabel();
	} finally {
		btn.disabled = false;
	}
}

// ── Render ────────────────────────────────────────────────────────────────────

function renderShell() {
	app.innerHTML = `
    <div class="header">
      <div class="header-left">
        <span class="logo">no<span>imgur</span></span>
        <span class="current-instance" id="cur-instance">loading…</span>
      </div>
      <button class="refresh-btn" id="refresh-btn" title="Re-check instance health"><span class="refresh-icon"></span></button>
    </div>

    <div class="privacy-row">
      <div class="privacy-label">
        <strong>Privacy instances only</strong>
        <span>Exclude instances that collect data</span>
      </div>
      <label class="toggle">
        <input type="checkbox" id="privacy-toggle" />
        <span class="toggle-track"></span>
      </label>
    </div>

    <div class="privacy-row">
      <div class="privacy-label">
        <strong>Auto-rotate instance</strong>
        <span>Switch to a different instance every hour to distribute traffic</span>
      </div>
      <label class="toggle">
        <input type="checkbox" id="autorotate-toggle" />
        <span class="toggle-track"></span>
      </label>
    </div>

    <div class="list-header">
      <span class="list-header-text">Instances</span>
      <div class="list-count" id="list-count">—</div>
    </div>

    <div class="rotation-row">
      <span class="rotation-label">Next health check &amp; rotation</span>
      <span class="rotation-countdown" id="next-rotation">—</span>
    </div>

    <div class="instance-list" id="instance-list">
      <div class="state-msg">
        fetching<span class="dot">.</span><span class="dot">.</span><span class="dot">.</span>
      </div>
    </div>
  `;

	document.getElementById('refresh-btn')!.addEventListener('click', (e) => {
		triggerTask(e.currentTarget as HTMLButtonElement, 'RECHECK_NOW');
	});

	fetch(refreshIconUrl)
		.then((r) => r.text())
		.then((svg) => {
			const icon = document.querySelector<HTMLSpanElement>('.refresh-icon');
			if (icon) icon.innerHTML = svg;
		});

	document.getElementById('privacy-toggle')!.addEventListener('change', async (e) => {
		prefs.privacyOnly = (e.currentTarget as HTMLInputElement).checked;
		await savePrefs();
		renderInstanceList();
		updateCount();

		if (prefs.privacyOnly) {
			const current = instances.find((i) => i.domain === currentDomain);
			const currentIsPrivate = current ? isPrivate(current) : false;
			if (!currentIsPrivate) {
				const btn = document.getElementById('refresh-btn') as HTMLButtonElement;
				await triggerTask(btn, 'ROTATE_NOW');
			}
		}
	});

	document.getElementById('autorotate-toggle')!.addEventListener('change', async (e) => {
		prefs.autoRotate = (e.currentTarget as HTMLInputElement).checked;
		await savePrefs();
		updateRotationRow();
	});
}

function renderAll() {
	(document.getElementById('privacy-toggle') as HTMLInputElement).checked = prefs.privacyOnly;
	(document.getElementById('autorotate-toggle') as HTMLInputElement).checked = prefs.autoRotate;

	updateCurrentLabel();
	renderInstanceList();
	updateCount();
	updateRotationRow();
}

function updateRotationRow() {
	const row = document.querySelector<HTMLDivElement>('.rotation-row')!;
	const countdown = document.getElementById('next-rotation')!;

	if (!prefs.autoRotate) {
		row.classList.add('rotation-row--disabled');
		countdown.textContent = 'disabled';
	} else {
		row.classList.remove('rotation-row--disabled');
		const remaining = nextAlarmMs - Date.now();
		countdown.textContent = remaining > 0 ? formatCountdown(remaining) : '—';
	}
}

function updateCurrentLabel() {
	const el = document.getElementById('cur-instance')!;
	if (currentDomain) {
		el.textContent = currentDomain;
		el.classList.add('loaded');
	} else {
		el.textContent = 'no instance set';
	}
}

function updateCount() {
	const el = document.getElementById('list-count');
	if (!el) return;

	const total = instances.length;
	const unhealthy = prefs.healthySet.length > 0 ? total - prefs.healthySet.length : 0;
	const blacklisted = prefs.blacklist.length;
	const unprivate = prefs.privacyOnly ? instances.filter((i) => !isPrivate(i)).length : 0;
	const active = filterInstances(instances, prefs).length;

	const pills = [
		unhealthy > 0
			? `<span class="count-pill pill-unhealthy">${unhealthy} unhealthy</span>`
			: '',
		unprivate > 0
			? `<span class="count-pill pill-unprivate">${unprivate} unprivate</span>`
			: '',
		blacklisted > 0
			? `<span class="count-pill pill-blacklisted">${blacklisted} blacklisted</span>`
			: ''
	]
		.filter(Boolean)
		.join('');

	el.innerHTML = `
    <span class="count-active"><span class="active">${active}</span> / ${total} active</span>
    ${pills ? `<span class="count-pills">${pills}</span>` : ''}
  `;
}

function renderInstanceList() {
	const container = document.getElementById('instance-list')!;

	if (loading) {
		container.innerHTML = `<div class="state-msg">fetching<span class="dot">.</span><span class="dot">.</span><span class="dot">.</span></div>`;
		return;
	}

	if (instances.length === 0) {
		container.innerHTML = `<div class="state-msg">could not load instance list</div>`;
		return;
	}

	container.innerHTML = '';

	for (const instance of instances) {
		const isBlacklisted = prefs.blacklist.includes(instance.domain);
		const isPrivacySafe = isPrivate(instance);
		const isDataCollected = collectsData(instance);
		const isCurrent = instance.domain === currentDomain;
		const isHiddenByPrivacyFilter = prefs.privacyOnly && !isPrivacySafe;
		const isUnhealthy =
			prefs.healthySet.length > 0 && !prefs.healthySet.includes(instance.domain);

		const row = document.createElement('div');
		row.className = [
			'instance-row',
			isCurrent ? 'active-row' : '',
			isBlacklisted ? 'disabled-row' : '',
			isHiddenByPrivacyFilter || isUnhealthy ? 'hidden-row' : ''
		]
			.filter(Boolean)
			.join(' ');

		const noteDisplay = instance.note
			? instance.note.replace(/^[\u{1F300}-\u{1FAFF}\u26A0\uFE0F⚠️✅❌\s]+/gu, '').trim()
			: null;

		row.innerHTML = `
      <div class="cb-wrap">
        <input
          type="checkbox"
          ${!isBlacklisted ? 'checked' : ''}
          aria-label="Enable ${instance.domain}"
          data-domain="${instance.domain}"
        />
      </div>
      <div class="instance-info">
        <div class="instance-domain">
          <a href="${instance.url}" target="_blank" rel="noopener">${instance.domain}</a>
          ${isCurrent ? '<span class="tag tag-current">active</span>' : ''}
          ${
				isPrivacySafe
					? '<span class="tag tag-privacy">no data</span>'
					: isDataCollected
						? '<span class="tag tag-danger">data</span>'
						: '<span class="tag tag-warn">data?</span>'
			}
        </div>
        <div class="instance-meta">${countryFlag(instance.country)} ${instance.country} · ${instance.provider}</div>
        ${noteDisplay ? `<div class="instance-note">${noteDisplay}</div>` : ''}
      </div>
    `;

		const checkbox = row.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
		checkbox.addEventListener('change', async (e) => {
			const domain = (e.currentTarget as HTMLInputElement).dataset.domain!;
			const checked = (e.currentTarget as HTMLInputElement).checked;

			if (checked) {
				prefs.blacklist = prefs.blacklist.filter((d) => d !== domain);
			} else {
				if (!prefs.blacklist.includes(domain)) prefs.blacklist.push(domain);
			}

			await savePrefs();
			row.classList.toggle('disabled-row', !checked);
			updateCount();
		});

		row.addEventListener('click', async (e) => {
			const target = e.target as HTMLElement;
			if (target.tagName === 'A') return;
			if (target.tagName === 'INPUT') return;

			await browser.runtime.sendMessage({ type: 'SET_INSTANCE', domain: instance.domain });
			currentDomain = instance.domain;
			renderInstanceList();
			updateCurrentLabel();
		});

		container.appendChild(row);
	}

	updateCount();
}

boot();
