const workerUrl = new URL('./worker.js', import.meta.url);

let workerPromise = null;
const pending = new Map();
let nextId = 0;

function getWorker() {
	if (workerPromise) return workerPromise;
	workerPromise = new Promise((resolve, reject) => {
		const worker = new Worker(workerUrl, { type: 'module' });
		const onReady = (e) => {
			if (e.data.type !== 'ready') return;
			worker.removeEventListener('message', onReady);
			worker.addEventListener('message', (event) => {
				const t = event.data.type;
				if (t !== 'result' && t !== 'tokens') return;
				const callback = pending.get(event.data.id);
				if (!callback) return;
				pending.delete(event.data.id);
				callback(event.data);
			});
			resolve(worker);
		};
		worker.addEventListener('message', onReady);
		worker.addEventListener('error', reject);
	});
	return workerPromise;
}

async function runPhp(code) {
	const worker = await getWorker();
	const id = ++nextId;
	return new Promise((resolve) => {
		pending.set(id, resolve);
		worker.postMessage({ id, code });
	});
}

async function runTokenize(code) {
	const worker = await getWorker();
	const id = ++nextId;
	return new Promise((resolve) => {
		pending.set(id, resolve);
		worker.postMessage({ id, code, action: 'tokenize' });
	});
}

// Symfony CliDumper ANSI codes → Palenight hex (matches torchlight on input).
const ANSI_COLOR = {
	'1;38;5;38': '#82AAFF',  // num — blue
	'1;38;5;113': '#C3E88D', // str — green
	'1;38;5;208': '#F78C6C', // const — orange
	'38;5;38': '#82AAFF',    // note / index — blue (class names, indices)
	'38;5;113': '#C3E88D',   // key — green
	'38;5;170': '#C792EA',   // meta — purple
	'38;5;208': '#F78C6C',   // default — orange
	'38;5;247': '#676E95',   // ref — grey
};

function escapeHtml(s) {
	return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
}

function ansiToHtml(text) {
	const out = [];
	let cursor = 0;
	let openSpan = false;
	const ansiRe = /\x1b\[([0-9;]*)m/g;
	let m;
	while ((m = ansiRe.exec(text)) !== null) {
		if (m.index > cursor) out.push(escapeHtml(text.slice(cursor, m.index)));
		const code = m[1];
		if (openSpan) {
			out.push('</span>');
			openSpan = false;
		}
		if (code !== '' && code !== '0' && code !== '39') {
			const color = ANSI_COLOR[code] || '#BFC7D5';
			out.push(`<span style="color:${color}">`);
			openSpan = true;
		}
		cursor = m.index + m[0].length;
	}
	if (cursor < text.length) out.push(escapeHtml(text.slice(cursor)));
	if (openSpan) out.push('</span>');
	return out.join('');
}

const CHECK_SVG = `<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"/></svg>`;
const RESET_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`;

const PALENIGHT = {
	variable: '#BEC5D4',
	string:   '#C3E88D',
	number:   '#F78C6C',
	comment:  '#676E95',
	keyword:  '#C792EA',
	function: '#82AAFF',
	arrow:    '#89DDFF',
	literal:  '#FF5874',
	default:  '#BFC7D5',
};

const PHP_KEYWORD_TOKENS = new Set([
	'T_FUNCTION', 'T_RETURN', 'T_IF', 'T_ELSE', 'T_ELSEIF', 'T_FOR',
	'T_FOREACH', 'T_WHILE', 'T_DO', 'T_SWITCH', 'T_CASE', 'T_DEFAULT',
	'T_BREAK', 'T_CONTINUE', 'T_CLASS', 'T_INTERFACE', 'T_TRAIT',
	'T_EXTENDS', 'T_IMPLEMENTS', 'T_NEW', 'T_USE', 'T_NAMESPACE', 'T_TRY',
	'T_CATCH', 'T_FINALLY', 'T_THROW', 'T_ECHO', 'T_PRINT', 'T_VAR',
	'T_PUBLIC', 'T_PROTECTED', 'T_PRIVATE', 'T_STATIC', 'T_ABSTRACT',
	'T_FINAL', 'T_CONST', 'T_AS', 'T_INSTANCEOF', 'T_FN', 'T_YIELD',
	'T_REQUIRE', 'T_REQUIRE_ONCE', 'T_INCLUDE', 'T_INCLUDE_ONCE',
	'T_ARRAY', 'T_LIST', 'T_ISSET', 'T_UNSET', 'T_EMPTY', 'T_GLOBAL',
	'T_ENUM', 'T_MATCH', 'T_READONLY', 'T_CALLABLE',
]);

const PHP_ARROW_TOKENS = new Set([
	'T_OBJECT_OPERATOR', 'T_NULLSAFE_OBJECT_OPERATOR', 'T_DOUBLE_ARROW',
	'T_PAAMAYIM_NEKUDOTAYIM', 'T_NS_SEPARATOR',
	'T_OPEN_TAG', 'T_OPEN_TAG_WITH_ECHO', 'T_CLOSE_TAG',
]);

const PHP_LITERAL_IDENTIFIERS = new Set([
	'null', 'true', 'false', 'NULL', 'TRUE', 'FALSE',
]);

const PHP_PUNCT_OPERATORS = '=+-*/<>!.&|^~%?:';

function colorForToken(token, next) {
	const [name, text] = token;
	if (name === 'T_VARIABLE') return PALENIGHT.variable;
	if (name === 'T_LNUMBER' || name === 'T_DNUMBER') return PALENIGHT.number;
	if (name === 'T_CONSTANT_ENCAPSED_STRING') return PALENIGHT.string;
	if (name === 'T_ENCAPSED_AND_WHITESPACE') return PALENIGHT.string;
	if (name === 'T_COMMENT' || name === 'T_DOC_COMMENT') return PALENIGHT.comment;
	if (PHP_KEYWORD_TOKENS.has(name)) return PALENIGHT.keyword;
	if (PHP_ARROW_TOKENS.has(name)) return PALENIGHT.arrow;
	if (name === 'T_STRING') {
		if (PHP_LITERAL_IDENTIFIERS.has(text)) return PALENIGHT.literal;
		if (next && next[1] === '(') return PALENIGHT.function;
		return PALENIGHT.default;
	}
	if (name === null && text.length === 1 && PHP_PUNCT_OPERATORS.includes(text)) {
		return PALENIGHT.keyword;
	}
	return PALENIGHT.default;
}

function buildHighlightedHtml(tokens) {
	const lines = [''];
	for (let i = 0; i < tokens.length; i++) {
		const t = tokens[i];
		const color = colorForToken(t, tokens[i + 1]);
		const segments = t[1].split('\n');
		for (let k = 0; k < segments.length; k++) {
			if (k > 0) lines.push('');
			if (segments[k]) {
				lines[lines.length - 1] += `<span style="color:${color};">${escapeHtml(segments[k])}</span>`;
			}
		}
	}
	const numWidth = String(lines.length).length;
	return lines.map((line, i) => {
		const num = String(i + 1).padStart(numWidth, ' ');
		return '<div class="line">'
			+ `<span style="color:#4c5374; text-align:right; -webkit-user-select:none; user-select:none;" class="line-number" contenteditable="false">${num}</span>`
			+ line
			+ '</div>';
	}).join('');
}

function getCaretLineCol(root) {
	const sel = window.getSelection();
	if (!sel.rangeCount) return null;
	const range = sel.getRangeAt(0);
	if (!root.contains(range.startContainer)) return null;
	const lines = Array.from(root.querySelectorAll(':scope > .line'));
	for (let i = 0; i < lines.length; i++) {
		if (!lines[i].contains(range.startContainer)) continue;
		let col = 0;
		const walker = document.createTreeWalker(lines[i], NodeFilter.SHOW_TEXT);
		let node;
		while ((node = walker.nextNode())) {
			if (node.parentElement?.classList.contains('line-number')) continue;
			if (node === range.startContainer) return [i, col + range.startOffset];
			col += node.textContent.length;
		}
		return [i, col];
	}
	return null;
}

function setCaretLineCol(root, [lineIdx, col]) {
	const lines = root.querySelectorAll(':scope > .line');
	if (lines.length === 0) return;
	const line = lines[Math.min(lineIdx, lines.length - 1)];
	let remaining = col;
	const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
	let node;
	while ((node = walker.nextNode())) {
		if (node.parentElement?.classList.contains('line-number')) continue;
		const len = node.textContent.length;
		if (remaining <= len) {
			const range = document.createRange();
			range.setStart(node, remaining);
			range.collapse(true);
			const sel = window.getSelection();
			sel.removeAllRanges();
			sel.addRange(range);
			return;
		}
		remaining -= len;
	}
	const range = document.createRange();
	range.selectNodeContents(line);
	range.collapse(false);
	const sel = window.getSelection();
	sel.removeAllRanges();
	sel.addRange(range);
}

class LaravelSnippet extends HTMLElement {
	connectedCallback() {
		if (this.dataset.upgraded === '1') return;
		this.dataset.upgraded = '1';

		// Controls (status, copy, play) are SSR'd by render.php so they paint
		// with the snippet instead of popping in on upgrade. We only wire.
		const wrapper = this.querySelector(':scope > .code-block-wrapper');
		const controls = wrapper.querySelector(':scope > .laravel-snippet__controls');
		const runBtn = controls.querySelector('.laravel-snippet__run');
		const statusEl = controls.querySelector('.laravel-snippet__status');
		const copyBtn = controls.querySelector('.laravel-snippet__copy');
		const code = wrapper.querySelector(':scope > pre > code');

		this.playIcon = runBtn.innerHTML;

		code.setAttribute('contenteditable', 'plaintext-only');
		code.setAttribute('spellcheck', 'false');
		for (const num of code.querySelectorAll('.line-number')) {
			num.setAttribute('contenteditable', 'false');
		}

		// Output sits inside the same <pre> as the input <code>, so it shares
		// the laravel.com double-border card (sand-dark-1 rim + sand-dark-3
		// inner via pre:before). Separator is just a top border.
		const pre = wrapper.querySelector(':scope > pre');
		const output = document.createElement('div');
		output.className = 'laravel-snippet__output';
		output.hidden = true;
		pre.appendChild(output);

		runBtn.addEventListener('click', () => {
			if (runBtn.dataset.state === 'reset') {
				this.#resetOutput(runBtn, statusEl, output);
			} else {
				this.#execute(runBtn, statusEl, output, code);
			}
		});
		copyBtn.addEventListener('click', () => this.#copy(copyBtn));

		this.highlightGen = 0;
		let highlightTimer = null;
		code.addEventListener('input', () => {
			this.highlightGen++;
			if (runBtn.dataset.state === 'reset') {
				this.#resetOutput(runBtn, statusEl, output);
			}
			clearTimeout(highlightTimer);
			highlightTimer = setTimeout(() => this.#rehighlight(code), 300);
		});
	}

	async #copy(btn) {
		const code = this.querySelector(':scope > .code-block-wrapper code');
		const text = this.#readSource(code);
		try {
			await navigator.clipboard.writeText(text);
		} catch {
			return;
		}
		const copyIcon = btn.innerHTML;
		btn.innerHTML = CHECK_SVG;
		btn.dataset.copied = '1';
		setTimeout(() => {
			btn.innerHTML = copyIcon;
			delete btn.dataset.copied;
		}, 1500);
	}

	async #execute(runBtn, statusEl, output, code) {
		runBtn.disabled = true;
		statusEl.textContent = 'Running…';
		output.hidden = false;
		output.innerHTML = '';

		try {
			const result = await runPhp(this.#readSource(code));
			const parts = [];
			if (result.stdout) parts.push(ansiToHtml(result.stdout));
			if (result.stderr) {
				parts.push(
					`<span class="laravel-snippet__stderr">${escapeHtml(result.stderr)}</span>`
				);
			}
			output.innerHTML = parts.join('\n') || '(no output)';
			statusEl.textContent =
				result.exitCode === 0
					? `${Math.round(result.tRun)} ms`
					: `exit ${result.exitCode} · ${Math.round(result.tRun)} ms`;
		} catch (err) {
			output.textContent = String(err);
			statusEl.textContent = 'error';
		} finally {
			runBtn.disabled = false;
			runBtn.dataset.state = 'reset';
			runBtn.innerHTML = RESET_SVG;
			runBtn.setAttribute('aria-label', 'Clear output');
		}
	}

	#resetOutput(runBtn, statusEl, output) {
		output.hidden = true;
		output.innerHTML = '';
		statusEl.textContent = '';
		runBtn.innerHTML = this.playIcon;
		runBtn.setAttribute('aria-label', 'Run snippet');
		delete runBtn.dataset.state;
	}

	async #rehighlight(code) {
		const gen = this.highlightGen;
		const source = this.#readSource(code);
		const reply = await runTokenize(source);
		if (gen !== this.highlightGen) return;
		if (!reply || !Array.isArray(reply.tokens)) return;
		const caret = getCaretLineCol(code);
		code.innerHTML = buildHighlightedHtml(reply.tokens);
		if (caret && document.activeElement === code) {
			setCaretLineCol(code, caret);
		}
	}

	#readSource(code) {
		return Array.from(code.querySelectorAll(':scope > .line'))
			.map((line) => {
				const clone = line.cloneNode(true);
				clone.querySelector('.line-number')?.remove();
				return clone.textContent;
			})
			.join('\n');
	}
}

customElements.define('laravel-snippet', LaravelSnippet);
