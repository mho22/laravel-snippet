<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use Illuminate\Support\Facades\File;
use Inertia\Inertia;
use Inertia\Response;

final class ReportController
{
    public function show(): Response
    {
        $base = base_path('tests/browser');
        $reportJson = $base.'/report.json';
        $resultsDir = $base.'/results';
        $markdownDir = resource_path('markdown/13.x');

        Inertia::setRootView('report');

        if (! File::exists($reportJson) && ! File::isDirectory($resultsDir)) {
            return Inertia::render('Report', [
                'available' => false,
                'totals' => (object) [],
                'perPageRows' => [],
                'results' => [],
                'bucketOrder' => $this->bucketOrder(),
                'inputs' => (object) [],
            ]);
        }

        $results = $this->loadResults($reportJson, $resultsDir);
        $inputs = $this->loadInputs($markdownDir);

        return Inertia::render('Report', [
            'available' => true,
            'totals' => $this->totals($results),
            'perPageRows' => $this->perPageRows($results),
            'results' => $results,
            'bucketOrder' => $this->bucketOrder(),
            'inputs' => $inputs,
        ]);
    }

    /**
     * @return list<string>
     */
    private function bucketOrder(): array
    {
        return [
            'ran-ok',
            'ran-with-stderr',
            'ran-exit-nonzero',
            'worker-error',
            'no-output',
            'never-completed',
        ];
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function loadResults(string $reportJson, string $resultsDir): array
    {
        $results = [];

        if (File::isDirectory($resultsDir)) {
            $files = collect(File::files($resultsDir))
                ->filter(fn ($f) => str_ends_with($f->getFilename(), '.json'))
                ->sortBy(fn ($f) => $f->getFilename());
            foreach ($files as $file) {
                $decoded = json_decode((string) file_get_contents($file->getPathname()), true);
                if (is_array($decoded)) {
                    foreach ($decoded as $row) {
                        $results[] = $row;
                    }
                }
            }
        } elseif (File::exists($reportJson)) {
            $decoded = json_decode((string) file_get_contents($reportJson), true);
            if (is_array($decoded)) {
                $results = $decoded;
            }
        }

        usort($results, function ($a, $b) {
            $pageCmp = strcmp((string) ($a['page'] ?? ''), (string) ($b['page'] ?? ''));
            return $pageCmp !== 0 ? $pageCmp : (((int) ($a['index'] ?? 0)) - ((int) ($b['index'] ?? 0)));
        });

        return $results;
    }

    /**
     * @return array<string, list<string>>
     */
    private function loadInputs(string $markdownDir): array
    {
        $inputs = [];
        if (! File::isDirectory($markdownDir)) {
            return $inputs;
        }
        foreach (File::files($markdownDir) as $file) {
            if (! str_ends_with($file->getFilename(), '.md')) {
                continue;
            }
            $slug = preg_replace('/\.md$/', '', $file->getFilename()) ?? '';
            $text = (string) file_get_contents($file->getPathname());
            preg_match_all('/```php\n([\s\S]*?)\n```/', $text, $matches);
            $inputs[$slug] = $matches[1] ?? [];
        }
        return $inputs;
    }

    /**
     * @param  list<array<string, mixed>>  $results
     * @return array<string, int>
     */
    private function totals(array $results): array
    {
        $totals = array_fill_keys($this->bucketOrder(), 0);
        foreach ($results as $r) {
            $b = (string) ($r['bucket'] ?? '');
            if (isset($totals[$b])) {
                $totals[$b]++;
            }
        }
        return $totals;
    }

    /**
     * @param  list<array<string, mixed>>  $results
     * @return list<array<string, mixed>>
     */
    private function perPageRows(array $results): array
    {
        $buckets = $this->bucketOrder();
        $perPage = [];
        foreach ($results as $r) {
            $page = (string) ($r['page'] ?? '');
            if (! isset($perPage[$page])) {
                $perPage[$page] = array_fill_keys($buckets, 0);
            }
            $b = (string) ($r['bucket'] ?? '');
            if (isset($perPage[$page][$b])) {
                $perPage[$page][$b]++;
            }
        }

        $rows = [];
        foreach ($perPage as $page => $counts) {
            $total = array_sum($counts);
            $rows[] = ['page' => $page, ...$counts, 'total' => $total];
        }
        usort($rows, fn ($a, $b) => strcmp($a['page'], $b['page']));
        return $rows;
    }
}
