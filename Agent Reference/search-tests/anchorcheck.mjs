// The anchor contract: every chunk URL that points into the site should land on a
// block that exists. `node anchorcheck.mjs` from anywhere.
//
//   FAIL  — a chunk names an anchor the page does not have (broken deep link).
//   RATCHET — chunks with NO anchor drop you at the top of a page. Their count may
//             only go down: BASELINE is the number allowed today; lower it as they
//             get homes, and the check fails if it ever rises.
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
// 2026-09-09: 33 → 16 after the how-i-work, bio, experience and design homes;
// 16 → 3 after the case-study, index, playground, writing, search and openprose
// homes. The three left are the personal chunks (30/31/32) — about.html has no
// "off the clock" block for them to land on, and inventing an empty anchor is
// exactly what this check exists to prevent. John's call; drop to 0 when it lands.
const BASELINE = 3;

const data = JSON.parse(readFileSync(resolve(ROOT, 'Assets/search-chunks.json'), 'utf8'));
const chunks = Array.isArray(data) ? data : data.chunks;
const ids = {};
for (const f of readdirSync(ROOT).filter(f => f.endsWith('.html'))) {
  ids[f] = new Set([...readFileSync(resolve(ROOT, f), 'utf8').matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
}
const missing = [], none = [], noPage = [];
for (const c of chunks) {
  const u = c.url || '';
  if (/^https?:/.test(u) || /\.(pdf|json)$/.test(u)) continue;
  const [pageRaw, anchor] = u.split('#');
  const page = pageRaw.split('?')[0];
  if (!ids[page]) { noPage.push([c.id, c.title, u]); continue; }
  if (!anchor) { none.push([c.id, c.title, u]); continue; }
  if (!ids[page].has(anchor)) missing.push([c.id, c.title, u]);
}
const row = ([id, t, u]) => `  ${String(id).padStart(3)}  ${t.slice(0, 44).padEnd(46)} ${u}`;
if (noPage.length) { console.log('PAGE NOT FOUND:'); noPage.forEach(r => console.log(row(r))); }
if (missing.length) { console.log('ANCHOR MISSING ON PAGE:'); missing.forEach(r => console.log(row(r))); }
console.log(`no anchor: ${none.length} (baseline ${BASELINE})`);
none.forEach(r => console.log(row(r)));
const fail = noPage.length || missing.length || none.length > BASELINE;
console.log(fail ? '\nFAIL' : '\nOK');
process.exit(fail ? 1 : 0);
