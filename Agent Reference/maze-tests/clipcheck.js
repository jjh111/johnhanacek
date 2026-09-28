const { chromium } = require('playwright-core');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  // dark theme is the default (no data-theme attr) — match the user's screenshot
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('http://127.0.0.1:1337/writing.html', { waitUntil: 'networkidle' });
  const m = await page.evaluate(() => {
    const meta = document.querySelector('.page-header h1 .meta').getBoundingClientRect();
    const nav = document.getElementById('nav').getBoundingClientRect();
    const navH = nav.height;
    return {
      titleTop: Math.round(meta.top),
      navBottom: Math.round(navBottom = nav.bottom),
      clearOfNav: meta.top >= nav.bottom,
      overlapPx: Math.max(0, Math.round(nav.bottom - meta.top)),
    };
  });
  await page.screenshot({ path: '/tmp/writing-top-dark.png', clip: { x: 0, y: 0, width: 1280, height: 220 } });
  // also scrolled-state: the nav is fixed and always over the header when scrolled to top
  console.log(JSON.stringify(m, null, 1));
  await browser.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
