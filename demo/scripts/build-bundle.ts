import { spawnSync } from 'node:child_process';
import { rmSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundleDir = path.join(root, 'wasm-bundle');
const outZip = path.join(root, 'public/laravel.zip');

if (!existsSync(bundleDir) || !statSync(bundleDir).isDirectory()) {
    console.error(`build-bundle: missing ${bundleDir}`);
    process.exit(1);
}

// demo/wasm-bundle/.gitignore excludes /vendor — that's a Laravel
// install (~10k files, ~100 MB), too large to commit. Install it before
// zipping so the bundle ships /bundle/vendor/autoload.php; without it,
// snippet-init.php fatals silently on Laravel bootstrap (display_errors=0
// → exit 255, empty stdout/stderr — extremely hard to diagnose).
// Composer's own change detection makes warm runs ~2-5s; cold runs install
// from scratch.
const composer = spawnSync(
    'composer',
    ['install', '--no-dev', '--optimize-autoloader', '--no-interaction', '--prefer-dist'],
    { cwd: bundleDir, stdio: 'inherit' },
);
if (composer.status !== 0) {
    console.error(`build-bundle: composer install exited with status ${composer.status}`);
    process.exit(composer.status ?? 1);
}

const excludes: string[] = [
    'tests/*',
    'public/*',
    'resources/*',
    'node_modules/*',
    'package.json',
    'vite.config.js',
    'phpunit.xml',
    'README.md',
    'artisan',
    'vendor/aws/aws-sdk-php/src/data/*',
];

rmSync(outZip, { force: true });

const args = ['-r', '-q', outZip, '.', '-x', ...excludes];
const result = spawnSync('zip', args, { cwd: bundleDir, stdio: 'inherit' });

if (result.status !== 0) {
    console.error(`build-bundle: zip exited with status ${result.status}`);
    process.exit(result.status ?? 1);
}

const { size } = statSync(outZip);
const mb = (size / 1024 / 1024).toFixed(2);
console.log(`build-bundle: wrote ${outZip} (${mb} MB)`);
