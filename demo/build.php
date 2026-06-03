<?php

declare(strict_types=1);

require __DIR__ . '/render.php';

loadEnv(__DIR__ . '/.env');

const PARTIALS_DIR = __DIR__ . '/partials';
const PAGE_FILE = __DIR__ . '/collections.md';

$markdown = (string) file_get_contents(PAGE_FILE);
$content = renderMarkdown($markdown);

// Page title = first H1 of the source markdown.
preg_match('/^#\s+(.+)$/m', $markdown, $titleMatch);
$title = $titleMatch[1] ?? 'Docs';

$shell = (string) file_get_contents(PARTIALS_DIR . '/shell.html');
echo strtr($shell, [
	'{{title}}'       => htmlspecialchars($title, ENT_QUOTES),
	'{{theme_fouc}}'  => (string) file_get_contents(PARTIALS_DIR . '/theme.js'),
	'{{snippet_css}}' => (string) file_get_contents(PARTIALS_DIR . '/snippet.css'),
	'{{header}}'      => (string) file_get_contents(PARTIALS_DIR . '/header.html'),
	'{{sidebar}}'     => (string) file_get_contents(PARTIALS_DIR . '/sidebar.html'),
	'{{right_rail}}'  => (string) file_get_contents(PARTIALS_DIR . '/right-rail.html'),
	'{{content}}'     => $content,
]);
