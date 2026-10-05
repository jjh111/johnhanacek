// The media a reel can show: every picture and clip in Assets/ a script could name, each with a
// small thumbnail, for the editor's media picker (scripts/reel-picker.js).
//
//   node scripts/reel-media.mjs            → the catalogue, one line per file
//   node scripts/reel-media.mjs --thumbs   → and make every thumbnail now
//
// scan() lists the top of Assets/ and the folders in FOLDERS. It keeps every clip (.mp4, .webm)
// and every picture (.webp .png .jpg .jpeg .gif) at least MIN_SIDE px on its long side, and drops
// a .jpg, .jpeg or .png when the same name also comes as .webp (the site's smaller copy). Each
// file's size (and a clip's length) is read with ffmpeg once, then kept in .local/reel-media/
// keyed by the file's bytes and date. A clip's poster is its `<name>-poster.webp`, when there is
// one; posters are listed with the clips they belong to, not as pictures of their own.
//
// thumb() makes a THUMB_W px wide webp of a picture, or of a clip's poster (else its frame at
// 1 s), in .local/reel-media/thumbs/<key>.webp. The key carries the file's bytes and date, so an
// edited file gets a new thumbnail and an old one is never served for it.
//
// Used by scripts/reel-dev.mjs (GET /__reel/media, /__reel/thumb/<key>.webp) and by
// scripts/build-reel-editor.mjs (the claude.ai editor carries the catalogue, the thumbnails and
// the files, so any pick plays in its preview). Paths are the script's: ./name or ./folder/name,
// relative to Assets/, where the rig lives.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const FOLDERS = ['', 'grad', 'blokdok', 'posters', 'openprose-approaches'];      // '' is the top of Assets/
const PICTURE = new Set(['.webp', '.png', '.jpg', '.jpeg', '.gif']), CLIP = new Set(['.mp4', '.webm']);
const MIN_SIDE = 400, THUMB_W = 320;
const CACHE = join(ROOT, '.local', 'reel-media'), META = join(CACHE, 'meta.json'), THUMBS = join(CACHE, 'thumbs');

// what ffmpeg says about a file: its frame size and, for a clip, its length
function probe(file) {
  const e = spawnSync('ffmpeg', ['-hide_banner', '-i', file], { encoding: 'utf8' }).stderr || '';
  const v = /Stream #[^\n]*Video:[^\n]*?(\d{2,5})x(\d{2,5})/.exec(e), d = /Duration: (\d+):(\d+):([\d.]+)/.exec(e);
  return { w: v ? +v[1] : 0, h: v ? +v[2] : 0, dur: d ? +d[1] * 3600 + +d[2] * 60 + +d[3] : 0 };
}
const keyOf = (path, st) => path.replace(/^\.\//, '').replace(/[^\w.-]+/g, '_').replace(/\.[^.]+$/, '')
  + '-' + createHash('sha1').update(`${path}|${st.size}|${Math.round(st.mtimeMs)}`).digest('hex').slice(0, 8);

export function scan(root = ROOT) {
  const assets = join(root, 'Assets');
  let meta = {};
  try { meta = JSON.parse(readFileSync(META, 'utf8')); } catch { /* first run */ }
  const out = [], seen = new Set();
  for (const folder of FOLDERS) {
    const dir = join(assets, folder);
    if (!existsSync(dir)) continue;
    const names = readdirSync(dir).filter(n => !n.startsWith('.'));
    const stems = new Set(names.filter(n => extname(n).toLowerCase() === '.webp').map(n => n.slice(0, -5).toLowerCase()));
    for (const name of names.sort((a, b) => a.localeCompare(b))) {
      const ext = extname(name).toLowerCase(), file = join(dir, name);
      const kind = CLIP.has(ext) ? 'clip' : PICTURE.has(ext) ? 'picture' : null;
      if (!kind) continue;
      const st = statSync(file);
      if (!st.isFile()) continue;
      if (kind === 'picture' && ext !== '.webp' && stems.has(name.slice(0, -ext.length).toLowerCase())) continue;   // the webp stands for it
      if (kind === 'picture' && /-poster\.webp$/i.test(name)) continue;                                               // a clip's, shown with it
      const path = './' + (folder ? folder + '/' : '') + name;
      const stamp = `${st.size}:${Math.round(st.mtimeMs)}`;
      let m = meta[path];
      if (!m || m.stamp !== stamp) { m = { stamp, ...probe(file) }; meta[path] = m; }
      if (kind === 'picture' && Math.max(m.w, m.h) < MIN_SIDE) continue;
      const poster = kind === 'clip' ? join(dir, name.slice(0, -ext.length) + '-poster.webp') : null;
      seen.add(path);
      out.push({ path, name, folder, kind, w: m.w, h: m.h, ...(kind === 'clip' ? { dur: +m.dur.toFixed(2) } : {}), bytes: st.size,
        key: keyOf(path, st), ...(poster && existsSync(poster) ? { poster: './' + (folder ? folder + '/' : '') + name.slice(0, -ext.length) + '-poster.webp' } : {}) });
    }
  }
  for (const p of Object.keys(meta)) if (!seen.has(p) && !existsSync(join(assets, p))) delete meta[p];
  mkdirSync(CACHE, { recursive: true });
  writeFileSync(META, JSON.stringify(meta));
  return out;
}

// the thumbnail's file, made if it is not there yet (null when ffmpeg cannot read the source)
export function thumb(entry, root = ROOT) {
  const out = join(THUMBS, entry.key + '.webp');
  if (existsSync(out)) return out;
  mkdirSync(THUMBS, { recursive: true });
  const assets = join(root, 'Assets');
  const src = join(assets, (entry.poster || entry.path).replace(/^\.\//, ''));
  const seek = entry.kind === 'clip' && !entry.poster ? ['-ss', String(Math.min(1, (entry.dur || 2) / 2))] : [];
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...seek, '-i', src, '-frames:v', '1',
    '-vf', `scale=${THUMB_W}:-2:flags=lanczos`, '-c:v', 'libwebp', '-quality', '72', out], { encoding: 'utf8' });
  return r.status === 0 && existsSync(out) ? out : null;
}

// ── the command line ────────────────────────────────────────────────────
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const items = scan();
  const mb = b => (b / 1e6).toFixed(1).padStart(5) + ' MB';
  for (const it of items) {
    const size = it.kind === 'clip' ? `${it.w}×${it.h} ${it.dur.toFixed(1)} s` : `${it.w}×${it.h}`;
    if (process.argv.includes('--thumbs')) thumb(it);
    console.log(`${it.kind.padEnd(7)} ${mb(it.bytes)}  ${size.padEnd(18)} ${it.path}${it.poster ? '  (poster ' + it.poster + ')' : ''}`);
  }
  const clips = items.filter(i => i.kind === 'clip');
  console.log(`\n${items.length} files: ${clips.length} clips, ${items.length - clips.length} pictures, ${(items.reduce((a, i) => a + i.bytes, 0) / 1e6).toFixed(1)} MB`);
}
