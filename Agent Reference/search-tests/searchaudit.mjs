// Search watertight audit — states, commands, nouns, verbs, LLM. Prints
// findings only (a contact sheet of failures). Needs :4571 and mock-llm :9911.
import { chromium } from 'playwright-core';
const CHROMIUM = process.env.CHROMIUM_PATH || `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const BASE = 'http://127.0.0.1:4571';
const browser = await chromium.launch({ executablePath: CHROMIUM, headless: true });
const findings = [];
const note = (area, what, detail='') => { findings.push({ area, what, detail: String(detail).slice(0, 160) }); };

async function fresh(pg, opts = {}) {
  const ctx = await browser.newContext({ colorScheme: 'dark', viewport: opts.viewport || { width: 1280, height: 920 } });
  if (!opts.local) await ctx.route(/(localhost|127\.0\.0\.1):(1234|11434)/, r => r.abort());
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 140)));
  page.on('console', m => { if (m.type() === 'error' && !/net::|ERR_|Failed to fetch|Permissions|accelerometer|401|font-size:0/i.test(m.text())) errs.push(m.text().slice(0, 140)); });
  // ONE-TIME storage reset (an init script runs on every navigation — clearing
  // sessionStorage there wiped the residue the noun/verb flows then look for)
  await page.addInitScript(() => { try { if (!window.name) { sessionStorage.clear(); window.name = 'audited'; } localStorage.removeItem('jh-search-workspace'); localStorage.setItem('jh-postcard-density', 'compact'); } catch {} });
  await page.goto(`${BASE}/${pg}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.keyboard.press('/');
  await page.waitForSelector('#so-searchInput', { timeout: 10000 });
  // the shell reveals before the core loads (instant-open) — wait for the core
  // so a typed query is answered by the pipeline, not lost to a race
  await page.waitForFunction(() => !!window.JHSearch, null, { timeout: 15000 }).catch(() => note('state', pg + ': core did not initialise within 15s'));
  await page.waitForTimeout(400);
  return { ctx, page, errs };
}
const state = (page) => page.evaluate(() => {
  const R = document.getElementById('so-searchResults'); const sc = document.querySelector('.so-panel-scroll');
  if (!R) return { open: false, mods: 0, tail: 0, actions: [], intent: false, plan: false, census: false, suggestions: 0, none: false, undef: false, over: 0, answer: '', html: 0, noOverlay: true, url: location.href };
  const txt = R.textContent;
  return {
    open: document.getElementById('searchOverlay')?.getAttribute('aria-hidden') === 'false',
    mods: document.querySelectorAll('#so-sourcesSection .pc-mod').length,
    tail: R.querySelectorAll('.pc-tail-item').length,
    actions: [...R.querySelectorAll('.cmd-card .cmd-title')].map(e => e.textContent.trim()),
    intent: !!R.querySelector('.intent-card'), plan: !!R.querySelector('[data-scene-run]'), census: /read from the canvas/i.test(txt),
    suggestions: R.querySelectorAll('[data-suggest]').length,
    none: /No results/.test(txt), undef: /undefined|NaN|\[object/.test(txt),
    over: sc ? sc.scrollHeight - sc.clientHeight : 0,
    answer: (document.getElementById('so-aiAnswer')?.textContent || '').trim().slice(0, 80),
    html: R.innerHTML.length,
  };
});
const type = async (page, q, wait = 1400) => { if (!(await state(page)).open) { await page.evaluate(() => window.openSearch && window.openSearch()); await page.waitForTimeout(700); } await page.fill('#so-searchInput', ''); await page.waitForTimeout(100); await page.fill('#so-searchInput', q); await page.waitForTimeout(wait); return state(page); };

// ───── 1. edge strings ─────
{
  const { ctx, page, errs } = await fresh('index.html');
  const edges = ['a', 'the', 'asdfgh', 'zzzz qqq', '🐟', '?', 'WHO IS JOHN', 'nanmoe', 'badvr!!!', '2022', 'https://example.com/x', '<b>bold</b>', "john's", 'design design design', 'x'.repeat(200), '   spaced   out   ', 'fish fish fish fish fish fish', 'go to', 'jump to', 'what', 'him', 'add fish', 'add 100 fish', 'add -3 fish', 'clear', 'help'];
  for (const q of edges) {
    const s = await type(page, q, 1100);
    if (s.undef) note('edge', `"${q}" renders undefined/NaN`);
    if (s.over > 10) note('edge', `"${q}" overflows panel`, s.over + 'px');
    if (!s.none && s.mods === 0 && !s.actions.length && !s.intent && !s.plan && !s.census && s.html < 40) note('edge', `"${q}" renders an EMPTY panel (no results, no 'No results')`);
    if (s.actions.length && !/fish|clear|feed|scare|logic|go|jump|add|help/i.test(q)) note('edge', `"${q}" surfaces actions`, s.actions.join('|'));
  }
  // empty after results → suggestion chips return
  await type(page, 'nanome', 800); const e = await type(page, '', 600);
  if (!e.suggestions) note('state', 'clearing the query does not bring the suggestion chips back');
  // Esc ladder from a result state
  await type(page, 'nanome', 800);
  await page.keyboard.press('ArrowDown'); await page.waitForTimeout(150);
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  let s1 = await state(page); if (!s1.open) note('state', 'Esc with a cursor closed the overlay (should only clear the cursor)');
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  s1 = await state(page); if (!s1.open) note('state', 'second Esc (clear query) closed the overlay');
  if ((await page.inputValue('#so-searchInput')) !== '') note('state', 'second Esc did not clear the query');
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  s1 = await state(page); if (s1.open) note('state', 'third Esc did not close the overlay');
  if (errs.length) note('edge', 'console errors', errs.join(' | '));
  await ctx.close();
}

// ───── 2. commands: every registered verb on index and design ─────
for (const pg of ['index.html', 'design.html']) {
  const { ctx, page, errs } = await fresh(pg);
  const cmds = await page.evaluate(() => (window.JH_COMMANDS || []).map(c => ({ id: c.id, title: c.title, hints: c.hints || [] })));
  for (const c of cmds) { try {
    if (!(await state(page)).open) { await page.evaluate(() => window.openSearch()); await page.waitForTimeout(700); }
    const s = await type(page, c.title, 900);
    if (!s.actions.includes(c.title)) note('verb', `${pg} "${c.title}" does not surface its own card`, s.actions.join('|') || 'none');
    for (const h of c.hints.slice(0, 2)) { const sh = await type(page, h, 900); if (!sh.actions.includes(c.title)) note('verb', `${pg} hint "${h}" does not surface "${c.title}"`, sh.actions.join('|') || 'none'); }
    // Enter runs it: overlay closes (onCommandRun)
    await type(page, c.title, 700); await page.keyboard.press('Enter'); await page.waitForTimeout(500);
    const after = await state(page);
    if (after.open) note('verb', `${pg} Enter on "${c.title}" did not run/close`);
    const focus = await page.evaluate(() => document.activeElement && (document.activeElement.tagName + '#' + document.activeElement.id + '.' + String(document.activeElement.className).slice(0, 20)));
    if (/INPUT|TEXTAREA/.test(focus || '')) note('state', `${pg} after running "${c.title}" focus sits in ${focus} — a following "/" would type into it`);
    if (!after.open) { await page.evaluate(() => window.openSearch()); await page.waitForTimeout(600); }
  } catch (e) { note('verb', `${pg} "${c.title}" flow threw`, e.message.slice(0, 100)); if (!/index|design/.test(page.url())) await page.goto(`${BASE}/${pg}`, { waitUntil: 'domcontentloaded' }); } }
  // nav + section commands synthesized from the page
  const navs = await page.evaluate(() => [...document.querySelectorAll('.nav-right a[href^="#"]')].map(a => a.textContent.trim()).slice(0, 4));
  for (const n of navs) {
    const s = await type(page, 'jump to ' + n.toLowerCase(), 900);
    if (!s.actions.some(a => /^Jump to/i.test(a))) note('verb', `${pg} "jump to ${n}" surfaces no jump card`, s.actions.join('|') || 'none');
  }
  const g = await type(page, 'go to about', 900);
  if (!g.actions.some(a => /Go to About/i.test(a))) note('verb', `${pg} "go to about" no nav card`, g.actions.join('|'));
  await page.keyboard.press('Enter'); await page.waitForTimeout(1500);
  if (!/about\.html/.test(page.url())) note('verb', `${pg} Enter on "go to about" did not navigate`, page.url());
  else { const res = await page.evaluate(() => !!document.querySelector('.so-residue')); if (!res) note('state', `after nav from "${pg}" no residue line on about.html`); }
  if (errs.length) note('verb', pg + ' console', errs.join(' | '));
  await ctx.close();
}

// ───── 3. nouns: click paths on a dossier ─────
{
  const { ctx, page, errs } = await fresh('index.html');
  await type(page, 'badvr', 1400);
  const parts = await page.evaluate(() => {
    const m = document.querySelector('#so-sourcesSection .pc-mod');
    return { title: !!m?.querySelector('.result-title'), badge: !!m?.querySelector('.result-page-link, .pc-page-badge, a[href$=".html"]'), chips: m?.querySelectorAll('.related-chip').length || 0, video: !!m?.querySelector('[data-video]'), titleHref: m?.querySelector('.result-title')?.getAttribute('href') };
  });
  if (!parts.title) note('noun', 'dossier has no title link');
  if (!parts.chips) note('noun', 'dossier has no related chips');
  // video poster click swaps in a video
  if (parts.video) { await page.click('#so-sourcesSection .pc-mod [data-video]'); await page.waitForTimeout(500); if (!(await page.evaluate(() => !!document.querySelector('#so-sourcesSection video.result-video')))) note('noun', 'poster click did not swap in a playing video'); }
  // related chip click → in-place re-query? or nav — must do SOMETHING
  const before = await state(page);
  await page.click('#so-sourcesSection .pc-mod .related-chip'); await page.waitForTimeout(1200);
  const afterChip = await state(page);
  if (afterChip.noOverlay) note('noun', 'related chip click NAVIGATED to another page (not an in-place re-query)', afterChip.url);
  else if (afterChip.open && afterChip.mods === before.mods && (await page.inputValue('#so-searchInput')) === 'badvr') note('noun', 'related chip click changed nothing');
  if (!afterChip.open) { await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(1200); await page.keyboard.press('/'); await page.waitForSelector('#so-searchInput'); await page.waitForTimeout(500); }
  // departure card: opens new tab, not same
  const p2 = await fresh('index.html'); await type(p2.page, 'fractal futures', 1400);
  const dep = await p2.page.evaluate(() => { const a = document.querySelector('#so-searchResults .pc-piece--link'); return a && { target: a.target, rel: a.rel, href: a.href }; });
  if (!dep) note('noun', 'external chunk shows no departure card'); else if (dep.target !== '_blank' || !/noopener/.test(dep.rel)) note('noun', 'departure card is not a labeled new-tab exit', JSON.stringify(dep));
  await p2.ctx.close();
  // title click navigates + residue
  await type(page, 'nanome', 1200);
  await page.click('#so-sourcesSection .pc-mod .result-title'); await page.waitForTimeout(1500);
  if (!/nanome2\.html/.test(page.url())) note('noun', 'title click did not navigate', page.url());
  else if (!(await page.evaluate(() => !!document.querySelector('.so-residue')))) note('state', 'no residue after title-click navigation');
  else { await page.click('.so-residue-open'); await page.waitForTimeout(1500); const r = await state(page); if (!r.open || (await page.inputValue('#so-searchInput')) !== 'nanome') note('state', 'residue click did not restore the query'); }
  if (errs.length) note('noun', 'console', errs.join(' | '));
  await ctx.close();
}

// ───── 4. LLM (mock on :9911 as custom endpoint) ─────
{
  const { ctx, page, errs } = await fresh('index.html');
  await page.click('#so-engineInfoBtn'); await page.waitForTimeout(300);
  await page.fill('#so-customEndpoint', 'http://127.0.0.1:9911/v1'); await page.keyboard.press('Enter'); await page.waitForTimeout(2500);
  await page.click('#so-engineInfoBtn'); await page.waitForTimeout(300);
  const strip = await page.evaluate(() => document.getElementById('so-tierStrip').textContent.replace(/\s+/g, ' '));
  if (!/custom|9911|mock/i.test(strip)) note('llm', 'custom endpoint did not register in the strip', strip);
  const q1 = await type(page, 'who is john', 3000);
  if (!q1.answer) note('llm', 'plain question produced no answer');
  // AI toggle off mid-flight → no answer on next query
  await page.click('.tier-ai-on'); await page.waitForTimeout(300);
  const q2 = await type(page, 'what has he shipped', 2500);
  if (q2.answer && q2.answer !== q1.answer) note('llm', 'AI off still generated', q2.answer);
  await page.click('.tier-ai-off'); await page.waitForTimeout(300);
  // tool call → confirm chip, not auto-run
  const food0 = await page.evaluate(() => window.heroFish?.state?.food?.length ?? -1);
  const q3 = await type(page, 'please feed the fish for me', 3000);
  const chip = await page.evaluate(() => !!document.querySelector('#so-aiAnswer [data-cmd]'));
  if (!chip) note('llm', 'tool call rendered no confirm chip');
  const food1 = await page.evaluate(() => window.heroFish?.state?.food?.length ?? -1);
  if (food1 > food0) note('llm', 'tool call AUTO-RAN (food appeared before confirm)');
  // workspace + density with an answer present: no overflow, answer survives
  await type(page, 'who is john', 3000);
  await page.click('#so-workspaceBtn'); await page.waitForTimeout(1200);
  let ws = await state(page); if (!ws.answer) note('llm', 'answer lost on workspace toggle');
  await page.click('.pc-density'); await page.waitForTimeout(900);
  ws = await state(page); if (!ws.answer) note('llm', 'answer lost on density flip');
  await page.click('#so-workspaceBtn'); await page.waitForTimeout(800);
  // Enter on a question with an answer: must NOT navigate
  await type(page, 'why should I hire him', 2500); await page.keyboard.press('Enter'); await page.waitForTimeout(600);
  if (!/index\.html/.test(page.url()) || !(await state(page)).open) note('llm', 'Enter on a question navigated away');
  if (errs.length) note('llm', 'console', errs.join(' | '));
  await ctx.close();
}

// ───── 5. scene language on both canvases ─────
for (const [pg, utter, noun] of [['index.html', 'add 3 small fish', 'fish'], ['design.html', 'draw a circle and put two fish inside', 'fish']]) {
  const { ctx, page, errs } = await fresh(pg);
  const s = await type(page, utter, 1500);
  if (!s.plan) { note('scene', `${pg} "${utter}" produced no plan card`); await ctx.close(); continue; }
  await page.keyboard.press('Enter'); await page.waitForTimeout(1800);
  const receipt = await page.evaluate(() => (document.getElementById('so-searchResults')?.textContent || '').replace(/\s+/g, ' ').slice(0, 300));
  if (!/\d+\s*\/\s*\d+|added|spawned|receipt|✓|enclosed/i.test(receipt)) note('scene', `${pg} plan ran but no receipt text`, receipt.slice(0, 120));
  const census = await type(page, 'how many fish are there', 1200);
  if (!census.census) note('scene', `${pg} census did not render`);
  if (errs.length) note('scene', pg + ' console', errs.join(' | '));
  await ctx.close();
}

await browser.close();
console.log(JSON.stringify(findings, null, 1));
console.log(findings.length ? `${findings.length} findings` : 'CLEAN');
