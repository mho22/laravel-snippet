<?php

namespace App\Jobs;

use App\Models\Order;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

class ShipOrder implements ShouldQueue
{
    use Queueable;

    public function __construct(public ?Order $order = null) {}

    public function handle(): void
    {
        //
    }
}
