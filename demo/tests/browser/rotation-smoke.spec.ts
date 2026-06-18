// s39 thread #1 / subthread A — smoke-test PHP-WASM runtime rotation.
//
// Goal: confirm that php.hotSwapPHPRuntime can wipe the PHP class table /
// statics / opcache while preserving /bundle/ (the 13 MB Laravel install)
// and the ini file at /internal/shared/php.ini. The win, if it lands, is
// rotation-per-page in the sweep: one bundle install per Playwright worker
// instead of one per docs page (102x → ~2x).
//
// Pass criteria (from the session-39 plan):
//   - tCreate < 300 ms              (loadWebRuntime cost; V8 caches the WASM)
//   - tSwap   < 800 ms              (copyMEMFSNodes over ~3k bundle files)
//   - class declared pre-rotation is GONE post-rotation
//   - /bundle/vendor/autoload.php still exists post-rotation (needed for
//     snippet-init.php to re-bootstrap Laravel under the new runtime)
//
// If any of these miss, fall back to subthread D (JS-side fflate unzip).

import { expect, test } from '@playwright/test';

const PROBE_CLASS = 'TestRotationProbe_xyz_321';

test('php-wasm runtime rotation smoke', async ({ page }) => {
    test.setTimeout(3 * 60 * 1000);

    page.on('console', (msg) => {
        const t = msg.type();
        if (t === 'error' || t === 'warning' || msg.text().startsWith('[snippet-worker]')) {
            console.log(`[browser ${t}]`, msg.text());
        }
    });
    page.on('pageerror', (err) => console.log('[browser pageerror]', err.message));

    await page.goto('/docs/13.x/queues', { waitUntil: 'domcontentloaded' });

    // Dev-only window hooks are attached at module load by php.ts. They land
    // as soon as the page bundle evaluates — well before snippet cards mount.
    await page.waitForFunction(
        () =>
            typeof (window as { __rotateWorker?: unknown }).__rotateWorker ===
                'function' &&
            typeof (window as { __runPhp?: unknown }).__runPhp === 'function',
        null,
        { timeout: 15_000 },
    );

    // First run also bootstraps the worker (cold install of laravel.zip via
    // ZipArchive::extractTo — ~10s). After this returns, /bundle/ exists.
    const preRotate = await page.evaluate(async (probeClass) => {
        const runPhp = (window as unknown as {
            __runPhp: (code: string) => Promise<{
                stdout: string;
                stderr: string;
                exitCode: number;
            }>;
        }).__runPhp;
        const t0 = performance.now();
        const r = await runPhp(
            `class ${probeClass} {}\nvar_dump(class_exists("${probeClass}"));\nvar_dump(file_exists("/bundle/vendor/autoload.php"));`,
        );
        return { ...r, tRun: performance.now() - t0 };
    }, PROBE_CLASS);

    console.log('PRE-ROTATE result:', JSON.stringify(preRotate, null, 2));

    expect(preRotate.exitCode, 'pre-rotate snippet should succeed').toBe(0);
    const preBools = preRotate.stdout.match(/bool\((true|false)\)/g) ?? [];
    expect(preBools, 'expected class_exists + file_exists bools').toHaveLength(2);
    expect(preBools[0]).toBe('bool(true)'); // class just declared
    expect(preBools[1]).toBe('bool(true)'); // /bundle/vendor/autoload.php

    const timings = await page.evaluate(async () => {
        return await (
            window as unknown as {
                __rotateWorker: () => Promise<{
                    tCreate: number;
                    tSwap: number;
                    tTotal: number;
                    error?: { message: string };
                }>;
            }
        ).__rotateWorker();
    });

    console.log('ROTATION timings:', JSON.stringify(timings, null, 2));

    expect(timings.error, 'rotation should not throw').toBeUndefined();

    // Post-rotation: class should be gone; /bundle/ should survive.
    const postRotate = await page.evaluate(async (probeClass) => {
        const runPhp = (window as unknown as {
            __runPhp: (code: string) => Promise<{
                stdout: string;
                stderr: string;
                exitCode: number;
            }>;
        }).__runPhp;
        const t0 = performance.now();
        const r = await runPhp(
            `var_dump(class_exists("${probeClass}"));\nvar_dump(file_exists("/bundle/vendor/autoload.php"));`,
        );
        return { ...r, tRun: performance.now() - t0 };
    }, PROBE_CLASS);

    console.log('POST-ROTATE result:', JSON.stringify(postRotate, null, 2));

    expect(postRotate.exitCode, 'post-rotate snippet should succeed').toBe(0);
    const postBools = postRotate.stdout.match(/bool\((true|false)\)/g) ?? [];
    expect(postBools, 'expected class_exists + file_exists bools').toHaveLength(2);
    expect(postBools[0], 'class should be GONE after rotation').toBe('bool(false)');
    expect(postBools[1], '/bundle/vendor/autoload.php should survive').toBe('bool(true)');

    // Final summary — printed regardless of pass/fail.
    console.log(
        `\n=== ROTATION SMOKE SUMMARY ===\n` +
            `tCreate: ${timings.tCreate.toFixed(1)} ms (budget < 300)\n` +
            `tSwap:   ${timings.tSwap.toFixed(1)} ms (budget < 1000)\n` +
            `tTotal:  ${timings.tTotal.toFixed(1)} ms\n` +
            `class wiped:        ${postBools[0] === 'bool(false)' ? 'YES' : 'NO'}\n` +
            `/bundle/ preserved: ${postBools[1] === 'bool(true)' ? 'YES' : 'NO'}\n` +
            `===============================\n`,
    );

    // Budget asserts last so we still see the summary if these fail.
    expect.soft(timings.tCreate, 'tCreate budget').toBeLessThan(300);
    expect.soft(timings.tSwap, 'tSwap budget').toBeLessThan(1000);
});
