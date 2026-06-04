import { spawn } from 'node:child_process';
import { mkdir, rm, cp, writeFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEMO_DIR = join(SCRIPT_DIR, '..');
const PRERENDER_PORT = 8765;
const ARTISAN_HOST = '127.0.0.1';

const DIST_DIR = join(DEMO_DIR, 'dist');
const HOT_FILE = join(DEMO_DIR, 'public', 'hot');

async function exists(path) {
    try {
        await access(path);
        return true;
    } catch {
        return false;
    }
}

function run(cmd, args, opts = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(cmd, args, { stdio: 'inherit', cwd: DEMO_DIR, ...opts });
        child.on('error', reject);
        child.on('exit', (code) =>
            code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} exited ${code}`))
        );
    });
}

async function renderRoute(path, outFile, urlSearch, urlReplace) {
    console.log(`[prerender] fetching ${path}`);
    const res = await fetch(`http://${ARTISAN_HOST}:${PRERENDER_PORT}${path}`);
    if (!res.ok) {
        throw new Error(`Render fetch failed for ${path}: HTTP ${res.status}`);
    }
    const html = (await res.text()).replace(urlSearch, urlReplace);
    await mkdir(dirname(outFile), { recursive: true });
    await writeFile(outFile, html, 'utf8');
}

// Static redirect at the GH Pages repo root → the Laravel page. Without this,
// https://mho22.github.io/laravel-snippet/ would 404 (no page route at /).
const ROOT_REDIRECT_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>Snippets</title>
    <meta http-equiv="refresh" content="0; url=./snippets/laravel/">
    <link rel="canonical" href="./snippets/laravel/">
</head>
<body>
    <p><a href="./snippets/laravel/">Continue to /snippets/laravel/</a></p>
</body>
</html>
`;

// laravel.com rotates its CSS hash on each deploy; re-fetch so we ship the
// current asset. On failure we return null and the config default wins.
export async function fetchLaravelDocsCssHref() {
    try {
        const res = await fetch('https://laravel.com/docs/13.x/collections');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const m = (await res.text()).match(
            /https:\/\/laravel\.com\/build\/assets\/app-[A-Za-z0-9_-]+\.css/
        );
        if (!m) throw new Error('no css href matched');
        return m[0];
    } catch (err) {
        console.warn(`[prerender] could not refresh laravel.com CSS href: ${err.message}`);
        return null;
    }
}

async function waitForPort(host, port, timeoutMs = 15000) {
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

async function main() {
    console.log('[prerender] cleaning dist/');
    await rm(DIST_DIR, { recursive: true, force: true });
    await mkdir(DIST_DIR, { recursive: true });

    console.log('[prerender] running production build');
    await run('npm', ['run', 'build']);

    if (await exists(HOT_FILE)) {
        console.log('[prerender] removing stale public/hot (dev marker)');
        await rm(HOT_FILE);
    }

    const liveCssHref = await fetchLaravelDocsCssHref();
    if (liveCssHref) {
        console.log(`[prerender] using live laravel.com CSS href: ${liveCssHref}`);
    }

    console.log(`[prerender] starting artisan serve on ${ARTISAN_HOST}:${PRERENDER_PORT}`);
    const artisan = spawn(
        'php',
        ['artisan', 'serve', `--host=${ARTISAN_HOST}`, `--port=${PRERENDER_PORT}`],
        {
            cwd: DEMO_DIR,
            stdio: ['ignore', 'pipe', 'pipe'],
            env: {
                ...process.env,
                ...(liveCssHref ? { LARAVEL_DOCS_CSS_HREF: liveCssHref } : {}),
            },
        }
    );
    artisan.stdout.on('data', (chunk) => process.stdout.write(`[artisan] ${chunk}`));
    artisan.stderr.on('data', (chunk) => process.stderr.write(`[artisan] ${chunk}`));

    try {
        await waitForPort(ARTISAN_HOST, PRERENDER_PORT);

        await renderRoute(
            '/snippets/laravel',
            join(DIST_DIR, 'snippets', 'laravel', 'index.html'),
            '"url":"\\/snippets\\/laravel"',
            '"url":"\\/laravel-snippet\\/snippets\\/laravel\\/"'
        );
        await renderRoute(
            '/snippets/playground',
            join(DIST_DIR, 'snippets', 'playground', 'index.html'),
            '"url":"\\/snippets\\/playground"',
            '"url":"\\/laravel-snippet\\/snippets\\/playground\\/"'
        );

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
