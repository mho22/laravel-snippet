import { chromium } from 'playwright';

const url = process.argv[2] || 'http://localhost:5187/docs/13.x/strings';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
const page = await ctx.newPage();

const logs = [];
page.on('console', (msg) => logs.push(`[console.${msg.type()}] ${msg.text()}`));
page.on('pageerror', (err) => logs.push(`[pageerror] ${err.message}\n${err.stack}`));
page.on('requestfailed', (req) => logs.push(`[requestfailed] ${req.url()} :: ${req.failure()?.errorText}`));
page.on('response', (res) => {
    const u = res.url();
    if (res.status() >= 400) logs.push(`[http ${res.status()}] ${u}`);
});
page.on('worker', (worker) => {
    logs.push(`[worker-created] ${worker.url()}`);
    worker.on('console', (msg) => logs.push(`[worker.${msg.type()}] ${msg.text()}`));
    worker.on('pageerror', (err) => logs.push(`[worker pageerror] ${err.message}\n${err.stack}`));
    worker.on('close', () => logs.push(`[worker-closed] ${worker.url()}`));
});

// Override Worker constructor before any page script runs
await page.addInitScript(() => {
    const RealWorker = self.Worker;
    self.Worker = new Proxy(RealWorker, {
        construct(t, args) {
            const w = new t(...args);
            console.log('[probe] Worker constructed', String(args[0]), JSON.stringify(args[1] || {}));
            w.addEventListener('error', (e) => {
                console.log('[probe] worker error event', JSON.stringify({
                    message: e.message, filename: e.filename, lineno: e.lineno, colno: e.colno,
                    hasError: !!e.error, errorMsg: e.error?.message, errorStack: e.error?.stack,
                }));
            });
            w.addEventListener('messageerror', (e) => {
                console.log('[probe] worker messageerror', String(e));
            });
            const origPost = w.postMessage.bind(w);
            w.postMessage = (data, ...rest) => {
                console.log('[probe] -> worker.postMessage', JSON.stringify(data).slice(0, 200));
                return origPost(data, ...rest);
            };
            w.addEventListener('message', (e) => {
                console.log('[probe] <- worker.message', JSON.stringify(e.data).slice(0, 400));
            });
            return w;
        }
    });
});

await page.goto(url, { waitUntil: 'load', timeout: 60000 });
await page.waitForTimeout(2000);

const buttons = await page.$$('button.laravel-snippet__run');
logs.push(`[buttons] found ${buttons.length} run buttons`);
if (buttons.length > 0) {
    await buttons[0].click();
    logs.push(`[click] first Run button`);
}

await page.waitForTimeout(60000);

console.log('=== LOGS ===');
console.log(logs.join('\n'));

await browser.close();
