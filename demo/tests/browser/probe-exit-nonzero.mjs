// Probe each of the 52 ran-exit-nonzero snippets to capture
// stderr/output and pair with the markdown source. Writes
// /tmp/exit-nonzero-audit.json for downstream classification.

import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MARKDOWN_DIR = resolve(__dirname, '../../resources/markdown/13.x');
const PHP_FENCE_RE = /```php\n([\s\S]*?)\n```/g;

function loadSources(page) {
    const text = readFileSync(resolve(MARKDOWN_DIR, `${page}.md`), 'utf8');
    const blocks = [];
    for (const m of text.matchAll(PHP_FENCE_RE)) blocks.push(m[1]);
    return blocks;
}

const report = JSON.parse(
    readFileSync(resolve(__dirname, 'report.json'), 'utf8'),
);
const targets = report.filter((r) => r.bucket === 'ran-exit-nonzero');
console.log(`Probing ${targets.length} entries`);

const byPage = new Map();
for (const t of targets) {
    if (!byPage.has(t.page)) byPage.set(t.page, []);
    byPage.get(t.page).push(t);
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();

const results = [];
let done = 0;
for (const [slug, entries] of byPage) {
    await page.goto(`http://localhost:5187/docs/13.x/${slug}`, {
        waitUntil: 'domcontentloaded',
    });
    await page
        .waitForSelector('.laravel-snippet .laravel-snippet__run', {
            timeout: 15_000,
        })
        .catch(() => {});
    const sources = loadSources(slug);

    for (const t of entries) {
        const s = page.locator('.laravel-snippet').nth(t.index);
        try {
            await s.locator('.laravel-snippet__run').click({ timeout: 5_000 });
            await page.waitForTimeout(1500);
            const status =
                ((await s.locator('.laravel-snippet__status').textContent()) ?? '').trim();
            const stderrEls = await s
                .locator('.laravel-snippet__stderr')
                .allInnerTexts();
            const stderr = stderrEls.join('\n');
            const outEl = s.locator('.laravel-snippet__output');
            const outText =
                (await outEl.count()) > 0
                    ? ((await outEl.first().innerText()) ?? '').trim()
                    : '';
            results.push({
                page: slug,
                index: t.index,
                status,
                source: sources[t.index] ?? null,
                output: outText.slice(0, 800),
                stderr: stderr.slice(0, 1200),
            });
        } catch (e) {
            results.push({
                page: slug,
                index: t.index,
                status: 'probe-error',
                source: sources[t.index] ?? null,
                output: '',
                stderr: String(e).slice(0, 400),
            });
        }
        done++;
        if (done % 10 === 0) console.log(`  ${done}/${targets.length}`);
    }
}

await browser.close();
writeFileSync('/tmp/exit-nonzero-audit.json', JSON.stringify(results, null, 2));
console.log(`wrote /tmp/exit-nonzero-audit.json (${results.length} entries)`);
