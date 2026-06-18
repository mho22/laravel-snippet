<?php

namespace App;

class PodcastStats
{
    public function __construct(public int $downloads = 0, public int $plays = 0) {}

    public static function for(mixed $podcast): self
    {
        return new self();
    }
}
