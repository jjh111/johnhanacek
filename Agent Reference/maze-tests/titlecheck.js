const { chromium } = require('playwright-core');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto('http://127.0.0.1:1337/writing.html', { waitUntil: 'networkidle' });
  const m = await page.evaluate(() => {
    const sig = document.querySelector('.page-header .jh-sig');
    const meta = document.querySelector('.page-header h1 .meta');
    const sr = sig.getBoundingClientRect(), mr = meta.getBoundingClientRect();
    const h1 = document.querySelector('.page-header h1').getBoundingClientRect();
    return {
      sigCenteredToTitle: Math.abs((sr.top + sr.height/2) - (mr.top + mr.height/2)) < 6,
      sigTop: Math.round(sr.top), sigBottom: Math.round(sr.bottom),
      titleTop: Math.round(mr.top), titleBottom: Math.round(mr.bottom),
      sigFullyVisible: sr.top >= 0 && sr.bottom <= window.innerHeight,
      h1NotClipped: h1.top >= 0,
    };
  });
  await page.screenshot({ path: '/tmp/writing-top3.png', clip: { x: 0, y: 0, width: 1280, height: 220 } });
  console.log(JSON.stringify(m, null, 1));
  await browser.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
