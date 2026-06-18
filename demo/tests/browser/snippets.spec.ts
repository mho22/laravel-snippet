import { test } from '@playwright/test';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { classify, type Bucket } from './sweep-status.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MARKDOWN_DIR = resolve(__dirname, '../../resources/markdown/13.x');
// Intermediate per-page results written by each parallel worker. After all
// pages finish, `node tests/browser/build-report.ts` reads every JSON file
// in here and merges them into the final `report.json` + `report.html`.
const RESULTS_DIR = resolve(__dirname, 'results');

const PAGE_LIMIT = process.env.SNIPPET_PAGE_LIMIT
    ? Number(process.env.SNIPPET_PAGE_LIMIT)
    : undefined;
const PER_PAGE_LIMIT = process.env.SNIPPET_LIMIT
    ? Number(process.env.SNIPPET_LIMIT)
    : undefined;
const PAGE_FILTER = process.env.SNIPPET_PAGE
    ? process.env.SNIPPET_PAGE.split(',').map((s) => s.trim())
    : undefined;
const STATUS_POLL_TIMEOUT = 15_000;
// Mirror playwright.config.ts's `workers: 2` on CI. Override locally with
// PW_WORKERS to match a different `--workers=` invocation. Each shard runs
// as its own Playwright test, which Playwright dispatches across workers
// when `fullyParallel: true` is set (it is).
const PW_WORKERS = Number(process.env.PW_WORKERS ?? '2');

interface SnippetResult {
    page: string;
    index: number;
    bucket: Bucket;
    status: string;
    outputPreview?: string;
}

function enumeratePages(): string[] {
    return readdirSync(MARKDOWN_DIR)
        .filter((f) => f.endsWith('.md'))
        .map((f) => f.replace(/\.md$/, ''))
        .sort();
}

mkdirSync(RESULTS_DIR, { recursive: true });

const allPages = enumeratePages();
const filteredPages = PAGE_FILTER
    ? allPages.filter((p) => PAGE_FILTER.includes(p))
    : allPages;
const pages = PAGE_LIMIT ? filteredPages.slice(0, PAGE_LIMIT) : filteredPages;

// One test per shard so Playwright fans them out across `PW_WORKERS` web
// workers. Each shard reuses a single PHP-WASM worker across many docs
// pages via Inertia navigation, calling `window.__rotateWorker` at every
// page boundary to wipe cross-page contamination (PHP class table /
// statics / opcache). Confirmed by the s39 rotation smoke: rotation costs
// ~365 ms (tCreate 64 + tSwap 300), `/bundle/` survives across the swap.
// vs the previous one-test-per-page shape which paid ~10 s of bundle
// extract per page.
for (let shard = 0; shard < PW_WORKERS; shard++) {
    const assigned = pages.filter((_, i) => i % PW_WORKERS === shard);
    if (assigned.length === 0) continue;

    test(`snippets sweep shard ${shard + 1}/${PW_WORKERS} (${assigned.length} pages)`, async ({
        page,
    }) => {
        // 45 min covers the worst-case shard (half the corpus × ~150 ms/snippet
        // + page transitions). The old per-page tests used 15 min, but a
        // shard runs many pages back-to-back.
        test.setTimeout(45 * 60 * 1000);

        // Surface worker fatals + browser pageerrors so a mid-shard crash
        // shows up in the test log instead of dying silently.
        page.on('pageerror', (err) =>
            console.log(`[shard ${shard} pageerror]`, err.message),
        );
        page.on('console', (msg) => {
            const txt = msg.text();
            if (msg.type() === 'error' || txt.includes('[snippet-worker]')) {
                console.log(`[shard ${shard} ${msg.type()}]`, txt);
            }
        });

        for (let idx = 0; idx < assigned.length; idx++) {
            const slug = assigned[idx];
            const results: SnippetResult[] = [];
            const outFile = join(RESULTS_DIR, `${slug}.json`);
            const flush = () => writeFileSync(outFile, JSON.stringify(results, null, 2));

            if (idx === 0) {
                // Cold boot: full document load. The Worker's ~10 s bundle
                // install fires once per shard, not once per page.
                await page.goto(`/docs/13.x/${slug}`, { waitUntil: 'domcontentloaded' });
                // Confirm the dev sweep hooks are mounted before continuing —
                // without them, all the rotation/navigation logic below silently
                // becomes no-ops and the spec would re-pay the bundle install
                // on every page via implicit full reloads.
                await page.waitForFunction(
                    () => {
                        const w = window as {
                            __rotateWorker?: unknown;
                            __inertiaVisit?: unknown;
                        };
                        return (
                            typeof w.__rotateWorker === 'function' &&
                            typeof w.__inertiaVisit === 'function'
                        );
                    },
                    null,
                    { timeout: 15_000 },
                );
            } else {
                // Inertia navigation: same document, new page props.
                // LaravelSnippet.vue's `onBeforeUnmount` tears down old
                // snippet apps; the new mount hydrates fresh ones. The
                // web worker is module-scoped in php.ts so it survives.
                await page.evaluate(
                    (target) =>
                        (
                            window as unknown as {
                                __inertiaVisit: (url: string) => Promise<void>;
                            }
                        ).__inertiaVisit(target),
                    `/docs/13.x/${slug}`,
                );
                await page.waitForURL(`**/docs/13.x/${slug}`);

                // Rotate AFTER navigation so the new page's snippets execute
                // on a fresh PHP runtime — no leftover class declarations from
                // the prior page (the docs corpus redeclares `User`, `Order`,
                // `OrderShipped` across pages). The bundle survives because
                // `/bundle/` is a top-level VFS path that `copyMEMFSNodes`
                // re-installs into the new runtime's MEMFS.
                const rotated = await page.evaluate(async () => {
                    const w = window as unknown as {
                        __rotateWorker: () => Promise<{
                            tCreate: number;
                            tSwap: number;
                            tTotal: number;
                            error?: { message: string };
                        }>;
                    };
                    return w.__rotateWorker();
                });
                if (rotated.error) {
                    throw new Error(
                        `Worker rotation failed before ${slug}: ${rotated.error.message}`,
                    );
                }
            }

            const hasSnippets = await page
                .waitForSelector('.laravel-snippet .laravel-snippet__run', {
                    timeout: 15_000,
                })
                .then(() => true)
                .catch(() => false);
            if (!hasSnippets) {
                // Page exists but has no PHP fences (rare — `installation.md` etc.).
                // Still write the empty file so build-report can distinguish "page
                // had zero snippets" from "page worker crashed and produced nothing".
                flush();
                continue;
            }

            const snippets = page.locator('.laravel-snippet');
            const total = await snippets.count();
            const limit = PER_PAGE_LIMIT ? Math.min(total, PER_PAGE_LIMIT) : total;

            for (let i = 0; i < limit; i++) {
                const snippet = snippets.nth(i);
                const statusEl = snippet.locator('.laravel-snippet__status');

                let bucket: Bucket = 'never-completed';
                let status = '';
                let outputPreview: string | undefined;

                try {
                    // Single round-trip: register the bubbling
                    // 'laravel-snippet:complete' listener and dispatch the
                    // run click in the same browser tick — no IPC race, no
                    // polling floor. detail carries status / plain-text
                    // output / hasStderr so we don't re-read the DOM.
                    const detail = await snippet.evaluate(
                        (el, timeoutMs) =>
                            new Promise<{
                                status: string;
                                output: string;
                                hasStderr: boolean;
                            }>((resolve, reject) => {
                                const runBtn = el.querySelector(
                                    '.laravel-snippet__run',
                                ) as HTMLButtonElement | null;
                                if (!runBtn) {
                                    reject(new Error('no run button'));
                                    return;
                                }
                                const timer = window.setTimeout(
                                    () => reject(new Error('snippet signal timeout')),
                                    timeoutMs,
                                );
                                el.addEventListener(
                                    'laravel-snippet:complete',
                                    (e) => {
                                        window.clearTimeout(timer);
                                        resolve((e as CustomEvent).detail);
                                    },
                                    { once: true },
                                );
                                runBtn.click();
                            }),
                        STATUS_POLL_TIMEOUT,
                    );

                    status = detail.status;
                    const outputText = detail.output;
                    const stderrCount = detail.hasStderr ? 1 : 0;
                    if (outputText) outputPreview = outputText;

                    bucket = classify(status, outputText, stderrCount);
                } catch {
                    bucket = 'never-completed';
                    try {
                        status = ((await statusEl.textContent()) ?? '').trim();
                    } catch {
                        /* ignore */
                    }
                }

                results.push({ page: slug, index: i, bucket, status, outputPreview });
            }

            flush();
        }
    });
}
