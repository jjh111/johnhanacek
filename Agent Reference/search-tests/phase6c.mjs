// Phase 6c QA — elaboration seam, artifact rail, model-emitted scene language
import { chromium } from 'playwright-core';
const CHROMIUM = process.env.CHROMIUM_PATH ||
  `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const BASE = 'http://127.0.0.1:4571';
const failures = [];
function check(name, cond, detail = '') {
  console.log(`${cond ? '  ✓' : '  ✗'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!cond) failures.push(name);
}
const browser = await chromium.launch({ executablePath: CHROMIUM, headless: true });
const ctx = await browser.newContext();
await ctx.addInitScript(() => {
  localStorage.setItem('jh-local-llm-optin', 'true');
  localStorage.setItem('searchCustomEndpoint', 'http://127.0.0.1:9911/v1');
});
await ctx.route('**://localhost:1234/**', r => r.abort());
await ctx.route('**://localhost:11434/**', r => r.abort());
let lastBody = null;
await ctx.route('**://127.0.0.1:9911/**', async (route) => {
  const pd = route.request().postData();
  if (pd) lastBody = pd;
  await route.continue();
});
const page = await ctx.newPage();
const errors = [];
page.on('console', m => { if (m.type() === 'error' && !/net::|Failed to load resource/.test(m.text())) errors.push(m.text()); });
page.on('pageerror', e => errors.push(String(e)));

await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);
await page.keyboard.press('/');
await page.waitForTimeout(7000);   // local probes time out before custom endpoint lands

// prose elaboration: seam byline + artifact rail
await page.fill('#so-searchInput', 'who is john');
await page.waitForTimeout(2800);
const ans = await page.locator('#so-aiAnswer').textContent();
check('elaboration streams into the seam', ans.includes('design engineer'), ans.slice(0, 50));
check('seam carries the eyebrow', await page.evaluate(() => {
  const a = document.getElementById('so-aiAnswer');
  return getComputedStyle(a, '::before').content.includes('elaboration');
}));
check('artifact rail pins grounding chunks', await page.locator('#so-aiAnswer .pc-artifacts .related-chip').count() >= 2);
check('census grounding included in context', !!lastBody && lastBody.includes('[Canvas right now]'), (lastBody || '').slice(0, 0) || 'checked');

// model-emitted scene language → same plan card → confirm → execute
const before = await page.evaluate(() => window.heroFish.state.fish.length);
await page.fill('#so-searchInput', 'please add 2 small fish for me');
await page.waitForTimeout(2800);
const planSteps = await page.evaluate(() => [...document.querySelectorAll('#so-aiAnswer .pc-plan-step')].map(s => s.textContent));
check('model tool-call renders the SAME plan card', planSteps.some(s => s.includes('2 small fish')), planSteps.join(' | '));
const mid = await page.evaluate(() => window.heroFish.state.fish.length);
check('nothing ran without confirmation', mid === before, `${before} → ${mid}`);
await page.click('#so-aiAnswer [data-scene-run]');
await page.waitForTimeout(2200);
const after = await page.evaluate(() => window.heroFish.state.fish.length);
check('confirming the plan spawns the fish', after >= before + 2, `${before} → ${after}`);
const receipts = await page.evaluate(() => [...document.querySelectorAll('[data-scene-plan] .pc-plan-step')].map(s => s.textContent));
check('receipts land in the card', receipts.some(r => r.startsWith('✓')), receipts.join(' | '));

check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
console.log(failures.length ? `\nFAILURES (${failures.length}):\n- ` + failures.join('\n- ') : '\nALL PASS');
process.exit(failures.length ? 1 : 0);
