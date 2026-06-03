<?php

declare(strict_types=1);

require __DIR__ . '/vendor/autoload.php';

use Illuminate\Config\Repository as ConfigRepository;
use Illuminate\Filesystem\FilesystemServiceProvider;
use Illuminate\Foundation\Application;
use Illuminate\Support\Facades\Facade;
use Illuminate\Translation\TranslationServiceProvider;
use Symfony\Component\VarDumper\Cloner\VarCloner;
use Symfony\Component\VarDumper\Dumper\CliDumper;
use Symfony\Component\VarDumper\VarDumper;

$cloner = new VarCloner();
$dumper = new CliDumper();
// ANSI escapes; snippet.js converts to <span> with the Palenight palette.
$dumper->setColors(true);
// CliDumper appends OSC 8 hyperlinks with a '^' anchor (clickable in a
// terminal, garbage in a browser). Disable via reflection — no setter.
(new \ReflectionProperty($dumper, 'handlesHrefGracefully'))
	->setValue($dumper, false);
VarDumper::setHandler(static fn ($var) => $dumper->dump($cloner->cloneVar($var)));

// Full Illuminate\Foundation\Application so Laravel service providers can
// register as-shipped (translator needs $app['files'], $app['path.lang'],
// $app->getLocale() — none of which exist on a bare Container).
$app = new Application('/bundle');
Facade::setFacadeApplication($app);

// Minimum config so Application::getLocale() / getFallbackLocale() resolve.
// Real Laravel reads these from config/app.php; we ship just the keys
// Application looks up directly.
$app->instance('config', new ConfigRepository([
	'app' => [
		'locale' => 'en',
		'fallback_locale' => 'en',
	],
]));

// Filesystem first — 'files' is bound here, which TranslationServiceProvider's
// FileLoader depends on. Order matters: each provider declares its needs via
// the container but doesn't bind its deps itself.
$app->register(new FilesystemServiceProvider($app));
$app->register(new TranslationServiceProvider($app));
