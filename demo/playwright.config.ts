import { defineConfig } from '@playwright/test';

// PLAYWRIGHT_BASE_URL overrides the default vite-dev URL for CI, where
// laravel-vite-plugin refuses to run the HMR server (CI=true). CI builds
// the assets with `npm run build` and points playwright at artisan (:8000),
// which serves the built bundle via the @vite() directive + manifest.json.
// When the override is set, skip the vite webServer entry so playwright
// doesn't try to spawn `npm run dev` against the laravel-vite-plugin guard.
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5187';
const wantsViteDevServer = baseURL.includes(':5187');

// 4,335 snippets, ~50 docs pages. Each page navigation pays a fresh
// PHP-WASM bundle install (≈10 s — that's *the* sweep cost). The bundle
// install can't be reused across page navigations (a new page → new
// browser document → new Web Worker → new install), so the lever is
// to parallelize page-level tests across Playwright workers. On the
// GH Actions standard runner (2 vCPU, 7 GB RAM) two concurrent WASM
// heaps fit comfortably and halve the wall-clock time (~25 min → ~13 min).
//   - `workers: 2` on CI; local default (`undefined`) lets Playwright
//     pick based on `os.cpus().length`.
//   - `fullyParallel: true` so tests in the same file (one per docs page,
//     generated in snippets.spec.ts) actually run on parallel workers.
export default defineConfig({
    testDir: './tests/browser',
    timeout: 90 * 60 * 1000,
    fullyParallel: true,
    workers: process.env.CI ? 2 : undefined,
    reporter: [
        ['list'],
        ['json', { outputFile: 'tests/browser/playwright-report.json' }],
        ['html', { outputFolder: 'tests/browser/playwright-html', open: 'never' }],
    ],
    use: {
        baseURL,
        actionTimeout: 30_000,
        navigationTimeout: 60_000,
    },
    webServer: [
        {
            command: 'php artisan serve --port=8000',
            url: 'http://localhost:8000',
            reuseExistingServer: true,
            timeout: 120_000,
        },
        ...(wantsViteDevServer
            ? [
                  {
                      command: 'npm run dev',
                      url: 'http://localhost:5187',
                      reuseExistingServer: true,
                      timeout: 120_000,
                  },
              ]
            : []),
    ],
    projects: [
        {
            name: 'chromium',
            use: { browserName: 'chromium' },
        },
    ],
});
