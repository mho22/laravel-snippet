# Laravel snippet demo

A static rendering of the [Laravel 13.x docs](https://laravel.com/docs/13.x)
where every fenced PHP block is a runnable, browser-side REPL. PHP runs
entirely in the browser via
[`@php-wasm/web`](https://github.com/WordPress/wordpress-playground); no
server backs the Run button.

Live demo: <https://mho22.github.io/laravel-snippets>

Snippet sweep report: <https://mho22.github.io/laravel-snippets/report>

## Stack

- Laravel 13 + Inertia 3 + Vue 3 + Vite 8
- `league/commonmark` + `torchlight/torchlight-laravel` for the prose
  pipeline (renders the upstream `laravel/docs` markdown sources mirrored
  into `demo/resources/markdown/13.x/`)
- A web worker bundled with esbuild that boots PHP 8.4 (asyncify) and
  unzips a Laravel 13 framework bundle (`public/laravel.zip`) so
  `Illuminate\Support\Collection`, `dump()`, `Lang::get()`, etc. resolve
  inside every snippet

## Local development

```bash
cd demo
composer install
npm install
php artisan serve --port=8000 &
npm run dev
```

Open <http://localhost:5187> (Vite proxies non-asset routes to Laravel
on `:8000`).

## Static build

`npm run prerender` (from `demo/`) writes a fully static site into
`demo/dist/`:

- `dist/report.html` — Inertia snippet sweep report, served at
  `/laravel-snippets/report`
- `dist/docs/13.x/<page>/index.html` — one prerendered page per markdown
  source under `resources/markdown/13.x/`
- `dist/index.html` — meta-refresh redirect into
  `/docs/13.x/installation/`

The GitHub Actions workflow at `.github/workflows/deploy.yml` runs the
prerender on every push to `main` and republishes via
`actions/deploy-pages@v4`. It also fires on successful completion of the
`sweep.yml`, `sync-assets.yml`, and `sync-docs.yml` workflows so the
report and upstream asset/markdown mirrors stay current without a manual
push.

## Snippet sweep

`.github/workflows/sweep.yml` boots each prerendered docs page in
Playwright, runs every PHP snippet through the wasm worker, and uploads
a `snippet-report` artifact. `ReportController` loads that artifact at
prerender time so `dist/report.html` reflects the latest sweep results;
if no artifact is available, the Inertia page renders an empty-state
branch.

## Content source

Markdown under `demo/resources/markdown/13.x/` mirrors the upstream
`laravel/docs` corpus and is refreshed by `sync-docs.yml`. Visual chrome
(header, sidebar, right rail) is captured as static HTML partials in
`demo/resources/views/partials/`. Styling is laravel.com's compiled CSS,
fetched and committed by `sync-assets.yml` — no Tailwind compile step
in this repo.
