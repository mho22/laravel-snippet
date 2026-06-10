<?php

namespace App\Enums;

enum ServerStatus: string
{
    case Provisioning = 'provisioning';
    case Active = 'active';
    case Stopped = 'stopped';
    case Failed = 'failed';
}
