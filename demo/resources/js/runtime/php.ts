const WORKER_URL = '/laravel-snippet/snippet-worker/index.js';

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

type WorkerReply = PhpResult | TokenReply;

let workerPromise: Promise<Worker> | null = null;
const pending = new Map<number, (data: WorkerReply) => void>();
let nextId = 0;

function getWorker(): Promise<Worker> {
    if (workerPromise) return workerPromise;
    workerPromise = new Promise((resolve, reject) => {
        const worker = new Worker(WORKER_URL, { type: 'module' });
        const onReady = (e: MessageEvent) => {
            if (e.data.type !== 'ready') return;
            worker.removeEventListener('message', onReady);
            worker.addEventListener('message', (event: MessageEvent<WorkerReply>) => {
                const t = event.data.type;
                if (t !== 'result' && t !== 'tokens') return;
                const callback = pending.get(event.data.id);
                if (!callback) return;
                pending.delete(event.data.id);
                callback(event.data);
            });
            resolve(worker);
        };
        worker.addEventListener('message', onReady);
        worker.addEventListener('error', reject);
    });
    return workerPromise;
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
