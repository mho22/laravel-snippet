import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const replies = [];
page.on('console', (msg) => {
    const t = msg.text();
    if (t.startsWith('[probe.<-')) replies.push(t);
});
await page.addInitScript(() => {
    const RealWorker = self.Worker;
    self.Worker = new Proxy(RealWorker, {
        construct(t, args) {
            const w = new t(...args);
            w.addEventListener('message', (e) => {
                const data = e.data;
                if (data?.type === 'result') {
                    self.__probeResult = data;
                    console.log(`[probe.<- result] stdout-len=${data.stdout?.length || 0} stderr-len=${data.stderr?.length || 0} exit=${data.exitCode} t=${data.tRun}`);
                    console.log(`[probe.<- result.stderr] ${JSON.stringify(data.stderr)}`);
                    console.log(`[probe.<- result.stdout-head] ${JSON.stringify((data.stdout || '').slice(0, 200))}`);
                } else {
                    console.log(`[probe.<- ${data?.type}]`, JSON.stringify(data).slice(0, 600));
                }
            });
            return w;
        }
    });
});

await page.goto('http://localhost:8000/docs/13.x/strings', { waitUntil: 'load', timeout: 60000 });
await page.waitForTimeout(2000);

const snippet = process.argv[2] || `throw new \\RuntimeException('boom');`;
await page.evaluate((code) => {
    const el = document.querySelector('.laravel-snippet pre code');
    if (!el) throw new Error('no code el');
    const lines = code.split('\n').map(l => `<span class="line">${l.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</span>`).join('');
    el.innerHTML = lines;
}, snippet);

await page.locator('.laravel-snippet').first().locator('button.laravel-snippet__run').click();
await page.waitForTimeout(15000);

for (const r of replies) console.log(r);
await browser.close();
