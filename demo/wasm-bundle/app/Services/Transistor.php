<?php

namespace App\Services;

class Transistor
{
    public function release(mixed $podcast = null): mixed
    {
        return $podcast;
    }

    public function broadcast(string $channel, mixed $payload = null): mixed
    {
        return $payload;
    }
}
