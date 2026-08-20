// Search-overlay engine panel: the AI tier must be SELECTABLE.
//
// Guards the regression where moving engine detection off page-load (so the
// site stops probing the local network before a visitor asks) left
// ensureInitialized() reading hasWebGPU while it was merely UNDETERMINED, and
// disabling the load button permanently — detection then came back positive but
// only rewrote the label, so the button looked right and did nothing.
import { chromium } from 'playwright-core';

const ROOT = process.env.SITE_ROOT;
const b = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
  args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan']
});
const fails = [];
const log = [];

for (const page of ['index.html', 'design.html', 'about.html', 'services.html']) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(`http://localhost:1337/${page}`, { waitUntil: 'load', timeout: 30000 });

  // Nothing may reach the local network or a model CDN before the user asks.
  const early = await p.evaluate(() => performance.getEntriesByType('resource')
    .filter(e => /localhost:(1234|11434)|huggingface|transformers/i.test(e.name)).length);

  await p.evaluate(() => document.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true })));
  await p.waitForTimeout(1800);

  const st = await p.evaluate(() => {
    const b = document.getElementById('so-enableBtn');
    return b ? { present: true, text: b.textContent.trim(), disabled: b.disabled } : { present: false };
  });

  const webgpu = await p.evaluate(() => !!navigator.gpu);
  const ok = st.present && (!webgpu || !st.disabled) && early === 0 && errs.length === 0;
  if (!ok) fails.push(`${page}: ${JSON.stringify({ ...st, webgpu, early, errs })}`);
  log.push({ page, ...st, webgpu, probesBeforeOpen: early, errs: errs.length });
  await ctx.close();
}

console.log(JSON.stringify({ log, fails, ALL_PASS: fails.length === 0 }, null, 1));
await b.close();
process.exit(fails.length ? 1 : 0);
