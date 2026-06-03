import { defineConfig } from 'vite';

export default defineConfig({
	// `demo/src` is a symlink to `../src`. Without these two settings vite
	// resolves it to the real path outside the root (blocked by fs.allow,
	// and node-module resolution walks up from a directory with no
	// node_modules). `preserveSymlinks: true` keeps the file identity as
	// /demo/src/* so @php-wasm/{web,universal} resolve from demo/node_modules.
	resolve: { preserveSymlinks: true },
	server: { fs: { allow: ['..'] } },
	assetsInclude: [/\.dat$/, /\.wasm$/, /\.so$/, /\.la$/],
	optimizeDeps: {
		exclude: ['@php-wasm/web'],
	},
});
