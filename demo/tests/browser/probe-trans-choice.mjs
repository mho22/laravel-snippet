import { chromium } from 'playwright';

const url = process.argv[2] || 'http://localhost:8000/docs/13.x/strings';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();

const replies = [];
await page.addInitScript(() => {
    const RealWorker = self.Worker;
    self.Worker = new Proxy(RealWorker, {
        construct(t, args) {
            const w = new t(...args);
            w.addEventListener('message', (e) => {
                const tag = `[probe.<- ${e.data?.type}]`;
                console.log(tag, JSON.stringify(e.data).slice(0, 3000));
            });
            return w;
        }
    });
});

page.on('console', (msg) => {
    const t = msg.text();
    if (t.startsWith('[probe.<-')) replies.push(t);
});

await page.goto(url, { waitUntil: 'load', timeout: 60000 });
await page.waitForTimeout(2000);

// Find the trans_choice snippet specifically
const snippet = await page.locator('.laravel-snippet').filter({
    has: page.locator('code:has-text("trans_choice")'),
}).first();
const count = await snippet.count();
console.log(`[probe] snippets matching trans_choice: ${count}`);
if (count === 0) {
    // Fallback: search by source content via JS
    const idx = await page.evaluate(() => {
        const els = Array.from(document.querySelectorAll('.laravel-snippet'));
        for (let i = 0; i < els.length; i++) {
            if ((els[i].textContent || '').includes("trans_choice('messages.notifications'")) return i;
        }
        return -1;
    });
    console.log(`[probe] fallback index: ${idx}`);
    if (idx >= 0) {
        await page.locator('.laravel-snippet').nth(idx).locator('button.laravel-snippet__run').click();
    }
} else {
    await snippet.locator('button.laravel-snippet__run').click();
}

await page.waitForTimeout(20000);

console.log('=== REPLIES ===');
for (const r of replies) console.log(r);

await browser.close();
