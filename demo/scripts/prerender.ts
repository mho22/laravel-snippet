import { spawn } from 'node:child_process';
import { mkdir, rm, cp, writeFile, access, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

import { injectSnippetPreloads } from './inject-snippet-preloads.ts';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEMO_DIR = join(SCRIPT_DIR, '..');
const PRERENDER_PORT = 8765;
const ARTISAN_HOST = '127.0.0.1';

const DIST_DIR = join(DEMO_DIR, 'dist');
const HOT_FILE = join(DEMO_DIR, 'public', 'hot');
const DOCS_MD_DIR = join(DEMO_DIR, 'resources', 'markdown', '13.x');

async function exists(path: string): Promise<boolean> {
    try {
        await access(path);
        return true;
    } catch {
        return false;
    }
}

function run(cmd: string, args: string[], opts: Record<string, unknown> = {}): Promise<void> {
    return new Promise((resolve, reject) => {
        const child = spawn(cmd, args, { stdio: 'inherit', cwd: DEMO_DIR, ...opts });
        child.on('error', reject);
        child.on('exit', (code) =>
            code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} exited ${code}`))
        );
    });
}

async function renderRoute(
    path: string,
    outFile: string,
    urlSearch: string,
    urlReplace: string,
    transform?: (html: string) => string
): Promise<void> {
    console.log(`[prerender] fetching ${path}`);
    const res = await fetch(`http://${ARTISAN_HOST}:${PRERENDER_PORT}${path}`);
    if (!res.ok) {
        throw new Error(`Render fetch failed for ${path}: HTTP ${res.status}`);
    }
    let html = (await res.text()).replace(urlSearch, urlReplace);
    if (transform) html = transform(html);
    await mkdir(dirname(outFile), { recursive: true });
    await writeFile(outFile, html, 'utf8');
}

// Rewrites every site-absolute internal link from /<path> to
// /laravel-snippet/<path>/ so the GH Pages subdirectory deploy resolves.
function rewriteForGhPages(html: string, currentRoute: string): string {
    // Inertia bootstrap URL (only the current page). Inertia's data-page
    // payload is JSON-escaped INSIDE an HTML attribute, so each '/' may
    // appear as either '/' or '\/'. Build a pattern that allows the
    // optional backslash escape before each slash, with a trailing slash
    // also optional. Previous version only allowed one optional escape at
    // the very start, never matched the per-slash form, and silently left
    // the URL un-prefixed — Inertia then history.replaceState'd the URL
    // bar to '/<route>' on mount, dropping '/laravel-snippet/'.
    const SEP = '\\\\?/'; // regex source for "optional backslash then /"
    const segments = currentRoute.split('/').map(s => s.replace(/\./g, '\\.'));
    const routePattern = SEP + segments.join(SEP);
    const escapedRoute = currentRoute.replace(/\//g, '\\/');
    html = html.replace(
        new RegExp(`"url":"${routePattern}${SEP}?"`),
        `"url":"\\/laravel-snippet\\/${escapedRoute}\\/"`
    );
    // Sidebar / body hrefs to docs pages.
    html = html.replace(
        /href="\/docs\/13\.x\/([a-z0-9-]+)"/g,
        'href="/laravel-snippet/docs/13.x/$1/"'
    );
    // Demo snippet routes.
    html = html.replace(
        /href="\/snippets\/laravel"/g,
        'href="/laravel-snippet/snippets/laravel/"'
    );
    return html;
}

async function listDocsSlugs(): Promise<string[]> {
    const entries = await readdir(DOCS_MD_DIR);
    return entries
        .filter((f) => f.endsWith('.md'))
        .map((f) => f.slice(0, -3))
        .sort();
}

// Static redirect at the GH Pages repo root → the Laravel docs landing page.
const ROOT_REDIRECT_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>Laravel 13.x docs (snippets)</title>
    <meta http-equiv="refresh" content="0; url=./docs/13.x/installation/">
    <link rel="canonical" href="./docs/13.x/installation/">
</head>
<body>
    <p><a href="./docs/13.x/installation/">Continue to /docs/13.x/installation/</a></p>
</body>
</html>
`;

// laravel.com rotates its CSS hash on each deploy; re-fetch so we ship the
// current asset. On failure we return null and the config default wins.
export async function fetchLaravelDocsCssHref(): Promise<string | null> {
    try {
        const res = await fetch('https://laravel.com/docs/13.x/collections');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const m = (await res.text()).match(
            /https:\/\/laravel\.com\/build\/assets\/app-[A-Za-z0-9_-]+\.css/
        );
        if (!m) throw new Error('no css href matched');
        return m[0];
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`[prerender] could not refresh laravel.com CSS href: ${message}`);
        return null;
    }
}

async function waitForPort(host: string, port: number, timeoutMs = 15000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            const res = await fetch(`http://${host}:${port}/`, { method: 'HEAD' });
            if (res.status < 500) return;
        } catch {}
        await delay(150);
    }
    throw new Error(`Timed out waiting for ${host}:${port}`);
}

async function main(): Promise<void> {
    console.log('[prerender] cleaning dist/');
    await rm(DIST_DIR, { recursive: true, force: true });
    await mkdir(DIST_DIR, { recursive: true });

    console.log('[prerender] running production build');
    await run('npm', ['run', 'build']);

    if (await exists(HOT_FILE)) {
        console.log('[prerender] removing stale public/hot (dev marker)');
        await rm(HOT_FILE);
    }

    // `npm run build` already runs sync:assets, so public/laravel-docs.css and
    // public/laravel-docs-assets/ are fresh. Rewrite the URL to the GH Pages
    // base path for the prerendered HTML.
    const cssHrefForGhPages = '/laravel-snippet/laravel-docs.css';

    console.log(`[prerender] starting artisan serve on ${ARTISAN_HOST}:${PRERENDER_PORT}`);
    const artisan = spawn(
        'php',
        ['artisan', 'serve', `--host=${ARTISAN_HOST}`, `--port=${PRERENDER_PORT}`],
        {
            cwd: DEMO_DIR,
            stdio: ['ignore', 'pipe', 'pipe'],
            env: {
                ...process.env,
                LARAVEL_DOCS_CSS_HREF: cssHrefForGhPages,
            },
        }
    );
    artisan.stdout?.on('data', (chunk) => process.stdout.write(`[artisan] ${chunk}`));
    artisan.stderr?.on('data', (chunk) => process.stderr.write(`[artisan] ${chunk}`));

    try {
        await waitForPort(ARTISAN_HOST, PRERENDER_PORT);

        await renderRoute(
            '/snippets/laravel',
            join(DIST_DIR, 'snippets', 'laravel', 'index.html'),
            '"url":"\\/snippets\\/laravel"',
            '"url":"\\/laravel-snippet\\/snippets\\/laravel\\/"',
            injectSnippetPreloads
        );

        console.log('[prerender] enumerating docs pages');
        const slugs = await listDocsSlugs();
        console.log(`[prerender] rendering ${slugs.length} docs pages`);
        for (const slug of slugs) {
            const route = `docs/13.x/${slug}`;
            const path = `/${route}`;
            const outFile = join(DIST_DIR, route, 'index.html');
            console.log(`[prerender] fetching ${path}`);
            const res = await fetch(`http://${ARTISAN_HOST}:${PRERENDER_PORT}${path}`);
            if (!res.ok) {
                throw new Error(`Render fetch failed for ${path}: HTTP ${res.status}`);
            }
            const html = injectSnippetPreloads(rewriteForGhPages(await res.text(), route));
            await mkdir(dirname(outFile), { recursive: true });
            await writeFile(outFile, html, 'utf8');
        }

        console.log('[prerender] writing root redirect');
        await writeFile(join(DIST_DIR, 'index.html'), ROOT_REDIRECT_HTML, 'utf8');

        console.log('[prerender] copying public assets');
        await cp(join(DEMO_DIR, 'public', 'build'), join(DIST_DIR, 'build'), { recursive: true });
        await cp(
            join(DEMO_DIR, 'public', 'snippet-worker'),
            join(DIST_DIR, 'snippet-worker'),
            { recursive: true }
        );
        await cp(join(DEMO_DIR, 'public', 'laravel.zip'), join(DIST_DIR, 'laravel.zip'));
        await cp(join(DEMO_DIR, 'public', 'laravel-docs.css'), join(DIST_DIR, 'laravel-docs.css'));
        await cp(
            join(DEMO_DIR, 'public', 'laravel-docs-assets'),
            join(DIST_DIR, 'laravel-docs-assets'),
            { recursive: true }
        );

        // Snippet sweep report — report.html fetches report.json on load,
        // so both must live in the same directory. Guarded by exists() so
        // a deploy doesn't fail when no sweep has been run yet.
        const reportHtml = join(DEMO_DIR, 'tests', 'browser', 'report.html');
        const reportJson = join(DEMO_DIR, 'tests', 'browser', 'report.json');
        if (await exists(reportHtml)) {
            const reportDir = join(DIST_DIR, 'report');
            await mkdir(reportDir, { recursive: true });
            await cp(reportHtml, join(reportDir, 'index.html'));
            if (await exists(reportJson)) {
                await cp(reportJson, join(reportDir, 'report.json'));
            }
        }
    } finally {
        artisan.kill('SIGTERM');
    }

    console.log(`[prerender] done → ${DIST_DIR}`);
}

// Guard so tests can import { fetchLaravelDocsCssHref } without spawning artisan.
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch((err) => {
        console.error(err);
        process.exit(1);
    });
}
