// Builds the reel editor as one page claude.ai can host: the live rig (the preview, the timeline
// on E, the synth rack on M) with every script, style, picture and clip it loads, flattened next
// to it, and scripts/reel-host-claude.js in front of it so saves go to the page's own store.
//
//   node scripts/build-reel-editor.mjs [--out=dir]    → .local/reel-editor/ by default
//
// It writes <out>/index.html (the page, as the Artifact tool publishes it: no doctype, html,
// head or body of its own, its title first) and every file beside it, and prints
// <out>/files.json, the map the Artifact tool's `files` takes (published path → source file).
// Publish it with capabilities { db: {}, downloads: true, comments: {}, assets: {} }: db keeps
// saves, downloads offers the files, comments lets Export send Claude a render request, assets
// holds the films Claude uploads. After John edits, read files/sizzle-reel-2.script.txt and
// files/sizzle-reel-2.score.txt from its store, write them over the repo's, check them (node
// scripts/reel-script.js check, node scripts/reel-music.js check) and render. For a request from
// Export: render the formats it names, upload each film (Artifact, asset: true) and write
// films/latest = { renderedAt, from: <the version it names>, items: [{ format, url, mb, seconds, fps }] }.
//
// What changes on the way: ../scripts and ../styles become scripts/ and styles/ (a published
// page cannot climb above itself); a media file with a space in its name is published with an
// underscore (REEL_HOST.media maps the paths the script names); and the chrome's light theme is
// switched off, because the reel is a film in one dark palette whatever theme the viewer uses.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const OUT = resolve(ROOT, arg('out', '.local/reel-editor'));
const RS = createRequire(import.meta.url)('./reel-script.js');
const TITLE = 'Sizzle Reel Editor';

const rig = readFileSync(join(ROOT, 'Assets/sizzle-reel-2.html'), 'utf8');
const script = readFileSync(join(ROOT, 'Assets/sizzle-reel-2.script.txt'), 'utf8');
const files = {};                                  // published path → source on disk (copied into OUT)
const put = (pub, from, transform) => {
  const to = join(OUT, pub);
  mkdirSync(dirname(to), { recursive: true });
  if (transform) writeFileSync(to, transform(readFileSync(from, 'utf8'))); else copyFileSync(from, to);
  files[pub] = to;
};
const safe = p => p.replace(/^\.\//, '').replace(/ /g, '_');

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// ── the scripts and the chrome's stylesheet ─────────────────────────────
const scripts = new Set(['reel-host-claude.js']);
for (const m of rig.matchAll(/\.\.\/scripts\/([\w.-]+\.js)/g)) scripts.add(m[1]);
for (const m of rig.matchAll(/'(reel-[\w-]+\.js)'/g)) scripts.add(m[1]);   // loaded by name in live mode
for (const f of scripts) put('scripts/' + f, join(ROOT, 'scripts', f));
put('styles/jh-chrome.css', join(ROOT, 'styles/jh-chrome.css'), css => css.replace(/\[data-theme="light"\]/g, '[data-reel-theme-off="light"]'));

// ── what the reel shows: the script's pictures and clips, the rig's own files ──
const media = new Set(['./media-kit.json', './sizzle-reel-2.script.txt', './sizzle-reel-2.score.txt']);
const walk = v => { if (typeof v === 'string') { if (/^\.\/.+\.(mp4|webm|webp|png|jpe?g|svg|gif)$/i.test(v)) media.add(v); } else if (v && typeof v === 'object') Object.values(v).forEach(walk); };
walk(RS.parse(script).edit);
for (const m of rig.matchAll(/(?:url\(["']?|fetch\(['"])(\.\/[\w.-]+\.(?:png|svg|webp|jpe?g|json))/g)) media.add(m[1]);
const missing = [];
for (const p of media) {
  const from = join(ROOT, 'Assets', p.replace(/^\.\//, ''));
  if (!existsSync(from)) { missing.push(p); continue; }
  put(safe(p), from);
}
if (missing.length) console.warn('not found, left out: ' + missing.join(', '));

// ── the page ────────────────────────────────────────────────────────────
let page = rig
  .replace(/<!DOCTYPE html>\s*/i, '')
  .replace(/<\/?html[^>]*>\s*/gi, '')
  .replace(/<\/?head>\s*/gi, '')
  .replace(/<\/?body[^>]*>\s*/gi, '')
  .replace(/<meta charset[^>]*>\s*/i, '')
  .replace(/<meta name="viewport"[^>]*>\s*/i, '')
  .replace(/<title>[\s\S]*?<\/title>\s*/i, '')
  .replace(/\.\.\/scripts\//g, 'scripts/')
  .replace(/\.\.\/styles\//g, 'styles/');
page = `<title>${TITLE}</title>\n<script src="scripts/reel-host-claude.js"></script>\n` + page;
if (/\.\.\//.test(page)) throw new Error('the page still climbs above itself: ' + page.match(/.{0,40}\.\.\/.{0,40}/)[0]);
writeFileSync(join(OUT, 'index.html'), page);
writeFileSync(join(OUT, 'files.json'), JSON.stringify(files, null, 1) + '\n');

const size = Object.values(files).reduce((a, f) => a + statSync(f).size, 0);
const biggest = Object.entries(files).map(([p, f]) => [p, statSync(f).size]).sort((a, b) => b[1] - a[1])[0];
console.log(`wrote ${join(OUT, 'index.html')} and ${Object.keys(files).length} files (${(size / 1e6).toFixed(1)} MB; the largest ${biggest[0]}, ${(biggest[1] / 1e6).toFixed(1)} MB)`);
console.log(`files map: ${join(OUT, 'files.json')}`);
