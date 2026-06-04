<?php

declare(strict_types=1);

namespace App\Markdown;

use League\CommonMark\Extension\CommonMark\Node\Block\BlockQuote;
use League\CommonMark\Node\Block\Paragraph;
use League\CommonMark\Node\Inline\Newline;
use League\CommonMark\Node\Inline\Text;
use League\CommonMark\Node\Node;
use League\CommonMark\Renderer\ChildNodeRendererInterface;
use League\CommonMark\Renderer\NodeRendererInterface;

final class CalloutBlockQuoteRenderer implements NodeRendererInterface
{
    private const CALLOUTS = [
        'NOTE' => ['color' => '#8D54C5', 'svg' => 'callout-note.svg'],
        'WARNING' => ['color' => '#F53003', 'svg' => 'callout-warning.svg'],
    ];

    public function render(Node $node, ChildNodeRendererInterface $childRenderer): string
    {
        assert($node instanceof BlockQuote);

        $callout = $this->extractCallout($node);
        if ($callout === null) {
            return '<blockquote>'.$childRenderer->renderNodes($node->children()).'</blockquote>';
        }

        [$type, $paragraph] = $callout;
        $color = self::CALLOUTS[$type]['color'];
        $svg = trim((string) file_get_contents(
            resource_path('views/partials/'.self::CALLOUTS[$type]['svg'])
        ));
        $body = $childRenderer->renderNodes($paragraph->children());

        return '<div class="flex flex-col p-3 mb-10 space-y-4 text-base leading-normal border rounded-md lg:px-4 lg:flex-row lg:space-y-0 lg:space-x-4 border-sand-light-5 callout dark:border-sand-dark-5 dark:text-sand-light-3 text-sand-dark-3">'
            .'<div class="w-8 h-8 p-2 lg:my-1.5 rounded-xs flex items-center justify-center shrink-0 bg-['.$color.']">'
            .$svg
            .'</div>'
            .'<p class="callout text-pretty">'.$body.'</p>'
            .'</div>';
    }

    /**
     * @return array{0: string, 1: Paragraph}|null
     */
    private function extractCallout(BlockQuote $node): ?array
    {
        $paragraph = $node->firstChild();
        if (! $paragraph instanceof Paragraph) {
            return null;
        }

        $first = $paragraph->firstChild();
        if (! $first instanceof Text) {
            return null;
        }

        if (! preg_match('/^\[!(NOTE|WARNING)\]$/', $first->getLiteral(), $m)) {
            return null;
        }

        $next = $first->next();
        $first->detach();
        if ($next instanceof Newline) {
            $next->detach();
        }

        return [$m[1], $paragraph];
    }
}
