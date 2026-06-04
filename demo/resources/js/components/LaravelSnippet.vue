<script setup lang="ts">
import { onMounted, ref } from 'vue';

import {
    ansiToHtml,
    buildHighlightedHtml,
    escapeHtml,
    getCaretLineCol,
    setCaretLineCol,
} from '@/runtime/highlight';
import { runPhp, runTokenize } from '@/runtime/php';

const props = defineProps<{
    php: string;
    highlighted: string;
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
});

function readSource(): string {
    const el = codeRef.value;
    if (!el) return '';
    return Array.from(el.querySelectorAll<HTMLElement>(':scope > .line'))
        .map((line) => {
            const clone = line.cloneNode(true) as HTMLElement;
            clone.querySelector('.line-number')?.remove();
            return clone.textContent ?? '';
        })
        .join('\n');
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
    status.value = 'Running…';
    outputHtml.value = '';
    try {
        const result = await runPhp(readSource());
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
        outputHtml.value = escapeHtml(String(err));
        status.value = 'error';
    } finally {
        running.value = false;
        mode.value = 'reset';
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
                :aria-label="mode === 'reset' ? 'Clear output' : 'Run snippet'"
                :disabled="running"
                @click="mode === 'reset' ? reset() : execute()"
                v-html="mode === 'reset' ? RESET_SVG : PLAY_SVG"
            />
        </div>
    </div>
</template>
