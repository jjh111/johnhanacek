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

// Sections 1-5 test the MAIL-APP route, whatever the site config names:
// JH_INQUIRY_ENDPOINT = '' pins it. Section 6 tests the relay.
async function mailRoute(br, opts) {
  const c = await br.newContext(opts);
  await c.addInitScript(() => { window.JH_INQUIRY_ENDPOINT = ''; });
  return c;
}

const browser = await chromium.launch({ executablePath: CHROMIUM, headless: true });

// ───────── 1. search.html: a paragraph raises the brief card ─────────
{
  console.log('search.html — the card:');
  const ctx = await mailRoute(browser, { colorScheme: 'dark', viewport: { width: 1280, height: 920 } });
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
  const ctx = await mailRoute(browser, { viewport: { width: 1280, height: 920 } });
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
  const ctx = await mailRoute(browser, { viewport: { width: 1280, height: 900 } });
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
  const ctx = await mailRoute(b, { viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto(`${BASE}/services.html`, { waitUntil: 'networkidle' });
  await typeInto(page, '#inqText', COACHING);
  // the card stands at rest (alwaysCard), so wait for the typed words to land in it
  await page.waitForFunction(() => { const t = document.querySelector('#inqCard [data-inq-field="track"]'); return t && t.value !== 'unsure'; }, null, { timeout: 8000 }).catch(() => {});
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
  const ctx = await mailRoute(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
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
// ───────── 6. the relay route (SITE.inquiryEndpoint set) ─────────
// A mock of a deployed Apps Script web app: the POST answers 302 to an echo
// URL and the GET there carries the JSON, the way Google's does. CORS on both.
{
  console.log('relay route (mock Apps Script):');
  const http = await import('node:http');
  const got = [];
  const server = http.createServer((req, res) => {
    const cors = { 'Access-Control-Allow-Origin': '*' };
    if (req.method === 'POST' && req.url.startsWith('/exec')) {
      let raw = '';
      req.on('data', c => raw += c);
      req.on('end', () => {
        let p = {}; try { p = JSON.parse(raw); } catch {}
        got.push({ p, type: req.headers['content-type'] });
        const out = /^rate@/.test(p.email || '') ? { ok: false, error: 'rate' } : { ok: true, sent: true };
        res.writeHead(302, { ...cors, Location: '/echo?r=' + encodeURIComponent(JSON.stringify(out)) });
        res.end();
      });
      return;
    }
    if (req.method === 'GET' && req.url.startsWith('/echo')) {
      const r = decodeURIComponent(new URL(req.url, 'http://x').searchParams.get('r'));
      res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
      res.end(r);
      return;
    }
    res.writeHead(404, cors); res.end();
  });
  await new Promise(r => server.listen(9913, '127.0.0.1', r));

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(() => { window.JH_INQUIRY_ENDPOINT = 'http://127.0.0.1:9913/exec'; });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto(`${BASE}/services.html`, { waitUntil: 'networkidle' });
  // The card is the form: it stands at rest, before a word is typed, and Send
  // waits for words as well as an email.
  const rest = await page.evaluate(() => {
    const s = document.querySelector('#inqCard [data-inq-act="send"]');
    return { card: !!document.querySelector('#inqCard .inq-card'), email: !!document.querySelector('#inqCard [data-inq-field="email"]'), disabled: !!(s && s.disabled) };
  });
  check('relay: the card stands at rest under the textarea, Send disabled', rest.card && rest.email && rest.disabled, JSON.stringify(rest));
  await page.fill('#inqCard [data-inq-field="email"]', 'early@example.com');
  await page.dispatchEvent('#inqCard [data-inq-field="email"]', 'input');
  check('relay: an email alone does not enable Send', await page.evaluate(() => document.querySelector('#inqCard [data-inq-act="send"]').disabled));
  await page.fill('#inqCard [data-inq-field="email"]', '');
  await page.dispatchEvent('#inqCard [data-inq-field="email"]', 'input');
  await typeInto(page, '#inqText', ROBOTICS);
  await page.waitForFunction(() => { const t = document.querySelector('#inqCard [data-inq-field="track"]'); return t && t.value !== 'unsure'; }, null, { timeout: 8000 }).catch(() => {});
  const pre = await page.evaluate(() => {
    const em = document.querySelector('#inqCard [data-inq-field="email"]');
    const send = document.querySelector('#inqCard [data-inq-act="send"]');
    return { email: !!em, ph: em && em.placeholder, tag: send.tagName, disabled: send.disabled, note: (document.querySelector('#inqCard .inq-note') || {}).textContent || '' };
  });
  check('relay: email row shown and asked for', pre.email && pre.ph === 'so John can reply', JSON.stringify(pre));
  check('relay: Send is a button, disabled without an email', pre.tag === 'BUTTON' && pre.disabled && !/Add your email/.test(pre.note));
  await page.fill('#inqCard [data-inq-field="email"]', 'dana@example.com');
  await page.dispatchEvent('#inqCard [data-inq-field="email"]', 'input');
  check('relay: a valid email enables Send, caret stays in the field', await page.evaluate(() =>
    !document.querySelector('#inqCard [data-inq-act="send"]').disabled && document.activeElement.dataset.inqField === 'email'));
  await page.click('#inqCard [data-inq-act="send"]');
  await page.waitForSelector('#inqCard .inq-receipt--sent', { timeout: 10000 }).catch(() => {});
  const sentTxt = await page.evaluate(() => (document.querySelector('#inqCard .inq-receipt') || {}).textContent || '');
  check('relay: Sent receipt names the reply address', /Sent\. It is in John’s inbox, and he will reply to dana@example\.com/.test(sentTxt), sentTxt);
  const p0 = got[0] ? got[0].p : {};
  check('relay: posted as text/plain (no CORS preflight)', got[0] && /^text\/plain/.test(got[0].type), got[0] && got[0].type);
  check('relay: payload carries email, subject, verbatim text, page', p0.email === 'dana@example.com' && /^\[Inquiry · Design\]/.test(p0.subject) && p0.text.includes('operators hate it') && p0.body.includes('operators hate it') && p0.page === 'services.html', JSON.stringify({ e: p0.email, s: p0.subject, pg: p0.page }));
  // Sent ~1 s after the card appeared: the page must hold the post past the
  // relay's 3 s bot threshold, or a real person would be silently dropped.
  check('relay: honeypot empty, and a fast Send is held past 3 s', p0.website === '' && typeof p0.elapsed === 'number' && p0.elapsed >= 3000, String(p0.elapsed));
  check('relay: Send cannot fire twice', await page.evaluate(() => document.querySelector('#inqCard [data-inq-act="send"]').disabled));
  check('relay: draft cleared after send', await page.evaluate(() => !sessionStorage.getItem('jh-inquiry-draft')));
  // a refusal falls back to the mail app and Copy
  await page.fill('#inqCard [data-inq-field="email"]', 'rate@example.com');
  await page.dispatchEvent('#inqCard [data-inq-field="email"]', 'input');
  await page.click('#inqCard [data-inq-act="send"]');
  await page.waitForSelector('#inqCard [data-inq-act="mailto"]', { timeout: 10000 }).catch(() => {});
  const fail = await page.evaluate(() => {
    const r = document.querySelector('#inqCard .inq-receipt');
    const m = document.querySelector('#inqCard [data-inq-act="mailto"]');
    return { txt: r ? r.textContent : '', href: m ? m.getAttribute('href') : '' };
  });
  check('relay: a refusal says why and offers the mail app', /Too many messages/.test(fail.txt) && fail.href.startsWith('mailto:hi@johnhanacek.com'), fail.txt);
  check('relay: no page errors', errs.length === 0, errs.join(' | '));
  await ctx.close();

  // relay unreachable → the same fallback
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx2.addInitScript(() => { window.JH_INQUIRY_ENDPOINT = 'http://127.0.0.1:9/exec'; });
  const p2 = await ctx2.newPage();
  await p2.goto(`${BASE}/services.html`, { waitUntil: 'networkidle' });
  await typeInto(p2, '#inqText', COACHING);   // carries its own email
  await p2.waitForSelector('#inqCard .inq-card', { timeout: 8000 });
  await p2.click('#inqCard [data-inq-act="send"]');
  await p2.waitForSelector('#inqCard [data-inq-act="mailto"]', { timeout: 25000 }).catch(() => {});
  check('relay down: the connection failure falls back to the mail app', /connection failed/.test(await p2.evaluate(() => (document.querySelector('#inqCard .inq-receipt') || {}).textContent || '')));
  await ctx2.close();

  // in the bar, Enter with no email lands on the email field
  const ctx3 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx3.addInitScript(() => { window.JH_INQUIRY_ENDPOINT = 'http://127.0.0.1:9913/exec'; });
  const p3 = await ctx3.newPage();
  await p3.goto(`${BASE}/search.html`, { waitUntil: 'networkidle' });
  await p3.waitForFunction(() => !!window.JHInquiry, null, { timeout: 15000 });
  await typeInto(p3, '#searchInput', ROBOTICS);
  await p3.waitForSelector('#searchResults .inq-card', { timeout: 8000 });
  await p3.focus('#searchInput');
  await p3.keyboard.press('Enter');
  check('relay, bar: Enter goes to the missing email, sends nothing', await p3.evaluate(() => document.activeElement && document.activeElement.dataset.inqField === 'email') && got.length === 2);
  await ctx3.close();
  server.close();
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
