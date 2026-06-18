#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type Bucket =
    | 'ran-ok'
    | 'ran-with-stderr'
    | 'ran-exit-nonzero'
    | 'worker-error'
    | 'no-output'
    | 'never-completed';

interface SnippetResult {
    page: string;
    index: number;
    bucket: Bucket;
    status: string;
    outputPreview?: string;
}

type BucketCounts = Record<Bucket, number>;

interface PerPageRow extends BucketCounts {
    page: string;
    total: number;
}

interface Payload {
    totals: BucketCounts;
    perPageRows: PerPageRow[];
    results: SnippetResult[];
    bucketOrder: Bucket[];
    inputs: Record<string, string[]>;
}

const BUCKETS: Bucket[] = [
    'ran-ok',
    'ran-with-stderr',
    'ran-exit-nonzero',
    'worker-error',
    'no-output',
    'never-completed',
];

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = resolve(__dirname, 'results');
const REPORT_JSON = resolve(__dirname, 'report.json');
const OUTPUT = resolve(__dirname, 'report.html');
const MARKDOWN_DIR = resolve(__dirname, '../../resources/markdown/13.x');

// snippets.spec.ts now writes one JSON file per page (so Playwright workers
// can parallelize the sweep without two workers fighting over a shared
// report.json). Glob them in deterministic order, merge, and write a
// single report.json — the rest of this script (and downstream consumers
// like deploy.yml's `snippet-report` artifact + the report HTML) keep
// reading the same combined file.
let results: SnippetResult[] = [];
if (existsSync(RESULTS_DIR)) {
    for (const f of readdirSync(RESULTS_DIR).sort()) {
        if (!f.endsWith('.json')) continue;
        const path = resolve(RESULTS_DIR, f);
        const data = JSON.parse(readFileSync(path, 'utf8')) as SnippetResult[];
        results.push(...data);
    }
    results.sort((a, b) => a.page.localeCompare(b.page) || a.index - b.index);
    writeFileSync(REPORT_JSON, JSON.stringify(results, null, 2));
} else if (existsSync(REPORT_JSON)) {
    // Backward-compat: a sweep run that pre-dated the per-page split (or a
    // manual single-test run) still produces report.json directly.
    results = JSON.parse(readFileSync(REPORT_JSON, 'utf8')) as SnippetResult[];
} else {
    throw new Error(
        `No sweep results found. Expected either ${RESULTS_DIR}/*.json (per-page worker output) or ${REPORT_JSON} (legacy single-file output).`,
    );
}

// Per-page PHP fences extracted in document order — same numbering as
// SnippetCodeRenderer.php uses for `data-snippet-id`, since both walk
// each markdown file once in source order.
const PHP_FENCE_RE = /```php\n([\s\S]*?)\n```/g;
const inputs: Record<string, string[]> = {};
for (const file of readdirSync(MARKDOWN_DIR)) {
    if (!file.endsWith('.md')) continue;
    const slug = file.replace(/\.md$/, '');
    const text = readFileSync(resolve(MARKDOWN_DIR, file), 'utf8');
    const blocks: string[] = [];
    for (const match of text.matchAll(PHP_FENCE_RE)) blocks.push(match[1]);
    inputs[slug] = blocks;
}

const zeroCounts = (): BucketCounts =>
    Object.fromEntries(BUCKETS.map((b) => [b, 0])) as BucketCounts;

const totals = zeroCounts();
const perPage = new Map<string, BucketCounts>();

for (const r of results) {
    totals[r.bucket] += 1;
    if (!perPage.has(r.page)) perPage.set(r.page, zeroCounts());
    perPage.get(r.page)![r.bucket] += 1;
}

const perPageRows: PerPageRow[] = [...perPage.entries()]
    .map(([page, counts]) => ({
        page,
        ...counts,
        total: BUCKETS.reduce((s, b) => s + counts[b], 0),
    }))
    .sort((a, b) => a.page.localeCompare(b.page));

const payload: Payload = {
    totals,
    perPageRows,
    results,
    bucketOrder: BUCKETS,
    inputs,
};

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Laravel snippet browser test report</title>
<style>
    :root {
        --bg: #0f1115;
        --panel: #161a22;
        --panel-2: #1d222d;
        --text: #e6e9ef;
        --muted: #8a93a6;
        --border: #262c38;
        --accent: #6ea8fe;
        --ok: #4ade80;
        --warn: #facc15;
        --fail: #f87171;
        --info: #93c5fd;
    }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: var(--bg); color: var(--text); }
    header { padding: 24px 32px; border-bottom: 1px solid var(--border); }
    header h1 { margin: 0 0 4px; font-size: 20px; }
    header p { margin: 0; color: var(--muted); font-size: 13px; }
    main { padding: 24px 32px; max-width: 1400px; margin: 0 auto; }
    section { margin-bottom: 32px; }
    h2 { font-size: 14px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); margin: 0 0 12px; }
    .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
    .card { background: var(--panel); border: 1px solid var(--border); border-radius: 8px; padding: 14px 16px; cursor: pointer; transition: border-color 0.1s; }
    .card:hover { border-color: var(--accent); }
    .card[data-active="1"] { border-color: var(--accent); background: var(--panel-2); }
    .card .label { font-size: 12px; color: var(--muted); margin-bottom: 4px; }
    .card .value { font-size: 24px; font-weight: 600; }
    .card .pct { font-size: 11px; color: var(--muted); margin-top: 2px; }
    .b-ran-ok { color: var(--ok); }
    .b-ran-with-stderr { color: var(--warn); }
    .b-ran-exit-nonzero { color: var(--fail); }
    .b-worker-error { color: var(--fail); }
    .b-no-output { color: var(--muted); }
    .b-never-completed { color: var(--fail); }
    table { width: 100%; border-collapse: collapse; background: var(--panel); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
    th, td { padding: 8px 12px; text-align: left; font-size: 13px; border-bottom: 1px solid var(--border); }
    th { background: var(--panel-2); cursor: pointer; user-select: none; color: var(--muted); font-weight: 600; }
    th[aria-sort] { color: var(--text); }
    th[aria-sort="ascending"]::after { content: " ▲"; color: var(--accent); }
    th[aria-sort="descending"]::after { content: " ▼"; color: var(--accent); }
    td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
    tbody tr:hover { background: var(--panel-2); }
    .filters { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
    .filters input, .filters select { background: var(--panel); border: 1px solid var(--border); color: var(--text); padding: 6px 10px; border-radius: 6px; font-size: 13px; min-width: 180px; }
    .filters input:focus, .filters select:focus { outline: none; border-color: var(--accent); }
    .count { color: var(--muted); font-size: 13px; padding: 6px 0; }
    .bucket-pill { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
    .bucket-pill.b-ran-ok { background: rgba(74, 222, 128, 0.15); }
    .bucket-pill.b-ran-with-stderr { background: rgba(250, 204, 21, 0.15); }
    .bucket-pill.b-ran-exit-nonzero { background: rgba(248, 113, 113, 0.15); }
    .bucket-pill.b-worker-error { background: rgba(248, 113, 113, 0.25); }
    .bucket-pill.b-no-output { background: rgba(138, 147, 166, 0.15); }
    .bucket-pill.b-never-completed { background: rgba(248, 113, 113, 0.3); }
    pre.output, pre.input { margin: 0; padding: 10px 12px; background: #0a0d12; border: 1px solid var(--border); border-radius: 4px; font-size: 12px; line-height: 1.45; max-height: 360px; overflow: auto; white-space: pre-wrap; word-break: break-word; color: #cfd5e1; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    pre.input { border-left: 3px solid var(--accent); }
    pre.output { border-left: 3px solid var(--warn); }
    tr.detail td { padding: 0 12px 14px; background: var(--panel-2); border-bottom: 1px solid var(--border); }
    .detail-section { margin-top: 10px; }
    .detail-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); margin-bottom: 4px; }
    tr.expanded td { background: var(--panel-2); }
    .toggle { cursor: pointer; color: var(--accent); user-select: none; }
    .toggle:hover { text-decoration: underline; }
    .preview-cell { max-width: 600px; }
    .preview-cell .truncated { color: var(--muted); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block; }
    .page-link { color: var(--accent); text-decoration: none; }
    .page-link:hover { text-decoration: underline; }
    tr.sig-row { cursor: pointer; }
    tr.sig-row[data-active="1"] { background: var(--panel-2); }
    tr.sig-row code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; color: var(--text); white-space: pre-wrap; word-break: break-word; }
    .bucket-pill + .bucket-pill { margin-left: 4px; }
    .sig-note a { color: var(--accent); }
</style>
</head>
<body>
<header>
    <h1>Laravel snippet browser test report</h1>
    <p>Per-snippet results from <code>tests/browser/snippets.spec.ts</code>. Click a bucket card to filter.</p>
</header>
<main>
    <section>
        <h2>Bucket totals</h2>
        <div id="cards" class="cards"></div>
    </section>
    <section>
        <h2>Per-page rollup</h2>
        <table id="page-table"></table>
    </section>
    <section>
        <h2>All snippets</h2>
        <div class="filters">
            <select id="filter-bucket"></select>
            <select id="filter-page"></select>
            <input id="filter-text" type="search" placeholder="search output…" />
        </div>
        <div class="count" id="result-count"></div>
        <table id="snippet-table"></table>
    </section>
    <section>
        <h2>Error signature histogram</h2>
        <div class="count">Failure-bucket entries (<code>ran-with-stderr</code>, <code>ran-exit-nonzero</code>, <code>worker-error</code>, <code>never-completed</code>) grouped by normalized error message. Click a row to filter the snippets table above; click an example to jump to it.</div>
        <table id="signature-table"></table>
    </section>
</main>
<script>
const DATA = ${JSON.stringify(payload).replace(/</g, '\\u003c')};
const { totals, perPageRows, results, bucketOrder } = DATA;
const TOTAL = results.length;

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const state = { bucket: 'all', page: 'all', text: '', signature: '', sortKey: 'page', sortDir: 'asc', expanded: new Set() };

function renderCards() {
    const root = document.getElementById('cards');
    const cards = [
        { key: 'all', label: 'Total', value: TOTAL, cls: '' },
        ...bucketOrder.map((b) => ({ key: b, label: b, value: totals[b], cls: 'b-' + b })),
    ];
    root.innerHTML = cards.map((c) => \`
        <div class="card" data-bucket="\${escapeHtml(c.key)}" data-active="\${state.bucket === c.key ? '1' : '0'}">
            <div class="label \${c.cls}">\${escapeHtml(c.label)}</div>
            <div class="value \${c.cls}">\${c.value}</div>
            \${c.key !== 'all' ? \`<div class="pct">\${((c.value / TOTAL) * 100).toFixed(1)}%</div>\` : ''}
        </div>\`).join('');
    root.querySelectorAll('.card').forEach((el) => {
        el.addEventListener('click', () => {
            state.bucket = el.dataset.bucket;
            document.getElementById('filter-bucket').value = state.bucket;
            renderCards();
            renderSnippets();
        });
    });
}

function renderPageTable() {
    const root = document.getElementById('page-table');
    const headers = ['page', ...bucketOrder, 'total'];
    const head = '<thead><tr>' + headers.map((h) => \`<th data-key="\${h}" class="\${h === 'page' ? '' : 'num'}">\${escapeHtml(h)}</th>\`).join('') + '</tr></thead>';
    const rows = [...perPageRows].sort((a, b) => {
        const k = state.sortKey;
        if (a[k] === undefined) return 0;
        const av = a[k]; const bv = b[k];
        const cmp = typeof av === 'string' ? av.localeCompare(bv) : av - bv;
        return state.sortDir === 'asc' ? cmp : -cmp;
    }).map((row) => '<tr>' + headers.map((h) => {
        if (h === 'page') return \`<td><a class="page-link" href="#" data-page="\${escapeHtml(row.page)}">\${escapeHtml(row.page)}</a></td>\`;
        const cls = h === 'total' ? '' : 'b-' + h;
        return \`<td class="num \${cls}">\${row[h]}</td>\`;
    }).join('') + '</tr>').join('');
    root.innerHTML = head + '<tbody>' + rows + '</tbody>';
    root.querySelectorAll('th').forEach((th) => {
        if (th.dataset.key === state.sortKey) th.setAttribute('aria-sort', state.sortDir === 'asc' ? 'ascending' : 'descending');
        th.addEventListener('click', () => {
            if (state.sortKey === th.dataset.key) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
            else { state.sortKey = th.dataset.key; state.sortDir = th.dataset.key === 'page' ? 'asc' : 'desc'; }
            renderPageTable();
        });
    });
    root.querySelectorAll('a.page-link').forEach((a) => {
        a.addEventListener('click', (e) => {
            e.preventDefault();
            state.page = a.dataset.page;
            document.getElementById('filter-page').value = state.page;
            renderSnippets();
            document.getElementById('snippet-table').scrollIntoView({ behavior: 'smooth' });
        });
    });
}

function renderFilters() {
    const bs = document.getElementById('filter-bucket');
    bs.innerHTML = '<option value="all">All buckets</option>' + bucketOrder.map((b) => \`<option value="\${b}">\${b}</option>\`).join('');
    bs.value = state.bucket;
    bs.addEventListener('change', () => { state.bucket = bs.value; renderCards(); renderSnippets(); });
    const ps = document.getElementById('filter-page');
    ps.innerHTML = '<option value="all">All pages</option>' + perPageRows.map((r) => \`<option value="\${escapeHtml(r.page)}">\${escapeHtml(r.page)}</option>\`).join('');
    ps.value = state.page;
    ps.addEventListener('change', () => { state.page = ps.value; renderSnippets(); });
    const ts = document.getElementById('filter-text');
    ts.addEventListener('input', () => { state.text = ts.value.toLowerCase(); renderSnippets(); });
}

function getInput(page, index) {
    const arr = DATA.inputs[page];
    if (!arr || index >= arr.length) return '';
    return arr[index];
}

function summaryLine(text) {
    if (!text) return '';
    // Strip ANSI escapes and HTML tags so the one-line preview is readable.
    const stripped = text
        .replace(/\\x1b\\[[0-9;]*m/g, '')
        .replace(/<\\/?[a-z][^>]*>/gi, '')
        .replace(/&[a-z]+;|&#\\d+;/gi, '');
    for (const ln of stripped.split('\\n')) {
        const t = ln.trim();
        if (t) return t;
    }
    return '';
}

function normalizeSignature(text) {
    const oneLine = summaryLine(text);
    if (!oneLine) return '(no output)';
    const colon = oneLine.indexOf(': ');
    let errClass = '';
    let msg = oneLine;
    if (colon > 0 && colon < 200) {
        errClass = oneLine.slice(0, colon);
        msg = oneLine.slice(colon + 2);
    }
    const normMsg = msg
        .replace(/[A-Za-z_][\\w]*(?:\\\\[A-Za-z_][\\w]*)+/g, '<class>')
        .replace(/"[A-Z][\\w\\\\]*"/g, '"<class>"')
        .replace(/'[A-Z][\\w\\\\]*'/g, "'<class>'")
        .replace(/\\b\\d+\\b/g, 'N')
        .replace(/\\s+/g, ' ')
        .trim();
    return errClass ? errClass + ': ' + normMsg : normMsg;
}

const FAILURE_BUCKETS = new Set(['ran-with-stderr', 'ran-exit-nonzero', 'worker-error', 'never-completed']);

function renderSignatures() {
    const groups = new Map();
    for (const r of results) {
        if (!FAILURE_BUCKETS.has(r.bucket)) continue;
        const sig = normalizeSignature(r.outputPreview);
        let g = groups.get(sig);
        if (!g) { g = { sig, count: 0, example: r, buckets: new Set() }; groups.set(sig, g); }
        g.count++;
        g.buckets.add(r.bucket);
    }
    const rows = [...groups.values()].sort((a, b) => b.count - a.count);
    const root = document.getElementById('signature-table');
    const head = '<thead><tr><th class="num">count</th><th>signature</th><th>buckets</th><th>example</th></tr></thead>';
    const body = rows.map((g) => {
        const active = state.signature === g.sig ? '1' : '0';
        const bucketBadges = [...g.buckets].sort().map((b) => \`<span class="bucket-pill b-\${b}">\${escapeHtml(b)}</span>\`).join(' ');
        const exampleLabel = \`\${g.example.page}#\${g.example.index}\`;
        return \`<tr class="sig-row" data-active="\${active}" data-sig="\${escapeHtml(g.sig)}">
            <td class="num">\${g.count}</td>
            <td><code>\${escapeHtml(g.sig)}</code></td>
            <td>\${bucketBadges}</td>
            <td><a class="page-link" href="#" data-example-page="\${escapeHtml(g.example.page)}" data-example-index="\${g.example.index}">\${escapeHtml(exampleLabel)}</a></td>
        </tr>\`;
    }).join('');
    root.innerHTML = head + '<tbody>' + body + '</tbody>';
    root.querySelectorAll('tr.sig-row').forEach((tr) => {
        tr.addEventListener('click', (e) => {
            if (e.target.closest('a')) return;
            const sig = tr.dataset.sig;
            state.signature = state.signature === sig ? '' : sig;
            renderSignatures();
            renderSnippets();
            document.getElementById('snippet-table').scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    });
    root.querySelectorAll('a[data-example-page]').forEach((a) => {
        a.addEventListener('click', (e) => {
            e.preventDefault();
            const page = a.dataset.examplePage;
            const idx = a.dataset.exampleIndex;
            state.page = page;
            state.signature = '';
            state.expanded.add(\`\${page}-\${idx}\`);
            document.getElementById('filter-page').value = page;
            renderSignatures();
            renderSnippets();
            document.getElementById('snippet-table').scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    });
}

function renderSnippets() {
    const filtered = results.filter((r) => {
        if (state.bucket !== 'all' && r.bucket !== state.bucket) return false;
        if (state.page !== 'all' && r.page !== state.page) return false;
        if (state.signature && normalizeSignature(r.outputPreview) !== state.signature) return false;
        if (state.text) {
            const input = getInput(r.page, r.index);
            const blob = (r.outputPreview || '') + ' ' + r.status + ' ' + r.page + ' ' + input;
            if (!blob.toLowerCase().includes(state.text)) return false;
        }
        return true;
    });
    const sigNote = state.signature
        ? \` <span class="sig-note">— filtered by signature <code>\${escapeHtml(state.signature)}</code> (<a href="#" id="clear-sig">clear</a>)</span>\`
        : '';
    document.getElementById('result-count').innerHTML = \`Showing \${filtered.length.toLocaleString()} of \${TOTAL.toLocaleString()} snippets\${sigNote}\`;
    const clearSig = document.getElementById('clear-sig');
    if (clearSig) clearSig.addEventListener('click', (e) => { e.preventDefault(); state.signature = ''; renderSignatures(); renderSnippets(); });
    const root = document.getElementById('snippet-table');
    const head = '<thead><tr><th></th><th>Page</th><th class="num">#</th><th>Bucket</th><th>Status</th><th>Output (first line)</th></tr></thead>';
    const MAX = 1000;
    const slice = filtered.slice(0, MAX);
    const rows = slice.map((r) => {
        const key = \`\${r.page}-\${r.index}\`;
        const expanded = state.expanded.has(key);
        const input = getInput(r.page, r.index);
        const output = r.outputPreview || '';
        const oneLine = summaryLine(output);
        const truncated = oneLine.length > 100 ? oneLine.slice(0, 100) + '…' : oneLine;
        const main = \`
            <tr data-key="\${escapeHtml(key)}" \${expanded ? 'class="expanded"' : ''}>
                <td><span class="toggle">\${expanded ? '▾' : '▸'}</span></td>
                <td>\${escapeHtml(r.page)}</td>
                <td class="num">\${r.index}</td>
                <td><span class="bucket-pill b-\${r.bucket}">\${escapeHtml(r.bucket)}</span></td>
                <td>\${escapeHtml(r.status || '(empty)')}</td>
                <td class="preview-cell"><span class="truncated">\${truncated ? escapeHtml(truncated) : '(no output)'}</span></td>
            </tr>\`;
        if (!expanded) return main;
        const detail = \`
            <tr data-detail-for="\${escapeHtml(key)}" class="detail">
                <td colspan="6">
                    <div class="detail-section"><div class="detail-label">Input</div><pre class="input">\${input ? escapeHtml(input) : '(no source)'}</pre></div>
                    <div class="detail-section"><div class="detail-label">Output</div><pre class="output">\${output ? escapeHtml(output) : '(no output)'}</pre></div>
                </td>
            </tr>\`;
        return main + detail;
    }).join('');
    const overflow = filtered.length > MAX ? \`<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:12px;">Showing first \${MAX.toLocaleString()} rows; refine filters to see more.</td></tr>\` : '';
    root.innerHTML = head + '<tbody>' + rows + overflow + '</tbody>';
    root.querySelectorAll('tbody tr[data-key]').forEach((tr) => {
        tr.querySelector('.toggle')?.addEventListener('click', () => {
            const key = tr.dataset.key;
            if (state.expanded.has(key)) state.expanded.delete(key);
            else state.expanded.add(key);
            renderSnippets();
        });
    });
}

renderCards();
renderPageTable();
renderFilters();
renderSignatures();
renderSnippets();
</script>
</body>
</html>
`;

writeFileSync(OUTPUT, html);
console.log(
    `Wrote ${OUTPUT} (${results.length} snippets, ${(html.length / 1024).toFixed(0)} KB)`,
);
