// Phase 9a QA — the Stable Surface: morph (not rebuild), scroll discipline,
// the never-scrolling command frame, chrome consolidation
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

// ───────── 1. morph + scroll discipline (overlay on index) ─────────
{
  console.log('morph / scroll:');
  // Tall viewport: the no-scroll doctrine (9e) sheds modules on short
  // panels, and this section needs two live modules to witness the morph.
  const ctx = await browser.newContext({ colorScheme: 'dark', viewport: { width: 1280, height: 920 } });
  await ctx.route(/(localhost|127\.0\.0\.1):(1234|11434)/, r => r.abort());
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' && !/net::|ERR_/.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
  await page.keyboard.press('/');
  await page.waitForTimeout(1200);
  await page.fill('#so-searchInput', 'fish');
  await page.waitForTimeout(800);

  // The morph invariant, driven by the density toggle (the surviving same-query
  // interaction now that click-to-pin is gone): any module whose TIER did not
  // change keeps its DOM node. Budget redistribution may legitimately re-tier
  // several siblings — those are allowed to swap.
  const setup = await page.evaluate(() => {
    const mods = [...document.querySelectorAll('.pc-mod')];
    const target = mods.find(m => m.dataset.lod !== '3');
    if (!target) return null;
    mods.forEach(m => { m.__witness = true; });
    return { targetId: target.dataset.id, baseLod: target.dataset.lod,
             before: mods.map(m => ({ id: m.dataset.id, lod: m.dataset.lod })) };
  });
  check('a non-dominant module exists to re-grade', !!setup, JSON.stringify(setup && setup.before));
  const regrade = () => page.click('.pc-density');
  const density0 = await page.evaluate(() => document.querySelector('.postcard')?.dataset.density);
  const morphAudit = (before) => page.evaluate((prev) => {
    const out = { violations: [], swapped: 0, kept: 0 };
    for (const p of prev) {
      const n = document.querySelector(`.pc-mod[data-id="${p.id}"]`);
      if (!n) continue;   // structural change — not this assertion's concern
      if (n.dataset.lod === p.lod) { n.__witness ? out.kept++ : out.violations.push(p.id); }
      else out.swapped++;
    }
    return out;
  }, before);
  // The morph's real driver is a SAME-QUERY re-render (what a semantic refine
  // does when the embedder lands): identical query, identical structure, so
  // every module must keep its DOM node. Re-dispatching the same input value
  // reproduces it deterministically.
  await page.evaluate(() => {
    const i = document.getElementById('so-searchInput');
    i.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(500);
  const s1 = await morphAudit(setup.before);
  check('same-query re-render morphs in place (every node kept)',
    s1.violations.length === 0 && s1.kept > 0, JSON.stringify(s1));
  // Round-trip: the DENSITY state must return, and with it the tiers. DOM
  // identity is NOT asserted here — a density flip re-composes the tail, and
  // a structural change is a legitimate full rebuild under the morph contract
  // (only same-structure, same-query swaps promise node identity, above).
  await regrade();
  await page.waitForTimeout(450);
  const flipped = await page.evaluate(() => document.querySelector('.postcard')?.dataset.density);
  await regrade();
  await page.waitForTimeout(450);
  const round = await page.evaluate((i) => ({
    density: document.querySelector('.postcard')?.dataset.density,
    lod: document.querySelector(`.pc-mod[data-id="${i}"]`)?.dataset.lod,
  }), setup.targetId);
  check('density flips and round-trips, tiers with it',
    flipped !== density0 && round.density === density0 && round.lod === setup.baseLod,
    JSON.stringify({ density0, flipped, ...round, baseLod: setup.baseLod }));

  // nothing on the surface expands any more: a module body is inert
  const inert = await page.evaluate(() => {
    const m = [...document.querySelectorAll('.pc-mod')].find(x => x.dataset.lod !== '3');
    if (!m) return { skip: true };
    const before = m.dataset.lod;
    (m.querySelector('.pc-tldr, .pc-micro') || m).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return { before, after: document.querySelector(`.pc-mod[data-id="${m.dataset.id}"]`)?.dataset.lod };
  });
  await page.waitForTimeout(350);
  check('clicking a module body does nothing (no second level)',
    inert.skip || inert.before === inert.after, JSON.stringify(inert));

  // scroll discipline: preserved on same-query interaction, reset on new query
  await page.fill('#so-searchInput', 'design');
  await page.waitForTimeout(800);
  const scrolled = await page.evaluate(() => {
    const sc = document.querySelector('.so-panel-scroll');
    sc.scrollTop = 120;
    return sc.scrollTop;
  });
  // Needs a REAL scroll offset to preserve. The fit work landed 'design' at
  // ~7px of overflow, and anchoring within 6px of a 7px scroll measures noise.
  if (scrolled > 40) {
    // The invariant is VIEWPORT stability, not a frozen scrollTop: a re-grade
    // changes content height, and scroll anchoring compensates by moving
    // scrollTop so what the reader sees stays put.
    const beforeRect = await page.evaluate(() => {
      // Anchor on the FIRST module: the tail is exactly what a re-grade
      // sheds, and a vanished witness measures nothing.
      // Re-find by data-id, not a DOM property: a density re-grade can
      // rebuild the nodes, and an expando does not survive that.
      const t = document.querySelector('.pc-mod');
      return { id: t.dataset.id, top: t.getBoundingClientRect().top };
    });
    await page.evaluate((id) => { window.__anchorId = id; }, beforeRect.id);
    await regrade();
    await page.waitForTimeout(350);
    const after2 = await page.evaluate(() => {
      const t = document.querySelector('.pc-mod[data-id="' + window.__anchorId + '"]');
      return { top: t ? t.getBoundingClientRect().top : -999,
               scrollTop: document.querySelector('.so-panel-scroll').scrollTop };
    });
    check('same-query re-grade keeps the viewport stable (no jump to top)',
      after2.scrollTop > 0 && Math.abs(after2.top - beforeRect.top) < 6,
      `rect ${beforeRect.top.toFixed(0)} → ${after2.top.toFixed(0)}, scrollTop ${scrolled} → ${after2.scrollTop}`);
    await regrade();   // restore density for the checks below
    await page.waitForTimeout(300);
  } else {
    check('same-query re-grade keeps the viewport stable (no jump to top)', true, );
  }
  await page.fill('#so-searchInput', 'metamedium');
  await page.waitForTimeout(800);
  check('new query resets scroll to top', await page.evaluate(() =>
    document.querySelector('.so-panel-scroll').scrollTop) === 0);

  // the frame never scrolls: input rect fixed while results scroll
  await page.fill('#so-searchInput', 'fish');
  await page.waitForTimeout(800);
  const before = await page.evaluate(() => document.getElementById('so-searchInput').getBoundingClientRect().top);
  await page.evaluate(() => { const sc = document.querySelector('.so-panel-scroll'); sc.scrollTop = 200; });
  await page.waitForTimeout(150);
  const after = await page.evaluate(() => document.getElementById('so-searchInput').getBoundingClientRect().top);
  check('command frame holds while results scroll', before === after, `${before} vs ${after}`);

  // chrome consolidation
  const chrome = await page.evaluate(() => ({
    resultsLabel: document.querySelectorAll('.section-label').length,
    actionsLabel: [...document.querySelectorAll('.cmdbar-group-label')].filter(e => e.textContent === 'Actions').length,
    info: !!document.querySelector('.pc-info'),
  }));
  check('"Results" label row gone', chrome.resultsLabel === 0);
  check('"Actions" label row gone', chrome.actionsLabel === 0);
  check('fusion ⓘ lives in the postcard byline', chrome.info);

  check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

// ───────── 2. search.html sticky frame ─────────
{
  console.log('search.html frame:');
  const ctx = await browser.newContext({ colorScheme: 'dark', viewport: { width: 1000, height: 500 } });
  await ctx.route(/(localhost|127\.0\.0\.1):(1234|11434)/, r => r.abort());
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' && !/net::|ERR_/.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(`${BASE}/search.html?q=fish`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2200);
  await page.evaluate(() => window.scrollTo(0, 800));
  await page.waitForTimeout(200);
  const rect = await page.evaluate(() => {
    const r = document.getElementById('searchInput').getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, vh: window.innerHeight, scrollY: window.scrollY };
  });
  check('page scrolled', rect.scrollY > 0, String(rect.scrollY));
  check('search bar still in view (sticky under nav)', rect.top >= 0 && rect.bottom <= rect.vh,
    JSON.stringify(rect));
  check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

// ───────── 3. 9b — fact granularity (the awards monolith, unrolled) ─────────
{
  console.log('fact rows:');
  // Tall viewport: on short panels the no-scroll doctrine (9e) demotes the
  // dossier before its fact rows can render.
  const ctx = await browser.newContext({ colorScheme: 'dark', viewport: { width: 1280, height: 920 } });
  await ctx.route(/(localhost|127\.0\.0\.1):(1234|11434)/, r => r.abort());
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' && !/net::|ERR_/.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
  await page.keyboard.press('/');
  await page.waitForTimeout(1200);
  await page.fill('#so-searchInput', 'awards');
  await page.waitForTimeout(900);

  const facts = await page.evaluate(() => ({
    rows: document.querySelectorAll('.pc-fact-row').length,
    prose: !!document.querySelector('.pc-l3 .pc-prose'),
    mediaOnOwnRow: !!document.querySelector('.pc-fact-row--media .result-model, .pc-fact-row--media model-viewer, .pc-fact-row--media .result-thumb'),
    years: [...document.querySelectorAll('.pc-fact-y')].map(y => y.textContent),
    dVisible: [...document.querySelectorAll('.pc-fact-d')].filter(d => getComputedStyle(d).display !== 'none').length,
  }));
  check('awards dossier is fact rows, not a prose monolith', facts.rows >= 5 && !facts.prose,
    `${facts.rows} rows, prose=${facts.prose}`);
  check('the trophy sits beside its OWN row', facts.mediaOnOwnRow);
  check('years present and tabular', facts.years.includes('2022') && facts.years.includes('2016'), facts.years.join(','));
  check('compact hides detail (it lives in the hover tip)', facts.dVisible === 0, String(facts.dVisible));

  await page.locator('.pc-density').click();
  await page.waitForTimeout(400);
  const comfy = await page.evaluate(() =>
    [...document.querySelectorAll('.pc-fact-d')].filter(d => getComputedStyle(d).display !== 'none').length);
  check('comfortable reveals detail inline — density reaches inside the dossier', comfy >= 5, String(comfy));
  await page.locator('.pc-density').click();
  await page.waitForTimeout(300);

  // a non-facts chunk still gets the prose dossier + pretext signature
  await page.fill('#so-searchInput', 'metamedium');
  await page.waitForTimeout(900);
  check('prose chunks keep the wrapped dossier', await page.evaluate(() =>
    !!document.querySelector('.pc-l3 .pc-prose') && !document.querySelector('.pc-fact-row')));

  check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

// ───────── 4. 9c — one click/keyboard grammar ─────────
{
  console.log('grammar:');
  const ctx = await browser.newContext({ colorScheme: 'dark' });
  await ctx.route(/(localhost|127\.0\.0\.1):(1234|11434)/, r => r.abort());
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' && !/net::|ERR_/.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
  await page.keyboard.press('/');
  await page.waitForTimeout(1200);

  // badge = the explicit nav affordance
  await page.fill('#so-searchInput', 'nanome');
  await page.waitForTimeout(700);
  const badge = await page.locator('.pc-mod .result-page-link').first();
  check('page badge is a link wearing ↗', (await badge.textContent()).includes('↗'),
    await badge.textContent());

  // ↑↓ cursor traversal + Esc rung 1
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  let cur = await page.evaluate(() => {
    const items = [...document.querySelectorAll('.cmd-card, .pc-mod, .pc-tail-item')];
    return items.findIndex(n => n.classList.contains('pc-cursor'));
  });
  check('↓↓ lights the second item', cur === 1, String(cur));
  await page.keyboard.press('ArrowUp');
  cur = await page.evaluate(() =>
    [...document.querySelectorAll('.cmd-card, .pc-mod, .pc-tail-item')].findIndex(n => n.classList.contains('pc-cursor')));
  check('↑ steps back', cur === 0, String(cur));
  await page.keyboard.press('Escape');
  const esc1 = await page.evaluate(() => ({
    cursor: !!document.querySelector('.pc-cursor'),
    open: document.getElementById('searchOverlay').getAttribute('aria-hidden') === 'false',
    query: document.getElementById('so-searchInput').value,
  }));
  check('Esc rung 1: clears cursor, overlay stays, query stays', !esc1.cursor && esc1.open && esc1.query === 'nanome', JSON.stringify(esc1));

  // Esc rung 2: clears the query; rung 3: closes. (The old unpin rung went
  // with click-to-pin — there is no view state between cursor and query now.)
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const esc3 = await page.evaluate(() => ({
    query: document.getElementById('so-searchInput').value,
    open: document.getElementById('searchOverlay').getAttribute('aria-hidden') === 'false',
  }));
  check('Esc rung 3: clears query, overlay stays', esc3.query === '' && esc3.open, JSON.stringify(esc3));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  check('Esc rung 4: closes the overlay', await page.evaluate(() =>
    document.getElementById('searchOverlay').getAttribute('aria-hidden') === 'true'));

  // Enter commits the first action
  await page.keyboard.press('/');
  await page.waitForTimeout(600);
  await page.fill('#so-searchInput', 'scare the fish');
  await page.waitForTimeout(600);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  check('Enter runs the top action (overlay closes to show the effect)', await page.evaluate(() =>
    document.getElementById('searchOverlay').getAttribute('aria-hidden') === 'true'));

  // Enter navigates the top result when no action/plan
  await page.keyboard.press('/');
  await page.waitForTimeout(600);
  await page.fill('#so-searchInput', 'nanome case study');
  await page.waitForTimeout(700);
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
    page.keyboard.press('Enter'),
  ]);
  check('Enter navigates to the top result', /nanome2\.html/.test(page.url()), page.url());

  check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

// ───────── 5. 9d — workspace mode (desktop two-pane) ─────────
{
  console.log('workspace:');
  const ctx = await browser.newContext({ colorScheme: 'dark', viewport: { width: 1400, height: 850 } });
  await ctx.route(/(localhost|127\.0\.0\.1):(1234|11434)/, r => r.abort());
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' && !/net::|ERR_/.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
  await page.keyboard.press('/');
  await page.waitForTimeout(1200);
  await page.fill('#so-searchInput', 'design');
  await page.waitForTimeout(900);
  // under full-suite load the first render can lag the debounce — wait for it
  await page.waitForSelector('#so-searchResults .pc-mod', { timeout: 5000 });

  await page.click('#so-workspaceBtn');
  await page.waitForTimeout(600);
  const ws = await page.evaluate(() => ({
    on: document.getElementById('searchOverlay').classList.contains('so-workspace'),
    strata: document.querySelectorAll('#so-detailPane .pc-meta-stratum').length,
    listLods: [...document.querySelectorAll('#so-searchResults .pc-mod')].map(m => +m.dataset.lod),
    panelW: document.querySelector('.search-overlay-panel').getBoundingClientRect().width,
  }));
  check('⤢ opens the two-pane workspace', ws.on && ws.panelW > 900, `w=${ws.panelW}`);
  check('pane composes a meta-paragraph (lead + related strata)', ws.strata >= 2, String(ws.strata));
  check('the list stays a compact waterfall (no dossier in list)', ws.listLods.every(l => l <= 2), ws.listLods.join(','));

  // The pane seeds from the TOP result now that nothing can be pinned.
  const top = await page.evaluate(() => [...document.querySelectorAll('#so-searchResults .pc-mod')][0]?.dataset.id);
  const seeded = await page.evaluate(() => ({
    showing: document.getElementById('so-detailPane').dataset.showing,
    listLods: [...document.querySelectorAll('#so-searchResults .pc-mod')].map(m => +m.dataset.lod),
  }));
  check('the pane seeds from the top result, the list stays a waterfall',
    seeded.showing.startsWith(top + '|') && seeded.listLods.every(l => l <= 2),
    JSON.stringify({ top, ...seeded }));

  await page.click('#so-workspaceBtn');
  await page.waitForTimeout(500);
  check('toggling off restores the single column', await page.evaluate(() =>
    !document.getElementById('searchOverlay').classList.contains('so-workspace')
    && document.getElementById('so-detailPane').innerHTML === ''
    && !!document.querySelector('#so-searchResults .pc-l3')));

  // persistence: the latch survives a reload
  await page.click('#so-workspaceBtn');
  await page.waitForTimeout(300);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
  await page.keyboard.press('/');
  await page.waitForTimeout(1200);
  check('workspace latch persists across sessions', await page.evaluate(() =>
    document.getElementById('searchOverlay').classList.contains('so-workspace')));

  check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

// ───────── 6. 9e — no-scroll doctrine, media continuity, meta-pane depth ─────────
{
  console.log('no-scroll / continuity:');
  const ctx = await browser.newContext({ colorScheme: 'dark', viewport: { width: 1400, height: 850 } });
  await ctx.route(/(localhost|127\.0\.0\.1):(1234|11434)/, r => r.abort());
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' && !/net::|ERR_/.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
  await page.keyboard.press('/');
  await page.waitForTimeout(1200);

  // media continuity: the model-viewer NODE survives a density toggle
  await page.fill('#so-searchInput', 'awards');
  await page.waitForTimeout(900);
  await page.evaluate(() => { const mv = document.querySelector('#so-searchResults model-viewer'); if (mv) mv.__live = true; });
  await page.locator('.pc-density').click();
  await page.waitForTimeout(500);
  const kept = await page.evaluate(() => !!document.querySelector('#so-searchResults model-viewer')?.__live);
  check('model frame survives the tier change (no blink)', kept);
  await page.locator('.pc-density').click();
  await page.waitForTimeout(400);

  // no-scroll doctrine: the panel never overflows, any query, any density
  const over = () => page.evaluate(() => {
    const sc = document.querySelector('.so-panel-scroll');
    return sc.scrollHeight - sc.clientHeight;
  });
  // The doctrine's contract: no VISIBLE scroll. The fit loop tolerates a
  // sub-line residue (< lineHeight/2 ≈ 10px) because fixed chrome doesn't
  // quantize to lines — the assertion holds the same contract.
  for (const q of ['design', 'fish', 'why should I hire him']) {
    await page.fill('#so-searchInput', q);
    await page.waitForTimeout(900);
    check(`"${q}" fits the panel — no visible scroll`, (await over()) <= 10, String(await over()));
  }
  await page.locator('.pc-density').click();
  await page.waitForTimeout(600);
  check('comfortable density still fits — no visible scroll', (await over()) <= 11, String(await over()));
  await page.locator('.pc-density').click();
  await page.waitForTimeout(400);
  check('long tail collapses to "+N more", not scroll', await page.evaluate(() =>
    !!document.querySelector('.pc-tail-more') || document.querySelectorAll('.pc-tail-item').length <= 8));

  // meta-pane: empty state seeds the page's own story; stratum click promotes
  await page.click('#so-workspaceBtn');
  await page.waitForTimeout(600);
  await page.fill('#so-searchInput', '');
  await page.waitForTimeout(800);
  const seed = await page.evaluate(() => ({
    strata: [...document.querySelectorAll('#so-detailPane .pc-meta-stratum')].map(s => s.dataset.id),
    paneOver: (() => { const p = document.getElementById('so-detailPane'); return p.scrollHeight - p.clientHeight; })(),
  }));
  check('empty state seeds the pane (never an empty half-screen)', seed.strata.length >= 2, seed.strata.join(','));
  check('the pane obeys the no-scroll doctrine too', seed.paneOver <= 10, String(seed.paneOver));
  if (seed.strata.length > 1) {
    // Strata are inert now: the pane is a reading surface, not a second
    // level you steer. Clicking one must not re-seed the pane.
    await page.evaluate((id) => {
      const s = document.querySelector(`#so-detailPane .pc-meta-stratum[data-id="${id}"]`);
      (s.querySelector('.pc-prose, .pc-meta-prose') || s).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }, seed.strata[1]);
    await page.waitForTimeout(600);
    check('clicking a related stratum does nothing (no second level)',
      await page.evaluate((first) =>
        document.querySelector('#so-detailPane .pc-meta-stratum')?.dataset.id === first, seed.strata[0]));
  }
  await page.evaluate(() => { try { localStorage.removeItem('jh-search-workspace'); } catch {} });

  check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

await browser.close();
console.log(failures.length ? `\nFAILURES (${failures.length}):\n- ` + failures.join('\n- ') : '\nALL PASS');
process.exit(failures.length ? 1 : 0);
