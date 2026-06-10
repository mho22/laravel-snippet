<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;

class UserIndexController extends Controller
{
    public function __invoke(Request $request): string
    {
        return 'ok';
    }
}
