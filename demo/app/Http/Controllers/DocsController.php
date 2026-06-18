<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Services\MarkdownService;
use Illuminate\Support\Facades\File;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

final class DocsController
{
    public function show(MarkdownService $markdown, string $page): Response
    {
        $root = config('docs.docs_root');
        $path = $root.DIRECTORY_SEPARATOR.$page.'.md';
        if (! File::exists($path) || ! str_starts_with(realpath($path) ?: '', realpath($root) ?: '')) {
            throw new NotFoundHttpException();
        }

        $source = (string) file_get_contents($path);
        $rendered = $markdown->render($source);

        preg_match('/^#\s+(.+)$/m', $source, $titleMatch);
        $title = $titleMatch[1] ?? ucfirst(str_replace('-', ' ', $page));

        return Inertia::render('Docs', [
            'title' => $title,
            'slug' => $page,
            'body' => $rendered['body'],
            'snippets' => $rendered['snippets'],
        ]);
    }
}
