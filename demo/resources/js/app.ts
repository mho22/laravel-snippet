import { createInertiaApp, router } from '@inertiajs/vue3';
import { resolvePageComponent } from 'laravel-vite-plugin/inertia-helpers';
import { createApp, h, type DefineComponent } from 'vue';

import '../css/app.css';

createInertiaApp({
    resolve: (name) =>
        resolvePageComponent<DefineComponent>(
            `./pages/${name}.vue`,
            import.meta.glob<DefineComponent>('./pages/**/*.vue'),
        ),
    setup({ el, App, props, plugin }) {
        createApp({ render: () => h(App, props) })
            .use(plugin)
            .mount(el);
    },
});

// Sweep-only Inertia navigation hook so the Playwright spec can span many
// docs pages on one PHP-WASM worker (page.goto would reload the document
// and kill the worker). Gated by `import.meta.env.DEV` (local dev) and the
// build-time `VITE_EXPOSE_SWEEP_HOOKS` flag — sweep.yml sets the latter on
// its `npm run build` step; deploy.yml doesn't, so the production GH Pages
// bundle never exposes this. See tests/browser/snippets.spec.ts.
if (
    typeof window !== 'undefined' &&
    (import.meta.env.DEV || import.meta.env.VITE_EXPOSE_SWEEP_HOOKS === '1')
) {
    const w = window as typeof window & {
        __inertiaVisit?: (url: string) => Promise<void>;
    };
    w.__inertiaVisit = (url: string) =>
        new Promise<void>((resolve, reject) => {
            router.visit(url, {
                onFinish: () => resolve(),
                onError: (errors) => reject(new Error(JSON.stringify(errors))),
            });
        });
}
