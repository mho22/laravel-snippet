<?php

declare(strict_types=1);

namespace App\Markdown;

use League\CommonMark\Extension\CommonMark\Node\Block\FencedCode;
use League\CommonMark\Node\Node;
use League\CommonMark\Renderer\ChildNodeRendererInterface;
use League\CommonMark\Renderer\NodeRendererInterface;

final class SnippetCodeRenderer implements NodeRendererInterface
{
    /** @var array<string, array{php: string, highlighted: string}> */
    public array $snippets = [];

    public function render(Node $node, ChildNodeRendererInterface $childRenderer): string
    {
        assert($node instanceof FencedCode);
        $language = $node->getInfo() ?: 'text';
        $torchlight = $node->data->get('torchlight', null);
        $highlighted = is_array($torchlight) && isset($torchlight['highlighted'])
            ? $torchlight['highlighted']
            : htmlspecialchars($node->getLiteral(), ENT_QUOTES);

        if ($language !== 'php') {
            $classes = htmlspecialchars($torchlight['classes'] ?? '', ENT_QUOTES);
            $styles = htmlspecialchars($torchlight['styles'] ?? '', ENT_QUOTES);

            return '<div class="code-block-wrapper"><pre><code data-lang="'
                .htmlspecialchars($language, ENT_QUOTES)
                .'" class="'.$classes.'" style="'.$styles.'">'
                .$highlighted
                .'</code></pre></div>';
        }

        $id = 'snippet-'.count($this->snippets);
        $this->snippets[$id] = [
            'php' => $node->getLiteral(),
            'highlighted' => $highlighted,
        ];

        return '<div class="laravel-snippet contains-code-blocks" data-snippet-id="'.$id.'"></div>';
    }
}
