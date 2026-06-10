<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <link rel="preconnect" href="https://fonts.bunny.net">
    <link rel="stylesheet" href="https://fonts.bunny.net/css?family=ibm-plex-mono:500|merriweather:400&display=swap">
    <link rel="stylesheet" href="{{ config('docs.css_href') }}">
    @vite(['resources/css/app.css', 'resources/js/app.ts'])
    <script>{!! file_get_contents(resource_path('views/partials/theme.js')) !!}</script>
    @inertiaHead
</head>
<body class="bg-white font-sans text-neutral-900 antialiased dark:text-neutral-100 dark:bg-neutral-900">
{!! file_get_contents(resource_path('views/partials/header.html')) !!}
<div class="mx-auto max-w-[1400px] border-l border-neutral-200 dark:border-neutral-700">
    <div class="px-4 xl:px-16">
        <div id="docsScreen" class="grid grid-cols-12 gap-4 px-6 pt-10 lg:gap-6 lg:px-0 xl:gap-x-10">
@include('partials.sidebar')
            <section class="col-span-12 lg:col-span-9 xl:col-span-6">
                <section class="docs_main max-w-prose">
                    @inertia
                </section>
            </section>
{!! file_get_contents(resource_path('views/partials/right-rail.html')) !!}
        </div>
    </div>
</div>
</body>
</html>
