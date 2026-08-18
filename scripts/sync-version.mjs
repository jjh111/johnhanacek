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
const ASSETS = ['shared.css', 'jh-chrome.css', 'shared.js', 'search-overlay.css', 'search-overlay.js', 'jh-chrome.js', 'shape-detection.js', 'fish-engine.js', '_tokens.css', '_pairings.css'];

const htmlFiles = readdirSync(root).filter((f) => f.endsWith('.html'));
let total = 0;
const touched = [];

for (const file of htmlFiles) {
  const path = join(root, file);
  let html = readFileSync(path, 'utf8');
  let count = 0;
  for (const asset of ASSETS) {
    const re = new RegExp(`(${asset.replace(/\./g, '\\.')})\\?v=[0-9.]+`, 'g');
    html = html.replace(re, (_m, name) => { count++; return `${name}?v=${SITE_VERSION}`; });
  }
  if (count) { writeFileSync(path, html); total += count; touched.push(`${file} (${count})`); }
}

const readmePath = join(root, 'README.md');
const readme = readFileSync(readmePath, 'utf8');
const stamped = readme.replace(/Portfolio v[0-9.]+/g, `Portfolio v${SITE_VERSION}`);
if (stamped !== readme) { writeFileSync(readmePath, stamped); touched.push('README.md'); }

console.log(`Stamped v${SITE_VERSION} on ${total} asset ref(s) across ${touched.length} file(s):`);
for (const t of touched) console.log('  ' + t);
