<?php

declare(strict_types=1);

use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\Http;
use Symfony\Component\VarDumper\Cloner\VarCloner;
use Symfony\Component\VarDumper\Dumper\CliDumper;
use Symfony\Component\VarDumper\VarDumper;

require __DIR__ . '/vendor/autoload.php';

// Flip Laravel to console mode before bootstrap. The Application reads
// APP_RUNNING_IN_CONSOLE via Env::get() during the first call to
// $app->runningInConsole() and memoises the result; setting it here
// (php-wasm embed SAPI reports `embed`, not `cli`, so the natural
// PHP_SAPI check returns false) makes Laravel route exceptions through
// the bound ExceptionHandler::renderForConsole() — which we override
// below — instead of render() → HTML 500 page.
$_ENV['APP_RUNNING_IN_CONSOLE'] = 'true';
putenv('APP_RUNNING_IN_CONSOLE=true');

// php-wasm's embed SAPI provides $_SERVER['argv'] as the empty STRING
// rather than the array Symfony Console 8.1's ArgvInput::__construct
// expects. Without this normalization, Laravel's LoadEnvironmentVariables
// bootstrapper (which constructs `new ArgvInput()` to look for --env)
// fatals with "array_shift(): Argument #1 must be of type array, string
// given" — every snippet exits 255 with no stderr because the wrapper
// silences display_errors. Setting an empty array here covers both
// $_SERVER['argv'] reads and any global $argv lookup.
$_SERVER['argv'] = [];
$_SERVER['argc'] = 0;

// Pre-scan the snippet for top-level class/interface/trait/enum
// declarations BEFORE Laravel bootstrap runs. The autoload gate
// installed just below consults this list and refuses to load any
// template class the snippet redeclares — "template" meaning anything
// under one of the PSR-4 prefixes the bundle's composer.json declares
// (App\, Database\Factories\, Database\Seeders\, Tests\).
// __snippet_declared_classes() is defined further down in this file,
// but PHP hoists top-level function declarations at compile time so
// the call here is valid even before the definition line. The pre-
// scan reads /tmp/snippet.php directly (the worker writes it before
// php.run, so it's already on the VFS by the time this runs); on the
// rare path where it isn't (e.g., probe scripts), the @-suppressed
// file_get_contents returns false → __snippet_declared_classes
// returns [], and the gate becomes a no-op.
$GLOBALS['__declared_classes'] = __snippet_declared_classes(
    @file_get_contents('/tmp/snippet.php') ?: ''
);

// Wrap Composer's PSR-4 autoload chain so any template class the
// snippet redeclares is refused at autoload time. The "template" set
// is read from this bundle's composer.json (autoload + autoload-dev
// PSR-4 prefixes) so adding a namespace there automatically extends
// the gate — no enumeration in code.
//
// How it composes with per-site code: bootstrap/providers.php and
// snippet-context.php reference template classes by FQCN (AppService-
// Provider, User). They wrap those references in class_exists(), which
// triggers autoload as a side effect. On refusal class_exists returns
// false and the bundle code falls through to the snippet-declares-its-
// own branch. The snippet body runs later and its own `class App\…\X`
// lands into an empty symbol-table slot — no race, no Cannot-redeclare
// fatal.
//
// We pull Composer's loader out of the SPL chain via
// spl_autoload_unregister rather than $loader->unregister(); the
// latter would also strip it from ClassLoader::getRegisteredLoaders(),
// which some Laravel internals (PackageManifest in particular)
// introspect.
$__composer = json_decode(@file_get_contents(__DIR__ . '/composer.json'), true) ?: [];
$__template_prefixes = array_keys(array_merge(
    $__composer['autoload']['psr-4'] ?? [],
    $__composer['autoload-dev']['psr-4'] ?? [],
));
foreach (\Composer\Autoload\ClassLoader::getRegisteredLoaders() as $__loader) {
    spl_autoload_unregister([$__loader, 'loadClass']);
    spl_autoload_register(static function (string $class) use ($__loader, $__template_prefixes): void {
        if (in_array($class, $GLOBALS['__declared_classes'] ?? [], true)) {
            foreach ($__template_prefixes as $prefix) {
                if (str_starts_with($class, $prefix)) {
                    return; // refuse — template class the snippet redeclares
                }
            }
        }
        $__loader->loadClass($class);
    });
}

// Ensure the sqlite database file exists BEFORE Laravel bootstraps. The
// default connection in config/database.php points to this path; absent
// the file, every `Schema::create()` / `DB::table()` / Eloquent call
// fails with "Database file at path [...] does not exist." Reset to a
// fresh empty file per snippet so cross-snippet pollution (a table
// created by an earlier `Schema::create('users')` doesn't make the next
// one fail with "table already exists") stays out of the report.
$__sqlitePath = __DIR__ . '/database/database.sqlite';
if (! is_dir(dirname($__sqlitePath))) {
    @mkdir(dirname($__sqlitePath), 0777, true);
}
@unlink($__sqlitePath);
touch($__sqlitePath);

/** @var \Illuminate\Foundation\Application $app */
$app = require __DIR__ . '/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

// Seed common tables. The sqlite file was wiped just before bootstrap
// (line 91), so every snippet starts with an empty DB. The `queries`
// page (~100 snippets) and many eloquent/auth/billing snippets reach
// for `users`, `posts`, etc. and previously failed with
// "no such table". Schema below is intentionally permissive — guarded
// = [] models accept arbitrary columns, so attributes set on those
// models always persist regardless of the columns defined here.
\Illuminate\Support\Facades\Schema::create('users', function (\Illuminate\Database\Schema\Blueprint $t) {
    $t->id();
    $t->string('name')->nullable();
    $t->string('email')->nullable();
    $t->string('password')->nullable();
    $t->string('remember_token', 100)->nullable();
    $t->boolean('is_admin')->default(false);
    $t->boolean('active')->default(true);
    $t->boolean('vip')->default(false);
    $t->integer('votes')->default(0);
    // Tier C (B) — columns docs snippets reference on the users table (which
    // also backs $post/$user in context). `balance` (queries incrementEach),
    // `reads` ($post->increment), `first_name`/`last_name`/`title`
    // (User::create dirty-tracking docs), `options` (Attribute-cast / JSON
    // update docs). All nullable / default so the seed insert and existing
    // snippets are unaffected.
    $t->integer('balance')->default(0);
    $t->integer('reads')->default(0);
    $t->string('first_name')->nullable();
    $t->string('last_name')->nullable();
    $t->string('title')->nullable();
    $t->text('options')->nullable();
    // Tier D — more users columns from post-Tier-C stderr: admin ('Y'/'N'
    // string in factory seq), marketable (updateOrInsert), status (groupBy).
    $t->string('admin')->nullable();
    $t->boolean('marketable')->default(false);
    $t->string('status')->nullable();
    $t->unsignedBigInteger('user_id')->nullable();
    $t->unsignedBigInteger('account_id')->nullable();
    $t->timestamp('email_verified_at')->nullable();
    // Cashier columns — added by 2019_05_03_000001_create_customer_columns.
    // Without them, Billable methods on User that probe customer state
    // throw "no such column: stripe_id" instead of resolving to null.
    $t->string('stripe_id')->nullable();
    $t->string('pm_type')->nullable();
    $t->string('pm_last_four', 4)->nullable();
    $t->timestamp('trial_ends_at')->nullable();
    $t->softDeletes();
    $t->timestamps();
});
// Cashier subscription tables — minimal shape mirroring
// laravel/cashier's 2019_05_03_000002 / 000003 migrations plus the
// 2025_06_06 meter_id / meter_event_name columns. Permissive nullability
// across the board so docs snippets that call $user->subscription(...)
// don't fatal on "no such table" or "constraint violation". Real values
// are never produced — Stripe is unreachable from the worker — but
// method dispatch resolves and returns null instead of throwing.
\Illuminate\Support\Facades\Schema::create('subscriptions', function (\Illuminate\Database\Schema\Blueprint $t) {
    $t->id();
    $t->unsignedBigInteger('user_id')->nullable();
    $t->string('type')->nullable();
    $t->string('stripe_id')->nullable();
    $t->string('stripe_status')->nullable();
    $t->string('stripe_price')->nullable();
    $t->integer('quantity')->nullable();
    $t->timestamp('trial_ends_at')->nullable();
    $t->timestamp('ends_at')->nullable();
    $t->timestamps();
});
\Illuminate\Support\Facades\Schema::create('subscription_items', function (\Illuminate\Database\Schema\Blueprint $t) {
    $t->id();
    $t->unsignedBigInteger('subscription_id')->nullable();
    $t->string('stripe_id')->nullable();
    $t->string('stripe_product')->nullable();
    $t->string('stripe_price')->nullable();
    $t->integer('quantity')->nullable();
    $t->string('meter_id')->nullable();
    $t->string('meter_event_name')->nullable();
    $t->timestamps();
});
\Illuminate\Support\Facades\Schema::create('posts', function (\Illuminate\Database\Schema\Blueprint $t) {
    $t->id();
    $t->unsignedBigInteger('user_id')->nullable();
    $t->unsignedBigInteger('author_id')->nullable();
    $t->string('title')->nullable();
    $t->string('type')->nullable();
    $t->text('body')->nullable();
    $t->text('options')->nullable();
    $t->integer('votes')->default(0);
    $t->integer('reads')->default(0);
    // Tier D — posts columns from factory docs (hasPosts/state).
    $t->string('user_type')->nullable();
    $t->boolean('published')->default(false);
    $t->boolean('featured')->default(false);
    $t->boolean('delayed')->default(false);
    $t->timestamp('read_at')->nullable();
    $t->softDeletes();
    $t->timestamps();
});
// Dedicated `comments` schema — referenced by docs snippets that use
// commentable polymorphic relations and post_id joins. The generic
// fallback loop below would only give it id/user_id/name/body/timestamps,
// which fatals on the polymorphic columns and votes column.
\Illuminate\Support\Facades\Schema::create('comments', function (\Illuminate\Database\Schema\Blueprint $t) {
    $t->id();
    $t->unsignedBigInteger('user_id')->nullable();
    $t->unsignedBigInteger('post_id')->nullable();
    $t->unsignedBigInteger('commentable_id')->nullable();
    $t->string('commentable_type')->nullable();
    $t->text('body')->nullable();
    $t->integer('votes')->default(0);
    $t->timestamp('read_at')->nullable();
    $t->softDeletes();
    $t->timestamps();
});
// Dedicated `role_user` pivot — docs snippets pass extra pivot columns
// (active, expires) via `->withPivot([...])` which read these columns
// directly. Without them, the join fatals on missing columns.
\Illuminate\Support\Facades\Schema::create('role_user', function (\Illuminate\Database\Schema\Blueprint $t) {
    $t->unsignedBigInteger('role_id')->nullable();
    $t->unsignedBigInteger('user_id')->nullable();
    $t->boolean('active')->default(true);
    $t->timestamp('expires')->nullable();
    $t->timestamps();
});
// Dedicated `products` schema — queries page references price/votes/etc.
\Illuminate\Support\Facades\Schema::create('products', function (\Illuminate\Database\Schema\Blueprint $t) {
    $t->id();
    $t->string('name')->nullable();
    $t->integer('price')->nullable();
    $t->integer('votes')->default(0);
    $t->string('status')->nullable();
    $t->string('city')->nullable();
    $t->timestamps();
});
// Dedicated `flights` schema — has departure/destination columns
// referenced by eloquent / queries pages.
\Illuminate\Support\Facades\Schema::create('flights', function (\Illuminate\Database\Schema\Blueprint $t) {
    $t->id();
    $t->unsignedBigInteger('user_id')->nullable();
    $t->string('name')->nullable();
    $t->string('departure')->nullable();
    $t->string('destination')->nullable();
    // Tier D — flights columns from eloquent up/insert + replicate docs.
    $t->integer('price')->nullable();
    $t->integer('discounted')->nullable();
    $t->boolean('delayed')->default(false);
    $t->string('origin')->nullable();
    $t->timestamp('last_flown')->nullable();
    $t->unsignedBigInteger('last_pilot_id')->nullable();
    $t->boolean('active')->default(true);
    $t->timestamps();
});
// Pennant feature flags — `\Laravel\Pennant\Feature` persists to this
// table when its `database` driver is in use. Without the table, every
// snippet that reads or writes a feature value fatals with
// "no such table: features".
\Illuminate\Support\Facades\Schema::create('features', function (\Illuminate\Database\Schema\Blueprint $t) {
    $t->id();
    $t->string('name');
    $t->string('scope');
    $t->text('value');
    $t->timestamps();
    $t->unique(['name', 'scope']);
});
// Notifications table — for the `database` notification channel that
// docs snippets fire-and-forget via `$user->notify(new X)` or
// `$user->notifications` access.
\Illuminate\Support\Facades\Schema::create('notifications', function (\Illuminate\Database\Schema\Blueprint $t) {
    $t->uuid('id')->primary();
    $t->string('type');
    $t->morphs('notifiable');
    $t->text('data');
    $t->timestamp('read_at')->nullable();
    $t->timestamps();
});
// Database cache store tables. config/cache.php defaults CACHE_STORE to
// `database`, so Cache::put/get, RateLimiter, and helpers that lean on the
// cache hit these tables directly. Without them the `cache` / `rate-limiting`
// pages fatal with "no such table: cache" / "cache_locks". Shape mirrors
// laravel's 0001_01_01_000001_create_cache_table migration exactly.
\Illuminate\Support\Facades\Schema::create('cache', function (\Illuminate\Database\Schema\Blueprint $t) {
    $t->string('key')->primary();
    $t->mediumText('value');
    $t->integer('expiration');
});
\Illuminate\Support\Facades\Schema::create('cache_locks', function (\Illuminate\Database\Schema\Blueprint $t) {
    $t->string('key')->primary();
    $t->string('owner');
    $t->integer('expiration');
});
// `activity_feeds` (Pennant/notifications docs) + `colors` (a one-off docs
// table) — small dedicated seeds so the snippets that touch them resolve
// instead of "no such table".
\Illuminate\Support\Facades\Schema::create('activity_feeds', function (\Illuminate\Database\Schema\Blueprint $t) {
    $t->id();
    $t->unsignedBigInteger('user_id')->nullable();
    $t->string('name')->nullable();
    $t->text('body')->nullable();
    $t->timestamps();
});
\Illuminate\Support\Facades\Schema::create('colors', function (\Illuminate\Database\Schema\Blueprint $t) {
    $t->id();
    $t->string('name')->nullable();
    $t->timestamps();
});
// Misc tables referenced by docs (`patients`, `albums`, `contacts`,
// `sizes`, `corporations`, `incomes`, `membership`, `menu`, `pruned_users`).
// Generic shape — name/body/timestamps + user_id — same as the catch-all
// foreach below, but added here so the names are discoverable when
// extending the corpus.
foreach (['orders', 'accounts', 'addresses', 'roles', 'tags', 'images', 'documents', 'articles', 'books', 'videos', 'podcasts', 'invoices', 'destinations', 'todos', 'customers', 'patients', 'albums', 'contacts', 'sizes', 'corporations', 'incomes', 'membership', 'menu', 'pruned_users', 'merchandise', 'tickets', 'categories'] as $__seedTable) {
    if (\Illuminate\Support\Facades\Schema::hasTable($__seedTable)) {
        continue;
    }
    \Illuminate\Support\Facades\Schema::create($__seedTable, function (\Illuminate\Database\Schema\Blueprint $t) {
        $t->id();
        $t->unsignedBigInteger('user_id')->nullable();
        $t->unsignedBigInteger('customer_id')->nullable();
        $t->string('name')->nullable();
        $t->string('title')->nullable();
        $t->text('body')->nullable();
        $t->integer('votes')->default(0);
        $t->integer('price')->nullable();
        // Tier C (B) — extra columns docs snippets reference on the generic
        // catch-all tables: city/state (orders groupBy), phone (contacts
        // join), amount (incomes subquery), start_date (membership orderBy),
        // food (menu raw case). Nullable so every catch-all table tolerates
        // them with zero cascade.
        $t->string('city')->nullable();
        $t->string('state')->nullable();
        $t->string('phone')->nullable();
        $t->integer('amount')->nullable();
        $t->date('start_date')->nullable();
        $t->string('food')->nullable();
        // Tier D — addresses (type/line_1/postcode) + pruned_users
        // (email/email_verified_at) columns on the catch-all tables.
        $t->string('type')->nullable();
        $t->string('line_1')->nullable();
        $t->string('postcode')->nullable();
        $t->string('email')->nullable();
        $t->timestamp('email_verified_at')->nullable();
        $t->boolean('active')->default(true);
        $t->timestamps();
    });
}
unset($__seedTable);

// Alias commonly-unqualified class names into the global namespace so
// snippets that drop `use App\Models\User;` (`User::find()`) or
// `use Illuminate\Support\Facades\Redis;` (`Redis::throttle(...)`)
// resolve through the global alias rather than fataling with
// `Class "User" not found`. Each entry maps a bare name to its
// canonical FQCN. Skip any alias that:
//   - the snippet itself redeclares (would trigger a Cannot-redeclare
//     fatal once the alias is in the symbol table);
//   - already resolves at this point (e.g. a previous snippet's
//     declaration that survived in a long-lived worker).
$__aliases = [
    'Redis' => \Illuminate\Support\Facades\Redis::class,
    'User' => \App\Models\User::class,
    'Post' => \App\Models\Post::class,
    'Comment' => \App\Models\Comment::class,
    'Article' => \App\Models\Article::class,
    'Order' => \App\Models\Order::class,
    'Customer' => \App\Models\Customer::class,
    'Authenticatable' => \App\Models\Authenticatable::class,
    'Model' => \Illuminate\Database\Eloquent\Model::class,
    'UploadedFile' => \Illuminate\Http\UploadedFile::class,
    'Collection' => \Illuminate\Support\Collection::class,
    'LazyCollection' => \Illuminate\Support\LazyCollection::class,
];
foreach ($__aliases as $__alias => $__target) {
    if (in_array($__alias, $GLOBALS['__declared_classes'] ?? [], true)) {
        continue;
    }
    if (class_exists($__alias, false) || interface_exists($__alias, false)) {
        continue;
    }
    @class_alias($__target, $__alias);
}
unset($__aliases, $__alias, $__target);

// A single seed row in users so `User::find(1)` / `User::first()` /
// `$user->orders` etc. resolve to a real row instead of returning null.
// password is a real bcrypt hash of 'secret' — the placeholder alphabet
// string the previous seed used was rejected by Hash::check / Auth::attempt
// with "This password does not use the Bcrypt algorithm" because PHP's
// password_verify enforces the actual base-64 alphabet, not just length.
\Illuminate\Support\Facades\DB::table('users')->insert([
    'id' => 1,
    'name' => 'Taylor Otwell',
    'email' => 'taylor@laravel.com',
    'password' => '$2y$10$9T8Tco7IwmIWfuY6eCg27.PCbiM3GYhw4vPRhoaPDShigt.Bdm8QK',
    'remember_token' => 'snippet-remember-token',
    'is_admin' => true,
    'active' => true,
    'vip' => true,
    'email_verified_at' => now(),
    'created_at' => now(),
    'updated_at' => now(),
]);

// (Auth::loginUsingId(1) is in snippet-context.php — it has to run
// AFTER the session is attached to the request, otherwise Laravel's
// SessionGuard has nowhere to persist the login.)

// Stub classes / traits the docs reference that no installed package
// provides. Each entry is declared via `eval` into the right namespace,
// guarded by:
//   - class_exists($name, autoload: false) — skip if already loaded
//     (real package present, or earlier snippet's redeclaration);
//   - $GLOBALS['__declared_classes'] — skip if the snippet itself
//     redeclares the FQCN, so the snippet's body wins the symbol-table
//     race (same pattern as the $__aliases block above).
// Stubs use empty bodies (or extend a real parent for shape) — the docs
// snippets that reference them mostly need the class to be loadable for
// `new X(...)` / `Mail::to(...)->send(new X)` / `Bus::dispatch(new X)` /
// `Job::class` resolution. Behaviour is irrelevant because the
// surrounding Bus / Mail / Queue / Event facades are all faked.
// Tier C (C) — shared base for stubbed job classes so `::dispatch()`,
// `Bus::batch([...])->dispatch()`, `->onQueue()`, chain/batch membership,
// `$job->handle()`, and `new X(named: ...)` all resolve through the already-
// faked Bus/Queue facades instead of fataling on an empty stub. The variadic
// constructor swallows positional AND named arguments (PHP collects named
// args into the variadic as a string-keyed array).
if (! class_exists('__SnippetJobStub', false)) {
    @eval('class __SnippetJobStub {
        use \\Illuminate\\Foundation\\Bus\\Dispatchable;
        use \\Illuminate\\Bus\\Queueable;
        use \\Illuminate\\Bus\\Batchable;
        use \\Illuminate\\Queue\\InteractsWithQueue;
        use \\Illuminate\\Queue\\SerializesModels;
        public function __construct(...$args) {}
        public function handle() {}
    }');
}
$__classStubs = [
    // Tier C (C) — job / model / notification stubs mined from deployed
    // "Class not found" stderr. Job-shaped ones extend __SnippetJobStub so
    // dispatch/batch/chain resolve; measured individually, only flippers
    // shipped.
    ['App\\Jobs', 'RecordShipment', '\\__SnippetJobStub'],
    ['App\\Jobs', 'RenderVideo', '\\__SnippetJobStub'],
    ['App\\Jobs', 'UpdateInventory', '\\__SnippetJobStub'],
    ['', 'ProcessPodcast', '\\__SnippetJobStub'],
    ['', 'LoadImportBatch', '\\__SnippetJobStub'],
    ['', 'Job', '\\__SnippetJobStub'],
    ['', 'CheckUptime', '\\__SnippetJobStub'],
    ['', 'TranscribePodcast', '\\__SnippetJobStub'],
    ['', 'ProcessCsvRow', '\\__SnippetJobStub'],
    // (Dropped as measured no-ops: DeleteRecentUsers, Book, UserRoles,
    // DeploymentCompleted — class loads but the next line dereferences null
    // / hits an undefined var / fails an assertion, so the row stays stderr.)
    // App namespaces — Mail / Jobs / Events / Scopes / MCP / Models / AI
    ['App\\Mail', 'OrderShipped', '\\Illuminate\\Mail\\Mailable'],
    ['App\\Mail', 'OrderConfirmation', '\\Illuminate\\Mail\\Mailable'],
    ['App\\Mail', 'InvoicePaid', '\\Illuminate\\Mail\\Mailable'],
    ['App\\Mail', 'PasswordReset', '\\Illuminate\\Mail\\Mailable'],
    ['App\\Jobs', 'OptimizePodcast', null],
    ['App\\Jobs', 'ProcessPodcast', null],
    ['App\\Jobs', 'SendShipmentNotification', null],
    ['App\\Jobs', 'RecordDelivery', null],
    ['App\\Jobs', 'GenerateProfilePhoto', null],
    ['App\\Jobs', 'ProcessOrder', null],
    ['App\\Events', 'UserRegistered', null],
    ['App\\Events', 'OrderShipped', null],
    ['App\\Events', 'NewMessage', null],
    ['App\\Notifications', 'InvoicePaid', '\\Illuminate\\Notifications\\Notification'],
    ['App\\Scopes', 'DestinationFilter', null],
    ['App\\Scopes', 'AncientScope', null],
    ['App\\Mcp\\Servers', 'WeatherServer', null],
    ['App\\Mcp\\Tools', 'CurrentWeatherTool', null],
    ['App\\Ai\\Agents', 'SalesCoach', null],
    ['App\\Models\\Cashier', 'Subscription', null],
    ['App\\Services', 'AppleMusic', null],
    ['App\\Services', 'Transistor', null],
    ['App\\Services', 'PodcastParser', null],
    // Global namespace — bare names the docs use without `use` lines.
    // Eloquent-shaped ones extend Model so query-builder calls (->with(),
    // ::query(), ::find(), ::where(), etc.) work without per-class stubs.
    ['', 'ActivityFeed', '\\Illuminate\\Database\\Eloquent\\Model'],
    ['', 'Category', '\\Illuminate\\Database\\Eloquent\\Model'],
    ['', 'Document', '\\Illuminate\\Database\\Eloquent\\Model'],
    ['', 'Ticket', '\\Illuminate\\Database\\Eloquent\\Model'],
    ['', 'Podcast', '\\Illuminate\\Database\\Eloquent\\Model'],
    ['', 'Image', '\\Illuminate\\Database\\Eloquent\\Model'],
    ['', 'Flight', '\\Illuminate\\Database\\Eloquent\\Model'],
    ['', 'Product', '\\Illuminate\\Database\\Eloquent\\Model'],
    ['', 'Account', '\\Illuminate\\Database\\Eloquent\\Model'],
    ['', 'Role', '\\Illuminate\\Database\\Eloquent\\Model'],
    ['', 'Tag', '\\Illuminate\\Database\\Eloquent\\Model'],
    ['', 'SalesCoach', null],
    ['', 'UserRegistered', null],
    ['', 'NewMessage', null],
    ['', 'Prompt', null],
    ['', 'Resource', null],
    ['', 'RecordDelivery', null],
    ['', 'GenerateProfilePhoto', null],
    ['', 'ProcessOrder', null],
    // Vendor packages we don't bundle but the docs reference.
    ['Laravel\\Socialite', 'Socialite', null],
    ['Laravel\\Passport', 'Passport', null],
    ['Laravel\\Passport', 'Client', null],
    ['Laravel\\Passport', 'ClientRepository', null],
    ['Laravel\\Paddle', 'Cashier', null],
    ['Laravel\\Paddle', 'Subscription', null],
    ['Laravel\\Octane\\Facades', 'Octane', null],
    ['Laravel\\Pulse\\Facades', 'Pulse', null],
    ['Laravel\\Pulse\\Livewire', 'Card', null],
    ['Laravel\\Boost\\Install\\Agents', 'Agent', null],
    ['HelpSpot', 'API', null],
    ['Inertia', 'Middleware', null],
    ['Inertia', 'Inertia', null],
    // PHPUnit constraints docs reference for response assertions.
    ['PHPUnit\\Framework\\Constraint', 'Constraint', null],
];
foreach ($__classStubs as [$__ns, $__short, $__parent]) {
    $__fqcn = $__ns === '' ? $__short : ($__ns . '\\' . $__short);
    // Snippet-redeclared classes get priority — skip stub so the snippet's
    // body declaration wins later. Has to come BEFORE the class_exists()
    // check below, because that check triggers autoload, which goes through
    // the wrapper at the top of this file, which refuses to load names in
    // __declared_classes — leaving the symbol unbound and our stub would
    // race the snippet.
    if (in_array($__fqcn, $GLOBALS['__declared_classes'] ?? [], true)) {
        continue;
    }
    // Autoload-on: if the bundle's PSR-4 tree has a real implementation
    // (e.g. app/Jobs/ProcessPodcast.php — a Dispatchable Job whose static
    // ::dispatch() is documented behaviour), the autoload chain resolves
    // it and our stub is skipped. With autoload off we'd shadow the real
    // class with an empty body and break `ProcessPodcast::dispatch(...)`.
    if (class_exists($__fqcn) || interface_exists($__fqcn) || trait_exists($__fqcn)) {
        continue;
    }
    $__decl = 'class ' . $__short . ($__parent ? ' extends ' . $__parent : '') . ' {}';
    if ($__ns === '') {
        @eval($__decl);
    } else {
        @eval('namespace ' . $__ns . ' { ' . $__decl . ' }');
    }
}
unset($__classStubs, $__ns, $__short, $__parent, $__fqcn, $__decl);

// Stub traits used by docs that aren't installed. Bare empty bodies —
// docs snippets that `use Searchable;` etc. expect the trait to exist for
// the `use` line to compile; the trait methods (e.g. `searchable()`,
// `tokenCan()`) are typically referenced elsewhere on faked/stubbed
// services. Where the trait DOES need callable methods (Billable's
// stripe state probes), the surrounding facade is already faked or the
// User stub provides its own implementation.
$__traitStubs = [
    ['Laravel\\Scout', 'Searchable'],
    ['Laravel\\Passport', 'HasApiTokens'],
    ['Laravel\\Sanctum', 'HasApiTokens'],
    ['Laravel\\Paddle', 'Billable'],
    ['Laravel\\Fortify', 'TwoFactorAuthenticatable'],
    ['Laravel\\Fortify', 'PasskeyAuthenticatable'],
    ['Illuminate\\Bus', 'Queueable'],
    ['', 'Queueable'],
];
foreach ($__traitStubs as [$__ns, $__short]) {
    $__fqcn = $__ns === '' ? $__short : ($__ns . '\\' . $__short);
    if (in_array($__fqcn, $GLOBALS['__declared_classes'] ?? [], true)) {
        continue;
    }
    if (trait_exists($__fqcn) || class_exists($__fqcn) || interface_exists($__fqcn)) {
        continue;
    }
    if ($__ns === '') {
        @eval('trait ' . $__short . ' {}');
    } else {
        @eval('namespace ' . $__ns . ' { trait ' . $__short . ' {} }');
    }
}
unset($__traitStubs, $__ns, $__short, $__fqcn);

// Pre-register common named routes the docs use as link targets for
// route() / redirect()->route() / url() calls. Each maps to a tiny
// closure returning 'ok' — the docs never actually invoke them, they
// just need route() to resolve to a string URL without throwing.
$__routes = $app->make('router');
foreach ([
    'home', 'dashboard', 'profile', 'login', 'register', 'logout',
    'password.request', 'password.email', 'password.reset', 'password.update',
    'verification.notice', 'verification.verify', 'verification.send',
    'users.index', 'users.show', 'users.store', 'users.update', 'users.destroy', 'users.edit', 'users.create',
    'posts.index', 'posts.show', 'posts.store', 'posts.update', 'posts.destroy', 'posts.edit', 'posts.create',
    'profile.show', 'profile.update', 'profile.edit',
    'comments.show', 'comments.store', 'comment.show',
    'post.show',
    'orders.show', 'orders.index',
    'billing.show', 'billing.update', 'billing',
    'unsubscribe',
    'mcp.oauth.github.connect',
] as $__routeName) {
    $__routes->get('/__stub/' . $__routeName . '/{any?}', fn () => 'ok')
        ->name($__routeName)
        ->where('any', '.*');
}
unset($__routeName, $__routes);

// A RouteCollection indexes a route's name in its name-lookup table at
// add() time — but the stubs above call ->name() AFTER ->get() has already
// added the route, so the lookup never records them and route('profile')
// throws RouteNotFoundException even though the route exists. The bundle
// ships a route cache (bootstrap/cache/routes-v7.php), so the active
// collection is a CompiledRouteCollection whose own refreshNameLookups()
// is a no-op and which keeps runtime-added routes in an inner
// RouteCollection. Rebuild that inner table directly so every route()/
// URL::route()/redirect()->route() by name resolves. (~15 snippets across
// urls/responses/routing/helpers/folio/billing/mcp pages.)
$__rc = $app->make('router')->getRoutes();
$__inner = $__rc instanceof \Illuminate\Routing\CompiledRouteCollection
    ? (new \ReflectionProperty($__rc, 'routes'))->getValue($__rc)
    : $__rc;
$__inner->refreshNameLookups();
unset($__rc, $__inner);

// Pre-register stub views referenced by the docs (welcome, dashboard,
// greeting, profile, auth.login, ...). View::addNamespace points the
// loader at /tmp/wasm-views; any view name not found there falls
// through to the configured paths (still empty), so we install a
// global catch-all that returns 'ok' for any view name. The catch-all
// is a Factory binding that wraps the default factory and only
// short-circuits on view-not-found.
$__viewsDir = '/private/tmp/wasm-laravel-app/views';
if (! is_dir($__viewsDir)) @mkdir($__viewsDir, 0777, true);
foreach (['dashboard','greeting','greetings','profile','welcome','home'] as $__viewName) {
    @file_put_contents($__viewsDir . '/' . $__viewName . '.blade.php', '{{ "ok" }}');
}
@mkdir($__viewsDir . '/auth', 0777, true);
@file_put_contents($__viewsDir . '/auth/login.blade.php', '{{ "ok" }}');
$app->make('view')->getFinder()->prependLocation($__viewsDir);
unset($__viewsDir, $__viewName);

// Make Http::fake() the default for the duration of the snippet.
// Every outbound request returns 200 'ok'; snippets that explicitly
// call Http::fake([...]) override this. Without it, every snippet
// using Http::get('https://example.com/...') waits for connect_timeout
// and reports ConnectionException — 19 such snippets in the corpus.
\Illuminate\Support\Facades\Http::fake();

// Same idea for Bus / Queue / Event / Notification / Mail — many
// snippets call ->assertDispatched(), ->assertPushed(), ::fake() etc.
// Pre-faking by default makes those snippets succeed; snippets that
// re-call ::fake([...]) with filters override the no-op fake.
\Illuminate\Support\Facades\Bus::fake();
\Illuminate\Support\Facades\Queue::fake();
\Illuminate\Support\Facades\Event::fake();
\Illuminate\Support\Facades\Notification::fake();
\Illuminate\Support\Facades\Mail::fake();

// Process::fake() makes every Process::run()/start() return a fake 0-exit
// result instead of trying to exec a real binary — the WASM sandbox has no
// shell, so docs snippets like Process::run('bash import.sh') / 'ls -la' /
// 'cat example.txt' otherwise throw ProcessStartFailedException. Snippets
// that call Process::fake([...]) with their own expectations override this.
\Illuminate\Support\Facades\Process::fake();

// Storage::fake() points local + public + s3 + private disks at an
// in-memory filesystem so file read/write ops don't blow up with
// "file does not exist" / EROFS. Snippets that explicitly call
// Storage::fake('disk-name', ...) override the disk.
foreach (['local', 'public', 's3', 'private'] as $__fakeDisk) {
    \Illuminate\Support\Facades\Storage::fake($__fakeDisk);
}
unset($__fakeDisk);

// WASM embed SAPI doesn't expose CLI STDIN/STDOUT/STDERR constants.
// laravel/prompts snippets reference `Laravel\Prompts\STDIN` (a docs
// shorthand that PHP resolves as a const in that namespace). Define
// them — define() with a backslash name creates a namespaced const.
if (! defined('Laravel\\Prompts\\STDIN')) {
    define('Laravel\\Prompts\\STDIN', fopen('php://memory', 'r'));
    define('Laravel\\Prompts\\STDOUT', fopen('php://memory', 'w'));
    define('Laravel\\Prompts\\STDERR', fopen('php://memory', 'w'));
}
if (! defined('STDIN')) {
    define('STDIN', fopen('php://memory', 'r'));
    define('STDOUT', fopen('php://memory', 'w'));
    define('STDERR', fopen('php://memory', 'w'));
}

// Register an 'admin' auth guard mirroring 'web' so docs snippets that
// reference Auth::guard('admin') don't blow up. The provider config
// reuses 'users' — the underlying user model is App\Models\User.
config()->set('auth.guards.admin', [
    'driver' => 'session',
    'provider' => 'users',
]);

// Outbound HTTP from a browser PHP-WASM worker has nowhere to go —
// every docs example targets a host the browser sandbox can't reach.
// Under asyncify the call traps almost immediately; under JSPI the
// socket actually attempts a connection and Guzzle waits for cURL's
// default 10-second CURLOPT_CONNECTTIMEOUT. Twenty-four such snippets
// in the Laravel docs corpus added ~4 minutes of pure wait to the
// sweep. Squeeze the timeout to half a second so the connect attempt
// still happens (preserves "Guzzle reached the socket" semantics that
// JSPI bought us — these snippets still produce useful stderr) but
// fails fast.
Http::globalOptions([
    'connect_timeout' => 0.5,
    'timeout' => 1.0,
]);
// Mirror for raw php streams (fopen / file_get_contents over http://)
// that bypass Guzzle. The cURL extension's own default is set on each
// handle, so the global ini doesn't help there — Http::globalOptions
// above is what covers Guzzle.
ini_set('default_socket_timeout', '1');

// Rebind Laravel's ExceptionHandler so every routed error — runtime
// exception, fatal-via-shutdown, parse error — funnels through the
// same one-line stderr format. Three things we suppress versus the
// default Symfony console renderer Laravel ships:
//   - the "In snippet.php line N:" banner (file is always snippet.php,
//     adds no information for a docs reader);
//   - the multi-line indented Symfony "fancy block" (visual noise);
//   - the Monolog `[YYYY-MM-DD HH:MM:SS] production.ERROR: …` line that
//     LOG_CHANNEL=stderr would otherwise produce — report() is a no-op
//     so Laravel's logger is never invoked for snippet errors.
// The bound handler is resolved on-demand inside
// HandleExceptions::handleException(), so rebinding after bootstrap
// works even though the binding was set during withExceptions(...).
// php-wasm's embed SAPI lacks the STDERR constant; use fopen instead.
$app->singleton(\Illuminate\Contracts\Debug\ExceptionHandler::class, static function (): \Illuminate\Contracts\Debug\ExceptionHandler {
    return new class implements \Illuminate\Contracts\Debug\ExceptionHandler {
        /** @var resource */
        private $stderr;

        public function __construct()
        {
            $this->stderr = fopen('php://stderr', 'w');
        }

        public function report(\Throwable $e): void
        {
            // No-op: silences Laravel's logger (would otherwise emit
            // a `production.ERROR` line to the LOG_CHANNEL destination).
        }

        public function shouldReport(\Throwable $e): bool
        {
            return false;
        }

        public function render($request, \Throwable $e): \Symfony\Component\HttpFoundation\Response
        {
            return new \Symfony\Component\HttpFoundation\Response();
        }

        public function renderForConsole($output, \Throwable $e): void
        {
            fwrite($this->stderr, $e::class . ': ' . $e->getMessage() . "\n");
        }
    };
});

$cloner = new VarCloner();
$dumper = new CliDumper();
// ANSI escapes; the worker converts them to <span>s on the page.
$dumper->setColors(true);
// CliDumper appends OSC 8 hyperlinks with a '^' anchor that renders as
// garbage in a browser. There's no setter — patch via reflection.
(new \ReflectionProperty($dumper, 'handlesHrefGracefully'))
    ->setValue($dumper, false);
VarDumper::setHandler(static fn ($var) => $dumper->dump($cloner->cloneVar($var)));

// Auto-dump for snippets that consist only of bare expression statements
// (e.g. `Str::unwrap('-Laravel-', '-');`). Laravel docs follow Tinker/REPL
// convention: a method call on its own line is implicitly the value to
// display. Real PHP discards it. The rewriter below wraps each top-level
// expression statement with __autodump_value(); at runtime that dumps
// non-null results and silently drops null/void returns (so state-mutators
// like Str::createRandomStringsNormally() stay clean instead of showing
// `null`).
function __autodump_value(mixed $v): mixed
{
    // Dump null too. Laravel docs frequently end snippets with `// null`
    // (e.g. `collect([2,4,6,8])->after('4', strict: true);`); silently
    // dropping null hid those as "(no output)" instead of matching the
    // documented behavior. The minor cost: state-mutator one-liners like
    // `Str::createRandomStringsNormally();` now render `null` as their
    // output, which doubles as a "yes, this ran" signal.
    dump($v);
    return $v;
}

/**
 * Rewrites a PHP snippet so each top-level bare expression statement
 * becomes `\__autodump_value(<expr>);`. Returns null if the snippet
 * already produces explicit output (echo/print/dump/dd/var_dump/return/
 * throw/exit/inline-HTML) — in that case the original source is
 * unchanged. Insertions add no newlines, so line numbers in parse/
 * runtime errors stay aligned with the source the user sees.
 *
 * Heuristics for "wrappable":
 *   - first non-whitespace token of the statement is NOT a non-expression
 *     keyword (namespace, use, class, if, for, function, …);
 *   - the statement contains no top-level `=` (assignment — handled by
 *     the wrapper's existing $__vars auto-dump);
 *   - depth tracking ignores `=` inside (), [], or {} so closures and
 *     array literals don't disqualify the parent statement.
 */
function __autodump_rewrite(string $src): ?string
{
    $tokens = @token_get_all($src);
    if (! $tokens) {
        return null;
    }
    $n = count($tokens);

    // Locate body start (after <?php open tag).
    $startIdx = 0;
    for ($i = 0; $i < $n; $i++) {
        if (is_array($tokens[$i]) && $tokens[$i][0] === T_OPEN_TAG) {
            $startIdx = $i + 1;
            break;
        }
    }

    $skip = [T_WHITESPACE, T_COMMENT, T_DOC_COMMENT];
    $explicitOutput = [T_ECHO, T_PRINT, T_RETURN, T_THROW, T_EXIT, T_INLINE_HTML];
    $explicitFuncs = ['dump', 'dd', 'var_dump', 'print_r', 'var_export', 'echo', 'print'];
    $nonExprKeywords = [
        T_NAMESPACE, T_USE, T_CLASS, T_INTERFACE, T_TRAIT, T_ENUM, T_FUNCTION,
        T_ABSTRACT, T_FINAL, T_READONLY, T_GLOBAL, T_STATIC, T_IF, T_FOR, T_FOREACH,
        T_WHILE, T_DO, T_SWITCH, T_TRY, T_CATCH, T_FINALLY, T_DECLARE, T_GOTO,
        T_BREAK, T_CONTINUE, T_RETURN, T_THROW, T_ECHO, T_PRINT, T_EXIT,
        T_INLINE_HTML, T_CONST, T_ELSE, T_ELSEIF, T_REQUIRE, T_REQUIRE_ONCE,
        T_INCLUDE, T_INCLUDE_ONCE, T_OPEN_TAG, T_CLOSE_TAG, T_OPEN_TAG_WITH_ECHO,
    ];

    // Pass 1: walk top-level. Find statement boundaries (`;` at depth 0).
    // Bail (return null) on any explicit-output marker.
    $depth = 0;
    $paren = 0;
    $bracket = 0;
    $stmtStart = $startIdx;
    $stmts = [];

    for ($i = $startIdx; $i < $n; $i++) {
        $t = $tokens[$i];
        if (is_array($t)) {
            if ($depth === 0 && $paren === 0 && $bracket === 0) {
                if (in_array($t[0], $explicitOutput, true)) {
                    return null;
                }
                if ($t[0] === T_STRING) {
                    $name = strtolower($t[1]);
                    if (in_array($name, $explicitFuncs, true)) {
                        // Confirm function-call shape: not preceded by `->`, `::`, `?->`
                        $prev = null;
                        for ($k = $i - 1; $k >= 0; $k--) {
                            if (is_array($tokens[$k]) && in_array($tokens[$k][0], $skip, true)) continue;
                            $prev = $tokens[$k];
                            break;
                        }
                        $isMember = is_array($prev) && in_array(
                            $prev[0],
                            [T_OBJECT_OPERATOR, T_DOUBLE_COLON, T_NULLSAFE_OBJECT_OPERATOR],
                            true
                        );
                        // Confirm next non-ws is `(`
                        $next = null;
                        for ($k = $i + 1; $k < $n; $k++) {
                            if (is_array($tokens[$k]) && in_array($tokens[$k][0], $skip, true)) continue;
                            $next = $tokens[$k];
                            break;
                        }
                        if (! $isMember && $next === '(') {
                            return null;
                        }
                    }
                }
            }
        } else {
            switch ($t) {
                case '{': $depth++; break;
                case '}': $depth--; break;
                case '(': $paren++; break;
                case ')': $paren--; break;
                case '[': $bracket++; break;
                case ']': $bracket--; break;
                case ';':
                    if ($depth === 0 && $paren === 0 && $bracket === 0) {
                        $stmts[] = [$stmtStart, $i];
                        $stmtStart = $i + 1;
                    }
                    break;
            }
        }
    }

    if (! $stmts) {
        return null;
    }

    // Pass 2: classify each statement and collect wrap targets.
    $wraps = [];
    foreach ($stmts as [$start, $end]) {
        // First non-ws/comment token.
        $firstIdx = null;
        for ($i = $start; $i < $end; $i++) {
            $t = $tokens[$i];
            if (is_array($t) && in_array($t[0], $skip, true)) continue;
            $firstIdx = $i;
            break;
        }
        if ($firstIdx === null) continue; // empty/whitespace-only

        $first = $tokens[$firstIdx];
        if (is_array($first) && in_array($first[0], $nonExprKeywords, true)) continue;

        // Carve-out: skip wrapping `X::macro(...)` calls. These register a
        // state-mutator on the host class and return void, so the auto-dump
        // wrapper would surface a misleading leading `null` ahead of the
        // user's real output. Conservative match — `macro` only for now;
        // extend the list (extend/mixin/partialMock/…) if the sweep
        // surfaces other registration helpers that read the same way.
        $seq = [];
        for ($i = $firstIdx; $i < $end && count($seq) < 4; $i++) {
            $t = $tokens[$i];
            if (is_array($t) && in_array($t[0], $skip, true)) continue;
            $seq[] = $t;
        }
        if (
            count($seq) >= 4
            && is_array($seq[0])
            && in_array($seq[0][0], [T_STRING, T_NAME_QUALIFIED, T_NAME_FULLY_QUALIFIED, T_NAME_RELATIVE], true)
            && is_array($seq[1]) && $seq[1][0] === T_DOUBLE_COLON
            && is_array($seq[2]) && $seq[2][0] === T_STRING && strtolower($seq[2][1]) === 'macro'
            && $seq[3] === '('
        ) {
            continue;
        }

        // Reject statements that contain a top-level `=` (assignment).
        // Track local depth so `=` inside (), [], {} doesn't count.
        $d = $p = $b = 0;
        $hasAssign = false;
        for ($i = $firstIdx; $i < $end; $i++) {
            $t = $tokens[$i];
            if (is_array($t)) continue;
            switch ($t) {
                case '{': $d++; break;
                case '}': $d--; break;
                case '(': $p++; break;
                case ')': $p--; break;
                case '[': $b++; break;
                case ']': $b--; break;
                case '=':
                    if ($d === 0 && $p === 0 && $b === 0) {
                        $hasAssign = true;
                        break 2;
                    }
                    break;
            }
        }
        if ($hasAssign) continue;

        $wraps[] = [$firstIdx, $end];
    }

    if (! $wraps) {
        return null;
    }

    // Pass 3: emit. For each token, append its text. At each wrap's first
    // token, inject `\__autodump_value(`; at the `;` end, inject `)` before.
    $wrapByFirst = [];
    foreach ($wraps as [$firstIdx, $semiIdx]) {
        $wrapByFirst[$firstIdx] = $semiIdx;
    }

    $out = '';
    $i = 0;
    while ($i < $n) {
        if (isset($wrapByFirst[$i])) {
            $semiIdx = $wrapByFirst[$i];
            $out .= '\\__autodump_value(';
            // Emit tokens [i, semiIdx).
            for ($k = $i; $k < $semiIdx; $k++) {
                $out .= is_array($tokens[$k]) ? $tokens[$k][1] : $tokens[$k];
            }
            $out .= ');';
            $i = $semiIdx + 1;
            continue;
        }
        $out .= is_array($tokens[$i]) ? $tokens[$i][1] : $tokens[$i];
        $i++;
    }

    return $out;
}

/**
 * Returns the list of fully-qualified class/interface/trait/enum names
 * declared at top level in the snippet source. Used by the wrapper to
 * gate snippet-context.php's `new User(...)` (and similar future
 * eager instantiations) so the bundle's PSR-4 copy doesn't autoload
 * before the snippet's redeclaration runs — letting the snippet's
 * declaration win the symbol-table race without needing to "undeclare"
 * the bundle's copy (PHP doesn't support that anyway).
 *
 * "Top level" means: not inside another class/interface/trait/enum
 * body. Both statement-form (`namespace App\Models; class User {}`) and
 * brace-form (`namespace App\Models { class User {} }`) namespaces are
 * resolved correctly.
 *
 * Skips three lookalikes for T_CLASS:
 *   - `Foo::class` constant — T_CLASS preceded by T_DOUBLE_COLON
 *   - `new class { ... }` anonymous classes — T_CLASS preceded by T_NEW
 *   - nested class declarations inside another class body — tracked
 *     via the classBraceDepths stack
 *
 * Returns [] on a tokenizer failure (parse-broken snippets fall through
 * to the normal eval path so the report still records the parse error).
 */
function __snippet_declared_classes(string $src): array
{
    $tokens = @token_get_all($src);
    if (! $tokens) {
        return [];
    }
    $n = count($tokens);

    $skip = [T_WHITESPACE, T_COMMENT, T_DOC_COMMENT];

    $classKinds = [T_CLASS, T_INTERFACE, T_TRAIT];
    if (defined('T_ENUM')) {
        $classKinds[] = T_ENUM;
    }

    $nameTokens = [T_STRING, T_NS_SEPARATOR];
    foreach (['T_NAME_QUALIFIED', 'T_NAME_FULLY_QUALIFIED', 'T_NAME_RELATIVE'] as $c) {
        if (defined($c)) {
            $nameTokens[] = constant($c);
        }
    }

    $result = [];
    $currentNs = '';
    $nsBraceStack = [];      // entries: [outerDepth, outerNs]
    $classBraceStack = [];   // entries: outerDepth (depth before class body's '{')
    $braceDepth = 0;

    for ($i = 0; $i < $n; $i++) {
        $t = $tokens[$i];

        if (is_array($t)) {
            if ($t[0] === T_NAMESPACE) {
                $ns = '';
                $jLast = $i;
                for ($j = $i + 1; $j < $n; $j++) {
                    $u = $tokens[$j];
                    if (is_array($u)) {
                        if (in_array($u[0], $skip, true)) {
                            $jLast = $j;
                            continue;
                        }
                        if (in_array($u[0], $nameTokens, true)) {
                            $ns .= $u[1];
                            $jLast = $j;
                            continue;
                        }
                        // Unexpected token — abort namespace parse.
                        break;
                    }
                    if ($u === ';') {
                        $currentNs = ltrim($ns, '\\');
                        $i = $j;
                        break;
                    }
                    if ($u === '{') {
                        $nsBraceStack[] = [$braceDepth, $currentNs];
                        $currentNs = ltrim($ns, '\\');
                        $i = $j - 1;
                        break;
                    }
                    break;
                }
                continue;
            }

            if (in_array($t[0], $classKinds, true)) {
                $prev = null;
                for ($k = $i - 1; $k >= 0; $k--) {
                    if (is_array($tokens[$k]) && in_array($tokens[$k][0], $skip, true)) {
                        continue;
                    }
                    $prev = $tokens[$k];
                    break;
                }
                if (is_array($prev) && ($prev[0] === T_DOUBLE_COLON || $prev[0] === T_NEW)) {
                    continue;
                }

                $name = null;
                for ($j = $i + 1; $j < $n; $j++) {
                    $u = $tokens[$j];
                    if (is_array($u)) {
                        if (in_array($u[0], $skip, true)) {
                            continue;
                        }
                        if ($u[0] === T_STRING) {
                            $name = $u[1];
                        }
                    }
                    break;
                }
                if ($name === null) {
                    continue;
                }

                if (empty($classBraceStack)) {
                    $fqcn = $currentNs === '' ? $name : ($currentNs . '\\' . $name);
                    $result[] = $fqcn;
                }

                for ($j = $i + 1; $j < $n; $j++) {
                    $u = $tokens[$j];
                    if (is_array($u)) {
                        continue;
                    }
                    if ($u === '{') {
                        $classBraceStack[] = $braceDepth;
                        $i = $j - 1;
                        break;
                    }
                    if ($u === ';') {
                        break;
                    }
                }
                continue;
            }
        } else {
            switch ($t) {
                case '{':
                    $braceDepth++;
                    break;
                case '}':
                    $braceDepth--;
                    if (! empty($classBraceStack) && end($classBraceStack) === $braceDepth) {
                        array_pop($classBraceStack);
                    }
                    if (! empty($nsBraceStack) && end($nsBraceStack)[0] === $braceDepth) {
                        [, $outerNs] = array_pop($nsBraceStack);
                        $currentNs = $outerNs;
                    }
                    break;
            }
        }
    }

    return array_values(array_unique($result));
}
