// Pre-paint theme sync + three-state toggle, matching laravel.com.
// Pref cycle: system → light → dark → system. Lives in <head> before any
// stylesheet evaluates, so applyTheme() runs without a flash.
// Sets both `data-theme` AND the `dark` class — most of the synced
// laravel-docs.css uses Tailwind's class strategy.

var PATHS = {
	system: 'M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25m18 0A2.25 2.25 0 0 0 18.75 3H5.25A2.25 2.25 0 0 0 3 5.25m18 0V12a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 12V5.25',
	light: 'M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z',
	dark: 'M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z',
};

var NEXT_PREF = { system: 'light', light: 'dark', dark: 'system' };
var NEXT_TITLE = {
	system: 'Switch to light mode',
	light: 'Switch to dark mode',
	dark: 'Switch to system mode',
};

function readPref() {
	try {
		var raw = localStorage.getItem('laravel-theme');
		return raw === 'light' || raw === 'dark' || raw === 'system' ? raw : 'system';
	} catch (_) { return 'system'; }
}

function computeDark(pref) {
	if (pref === 'dark') return true;
	if (pref === 'light') return false;
	try { return matchMedia('(prefers-color-scheme: dark)').matches; } catch (_) { return false; }
}

function applyTheme(pref) {
	var dark = computeDark(pref);
	var root = document.documentElement;
	root.setAttribute('data-theme', dark ? 'dark' : 'light');
	if (dark) root.classList.add('dark');
	else root.classList.remove('dark');
}

function applyIcon(pref) {
	var btn = document.querySelector('button[title^="Switch to "]');
	if (!btn) return;
	var path = btn.querySelector('svg path');
	if (path) path.setAttribute('d', PATHS[pref]);
	btn.setAttribute('title', NEXT_TITLE[pref]);
	var label = btn.querySelector('.sr-only');
	if (label) label.textContent = NEXT_TITLE[pref];
}

// Pre-paint: documentElement only — the button doesn't exist yet.
applyTheme(readPref());

// DOM-ready: sync the visible icon and labels to the persisted pref.
if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', function () { applyIcon(readPref()); });
} else {
	applyIcon(readPref());
}

// Toggle: cycle system → light → dark → system. Event delegation off
// document so the listener survives Inertia navigations (which keep the
// header in place, but harmless to be defensive).
document.addEventListener('click', function (e) {
	var btn = e.target.closest && e.target.closest('button[title^="Switch to "]');
	if (!btn) return;
	var next = NEXT_PREF[readPref()];
	try { localStorage.setItem('laravel-theme', next); } catch (_) {}
	applyTheme(next);
	applyIcon(next);
});

// System mode follows the OS pref live — flip the rendered palette when
// the user changes their system setting without reloading the page.
try {
	matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
		if (readPref() === 'system') applyTheme('system');
	});
} catch (_) {}
