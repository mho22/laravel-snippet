import { defineConfig } from 'vite';
import laravel from 'laravel-vite-plugin';
import vue from '@vitejs/plugin-vue';

const PREFIXED_ASSET_RE =
    /^\/laravel-snippet\/(snippet-worker(?:\/|$)|build(?:\/|$)|laravel\.zip(?:[/?]|$))/;

// In dev, asset URLs hardcoded with the `/laravel-snippet/` prefix (worker bundle,
// laravel.zip) need to resolve from `public/` without a real `public/laravel-snippet/`
// directory — that directory would shadow Laravel's `/laravel-snippet` page route via
// server.php's file_exists() check.
const stripDeployPrefix = {
    name: 'strip-laravel-snippet-prefix',
    configureServer(server) {
        server.middlewares.use((req, _res, next) => {
            if (req.url && PREFIXED_ASSET_RE.test(req.url)) {
                req.url = req.url.replace(/^\/laravel-snippet/, '');
            }
            next();
        });
    },
};

export default defineConfig({
    plugins: [
        laravel({
            input: ['resources/css/app.css', 'resources/js/app.ts'],
            refresh: true,
        }),
        vue(),
        stripDeployPrefix,
    ],
    server: {
        host: 'localhost',
        port: 5187,
        strictPort: true,
        watch: {
            ignored: ['**/storage/framework/views/**'],
        },
        proxy: {
            '^(?!/(@vite|@id|@fs|@react-refresh|resources/|node_modules/|__vite_ping|__inspect)).*': {
                target: 'http://localhost:8000',
                changeOrigin: false,
            },
        },
    },
    resolve: {
        alias: {
            '@': '/resources/js',
        },
    },
});
