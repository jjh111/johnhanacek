import { chromium } from 'playwright-core';

const BASE = 'http://127.0.0.1:1337';
const STANDARD = ['index.html', 'design.html', 'art.html', 'about.html', 'services.html', 'search.html', 'nanome2.html', '404.html'];
const OTHER = ['playground.html', 'writing.html', 'tidepool.html', 'beach-beers.html', 'onagents.html', 'fish-demo/index.html'];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage();

let failures = 0;
for (const p of [...STANDARD, ...OTHER]) {
  const jsErrors = [];
  const consoleErrors = [];
  const onPageError = (e) => jsErrors.push(String(e).split('\n')[0]);
  const onConsole = (m) => { if (m.type() === 'error') consoleErrors.push(m.text().split('\n')[0]); };
  page.on('pageerror', onPageError);
  page.on('console', onConsole);

  try {
    const resp = await page.goto(`${BASE}/${p}`, { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(1500); // let deferred scripts + components run
    const status = resp.status();

    const report = { page: p, status, jsErrors, consoleErrors: consoleErrors.filter(t => !t.includes('googleapis') && !t.includes('gstatic') && !t.includes('ERR_') ) , externalLoadFails: consoleErrors.filter(t => t.includes('googleapis') || t.includes('gstatic') || t.includes('ERR_')) };

    if (STANDARD.includes(p)) {
      report.nav = await page.$eval('jh-nav .nav-left', el => el.querySelectorAll('a').length).catch(() => 0);
      report.footer = await page.$eval('jh-footer .footer-oval .version', el => el.textContent.trim().split('\n')[0]).catch(() => 'MISSING');
      report.active = await page.$$eval('jh-nav a.active', els => els.map(e => e.getAttribute('aria-label')).join(',')).catch(() => '');
      report.canonical = await page.$eval('link[rel="canonical"]', el => el.href).catch(() => null);
    }
    const bad = status >= 400 || jsErrors.length || report.consoleErrors.length || (STANDARD.includes(p) && (report.nav < 6 || !String(report.footer).includes('v1.13')));
    if (bad) failures++;
    console.log((bad ? 'FAIL ' : 'ok   ') + JSON.stringify(report));
  } catch (e) {
    failures++;
    console.log('FAIL ' + JSON.stringify({ page: p, error: String(e).split('\n')[0] }));
  }
  page.removeListener('pageerror', onPageError);
  page.removeListener('console', onConsole);
}
await browser.close();
console.log(failures ? `\n${failures} page(s) failed` : '\nALL PAGES PASS');
process.exit(failures ? 1 : 0);
