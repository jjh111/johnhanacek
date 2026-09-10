/**
 * quoteqa.mjs — the testimonial surface: what it returns, and how it lays out.
 *
 * Two parts, because they fail independently:
 *
 *   A. RANKING (informational). 14 testimonial-shaped queries, their top 3, and
 *      which endorser names actually reach the screen. Prints; never fails —
 *      ranking is a judgement call, and fusionlab owns the regression bar.
 *
 *   B. LAYOUT (pass/fail). The same surface at four viewports × both themes,
 *      plus the ⤢ workspace pane. Exits non-zero on any defect.
 *
 * Part B exists because every layout bug in the endorsement pass was INVISIBLE
 * at desktop width, and three of them shipped:
 *
 *   · a fact row inherited the workspace pane's reading size (19.36px vs the
 *     14px it has in the list) and dominated the stratum
 *   · flex rows ignored a `float: right` media and ran underneath the poster
 *   · a long fact title (flex-shrink:0, so it cannot wrap) measured 488px in a
 *     431px row and put a horizontal scrollbar on the whole document
 *   · the sticky command frame reserved 0px of flow but rendered at top:40px,
 *     so it painted over the lead module's title — at scrollY 0, unscrollable
 *
 * The checks below are those four, generalised. 505px is not arbitrary: it is
 * the width at which the tier strip wraps and the command frame grows tall
 * enough to reach the first result.
 *
 *   BASE_URL=http://127.0.0.1:4571 CHROMIUM_PATH="..." node quoteqa.mjs
 *   RANKING_ONLY=1 node quoteqa.mjs      # skip part B
 */
import { chromium } from 'playwright-core';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:4571';

const QUERIES = [
  'what do clients say', 'testimonials', 'is john any good', 'who recommends john',
  'references', 'why should I hire him', 'david brin', 'kevin kelly',
  'photography testimonial', 'photographer recommendation', 'sheila zipfel',
  'ben shapiro', 'desiree sterling', 'what do people say about his design',
];

// Layout is checked on the queries that actually build a fact-bearing dossier —
// the shape that broke. No point measuring a one-line result eight times.
const LAYOUT_QUERIES = ['recommend', 'what do clients say', 'photography testimonial', 'desiree sterling'];

const VIEWPORTS = [
  { name: 'phone',    w: 390,  h: 844  },
  { name: 'phone-lg', w: 505,  h: 1008 }, // the frame grows tall enough to reach results here
  { name: 'tablet',   w: 768,  h: 1024 },
  { name: 'desktop',  w: 1280, h: 900  },
];

const ENDORSERS = ['Zipfel', 'Barrett', 'Shapiro', 'Kronmark', 'Reed', 'Hurriyet', 'Sterling', 'Brin', 'Kelly'];

/* ── the four checks, run in the page ───────────────────────────────────── */
const AUDIT = () => {
  const de = document.documentElement;
  const round = n => Math.round(n);
  const out = { defects: [] };

  // 1. the page must never scroll sideways
  if (de.scrollWidth > de.clientWidth + 1) {
    out.defects.push({ kind: 'page-overflow-x', detail: `document scrollWidth ${de.scrollWidth} > clientWidth ${de.clientWidth}` });
  }

  // 2. no result element may ESCAPE its own box.
  //    Overflowing a box that clips (overflow:hidden + text-overflow:ellipsis)
  //    is the design — that is how titles and micro lines truncate. The defect
  //    is content escaping a box that does NOT clip, because that is what
  //    pushes the layout sideways. The row that shipped a horizontal scrollbar
  //    was .pc-fact-t: flex-shrink:0, overflow visible, 488px in a 431px row.
  for (const el of document.querySelectorAll('[data-id] *')) {
    const r = el.getBoundingClientRect();
    if (!r.width) continue;
    const ox = getComputedStyle(el).overflowX;
    if (ox !== 'visible') continue;          // clipping is intentional
    if (el.scrollWidth > Math.ceil(r.width) + 1) {
      out.defects.push({ kind: 'box-overflow-x',
        detail: `.${(el.className || el.tagName).toString().split(/\s+/)[0]} scrollWidth ${el.scrollWidth} escapes ${round(r.width)}px (overflow-x:visible) — "${el.textContent.trim().slice(0, 40)}"` });
      break; // one is enough to fail; the rest are usually the same cause
    }
  }

  // 3. the sticky command frame must not paint over the first result
  const frame = document.querySelector('.search-wrap, .so-command-frame');
  const lead = document.querySelector('[data-id]');
  if (frame && lead) {
    const t = lead.querySelector('.result-title, .pc-lead-title, h3, h4') || lead;
    const fb = frame.getBoundingClientRect().bottom, tb = t.getBoundingClientRect().top;
    if (tb < fb - 1) {
      out.defects.push({ kind: 'frame-occludes-lead',
        detail: `lead title top ${round(tb)} is under frame bottom ${round(fb)} (scrollY ${round(scrollY)})` });
    }
  }

  // 4. chrome must not inherit a reading size — a fact row larger than the
  //    module title above it means it picked up an ancestor's display type
  if (lead) {
    const title = lead.querySelector('.result-title, .pc-lead-title, h3, h4');
    const row = document.querySelector('.pc-fact-t');
    if (title && row) {
      const ts = parseFloat(getComputedStyle(title).fontSize);
      const rs = parseFloat(getComputedStyle(row).fontSize);
      if (rs > ts) out.defects.push({ kind: 'fact-row-inherits-display-size', detail: `fact row ${rs}px > module title ${ts}px` });
    }
  }

  // 5. a floated media and the rows beside it must not occupy the same pixels
  const media = document.querySelector('.pc-fact-media, .pc-piece');
  const factT = document.querySelector('.pc-fact-t');
  if (media && factT) {
    const a = factT.getBoundingClientRect(), b = media.getBoundingClientRect();
    const hit = !(a.right < b.left || b.right < a.left || a.bottom < b.top || b.bottom < a.top);
    if (hit) out.defects.push({ kind: 'text-under-media', detail: `fact title ${round(a.left)}→${round(a.right)} overlaps media ${round(b.left)}→${round(b.right)}` });
  }
  return out;
};

/* ── part A: ranking ────────────────────────────────────────────────────── */
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
let page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

console.log('\n  RANKING — top 3, and which endorser names reach the screen\n');
for (const q of QUERIES) {
  await page.goto(`${BASE}/search.html?q=${encodeURIComponent(q)}`, { waitUntil: 'load' });
  await page.waitForTimeout(1700);
  const r = await page.evaluate(() => ({
    top: [...new Set([...document.querySelectorAll('[data-id]')].map(e => {
      const h = e.querySelector('.result-title,.pc-lead-title,h3,h4,strong');
      return h ? h.textContent.trim() : (e.innerText.split('\n')[0] || '').trim();
    }).filter(Boolean))].slice(0, 3),
    body: document.body.innerText,
  }));
  console.log(`  ${q}`);
  console.log(`     → ${r.top.join('  |  ') || '(nothing)'}`);
  console.log(`     names: ${ENDORSERS.filter(n => r.body.includes(n)).join(', ') || '—'}\n`);
}
await page.close();

if (process.env.RANKING_ONLY) { await browser.close(); process.exit(0); }

/* ── part B: layout ─────────────────────────────────────────────────────── */
console.log('  LAYOUT — search.html, every viewport × both themes\n');
const failures = [];

for (const vp of VIEWPORTS) {
  for (const theme of ['dark', 'light']) {
    page = await browser.newPage({ viewport: { width: vp.w, height: vp.h } });
    let bad = 0;
    for (const q of LAYOUT_QUERIES) {
      await page.goto(`${BASE}/search.html?q=${encodeURIComponent(q)}`, { waitUntil: 'load' });
      await page.evaluate(t => { try { localStorage.setItem('jh-theme', t); } catch (e) {} }, theme);
      await page.reload({ waitUntil: 'load' });
      await page.waitForTimeout(1500);
      const { defects } = await page.evaluate(AUDIT);
      for (const d of defects) { failures.push({ where: `${vp.name} ${vp.w}px / ${theme} / "${q}"`, ...d }); bad++; }
    }
    console.log(`    ${vp.name.padEnd(9)} ${String(vp.w).padStart(4)}px  ${theme.padEnd(5)}  ${bad ? String(bad).padStart(2) + ' defect(s)' : ' ok'}`);
    await page.close();
  }
}

// The workspace pane is a separate surface with its own type scale — the one
// that rendered a fact row at reading size. Desktop only; it is gated at 768px.
console.log('\n  LAYOUT — ⤢ workspace pane (art.html overlay)\n');
page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
let wsNote = 'could not open';
try {
  await page.goto(`${BASE}/art.html`, { waitUntil: 'load' });
  await page.waitForTimeout(1800);
  await page.evaluate(() => document.querySelector('.shape-nav a[href="search.html"], .nav-search')?.click());
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    const inp = document.querySelector('.search-overlay input');
    inp.focus();
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(inp, 'recommend');
    inp.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(2400);
  await page.evaluate(() => {
    const o = document.querySelector('.search-overlay');
    if (!o.classList.contains('so-workspace')) o.querySelector('[aria-label*="workspace" i]')?.click();
  });
  await page.waitForTimeout(2200);
  const { defects } = await page.evaluate(AUDIT);
  for (const d of defects) failures.push({ where: 'workspace 1280px / "recommend"', ...d });
  wsNote = defects.length ? `${defects.length} defect(s)` : 'ok';
} catch (e) {
  failures.push({ where: 'workspace 1280px', kind: 'harness', detail: String(e).split('\n')[0] });
}
console.log(`    workspace  1280px  dark    ${wsNote}`);
await page.close();
await browser.close();

/* ── verdict ────────────────────────────────────────────────────────────── */
if (failures.length) {
  console.log(`\n  ${failures.length} LAYOUT DEFECT(S)\n`);
  for (const f of failures) console.log(`   ${f.where}\n     ${f.kind}: ${f.detail}\n`);
  process.exit(1);
}
console.log('\n  LAYOUT CLEAN\n');
process.exit(0);
