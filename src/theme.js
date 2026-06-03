// Light / dark / system controller.
//
// Laravel.com's Tailwind v4 build compiles `dark:` to
// `:where([data-theme=dark], [data-theme=dark] *)`, so toggling the theme is
// purely a matter of `<html data-theme="dark|light">`. The pre-paint inline
// script in /project/partials/theme.js sets that attribute before first
// paint (no FOUC); this module wires the single SSR'd theme button to cycle
// system → light → dark → system on click, swapping the icon to match.

const STORAGE_KEY = 'laravel-theme';

const ICON = {
	system:
		'<path stroke-linecap="round" stroke-linejoin="round" d="M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25m18 0A2.25 2.25 0 0 0 18.75 3H5.25A2.25 2.25 0 0 0 3 5.25m18 0V12a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 12V5.25"></path>',
	light:
		'<path stroke-linecap="round" stroke-linejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z"></path>',
	dark:
		'<path stroke-linecap="round" stroke-linejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z"></path>',
};

const NEXT_PREF = { system: 'light', light: 'dark', dark: 'system' };

const mql = window.matchMedia('(prefers-color-scheme: dark)');

function readPref() {
	const raw = localStorage.getItem(STORAGE_KEY);
	return raw === 'light' || raw === 'dark' ? raw : 'system';
}

function writePref(pref) {
	if (pref === 'system') localStorage.removeItem(STORAGE_KEY);
	else localStorage.setItem(STORAGE_KEY, pref);
}

function apply() {
	const pref = readPref();
	const mode = pref === 'system' ? (mql.matches ? 'dark' : 'light') : pref;
	document.documentElement.setAttribute('data-theme', mode);
	refreshButtons(pref);
}

function refreshButtons(pref) {
	for (const btn of document.querySelectorAll('[data-laravel-theme-toggle]')) {
		const svg = btn.querySelector('svg');
		if (svg) svg.innerHTML = ICON[pref];
		const title = `Switch to ${NEXT_PREF[pref]} mode`;
		btn.title = title;
		const sr = btn.querySelector('.sr-only');
		if (sr) sr.textContent = title;
	}
}

function wire() {
	const stubs = document.querySelectorAll(
		'button[title="Switch to light mode"], button[title="Switch to dark mode"]',
	);
	for (const btn of stubs) {
		btn.dataset.laravelThemeToggle = '1';
		btn.addEventListener('click', () => {
			writePref(NEXT_PREF[readPref()]);
			apply();
		});
	}
	refreshButtons(readPref());
}

mql.addEventListener('change', () => {
	if (readPref() === 'system') apply();
});

if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', wire);
} else {
	wire();
}
