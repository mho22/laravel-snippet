// Pre-paint theme sync. Lives in <head> before any stylesheet evaluates,
// so toggling `data-theme` here prevents a flash of the wrong palette.
// Mirrors the storage contract in /package/src/theme.js — keep in sync.
(function () {
	try {
		var raw = localStorage.getItem('laravel-theme');
		var pref = raw === 'light' || raw === 'dark' ? raw : 'system';
		var dark = pref === 'dark'
			|| (pref === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
		document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
	} catch (e) {
		document.documentElement.setAttribute('data-theme', 'light');
	}
})();
