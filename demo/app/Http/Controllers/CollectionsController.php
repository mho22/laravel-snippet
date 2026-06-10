<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Services\MarkdownService;
use Inertia\Inertia;
use Inertia\Response;

final class CollectionsController
{
    public function laravel(MarkdownService $markdown): Response
    {
        return $this->renderPage($markdown, 'Collections');
    }

    private function renderPage(MarkdownService $markdown, string $component): Response
    {
        $source = (string) file_get_contents(config('docs.markdown_file'));
        $rendered = $markdown->render($source);

        preg_match('/^#\s+(.+)$/m', $source, $titleMatch);
        $title = $titleMatch[1] ?? 'Docs';

        return Inertia::render($component, [
            'title' => $title,
            'body' => $rendered['body'],
            'snippets' => $rendered['snippets'],
        ]);
    }
}
