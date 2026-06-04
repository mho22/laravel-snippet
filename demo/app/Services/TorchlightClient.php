<?php

declare(strict_types=1);

namespace App\Services;

use Illuminate\Support\Facades\Http;
use RuntimeException;

final class TorchlightClient
{
    public function id(string $language, string $code): string
    {
        return sha1($language."\0".config('docs.torchlight_theme')."\0".$code);
    }

    /**
     * @return array<string, mixed>|null
     */
    public function read(string $id): ?array
    {
        $path = $this->path($id);
        if (! is_file($path)) {
            return null;
        }
        $decoded = json_decode((string) file_get_contents($path), true);

        return is_array($decoded) ? $decoded : null;
    }

    /**
     * @param  array<string, mixed>  $block
     */
    public function write(string $id, array $block): void
    {
        $dir = config('docs.torchlight_cache');
        if (! is_dir($dir)) {
            mkdir($dir, 0777, true);
        }
        file_put_contents(
            $this->path($id),
            json_encode($block, JSON_THROW_ON_ERROR | JSON_PRETTY_PRINT),
        );
    }

    /**
     * @param  array<int, array<string, mixed>>  $blocks
     * @return array<int, array<string, mixed>>
     */
    public function fetch(array $blocks): array
    {
        $token = config('services.torchlight.token') ?? env('TORCHLIGHT_TOKEN');
        if (! is_string($token) || $token === '') {
            throw new RuntimeException('TORCHLIGHT_TOKEN missing — populate demo/.env');
        }

        $response = Http::withToken($token)
            ->acceptJson()
            ->timeout(30)
            ->post('https://api.torchlight.dev/highlight', ['blocks' => $blocks]);

        if (! $response->successful()) {
            throw new RuntimeException("Torchlight API {$response->status()}: {$response->body()}");
        }

        return $response->json('blocks') ?? [];
    }

    private function path(string $id): string
    {
        return config('docs.torchlight_cache').'/'.$id.'.json';
    }
}
