// The reel's dev server: it makes the live preview an editor.
//   node scripts/reel-dev.mjs [--port=1337]   → http://127.0.0.1:1337/Assets/sizzle-reel-2.html
//
// The rig (Assets/sizzle-reel-2.html) asks GET /__reel/ping on load. When this server answers,
// the timeline's edits save to the script file itself (POST /__reel/save), and the rig listens
// on GET /__reel/events for any change to that file on disk, so a save from any text editor
// reloads the preview at the same moment. Without it the rig still plays, and edits stay a draft.
//
// The same goes for a script's score (Assets/<name>.score.txt, the music): the synth rack saves
// it through /__reel/save, parsed by scripts/reel-music.js, and listens on /__reel/events so a
// save from a text editor reaches the rack (which updates in place; the preview does not reload).
//
// A save is parsed with scripts/reel-script.js before a byte is written: a script with a mistake
// answers 422 with the parser's "line N: …" rows and leaves the file alone. A good one first
// copies the file it replaces to .local/reel-backups/ (the newest 20 per script; .local is
// gitignored), then lands atomically (a temp file in the same folder, then a rename), so the
// preview and the renderer never read half a script.
//
// It is also a plain static server for the repo, with two things `python3 -m http.server` lacks.
// Byte ranges on every file: a media element only seeks a file it can range-request, and served
// whole every seek snaps back to 0 (why both cuts once filmed each clip as its first frame).
// And no stale copies: text (the script, the rig, the timeline) is sent no-store, so a reload
// after a save always reads the new version. Media is sent no-cache with an ETag, so the
// browser keeps its clips and a reload re-asks for them, answered 304 at no cost.
//
// Listens on 127.0.0.1 only: it writes files. If the port is busy it tries the next 20.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const ReelScript = createRequire(import.meta.url)('./reel-script.js');
const ReelMusic = createRequire(import.meta.url)('./reel-music.js');
const BACKUPS = path.join(ROOT, '.local', 'reel-backups');
const KEEP = 20, MAX_BODY = 2 * 1024 * 1024;
const SCRIPT_RE = /^Assets\/[\w.-]+\.(script|score)\.txt$/;       // a script, or its score (the music)
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const PORT = parseInt(arg('port', '1337'), 10);

const TYPES = {
  html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8', json: 'application/json; charset=utf-8', txt: 'text/plain; charset=utf-8',
  md: 'text/markdown; charset=utf-8', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  webp: 'image/webp', gif: 'image/gif', ico: 'image/x-icon', mp4: 'video/mp4', webm: 'video/webm',
  woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', glb: 'model/gltf-binary', gltf: 'model/gltf+json',
  wasm: 'application/wasm', pdf: 'application/pdf',
};
const typeOf = f => TYPES[path.extname(f).slice(1).toLowerCase()] || 'application/octet-stream';
const FRESH = new Set(['html', 'js', 'mjs', 'css', 'json', 'txt', 'md']);   // always re-read: a save must show
const log = (...a) => console.log(`reel-dev: ${new Date().toTimeString().slice(0, 8)}`, ...a);

const send = (res, code, body, type = 'text/plain; charset=utf-8', extra = {}) => {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(body), ...extra });
  res.end(body);
};
const json = (res, code, obj) => send(res, code, JSON.stringify(obj), 'application/json; charset=utf-8');

// A path from a client is trusted only if it is exactly Assets/<name>.script.txt or .score.txt.
const scriptPath = f => (typeof f === 'string' && SCRIPT_RE.test(f) && !f.includes('..')) ? path.join(ROOT, f) : null;

// ── static files ─────────────────────────────────────────────────────────
function serveStatic(req, res, pathname) {
  let rel;
  try { rel = decodeURIComponent(pathname); } catch { return send(res, 400, 'bad path'); }
  if (rel.includes('\0')) return send(res, 400, 'bad path');
  // Resolve, then refuse anything that left the root: covers ../ however it was encoded.
  const file = path.resolve(ROOT, '.' + path.posix.normalize('/' + rel));
  const inside = f => f === ROOT || f.startsWith(ROOT + path.sep);
  if (!inside(path.resolve(ROOT, '.' + rel)) || !inside(file)) return send(res, 403, 'forbidden');
  let st, target = file;
  try {
    st = fs.statSync(target);
    if (st.isDirectory()) { target = path.join(target, 'index.html'); st = fs.statSync(target); }
    if (!inside(fs.realpathSync(target))) return send(res, 403, 'forbidden');   // a symlink out of the repo
  } catch { return send(res, 404, 'not found'); }
  if (!st.isFile()) return send(res, 404, 'not found');

  const size = st.size, head = { 'Content-Type': typeOf(target), 'Cache-Control': 'no-store', 'Accept-Ranges': 'bytes' };
  // Clips, pictures and fonts are kept by the browser and re-asked (no-cache + ETag): a save
  // reloads the preview, and 16 MB of clips answered 304 cost nothing. Text stays no-store.
  if (!FRESH.has(path.extname(target).slice(1).toLowerCase())) {
    const tag = `W/"${size.toString(16)}-${Math.round(st.mtimeMs).toString(16)}"`;
    Object.assign(head, { 'Cache-Control': 'no-cache', ETag: tag, 'Last-Modified': st.mtime.toUTCString() });
    if (req.headers['if-none-match'] === tag) { res.writeHead(304, head); return res.end(); }
  }
  let start = 0, end = size - 1, code = 200;
  const range = req.headers.range;
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());   // one range; a multi-range ask is answered whole
    if (m && (m[1] || m[2])) {
      if (m[1]) { start = +m[1]; end = m[2] ? Math.min(+m[2], size - 1) : size - 1; }
      else { const n = +m[2]; start = Math.max(0, size - n); end = size - 1; if (!n) start = size; }
      if (start >= size || start > end) {
        res.writeHead(416, { ...head, 'Content-Range': `bytes */${size}`, 'Content-Length': 0 });
        return res.end();
      }
      code = 206; head['Content-Range'] = `bytes ${start}-${end}/${size}`;
    }
  }
  head['Content-Length'] = size ? end - start + 1 : 0;
  res.writeHead(code, head);
  if (req.method === 'HEAD' || !size) return res.end();
  const s = fs.createReadStream(target, { start, end });
  s.on('error', () => res.destroy());
  res.on('close', () => s.destroy());
  s.pipe(res);
}

// ── saving a script ──────────────────────────────────────────────────────
function backup(file) {
  if (!fs.existsSync(file)) return null;
  fs.mkdirSync(BACKUPS, { recursive: true });
  const base = path.basename(file);
  // an ISO stamp sorts by time as text; the colons go because some filesystems refuse them
  const out = path.join(BACKUPS, `${base}.${new Date().toISOString().replace(/[:.]/g, '-')}.txt`);
  fs.copyFileSync(file, out);
  const mine = fs.readdirSync(BACKUPS).filter(n => n.startsWith(base + '.') && n.endsWith('.txt')).sort();
  mine.slice(0, Math.max(0, mine.length - KEEP)).forEach(n => { try { fs.unlinkSync(path.join(BACKUPS, n)); } catch { /* gone already */ } });
  return out;
}

function save(req, res) {
  // Only this server's own pages may save. A page from anywhere else can still POST to
  // localhost with a "simple" text/plain body, which skips the browser's CORS preflight, so
  // demand JSON (a cross-origin JSON POST must preflight, and nothing here answers one) and,
  // when the browser names an Origin, that it is this server.
  const origin = req.headers.origin, host = req.headers.host;
  if (origin && origin !== `http://${host}`) return json(res, 403, { ok: false, errors: ['saves come only from pages this server serves'] });
  if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) return json(res, 415, { ok: false, errors: ['send the script as JSON: {"file", "text"}'] });
  const chunks = []; let len = 0, over = false;
  req.on('data', c => {
    if (over) return;
    len += c.length;
    if (len > MAX_BODY) { over = true; json(res, 413, { ok: false, errors: ['the script is over 2 MB'] }); req.resume(); return; }
    chunks.push(c);
  });
  req.on('end', () => {
    if (over) return;
    let body;
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return json(res, 400, { ok: false, errors: ['the body is not JSON'] }); }
    const file = scriptPath(body && body.file);
    if (!file) return json(res, 400, { ok: false, errors: ['file should be Assets/<name>.script.txt or Assets/<name>.score.txt'] });
    if (typeof body.text !== 'string') return json(res, 400, { ok: false, errors: ['text should be the whole script as a string'] });
    let parsed;
    const isScore = body.file.endsWith('.score.txt');
    try { parsed = isScore ? ReelMusic.parse(body.text) : ReelScript.parse(body.text); } catch (e) {
      log(`refused ${body.file}: ${(e.errors || [e.message]).length} mistake(s)`);
      return json(res, 422, { ok: false, errors: e.errors || [e.message] });
    }
    try {
      backup(file);
      const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`);
      fs.writeFileSync(tmp, body.text);
      try { fs.renameSync(tmp, file); } catch (e) { try { fs.unlinkSync(tmp); } catch { /* never landed */ } throw e; }
    } catch (e) {
      log(`error saving ${body.file}: ${e.message}`);
      return json(res, 500, { ok: false, errors: [`could not write the file: ${e.message}`] });
    }
    if (isScore) {
      log(`saved ${body.file} (${parsed.score.tracks.length} tracks)`);
      return json(res, 200, { ok: true, warnings: parsed.warnings });
    }
    const sp = ReelScript.spans(parsed.edit), total = sp.length ? sp[sp.length - 1].end : 0;
    log(`saved ${body.file} (${total} s${parsed.warnings.length ? `, ${parsed.warnings.length} warning(s)` : ''})`);
    json(res, 200, { ok: true, warnings: parsed.warnings, total });
  });
}

// ── telling the preview a script changed ─────────────────────────────────
// Watch the folder, not the file: editors (and our own save) replace a file by renaming a new
// one over it, and a watch on the old file would go quiet. Events come in bursts, so wait
// ~150 ms, then believe only a real change of mtime or size.
function events(req, res, q) {
  const rel = q.get('file'), file = scriptPath(rel);
  if (!file) return json(res, 400, { ok: false, errors: ['file should be Assets/<name>.script.txt or Assets/<name>.score.txt'] });
  const stamp = () => { try { const s = fs.statSync(file); return `${s.mtimeMs}:${s.size}`; } catch { return 'missing'; } };
  let last = stamp(), timer = null, watcher;
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
  res.write(': reel-dev watching ' + rel + '\n\n');
  try {
    watcher = fs.watch(path.dirname(file), (ev, name) => {
      if (name && name !== path.basename(file)) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        const now = stamp();
        if (now === last) return;
        last = now;
        res.write(`event: change\ndata: ${JSON.stringify({ file: rel })}\n\n`);
      }, 150);
    });
    watcher.on('error', () => {});
  } catch (e) { log(`error watching ${rel}: ${e.message}`); }
  const beat = setInterval(() => res.write(': heartbeat\n\n'), 15000);
  req.on('close', () => { clearInterval(beat); clearTimeout(timer); if (watcher) watcher.close(); });
}

const server = http.createServer((req, res) => {
  let u;
  try { u = new URL(req.url, 'http://127.0.0.1'); } catch { return send(res, 400, 'bad url'); }
  if (u.pathname === '/__reel/ping') return json(res, 200, { ok: true, server: 'reel-dev' });
  if (u.pathname === '/__reel/save') return req.method === 'POST' ? save(req, res) : send(res, 405, 'POST only', undefined, { Allow: 'POST' });
  if (u.pathname === '/__reel/events') return events(req, res, u.searchParams);
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'GET or HEAD only', undefined, { Allow: 'GET, HEAD' });
  try { serveStatic(req, res, u.pathname); } catch (e) { log(`error serving ${u.pathname}: ${e.message}`); if (!res.headersSent) send(res, 500, 'error'); }
});

// the next free port, up to 20 past the one asked for
(function listen(port) {
  const fail = e => {
    if (e.code === 'EADDRINUSE' && port < PORT + 20) return listen(port + 1);
    console.error(`reel-dev: cannot listen (${e.message})`); process.exit(1);
  };
  server.once('error', fail);
  server.listen(port, '127.0.0.1', () => {
    server.off('error', fail);
    server.on('error', e => log(`error: ${e.message}`));
    console.log(`reel-dev: http://127.0.0.1:${port}/Assets/sizzle-reel-2.html`);
  });
})(PORT);
