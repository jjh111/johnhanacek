#!/usr/bin/env node
/**
 * Single source of truth for the asset cache-bust version.
 *
 * All shared assets are loaded with a `?v=` query string so browsers re-fetch
 * them after a change instead of serving a stale cached copy. Rather than
 * hand-editing that number across every page, bump SITE_VERSION below (once)
 * whenever you change shared.css / shared.js / search-overlay.(css|js), then run:
 *
 *     node scripts/sync-version.mjs
 *
 * It rewrites every matching `?v=` across the site's *.html so the whole site
 * busts cache uniformly. The value only needs to CHANGE between releases — any
 * new value forces a re-fetch — but keep it moving forward to avoid ever
 * reusing a value a browser may still have cached.
 *
 * NOTE: this is a dev-time tool. It is NOT loaded by the site and adds no
 * runtime dependency — GitHub Pages still serves plain static HTML.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SITE_VERSION = '1.10'; // ← bump this one line per release, then run the script

const ASSETS = ['shared.css', 'shared.js', 'search-overlay.css', 'search-overlay.js', 'jh-chrome.js'];
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

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

console.log(`Stamped ?v=${SITE_VERSION} on ${total} asset ref(s) across ${touched.length} file(s):`);
for (const t of touched) console.log('  ' + t);
