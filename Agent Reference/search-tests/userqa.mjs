// User-style QA battery — drives the overlay like a visitor and prints what
// each query surfaces. Not a pass/fail suite: a contact sheet in JSON.
//   node userqa.mjs            → retrieval battery (BM25 + semantic)
//   node userqa.mjs local      → + LMStudio generation via Detect (needs :1234)
//   node userqa.mjs lfm        → + in-browser LFM load/first-token benchmark
import { chromium } from 'playwright-core';
const CHROMIUM = process.env.CHROMIUM_PATH ||
  `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const BASE = 'http://127.0.0.1:4571';
const mode = process.argv[2] || '';
const browser = await chromium.launch({ executablePath: CHROMIUM, headless: true,
  args: mode === 'lfm' ? ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-angle=metal'] : [] });
const ctx = await browser.newContext({ colorScheme: 'dark', viewport: { width: 1280, height: 920 } });
if (mode !== 'local') await ctx.route(/(localhost|127\.0\.0\.1):(1234|11434)/, r => r.abort());
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error' && !/net::|ERR_|Failed to fetch/.test(m.text())) errors.push(m.text()); });
await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);
await page.keyboard.press('/');
await page.waitForSelector('#so-searchInput', { timeout: 10000 });
await page.waitForTimeout(800);

async function probe(q, wait = 1500) {
  await page.fill('#so-searchInput', '');
  await page.waitForTimeout(120);
  await page.fill('#so-searchInput', q);
  await page.waitForTimeout(wait);
  return page.evaluate((q) => {
    const R = document.getElementById('so-searchResults');
    const sc = document.querySelector('.so-panel-scroll');
    return { q,
      hint: [...R.querySelectorAll('.cmdbar-group-label')].map(e => e.textContent.trim()).filter(t => !/on this page|across the site/i.test(t)).join('|').slice(0, 50),
      actions: [...R.querySelectorAll('.cmd-card .cmd-title')].map(e => e.textContent.trim()).join('|'),
      intent: (R.querySelector('.intent-card .intent-title, .intent-card h4, .intent-card strong') || {}).textContent?.trim().slice(0, 40) || (R.querySelector('.intent-card') ? 'card' : ''),
      plan: !!R.querySelector('[data-scene-run]'), census: !!R.querySelector('.census'),
      ladder: [...document.querySelectorAll('#so-sourcesSection .pc-mod')].map(m => m.dataset.id + '/' + m.dataset.lod).join(','),
      lead: (document.querySelector('#so-sourcesSection .pc-mod .result-title') || {}).textContent?.trim().slice(0, 34) || '',
      media: R.querySelectorAll('img,.result-video-wrap,model-viewer,.pc-piece').length,
      tail: R.querySelectorAll('.pc-tail-item').length,
      over: sc ? sc.scrollHeight - sc.clientHeight : 0,
      none: /No results/.test(R.textContent) };
  }, q);
}

const battery = [
  // re-test of the action-leak fix
  'what has he shipped', 'what awards has he won', 'what does he cook', 'what tools does he use',
  "what's his experience with hand tracking", 'tell me about the fish game', 'does he do freelance design work',
  'what does john think about ai agents', 'how many fish are there',
  // imperatives must still work
  'scare the fish', 'feed', 'what are the fish thinking', 'show the fish logic', 'go to design', 'jump to about',
  // data fixes
  'transfyr', 'hypercube', 'resume', 'career timeline',
  // more compound
  'what did he do at nanome', 'is he a designer or an engineer', 'has he worked with hololens',
  'what is earth star', 'who has he worked with', 'what languages does he code in', 'san diego',
  'looking for a founding designer', 'ai coaching for executives', 'what is the jh coaching os',
  'mixed reality', 'molecular', 'startup', 'georgetown', 'thesis',
];
const out = [];
for (const q of battery) out.push(await probe(q));
console.log(JSON.stringify(out, null, 0).replace(/\},\{/g, '},\n{'));

if (mode === 'local') {
  console.log('\n=== LOCAL (LMStudio) ===');
  await page.fill('#so-searchInput', '');
  await page.click('#so-engineInfoBtn');
  await page.waitForTimeout(400);
  await page.click('#so-detectLocalBtn');
  await page.waitForTimeout(4000);
  const picker = await page.evaluate(() => ({
    label: document.getElementById('so-engineModelLabel')?.textContent.trim(),
    source: document.getElementById('so-engineSourceBadge')?.textContent.trim(),
    options: [...document.querySelectorAll('#so-localPicker *')].map(e => e.textContent.trim()).filter(Boolean).slice(0, 12),
    strip: document.getElementById('so-tierStrip')?.textContent.replace(/\s+/g, ' ').trim(),
  }));
  console.log('after Detect:', JSON.stringify(picker));
  // pick the small qwen if a picker exists
  const picked = await page.evaluate(() => {
    const sel = document.querySelector('#so-localPicker select.lp-select');
    if (!sel) return null;
    const opt = [...sel.options].find(o => /0\.8b-mlx/i.test(o.textContent));
    if (!opt) return null;
    sel.value = opt.value; sel.dispatchEvent(new Event('change', { bubbles: true }));
    return opt.textContent.trim();
  });
  console.log('picked:', picked);
  await page.waitForTimeout(800);
  await page.click('#so-engineInfoBtn');   // close disclosure
  console.log('strip after pick:', await page.evaluate(() => document.getElementById('so-tierStrip')?.textContent.replace(/\s+/g, ' ').trim()));
  // NO Enter: Enter commits the top result (9c grammar) and navigates away.
  // Generation runs off the typed query once the engine is active.
  for (const q of ['why should I hire him', 'what does john think about agents', 'scare the fish']) {
    await page.fill('#so-searchInput', '');
    await page.waitForTimeout(150);
    const t0 = Date.now();
    await page.fill('#so-searchInput', q);
    let first = null, text = '';
    for (let i = 0; i < 120; i++) {
      await page.waitForTimeout(500);
      const s = await page.evaluate(() => ({ a: document.getElementById('so-aiAnswer')?.textContent.trim() || '', gen: !!document.querySelector('#so-aiAnswer.generating, .ai-answer-wrap.generating'), tool: !!document.querySelector('.tool-chip, [data-tool-call], .tool-confirm'), overlayOpen: document.getElementById('searchOverlay')?.getAttribute('aria-hidden') === 'false' }));
      if (s.a && !first) first = Date.now() - t0;
      text = s.a;
      if (!s.overlayOpen) { text = '(overlay closed — command ran)'; break; }
      if (s.a && !s.gen && i > 4) break;
    }
    console.log(JSON.stringify({ q, firstTokenMs: first, totalMs: Date.now() - t0, answer: text.slice(0, 260) }));
    if (!(await page.evaluate(() => document.getElementById('searchOverlay')?.getAttribute('aria-hidden') === 'false'))) { await page.keyboard.press('/'); await page.waitForTimeout(600); }
  }
}

if (mode === 'lfm') {
  console.log('\n=== LFM (in-browser) ===');
  const gpu = await page.evaluate(async () => !!navigator.gpu && !!(await navigator.gpu.requestAdapter().catch(() => null)));
  console.log('webgpu adapter:', gpu);
  if (gpu) {
    await page.fill('#so-searchInput', '');
    const t0 = Date.now();
    await page.click('.tier[data-tier="qwen"]');
    let loaded = false;
    for (let i = 0; i < 600; i++) {   // up to 5 min for a 255MB download
      await page.waitForTimeout(500);
      const st = await page.evaluate(() => ({ strip: document.getElementById('so-tierStrip')?.textContent.replace(/\s+/g, ' ').trim(), prog: document.getElementById('so-progress')?.textContent.trim() }));
      if (/lfm/i.test(st.strip) && !/↓|loading|%/i.test(st.strip) && i > 4) { loaded = true; console.log('loaded in', Date.now() - t0, 'ms —', st.strip); break; }
      if (i % 40 === 0) console.log('  …', st.prog || st.strip);
    }
    if (loaded) {
      const t1 = Date.now();
      await page.fill('#so-searchInput', 'why should I hire him');   // no Enter — it would commit/navigate
      let first = null, text = '';
      for (let i = 0; i < 240; i++) {
        await page.waitForTimeout(500);
        const s = await page.evaluate(() => ({ a: document.getElementById('so-aiAnswer')?.textContent.trim() || '', gen: !!document.querySelector('#so-aiAnswer.generating') }));
        if (s.a && !first) first = Date.now() - t1;
        text = s.a; if (s.a && !s.gen && i > 4) break;
      }
      console.log(JSON.stringify({ firstTokenMs: first, totalMs: Date.now() - t1, answer: text.slice(0, 260) }));
    }
  }
}
console.log('\nerrors:', errors.length ? errors.slice(0, 5) : 'none');
await browser.close();
