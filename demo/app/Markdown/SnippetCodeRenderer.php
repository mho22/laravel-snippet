<?php

declare(strict_types=1);

namespace App\Markdown;

use League\CommonMark\Extension\CommonMark\Node\Block\FencedCode;
use League\CommonMark\Node\Node;
use League\CommonMark\Renderer\ChildNodeRendererInterface;
use League\CommonMark\Renderer\NodeRendererInterface;

final class SnippetCodeRenderer implements NodeRendererInterface
{
    /** @var array<string, array{php: string, highlighted: string, preamble: string}> */
    public array $snippets = [];

    /**
     * Page-wide import pool: short-name (alias) → emitted `use ...;` statement.
     * Keyed by alias so two different FQNs sharing a short name don't clash
     * (`use App\Jobs\Middleware\RateLimited;` + `use Illuminate\Queue\Middleware\RateLimited;`
     * → PHP's "Cannot use X as Y because the name is already in use" fatal). Last
     * binding seen wins, matching docs reading order.
     *
     * @var array<string, string>
     */
    private array $pageImports = [];

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

        $literal = $node->getLiteral();
        $ownImports = $this->extractUseStatements($literal);
        // Preamble = page pool entries whose short-name isn't already bound in this fence.
        $preambleStatements = array_diff_key($this->pageImports, $ownImports);
        // Drop preamble entries whose alias collides with a top-level
        // `class|interface|trait|enum X { ... }` declared in this fence, or
        // with a non-compound `use X;` (e.g. `use Redis;` referencing a
        // global). Without this, PHP fatals "Cannot redeclare class X
        // (previously declared as local import)" / "Cannot use Y as X
        // because the name is already in use" the moment our injected
        // preamble lands ahead of the snippet's own declaration. Cause:
        // earlier fences on the page used the FQN form, e.g.
        // `use App\Mcp\Tools\CurrentWeatherTool;`, and the page pool
        // carried that forward into a later fence that re-declares
        // `class CurrentWeatherTool extends Tool { ... }`.
        $shadowed = array_merge(
            $this->extractDeclaredShortNames($literal),
            $this->extractNonCompoundUseNames($literal),
        );
        if ($shadowed !== []) {
            $shadowedSet = array_flip($shadowed);
            foreach ($preambleStatements as $key => $_) {
                $alias = substr((string) $key, (int) strpos((string) $key, ':') + 1);
                if (isset($shadowedSet[$alias])) {
                    unset($preambleStatements[$key]);
                }
            }
        }
        $preamble = $preambleStatements === []
            ? ''
            : implode(' ', $preambleStatements);
        // Merge this fence's imports into the page pool — its bindings now shadow
        // any earlier ones for subsequent fences.
        $this->pageImports = array_merge($this->pageImports, $ownImports);

        $id = 'snippet-'.count($this->snippets);
        $this->snippets[$id] = [
            'php' => $literal,
            'highlighted' => $highlighted,
            'preamble' => $preamble,
        ];

        return '<div class="laravel-snippet contains-code-blocks" data-snippet-id="'.$id.'"></div>';
    }

    /**
     * Pull every top-level `use Foo\Bar [as Alias];` / `use function Foo\bar;` / `use const Foo\BAR;`
     * statement from a fence's source. Returns alias-short-name → canonical `use ...;` string.
     * Anchored to column 0 to skip trait imports inside class bodies.
     *
     * Skips non-compound `use` statements (e.g. `use Exception;`) — they reference globals
     * and PHP warns "use statement with non-compound name 'X' has no effect."
     *
     * Grouped imports (`use Foo\{Bar, Baz};`) are expanded so each alias gets a key, but the
     * canonical statement remains the grouped form (less noisy to inject).
     *
     * @return array<string, string>
     */
    private function extractUseStatements(string $source): array
    {
        $found = [];
        if (! preg_match_all(
            '/^use\s+(function\s+|const\s+)?([\\\\\w\s,{}]+?)\s*;[ \t]*$/m',
            $source,
            $matches,
            PREG_SET_ORDER,
        )) {
            return $found;
        }
        foreach ($matches as $match) {
            $kind = trim($match[1] ?? ''); // '', 'function', or 'const'
            $body = trim($match[2]);
            // Group import: `Foo\{Bar, Baz as Q}`.
            if (preg_match('/^([\\\\\w]+)\\\\\\{([^}]+)\\}$/', $body, $g)) {
                $prefix = rtrim($g[1], '\\');
                $names = array_map('trim', explode(',', $g[2]));
                $expanded = [];
                foreach ($names as $name) {
                    $alias = $this->aliasOf($name);
                    if ($alias === null) {
                        continue;
                    }
                    $expanded[$alias] = $kind.':'.$alias;
                }
                // Emit canonical = `use Foo\{Bar, Baz};` (original line, semicolon restored).
                $canonical = 'use '.($kind === '' ? '' : $kind.' ').$body.';';
                foreach (array_keys($expanded) as $alias) {
                    $found[$kind.':'.$alias] = $canonical;
                }
                continue;
            }
            // Single import: maybe `Foo\Bar`, `Foo\Bar as Baz`, `Foo, Bar` (rare).
            $names = array_map('trim', explode(',', $body));
            foreach ($names as $name) {
                if ($name === '') {
                    continue;
                }
                $alias = $this->aliasOf($name);
                if ($alias === null) {
                    continue; // non-compound — skip to avoid "no effect" warning
                }
                $canonical = 'use '.($kind === '' ? '' : $kind.' ').$name.';';
                $found[$kind.':'.$alias] = $canonical;
            }
        }
        return $found;
    }

    /**
     * Top-level `class|interface|trait|enum X { ... }` short names declared in
     * the fence. Used to shadow page-pool preamble entries that would otherwise
     * bind X as an import in the same scope as the declaration.
     *
     * Anchored to column 0 — nested declarations inside a class/closure body
     * are indented and don't conflict with our injected preamble (the preamble
     * sits at file top, outside any block).
     *
     * @return list<string>
     */
    private function extractDeclaredShortNames(string $source): array
    {
        if (! preg_match_all(
            '/^(?:abstract\s+|final\s+|readonly\s+)*(?:class|interface|trait|enum)\s+(\w+)/m',
            $source,
            $matches,
        )) {
            return [];
        }
        return array_values(array_unique($matches[1]));
    }

    /**
     * Non-compound `use X;` short names — `use` statements without a backslash
     * and without an `as` clause. `extractUseStatements` deliberately skips
     * these because emitting them would warn "use statement with non-compound
     * name 'X' has no effect", but they still bind X locally, so a page-pool
     * preamble for X (`use Foo\Bar\X;`) would collide with the snippet's own
     * `use X;`.
     *
     * @return list<string>
     */
    private function extractNonCompoundUseNames(string $source): array
    {
        if (! preg_match_all(
            '/^use\s+(\w+)\s*;[ \t]*$/m',
            $source,
            $matches,
        )) {
            return [];
        }
        return array_values(array_unique($matches[1]));
    }

    /**
     * Extract the alias a `use` import binds. Returns null for non-compound names
     * (no backslash and no explicit `as`) — those reference globals and PHP warns.
     */
    private function aliasOf(string $entry): ?string
    {
        if (preg_match('/^([\\\\\w]+)\s+as\s+(\w+)$/i', $entry, $m)) {
            return $m[2];
        }
        if (! str_contains($entry, '\\')) {
            return null;
        }
        $parts = explode('\\', $entry);
        $last = end($parts);
        return is_string($last) && $last !== '' ? $last : null;
    }
}
