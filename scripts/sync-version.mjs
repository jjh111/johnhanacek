#!/usr/bin/env node
/**
 * Version sync tool. The site version lives in ONE place: `version` inside the
 * SITE object in scripts/jh-chrome.js (which also renders it in the footer
 * badge at runtime). Bump it there, then run:
 *
 *     node scripts/sync-version.mjs
 *
 * This script reads that value and stamps it everywhere else it appears:
 *   - every `?v=` cache-bust query on shared assets across the site's *.html
 *     (so browsers re-fetch changed shared.css / shared.js / search-overlay.* /
 *     jh-chrome.js instead of serving a stale cached copy)
 *   - the `Portfolio vX.Y` badge in README.md
 *
 * The value only needs to CHANGE between releases — any new value forces a
 * re-fetch — but keep it moving forward to avoid ever reusing a value a
 * browser may still have cached.
 *
 * NOTE: this is a dev-time tool. It is NOT loaded by the site and adds no
 * runtime dependency — GitHub Pages still serves plain static HTML.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const chromeSrc = readFileSync(join(root, 'scripts/jh-chrome.js'), 'utf8');
const m = chromeSrc.match(/version:\s*'([0-9.]+)'/);
if (!m) throw new Error("Couldn't find version: '<x.y>' in scripts/jh-chrome.js");
const SITE_VERSION = m[1];

// Matched by basename, so openprose/_tokens.css and _pairings.css are covered
// too — openprose.html is the only page that loads them.
//
// This list is hand-maintained, which is exactly the kind of thing that drifts:
// scripts/playground-items.js sat at ?v=1.53 through two releases because it
// was never added here, and nothing said so. The AUDIT below is the answer —
// the list decides what gets stamped, the audit decides what gets REPORTED, so
// a forgotten asset is now loud instead of silent.
const ASSETS = ['shared.css', 'jh-chrome.css', 'shared.js', 'jh-shapes.js', 'jh-strokes.js', 'jh-guide.js', 'search-overlay.css', 'search-overlay.js', 'search-core.js', 'jh-chrome.js', 'shape-detection.js', 'fish-engine.js', 'playground-items.js', '_tokens.css', '_pairings.css'];

// Paths whose ?v= is a DIFFERENT counter and must not be stamped to the site
// version. openprose/canvas-display/ is the client deliverable: its handoff
// invariant is a manual bump on every change inside that folder, so the site
// version reaching in would quietly break the contract.
const EXEMPT = [/canvas-display/];

const htmlFiles = readdirSync(root).filter((f) => f.endsWith('.html'));
let total = 0;
const touched = [];

for (const file of htmlFiles) {
  const path = join(root, file);
  const before = readFileSync(path, 'utf8');
  let html = before;
  let count = 0;
  for (const asset of ASSETS) {
    const re = new RegExp(`(${asset.replace(/\./g, '\\.')})\\?v=[0-9.]+`, 'g');
    html = html.replace(re, (_m, name) => { count++; return `${name}?v=${SITE_VERSION}`; });
  }
  // Write only on a REAL change. Re-stamping an already-current file with
  // identical bytes is invisible to git but not to an editor holding the file
  // open, and this repo is routinely worked on by more than one session at a
  // time. `count` counts matches, not edits — it is not the test.
  if (html !== before) { writeFileSync(path, html); total += count; touched.push(`${file} (${count})`); }
}

const readmePath = join(root, 'README.md');
const readme = readFileSync(readmePath, 'utf8');
const stamped = readme.replace(/Portfolio v[0-9.]+/g, `Portfolio v${SITE_VERSION}`);
if (stamped !== readme) { writeFileSync(readmePath, stamped); touched.push('README.md'); }

console.log(`Stamped v${SITE_VERSION} on ${total} asset ref(s) across ${touched.length} file(s):`);
for (const t of touched) console.log('  ' + t);

// ---- drift audit ---------------------------------------------------------
// Every LOCAL src/href carrying a numeric ?v= should now read SITE_VERSION.
// One that doesn't is an asset missing from ASSETS above. Reported, never
// auto-stamped: an unknown ?v= may belong to a counter we don't own.
const REF = /(?:src|href)\s*=\s*["']([^"']+\?v=[\w.]+)["']/g;
const drift = [];
for (const file of htmlFiles) {
  const html = readFileSync(join(root, file), 'utf8');
  for (const [, ref] of html.matchAll(REF)) {
    if (/^[a-z]+:\/\/|^\/\//i.test(ref)) continue;              // off-site
    if (EXEMPT.some((re) => re.test(ref))) continue;
    const v = ref.slice(ref.lastIndexOf('?v=') + 3);
    if (!/^[0-9.]+$/.test(v) || v === SITE_VERSION) continue;
    drift.push(`${file}: ${ref}`);
  }
}
if (drift.length) {
  console.log(`\n${drift.length} local ref(s) still off-version — add the basename to ASSETS:`);
  for (const d of drift) console.log('  ' + d);
} else {
  console.log('\nNo off-version local refs.');
}
