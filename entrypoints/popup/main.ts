import './style.css';
import type { RimgoInstance, StoredState, StoredPrefs } from '../../lib/types';
import { API_URL } from '../../lib/constants';

const app = document.getElementById('app')!;

// ── State ────────────────────────────────────────────────────────────────────

let instances: RimgoInstance[] = [];
let prefs: StoredPrefs = { blacklist: [], privacyOnly: false, healthySet: [] };
let currentDomain = '';
let loading = true;

// ── Boot ─────────────────────────────────────────────────────────────────────

async function boot() {
	renderShell();

	const [stateResult, prefsResult, apiResult] = await Promise.allSettled([
		browser.storage.local.get([
			'proxyBase',
			'instanceDomain',
			'lastUpdated'
		]) as Promise<StoredState>,
		browser.storage.local.get(['blacklist', 'privacyOnly', 'healthySet']),
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
			healthySet: (p.healthySet as string[]) ?? []
		};
	}

	if (apiResult.status === 'fulfilled') {
		instances = (apiResult.value.clearnet as RimgoInstance[]).filter((i) =>
			i.url.startsWith('https')
		);
	}

	loading = false;
	renderAll();
}

// ── Persist prefs ─────────────────────────────────────────────────────────────

async function savePrefs() {
	await browser.storage.local.set(prefs);
}

// ── Trigger background rotation ───────────────────────────────────────────────

async function triggerRotate(btn: HTMLButtonElement) {
	btn.disabled = true;
	btn.classList.add('spinning');
	btn.textContent = '↻';
	try {
		await browser.runtime.sendMessage({ type: 'ROTATE_NOW' });
		// Re-read the newly chosen instance
		const result = (await browser.storage.local.get([
			'instanceDomain'
		])) as Partial<StoredState>;
		if (result.instanceDomain) currentDomain = result.instanceDomain;
		renderInstanceList();
		updateCurrentLabel();
	} finally {
		btn.disabled = false;
		btn.classList.remove('spinning');
		btn.textContent = '↻';
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
      <button class="refresh-btn" id="refresh-btn" title="Pick a new instance now">↻</button>
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

    <div class="list-header">
      <span class="list-header-text">Instances</span>
      <div class="list-count" id="list-count">—</div>
    </div>

    <div class="instance-list" id="instance-list">
      <div class="state-msg">
        fetching<span class="dot">.</span><span class="dot">.</span><span class="dot">.</span>
      </div>
    </div>
  `;

	document.getElementById('refresh-btn')!.addEventListener('click', (e) => {
		triggerRotate(e.currentTarget as HTMLButtonElement);
	});

	document.getElementById('privacy-toggle')!.addEventListener('change', async (e) => {
		prefs.privacyOnly = (e.currentTarget as HTMLInputElement).checked;
		await savePrefs();
		renderInstanceList();
		updateCount();
	});
}

function renderAll() {
	// Privacy toggle state
	(document.getElementById('privacy-toggle') as HTMLInputElement).checked = prefs.privacyOnly;

	updateCurrentLabel();
	renderInstanceList();
	updateCount();
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
	const unprivate = prefs.privacyOnly
		? instances.filter((i) => !i.note?.includes('Data not collected')).length
		: 0;
	const active = instances.filter((i) => {
		if (prefs.healthySet.length > 0 && !prefs.healthySet.includes(i.domain)) return false;
		if (prefs.blacklist.includes(i.domain)) return false;
		if (prefs.privacyOnly && !i.note?.includes('Data not collected')) return false;
		return true;
	}).length;

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
		const isPrivacySafe = instance.note?.includes('Data not collected') ?? false;
		const isDataCollected = instance.note?.includes('Data collected') ?? false;
		const isCurrent = instance.domain === currentDomain;
		const isHiddenByPrivacyFilter = prefs.privacyOnly && !isPrivacySafe;
		// Hide instances that failed the last health check entirely — they're not usable
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

		// Note: strip leading emoji/whitespace for display
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
        <div class="instance-meta">${instance.country} · ${instance.provider}</div>
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
			if (target.tagName === 'A') return; // let link open normally
			if (target.tagName === 'INPUT') return; // checkbox change handler covers this

			// Set this instance as active immediately
			await browser.runtime.sendMessage({ type: 'SET_INSTANCE', domain: instance.domain });
			currentDomain = instance.domain;
			// Re-render list so active-row moves to the new selection
			renderInstanceList();
			updateCurrentLabel();
		});

		container.appendChild(row);
	}

	updateCount();
}

boot();
