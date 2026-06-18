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
<nav class="sticky-nav docs-nav sticky top-0 z-99 mx-auto h-fit max-w-[1400px] !border-b-0 border-l !border-neutral-200 bg-white px-4 py-8 transition-transform duration-300 xl:px-16 dark:!border-neutral-700 dark:bg-neutral-900">
    <div class="relative grid h-full grid-cols-12 items-center gap-4 overflow-hidden lg:gap-6 xl:gap-x-10">
        <ul class="col-span-3 flex items-start space-x-8 font-medium">
            <li class="mr-18 w-20 text-laravel-red transition-transform duration-300 ease-in-out">
                <a class="flex aspect-[80/23] w-20 items-center" href="/">
                    <svg viewBox="0 0 1280 314" fill="none" xmlns="http://www.w3.org/2000/svg" class="h-full w-full"><path d="M50.2753 0H0V308.689H144.713V263.27H50.2753V0Z" fill="currentColor"/><path d="M322.209 130.973C315.796 120.684 306.688 112.602 294.883 106.718C283.081 100.84 271.201 97.8969 259.253 97.8969C243.798 97.8969 229.665 100.764 216.843 106.496C204.014 112.228 193.015 120.099 183.834 130.091C174.654 140.088 167.51 151.628 162.412 164.706C157.308 177.792 154.761 191.54 154.761 205.94C154.761 220.645 157.308 234.457 162.412 247.39C167.508 260.332 174.652 271.796 183.834 281.788C193.015 291.785 204.017 299.647 216.843 305.379C229.665 311.111 243.798 313.978 259.253 313.978C271.201 313.978 283.081 311.038 294.883 305.159C306.688 299.282 315.796 291.197 322.209 280.904V308.685H369.865V103.186H322.209V130.973ZM317.837 231.076C314.922 239.016 310.841 245.925 305.598 251.804C300.35 257.687 294.009 262.389 286.579 265.917C279.146 269.445 270.905 271.208 261.875 271.208C252.837 271.208 244.676 269.445 237.391 265.917C230.104 262.389 223.839 257.687 218.593 251.804C213.345 245.925 209.335 239.016 206.57 231.076C203.794 223.138 202.417 214.759 202.417 205.942C202.417 197.12 203.794 188.742 206.57 180.804C209.335 172.866 213.345 165.961 218.593 160.078C223.839 154.201 230.102 149.493 237.391 145.965C244.676 142.437 252.837 140.674 261.875 140.674C270.908 140.674 279.146 142.437 286.579 145.965C294.009 149.493 300.35 154.199 305.598 160.078C310.844 165.961 314.922 172.866 317.837 180.804C320.748 188.742 322.209 197.12 322.209 205.942C322.209 214.759 320.748 223.138 317.837 231.076Z" fill="currentColor"/><path d="M709.568 130.973C703.155 120.684 694.047 112.602 682.242 106.718C670.44 100.84 658.56 97.8969 646.612 97.8969C631.157 97.8969 617.024 100.764 604.202 106.496C591.373 112.228 580.374 120.099 571.193 130.091C562.013 140.088 554.869 151.628 549.771 164.706C544.666 177.792 542.12 191.54 542.12 205.94C542.12 220.645 544.666 234.457 549.771 247.39C554.867 260.332 562.01 271.796 571.193 281.788C580.374 291.785 591.375 299.647 604.202 305.379C617.024 311.111 631.157 313.978 646.612 313.978C658.56 313.978 670.44 311.038 682.242 305.159C694.047 299.282 703.155 291.197 709.568 280.904V308.685H757.224V103.186H709.568V130.973ZM705.198 231.076C702.283 239.016 698.202 245.925 692.959 251.804C687.711 257.687 681.37 262.389 673.94 265.917C666.507 269.445 658.266 271.208 649.236 271.208C640.198 271.208 632.037 269.445 624.752 265.917C617.465 262.389 611.2 257.687 605.954 251.804C600.706 245.925 596.696 239.016 593.931 231.076C591.155 223.138 589.778 214.759 589.778 205.942C589.778 197.12 591.155 188.742 593.931 180.804C596.696 172.866 600.706 165.961 605.954 160.078C611.2 154.201 617.463 149.493 624.752 145.965C632.037 142.437 640.198 140.674 649.236 140.674C658.269 140.674 666.507 142.437 673.94 145.965C681.37 149.493 687.711 154.199 692.959 160.078C698.205 165.961 702.283 172.866 705.198 180.804C708.109 188.742 709.57 197.12 709.57 205.942C709.568 214.759 708.107 223.138 705.198 231.076Z" fill="currentColor"/><path d="M1280 1.12315e-05H1232.35V308.689H1280V1.12315e-05Z" fill="currentColor"/><path d="M407.466 308.689H455.117V150.486H536.876V103.192H407.466V308.689Z" fill="currentColor"/><path d="M948.281 103.192L888.386 260.557L828.489 103.192H780.224L858.441 308.689H918.331L996.546 103.192H948.281Z" fill="currentColor"/><path d="M1100.48 97.908C1042.13 97.908 995.937 146.279 995.937 205.944C995.937 271.9 1040.64 313.98 1106.59 313.98C1143.5 313.98 1167.06 299.745 1195.85 268.746L1163.66 243.621C1163.64 243.646 1139.36 275.802 1103.1 275.802C1060.96 275.802 1043.22 241.533 1043.22 223.803H1201.32C1209.62 155.913 1165.37 97.908 1100.48 97.908ZM1043.35 188.085C1043.71 184.13 1049.2 136.086 1100.1 136.086C1151.01 136.086 1157.19 184.123 1157.55 188.085H1043.35Z" fill="currentColor"/></svg>
                    <span class="sr-only">Home</span>
                </a>
            </li>
        </ul>
        <div class="col-span-6 flex items-center justify-center">
            <h1 class="text-base font-semibold text-neutral-900 dark:text-neutral-100">Snippets report</h1>
        </div>
        <div class="col-span-3 flex items-center justify-end gap-4">
            <button type="button" title="Switch to light mode" class="flex size-8 cursor-pointer items-center justify-center rounded-lg text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true" class="size-5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25m18 0A2.25 2.25 0 0 0 18.75 3H5.25A2.25 2.25 0 0 0 3 5.25m18 0V12a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 12V5.25"/>
                </svg>
                <span class="sr-only">Switch to light mode</span>
            </button>
        </div>
    </div>
</nav>
<div class="mx-auto max-w-[1400px] border-l border-neutral-200 dark:border-neutral-700">
    <div class="px-4 xl:px-16">
        <main class="py-10">
            @inertia
        </main>
    </div>
</div>
</body>
</html>
