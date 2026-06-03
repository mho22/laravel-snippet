import { loadWebRuntime } from '@php-wasm/web';
import { PHP } from '@php-wasm/universal';

const BUNDLE_URL = '/laravel.zip';
const BUNDLE_DIR = '/bundle';
const INIT_PATH = `${BUNDLE_DIR}/init.php`;

const runtimeId = await loadWebRuntime('8.4');
const php = new PHP(runtimeId);
await installBundle(php);

self.postMessage({ type: 'ready' });

self.onmessage = async (e) => {
	const { id, code, action = 'run' } = e.data;
	if (action === 'tokenize') {
		await handleTokenize(id, code);
		return;
	}
	const phpCode = prepareCode(code);

	const tRunStart = performance.now();
	try {
		const result = await php.run({ code: phpCode });
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
	// Wrap the init.php require in an IIFE so its locals ($app, $dumper, ...)
	// don't leak into the snippet's `get_defined_vars()`. Framework state lives
	// on static properties (Facade::setFacadeApplication, VarDumper::setHandler).
	// Both sections use bracketed `namespace { ... }` because PHP requires
	// uniform syntax once any namespace block is bracketed.
	const init = `namespace {
		ini_set('display_errors', '0');
		(static function (): void {
			require ${JSON.stringify(INIT_PATH)};
		})();
	}`;
	// Auto-dump: if the snippet ended without explicit output, dump the last
	// user-defined variable so something meaningful appears in the panel.
	// The `_` prefix check covers both superglobals ($_SERVER, $_ENV, …) and
	// our own scratch vars (`$__vars`, `$__last`).
	const snippet = `namespace {
${stripPhpOpen(code)}
$__vars = array_filter(
	get_defined_vars(),
	static fn (string $n): bool => $n[0] !== '_' && $n !== 'GLOBALS' && $n !== 'argv' && $n !== 'argc',
	ARRAY_FILTER_USE_KEY
);
$__last = array_key_last($__vars);
if ($__last !== null) {
	dump($__vars[$__last]);
}
}`;
	return `<?php\n${init}\n${snippet}\n`;
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
