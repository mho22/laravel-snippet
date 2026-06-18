<?php

namespace App\Events;

use App\Models\Order;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class OrderShipmentStatusUpdated
{
    use Dispatchable, SerializesModels;

    public function __construct(public ?Order $order = null, public string $status = 'shipped') {}
}
