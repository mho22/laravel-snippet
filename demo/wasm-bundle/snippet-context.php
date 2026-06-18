<?php

declare(strict_types=1);

/**
 * Variables Laravel docs PHP fences commonly reference without first
 * defining them ($user, $request, $browser, $table, …). Required in
 * the snippet's namespace block right before the snippet body so the
 * locals leak into the snippet's scope.
 *
 * Values are chosen to be useful instances of real Laravel types where
 * possible. $browser is the exception — laravel/dusk is unbundled, so
 * it's a fluent-chain stub that returns $this for any method.
 */

use App\Models\User;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Collection;
use Illuminate\Support\MessageBag;
use Illuminate\Support\Str;
use Illuminate\Support\ViewErrorBag;
use Illuminate\Testing\TestResponse;
use Illuminate\Validation\Factory as ValidationFactory;

/** @var \Illuminate\Foundation\Application $__app */
$__app = app();

// class_exists(User::class) triggers autoload. The autoload wrapper
// installed in snippet-init.php refuses to load template classes the
// snippet redeclares (reading $GLOBALS['__declared_classes'] populated
// by the pre-scan); on a refusal class_exists returns false and we
// fall through to the $user = null branch. Snippets that do not
// redeclare User get the full context as before. Definition-only
// snippets (the dominant case for redeclares) don't reference
// $user/$users/$post/etc. anyway, so the null fallback doesn't break
// them.
if (class_exists(User::class)) {
    $user = new User([
        'name' => 'Taylor Otwell',
        'email' => 'taylor@laravel.com',
    ]);
    $user->id = 1;
    $user->exists = true;

    $users = new Collection([$user]);
} else {
    $user = null;
    $users = new Collection();
}

$request = Request::create('/example', 'GET', ['name' => 'Taylor']);
// Attach a session store so any docs snippet calling
// $request->session()->put(...) / get(...) / regenerate() works without
// the SessionMiddleware stack. Driver is array so nothing persists past
// the snippet's run — fine for runnable-doc semantics.
$__sessionStore = $__app->make('session')->driver();
$__sessionStore->start();
$request->setLaravelSession($__sessionStore);
// Seed a `errors` ViewErrorBag with non-empty default + auth bags so
// snippets calling `$response->assertSessionHasErrors(['name','email'])`
// or `session('errors')->getBag('default')->first('field')` don't fatal
// with "Call to a member function getBag() on null". The bag content is
// permissive (every common field name gets a sample message) so the
// assertion variants `assertSessionHasErrors(['x','y'])` succeed across
// the docs corpus without per-snippet tailoring.
$__seededErrors = new ViewErrorBag();
$__seededErrors->put('default', new MessageBag([
    'name' => ['The name field is required.'],
    'email' => ['The email field must be a valid email address.'],
    'title' => ['The title field is required.'],
    'password' => ['The password field is required.'],
    'role_id' => ['The role id field is required.'],
    'photo' => ['The photo must be an image.'],
]));
$__sessionStore->put('errors', $__seededErrors);
unset($__sessionStore, $__seededErrors);
$__app->instance('request', $request);

// Authenticate the seeded user so `Auth::user()`, `$request->user()`,
// `auth()->id()`, and `Auth::check()` all resolve to a real instance
// instead of returning null. Has to run AFTER the request + its session
// are bound — SessionGuard writes the login ID into the session, and the
// session has to exist at that point. ~25 docs snippets chain off
// `Auth::user()->isAdmin()` / `$request->user()->is_admin` and previously
// fataled with "Call to a member function isAdmin() on null" /
// "Attempt to read property 'is_admin' on null".
\Illuminate\Support\Facades\Auth::loginUsingId(1);

$response = TestResponse::fromBaseResponse(new Response('OK', 200));

$__conn = $__app->make('db')->connection();
$__conn->useDefaultSchemaGrammar();
$table = new Blueprint($__conn, 'users');
unset($__conn);

$browser = new class {
    public function __call(string $name, array $args): self
    {
        return $this;
    }
    public function __get(string $name): self
    {
        return $this;
    }
};

$post = $user;
$posts = $users;
$flight = $user;
$flights = $users;
$order = $user;
$orders = $users;
$article = $user;
$articles = $users;
$book = $user;
$books = $users;
$document = $user;
$documents = $users;

$collection = new Collection([1, 2, 3, 4, 5]);
$array = [1, 2, 3, 4, 5];
$string = 'Hello, Laravel!';

// strings.md (trans_choice): echo trans_choice('messages.notifications', $unreadCount);
$unreadCount = 5;

// strings.md (fluent decrypt): $decrypted = $encrypted->decrypt();
$encrypted = Str::of('secret')->encrypt();

/*
 * Bulk defaults — these are names the docs assume are pre-defined in a
 * given section but never set up inside the fence itself. Values are
 * chosen so chained calls and `print_r` don't choke. Snippet scope can
 * reassign any of them with no ill effect.
 */

// Strings — generic placeholders the docs slot into Dusk selectors,
// Validator field names, mail recipients, cache keys, URL pieces.
$field = 'email';
$selector = '@email';
$name = 'taylor';
$key = 'cache_key';
$value = 'sample value';
$uri = '/users';
$email = 'taylor@laravel.com';
$content = 'Sample content';
$contents = 'Sample contents';
$cookieName = 'session';
$store = 'redis';
$linkText = 'Click here';
$directory = '/path/to/dir';
$path = '/path/to/file.txt';
$pathToFile = '/path/to/file.txt';
$filePath = '/path/to/file.txt';
$code = 'abc123';
$property = 'name';
$headerName = 'X-Custom-Header';
$routeName = 'users.index';
$title = 'Sample Title';
$url = 'https://laravel.com';
$scheme = 'https';
$host = 'laravel.com';
$text = 'Sample text';
$message = 'Sample message';
$button = 'submit';
$channel = 'general';
$server = 'localhost';
$query = 'SELECT * FROM users';
$paymentMethod = 'pm_card_visa';
$paymentMethodId = 'pm_card_visa';
$invoiceId = 'in_1234567890';
$coupon = 'PROMO2025';
$successUrl = 'https://laravel.com/billing/success';
$currentPassword = 'secret';
$hashedPassword = '$2y$10$abcdefghijklmnopqrstuvwxyz1234567890ABCDEFGHIJKLMNOP';
$hashed = $hashedPassword;
$encryptedValue = 'eyJpdiI6ImFiYyJ9';
$codeVerifier = 'verifier_abc';
$accessToken = 'token_abc';
$nonce = 'nonce_abc';
$from = 'system@laravel.com';
$user_id = 1;

// Ints — counts, durations, identifiers.
$seconds = 60;
$minutes = 5;
$port = 8080;
$userId = 1;
// Sentinel rather than 0 so the wrapper's `$__pre[$n] !== $v` filter does
// NOT reject `$count = $foo->count();` reassignments to the empty-result
// value 0 — without this, a snippet like
// `$count = $hugeCollection->where(...)->count();` (very common across the
// collections / queries / eloquent pages) silently produces "(no output)"
// whenever the post-filter count is genuinely 0. PHP_INT_MIN can never
// equal a real `->count()` return, so any reassignment passes through.
$count = PHP_INT_MIN;

// Arrays — input bags, headers, generic data dictionaries.
$data = ['name' => 'Taylor', 'email' => 'taylor@laravel.com'];
$input = ['name' => 'Taylor', 'email' => 'taylor@laravel.com'];
$options = [];
$headers = ['Accept' => 'application/json'];
$credentials = ['email' => 'taylor@laravel.com', 'password' => 'secret'];
$paths = ['/path/one', '/path/two'];
$keys = ['key.one', 'key.two'];
$metrics = ['count' => 0];
$developers = ['Taylor', 'Dries'];
$parameters = [];
$rules = ['email' => 'required|email'];
$attribute = 'email';
$password = 'secret';
$roleId = 1;
$podcast = null;
$evenMoreUsers = $users;
$invoice = null;
$update = null;
$values = [];
$id = 1;
$words = ['hello', 'world'];
$type = 'pdf';
$failureUrl = 'https://laravel.com/billing/cancelled';
$category = 'general';
$amount = 1000;
$role = null;
$resource = null;
$expectedValue = 'expected';
$to = 'taylor@laravel.com';
$output = '';
$accountActive = true;
$e = new \RuntimeException('Sample exception');

// Closures / callables — generic identity / no-op shapes.
$callback = static fn ($value = null) => $value;
$condition = static fn () => true;
$fail = static fn (string $message = '') => null;
$shouldReport = static fn (\Throwable $e) => true;
$reportingDisabled = false;

// Booleans / scalars / nullable shapes.
$default = null;
$var = null;
$something = null;
$photo = null;
$batch = null;
$transaction = null;
$transactions = new Collection();
$subscription = null;
$billable = $user;
$author = $user;
$john = $user;
$anotherPost = $post;
$moreUsers = $users;
$hugeCollection = new Collection(range(1, 1000));
$middleware = [];
$destination = '/path/to/destination';
$job = null;
$event = null;
$container = $__app;
$client = null;
$process = null;
$pool = null;

// Errors / validators — view-level error bag wrapping a message bag, so
// chained `$errors->first('field')` etc. work without a real session.
$errors = new ViewErrorBag();
$errors->put('default', new MessageBag());
$errorBag = $errors->getBag('default');

/** @var ValidationFactory $__validatorFactory */
$__validatorFactory = $__app->make('validator');
$validator = $__validatorFactory->make([], []);
unset($__validatorFactory);

// AI/embedding-shaped — laravel/ai docs reference these as placeholders.
$queryEmbedding = array_fill(0, 8, 0.0);

// Single-occurrence placeholders the docs reference without defining them
// in-fence — surfaced by the sweep as "Undefined variable". Conservative
// shapes so a chained call doesn't trade the undefined-variable stderr for
// a type error. ($words is already defined above; not repeated here.)
$sizeInKilobytes = 256;
$width = 100;
$creditsAvailable = 100;
$remember = true;
$expires = 3600;
$video = null;
$alias = 'example';
$encoded = 'encoded-value';
$domain = 'laravel.com';
$token = 'token_abc';
$messages = ['The name field is required.'];
$results = new Collection();

// Tier C (A) — non-Stripe undefined vars surfaced by the sweep's deployed
// stderr. Each shape is picked so a chained call doesn't trade the
// undefined-variable stderr for a type error. $stripeId is deliberately
// EXCLUDED (it cascades into live Stripe network calls). The ai-sdk
// first*/second* pairs MUST be added together — a fence references both, so
// defining only one still throws on the other.
$firstImage = 'fake-image-bytes';
$secondImage = 'fake-image-bytes';
$firstAudio = 'fake-audio-bytes';
$secondAudio = 'fake-audio-bytes';
$firstEmbeddingVector = array_fill(0, 8, 0.0);
$secondEmbeddingVector = array_fill(0, 8, 0.0);
$pinned = true;
$secure = true;
$height = 100;
$pdfData = 'fake-pdf-bytes';
$accountSuspended = false;
$tokenId = 1;

// Tier D — two more undefined vars from post-Tier-C stderr. $anne mirrors
// $john (a User stand-in for a cache-tags example); $httpOnly pairs with the
// $secure cookie flag above (responses#9 passes both into ->cookie()).
$anne = $user;
$httpOnly = true;

unset($__app);
