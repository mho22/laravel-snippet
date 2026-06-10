import { build, type Plugin } from 'esbuild';
import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outdir = path.join(root, 'public/snippet-worker');

await rm(outdir, { recursive: true, force: true });

const stripUrlQuery: Plugin = {
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

// `lightenBundle` previously stubbed out the JSPI loader and forced
// `jspi()` to return false so asyncify was always picked. That kept the
// bundle ~5.5 MB smaller but converted every JSPI-required code path
// into an asyncify `unreachable` trap (the worker-error bucket). Now
// removed — Chrome/Edge users get the JSPI runtime, others fall back
// to asyncify automatically via @php-wasm's runtime feature-detect.

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
        '@php-wasm/web-8-4',
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
    plugins: [stripUrlQuery],
    logLevel: 'info',
});
