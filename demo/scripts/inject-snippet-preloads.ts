// The two hashed PHP WASM variants are NOT preloaded: only one is ever
// chosen (JSPI vs asyncify, decided by runtime feature-detect), so
// preloading both would waste ~22 MB. The Vue mount calls prewarmWorker
// during idle, which constructs the Worker and triggers the right WASM
// fetch early enough in practice.
const TAGS =
    '<link rel="preload" as="fetch" href="/laravel-snippets/laravel.zip">' +
    '<link rel="preload" as="worker" href="/laravel-snippets/snippet-worker/index.js">';

export function injectSnippetPreloads(html: string): string {
    if (!html.includes('data-snippet-id=')) return html;
    return html.replace('</head>', `${TAGS}</head>`);
}
