<?php

namespace PHPUnit\Framework;

/**
 * Minimal TestCase so `class Foo extends TestCase { ... $this->assert*}`
 * snippets parse and run. All assertion methods are caught by __call
 * on Assert.
 */
class TestCase extends Assert
{
    protected function setUp(): void
    {
        //
    }

    protected function tearDown(): void
    {
        //
    }
}
