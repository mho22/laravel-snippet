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

    /**
     * Page-wide variable pool: var name (no `$`) → last top-level `$var = …;`
     * statement seen on the page. Docs commonly use a "setup fence + usage
     * fences" shape:
     *
     *     ```php
     *     $collection = collect([ ['name'=>'Diego','age'=>23], … ]);
     *     $collection->firstWhere('name', 'Diego');
     *     ```
     *     ```php
     *     $collection->firstWhere('age', '>=', 18);   // ← needs the setup
     *     ```
     *
     * The second fence references `$collection` but doesn't redefine it; the
     * pre-injected `snippet-context.php` `$collection = collect([1,2,3,4,5])`
     * doesn't have an `age` field, so `firstWhere('age', '>=', 18)` returns
     * null and the snippet renders "(no output)". Carrying the prior fence's
     * `$collection = …;` forward as preamble re-creates the docs-intended
     * data shape. Last-write-wins per docs reading order.
     *
     * @var array<string, string>
     */
    private array $pageAssignments = [];

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
        // Variable pool: inject the latest top-level `$var = …;` for every
        // `$var` this fence references but doesn't (re)define itself. Keeps
        // sequential firstWhere/where/flatMap-style usage fences working
        // without each having to repeat the data setup.
        $ownAssignments = $this->extractTopLevelAssignments($literal);
        $referenced = $this->extractReferencedVariableNames($literal);
        $assignmentPreamble = [];
        foreach (array_keys($referenced) as $varName) {
            if (isset($ownAssignments[$varName])) {
                continue;
            }
            if (isset($this->pageAssignments[$varName])) {
                $assignmentPreamble[] = $this->pageAssignments[$varName];
            }
        }

        $preambleParts = array_merge(array_values($preambleStatements), $assignmentPreamble);
        $preamble = $preambleParts === []
            ? ''
            : implode(' ', $preambleParts);
        // Merge this fence's imports + assignments into the page pool — its
        // bindings now shadow any earlier ones for subsequent fences.
        $this->pageImports = array_merge($this->pageImports, $ownImports);
        $this->pageAssignments = array_merge($this->pageAssignments, $ownAssignments);

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
     * Top-level `$var = …;` statements from the fence — assignments whose
     * `$var` is the first non-whitespace token of a statement at brace/paren/
     * bracket depth zero. The result is keyed by var name (no `$`) and maps
     * to the verbatim assignment statement (used as preamble in subsequent
     * fences). Compound assignment operators (`+=`, `??=`, etc.) and
     * comparison/arrow (`==`, `===`, `=>`) are deliberately skipped — only
     * plain `=` defines the variable's value as fresh setup data.
     *
     * @return array<string, string>
     */
    private function extractTopLevelAssignments(string $source): array
    {
        // CommonMark hands us a fenced-code literal without `<?php`. The
        // tokenizer treats anything before the open tag as T_INLINE_HTML, so
        // we prepend the marker before scanning.
        $tokens = @token_get_all('<?php '.$source);
        if (! $tokens) {
            return [];
        }
        $n = count($tokens);
        $startIdx = 0;
        for ($i = 0; $i < $n; $i++) {
            if (is_array($tokens[$i]) && $tokens[$i][0] === T_OPEN_TAG) {
                $startIdx = $i + 1;
                break;
            }
        }

        $skip = [T_WHITESPACE, T_COMMENT, T_DOC_COMMENT];
        $depth = 0;
        $paren = 0;
        $bracket = 0;
        $stmtStart = $startIdx;
        $stmts = [];
        for ($i = $startIdx; $i < $n; $i++) {
            $t = $tokens[$i];
            if (is_array($t)) {
                continue;
            }
            switch ($t) {
                case '{': $depth++; break;
                case '}': $depth--; break;
                case '(': $paren++; break;
                case ')': $paren--; break;
                case '[': $bracket++; break;
                case ']': $bracket--; break;
                case ';':
                    if ($depth === 0 && $paren === 0 && $bracket === 0) {
                        $stmts[] = [$stmtStart, $i];
                        $stmtStart = $i + 1;
                    }
                    break;
            }
        }

        $assignments = [];
        foreach ($stmts as [$start, $end]) {
            $firstIdx = null;
            for ($i = $start; $i < $end; $i++) {
                $t = $tokens[$i];
                if (is_array($t) && in_array($t[0], $skip, true)) {
                    continue;
                }
                $firstIdx = $i;
                break;
            }
            if ($firstIdx === null) {
                continue;
            }
            $first = $tokens[$firstIdx];
            if (! is_array($first) || $first[0] !== T_VARIABLE) {
                continue;
            }
            $nextIdx = null;
            for ($j = $firstIdx + 1; $j < $end; $j++) {
                $t2 = $tokens[$j];
                if (is_array($t2) && in_array($t2[0], $skip, true)) {
                    continue;
                }
                $nextIdx = $j;
                break;
            }
            if ($nextIdx === null || $tokens[$nextIdx] !== '=') {
                continue;
            }
            $stmtText = '';
            for ($k = $start; $k <= $end; $k++) {
                $stmtText .= is_array($tokens[$k]) ? $tokens[$k][1] : $tokens[$k];
            }
            $varName = substr($first[1], 1);
            $assignments[$varName] = ltrim($stmtText);
        }
        return $assignments;
    }

    /**
     * Set of `$var` names (without `$`) appearing anywhere in the fence.
     * Tokenizer-based so `$collection` inside `"text $collection"` strings,
     * comments, etc. is counted/not-counted correctly — `token_get_all`
     * emits T_VARIABLE only for real variable tokens. `$this` is excluded
     * because there's no meaningful page-pool definition for it.
     *
     * @return array<string, bool>
     */
    private function extractReferencedVariableNames(string $source): array
    {
        $tokens = @token_get_all('<?php '.$source);
        if (! $tokens) {
            return [];
        }
        $names = [];
        foreach ($tokens as $t) {
            if (is_array($t) && $t[0] === T_VARIABLE && $t[1] !== '$this') {
                $names[substr($t[1], 1)] = true;
            }
        }
        return $names;
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
