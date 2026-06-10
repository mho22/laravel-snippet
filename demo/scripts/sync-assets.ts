import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { fetchLaravelDocsCssHref } from './prerender.ts';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(SCRIPT_DIR, '..', 'public');
const CSS_OUT = join(PUBLIC_DIR, 'laravel-docs.css');
const ASSETS_OUT = join(PUBLIC_DIR, 'laravel-docs-assets');

// Font families we want from laravel.com's CSS. Matched as a FAMILY prefix
// against hashed filenames — `InstrumentSans-Italic-XXXX.woff2` etc. — so
// when laravel.com adds a new weight or style (it has happened: Italic
// landed silently and broke our render), the sync picks it up without a
// code change. Each captured variant is ~30 KB.
const FONT_FAMILIES: string[] = [
    'InstrumentSans',
    'GeistMono',
];

const cssUrl = await fetchLaravelDocsCssHref();
if (!cssUrl) {
    console.warn('[sync-assets] no live CSS URL; keeping existing files');
    process.exit(0);
}

const cssRes = await fetch(cssUrl);
if (!cssRes.ok) {
    console.warn(`[sync-assets] CSS fetch failed (HTTP ${cssRes.status}); keeping existing files`);
    process.exit(0);
}
const rawCss = await cssRes.text();

const origin = new URL(cssUrl).origin;
const downloads = new Map<string, string>(); // hashedFilename → absolute origin URL
for (const family of FONT_FAMILIES) {
    const re = new RegExp(`\\/build\\/assets\\/(${family}-[A-Za-z0-9_-]+\\.woff2?)`, 'g');
    for (const m of rawCss.matchAll(re)) {
        downloads.set(m[1], `${origin}/build/assets/${m[1]}`);
    }
}

if (downloads.size === 0) {
    console.warn(`[sync-assets] no fonts matched ${FONT_FAMILIES.join(', ')} in CSS`);
}

await mkdir(ASSETS_OUT, { recursive: true });

// `url(/build/assets/foo.woff2)` → `url(laravel-docs-assets/foo.woff2)`
// Relative paths so the same CSS works at /laravel-docs.css (local dev) and
// at /laravel-snippet/laravel-docs.css (GH Pages base path).
const rewrittenCss = rawCss.replace(/\/build\/assets\//g, 'laravel-docs-assets/');
await writeFile(CSS_OUT, rewrittenCss, 'utf8');
console.log(`[sync-assets] wrote ${CSS_OUT} (${(rewrittenCss.length / 1024).toFixed(1)} KB) from ${cssUrl}`);

const results = await Promise.allSettled(
    [...downloads.entries()].map(async ([name, url]) => {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const bytes = new Uint8Array(await res.arrayBuffer());
        await writeFile(join(ASSETS_OUT, name), bytes);
        return { name, size: bytes.byteLength };
    })
);

for (const r of results) {
    if (r.status === 'fulfilled') {
        const kb = (r.value.size / 1024).toFixed(1);
        console.log(`[sync-assets]   font: ${r.value.name} (${kb} KB)`);
    } else {
        const message = r.reason instanceof Error ? r.reason.message : String(r.reason);
        console.warn(`[sync-assets]   font failed: ${message}`);
    }
}
