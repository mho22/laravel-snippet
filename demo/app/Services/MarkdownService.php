<?php

declare(strict_types=1);

namespace App\Services;

use App\Markdown\CalloutBlockQuoteRenderer;
use App\Markdown\SnippetCodeRenderer;
use League\CommonMark\Environment\Environment;
use League\CommonMark\Extension\Attributes\AttributesExtension;
use League\CommonMark\Extension\CommonMark\CommonMarkCoreExtension;
use League\CommonMark\Extension\CommonMark\Node\Block\BlockQuote;
use League\CommonMark\Extension\CommonMark\Node\Block\FencedCode;
use League\CommonMark\Parser\MarkdownParser;
use League\CommonMark\Renderer\HtmlRenderer;

final class MarkdownService
{
    public function __construct(private readonly TorchlightClient $torchlight)
    {
    }

    /**
     * @return array{body: string, snippets: array<string, array{php: string, highlighted: string}>}
     */
    public function render(string $markdown): array
    {
        $snippetRenderer = new SnippetCodeRenderer();
        $environment = (new Environment())
            ->addExtension(new CommonMarkCoreExtension())
            ->addExtension(new AttributesExtension())
            ->addRenderer(FencedCode::class, $snippetRenderer)
            ->addRenderer(BlockQuote::class, new CalloutBlockQuoteRenderer());

        $document = (new MarkdownParser($environment))->parse($markdown);

        $missing = [];
        foreach ($document->iterator() as $node) {
            if (! $node instanceof FencedCode) {
                continue;
            }
            $language = $node->getInfo() ?: 'text';
            $source = $node->getLiteral();
            $id = $this->torchlight->id($language, $source);
            $cached = $this->torchlight->read($id);
            if ($cached !== null) {
                $node->data->set('torchlight', $cached);
            } else {
                $missing[] = ['id' => $id, 'language' => $language, 'code' => $source, 'node' => $node];
            }
        }

        if ($missing !== []) {
            $blocks = $this->torchlight->fetch(array_map(
                static fn (array $b): array => [
                    'id' => $b['id'],
                    'language' => $b['language'],
                    'theme' => config('docs.torchlight_theme'),
                    'code' => $b['code'],
                ],
                $missing,
            ));
            foreach ($missing as $i => $entry) {
                $result = $blocks[$i] ?? null;
                if ($result === null) {
                    continue;
                }
                $this->torchlight->write($entry['id'], $result);
                $entry['node']->data->set('torchlight', $result);
            }
        }

        $body = (new HtmlRenderer($environment))->renderDocument($document)->getContent();
        $body = str_replace('<a name=', '<a id=', $body);

        return [
            'body' => $body,
            'snippets' => $snippetRenderer->snippets,
        ];
    }
}
