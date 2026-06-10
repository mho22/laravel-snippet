<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;

class UserController extends Controller
{
    public function index(): string
    {
        return 'ok';
    }

    public function show(Request $request, int $id = 1): string
    {
        return 'ok';
    }

    public function profile(Request $request): string
    {
        return 'ok';
    }

    public function store(Request $request): string
    {
        return 'ok';
    }

    public function update(Request $request, int $id = 1): string
    {
        return 'ok';
    }

    public function destroy(int $id = 1): string
    {
        return 'ok';
    }
}
