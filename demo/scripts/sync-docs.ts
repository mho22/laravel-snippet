import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const MARKDOWN_DIR = join(SCRIPT_DIR, '..', 'resources', 'markdown', '13.x');

// laravel/docs upstream branch. Snapshot in this repo was originally
// imported from 13.x in a1c5b07 and never re-synced; this script is the
// missing piece (sweep.yml runs sync:docs daily, deploy.yml overlays the
// artifact). Same shape as sync:assets for CSS+fonts.
const UPSTREAM_REPO = 'laravel/docs';
const UPSTREAM_BRANCH = '13.x';
const TREES_URL = `https://api.github.com/repos/${UPSTREAM_REPO}/git/trees/${UPSTREAM_BRANCH}`;
const RAW_BASE = `https://raw.githubusercontent.com/${UPSTREAM_REPO}/${UPSTREAM_BRANCH}`;

const headers: Record<string, string> = {
    'User-Agent': 'laravel-snippets-sync-docs',
    Accept: 'application/vnd.github+json',
};
// GITHUB_TOKEN bumps the rate limit from 60/hr (unauthenticated) to
// 5000/hr — workflow runs always have it; local runs can opt in with
// `GITHUB_TOKEN=... npm run sync:docs`.
if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

const treeRes = await fetch(TREES_URL, { headers });
if (!treeRes.ok) {
    console.warn(`[sync-docs] trees API failed (HTTP ${treeRes.status}); keeping existing corpus`);
    process.exit(0);
}
const tree = (await treeRes.json()) as { tree: Array<{ path: string; type: string }>; truncated?: boolean };
if (tree.truncated) {
    // 13.x has ~100 root entries, well under the 100k-entry truncation
    // threshold. If this ever flips true we'd need ?recursive=1 or per-
    // directory listing; for now treat it as a loud config error.
    console.warn('[sync-docs] trees API returned truncated=true — partial corpus, aborting');
    process.exit(1);
}

const upstreamMd = new Set(
    tree.tree.filter((e) => e.type === 'blob' && e.path.endsWith('.md')).map((e) => e.path)
);
const localMd = new Set((await readdir(MARKDOWN_DIR)).filter((f) => f.endsWith('.md')));

// New upstream files we don't have locally (e.g. a fresh `whatever.md`
// landed since a1c5b07). Locally-only files (entries gone from upstream)
// are NOT removed — leave the baseline so deep links in our prerender
// don't 404 mid-deploy. They just get no refresh.
const toFetch = [...new Set([...upstreamMd, ...localMd])].sort();

const results = await Promise.allSettled(
    toFetch.map(async (name) => {
        const res = await fetch(`${RAW_BASE}/${name}`);
        if (res.status === 404) return { name, status: 'missing-upstream' as const };
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const fresh = await res.text();
        const localPath = join(MARKDOWN_DIR, name);
        let prior = '';
        try {
            prior = await readFile(localPath, 'utf8');
        } catch {
            // new file — write through
        }
        if (prior === fresh) return { name, status: 'unchanged' as const };
        await writeFile(localPath, fresh, 'utf8');
        return {
            name,
            status: prior ? ('updated' as const) : ('new' as const),
            bytes: fresh.length,
        };
    })
);

let updated = 0;
let added = 0;
let unchanged = 0;
let missing = 0;
let failed = 0;
for (const r of results) {
    if (r.status === 'rejected') {
        failed += 1;
        const message = r.reason instanceof Error ? r.reason.message : String(r.reason);
        console.warn(`[sync-docs]   fetch failed: ${message}`);
        continue;
    }
    switch (r.value.status) {
        case 'updated':
            updated += 1;
            console.log(`[sync-docs]   updated: ${r.value.name} (${(r.value.bytes / 1024).toFixed(1)} KB)`);
            break;
        case 'new':
            added += 1;
            console.log(`[sync-docs]   added:   ${r.value.name} (${(r.value.bytes / 1024).toFixed(1)} KB)`);
            break;
        case 'missing-upstream':
            missing += 1;
            break;
        case 'unchanged':
            unchanged += 1;
            break;
    }
}

console.log(
    `[sync-docs] ${updated} updated, ${added} added, ${unchanged} unchanged, ${missing} missing-upstream, ${failed} failed (corpus: ${toFetch.length})`
);
