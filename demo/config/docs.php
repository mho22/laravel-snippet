<?php

declare(strict_types=1);

return [
    // scripts/sync-docs-css.mjs downloads the current laravel.com docs CSS to
    // public/laravel-docs.css before each dev/build/prerender; the prerender
    // overrides this env var to use the GH Pages base path.
    'css_href' => env('LARAVEL_DOCS_CSS_HREF', '/laravel-docs.css'),
    'torchlight_theme' => 'olaolu-palenight',
    'torchlight_cache' => storage_path('cache/torchlight'),
    'markdown_file' => resource_path('markdown/collections.md'),
    'docs_root' => resource_path('markdown/13.x'),
];
