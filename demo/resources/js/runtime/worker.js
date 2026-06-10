import { loadWebRuntime } from '@php-wasm/web';
import { PHP, setPhpIniEntries } from '@php-wasm/universal';

const BUNDLE_URL = new URL('../laravel.zip', import.meta.url);
const BUNDLE_DIR = '/bundle';
const INIT_PATH = `${BUNDLE_DIR}/snippet-init.php`;
const CONTEXT_PATH = `${BUNDLE_DIR}/snippet-context.php`;
// Fixed VFS path reused per run — overwritten each time so the in-memory
// FS doesn't accumulate one file per snippet over a long session.
const SNIPPET_PATH = '/tmp/snippet.php';

function describeError(err) {
	if (err && typeof err === 'object') {
		return {
			message: err.message ?? String(err),
			stack: err.stack ?? null,
			name: err.name ?? null,
		};
	}
	return { message: String(err), stack: null, name: null };
}

self.addEventListener('error', (e) => {
	const detail = {
		message: e.message || '(no message)',
		filename: e.filename || null,
		lineno: e.lineno ?? null,
		colno: e.colno ?? null,
		error: e.error ? describeError(e.error) : null,
	};
	console.error('[snippet-worker] window.error:', detail, e);
	self.postMessage({ type: 'fatal', stage: 'error-event', ...detail });
});

self.addEventListener('unhandledrejection', (e) => {
	const detail = describeError(e.reason);
	console.error('[snippet-worker] unhandledrejection:', detail, e);
	self.postMessage({ type: 'fatal', stage: 'unhandledrejection', ...detail });
});

let php;
let initError = null;
try {
	const runtimeId = await loadWebRuntime('8.5', { extensions: ['intl'] });
	php = new PHP(runtimeId);
	// Parse errors fire at PHP compile time, before any ini_set in our
	// wrapper or any set_error_handler in snippet-init.php run. Setting
	// these at the SAPI level keeps PHP from rendering HTML-formatted
	// errors to stdout; the same text still reaches stderr in plain
	// form, where the snippet renderer displays it as an error line.
	await setPhpIniEntries(php, {
		display_errors: '0',
		html_errors: '0',
		// Suppress PHP's SAPI raw `PHP Fatal error: ...` line. The same
		// fatal still reaches Laravel's HandleExceptions::handleShutdown
		// → bound ExceptionHandler::renderForConsole, which writes a
		// clean one-line stderr in snippet-init.php's custom handler.
		// Without this, the raw line duplicates the rendered message.
		log_errors: '0',
	});
	await installBundle(php);
	self.postMessage({ type: 'ready' });
} catch (err) {
	initError = err;
	console.error('[snippet-worker] init failed:', err);
	self.postMessage({
		type: 'fatal',
		stage: 'init',
		message: err?.message ?? String(err),
		stack: err?.stack ?? null,
	});
}

self.onmessage = async (e) => {
	const { id, code, action = 'run' } = e.data;
	if (initError) {
		self.postMessage({
			type: 'fatal',
			stage: 'init',
			message: initError?.message ?? String(initError),
			stack: initError?.stack ?? null,
		});
		return;
	}
	if (action === 'tokenize') {
		await handleTokenize(id, code);
		return;
	}
	const { wrapper, snippetSource } = prepareCode(code);

	const tRunStart = performance.now();
	try {
		await php.writeFile(SNIPPET_PATH, snippetSource);
		const result = await php.run({ code: wrapper });
		reply(id, result, tRunStart);
	} catch (err) {
		if (err?.response) {
			reply(id, err.response, tRunStart);
			return;
		}
		self.postMessage({
			type: 'result',
			id,
			stdout: '',
			stderr: String(err?.message || err),
			exitCode: -1,
			tRun: performance.now() - tRunStart,
		});
	}
};

async function handleTokenize(id, code) {
	const hasOpenTag = /^<\?(?:php\b|=)/.test(code);
	const source = hasOpenTag ? code : `<?php\n${code}`;
	const b64 = btoa(unescape(encodeURIComponent(source)));
	const phpCode = `<?php
		error_reporting(0);
		$src = base64_decode('${b64}');
		$tokens = token_get_all($src);
		${hasOpenTag ? '' : 'array_shift($tokens);'}
		$out = [];
		foreach ($tokens as $t) {
			$out[] = is_array($t) ? [token_name($t[0]), $t[1]] : [null, $t];
		}
		echo json_encode($out);
	`;
	try {
		const result = await php.run({ code: phpCode });
		let tokens = null;
		try { tokens = JSON.parse(result.text); } catch {}
		self.postMessage({ type: 'tokens', id, tokens });
	} catch {
		self.postMessage({ type: 'tokens', id, tokens: null });
	}
}

async function installBundle(php) {
	const response = await fetch(BUNDLE_URL);
	if (!response.ok) {
		throw new Error(`Bundle fetch failed: ${response.status}`);
	}
	const zipBytes = new Uint8Array(await response.arrayBuffer());
	const zipPath = '/tmp/laravel-bundle.zip';
	await php.writeFile(zipPath, zipBytes);

	await php.run({
		code: `<?php
			$zip = new ZipArchive();
			if ($zip->open(${JSON.stringify(zipPath)}) !== TRUE) {
				fwrite(STDERR, 'Bundle unzip failed');
				exit(1);
			}
			$zip->extractTo(${JSON.stringify(BUNDLE_DIR)});
			$zip->close();
			unlink(${JSON.stringify(zipPath)});
		`,
	});
}

function stripPhpOpen(code) {
	return code.replace(/^\s*<\?php\s*\n?/, '');
}

function prepareCode(code) {
	// The snippet runs as its own VFS file via `require`, not as text spliced
	// into the wrapper. This buys three things:
	//   - top-level `return <expr>;` flows back as the require expression's
	//     value, so the auto-dump can render it (the inline-splice version
	//     silently dropped any `return` because it short-circuited the
	//     fall-through dump);
	//   - `use Illuminate\Foo;` declarations in the snippet sit at natural
	//     file-top scope, no closure wrap needed;
	//   - parse-error line numbers come from the snippet file directly, no
	//     "subtract wrapper-prelude" math downstream.
	// The snippet file is written verbatim — no trailing `return` or other
	// scaffolding. Appending anything risks PHP blaming our injected token
	// when the user's snippet is missing a `;` before EOF (the parse error
	// then reads "unexpected token return" pointing at our line, which
	// misleads anyone reading the report for upstream docs PRs).
	// To still distinguish "user explicitly returned" from "user fell
	// through", lean on PHP's built-in `require` semantics: an included
	// file with no explicit `return` evaluates the `require` expression to
	// integer 1. So `$__ret === 1` is our "no explicit return" signal.
	// The one edge case this conflates is a snippet that literally does
	// `return 1;` and defines no vars — it'll show empty output. In the
	// Laravel docs corpus that shape essentially doesn't occur, and the
	// alternative (always trust $__ret) would mis-display `1` for every
	// snippet that just runs side-effecting code without returning.
	// The init require sits inside an IIFE so its locals ($app, $dumper,
	// ...) don't leak into the snippet's `get_defined_vars()`. Framework
	// state lives on static properties (Facade::setFacadeApplication,
	// VarDumper::setHandler). The context require is NOT wrapped: its
	// locals ($user, $request, $browser, ...) are intentionally injected
	// into the snippet's scope. $__pre captures the pre-injected vars so
	// the auto-dump can ignore them.
	const wrapper = `<?php
namespace {
	ini_set('display_errors', '0');
	(static function (): void {
		require ${JSON.stringify(INIT_PATH)};
	})();

	// The pre-scan that populates \$GLOBALS['__declared_classes'] runs
	// inside snippet-init.php (before Laravel bootstrap), so both
	// bootstrap/providers.php and snippet-context.php can read it. No
	// per-snippet work needed here in the wrapper.

	require ${JSON.stringify(CONTEXT_PATH)};
	$__pre = get_defined_vars();

	// Tinker/REPL-style auto-dump: rewrite bare top-level expression
	// statements (e.g. \`Str::unwrap('-x-', '-');\`) to wrap their result
	// in __autodump_value(...) so a non-null return is rendered. The
	// rewriter (defined in snippet-init.php) bails on snippets that
	// already produce explicit output, so echo/dump/dd/return paths are
	// untouched. Insertions add no newlines, so error line numbers stay
	// aligned with the source the user sees.
	$__rewritten = \\__autodump_rewrite(file_get_contents(${JSON.stringify(SNIPPET_PATH)}));
	if ($__rewritten !== null) {
		file_put_contents(${JSON.stringify(SNIPPET_PATH)}, $__rewritten);
	}

	$__ret = require ${JSON.stringify(SNIPPET_PATH)};

	// Auto-dump: dump the last user-defined variable so something
	// meaningful appears when the snippet ends without explicit output.
	// Underscore-prefix filter covers superglobals ($_SERVER, ...) and
	// our scratch vars ($__pre, $__ret, $__vars, $__last). Vars injected
	// by snippet-context.php pass through only if the snippet reassigned
	// them — comparing by !== gives object identity for instances and
	// value-or-type difference for scalars/arrays.
	$__vars = array_filter(
		get_defined_vars(),
		static fn ($v, string $n): bool =>
			$n[0] !== '_'
			&& $n !== 'GLOBALS'
			&& $n !== 'argv'
			&& $n !== 'argc'
			&& (!array_key_exists($n, $__pre) || $__pre[$n] !== $v),
		ARRAY_FILTER_USE_BOTH
	);
	if ($__ret !== 1) {
		dump($__ret);
	} else {
		$__last = array_key_last($__vars);
		if ($__last !== null) {
			dump($__vars[$__last]);
		}
	}
}
`;
	const snippetSource = `<?php\n${stripPhpOpen(code)}\n`;
	return { wrapper, snippetSource };
}

function reply(id, response, tRunStart) {
	self.postMessage({
		type: 'result',
		id,
		stdout: response.text,
		stderr: response.errors,
		exitCode: response.exitCode,
		tRun: performance.now() - tRunStart,
	});
}
