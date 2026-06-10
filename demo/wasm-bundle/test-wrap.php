<?php
namespace {
		ini_set('display_errors', '0');
		(static function (): void {
			require "/tmp/wasm-laravel-app/snippet-init.php";
		})();
		require "/tmp/wasm-laravel-app/snippet-context.php";
		$__pre = array_keys(get_defined_vars());
	}
namespace {
use Illuminate\Support\Collection;
use Illuminate\Support\Str;

Collection::macro('toUpper', function () {
    return $this->map(function (string $value) {
        return Str::upper($value);
    });
});

$collection = collect(['first', 'second']);

$upper = $collection->toUpper();

// ['FIRST', 'SECOND']
$__vars = array_filter(
	get_defined_vars(),
	static fn (string $n): bool =>
		!in_array($n, $__pre, true)
		&& $n[0] !== '_'
		&& $n !== 'GLOBALS'
		&& $n !== 'argv'
		&& $n !== 'argc',
	ARRAY_FILTER_USE_KEY
);
$__last = array_key_last($__vars);
if ($__last !== null) {
	dump($__vars[$__last]);
}
}

