import { chromium } from 'playwright';

const page_slug = process.argv[2] || 'helpers';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();

page.on('pageerror', (e) => console.log('[pageerror]', e.message));

await page.goto(`http://localhost:5187/docs/13.x/${page_slug}`, {
    waitUntil: 'domcontentloaded',
});
await page.waitForSelector('.laravel-snippet .laravel-snippet__run', { timeout: 30_000 });

const snippets = page.locator('.laravel-snippet');
const total = await snippets.count();
console.log(`Found ${total} snippets on ${page_slug}`);

for (let i = 0; i < Math.min(3, total); i++) {
    const s = snippets.nth(i);
    await s.locator('.laravel-snippet__run').click();
    await page.waitForTimeout(2000);
    const status = (await s.locator('.laravel-snippet__status').textContent()) || '';
    const stderr = await s.locator('.laravel-snippet__stderr').allInnerTexts();
    const output = await s.locator('.laravel-snippet__output').innerText().catch(() => '');
    console.log(`\n--- snippet #${i} ---`);
    console.log('status:', status.trim());
    console.log('stderr:', JSON.stringify(stderr).slice(0, 1500));
    console.log('output:', JSON.stringify(output).slice(0, 3000));
}

await browser.close();
