// Phase 11 QA — the inquiry composer (Agent Reference/INQUIRY_COMPOSER_PLAN.md)
// A typed paragraph → an on-device brief card → a mailto the visitor sends.
// Serve the repo on :4571 first. `--webkit` runs the services shell in
// WebKit too (Safari's engine: the grammar parse AND the WASM embedder must
// work there, since the WebGPU model cannot).
import { chromium, webkit } from 'playwright-core';
const CHROMIUM = process.env.CHROMIUM_PATH || chromium.executablePath();
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4571';
const failures = [];
function check(name, cond, detail = '') {
  console.log(`${cond ? '  ✓' : '  ✗'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!cond) failures.push(name);
}

const ROBOTICS = "We're a six-person team building a teleoperation interface for warehouse robots. We have a working prototype but operators hate it. We need someone to redesign the operator experience and hand off specs to our engineers by Q1. I'm the CTO at Example Robotics. Budget is around $40k. — Dana Reyes";
const COACHING = "Hi John, I'm Priya Shah, founder of Loop Health. I keep hearing about Claude Code and agents but I have no idea where to start. I'd love coaching sessions so I can use AI in my own work. Could we talk next month? priya@loophealth.io";
const LONG_QUESTION = 'has john ever worked with robotics companies, and what kind of teleoperation interfaces did he design for them over the years';

const fieldVals = (page, scope) => page.evaluate((sc) => {
  const c = document.querySelector(sc + ' .inq-card');
  if (!c) return null;
  const o = {};
  for (const n of c.querySelectorAll('[data-inq-field]')) o[n.dataset.inqField] = n.value;
  o._mark = (c.querySelector('.inq-mark') || {}).textContent || '';
  o._send = c.querySelector('[data-inq-act="send"]').getAttribute('href');
  return o;
}, scope);

async function typeInto(page, sel, text) {
  await page.fill(sel, text);
  await page.dispatchEvent(sel, 'input');
}

const browser = await chromium.launch({ executablePath: CHROMIUM, headless: true });

// ───────── 1. search.html: a paragraph raises the brief card ─────────
{
  console.log('search.html — the card:');
  const ctx = await browser.newContext({ colorScheme: 'dark', viewport: { width: 1280, height: 920 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto(`${BASE}/search.html`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.JHInquiry, null, { timeout: 15000 });
  await typeInto(page, '#searchInput', ROBOTICS);
  await page.waitForSelector('#searchResults .inq-card', { timeout: 8000 });
  let v = await fieldVals(page, '#searchResults');
  check('grammar parse: company', v.org === 'Example Robotics', v.org);
  check('grammar parse: role', /cto/i.test(v.role), v.role);
  check('grammar parse: name', v.name === 'Dana Reyes', v.name);
  check('grammar parse: timeline + budget', v.timeline === 'Q1' && v.budget === '$40k', v.timeline + ' / ' + v.budget);
  check('grammar parse: track', v.track === 'design', v.track);
  check('doorway card suppressed under the brief', !(await page.$('#searchResults .intent-card')));
  // the meaning pass upgrades in place once MiniLM lands
  await page.waitForFunction(() => {
    const m = document.querySelector('#searchResults .inq-card .inq-mark');
    const o = document.querySelector('#searchResults [data-inq-field="offer"]');
    return m && m.textContent === '●' && o && o.value === 'mvp';
  }, null, { timeout: 90000 }).catch(() => {});
  v = await fieldVals(page, '#searchResults');
  check('meaning pass: offer = MVP Design & Handoff, strong', v.offer === 'mvp' && v._mark === '●', v.offer + ' ' + v._mark);
  // Enter never sends: it moves focus to Send and stays on the page
  await page.focus('#searchInput');
  await page.keyboard.press('Enter');
  const act = await page.evaluate(() => document.activeElement && document.activeElement.dataset.inqAct);
  check('Enter focuses Send, does not navigate', act === 'send' && page.url().endsWith('/search.html'), act);
  // a correction reaches the message
  await page.fill('#searchResults [data-inq-field="timeline"]', 'by March');
  await page.dispatchEvent('#searchResults [data-inq-field="timeline"]', 'input');
  const href = await page.evaluate(() => {
    const a = document.querySelector('#searchResults [data-inq-act="send"]');
    a.addEventListener('click', e => e.preventDefault(), { once: true });   // do not launch a mail app in CI
    a.click();
    return a.getAttribute('href');
  });
  const body = decodeURIComponent(href.split('body=')[1] || '');
  const subject = decodeURIComponent((href.match(/subject=([^&]*)/) || [])[1] || '');
  check('mailto addressed to John', href.startsWith('mailto:hi@johnhanacek.com?'));
  check('subject carries track, offer, company, corrected timeline', subject === '[Inquiry · Design] MVP Design & Handoff · Example Robotics · by March', subject);
  check('body carries their words verbatim', body.includes('> We\'re a six-person team') && body.includes('operators hate it'));
  check('body says no model wrote it', /no model wrote any of it/.test(body));
  await page.waitForSelector('#searchResults .inq-receipt', { timeout: 3000 }).catch(() => {});
  check('receipt after Send', !!(await page.$('#searchResults .inq-receipt')));
  check('no model answer rendered for a message', await page.evaluate(() => {
    const a = document.getElementById('aiAnswer'); return !a || a.style.display === 'none' || !a.textContent.trim();
  }));
  check('no page errors', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

// ───────── 2. search.html: questions stay searches ─────────
{
  console.log('search.html — questions:');
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 920 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/search.html`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.JHInquiry, null, { timeout: 15000 });
  await typeInto(page, '#searchInput', 'why should I hire him for a founding designer role at an AI startup');
  await page.waitForTimeout(700);
  check('a question about John raises no card', !(await page.$('#searchResults .inq-card')));
  await typeInto(page, '#searchInput', LONG_QUESTION);
  await page.waitForSelector('#searchResults [data-inq-force]', { timeout: 5000 }).catch(() => {});
  check('a long question offers the link, not the card', !!(await page.$('#searchResults [data-inq-force]')) && !(await page.$('#searchResults .inq-card')));
  await page.click('#searchResults [data-inq-force]');
  await page.waitForSelector('#searchResults .inq-card', { timeout: 5000 }).catch(() => {});
  check('the link turns it into a message on request', !!(await page.$('#searchResults .inq-card')));
  await ctx.close();
}

// ───────── 3. the ⌘K overlay on another page ─────────
{
  console.log('overlay (about.html):');
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/about.html`, { waitUntil: 'networkidle' });
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+k' : 'Control+k');
  await page.waitForSelector('#so-searchInput', { state: 'visible', timeout: 10000 });
  await page.waitForFunction(() => !!window.JHInquiry, null, { timeout: 15000 });
  await typeInto(page, '#so-searchInput', COACHING);
  await page.waitForSelector('.search-overlay .inq-card', { timeout: 8000 }).catch(() => {});
  const v = await fieldVals(page, '.search-overlay');
  check('overlay raises the card', !!v);
  check('overlay parse: coaching, Priya Shah, email', v && v.track === 'coaching' && v.name === 'Priya Shah' && v.email === 'priya@loophealth.io', v && [v.track, v.name, v.email].join(' / '));
  check('overlay message is composed on about.html', v && decodeURIComponent(v._send || '').length > 0);
  await ctx.close();
}

// ───────── 4. services.html: the textarea shell ─────────
async function servicesShell(b, label) {
  console.log(`services.html — ${label}:`);
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto(`${BASE}/services.html`, { waitUntil: 'networkidle' });
  await typeInto(page, '#inqText', COACHING);
  await page.waitForSelector('#inqCard .inq-card', { timeout: 8000 }).catch(() => {});
  let v = await fieldVals(page, '#inqCard');
  check(`${label}: card under the textarea`, !!v);
  check(`${label}: grammar parse`, v && v.track === 'coaching' && v.org === 'Loop Health' && /founder/i.test(v.role) && v.timeline === 'next month', v && [v.track, v.org, v.role, v.timeline].join(' / '));
  check(`${label}: no duplicate quote of their words`, !(await page.$('#inqCard .inq-words')));
  await page.waitForFunction(() => {
    const o = document.querySelector('#inqCard [data-inq-field="offer"]');
    const m = document.querySelector('#inqCard .inq-mark');
    return o && o.value === 'guided' && m && m.textContent === '●';
  }, null, { timeout: 120000 }).catch(() => {});
  v = await fieldVals(page, '#inqCard');
  check(`${label}: meaning pass (WASM MiniLM) lands Guided Coaching`, v && v.offer === 'guided' && v._mark === '●', v && v.offer + ' ' + v._mark);
  // switching track re-offers that track's services and keeps the rest
  await page.selectOption('#inqCard [data-inq-field="track"]', 'design');
  v = await fieldVals(page, '#inqCard');
  // (Priya mentions agents, so her best DESIGN-track match is AI & Agentic
  // Systems: the switch proposes that track's best match, never a coaching offer.)
  const designOffers = ['', 'workshop', 'website', 'mvp', 'e2e', 'agentic'];
  check(`${label}: track switch re-offers within the track, keeps the fields`, v.track === 'design' && designOffers.includes(v.offer) && v.org === 'Loop Health', [v.track, v.offer, v.org].join(' / '));
  // "+ budget" opens a field
  const hasAdd = await page.$('#inqCard [data-inq-add="budget"]');
  if (hasAdd) await hasAdd.click();
  check(`${label}: "+ budget" opens an input`, !!(await page.$('#inqCard [data-inq-field="budget"]')));
  // draft survives a reload in the tab
  await page.reload({ waitUntil: 'networkidle' });
  const kept = await page.inputValue('#inqText');
  check(`${label}: draft survives a reload`, kept.startsWith('Hi John, I\'m Priya'));
  check(`${label}: no page errors`, errs.length === 0, errs.join(' | '));
  await ctx.close();
}
await servicesShell(browser, 'chromium');

// ───────── 5. phone width: nothing overflows ─────────
{
  console.log('services.html — 390px:');
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/services.html`, { waitUntil: 'networkidle' });
  await typeInto(page, '#inqText', ROBOTICS);
  await page.waitForSelector('#inqCard .inq-card', { timeout: 8000 }).catch(() => {});
  const o = await page.evaluate(() => {
    const c = document.querySelector('#inqCard .inq-card');
    return { card: c ? c.scrollWidth <= c.clientWidth + 1 : false, page: document.documentElement.scrollWidth <= window.innerWidth + 1 };
  });
  check('card fits 390px without horizontal overflow', o.card && o.page, JSON.stringify(o));
  await ctx.close();
}
await browser.close();

if (process.argv.includes('--webkit')) {
  const wk = await webkit.launch();
  await servicesShell(wk, 'webkit');
  await wk.close();
}

if (failures.length) {
  console.log(`\nFAILURES (${failures.length}):\n  ` + failures.join('\n  '));
  process.exit(1);
}
console.log('\nALL PASS');
