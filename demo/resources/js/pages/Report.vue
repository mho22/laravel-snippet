<script setup lang="ts">
import { Head } from '@inertiajs/vue3';
import { computed, ref } from 'vue';

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

type SortKey = 'page' | 'total' | Bucket;

const props = defineProps<{
    available: boolean;
    totals: BucketCounts;
    perPageRows: PerPageRow[];
    results: SnippetResult[];
    bucketOrder: Bucket[];
    inputs: Record<string, string[]>;
}>();

const TOTAL = computed(() => props.results.length);

const bucket = ref<'all' | Bucket>('all');
const page = ref<'all' | string>('all');
const text = ref('');
const sortKey = ref<SortKey>('page');
const sortDir = ref<'asc' | 'desc'>('asc');
const expanded = ref(new Set<string>());

const BUCKET_TEXT_CLASS: Record<Bucket, string> = {
    'ran-ok': 'bucket-text-ok',
    'ran-with-stderr': 'bucket-text-warn',
    'ran-exit-nonzero': 'bucket-text-fail',
    'worker-error': 'bucket-text-fail',
    'no-output': 'bucket-text-muted',
    'never-completed': 'bucket-text-fail',
};

const BUCKET_PILL_CLASS: Record<Bucket, string> = {
    'ran-ok': 'bucket-pill bucket-pill-ok',
    'ran-with-stderr': 'bucket-pill bucket-pill-warn',
    'ran-exit-nonzero': 'bucket-pill bucket-pill-fail',
    'worker-error': 'bucket-pill bucket-pill-fail-strong',
    'no-output': 'bucket-pill bucket-pill-muted',
    'never-completed': 'bucket-pill bucket-pill-fail-strong',
};

function getInput(p: string, idx: number): string {
    const arr = props.inputs[p];
    if (!arr || idx >= arr.length) return '';
    return arr[idx];
}

function stripAnsi(s: string): string {
    return s
        // eslint-disable-next-line no-control-regex
        .replace(/\x1b\[[0-9;]*m/g, '')
        .replace(/<\/?[a-z][^>]*>/gi, '')
        .replace(/&[a-z]+;|&#\d+;/gi, '');
}

function summaryLine(s?: string): string {
    if (!s) return '';
    const stripped = stripAnsi(s);
    for (const ln of stripped.split('\n')) {
        const t = ln.trim();
        if (t) return t;
    }
    return '';
}

function rowValue(row: PerPageRow, key: SortKey): string | number {
    return (row as unknown as Record<string, string | number>)[key];
}

const sortedPerPage = computed(() => {
    const k = sortKey.value;
    const dir = sortDir.value;
    const copy = [...props.perPageRows];
    copy.sort((a, b) => {
        const av = rowValue(a, k);
        const bv = rowValue(b, k);
        let cmp: number;
        if (typeof av === 'string' && typeof bv === 'string') cmp = av.localeCompare(bv);
        else cmp = Number(av) - Number(bv);
        return dir === 'asc' ? cmp : -cmp;
    });
    return copy;
});

function setSort(key: SortKey): void {
    if (sortKey.value === key) {
        sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc';
    } else {
        sortKey.value = key;
        sortDir.value = key === 'page' ? 'asc' : 'desc';
    }
}

function ariaSortFor(key: SortKey): 'ascending' | 'descending' | undefined {
    if (sortKey.value !== key) return undefined;
    return sortDir.value === 'asc' ? 'ascending' : 'descending';
}

function sortArrow(key: SortKey): string {
    if (sortKey.value !== key) return '';
    return sortDir.value === 'asc' ? '▲' : '▼';
}

const filteredResults = computed(() => {
    const lowerText = text.value.toLowerCase();
    return props.results.filter((r) => {
        if (bucket.value !== 'all' && r.bucket !== bucket.value) return false;
        if (page.value !== 'all' && r.page !== page.value) return false;
        if (lowerText) {
            const input = getInput(r.page, r.index);
            const blob = (r.outputPreview || '') + ' ' + r.status + ' ' + r.page + ' ' + input;
            if (!blob.toLowerCase().includes(lowerText)) return false;
        }
        return true;
    });
});

const MAX_ROWS = 1000;
const visibleResults = computed(() => filteredResults.value.slice(0, MAX_ROWS));

function clickBucketCard(key: 'all' | Bucket) {
    bucket.value = key;
}

function clickPageLink(p: string) {
    page.value = p;
    scrollToSnippets();
}

function scrollToSnippets() {
    const el = document.getElementById('snippet-table-anchor');
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function toggleRow(key: string) {
    const next = new Set(expanded.value);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    expanded.value = next;
}

function truncate(s: string, n: number): string {
    return s.length > n ? s.slice(0, n) + '…' : s;
}

function pct(value: number): string {
    if (!TOTAL.value) return '0.0%';
    return ((value / TOTAL.value) * 100).toFixed(1) + '%';
}
</script>

<template>
    <Head title="Snippets report — Laravel 13.x" />

    <div v-if="!available" class="report-card-empty">
        <p class="report-card-empty__title">No sweep results yet.</p>
        <p class="report-card-empty__desc">
            Run the Playwright sweep and then
            <code>node tests/browser/build-report.ts</code> to populate
            <code>tests/browser/report.json</code>.
        </p>
    </div>

    <div v-else class="report-page">
        <section class="report-section">
            <h2 class="report-section__title">Bucket totals</h2>
            <div class="report-cards">
                <button
                    type="button"
                    class="report-card"
                    :class="{ 'report-card--active': bucket === 'all' }"
                    @click="clickBucketCard('all')"
                >
                    <div class="report-card__label">Total</div>
                    <div class="report-card__value">{{ TOTAL }}</div>
                </button>
                <button
                    v-for="b in bucketOrder"
                    :key="b"
                    type="button"
                    class="report-card"
                    :class="{ 'report-card--active': bucket === b }"
                    @click="clickBucketCard(b)"
                >
                    <div class="report-card__label" :class="BUCKET_TEXT_CLASS[b]">{{ b }}</div>
                    <div class="report-card__value" :class="BUCKET_TEXT_CLASS[b]">{{ totals[b] }}</div>
                    <div class="report-card__pct">{{ pct(totals[b]) }}</div>
                </button>
            </div>
        </section>

        <section class="report-section">
            <h2 class="report-section__title">Per-page rollup</h2>
            <div class="report-table-wrap">
                <table class="report-table">
                    <thead>
                        <tr>
                            <th
                                class="report-th report-th--sortable"
                                :aria-sort="ariaSortFor('page')"
                                @click="setSort('page')"
                            >
                                page
                                <span class="report-sort-arrow">{{ sortArrow('page') }}</span>
                            </th>
                            <th
                                v-for="b in bucketOrder"
                                :key="b"
                                class="report-th report-th--sortable report-th--num"
                                :aria-sort="ariaSortFor(b)"
                                @click="setSort(b)"
                            >
                                {{ b }}
                                <span class="report-sort-arrow">{{ sortArrow(b) }}</span>
                            </th>
                            <th
                                class="report-th report-th--sortable report-th--num"
                                :aria-sort="ariaSortFor('total')"
                                @click="setSort('total')"
                            >
                                total
                                <span class="report-sort-arrow">{{ sortArrow('total') }}</span>
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="row in sortedPerPage" :key="row.page" class="report-tr">
                            <td class="report-td">
                                <a
                                    href="#snippet-table-anchor"
                                    class="report-link"
                                    @click.prevent="clickPageLink(row.page)"
                                >{{ row.page }}</a>
                            </td>
                            <td
                                v-for="b in bucketOrder"
                                :key="b"
                                class="report-td report-td--num"
                                :class="BUCKET_TEXT_CLASS[b]"
                            >{{ row[b] }}</td>
                            <td class="report-td report-td--num report-td--total">{{ row.total }}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </section>

        <section class="report-section" id="snippet-table-anchor">
            <h2 class="report-section__title">All snippets</h2>
            <div class="report-filters">
                <select v-model="bucket" class="report-input">
                    <option value="all">All buckets</option>
                    <option v-for="b in bucketOrder" :key="b" :value="b">{{ b }}</option>
                </select>
                <select v-model="page" class="report-input">
                    <option value="all">All pages</option>
                    <option v-for="r in perPageRows" :key="r.page" :value="r.page">{{ r.page }}</option>
                </select>
                <input
                    v-model="text"
                    type="search"
                    placeholder="search output…"
                    class="report-input report-input--search"
                />
            </div>
            <div class="report-count">
                Showing {{ filteredResults.length.toLocaleString() }} of {{ TOTAL.toLocaleString() }} snippets
            </div>
            <div class="report-table-wrap">
                <table class="report-table">
                    <thead>
                        <tr>
                            <th class="report-th report-th--narrow"></th>
                            <th class="report-th">Page</th>
                            <th class="report-th report-th--num">#</th>
                            <th class="report-th">Bucket</th>
                            <th class="report-th">Status</th>
                            <th class="report-th">Output (first line)</th>
                        </tr>
                    </thead>
                    <tbody>
                        <template v-for="r in visibleResults" :key="`${r.page}-${r.index}`">
                            <tr
                                class="report-tr report-tr--clickable"
                                :class="{ 'report-tr--active': expanded.has(`${r.page}-${r.index}`) }"
                                @click="toggleRow(`${r.page}-${r.index}`)"
                            >
                                <td class="report-td report-td--toggle">
                                    {{ expanded.has(`${r.page}-${r.index}`) ? '▾' : '▸' }}
                                </td>
                                <td class="report-td">{{ r.page }}</td>
                                <td class="report-td report-td--num">{{ r.index }}</td>
                                <td class="report-td">
                                    <span :class="BUCKET_PILL_CLASS[r.bucket]">{{ r.bucket }}</span>
                                </td>
                                <td class="report-td">{{ r.status || '(empty)' }}</td>
                                <td class="report-td report-td--preview">
                                    {{ truncate(summaryLine(r.outputPreview), 100) || '(no output)' }}
                                </td>
                            </tr>
                            <tr
                                v-if="expanded.has(`${r.page}-${r.index}`)"
                                class="report-tr report-tr--detail"
                            >
                                <td colspan="6" class="report-td report-td--detail">
                                    <div class="report-detail-section">
                                        <div class="report-detail-label">Input</div>
                                        <pre class="report-pre report-pre--input">{{ getInput(r.page, r.index) || '(no source)' }}</pre>
                                    </div>
                                    <div class="report-detail-section">
                                        <div class="report-detail-label">Output</div>
                                        <pre class="report-pre report-pre--output">{{ r.outputPreview || '(no output)' }}</pre>
                                    </div>
                                </td>
                            </tr>
                        </template>
                        <tr v-if="filteredResults.length > MAX_ROWS">
                            <td colspan="6" class="report-td report-td--overflow">
                                Showing first {{ MAX_ROWS.toLocaleString() }} rows; refine filters to see more.
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </section>
    </div>
</template>

<style>
.report-page {
    --report-bg: #ffffff;
    --report-bg-elevated: #f9fafb;
    --report-bg-hover: #f3f4f6;
    --report-border: #e5e7eb;
    --report-text: #111827;
    --report-text-muted: #6b7280;
    --report-text-strong: #111827;
    --report-accent: #2563eb;
    --report-ok: #047857;
    --report-warn: #b45309;
    --report-fail: #b91c1c;
    --report-muted: #6b7280;
    --report-pre-bg: #0a0d12;
    --report-pre-text: #cfd5e1;
    --report-pill-ok-bg: rgba(16, 185, 129, 0.12);
    --report-pill-ok-text: #047857;
    --report-pill-warn-bg: rgba(245, 158, 11, 0.15);
    --report-pill-warn-text: #92400e;
    --report-pill-fail-bg: rgba(239, 68, 68, 0.12);
    --report-pill-fail-text: #991b1b;
    --report-pill-fail-strong-bg: rgba(239, 68, 68, 0.22);
    --report-pill-fail-strong-text: #7f1d1d;
    --report-pill-muted-bg: rgba(107, 114, 128, 0.15);
    --report-pill-muted-text: #4b5563;
    color: var(--report-text);
}

:where([data-theme="dark"]) .report-page,
:where([data-theme="dark"] *) .report-page {
    --report-bg: #161a22;
    --report-bg-elevated: #1d222d;
    --report-bg-hover: #232936;
    --report-border: #262c38;
    --report-text: #e6e9ef;
    --report-text-muted: #8a93a6;
    --report-text-strong: #f1f5f9;
    --report-accent: #6ea8fe;
    --report-ok: #4ade80;
    --report-warn: #facc15;
    --report-fail: #f87171;
    --report-muted: #8a93a6;
    --report-pre-bg: #0a0d12;
    --report-pre-text: #cfd5e1;
    --report-pill-ok-bg: rgba(74, 222, 128, 0.15);
    --report-pill-ok-text: #4ade80;
    --report-pill-warn-bg: rgba(250, 204, 21, 0.18);
    --report-pill-warn-text: #facc15;
    --report-pill-fail-bg: rgba(248, 113, 113, 0.18);
    --report-pill-fail-text: #f87171;
    --report-pill-fail-strong-bg: rgba(248, 113, 113, 0.3);
    --report-pill-fail-strong-text: #fecaca;
    --report-pill-muted-bg: rgba(138, 147, 166, 0.18);
    --report-pill-muted-text: #cbd5e1;
}

.report-section { margin-bottom: 2.5rem; }
.report-section__title {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--report-text-muted);
    margin: 0 0 0.75rem;
    font-weight: 600;
}
.report-section__desc {
    font-size: 0.875rem;
    color: var(--report-text-muted);
    margin: 0 0 0.5rem;
}

.report-cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 0.75rem;
}
.report-card {
    appearance: none;
    background: var(--report-bg);
    border: 1px solid var(--report-border);
    border-radius: 0.5rem;
    padding: 0.875rem 1rem;
    text-align: left;
    cursor: pointer;
    transition: border-color 0.1s, background 0.1s;
    color: var(--report-text);
    font: inherit;
}
.report-card:hover { border-color: var(--report-accent); }
.report-card--active {
    border-color: var(--report-accent);
    background: var(--report-bg-elevated);
}
.report-card__label { font-size: 0.75rem; color: var(--report-text-muted); margin-bottom: 0.25rem; }
.report-card__value { font-size: 1.5rem; font-weight: 600; line-height: 1.1; color: var(--report-text-strong); }
.report-card__pct { font-size: 0.6875rem; color: var(--report-text-muted); margin-top: 0.125rem; }

.report-table-wrap {
    border: 1px solid var(--report-border);
    border-radius: 0.5rem;
    background: var(--report-bg);
    overflow-x: auto;
}
.report-table { width: 100%; border-collapse: collapse; font-size: 0.8125rem; }
.report-th {
    background: var(--report-bg-elevated);
    color: var(--report-text-muted);
    text-align: left;
    font-size: 0.6875rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--report-border);
    user-select: none;
}
.report-th--num { text-align: right; }
.report-th--narrow { width: 1.75rem; padding-left: 0.5rem; padding-right: 0.25rem; }
.report-th--sortable { cursor: pointer; }
.report-th--sortable:hover { color: var(--report-text-strong); }
.report-th[aria-sort="ascending"],
.report-th[aria-sort="descending"] { color: var(--report-text-strong); }
.report-sort-arrow { color: var(--report-accent); margin-left: 0.25rem; }

.report-td {
    padding: 0.5rem 0.75rem;
    color: var(--report-text);
    border-bottom: 1px solid var(--report-border);
    vertical-align: top;
}
.report-tr:last-child .report-td { border-bottom: 0; }
.report-td--num { text-align: right; font-variant-numeric: tabular-nums; }
.report-td--total { color: var(--report-text-strong); font-weight: 500; }
.report-td--toggle {
    text-align: center;
    color: var(--report-accent);
    padding-left: 0.5rem;
    padding-right: 0.25rem;
    width: 1.75rem;
}
.report-td--preview {
    max-width: 600px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.75rem;
    color: var(--report-text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.report-td--overflow {
    text-align: center;
    color: var(--report-text-muted);
    padding: 0.75rem;
}
.report-td--detail { background: var(--report-bg-elevated); padding: 0 0.75rem 0.875rem; }

.report-tr--clickable { cursor: pointer; }
.report-tr:hover .report-td,
.report-tr--clickable:hover .report-td { background: var(--report-bg-hover); }
.report-tr--active .report-td { background: var(--report-bg-elevated); }
.report-tr--detail .report-td { background: var(--report-bg-elevated); }
.report-tr--detail:hover .report-td { background: var(--report-bg-elevated); }

.report-detail-section { margin-top: 0.625rem; }
.report-detail-label {
    font-size: 0.6875rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--report-text-muted);
    margin-bottom: 0.25rem;
}
.report-pre {
    margin: 0;
    padding: 0.625rem 0.75rem;
    background: var(--report-pre-bg);
    color: var(--report-pre-text);
    border: 1px solid var(--report-border);
    border-radius: 0.25rem;
    font-size: 0.75rem;
    line-height: 1.45;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    max-height: 360px;
    overflow: auto;
    white-space: pre-wrap;
    word-break: break-word;
}
.report-pre--input { border-left: 3px solid var(--report-accent); }
.report-pre--output { border-left: 3px solid var(--report-warn); }

.report-filters { display: flex; flex-wrap: wrap; gap: 0.75rem; margin-bottom: 0.75rem; }
.report-input {
    background: var(--report-bg);
    border: 1px solid var(--report-border);
    color: var(--report-text);
    padding: 0.375rem 0.625rem;
    border-radius: 0.375rem;
    font-size: 0.8125rem;
    min-width: 180px;
}
.report-input:focus { outline: none; border-color: var(--report-accent); }
.report-input--search { min-width: 220px; flex: 1; }

.report-count { font-size: 0.8125rem; color: var(--report-text-muted); padding: 0.375rem 0; }
.report-count code { font-size: 0.75rem; background: var(--report-bg-elevated); padding: 0 0.25rem; border-radius: 0.25rem; }

.report-link { color: var(--report-accent); text-decoration: none; }
.report-link:hover { text-decoration: underline; }

.bucket-text-ok { color: var(--report-ok); }
.bucket-text-warn { color: var(--report-warn); }
.bucket-text-fail { color: var(--report-fail); }
.bucket-text-muted { color: var(--report-muted); }

.bucket-pill {
    display: inline-block;
    padding: 0.125rem 0.5rem;
    border-radius: 0.25rem;
    font-size: 0.6875rem;
    font-weight: 600;
    line-height: 1.4;
    margin-right: 0.25rem;
}
.bucket-pill:last-child { margin-right: 0; }
.bucket-pill-ok { background: var(--report-pill-ok-bg); color: var(--report-pill-ok-text); }
.bucket-pill-warn { background: var(--report-pill-warn-bg); color: var(--report-pill-warn-text); }
.bucket-pill-fail { background: var(--report-pill-fail-bg); color: var(--report-pill-fail-text); }
.bucket-pill-fail-strong { background: var(--report-pill-fail-strong-bg); color: var(--report-pill-fail-strong-text); }
.bucket-pill-muted { background: var(--report-pill-muted-bg); color: var(--report-pill-muted-text); }

.report-card-empty {
    border: 1px solid var(--report-border, #e5e7eb);
    background: var(--report-bg-elevated, #f9fafb);
    color: var(--report-text, #374151);
    border-radius: 0.5rem;
    padding: 1.5rem;
    font-size: 0.875rem;
}
:where([data-theme="dark"]) .report-card-empty,
:where([data-theme="dark"] *) .report-card-empty {
    --report-border: #262c38;
    --report-bg-elevated: #1d222d;
    --report-text: #e6e9ef;
}
.report-card-empty__title { font-weight: 600; margin: 0; }
.report-card-empty__desc { margin: 0.25rem 0 0; }
.report-card-empty code {
    background: rgba(120, 120, 120, 0.18);
    padding: 0 0.25rem;
    border-radius: 0.25rem;
    font-size: 0.8125rem;
}
</style>
