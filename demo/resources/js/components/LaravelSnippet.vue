<script setup lang="ts">
import { onMounted, ref } from 'vue';

import {
    ansiToHtml,
    buildHighlightedHtml,
    escapeHtml,
    getCaretLineCol,
    setCaretLineCol,
} from '@/runtime/highlight';
import { onWorkerProgress, prewarmWorker, runPhp, runTokenize } from '@/runtime/php';

const props = defineProps<{
    php: string;
    highlighted: string;
    preamble?: string;
}>();

const OUTLINE_ATTRS =
    'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
const COPY_SVG =
    '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-linecap="round" aria-hidden="true"><path d="M6.2474 6.25033V2.91699H17.0807V13.7503H13.7474M13.7474 6.25033V17.0837H2.91406V6.25033H13.7474Z"/></svg>';
const CHECK_SVG =
    `<svg ${OUTLINE_ATTRS}><path d="M20 6 9 17l-5-5"/></svg>`;
const PLAY_SVG =
    `<svg ${OUTLINE_ATTRS}><polygon points="6 3 20 12 6 21 6 3"/></svg>`;
const RESET_SVG =
    `<svg ${OUTLINE_ATTRS}><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`;
const SPINNER_SVG =
    `<svg ${OUTLINE_ATTRS} class="laravel-snippet__spinner"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`;

const codeRef = ref<HTMLElement | null>(null);
const running = ref(false);
const mode = ref<'idle' | 'reset'>('idle');
const status = ref('');
const outputHtml = ref<string | null>(null);
const copied = ref(false);

let generation = 0;
let debounceTimer: number | null = null;

onMounted(() => {
    const el = codeRef.value;
    if (!el) return;
    el.innerHTML = props.highlighted;
    for (const num of el.querySelectorAll<HTMLElement>('.line-number')) {
        num.setAttribute('contenteditable', 'false');
    }
    // Pull the worker's ~75 MB of assets during idle so first-click is fast.
    const idle = (window as Window & {
        requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    }).requestIdleCallback;
    if (typeof idle === 'function') {
        idle(() => prewarmWorker(), { timeout: 2000 });
    } else {
        window.setTimeout(prewarmWorker, 200);
    }
});

function readSource(): string {
    const el = codeRef.value;
    if (!el) return '';
    return Array.from(el.querySelectorAll<HTMLElement>(':scope > .line'))
        .map((line) => {
            const clone = line.cloneNode(true) as HTMLElement;
            clone.querySelector('.line-number')?.remove();
            // The line highlighter renders blank lines as `<span> </span>`
            // — a single U+00A0 (non-breaking space) so the line keeps
            // height. PHP can't lex NBSP as whitespace, so anything past
            // a blank line errors with "unexpected identifier …". Strip.
            return (clone.textContent ?? '').replace(/ /g, ' ');
        })
        .join('\n');
}

// Skip over `<?php`, optional `declare()`, optional `namespace X;` or `namespace X {`,
// optional run of `use ...;` lines (with intervening blanks). Returns the byte index
// where the snippet's actual "body" begins.
function structuralPrefixEnd(source: string): number {
    let i = 0;
    const openRe = /^[ \t\r\n]*<\?php[ \t\r\n]*/;
    const om = source.match(openRe);
    if (om) i += om[0].length;
    const declRe = /^declare\s*\([^)]*\)\s*;[ \t\r\n]*/;
    const dm = source.slice(i).match(declRe);
    if (dm) i += dm[0].length;
    const nsRe = /^namespace\s+[\w\\]+\s*[;{][ \t\r\n]*/;
    const nm = source.slice(i).match(nsRe);
    if (nm) i += nm[0].length;
    // Consume any run of: blank lines, line comments, docblocks, and `use ...;`.
    while (true) {
        const tail = source.slice(i);
        const blank = tail.match(/^[ \t]*\r?\n/);
        if (blank) { i += blank[0].length; continue; }
        const lineComment = tail.match(/^[ \t]*\/\/[^\n]*\n?/);
        if (lineComment) { i += lineComment[0].length; continue; }
        const blockComment = tail.match(/^[ \t]*\/\*[\s\S]*?\*\/[ \t]*\r?\n?/);
        if (blockComment) { i += blockComment[0].length; continue; }
        const useStmt = tail.match(/^use\s+(?:function\s+|const\s+)?[\\\w\s,{}]+?;[ \t]*\r?\n?/);
        if (useStmt) { i += useStmt[0].length; continue; }
        break;
    }
    return i;
}

// Does the body (everything after the structural prefix) start with a class-member
// declaration? Used to decide whether to wrap in `class X { ... }` so the parser
// accepts a member fragment that the docs show in isolation.
function bodyStartsWithClassMember(body: string): boolean {
    const firstLine = body
        .split('\n')
        .map((l) => l.trim())
        .find((l) => l !== '' && !l.startsWith('//') && !l.startsWith('/*') && !l.startsWith('*'));
    if (!firstLine) return false;
    return /^(public|protected|private|abstract|final|static|readonly)\b/.test(firstLine);
}

// Does the body reference `$this` at brace depth 0 — i.e. outside any closure
// or class body that would give it a binding? Snippets shaped like
// `$this->app->bind(...)` (ServiceProvider body in isolation) need the wrap;
// snippets like `Collection::macro('x', function () { $this->map(...); })` do
// NOT — Macroable rebinds the closure to the collection at call time, so the
// inner `$this` resolves at runtime. A plain regex on `\$this\b` can't tell
// these apart and incorrectly wraps the macro form, declaring an uncalled
// method so the macro never registers (silent "(no output)").
function bodyUsesThisAtTopLevel(body: string): boolean {
    if (!/\$this\b/.test(body)) return false;
    // `class X { ... }` body — wrap would double-wrap; bail.
    if (/\bclass\s+\w+\b[^;]*\{/.test(body)) return false;
    // Walk source tracking strings, comments, and brace depth. A `$this`
    // token at depth 0 means top-level; anything deeper sits inside a
    // closure or anon class that establishes its own object binding.
    const n = body.length;
    let i = 0;
    let depth = 0;
    while (i < n) {
        const c = body[i];
        if (c === '/' && body[i + 1] === '/') {
            while (i < n && body[i] !== '\n') i++;
            continue;
        }
        if (c === '/' && body[i + 1] === '*') {
            i += 2;
            while (i < n - 1 && !(body[i] === '*' && body[i + 1] === '/')) i++;
            i += 2;
            continue;
        }
        if (c === '#' && body[i + 1] !== '[') {
            while (i < n && body[i] !== '\n') i++;
            continue;
        }
        if (c === "'") {
            i++;
            while (i < n) {
                if (body[i] === '\\') { i += 2; continue; }
                if (body[i] === "'") { i++; break; }
                i++;
            }
            continue;
        }
        if (c === '"') {
            i++;
            while (i < n) {
                if (body[i] === '\\') { i += 2; continue; }
                if (body[i] === '"') { i++; break; }
                i++;
            }
            continue;
        }
        if (c === '{') { depth++; i++; continue; }
        if (c === '}') { depth--; i++; continue; }
        if (
            depth === 0 &&
            c === '$' &&
            body.startsWith('$this', i) &&
            !/[A-Za-z0-9_]/.test(body[i + 5] ?? '')
        ) {
            return true;
        }
        i++;
    }
    return false;
}

// Build the executable source: the visible source with the page-context preamble
// injected and, if the snippet looks like a class-member fragment, wrapped in
// `new class { ... };`. The user never sees either transformation.
function buildExecutable(): string {
    const visible = readSource();
    const prefixEnd = structuralPrefixEnd(visible);
    const prefix = visible.slice(0, prefixEnd);
    const body = visible.slice(prefixEnd);

    const preamble = props.preamble?.trim() ?? '';
    const useLines = preamble ? preamble + '\n' : '';

    // Named class declaration — not `new class { ... }`, which would also
    // instantiate the class and call the constructor (often with required
    // args the snippet doesn't pretend to pass). A random suffix avoids
    // "Cannot redeclare class" across successive runs in the same worker.
    const wrapName = '__Snippet_' + Math.random().toString(36).slice(2);

    if (bodyStartsWithClassMember(body)) {
        return prefix + useLines + 'class ' + wrapName + ' {\n' + body + '\n}\n';
    }
    if (bodyUsesThisAtTopLevel(body)) {
        // `$this` outside a method body is illegal at execution, not at parse.
        // Declaring (but not calling) a wrapper method lets the snippet parse;
        // its body never runs, so `$this` stays inert. Snippets in this shape
        // are illustrative — the docs reader sees the method body, not output.
        return (
            prefix + useLines +
            'class ' + wrapName + ' {\n' +
            'public function __snippetRun() {\n' + body + '\n}\n' +
            '}\n'
        );
    }
    return prefix + useLines + body;
}

async function rehighlight() {
    const el = codeRef.value;
    if (!el) return;
    const gen = generation;
    const source = readSource();
    const reply = await runTokenize(source);
    if (gen !== generation) return;
    if (!reply || !Array.isArray(reply.tokens)) return;
    const caret = getCaretLineCol(el);
    el.innerHTML = buildHighlightedHtml(reply.tokens);
    if (caret && document.activeElement === el) {
        setCaretLineCol(el, caret);
    }
}

function onInput() {
    generation++;
    if (mode.value === 'reset') {
        mode.value = 'idle';
        status.value = '';
        outputHtml.value = null;
    }
    if (debounceTimer !== null) window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => {
        void rehighlight();
    }, 300);
}

async function execute() {
    if (running.value) return;
    running.value = true;
    outputHtml.value = '';
    const unsubProgress = onWorkerProgress((p) => {
        status.value = p < 100 ? `${p}%` : '';
    });
    let signalOutput = '';
    let signalHasStderr = false;
    try {
        const result = await runPhp(buildExecutable());
        const stdoutPlain = (result.stdout ?? '').replace(/\x1b\[[0-9;]*m/g, '').trim();
        const stderrPlain = (result.stderr ?? '').replace(/\x1b\[[0-9;]*m/g, '').trim();
        signalHasStderr = !!result.stderr;
        // Include stderr in the signal so the sweep report's outputPreview
        // surfaces the actual error text for ran-with-stderr / ran-exit-
        // nonzero rows. Classification downstream is driven by stderrCount
        // + status, not by outputText content (see sweep-status.ts), so
        // including stderr here doesn't shift any row into a new bucket.
        signalOutput = [stdoutPlain, stderrPlain].filter(Boolean).join('\n') || '(no output)';
        const parts: string[] = [];
        if (result.stdout) parts.push(ansiToHtml(result.stdout));
        if (result.stderr) {
            parts.push(
                `<span class="laravel-snippet__stderr">${escapeHtml(result.stderr)}</span>`,
            );
        }
        outputHtml.value = parts.join('\n') || '(no output)';
        status.value =
            result.exitCode === 0
                ? `${Math.round(result.tRun)} ms`
                : `exit ${result.exitCode} · ${Math.round(result.tRun)} ms`;
    } catch (err) {
        const msg =
            err instanceof Error
                ? err.message
                : err && typeof err === 'object' && 'message' in err
                  ? String((err as { message: unknown }).message)
                  : String(err);
        console.error('[laravel-snippet]', err);
        outputHtml.value = `<span class="laravel-snippet__stderr">${escapeHtml(msg)}</span>`;
        status.value = 'error';
        signalHasStderr = true;
        signalOutput = '';
    } finally {
        unsubProgress();
        running.value = false;
        mode.value = 'reset';
        // Bubble a completion signal so harnesses (sweep tests, future
        // telemetry) react without polling DOM text. The detail carries
        // exactly what classify() needs — status, plain-text output,
        // hasStderr — so consumers don't need to round-trip the DOM.
        codeRef.value?.dispatchEvent(
            new CustomEvent('laravel-snippet:complete', {
                bubbles: true,
                detail: {
                    status: status.value,
                    output: signalOutput,
                    hasStderr: signalHasStderr,
                },
            }),
        );
    }
}

function reset() {
    outputHtml.value = null;
    status.value = '';
    mode.value = 'idle';
}

async function copy() {
    try {
        await navigator.clipboard.writeText(readSource());
        copied.value = true;
        window.setTimeout(() => (copied.value = false), 1500);
    } catch {
        /* clipboard denied */
    }
}
</script>

<template>
    <div class="code-block-wrapper">
        <pre><code
            ref="codeRef"
            contenteditable="plaintext-only"
            :spellcheck="false"
            @input="onInput"
        /><div
            v-if="outputHtml !== null"
            class="laravel-snippet__output"
            v-html="outputHtml"
        /></pre>
        <div class="laravel-snippet__controls">
            <span class="laravel-snippet__status">{{ status }}</span>
            <button
                type="button"
                class="laravel-snippet__btn laravel-snippet__copy"
                aria-label="Copy code"
                :data-copied="copied ? '1' : null"
                @click="copy"
                v-html="copied ? CHECK_SVG : COPY_SVG"
            />
            <button
                type="button"
                class="laravel-snippet__btn laravel-snippet__run"
                :aria-label="running ? 'Running snippet' : (mode === 'reset' ? 'Clear output' : 'Run snippet')"
                :aria-busy="running"
                @click="mode === 'reset' ? reset() : execute()"
                v-html="running ? SPINNER_SVG : (mode === 'reset' ? RESET_SVG : PLAY_SVG)"
            />
        </div>
    </div>
</template>
