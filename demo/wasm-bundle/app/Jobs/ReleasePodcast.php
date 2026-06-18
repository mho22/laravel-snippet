<?php

namespace App\Jobs;

use App\Models\Podcast;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

class ReleasePodcast implements ShouldQueue
{
    use Queueable;

    public function __construct(public ?Podcast $podcast = null) {}

    public function handle(): void
    {
        //
    }
}
