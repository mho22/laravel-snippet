import { test, expect } from '@playwright/test';

import { classify, isTerminalStatus } from './sweep-status.ts';

test.describe('isTerminalStatus', () => {
    test('matches duration, exit and error', () => {
        expect(isTerminalStatus('42 ms')).toBe(true);
        expect(isTerminalStatus('1234 ms')).toBe(true);
        expect(isTerminalStatus('exit 1 · 100 ms')).toBe(true);
        expect(isTerminalStatus('error')).toBe(true);
    });

    test('rejects transitional statuses (the s35 regression source)', () => {
        expect(isTerminalStatus('')).toBe(false);
        expect(isTerminalStatus('Running…')).toBe(false);
        expect(isTerminalStatus('0%')).toBe(false);
        expect(isTerminalStatus('42%')).toBe(false);
        expect(isTerminalStatus('95%')).toBe(false);
    });
});

test.describe('classify', () => {
    test('error → worker-error', () => {
        expect(classify('error', '', 0)).toBe('worker-error');
    });

    test('"<n> ms" with output and no stderr → ran-ok', () => {
        expect(classify('42 ms', 'something', 0)).toBe('ran-ok');
    });

    test('"<n> ms" with empty output → no-output', () => {
        expect(classify('42 ms', '', 0)).toBe('no-output');
        expect(classify('42 ms', '(no output)', 0)).toBe('no-output');
    });

    test('"<n> ms" with stderr → ran-with-stderr', () => {
        expect(classify('42 ms', 'whatever', 1)).toBe('ran-with-stderr');
    });

    test('exit 1 with output and no stderr → ran-ok (dd / Benchmark::dd)', () => {
        expect(classify('exit 1 · 10 ms', 'something', 0)).toBe('ran-ok');
    });

    test('exit 1 with stderr → ran-exit-nonzero', () => {
        expect(classify('exit 1 · 10 ms', 'something', 1)).toBe('ran-exit-nonzero');
    });

    test('exit ≠ 1 → ran-exit-nonzero regardless of output', () => {
        expect(classify('exit 255 · 10 ms', 'something', 0)).toBe('ran-exit-nonzero');
        expect(classify('exit 2 · 10 ms', '', 0)).toBe('ran-exit-nonzero');
    });

    test('transitional statuses → never-completed', () => {
        expect(classify('', '', 0)).toBe('never-completed');
        expect(classify('Running…', '', 0)).toBe('never-completed');
        expect(classify('42%', '', 0)).toBe('never-completed');
    });
});
