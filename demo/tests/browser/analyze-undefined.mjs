#!/usr/bin/env node
// Reads tests/browser/report.json + the markdown sources, extracts every
// distinct "Undefined variable $X" across snippets, and lists the page,
// snippet index, and source line where each is referenced. Output is
// optimised for pasting into snippet-context.php as new entries.

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPORT = resolve(__dirname, 'report.json');
const MARKDOWN_DIR = resolve(__dirname, '../../resources/markdown/13.x');

const PHP_FENCE_RE = /```php\n([\s\S]*?)\n```/g;
const UNDEF_RE = /Undefined variable[:\s]+\$([A-Za-z_][A-Za-z0-9_]*)/g;

// Per-page array of fence sources, indexed by snippet position.
const fencesByPage = {};
for (const file of readdirSync(MARKDOWN_DIR)) {
    if (!file.endsWith('.md')) continue;
    const slug = file.replace(/\.md$/, '');
    const md = readFileSync(resolve(MARKDOWN_DIR, file), 'utf8');
    const fences = [];
    for (const m of md.matchAll(PHP_FENCE_RE)) fences.push(m[1]);
    fencesByPage[slug] = fences;
}

const report = JSON.parse(readFileSync(REPORT, 'utf8'));

// var -> Map<page, Set<snippet index>>
const byVar = new Map();
for (const r of report) {
    const output = r.outputPreview || '';
    const seenThisSnippet = new Set();
    for (const m of output.matchAll(UNDEF_RE)) {
        const v = m[1];
        if (seenThisSnippet.has(v)) continue;
        seenThisSnippet.add(v);
        if (!byVar.has(v)) byVar.set(v, new Map());
        const pages = byVar.get(v);
        if (!pages.has(r.page)) pages.set(r.page, new Set());
        pages.get(r.page).add(r.index);
    }
}

const sorted = [...byVar.entries()].sort((a, b) => {
    const ca = [...a[1].values()].reduce((n, s) => n + s.size, 0);
    const cb = [...b[1].values()].reduce((n, s) => n + s.size, 0);
    return cb - ca || a[0].localeCompare(b[0]);
});

console.log(`# Undefined variables report`);
console.log(`# distinct vars: ${sorted.length}`);
console.log(
    `# total occurrences: ${sorted.reduce(
        (n, [, m]) => n + [...m.values()].reduce((k, s) => k + s.size, 0),
        0,
    )}`,
);
console.log('');

for (const [name, pages] of sorted) {
    const total = [...pages.values()].reduce((n, s) => n + s.size, 0);
    console.log(`## $${name}  (${total} occurrences across ${pages.size} pages)`);
    for (const [page, indexes] of [...pages.entries()].sort()) {
        for (const idx of [...indexes].sort((a, b) => a - b)) {
            const src = fencesByPage[page]?.[idx] ?? '';
            // First line of the snippet that mentions the var
            const lines = src.split('\n');
            const refIdx = lines.findIndex((l) =>
                new RegExp(`\\$${name}\\b`).test(l),
            );
            const ref = refIdx >= 0 ? lines[refIdx].trim() : '(snippet source not found)';
            console.log(`  - ${page}.md  snippet #${idx}: ${ref}`);
        }
    }
    console.log('');
}
