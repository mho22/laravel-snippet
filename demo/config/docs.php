<?php

declare(strict_types=1);

return [
    // scripts/prerender.mjs refreshes this on each deploy; the default is the
    // local-dev fallback for when laravel.com rotates the hash.
    'css_href' => env('LARAVEL_DOCS_CSS_HREF', 'https://laravel.com/build/assets/app-CpSub1jt.css'),
    'torchlight_theme' => 'olaolu-palenight',
    'torchlight_cache' => storage_path('cache/torchlight'),
    'markdown_file' => resource_path('markdown/collections.md'),
];
