import { defineConfig } from '@playwright/test';

// PLAYWRIGHT_BASE_URL overrides the default vite-dev URL for CI, where
// laravel-vite-plugin refuses to run the HMR server (CI=true). CI builds
// the assets with `npm run build` and points playwright at artisan (:8000),
// which serves the built bundle via the @vite() directive + manifest.json.
// When the override is set, skip the vite webServer entry so playwright
// doesn't try to spawn `npm run dev` against the laravel-vite-plugin guard.
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5187';
const wantsViteDevServer = baseURL.includes(':5187');

// 4,335 snippets share one PHP-WASM worker per page, so a single sequential
// worker is fastest and most accurate; parallel sharding would spin up the
// bundle install many times over.
export default defineConfig({
    testDir: './tests/browser',
    timeout: 90 * 60 * 1000,
    fullyParallel: false,
    workers: 1,
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
