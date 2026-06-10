<?php

namespace App\Jobs;

use App\Models\User;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

class ProcessUser implements ShouldQueue
{
    use Queueable;

    public function __construct(public ?User $user = null) {}

    public function handle(): void
    {
        //
    }
}
