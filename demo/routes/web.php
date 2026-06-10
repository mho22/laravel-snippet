<?php

declare(strict_types=1);

use App\Http\Controllers\CollectionsController;
use App\Http\Controllers\DocsController;
use Illuminate\Support\Facades\Route;

Route::get('/snippets/laravel', [CollectionsController::class, 'laravel'])->name('snippets.laravel');

Route::get('/snippets/report', fn () => response()->file(base_path('tests/browser/report.html')))
    ->name('snippets.report');

Route::redirect('/', '/docs/13.x/installation');
Route::redirect('/docs', '/docs/13.x/installation');
Route::redirect('/docs/13.x', '/docs/13.x/installation');
Route::get('/docs/13.x/{page}', [DocsController::class, 'show'])
    ->where('page', '[a-z0-9\-]+')
    ->name('docs.show');
