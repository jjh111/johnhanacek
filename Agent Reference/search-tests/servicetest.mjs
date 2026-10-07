// Service coherence — the bar as the way to hire John (2026-09-28).
// Runs the REAL pipeline on search.html (BM25 + intents + the semantic tier)
// and checks three things:
//   1. SURFACE: service-seeking queries lead with what John OFFERS (16 Coaching
//      OS, 17 Coaching Packages, 18 Design & Product Services, 41 What John
//      Makes), not "What John Is Looking For" (49), which is a hiring answer.
//   2. TRIGGER: the message card comes up when asked for by name ("inquire",
//      "send a message", "message john: …"), the intent cards offer it, and
//      questions ABOUT John never raise it.
//   3. AROUND: under a message card, the results are the offers for its track.
// Serve the repo on :4571. The inquiry relay is pinned off (mail-app route):
// this suite never sends anything.
import { chromium } from 'playwright-core';
const CHROMIUM = process.env.CHROMIUM_PATH || chromium.executablePath();
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4571';
const failures = [];
function check(name, cond, detail = '') {
  console.log(`${cond ? '  ✓' : '  ✗'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!cond) failures.push(name);
}
const OFFER_IDS = ['16', '17', '18', '41'];
const COACHING_IDS = ['16', '17'];
const DESIGN_IDS = ['18', '41'];

const browser = await chromium.launch({ executablePath: CHROMIUM, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
await ctx.addInitScript(() => { window.JH_INQUIRY_ENDPOINT = ''; });
const page = await ctx.newPage();
await page.goto(`${BASE}/search.html`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => !!window.JHInquiry, null, { timeout: 15000 });
// warm the semantic tier once so every query below gets the fused ranking
await page.fill('#searchInput', 'warm up'); await page.dispatchEvent('#searchInput', 'input');
await page.waitForFunction(() => document.body.dataset.searchSemantic === 'ready', null, { timeout: 90000 }).catch(() => {});

async function run(q) {
  await page.fill('#searchInput', q);
  await page.dispatchEvent('#searchInput', 'input');
  await page.waitForTimeout(1600);   // debounce + semantic refine
  return page.evaluate(() => {
    const R = document.getElementById('searchResults');
    return {
      ids: [...R.querySelectorAll('.postcard .pc-mod[data-id]')].map(n => n.dataset.id),
      card: !!R.querySelector('.inq-card:not(.inq-prompt)'),
      prompt: !!R.querySelector('.inq-prompt'),
      offer: !!R.querySelector('[data-inq-force]'),
      intent: (R.querySelector('.intent-card-title') || {}).textContent || '',
      write: !!R.querySelector('[data-inq-start]'),
      track: (R.querySelector('[data-inq-field="track"]') || {}).value || '',
    };
  });
}

console.log('1. surface — service seekers lead with offers:');
const SEEKERS = [
  'services', 'what services does john offer', 'can he help my startup', 'i need help with AI',
  'consulting', 'coaching', 'how much does he charge', 'hire john for a project',
  'looking for a designer', 'work with john', 'what does he offer',
];
for (const q of SEEKERS) {
  const r = await run(q);
  const top3 = r.ids.slice(0, 3);
  check(`"${q}": an offer in the top 3, not led by Looking For`,
    top3.some(id => OFFER_IDS.includes(id)) && r.ids[0] !== '49', top3.join(','));
}
console.log('   hiring questions keep Looking For:');
for (const q of ['is he open to full time work', 'is john looking for a job']) {
  const r = await run(q);
  check(`"${q}": Looking For in the top 3`, r.ids.slice(0, 3).includes('49'), r.ids.slice(0, 3).join(','));
}

console.log('2. trigger:');
for (const q of ['inquire', 'send a message', 'send john a message', 'message john', 'get in touch']) {
  const r = await run(q);
  check(`"${q}" opens the message prompt`, r.prompt && !r.card, JSON.stringify({ prompt: r.prompt, card: r.card }));
}
{
  const r = await run("message john: we're a small studio building an AI note-taking app and need help with the onboarding design by March");
  check('"message john: …" parses the words after the command', r.card && r.track === 'design', r.track);
  const words = await page.evaluate(() => (document.querySelector('#searchResults .inq-words') || {}).textContent || '');
  check('the command prefix is not in their words', /^we're a small studio/.test(words), words.slice(0, 40));
}
{
  const r = await run('i want to hire him for consulting on how to use agentic AI in my business');
  check('"hire him for consulting on how to use agentic AI" → a coaching card', r.card && r.track === 'coaching', r.track);
}
{
  const r = await run('I would like to inquire about coaching for my leadership team');
  check('"inquire about coaching …" raises the card', r.card, JSON.stringify(r));
}
for (const q of ['contact', 'how do i contact him', 'book a call', 'services']) {
  const r = await run(q);
  check(`"${q}": its doorway card offers "Write John a message", no card forced`, r.write && !r.card, JSON.stringify({ intent: r.intent, write: r.write, card: r.card }));
}
{
  await run('contact');
  await page.click('#searchResults [data-inq-start]');
  await page.waitForTimeout(700);
  const st = await page.evaluate(() => ({ v: document.getElementById('searchInput').value, prompt: !!document.querySelector('#searchResults .inq-prompt'), focus: document.activeElement.id }));
  check('"Write John a message" turns the bar into a message', /^Message John: $/.test(st.v) && st.prompt && st.focus === 'searchInput', JSON.stringify(st));
}
console.log('   never for questions about John:');
for (const q of ['why should I hire him', 'what did john do at nanome', 'how do i contact him', 'should i hire him for a founding designer role', 'what does inquire mean']) {
  const r = await run(q);
  check(`"${q}": no card`, !r.card && !r.prompt, JSON.stringify({ card: r.card, prompt: r.prompt }));
}

console.log('3. around — under a card, the offers for its track:');
{
  const r = await run("I'm a founder and I want coaching so I can use Claude Code and agents in my own work. Could we start next month?");
  check('coaching card → coaching offers lead', r.card && COACHING_IDS.includes(r.ids[0]), r.ids.slice(0, 3).join(','));
  check('…and Looking For is not among them', !r.ids.slice(0, 3).includes('49'), r.ids.slice(0, 3).join(','));
}
{
  const r = await run("We're building a teleoperation interface for warehouse robots and need someone to design the operator experience and hand off specs by Q1.");
  check('design card → design offers in the top 2', r.card && r.ids.slice(0, 2).some(id => DESIGN_IDS.includes(id)), r.ids.slice(0, 3).join(','));
}

await browser.close();
if (failures.length) {
  console.log(`\nFAILURES (${failures.length}):\n  ` + failures.join('\n  '));
  process.exit(1);
}
console.log('\nALL PASS');
