@php
    $current = request()->route('page') ?? '';
    $sections = [
        ['title' => 'Prologue', 'links' => [
            ['slug' => 'releases',       'label' => 'Release Notes'],
            ['slug' => 'upgrade',        'label' => 'Upgrade Guide'],
            ['slug' => 'contributions',  'label' => 'Contribution Guide'],
        ]],
        ['title' => 'Getting Started', 'links' => [
            ['slug' => 'installation',   'label' => 'Installation'],
            ['slug' => 'configuration',  'label' => 'Configuration'],
            ['slug' => 'ai',             'label' => 'Agentic Development'],
            ['slug' => 'structure',      'label' => 'Directory Structure'],
            ['slug' => 'frontend',       'label' => 'Frontend'],
            ['slug' => 'starter-kits',   'label' => 'Starter Kits'],
            ['slug' => 'deployment',     'label' => 'Deployment'],
        ]],
        ['title' => 'Architecture Concepts', 'links' => [
            ['slug' => 'lifecycle',      'label' => 'Request Lifecycle'],
            ['slug' => 'container',      'label' => 'Service Container'],
            ['slug' => 'providers',      'label' => 'Service Providers'],
            ['slug' => 'facades',        'label' => 'Facades'],
        ]],
        ['title' => 'The Basics', 'links' => [
            ['slug' => 'routing',        'label' => 'Routing'],
            ['slug' => 'middleware',     'label' => 'Middleware'],
            ['slug' => 'csrf',           'label' => 'CSRF Protection'],
            ['slug' => 'controllers',    'label' => 'Controllers'],
            ['slug' => 'requests',       'label' => 'Requests'],
            ['slug' => 'responses',      'label' => 'Responses'],
            ['slug' => 'views',          'label' => 'Views'],
            ['slug' => 'blade',          'label' => 'Blade Templates'],
            ['slug' => 'vite',           'label' => 'Asset Bundling'],
            ['slug' => 'urls',           'label' => 'URL Generation'],
            ['slug' => 'session',        'label' => 'Session'],
            ['slug' => 'validation',     'label' => 'Validation'],
            ['slug' => 'errors',         'label' => 'Error Handling'],
            ['slug' => 'logging',        'label' => 'Logging'],
        ]],
        ['title' => 'Digging Deeper', 'links' => [
            ['slug' => 'artisan',        'label' => 'Artisan Console'],
            ['slug' => 'broadcasting',   'label' => 'Broadcasting'],
            ['slug' => 'cache',          'label' => 'Cache'],
            ['slug' => 'collections',    'label' => 'Collections'],
            ['slug' => 'concurrency',    'label' => 'Concurrency'],
            ['slug' => 'context',        'label' => 'Context'],
            ['slug' => 'contracts',      'label' => 'Contracts'],
            ['slug' => 'events',         'label' => 'Events'],
            ['slug' => 'filesystem',     'label' => 'File Storage'],
            ['slug' => 'helpers',        'label' => 'Helpers'],
            ['slug' => 'http-client',    'label' => 'HTTP Client'],
            ['slug' => 'localization',   'label' => 'Localization'],
            ['slug' => 'mail',           'label' => 'Mail'],
            ['slug' => 'notifications',  'label' => 'Notifications'],
            ['slug' => 'packages',       'label' => 'Package Development'],
            ['slug' => 'processes',      'label' => 'Processes'],
            ['slug' => 'queues',         'label' => 'Queues'],
            ['slug' => 'rate-limiting',  'label' => 'Rate Limiting'],
            ['slug' => 'search',         'label' => 'Search'],
            ['slug' => 'strings',        'label' => 'Strings'],
            ['slug' => 'scheduling',     'label' => 'Task Scheduling'],
        ]],
        ['title' => 'Security', 'links' => [
            ['slug' => 'authentication', 'label' => 'Authentication'],
            ['slug' => 'authorization',  'label' => 'Authorization'],
            ['slug' => 'verification',   'label' => 'Email Verification'],
            ['slug' => 'encryption',     'label' => 'Encryption'],
            ['slug' => 'hashing',        'label' => 'Hashing'],
            ['slug' => 'passwords',      'label' => 'Password Reset'],
        ]],
        ['title' => 'Database', 'links' => [
            ['slug' => 'database',       'label' => 'Getting Started'],
            ['slug' => 'queries',        'label' => 'Query Builder'],
            ['slug' => 'pagination',     'label' => 'Pagination'],
            ['slug' => 'migrations',     'label' => 'Migrations'],
            ['slug' => 'seeding',        'label' => 'Seeding'],
            ['slug' => 'redis',          'label' => 'Redis'],
            ['slug' => 'mongodb',        'label' => 'MongoDB'],
        ]],
        ['title' => 'Eloquent ORM', 'links' => [
            ['slug' => 'eloquent',                  'label' => 'Getting Started'],
            ['slug' => 'eloquent-relationships',    'label' => 'Relationships'],
            ['slug' => 'eloquent-collections',      'label' => 'Collections'],
            ['slug' => 'eloquent-mutators',         'label' => 'Mutators / Casts'],
            ['slug' => 'eloquent-resources',        'label' => 'API Resources'],
            ['slug' => 'eloquent-serialization',    'label' => 'Serialization'],
            ['slug' => 'eloquent-factories',        'label' => 'Factories'],
        ]],
        ['title' => 'AI', 'links' => [
            ['slug' => 'ai-sdk',         'label' => 'AI SDK'],
            ['slug' => 'mcp',            'label' => 'MCP'],
            ['slug' => 'boost',          'label' => 'Boost'],
        ]],
        ['title' => 'Testing', 'links' => [
            ['slug' => 'testing',        'label' => 'Getting Started'],
            ['slug' => 'http-tests',     'label' => 'HTTP Tests'],
            ['slug' => 'console-tests',  'label' => 'Console Tests'],
            ['slug' => 'dusk',           'label' => 'Browser Tests'],
            ['slug' => 'database-testing', 'label' => 'Database'],
            ['slug' => 'mocking',        'label' => 'Mocking'],
        ]],
        ['title' => 'Packages', 'links' => [
            ['slug' => 'billing',        'label' => 'Cashier (Stripe)'],
            ['slug' => 'cashier-paddle', 'label' => 'Cashier (Paddle)'],
            ['slug' => 'dusk',           'label' => 'Dusk'],
            ['slug' => 'envoy',          'label' => 'Envoy'],
            ['slug' => 'fortify',        'label' => 'Fortify'],
            ['slug' => 'folio',          'label' => 'Folio'],
            ['slug' => 'homestead',      'label' => 'Homestead'],
            ['slug' => 'horizon',        'label' => 'Horizon'],
            ['slug' => 'mix',            'label' => 'Mix'],
            ['slug' => 'octane',         'label' => 'Octane'],
            ['slug' => 'passport',       'label' => 'Passport'],
            ['slug' => 'pennant',        'label' => 'Pennant'],
            ['slug' => 'pint',           'label' => 'Pint'],
            ['slug' => 'precognition',   'label' => 'Precognition'],
            ['slug' => 'prompts',        'label' => 'Prompts'],
            ['slug' => 'pulse',          'label' => 'Pulse'],
            ['slug' => 'reverb',         'label' => 'Reverb'],
            ['slug' => 'sail',           'label' => 'Sail'],
            ['slug' => 'sanctum',        'label' => 'Sanctum'],
            ['slug' => 'scout',          'label' => 'Scout'],
            ['slug' => 'socialite',      'label' => 'Socialite'],
            ['slug' => 'telescope',      'label' => 'Telescope'],
            ['slug' => 'valet',          'label' => 'Valet'],
        ]],
    ];
@endphp
<aside class="relative col-span-3 lg:pb-6">
<div class="sticky top-22 bottom-0 left-0 z-20 hidden lg:block">
<div class="sticky-side-nav clean-scrollbar relative -ml-16 flex max-h-screen flex-1 flex-col overflow-auto pl-16">
<nav id="indexed-nav" class="hidden lg:block">
<div class="docs_sidebar">
<ul>
@foreach ($sections as $section)
    @php $sectionOpen = collect($section['links'])->contains(fn ($l) => $l['slug'] === $current); @endphp
    <li class="{{ $sectionOpen ? 'sub--on' : '' }}">
        <h2>{{ $section['title'] }}</h2>
        <ul>
            @foreach ($section['links'] as $link)
                <li class="{{ $link['slug'] === $current ? 'active' : '' }}"><a href="{{ route('docs.show', ['page' => $link['slug']], false) }}">{{ $link['label'] }}</a></li>
            @endforeach
        </ul>
    </li>
@endforeach
<li><h2><a href="https://api.laravel.com/docs/13.x">API Documentation</a></h2></li>
</ul></div></nav></div></div></aside>
<script>
(function () {
    var nav = document.getElementById('indexed-nav');
    if (!nav) return;
    nav.addEventListener('click', function (e) {
        var h2 = e.target.closest('h2');
        if (!h2 || h2.querySelector('a')) return;
        var li = h2.parentElement;
        if (li && li.tagName === 'LI') li.classList.toggle('sub--on');
    });
})();
</script>
