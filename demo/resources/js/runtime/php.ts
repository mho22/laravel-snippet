// Injected by vite.config.js define block. Mirrors ASSET_URL in .env:
// empty in CI sweep (artisan serves at root), '/laravel-snippet' in the
// prod GH Pages build. Without this, a sweep run with cleared ASSET_URL
// hits /laravel-snippet/snippet-worker/index.js → 404 → every snippet
// classifies as worker-error: (no error message).
declare const __ASSET_PREFIX__: string;
const WORKER_URL = `${__ASSET_PREFIX__}/snippet-worker/index.js`;

type PhpResult = {
    type: 'result';
    id: number;
    stdout: string;
    stderr: string;
    exitCode: number;
    tRun: number;
};

type TokenReply = {
    type: 'tokens';
    id: number;
    tokens: Array<[string | null, string]> | null;
};

type FatalReply = {
    type: 'fatal';
    stage: string;
    message: string;
    stack?: string | null;
    name?: string | null;
    filename?: string | null;
    lineno?: number | null;
    colno?: number | null;
    error?: { message: string; stack: string | null; name: string | null } | null;
};

type ReadyReply = { type: 'ready' };

type ProgressReply = { type: 'progress'; percent: number };

type WorkerReply = PhpResult | TokenReply | FatalReply | ReadyReply | ProgressReply;

function describeErrorEvent(e: Event): string {
    const ev = e as ErrorEvent;
    const msg = ev.message || (ev.error && (ev.error.message || String(ev.error)));
    const where = ev.filename ? ` (${ev.filename}:${ev.lineno ?? '?'})` : '';
    return msg ? `${msg}${where}` : '(no error message)';
}

function formatFatal(data: FatalReply): Error {
    const parts: string[] = [`Snippet worker fatal (${data.stage}): ${data.message}`];
    if (data.filename) parts.push(`at ${data.filename}:${data.lineno ?? '?'}:${data.colno ?? '?'}`);
    if (data.error?.message && data.error.message !== data.message) parts.push(`cause: ${data.error.message}`);
    const err = new Error(parts.join(' — '));
    if (data.stack) err.stack = data.stack;
    return err;
}

let workerPromise: Promise<Worker> | null = null;
let workerFatal: Error | null = null;
let workerProgress = 0;
const progressListeners = new Set<(percent: number) => void>();
const pending = new Map<number, (data: WorkerReply) => void>();
let nextId = 0;

function emitProgress(percent: number): void {
    workerProgress = percent;
    for (const cb of progressListeners) cb(percent);
}

function getWorker(): Promise<Worker> {
    if (workerFatal) return Promise.reject(workerFatal);
    if (workerPromise) return workerPromise;
    workerPromise = new Promise((resolve, reject) => {
        const worker = new Worker(WORKER_URL, { type: 'module' });
        const fail = (err: Error) => {
            workerFatal = err;
            console.error('[snippet-worker]', err);
            reject(err);
        };
        const onReady = (e: MessageEvent<WorkerReply>) => {
            if (e.data.type === 'fatal') {
                fail(formatFatal(e.data));
                return;
            }
            if (e.data.type === 'progress') {
                emitProgress(e.data.percent);
                return;
            }
            if (e.data.type !== 'ready') return;
            emitProgress(100);
            worker.removeEventListener('message', onReady);
            worker.addEventListener('message', (event: MessageEvent<WorkerReply>) => {
                const t = event.data.type;
                if (t === 'fatal') {
                    fail(formatFatal(event.data));
                    return;
                }
                if (t !== 'result' && t !== 'tokens') return;
                const callback = pending.get(event.data.id);
                if (!callback) return;
                pending.delete(event.data.id);
                callback(event.data);
            });
            resolve(worker);
        };
        worker.addEventListener('message', onReady);
        worker.addEventListener('error', (e) =>
            fail(new Error(`Snippet worker error: ${describeErrorEvent(e)}`)),
        );
        worker.addEventListener('messageerror', (e) =>
            fail(new Error(`Snippet worker messageerror: ${describeErrorEvent(e)}`)),
        );
    });
    return workerPromise;
}

// Overlap the worker's cold start with the user reading the page,
// instead of paying ~10s after they click Play. Idempotent — getWorker
// memoizes via workerPromise.
export function prewarmWorker(): void {
    void getWorker().catch(() => {
        /* errors surface again on the real click */
    });
}

// Emits the current percentage to new subscribers so the UI can render
// the right value on the first paint without a separate getter. Updates
// are throttled at the worker (~10/sec), so listeners can write to the
// DOM directly.
export function onWorkerProgress(cb: (percent: number) => void): () => void {
    cb(workerProgress);
    progressListeners.add(cb);
    return () => {
        progressListeners.delete(cb);
    };
}

export async function runPhp(code: string): Promise<PhpResult> {
    const worker = await getWorker();
    const id = ++nextId;
    return new Promise((resolve) => {
        pending.set(id, (data) => resolve(data as PhpResult));
        worker.postMessage({ id, code });
    });
}

export async function runTokenize(code: string): Promise<TokenReply> {
    const worker = await getWorker();
    const id = ++nextId;
    return new Promise((resolve) => {
        pending.set(id, (data) => resolve(data as TokenReply));
        worker.postMessage({ id, code, action: 'tokenize' });
    });
}
