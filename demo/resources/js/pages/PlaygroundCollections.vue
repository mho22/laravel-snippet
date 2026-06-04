<script setup lang="ts">
import { Head } from '@inertiajs/vue3';
import { onMounted, ref, watch } from 'vue';

const props = defineProps<{
    title: string;
    body: string;
    snippets: Record<string, { php: string; highlighted: string }>;
}>();

const bodyRef = ref<HTMLDivElement | null>(null);

const PLAYGROUND_ORIGIN = 'https://playground.wordpress.net';
const PLAYGROUND_SCRIPT_URL = `${PLAYGROUND_ORIGIN}/php-code-snippet.js`;
const BLUEPRINT_ID = 'laravel-setup';

// The playground.wordpress.net iframe requires HTTPS+CORS; pointing dev at
// the production URL too means localhost has nothing to serve to it.
const LARAVEL_ZIP_URL = 'https://mho22.github.io/laravel-snippet/laravel.zip';

// Silences deprecation notices (<php-snippet> concatenates stderr into its
// output panel), disables ANSI colours (no escape-to-HTML conversion), and
// dumps the last user-added global so assign-only snippets show a result.
const PRELOAD_PHP = `<?php
require '/bundle/init.php';
ini_set('display_errors', '0');
error_reporting(E_ALL & ~E_DEPRECATED & ~E_USER_DEPRECATED);
$dumper->setColors(false);
$GLOBALS['__playground_pre_keys'] = array_keys($GLOBALS);
register_shutdown_function(static function (): void {
    $preKeys = $GLOBALS['__playground_pre_keys'] ?? [];
    $userVars = array_diff_key($GLOBALS, array_flip($preKeys));
    $userVars = array_filter(
        $userVars,
        static fn (string $n): bool => $n[0] !== '_' && $n !== 'GLOBALS' && $n !== 'argv' && $n !== 'argc',
        ARRAY_FILTER_USE_KEY
    );
    $last = array_key_last($userVars);
    if ($last !== null) {
        dump($userVars[$last]);
    }
});`;

const SHADOW_STYLE =
    '.name { display: none !important; }' +
    '.header { justify-content: flex-end !important; }';

function ensureBlueprint() {
    if (document.getElementById(BLUEPRINT_ID)) return;
    // <template>'s parser swallows "<?" as a bogus comment; <script> is opaque.
    const el = document.createElement('script');
    el.type = 'application/json';
    el.id = BLUEPRINT_ID;
    el.textContent = JSON.stringify({
        preferredVersions: { php: '8.4', wp: false },
        steps: [
            {
                step: 'unzip',
                extractToPath: '/bundle',
                zipFile: { resource: 'url', url: LARAVEL_ZIP_URL },
            },
            {
                step: 'writeFile',
                path: '/internal/shared/preload/00-laravel-init.php',
                data: PRELOAD_PHP,
            },
        ],
    });
    document.head.appendChild(el);
}

function ensurePlaygroundScript() {
    if (document.querySelector(`script[src="${PLAYGROUND_SCRIPT_URL}"]`)) return;
    const s = document.createElement('script');
    s.type = 'module';
    s.src = PLAYGROUND_SCRIPT_URL;
    document.head.appendChild(s);
}

function withOpenTag(code: string): string {
    return /^\s*<\?(?:php\b|=)/.test(code) ? code : `<?php\n${code}`;
}

// PHP-WASM's php.run({ code }) writes `code` verbatim to /internal/eval.php;
// without a leading <?php the file parses as HTML and echoes its source. We
// patch the shared class prototype so the editor renders raw markdown bodies
// while runs still get a valid PHP file.
function patchRunOnce() {
    type SnippetClass = CustomElementConstructor & {
        prototype: { _runOnce?: (code: string) => unknown; __runPatched?: boolean };
    };
    const cls = customElements.get('php-snippet') as SnippetClass | undefined;
    if (!cls || cls.prototype.__runPatched) return;
    const orig = cls.prototype._runOnce;
    if (!orig) return;
    cls.prototype._runOnce = function (code: string) {
        return orig.call(this, withOpenTag(code));
    };
    cls.prototype.__runPatched = true;
}

function injectShadowStyle(snip: HTMLElement) {
    const root = (snip as HTMLElement & { shadowRoot?: ShadowRoot }).shadowRoot;
    if (!root || root.querySelector('style[data-shadow-tweak]')) return;
    const s = document.createElement('style');
    s.setAttribute('data-shadow-tweak', '');
    s.textContent = SHADOW_STYLE;
    root.appendChild(s);
}

function setupSnippets() {
    customElements.whenDefined('php-snippet').then(() => {
        patchRunOnce();
        document
            .querySelectorAll<HTMLElement>('php-snippet')
            .forEach(injectShadowStyle);
    });
}

function hydrate() {
    ensureBlueprint();
    ensurePlaygroundScript();
    const root = bodyRef.value;
    if (!root) return;
    const placeholders = root.querySelectorAll<HTMLDivElement>('[data-snippet-id]');
    placeholders.forEach((el) => {
        const id = el.dataset.snippetId;
        if (!id) return;
        const snippet = props.snippets[id];
        if (!snippet) return;
        if (el.dataset.hydrated === '1') return;

        const snip = document.createElement('php-snippet');
        snip.setAttribute('blueprint', BLUEPRINT_ID);
        snip.setAttribute('wp', 'none');

        const script = document.createElement('script');
        script.setAttribute('type', 'application/x-php');
        script.textContent = snippet.php;
        snip.appendChild(script);

        el.replaceWith(snip);
    });
    root.querySelectorAll<HTMLElement>('php-snippet').forEach((n) => {
        n.dataset.hydrated = '1';
    });
    setupSnippets();
}

onMounted(hydrate);
watch(() => [props.body, props.snippets], hydrate, { deep: false });
</script>

<template>
    <Head :title="`${title} — Playground variant`" />
    <div ref="bodyRef" id="main-content" class="contains-code-blocks" v-html="body" />
</template>
