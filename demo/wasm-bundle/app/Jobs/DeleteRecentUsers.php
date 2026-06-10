<?php

namespace App\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable as FoundationQueueable;

class DeleteRecentUsers implements ShouldQueue
{
    use FoundationQueueable;

    public function handle(): void
    {
        //
    }
}
