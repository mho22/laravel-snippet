<?php

declare(strict_types=1);

/**
 * Triage the residual no-output snippets after the auto-dump fix.
 * Run from demo/: php tests/browser/analyze-no-output.php
 *
 * Loads tests/browser/report.json, walks each no-output entry,
 * pulls the corresponding PHP fence from resources/markdown/13.x/<page>.md
 * (fence index = N-th ```php block, matching SnippetCodeRenderer), then
 * classifies by shape — what does the top-level structure of the snippet
 * actually do.
 *
 * Output: grouped counts + a few representative sources per category.
 */

const ROOT = __DIR__ . '/../../';
const REPORT = ROOT . 'tests/browser/report.json';
const MD_DIR = ROOT . 'resources/markdown/13.x';

function extract_php_fences(string $md): array
{
    $fences = [];
    $offset = 0;
    while (true) {
        $start = strpos($md, '```php', $offset);
        if ($start === false) break;
        $bodyStart = strpos($md, "\n", $start);
        if ($bodyStart === false) break;
        $bodyStart++;
        $end = strpos($md, '```', $bodyStart);
        if ($end === false) break;
        $fences[] = rtrim(substr($md, $bodyStart, $end - $bodyStart), "\n");
        $offset = $end + 3;
    }
    return $fences;
}

function classify(string $src): string
{
    // Fence bodies sometimes start with their own `<?php` opener; double-
    // tagging would cause the lexer to see `<`, `?`, `php` as code after
    // the prepended tag. Strip a leading `<?php` if present, then add ours.
    $trimmed = ltrim($src);
    if (str_starts_with($trimmed, '<?php')) {
        $trimmed = substr($trimmed, 5);
    }
    $code = "<?php\n" . $trimmed;
    $tokens = @token_get_all($code);
    if (! $tokens) return 'parse-error';

    $skip = [T_WHITESPACE, T_COMMENT, T_DOC_COMMENT, T_OPEN_TAG];

    // Top-level statement classification: walk depth-0 tokens, collect
    // the kind of each top-level statement (declaration, expression call,
    // etc.). Then bucket by combination.
    $depth = 0; $paren = 0; $bracket = 0;
    $stmtFirsts = [];
    $current = null;
    $n = count($tokens);

    for ($i = 0; $i < $n; $i++) {
        $t = $tokens[$i];
        if (is_array($t)) {
            if (in_array($t[0], $skip, true)) continue;
            if ($depth === 0 && $paren === 0 && $bracket === 0 && $current === null) {
                $current = $t;
            }
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
                    if ($current !== null) {
                        $stmtFirsts[] = $current;
                    }
                    $current = null;
                }
                break;
        }
    }

    // Class / interface / trait / enum / function declarations end with
    // `}` at depth 0, not `;`. If $current is still set at EOF, treat the
    // residual block as the final statement-first.
    if ($current !== null) {
        $stmtFirsts[] = $current;
    }

    if (! $stmtFirsts) {
        // Might be a class/function body with no semicolons at top level
        // (e.g., a bare `class Foo {}` statement — but PHP usually parses
        // this with the closing `}` as statement end; check raw text).
        if (preg_match('/^\s*(<\?php\s*)?(namespace\s+[\w\\\\]+\s*;\s*)?\s*(?:abstract\s+|final\s+|readonly\s+)*(class|interface|trait|enum)\s/i', $code)) {
            return 'decl-only-class';
        }
        return 'no-statements';
    }

    // Tag each top-level statement.
    $tags = [];
    foreach ($stmtFirsts as $f) {
        $tags[] = match (true) {
            $f[0] === T_NAMESPACE => 'namespace',
            $f[0] === T_USE => 'use',
            $f[0] === T_CLASS, $f[0] === T_INTERFACE, $f[0] === T_TRAIT, $f[0] === T_ENUM => 'decl',
            $f[0] === T_ABSTRACT, $f[0] === T_FINAL, $f[0] === T_READONLY => 'decl-modifier',
            $f[0] === T_FUNCTION => 'function-decl',
            $f[0] === T_IF, $f[0] === T_FOR, $f[0] === T_FOREACH, $f[0] === T_WHILE, $f[0] === T_DO, $f[0] === T_SWITCH, $f[0] === T_TRY => 'control-flow',
            $f[0] === T_RETURN => 'top-return',
            $f[0] === T_ECHO, $f[0] === T_PRINT => 'echo',
            $f[0] === T_THROW => 'throw',
            $f[0] === T_VARIABLE => 'var-stmt',
            $f[0] === T_STRING => 'call-stmt',
            $f[0] === T_NS_SEPARATOR => 'call-stmt',
            $f[0] === T_NAME_QUALIFIED, $f[0] === T_NAME_FULLY_QUALIFIED => 'call-stmt',
            $f[0] === T_NEW => 'new-stmt',
            default => 'other:' . token_name($f[0]),
        };
    }

    // Bucket.
    $set = array_unique($tags);
    sort($set);
    $signature = implode('+', $set);

    return match (true) {
        // Pure declarations — class/interface/trait/enum bodies, optionally
        // with leading namespace and/or use imports.
        $signature === 'decl', $signature === 'namespace',
        $signature === 'decl+namespace', $signature === 'decl+use',
        $signature === 'decl+namespace+use', $signature === 'function-decl',
        $signature === 'function-decl+namespace', $signature === 'function-decl+use',
        $signature === 'function-decl+namespace+use'
            => 'decl-only',

        // Just imports, nothing else — should never appear (snippets like
        // this would have been counted by the renderer but produce no real
        // output legitimately).
        $signature === 'use' => 'use-only',

        // Bare call statements that the auto-dump wrapped, but the call
        // returned null — true void mutators (Cache::flush(), Str::createRandomStringsNormally(), …).
        $signature === 'call-stmt' => 'void-call',

        // Single var-stmt (assignment) — the var was either already in
        // $__pre (so diff filter dropped it) or was an existing context var
        // reassigned to the same value.
        $signature === 'var-stmt' => 'var-stmt-only',

        // Control flow with no return at top — if/for/foreach branches
        // whose effects don't escape.
        $signature === 'control-flow' => 'control-flow-only',
        $signature === 'control-flow+var-stmt' => 'control-flow+var',

        // Throw, echo, top-return — these should have produced output,
        // so this category is genuinely interesting (potential harness bug).
        $signature === 'throw' => 'throw-only',
        $signature === 'echo' => 'echo-only',
        $signature === 'top-return' => 'top-return-only',

        default => 'mixed:' . $signature,
    };
}

$report = json_decode(file_get_contents(REPORT), true);
$noOutput = array_values(array_filter($report, fn($e) => $e['bucket'] === 'no-output'));

// Cache markdown fences per page.
$cache = [];
$missing = 0;
$buckets = [];
$samples = [];

foreach ($noOutput as $e) {
    $page = $e['page'];
    $idx = $e['index'];
    if (! isset($cache[$page])) {
        $path = MD_DIR . "/$page.md";
        $cache[$page] = file_exists($path) ? extract_php_fences(file_get_contents($path)) : [];
    }
    $fences = $cache[$page];
    if (! isset($fences[$idx])) {
        $missing++;
        $tag = 'source-not-found';
    } else {
        $tag = classify($fences[$idx]);
    }
    $buckets[$tag] = ($buckets[$tag] ?? 0) + 1;
    if (! isset($samples[$tag])) $samples[$tag] = [];
    if (count($samples[$tag]) < 3) {
        $samples[$tag][] = [
            'page' => $page,
            'index' => $idx,
            'src' => isset($fences[$idx]) ? trim($fences[$idx]) : '(not found)',
        ];
    }
}

arsort($buckets);
printf("Total no-output: %d  (source-not-found: %d)\n\n", count($noOutput), $missing);
printf("%-26s %6s\n", 'Category', 'Count');
printf("%-26s %6s\n", str_repeat('-', 26), '-----');
foreach ($buckets as $k => $v) {
    printf("%-26s %6d\n", $k, $v);
}

echo "\n=== Samples (first 3 per category) ===\n";
foreach ($buckets as $cat => $_) {
    echo "\n## $cat\n";
    foreach ($samples[$cat] as $s) {
        echo "  {$s['page']} #{$s['index']}:\n";
        $lines = explode("\n", $s['src']);
        $preview = array_slice($lines, 0, 8);
        foreach ($preview as $l) echo "    | $l\n";
        if (count($lines) > 8) echo "    | …(" . (count($lines) - 8) . " more lines)\n";
    }
}
