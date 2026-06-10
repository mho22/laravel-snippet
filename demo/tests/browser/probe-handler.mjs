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
                console.log(`[probe.<- ${e.data?.type}]`, JSON.stringify(e.data).slice(0, 4000));
            });
            return w;
        }
    });
});

await page.goto('http://localhost:8000/docs/13.x/strings', { waitUntil: 'load', timeout: 60000 });
await page.waitForTimeout(2000);

// Replace the first snippet's source with our probe, then click run.
await page.evaluate(() => {
    const el = document.querySelector('.laravel-snippet pre code');
    if (!el) throw new Error('no code el');
    // Use textContent so readSource picks it up via :scope > .line
    el.innerHTML = `<span class="line">${`<?php
$prev = set_exception_handler(null);
set_exception_handler($prev);
echo "active handler: ";
if (is_array($prev)) { echo get_class($prev[0]) . '::' . $prev[1]; }
elseif ($prev instanceof Closure) {
    $r = new ReflectionFunction($prev);
    echo 'Closure at ' . $r->getFileName() . ':' . $r->getStartLine();
} else { echo var_export($prev, true); }
`.replace(/\n/g, '</span><span class="line">')}</span>`;
});

await page.locator('.laravel-snippet').first().locator('button.laravel-snippet__run').click();
await page.waitForTimeout(15000);

console.log('=== REPLIES ===');
for (const r of replies) console.log(r);
await browser.close();
