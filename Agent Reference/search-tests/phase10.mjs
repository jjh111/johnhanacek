// Phase 10b QA — session memory & the collapsed search
// Needs mock-llm.mjs running on :9911.
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

// ───────── 1. answer kept across a command navigation ─────────
{
  console.log('answer continuity:');
  const ctx = await browser.newContext({ colorScheme: 'dark', viewport: { width: 1280, height: 920 } });
  await ctx.addInitScript(() => {
    localStorage.setItem('jh-local-llm-optin', 'true');
    localStorage.setItem('searchCustomEndpoint', 'http://127.0.0.1:9911/v1');
  });
  await ctx.route('**://localhost:1234/**', r => r.abort());
  await ctx.route('**://localhost:11434/**', r => r.abort());
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' && !/net::|Failed to load resource|Permissions policy/.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.keyboard.press('/');
  await page.waitForTimeout(7000);   // local probes time out before custom endpoint lands

  await page.fill('#so-searchInput', 'who is john');
  await page.waitForTimeout(2800);
  const ans = await page.locator('#so-aiAnswer').textContent();
  check('mock answer generated', ans.length > 30, ans.slice(0, 40));
  const stored = await page.evaluate(() => JSON.parse(sessionStorage.getItem('jh-search-session') || 'null'));
  check('answer saved to the session', !!stored && stored.query === 'who is john' && stored.answer.length > 30,
    stored ? `${stored.query} / ${stored.answer.slice(0, 30)}` : 'null');

  // navigate via a nav command → the residue sentence stands on the next page
  await page.fill('#so-searchInput', 'who is john');   // keep query current
  await page.waitForTimeout(400);
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
    page.evaluate(() => window.JHSearch.executeCommand('goto:design')),
  ]);
  await page.waitForTimeout(1500);
  check('landed on design', /design\.html/.test(page.url()), page.url());
  // header view only: in the hero (nav hidden) the sentence stays hidden —
  // CSS-hidden nodes still count(), so assert visibility
  check('hidden in the hero area (nav not in view)', !(await page.locator('.so-residue').isVisible()));
  await page.evaluate(() => window.scrollTo(0, 900));
  await page.waitForTimeout(800);
  const residue = page.locator('.so-residue');
  check('residue sentence stands under the header', await residue.isVisible());
  const residueText = await residue.textContent();
  check('residue carries the query and the answer clause', /who is john/.test(residueText)
    && residueText.length > 'who is john'.length + 5, residueText.trim().slice(0, 90));
  // a kept answer is NOT dismissible — no ✕ on the line (John: it stands)
  check('a kept answer has no dismiss control', await page.locator('.so-residue-x').count() === 0);
  // (overlay-open hiding is CSS: body.search-overlay-open .so-residue)

  // reopen restored
  await page.locator('.so-residue-open').click();
  await page.waitForTimeout(2500);
  const restored = await page.evaluate(() => ({
    open: document.getElementById('searchOverlay')?.getAttribute('aria-hidden') === 'false',
    input: document.getElementById('so-searchInput')?.value,
    answer: document.getElementById('so-aiAnswer')?.textContent || '',
    restoredFlag: !!document.getElementById('so-aiAnswer')?.dataset.restored,
    byline: getComputedStyle(document.getElementById('so-aiAnswer'), '::before').content,
    postcard: !!document.querySelector('#so-searchResults .pc-mod'),
  }));
  check('overlay reopens restored', restored.open && restored.input === 'who is john');
  check('the KEPT answer is re-attached (not regenerated)', restored.answer.includes(ans.slice(0, 25)));
  check('honest byline: "from your last search"', restored.restoredFlag && /last search/.test(restored.byline), restored.byline);
  check('postcard re-derived deterministically', restored.postcard);
  // closing the overlay brings the sentence back — open/collapse is one object
  // (⌘K closes WITHOUT clearing the box; Escape would clear it, which is the
  // close-out-and-reset semantics and legitimately ends the session)
  await page.keyboard.press('Meta+k');
  await page.waitForTimeout(600);
  check('closing the overlay resurrects the sentence', await page.locator('.so-residue').isVisible());

  check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

// ───────── 2. query-only continuity + one-shot + TTL ─────────
{
  console.log('query-only / one-shot / TTL:');
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

  // no engine: query-only navigation still collapses the search
  await page.fill('#so-searchInput', 'nanome case study');
  await page.waitForTimeout(800);
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
    page.keyboard.press('Enter'),
  ]);
  await page.waitForTimeout(1200);
  const residue = page.locator('.so-residue');
  check('query-only residue appears after Enter-navigation', await residue.count() === 1);
  const t = await residue.textContent();
  check('residue carries the query and the top result micro', /nanome case study/.test(t) && t.length > 'nanome case study'.length + 5, t.trim());
  // query-only (no answer) IS dismissible — the ✕ exists here
  check('a bare query tease carries the dismiss control', await page.locator('.so-residue-x').count() === 1);

  // STANDING: a plain reload keeps the sentence (not a one-shot toast)
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  check('standing — the residue survives a plain reload', await page.locator('.so-residue').isVisible());

  // ✕ dismisses for the SESSION: survives reloads and navigation
  await page.locator('.so-residue-x').click();
  check('dismiss removes the sentence', await residue.count() === 0);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  check('dismissal survives a reload', await page.locator('.so-residue').count() === 0);

  // a NEW search resurrects it
  await page.keyboard.press('/');
  await page.waitForTimeout(800);
  await page.fill('#so-searchInput', 'fish minigame');
  await page.waitForTimeout(900);
  await page.keyboard.press('Meta+k');   // close without clearing — the search stands
  await page.waitForTimeout(600);
  check('a new search resurrects a dismissed sentence', await page.locator('.so-residue').isVisible()
    && /fish minigame/.test(await page.locator('.so-residue').textContent()));

  // TTL: a stale session never resurfaces
  await page.evaluate(() => {
    const s = JSON.parse(sessionStorage.getItem('jh-search-session'));
    s.ts = Date.now() - 31 * 60 * 1000;
    sessionStorage.setItem('jh-search-session', JSON.stringify(s));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  check('expired session shows no residue', await page.locator('.so-residue').count() === 0);

  check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

// ───────── 3. 10c — pieces: the site's widgets as search material ─────────
{
  console.log('pieces:');
  const ctx = await browser.newContext({ colorScheme: 'dark', viewport: { width: 1280, height: 920 } });
  await ctx.route(/(localhost|127\.0\.0\.1):(1234|11434)/, r => r.abort());
  const page = await ctx.newPage();
  const errors = [];
  // framed demos emit benign policy notices (compute-pressure) — not ours
  page.on('console', m => { if (m.type() === 'error' && !/net::|ERR_|Failed to load resource|Permissions policy/.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(`${BASE}/about.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.keyboard.press('/');
  await page.waitForTimeout(1200);

  // the rail: piece intent collects the top results' pieces
  await page.fill('#so-searchInput', 'interactive demos');
  await page.waitForTimeout(900);
  const rail = await page.evaluate(() => ({
    hint: document.querySelector('.pc-head .cmdbar-group-label')?.textContent || '',
    demos: document.querySelectorAll('.pc-piece-rail .pc-piece--demo').length,
    links: document.querySelectorAll('.pc-piece-rail .pc-piece--link').length,
    framedExternals: [...document.querySelectorAll('.pc-piece--link iframe')].length,
  }));
  check('piece intent fires the rail', /pieces/i.test(rail.hint) && rail.demos >= 3, JSON.stringify(rail));
  // 10f: allowlisted (John-owned, header-checked) externals wake as demos —
  // the rail's demo count includes them. Departure cards never carry iframes.
  check('departure cards are doorways, never frames (allowlist pieces wake instead)',
    rail.framedExternals === 0);

  // wake budget: ONE live iframe, ever.
  // Guarded, not relaxed: when the rail is starved (the piece-intent content
  // call above), this records a FAILURE instead of throwing on a null click —
  // an aborted suite silently skips every assertion after this line.
  const srcs = await page.evaluate(() =>
    [...document.querySelectorAll('.pc-piece-rail .pc-piece--demo')].map(p => p.dataset.pieceSrc));
  if (srcs.length >= 2) {
    await page.evaluate((s) => document.querySelector(`[data-piece-src="${s}"]`).click(), srcs[0]);
    await page.waitForTimeout(700);
    await page.evaluate((s) => document.querySelector(`[data-piece-src="${s}"]`).click(), srcs[1]);
    await page.waitForTimeout(700);
    const budget = await page.evaluate(() => ({
      iframes: document.querySelectorAll('.pc-piece iframe').length,
      woken: [...document.querySelectorAll('.pc-piece--woken')].map(p => p.dataset.pieceSrc),
    }));
    check('waking a second sleeps the first (budget of one)', budget.iframes === 1 && budget.woken[0] === srcs[1],
      JSON.stringify(budget));
  } else {
    check('waking a second sleeps the first (budget of one)', false,
      `rail has ${srcs.length} demos — piece-intent content call (defbc51)`);
  }

  // closing the overlay sleeps the live piece
  await page.keyboard.press('Escape');   // clear query
  await page.keyboard.press('Escape');   // close
  await page.waitForTimeout(400);
  check('closing the overlay sleeps the demo', await page.evaluate(() =>
    document.querySelectorAll('.pc-piece iframe').length === 0));

  // zoom-and-wake: a small piece click promotes its module AND wakes the demo
  await page.keyboard.press('/');
  await page.waitForTimeout(500);
  await page.fill('#so-searchInput', 'fish minigame');
  await page.waitForTimeout(900);
  check('specific query is NOT hijacked by the piece sweep', await page.evaluate(() =>
    document.querySelector('.pc-mod')?.dataset.id === '35'));
  // Guarded like the budget clicks: chunk 35 lost its `pieces` entry in the
  // 2026-08 media-match data pass, so the gesture has nothing to click. A
  // failure names the data gap; a crash would strand every later section.
  const hasPiece = await page.evaluate(() => !!document.querySelector('.pc-mod[data-id="35"] .pc-piece--demo'));
  if (hasPiece) {
    await page.click('.pc-mod[data-id="35"] .pc-piece--demo');
    await page.waitForTimeout(3600);   // fonts.ready + pretext wrap can outlast 2s cold
    const woven = await page.evaluate(() => ({
      lod: document.querySelector('.pc-mod[data-id="35"]')?.dataset.lod,
      live: !!document.querySelector('.pc-mod[data-id="35"] .pc-piece--woken iframe'),
      wrapped: document.querySelectorAll('.pc-mod[data-id="35"] .pretext-line').length,
      tipStuck: (() => { const t = document.querySelector('.pc-tip'); return !!t && t.style.display !== 'none'; })(),
    }));
    check('small piece click zooms the module and wakes the demo IN the dossier',
      woven.lod === '3' && woven.live, JSON.stringify(woven));
    check('prose stays pretext-wrapped around the LIVE demo', woven.wrapped > 3, String(woven.wrapped));
    check('no stale tooltip after the gesture', !woven.tipStuck);
  } else {
    check('small piece click zooms the module and wakes the demo IN the dossier', false,
      'chunk 35 carries no pieces — data gap from the media-match pass');
  }

  check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

// ───────── 4. 10e.1 — media dedupe (list guard, cross-pane, data lint) ─────────
{
  console.log('10e.1 media dedupe:');
  const ctx = await browser.newContext({ colorScheme: 'dark', viewport: { width: 1280, height: 920 } });
  // Doctor the index BEFORE the core loads: chunks 1 and 28 share a visual.
  // (Mutating window.JHSearch.chunks post-hoc does nothing — retrieval reads
  // MiniSearch's stored-field snapshot, not the raw array.)
  let doctored = false;
  await ctx.route('**/search-chunks.json*', async route => {
    if (doctored) return route.fallback();
    doctored = true;
    const resp = await route.fetch();
    const body = await resp.json();
    const list = body.chunks || body;
    const c1 = list.find(c => c.id === 1);
    if (c1) c1.image = 'Assets/nanome2-beforeafter.webp';   // same as 28
    await route.fulfill({ response: resp, body: JSON.stringify(body), contentType: 'application/json' });
  });
  await ctx.route('**://localhost:1234/**', r => r.abort());
  await ctx.route('**://localhost:11434/**', r => r.abort());
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' && !/net::|Failed to load resource|Permissions policy/.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  await page.keyboard.press('/');
  await page.waitForTimeout(700);
  await page.fill('#so-searchInput', 'who is john');
  await page.waitForTimeout(1500);

  // data lint on the SHIPPED (undoctored) index — need a fresh fetch: the
  // route only doctors this context's request, so compare in-page
  const lint = await page.evaluate(async () => {
    const d = await (await fetch('./Assets/search-chunks.json?v=' + Date.now())).json();
    const list = d.chunks || d;
    const seen = new Map(); const dupes = [];
    for (const c of list) {
      for (const key of [c.image, c.video, c.model3d].filter(Boolean)) {
        if (seen.has(key)) dupes.push(`${seen.get(key)}+${c.id}: ${key}`);
        else seen.set(key, c.id);
      }
    }
    return dupes;
  });
  check('shipped index carries no duplicate media fields', lint.length === 0, lint.join(' ; '));

  // render guard: two modules, one visual → rendered once (higher rank wins)
  const imgs = await page.evaluate(() =>
    [...document.querySelectorAll('.pc-mod img.result-thumb')].map(i => i.getAttribute('src')));
  check('forced duplicate renders text-only on the later module',
    imgs.filter(s => /beforeafter/.test(s)).length === 1, imgs.join(','));

  // cross-pane: workspace on → pane leads with chunk 1; the list copy of the
  // SAME chunk renders text-only (the pane wins — it has depth)
  await page.click('#so-workspaceBtn');
  await page.waitForTimeout(1200);
  const cross = await page.evaluate(() => {
    const pane = document.getElementById('so-detailPane');
    const showing = pane?.dataset?.showing;
    if (!showing) return { err: 'pane empty' };
    const lead = Number(showing.split('|')[0]);
    const paneHasMedia = !!pane.querySelector('.pc-meta-stratum img.result-thumb, .pc-meta-stratum model-viewer, .pc-meta-stratum .result-video-wrap, .pc-meta-stratum .pc-piece');
    const listMod = document.querySelector(`.postcard .pc-mod[data-id="${lead}"]`);
    const listHasMedia = !!listMod && !!(listMod.querySelector('img.result-thumb, model-viewer, .result-video-wrap, .pc-piece'));
    return { lead, paneHasMedia, listHasMedia };
  });
  check('workspace: pane wins — lead chunk media in pane, text-only in list',
    !cross.err && cross.paneHasMedia && !cross.listHasMedia, JSON.stringify(cross));

  check('no console errors (dedupe)', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

// ───────── 5. 10f — externals: frameable wakes live, others are labeled exits ─────────
{
  console.log('10f externals:');
  const ctx = await browser.newContext({ colorScheme: 'dark', viewport: { width: 1280, height: 920 } });
  await ctx.route('**://localhost:1234/**', r => r.abort());
  await ctx.route('**://localhost:11434/**', r => r.abort());
  const page = await ctx.newPage();
  const errors = [];
  // framed external pages emit benign policy notices (compute-pressure)
  page.on('console', m => { if (m.type() === 'error' && !/net::|Failed to load resource|Permissions policy/.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  await page.keyboard.press('/');
  await page.waitForTimeout(700);

  // 1. frameable (John's GitHub Pages) wakes LIVE under the one-iframe budget
  await page.fill('#so-searchInput', 'metamedium');
  await page.waitForTimeout(1200);
  await page.click('.pc-mod .pc-piece--demo, .pc-piece-rail .pc-piece--demo');
  await page.waitForTimeout(1500);
  const frameSrc = await page.evaluate(() => document.querySelector('.pc-piece--woken iframe')?.getAttribute('src') || '');
  check('frameable external piece (MetaMedium) wakes like a demo',
    /jjh111\.github\.io/.test(frameSrc), frameSrc || '(no iframe)');
  check('wake budget still one with external frames live',
    await page.evaluate(() => document.querySelectorAll('.pc-piece iframe').length === 1));

  // 2. unframeable (Substack) renders the DEPARTURE CARD with its poster
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  await page.keyboard.press('/');           // reopen (Escape closed the overlay)
  await page.waitForTimeout(500);
  await page.fill('#so-searchInput', 'fractal futures');
  await page.waitForTimeout(1200);
  const depart = await page.evaluate(() => {
    const card = document.querySelector('.pc-piece--link');
    return card ? {
      href: card.getAttribute('href'),
      rel: card.getAttribute('rel'),
      poster: !!card.querySelector('.pc-piece-poster'),
      host: card.querySelector('.pc-piece-host')?.textContent,
      tip: card.getAttribute('title') || '',
    } : null;
  });
  check('unframeable piece renders a departure card with poster',
    !!depart && /substack/.test(depart.href) && depart.poster && /me noopener/.test(depart.rel)
    && /leaves the site/i.test(depart.tip), JSON.stringify(depart));

  // 3. lint: every external anchor in rendered results is a labeled departure
  const rawExt = await page.evaluate(() =>
    [...document.querySelectorAll('#so-searchResults a[target="_blank"]')]
      .filter(a => !a.classList.contains('pc-piece--link'))
      .map(a => a.getAttribute('href')));
  check('no raw external anchors — every exit is a labeled departure',
    rawExt.length === 0, rawExt.join(', ') || 'clean');

  // 4. same-origin chunk-url lint (the sweep's data invariant)
  const extUrls = await page.evaluate(() =>
    window.JHSearch.chunks.filter(c => /^https?:/i.test(c.url || '')).map(c => c.id));
  check('every chunk url is same-origin', extUrls.length === 0, extUrls.join(','));

  await ctx.close();

  // 5. Enter on a top result never exits — only testable with an external
  // top result, so doctor one via the chunks route (post-sweep no chunk url
  // is external; this keeps the guard honest)
  {
    const ctx2 = await browser.newContext({ colorScheme: 'dark', viewport: { width: 1280, height: 920 } });
    let doctored2 = false;
    await ctx2.route('**/search-chunks.json*', async route => {
      if (doctored2) return route.fallback();
      doctored2 = true;
      const resp = await route.fetch();
      const body = await resp.json();
      const list = body.chunks || body;
      const c1 = list.find(c => c.id === 1);
      if (c1) c1.url = 'https://fractalfuture.substack.com';
      await route.fulfill({ response: resp, body: JSON.stringify(body), contentType: 'application/json' });
    });
    await ctx2.route('**://localhost:1234/**', r => r.abort());
    await ctx2.route('**://localhost:11434/**', r => r.abort());
    const page2 = await ctx2.newPage();
    await page2.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
    await page2.waitForTimeout(1200);
    await page2.keyboard.press('/');
    await page2.waitForTimeout(700);
    await page2.fill('#so-searchInput', 'who is john');
    await page2.waitForTimeout(1400);
    const before = page2.url();
    await page2.keyboard.press('Enter');
    await page2.waitForTimeout(1000);
    const after = page2.url();
    check('Enter on an external top result never exits the origin',
      after === before, `${before} → ${after}`);
    await ctx2.close();
  }

  check('no console errors (10f)', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

// ───────── 6. coherence — the trail, the verb taxonomy, density-scaled frames ─────────
{
  console.log('coherence:');
  const ctx = await browser.newContext({ colorScheme: 'dark', viewport: { width: 1280, height: 1200 } });
  await ctx.route(/(localhost|127\.0\.0\.1):(1234|11434)/, r => r.abort());
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' && !/net::|Failed to load resource|Permissions policy/.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(`${BASE}/about.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  await page.keyboard.press('/');
  await page.waitForTimeout(700);
  await page.fill('#so-searchInput', 'fish minigame');
  await page.waitForTimeout(1400);

  // taxonomy: chips declare their verb
  const verbs = await page.evaluate(() => ({
    openArrow: [...document.querySelectorAll('.related-chip')].every(c => c.textContent.includes('↗')),
    inertTail: getComputedStyle(document.querySelector('.pc-tail-item')).cursor,
  }));
  check('OPEN chips carry ↗ · nothing advertises expansion',
    verbs.openArrow && verbs.inertTail !== 'zoom-in', JSON.stringify(verbs));

  // Density scales the frames: compact 264 → comfortable 352. Measured on a
  // SLEEPING piece — a woken one is mid-graft across the re-render and its
  // node is briefly detached, which is the graft working, not a size change.
  // Set the density DIRECTLY rather than toggling from whatever the previous
  // block left behind — the ladder lands on a different tier depending on the
  // starting state, and the frame is only there to measure at some of them.
  const widthAt = async (d) => {
    await page.evaluate((dd) => {
      try { localStorage.setItem('jh-postcard-density', dd); } catch {}
      const i = document.getElementById('so-searchInput');
      i.dispatchEvent(new Event('input', { bubbles: true }));
    }, d);
    await page.waitForTimeout(1500);
    return page.evaluate(() => document.querySelector('.pc-piece--demo')?.getBoundingClientRect().width || 0);
  };
  const wCompact = await widthAt('compact');
  const wComfy = await widthAt('comfortable');
  // Relative, not absolute px: the compact OVERLAY now caps obstacle-scale
  // cards (208/240) so a 264px card cannot crush the prose column into a
  // sliver — the invariant is that comfortable renders a LARGER frame.
  check('density scales the frames (compact small, comfortable larger)',
    wCompact > 0 && wComfy > wCompact, `${wCompact} → ${wComfy}`);
  await page.click('.pc-density');   // restore compact
  await page.waitForTimeout(500);

  // waking a piece is the one view state left. Guarded: chunk 35 carries no
  // pieces since the media-match data pass — fail, don't crash the suite.
  const wakeable = await page.evaluate(() => !!document.querySelector('.pc-mod[data-id="35"] .pc-piece--demo'));
  if (!wakeable) {
    check('a piece wakes live in place', false,
      'chunk 35 carries no pieces — data gap from the media-match pass');
  } else {
  await page.click('.pc-mod[data-id="35"] .pc-piece--demo');
  await page.waitForTimeout(2400);
  check('a piece wakes live in place',
    await page.evaluate(() => !!document.querySelector('.pc-piece--woken iframe')));

  // The woken piece carries its own undo — its ▶ live chip sleeps it, and
  // releases the iframe. There is no trail to do it from any more.
  await page.click('.pc-piece--woken .pc-piece-kind');
  await page.waitForTimeout(700);
  check('the piece\u2019s own chip sleeps it and releases the iframe',
    await page.evaluate(() => document.querySelectorAll('.pc-piece iframe').length === 0
      && !document.querySelector('.pc-piece--woken')));
  }

  check('no trail element remains in the shell',
    await page.evaluate(() => !document.getElementById('so-trail')));

  check('no console errors (coherence)', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

await browser.close();
console.log(failures.length ? `\nFAILURES (${failures.length}):\n- ` + failures.join('\n- ') : '\nALL PASS');
process.exit(failures.length ? 1 : 0);
