# Laravel snippet demo

Interactive, runnable PHP snippets embedded inside a rendering of
[Laravel's Collections docs](https://laravel.com/docs/13.x/collections).
PHP runs entirely in the browser via
[`@php-wasm/web`](https://github.com/WordPress/wordpress-playground); no
server backs the Run button.

Live demo: <https://mho22.github.io/laravel-snippet/>

## Stack

- Laravel 13 + Inertia 3 + Vue 3 + Vite 8
- `league/commonmark` + `torchlight/torchlight-laravel` for the prose
  pipeline (renders the laravel.com Collections markdown source)
- A web worker bundled with esbuild that boots PHP 8.4 (asyncify) and
  unzips a stock Laravel 12 framework bundle (`public/laravel.zip`) so
  `Illuminate\Support\Collection`, `dump()`, etc. are available to
  snippets

## Local development

```bash
cd demo
composer install
npm install
php artisan serve --port=8000 &
npm run dev
```

Open <http://localhost:5187/> (Vite proxies non-asset routes to
Laravel on `:8000`).

## Static build

`npm run prerender` (from `demo/`) writes a fully static site into
`demo/dist/laravel-snippet/`. The GitHub Actions workflow at
`.github/workflows/deploy.yml` runs this on every push to `main` and
publishes via `actions/deploy-pages@v4`.

## Content source

The markdown in `demo/resources/markdown/collections.md` is the
laravel.com Collections page text. Visual chrome (header, sidebar,
right rail) is captured as static HTML partials in
`demo/resources/views/partials/`. Styling is laravel.com's compiled CSS,
loaded by URL — no Tailwind compile step in this repo.
