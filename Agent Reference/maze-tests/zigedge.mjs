import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await b.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto('http://127.0.0.1:1337/design.html', { waitUntil: 'load' });
await page.waitForTimeout(800);
const r = await page.evaluate(() => {
  const z = [];
  for (let pass = 0; pass < 5; pass++) { const dir = pass % 2 === 0 ? 1 : -1; for (let i = 0; i <= 25; i++) z.push({ x: dir > 0 ? 400 + i * 5 : 525 - i * 5, y: 400 + pass * 14 }); }
  const t = [];
  for (let pass = 0; pass < 7; pass++) { const dir = pass % 2 === 0 ? 1 : -1; for (let i = 0; i <= 10; i++) t.push({ x: dir > 0 ? 700 + i * 4 : 740 - i * 4, y: 300 + pass * 6 }); }
  return { sharpZig: isSquiggle(z), tinyScribble40px: isSquiggle(t) };
});
console.log(JSON.stringify(r));
await b.close();
