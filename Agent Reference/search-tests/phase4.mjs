// Phase 4 QA — tool-use over the registry via a mock OpenAI endpoint
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
// Force the custom-endpoint path: this machine runs a real Ollama, so the
// local probes are blocked at the network layer for this test.
await ctx.route('**://localhost:1234/**', r => r.abort());
await ctx.route('**://localhost:11434/**', r => r.abort());
const page = await ctx.newPage();
const errors = [];
page.on('console', m => { if (m.type() === 'error' && !/net::|Failed to load resource/.test(m.text())) errors.push(m.text()); });
page.on('pageerror', e => errors.push(String(e)));

await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);
await page.keyboard.press('/');
// engine checks probe localhost:1234/11434 with 2s timeouts before the custom endpoint
await page.waitForTimeout(7000);

const engineLabel = await page.locator('#so-engineModelLabel').textContent();
check('mock endpoint becomes active engine', engineLabel.includes('mock-chat-model'), engineLabel);
check('embed-only Ollama was skipped', !engineLabel.includes('nomic'), engineLabel);

// Plain question → streamed prose, no chips
await page.fill('#so-searchInput', 'who is john');
await page.waitForTimeout(2500);
const ans = await page.locator('#so-aiAnswer').textContent();
check('plain question streams prose', ans.includes('design engineer'), ans.slice(0, 60));
check('no chips on plain question', await page.locator('#so-aiAnswer [data-cmd]').count() === 0);

// Action request → tool call → confirm chip (NOT auto-run)
const foodBefore = await page.evaluate(() => window.heroFish.state.food.length);
await page.fill('#so-searchInput', 'please feed the fish for me');
await page.waitForTimeout(2500);
const chip = page.locator('#so-aiAnswer [data-cmd="fish.feed"]');
check('tool call renders confirm chip', await chip.count() === 1);
const foodMid = await page.evaluate(() => window.heroFish.state.food.length);
check('chip did NOT auto-run', foodMid === foodBefore, `${foodBefore} → ${foodMid}`);
if (await chip.count()) {
  await chip.click();
  await page.waitForTimeout(600);
  const foodAfter = await page.evaluate(() => window.heroFish.state.food.length);
  check('tapping chip runs the command', foodAfter > foodBefore, `${foodBefore} → ${foodAfter}`);
  check('overlay closed after run', await page.evaluate(() =>
    document.getElementById('searchOverlay').getAttribute('aria-hidden') === 'true'));
}

check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
console.log(failures.length ? `\nFAILURES (${failures.length}):\n- ` + failures.join('\n- ') : '\nALL PASS');
process.exit(failures.length ? 1 : 0);
