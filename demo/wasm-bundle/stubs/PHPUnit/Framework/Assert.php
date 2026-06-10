<?php

namespace PHPUnit\Framework;

/**
 * Minimal stand-in for PHPUnit\Framework\Assert. The framework's
 * require-dev exclusion at bundle build time means the real class is
 * absent. Doc snippets that read like `$this->assertSee(...)` or
 * `PHPUnit\Framework\Assert::assertEquals(...)` only need these methods
 * to exist and not throw — they're never used to actually verify
 * behavior inside a docs reader's browser.
 */
class Assert
{
    public static function __callStatic(string $name, array $arguments): void
    {
        // accept any assertion call and succeed silently
    }

    public function __call(string $name, array $arguments): void
    {
        // accept any assertion call and succeed silently
    }

    public static function fail(string $message = ''): void
    {
        //
    }
}
