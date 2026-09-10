/* quoteqa.mjs — what the bar returns for quote/testimonial questions.
   Dev-time QA aid for the §M endorsement pass. Not a pass/fail suite. */
import { chromium } from 'playwright-core';
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4571';
const Q = ["what do clients say","testimonials","is john any good","who recommends john",
  "references","why should I hire him","david brin","kevin kelly","photography testimonial",
  "photographer recommendation","sheila zipfel","ben shapiro","desiree sterling","what do people say about his design"];
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const page = await b.newPage({ viewport: { width: 1280, height: 900 } });
console.log('');
for (const q of Q) {
  await page.goto(`${BASE}/search.html?q=${encodeURIComponent(q)}`, { waitUntil: 'load' });
  await page.waitForTimeout(1700);
  const r = await page.evaluate(() => {
    const t = [...document.querySelectorAll('[data-id]')].map(e => {
      const h = e.querySelector('.result-title,.pc-lead-title,h3,h4,strong');
      return h ? h.textContent.trim() : (e.innerText.split('\n')[0] || '').trim();
    }).filter(Boolean);
    return { top: [...new Set(t)].slice(0, 3), body: document.body.innerText };
  });
  const proof = ['Zipfel','Barrett','Shapiro','Kronmark','Reed','Hurriyet','Sterling','Brin','Kelly']
    .filter(n => r.body.includes(n));
  console.log(`  ${q}`);
  console.log(`     → ${r.top.join('  |  ') || '(nothing)'}`);
  console.log(`     names on screen: ${proof.join(', ') || '—'}\n`);
}
await b.close();
