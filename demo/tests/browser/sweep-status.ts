export type Bucket =
    | 'ran-ok'
    | 'ran-with-stderr'
    | 'ran-exit-nonzero'
    | 'worker-error'
    | 'no-output'
    | 'never-completed';

export const ALL_BUCKETS: Bucket[] = [
    'ran-ok',
    'ran-with-stderr',
    'ran-exit-nonzero',
    'worker-error',
    'no-output',
    'never-completed',
];

// A *positive* terminal match (instead of "anything that isn't
// 'Running…'") keeps the sweep poll from settling on the percentage
// strings the snippet UI now emits while the worker boots.
export function isTerminalStatus(status: string): boolean {
    return /^\d+\s+ms$/.test(status) || status.startsWith('exit ') || status === 'error';
}

export function classify(
    status: string,
    outputText: string,
    stderrCount: number,
): Bucket {
    if (status === 'error') return 'worker-error';
    if (status.startsWith('exit ')) {
        // dd() / Benchmark::dd() / $collection->dd() exit(1) after printing
        // their dump — documented Laravel behavior, not a snippet failure.
        const trimmed = outputText.trim();
        const hasOutput = trimmed !== '' && trimmed !== '(no output)';
        if (status.startsWith('exit 1 ') && stderrCount === 0 && hasOutput) {
            return 'ran-ok';
        }
        return 'ran-exit-nonzero';
    }
    if (/^\d+\s+ms$/.test(status)) {
        if (stderrCount > 0) return 'ran-with-stderr';
        if (outputText.trim() === '' || outputText.trim() === '(no output)') {
            return 'no-output';
        }
        return 'ran-ok';
    }
    return 'never-completed';
}
