<?php

declare(strict_types=1);

use App\Http\Controllers\CollectionsController;
use Illuminate\Support\Facades\Route;

Route::get('/snippets/laravel', [CollectionsController::class, 'laravel'])->name('snippets.laravel');
Route::get('/snippets/playground', [CollectionsController::class, 'playground'])->name('snippets.playground');
