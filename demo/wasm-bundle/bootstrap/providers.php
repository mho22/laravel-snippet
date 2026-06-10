<?php

use App\Providers\AppServiceProvider;

// Gate the bundle's AppServiceProvider behind class_exists(). The
// autoload wrapper installed in snippet-init.php refuses to load
// template classes the snippet redeclares (per composer.json's PSR-4
// prefixes); on a refusal class_exists returns false, the FQCN never
// reaches ProviderRepository::createProvider(), and the snippet's own
// redeclaration lands into an empty symbol-table slot. Without the
// wrapper this would just be `return [AppServiceProvider::class]`.
// Laravel's ProviderRepository::shouldRecompile() auto-rebuilds
// bootstrap/cache/services.php when this list changes, so the manifest
// cache stays in sync without us touching it.
$providers = [];

if (class_exists(AppServiceProvider::class)) {
    $providers[] = AppServiceProvider::class;
}

return $providers;
