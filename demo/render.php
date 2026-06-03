<?php

declare(strict_types=1);

require __DIR__ . '/vendor/autoload.php';

use League\CommonMark\Environment\Environment;
use League\CommonMark\Extension\Attributes\AttributesExtension;
use League\CommonMark\Extension\CommonMark\CommonMarkCoreExtension;
use League\CommonMark\Extension\CommonMark\Node\Block\BlockQuote;
use League\CommonMark\Extension\CommonMark\Node\Block\FencedCode;
use League\CommonMark\Node\Block\Paragraph;
use League\CommonMark\Node\Inline\Newline;
use League\CommonMark\Node\Inline\Text;
use League\CommonMark\Node\Node;
use League\CommonMark\Parser\MarkdownParser;
use League\CommonMark\Renderer\ChildNodeRendererInterface;
use League\CommonMark\Renderer\HtmlRenderer;
use League\CommonMark\Renderer\NodeRendererInterface;

const TORCHLIGHT_CACHE_DIR = __DIR__ . '/.torchlight-cache';
// Match laravel.com's docs: `data-theme="olaolu-palenight"` in their HTML.
const TORCHLIGHT_THEME = 'olaolu-palenight';

function renderMarkdown(string $markdown): string
{
	// Core CommonMark only — GithubFlavoredMarkdownExtension bundles
	// DisallowedRawHtmlExtension, which escapes the load-bearing `<style>`
	// blocks laravel/docs uses for the CSS-columns method list. None of
	// GFM's other extensions (tables, strikethrough, tasklists, autolinks)
	// are used in collections.md.
	// AttributesExtension handles laravel/docs' Kramdown-style attribute
	// lists, e.g. `#### `after()` {.collection-method .first-collection-method}`.
	$environment = (new Environment())
		->addExtension(new CommonMarkCoreExtension())
		->addExtension(new AttributesExtension())
		->addRenderer(FencedCode::class, new SnippetCodeRenderer())
		->addRenderer(BlockQuote::class, new CalloutBlockQuoteRenderer());

	$document = (new MarkdownParser($environment))->parse($markdown);

	// Walk the AST once to collect every fenced code block, then batch-request
	// Torchlight for any blocks not already on disk. The renderer reads the
	// highlighted HTML back off each node via its `data` bag.
	$missing = [];
	foreach ($document->iterator() as $node) {
		if (! $node instanceof FencedCode) continue;
		$language = $node->getInfo() ?: 'text';
		$source = $node->getLiteral();
		$id = sha1($language . "\0" . TORCHLIGHT_THEME . "\0" . $source);
		$cached = readTorchlightCache($id);
		if ($cached !== null) {
			$node->data->set('torchlight', $cached);
		} else {
			$missing[] = ['id' => $id, 'language' => $language, 'code' => $source, 'node' => $node];
		}
	}
	if ($missing !== []) {
		$payload = array_map(
			static fn (array $b): array => [
				'id' => $b['id'],
				'language' => $b['language'],
				'theme' => TORCHLIGHT_THEME,
				'code' => $b['code'],
			],
			$missing,
		);
		$blocks = torchlightFetch($payload);
		foreach ($missing as $i => $entry) {
			$result = $blocks[$i] ?? null;
			if ($result === null) continue;
			writeTorchlightCache($entry['id'], $result);
			$entry['node']->data->set('torchlight', $result);
		}
	}

	return (new HtmlRenderer($environment))->renderDocument($document)->getContent();
}

final class SnippetCodeRenderer implements NodeRendererInterface
{
	public function render(Node $node, ChildNodeRendererInterface $childRenderer): string
	{
		assert($node instanceof FencedCode);
		$language = $node->getInfo() ?: 'text';
		$torchlight = $node->data->get('torchlight', null);
		$highlighted = is_array($torchlight) && isset($torchlight['highlighted'])
			? $torchlight['highlighted']
			: htmlspecialchars($node->getLiteral(), ENT_QUOTES);
		$classes = $torchlight['classes'] ?? '';
		$styles = $torchlight['styles'] ?? '';

		$pre = sprintf(
			'<pre><code data-lang="%s" class="%s" style="%s">%s</code></pre>',
			htmlspecialchars($language, ENT_QUOTES),
			htmlspecialchars($classes, ENT_QUOTES),
			htmlspecialchars($styles, ENT_QUOTES),
			$highlighted,
		);

		if ($language !== 'php') {
			return '<div class="code-block-wrapper">' . $pre . '</div>';
		}

		// PHP fences become runnable snippets. The custom-element wears
		// `contains-code-blocks` so laravel.com's `> .code-block-wrapper` rules
		// bind to the inner wrapper just like they would at the page level.
		// Inside <script> the parser is in script-data mode — only `</script>`
		// needs escaping.
		$rawSource = preg_replace('#</script>#i', '<\/script>', $node->getLiteral());
		return '<laravel-snippet class="contains-code-blocks">'
			. '<div class="code-block-wrapper">' . $pre . renderControls() . '</div>'
			. '<script type="application/x-php">' . "\n" . $rawSource . '</script>'
			. '</laravel-snippet>';
	}
}

final class CalloutBlockQuoteRenderer implements NodeRendererInterface
{
	// GitHub-alert syntax (`> [!NOTE]`, `> [!WARNING]`) is parsed by CommonMark
	// as a plain BlockQuote with `[!TYPE]` leaking into the body. Laravel.com
	// renders each as a coloured callout box with an inline SVG icon. Mirror
	// that markup here. Other alert types (TIP/IMPORTANT/CAUTION) aren't used
	// in collections.md; extend CALLOUTS when they appear.
	private const CALLOUTS = [
		'NOTE' => ['color' => '#8D54C5', 'svg' => 'callout-note.svg'],
		'WARNING' => ['color' => '#F53003', 'svg' => 'callout-warning.svg'],
	];

	public function render(Node $node, ChildNodeRendererInterface $childRenderer): string
	{
		assert($node instanceof BlockQuote);

		$callout = $this->extractCallout($node);
		if ($callout === null) {
			return '<blockquote>' . $childRenderer->renderNodes($node->children()) . '</blockquote>';
		}

		[$type, $paragraph] = $callout;
		$color = self::CALLOUTS[$type]['color'];
		$svg = trim((string) file_get_contents(__DIR__ . '/partials/' . self::CALLOUTS[$type]['svg']));
		$body = $childRenderer->renderNodes($paragraph->children());

		return '<div class="flex flex-col p-3 mb-10 space-y-4 text-base leading-normal border rounded-md lg:px-4 lg:flex-row lg:space-y-0 lg:space-x-4 border-sand-light-5 callout dark:border-sand-dark-5 dark:text-sand-light-3 text-sand-dark-3">'
			. '<div class="w-8 h-8 p-2 lg:my-1.5 rounded-xs flex items-center justify-center shrink-0 bg-[' . $color . ']">'
			. $svg
			. '</div>'
			. '<p class="callout text-pretty">' . $body . '</p>'
			. '</div>';
	}

	/**
	 * @return array{0: string, 1: Paragraph}|null
	 */
	private function extractCallout(BlockQuote $node): ?array
	{
		$paragraph = $node->firstChild();
		if (! $paragraph instanceof Paragraph) return null;

		$first = $paragraph->firstChild();
		if (! $first instanceof Text) return null;

		if (! preg_match('/^\[!(NOTE|WARNING)\]$/', $first->getLiteral(), $m)) {
			return null;
		}

		// Drop the `[!TYPE]` token and the softbreak that follows it so the
		// body text starts cleanly inside the rendered `<p class="callout">`.
		$next = $first->next();
		$first->detach();
		if ($next instanceof Newline) $next->detach();

		return [$m[1], $paragraph];
	}
}

function renderControls(): string
{
	$copy = trim((string) file_get_contents(__DIR__ . '/partials/copy.svg'));
	$play = trim((string) file_get_contents(__DIR__ . '/partials/play.svg'));
	return '<div class="laravel-snippet__controls">'
		. '<span class="laravel-snippet__status"></span>'
		. '<button type="button" class="laravel-snippet__btn laravel-snippet__copy" aria-label="Copy code">' . $copy . '</button>'
		. '<button type="button" class="laravel-snippet__btn laravel-snippet__run" aria-label="Run snippet">' . $play . '</button>'
		. '</div>';
}

function torchlightFetch(array $blocks): array
{
	$token = getenv('TORCHLIGHT_TOKEN');
	if ($token === false || $token === '') {
		throw new RuntimeException('TORCHLIGHT_TOKEN missing — populate project/.env');
	}
	$ch = curl_init('https://api.torchlight.dev/highlight');
	curl_setopt_array($ch, [
		CURLOPT_POST => true,
		CURLOPT_HTTPHEADER => [
			'Authorization: Bearer ' . $token,
			'Content-Type: application/json',
		],
		CURLOPT_POSTFIELDS => json_encode(['blocks' => $blocks], JSON_THROW_ON_ERROR),
		CURLOPT_RETURNTRANSFER => true,
		CURLOPT_TIMEOUT => 30,
	]);
	$response = curl_exec($ch);
	$status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
	if ($status !== 200) {
		throw new RuntimeException("Torchlight API $status: $response");
	}
	return json_decode((string) $response, true, flags: JSON_THROW_ON_ERROR)['blocks'] ?? [];
}

function readTorchlightCache(string $id): ?array
{
	$path = TORCHLIGHT_CACHE_DIR . '/' . $id . '.json';
	if (! is_file($path)) return null;
	$decoded = json_decode((string) file_get_contents($path), true);
	return is_array($decoded) ? $decoded : null;
}

function writeTorchlightCache(string $id, array $block): void
{
	if (! is_dir(TORCHLIGHT_CACHE_DIR)) {
		mkdir(TORCHLIGHT_CACHE_DIR, 0777, true);
	}
	file_put_contents(
		TORCHLIGHT_CACHE_DIR . '/' . $id . '.json',
		json_encode($block, JSON_THROW_ON_ERROR | JSON_PRETTY_PRINT),
	);
}

function loadEnv(string $path): void
{
	if (! is_file($path)) return;
	foreach (file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
		if (str_starts_with(ltrim($line), '#')) continue;
		[$key, $value] = array_pad(explode('=', $line, 2), 2, '');
		$value = trim($value, "\"' \t");
		if ($key !== '' && getenv($key) === false) putenv("$key=$value");
	}
}
