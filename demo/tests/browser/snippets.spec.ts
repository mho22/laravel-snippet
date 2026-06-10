import { test, expect } from '@playwright/test';
import { readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MARKDOWN_DIR = resolve(__dirname, '../../resources/markdown/13.x');
const REPORT_DIR = __dirname;
const JSON_REPORT = join(REPORT_DIR, 'report.json');
const MD_REPORT = join(REPORT_DIR, 'report.md');

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
const FLUSH_EVERY = 25;

type Bucket =
    | 'ran-ok'
    | 'ran-with-stderr'
    | 'ran-exit-nonzero'
    | 'worker-error'
    | 'no-output'
    | 'never-completed';

const ALL_BUCKETS: Bucket[] = [
    'ran-ok',
    'ran-with-stderr',
    'ran-exit-nonzero',
    'worker-error',
    'no-output',
    'never-completed',
];

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

function classify(
    status: string,
    outputText: string,
    stderrCount: number,
): Bucket {
    if (status === 'error') return 'worker-error';
    if (status.startsWith('exit ')) {
        // `dd()`, `Benchmark::dd()`, `$collection->dd()` print the requested
        // dump to stdout and then exit(1). That's documented Laravel behavior
        // — the snippet ran exactly as the docs reader expects. Anything
        // that printed real output to stdout and emitted no stderr is a
        // successful run regardless of the non-zero exit code.
        const trimmed = outputText.trim();
        const hasOutput = trimmed !== '' && trimmed !== '(no output)';
        if (status.startsWith('exit 1 ') && stderrCount === 0 && hasOutput) {
            return 'ran-ok';
        }
        return 'ran-exit-nonzero';
    }
    if (/^\d+\s+ms$/.test(status)) {
        if (stderrCount > 0) return 'ran-with-stderr';
        if (outputText.trim() === '' || outputText.trim() === '(no output)') {
            return 'no-output';
        }
        return 'ran-ok';
    }
    return 'never-completed';
}

function writeReport(results: SnippetResult[]): void {
    mkdirSync(REPORT_DIR, { recursive: true });
    writeFileSync(JSON_REPORT, JSON.stringify(results, null, 2));

    const totals: Record<Bucket, number> = {
        'ran-ok': 0,
        'ran-with-stderr': 0,
        'ran-exit-nonzero': 0,
        'worker-error': 0,
        'no-output': 0,
        'never-completed': 0,
    };
    const perPage: Record<string, Record<Bucket, number>> = {};
    const samples: Record<Bucket, SnippetResult[]> = {
        'ran-ok': [],
        'ran-with-stderr': [],
        'ran-exit-nonzero': [],
        'worker-error': [],
        'no-output': [],
        'never-completed': [],
    };

    for (const r of results) {
        totals[r.bucket] += 1;
        perPage[r.page] ??= {
            'ran-ok': 0,
            'ran-with-stderr': 0,
            'ran-exit-nonzero': 0,
            'worker-error': 0,
            'no-output': 0,
            'never-completed': 0,
        };
        perPage[r.page][r.bucket] += 1;
        if (r.bucket !== 'ran-ok' && samples[r.bucket].length < 3) {
            samples[r.bucket].push(r);
        }
    }

    const lines: string[] = [];
    lines.push('# Laravel snippet browser test report');
    lines.push('');
    lines.push(`Total snippets attempted: **${results.length}**`);
    lines.push('');
    lines.push('## Bucket totals');
    lines.push('');
    lines.push('| Bucket | Count |');
    lines.push('| --- | ---: |');
    for (const b of ALL_BUCKETS) lines.push(`| ${b} | ${totals[b]} |`);
    lines.push('');
    lines.push('## Per-page rollup');
    lines.push('');
    lines.push(
        '| Page | ran-ok | ran-with-stderr | ran-exit-nonzero | worker-error | no-output | never-completed | total |',
    );
    lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
    for (const slug of Object.keys(perPage).sort()) {
        const p = perPage[slug];
        const total = ALL_BUCKETS.reduce((s, b) => s + p[b], 0);
        lines.push(
            `| ${slug} | ${p['ran-ok']} | ${p['ran-with-stderr']} | ${p['ran-exit-nonzero']} | ${p['worker-error']} | ${p['no-output']} | ${p['never-completed']} | ${total} |`,
        );
    }
    lines.push('');
    lines.push('## Sample failures (up to 3 per bucket)');
    lines.push('');
    for (const bucket of [
        'ran-with-stderr',
        'ran-exit-nonzero',
        'worker-error',
        'no-output',
        'never-completed',
    ] as Bucket[]) {
        const s = samples[bucket];
        if (s.length === 0) continue;
        lines.push(`### ${bucket}`);
        lines.push('');
        for (const r of s) {
            lines.push(
                `- \`${r.page}\` snippet #${r.index} — status: \`${r.status || '(empty)'}\``,
            );
            if (r.outputPreview) {
                const trimmed =
                    r.outputPreview.length > 240
                        ? r.outputPreview.slice(0, 240) + '…'
                        : r.outputPreview;
                lines.push('  ```');
                for (const ln of trimmed.split('\n')) lines.push(`  ${ln}`);
                lines.push('  ```');
            }
        }
        lines.push('');
    }

    writeFileSync(MD_REPORT, lines.join('\n'));
}

test('run every Laravel snippet across every docs page', async ({ page }) => {
    test.setTimeout(90 * 60 * 1000);

    const allPages = enumeratePages();
    const filtered = PAGE_FILTER
        ? allPages.filter((p) => PAGE_FILTER.includes(p))
        : allPages;
    const pages = PAGE_LIMIT ? filtered.slice(0, PAGE_LIMIT) : filtered;
    const results: SnippetResult[] = [];

    for (const slug of pages) {
        await page.goto(`/docs/13.x/${slug}`, { waitUntil: 'domcontentloaded' });

        const hasSnippets = await page
            .waitForSelector('.laravel-snippet .laravel-snippet__run', {
                timeout: 15_000,
            })
            .then(() => true)
            .catch(() => false);
        if (!hasSnippets) continue;

        const snippets = page.locator('.laravel-snippet');
        const total = await snippets.count();
        const limit = PER_PAGE_LIMIT ? Math.min(total, PER_PAGE_LIMIT) : total;

        for (let i = 0; i < limit; i++) {
            const snippet = snippets.nth(i);
            const runBtn = snippet.locator('.laravel-snippet__run');
            const statusEl = snippet.locator('.laravel-snippet__status');

            let bucket: Bucket = 'never-completed';
            let status = '';
            let outputPreview: string | undefined;

            try {
                await runBtn.click({ timeout: 10_000 });
                await expect
                    .poll(
                        async () => {
                            const t = (await statusEl.textContent()) ?? '';
                            const trimmed = t.trim();
                            return trimmed !== '' && trimmed !== 'Running…';
                        },
                        {
                            intervals: [200, 500, 1000, 2000],
                            timeout: STATUS_POLL_TIMEOUT,
                        },
                    )
                    .toBe(true);

                status = ((await statusEl.textContent()) ?? '').trim();
                const outputEl = snippet.locator('.laravel-snippet__output');
                const outputCount = await outputEl.count();
                const outputText =
                    outputCount > 0
                        ? ((await outputEl.first().innerText()) ?? '').trim()
                        : '';
                const stderrCount = await snippet
                    .locator('.laravel-snippet__stderr')
                    .count();
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

            if (results.length % FLUSH_EVERY === 0) writeReport(results);
        }
    }

    writeReport(results);
});
