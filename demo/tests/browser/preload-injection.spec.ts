import { test, expect } from '@playwright/test';

import { injectSnippetPreloads } from '../../scripts/inject-snippet-preloads.ts';

test.describe('injectSnippetPreloads', () => {
    test('returns input unchanged when no snippet placeholder is present', () => {
        const html = '<html><head><title>x</title></head><body><p>plain</p></body></html>';
        expect(injectSnippetPreloads(html)).toBe(html);
    });

    test('inserts both preload tags before </head> when a snippet placeholder is present', () => {
        const html =
            '<html><head><title>x</title></head>' +
            '<body><div data-snippet-id="abc"></div></body></html>';
        const out = injectSnippetPreloads(html);
        expect(out).toContain('rel="preload" as="fetch" href="/laravel-snippets/laravel.zip"');
        expect(out).toContain('rel="preload" as="worker" href="/laravel-snippets/snippet-worker/index.js"');
        expect(out.indexOf('rel="preload"')).toBeLessThan(out.indexOf('</head>'));
    });

    test('idempotent against pages with no </head> (defensive: skip if shape unexpected)', () => {
        const html = '<div data-snippet-id="x"></div>';
        expect(injectSnippetPreloads(html)).toBe(html);
    });
});
