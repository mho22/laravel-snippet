import { build } from 'esbuild';
import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outdir = path.join(root, 'public/snippet-worker');

await rm(outdir, { recursive: true, force: true });

const stripUrlQuery = {
    name: 'strip-url-query',
    setup(b) {
        b.onResolve({ filter: /\?url$/ }, (args) => {
            const real = args.path.replace(/\?url$/, '');
            const resolved = path.isAbsolute(real)
                ? real
                : path.resolve(args.resolveDir, real);
            return { path: resolved };
        });
    },
};

const lightenBundle = {
    name: 'lighten-bundle',
    setup(b) {
        b.onResolve({ filter: /^wasm-feature-detect$/ }, () => ({
            path: 'wasm-feature-detect-asyncify',
            namespace: 'lighten-stub',
        }));
        b.onResolve({ filter: /[/\\]jspi[/\\]php_8_4\.js(\?url)?$/ }, () => ({
            path: 'unused-jspi-loader',
            namespace: 'lighten-stub',
        }));
        b.onResolve({ filter: /[/\\]intl\.so(\?url)?$/ }, () => ({
            path: 'unused-intl-extension',
            namespace: 'lighten-stub',
        }));
        b.onResolve({ filter: /[/\\]icu\.dat(\?url)?$/ }, () => ({
            path: 'unused-icu-data',
            namespace: 'lighten-stub',
        }));
        b.onLoad({ filter: /.*/, namespace: 'lighten-stub' }, (args) => {
            if (args.path === 'wasm-feature-detect-asyncify') {
                return { contents: 'export const jspi = async () => false;', loader: 'js' };
            }
            return { contents: 'export default "";', loader: 'js' };
        });
    },
};

await build({
    entryPoints: [path.join(root, 'resources/js/runtime/worker.js')],
    outdir,
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    splitting: true,
    external: [
        'worker_threads',
        '@php-wasm/web-5-2',
        '@php-wasm/web-7-4',
        '@php-wasm/web-8-0',
        '@php-wasm/web-8-1',
        '@php-wasm/web-8-2',
        '@php-wasm/web-8-3',
        '@php-wasm/web-8-5',
    ],
    entryNames: 'index',
    chunkNames: 'chunks/[name]-[hash]',
    assetNames: 'assets/[name]-[hash]',
    loader: {
        '.wasm': 'file',
        '.dat': 'file',
        '.so': 'file',
    },
    publicPath: '/laravel-snippet/snippet-worker',
    plugins: [lightenBundle, stripUrlQuery],
    logLevel: 'info',
});
