// The dev server's contract (scripts/reel-dev.mjs), end to end against a real process.
//   node "Agent Reference/reel-tests/devservertest.mjs"
// Static files with byte ranges (the rig's clips seek only through ranges), text no-store,
// media re-asked by ETag (304), traversal refused, ping, saves that parse before they write (422 leaves the file alone,
// 200 writes it and keeps a backup, other paths 400), and a change on disk reaching an
// /__reel/events subscriber. The media picker's catalogue (/__reel/media) and thumbnails
// (/__reel/thumb/<key>.webp). Rendering for the editor's Export: the guards (JSON only, this
// server's pages only, known formats, scripts only), one job at a time, the renderer's own
// progress, and cancel (the render is started for real, then stopped). Works on a temp copy of
// the script, removed in finally.
import { spawn } from 'node:child_process';
import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const RS = createRequire(import.meta.url)(path.join(ROOT, 'scripts/reel-script.js'));
const RS_TOTAL = src => { const sp = RS.spans(RS.parse(src).edit); return sp[sp.length - 1].end; };
const VIDEO = path.join(ROOT, 'Assets', 'media-kit', 'video');
const REL = 'Assets/zz-devserver-test.script.txt', TMP = path.join(ROOT, REL);
const BACKUPS = path.join(ROOT, '.local', 'reel-backups');
let fails = 0, passes = 0;
const check = (ok, what, extra = '') => { if (ok) passes++; else fails++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${ok || !extra ? '' : '  (' + extra + ')'}`); };

const freePort = () => new Promise(r => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
// raw requests, so the path goes out exactly as written (fetch would normalise ../)
const req = (port, method, p, headers = {}, body) => new Promise((resolve, reject) => {
  const r = http.request({ host: '127.0.0.1', port, method, path: p, headers }, res => {
    const c = []; res.on('data', d => c.push(d)); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(c) }));
  });
  r.on('error', reject); if (body) r.write(body); r.end();
});
const post = (port, obj) => req(port, 'POST', '/__reel/save', { 'Content-Type': 'application/json' }, JSON.stringify(obj))
  .then(r => ({ ...r, json: JSON.parse(r.body.toString() || '{}') }));
const backupsOf = () => fs.existsSync(BACKUPS) ? fs.readdirSync(BACKUPS).filter(n => n.startsWith(path.basename(REL) + '.')) : [];

let child;
try {
  const port = await freePort();
  child = spawn(process.execPath, [path.join(ROOT, 'scripts/reel-dev.mjs'), `--port=${port}`], { stdio: ['ignore', 'pipe', 'pipe'] });
  const url = await new Promise((resolve, reject) => {
    let out = '';
    const t = setTimeout(() => reject(new Error('no listening line in 5 s: ' + out)), 5000);
    child.stdout.on('data', d => { out += d; const m = /^reel-dev: (http:\/\/127\.0\.0\.1:(\d+)\/Assets\/sizzle-reel-2\.html)$/m.exec(out); if (m) { clearTimeout(t); resolve(m); } });
    child.stderr.on('data', d => { out += d; });
    child.on('exit', c => reject(new Error('server exited ' + c + ': ' + out)));
  });
  const P = +url[2];
  check(P === port, 'listens on the port asked for, prints its line', url[1]);

  // ── static ──
  let r = await req(P, 'GET', '/Assets/sizzle-reel-2.html');
  check(r.status === 200 && /^text\/html/.test(r.headers['content-type']) && r.headers['cache-control'] === 'no-store', 'GET html: 200, text/html, no-store', `${r.status} ${r.headers['content-type']} ${r.headers['cache-control']}`);
  check(r.body.equals(fs.readFileSync(path.join(ROOT, 'Assets/sizzle-reel-2.html'))), 'GET html: the bytes of the file');
  const MP4 = path.join(ROOT, 'Assets/nanome-hero.mp4'), size = fs.statSync(MP4).size;
  r = await req(P, 'GET', '/Assets/nanome-hero.mp4', { Range: 'bytes=100-1099' });
  check(r.status === 206 && r.headers['content-range'] === `bytes 100-1099/${size}` && r.body.length === 1000 && +r.headers['content-length'] === 1000 && r.headers['accept-ranges'] === 'bytes' && r.headers['content-type'] === 'video/mp4',
    'range a-b: 206, Content-Range, 1000 bytes', `${r.status} ${r.headers['content-range']} ${r.body.length}`);
  const fd = fs.openSync(MP4, 'r'), want = Buffer.alloc(1000); fs.readSync(fd, want, 0, 1000, 100);
  check(r.body.equals(want), 'range a-b: the right bytes');
  r = await req(P, 'GET', '/Assets/nanome-hero.mp4', { Range: `bytes=${size - 10}-` });
  check(r.status === 206 && r.headers['content-range'] === `bytes ${size - 10}-${size - 1}/${size}` && r.body.length === 10, 'range a-: to the end', `${r.status} ${r.headers['content-range']}`);
  r = await req(P, 'GET', '/Assets/nanome-hero.mp4', { Range: 'bytes=-100' });
  const tail = Buffer.alloc(100); fs.readSync(fd, tail, 0, 100, size - 100); fs.closeSync(fd);
  check(r.status === 206 && r.headers['content-range'] === `bytes ${size - 100}-${size - 1}/${size}` && r.body.equals(tail), 'range -n: the last 100 bytes', `${r.status} ${r.headers['content-range']}`);
  r = await req(P, 'GET', '/Assets/nanome-hero.mp4', { Range: `bytes=${size}-` });
  check(r.status === 416 && r.headers['content-range'] === `bytes */${size}`, 'unsatisfiable range: 416, bytes */size', `${r.status} ${r.headers['content-range']}`);
  r = await req(P, 'HEAD', '/Assets/nanome-hero.mp4');
  check(r.status === 200 && +r.headers['content-length'] === size && r.body.length === 0 && r.headers['accept-ranges'] === 'bytes', 'HEAD: length, no body', `${r.status} ${r.headers['content-length']}`);
  // media is kept and re-asked, so the reload after a save does not re-download the clips
  const tag = r.headers.etag;
  check(r.headers['cache-control'] === 'no-cache' && !!tag, 'media: no-cache with an ETag', `${r.headers['cache-control']} ${tag}`);
  r = await req(P, 'GET', '/Assets/nanome-hero.mp4', { 'If-None-Match': tag });
  check(r.status === 304 && r.body.length === 0, 'media: a matching ETag is answered 304, no body', `${r.status} ${r.body.length}`);
  r = await req(P, 'GET', '/Assets/no-such-file.txt');
  check(r.status === 404, 'missing file: 404', r.status);
  r = await req(P, 'GET', '/scripts/');
  check(r.status === 404, 'folder without index.html: 404', r.status);
  r = await req(P, 'GET', '/');
  check(r.status === 200 && /^text\/html/.test(r.headers['content-type']), 'folder with index.html serves it', r.status);
  for (const p of ['/..%2f..%2fetc/passwd', '/../../etc/passwd', '/Assets/%2e%2e/%2e%2e/%2e%2e/etc/passwd']) {
    r = await req(P, 'GET', p);
    check((r.status === 403 || r.status === 404 || r.status === 400) && !/root:/.test(r.body.toString()), `traversal ${p} refused`, `${r.status}`);
  }
  r = await req(P, 'GET', '/__reel/ping');
  const ping = JSON.parse(r.body.toString());
  check(r.status === 200 && ping.ok === true && ping.server === 'reel-dev', 'ping', r.body.toString());

  // ── saves ──
  const real = fs.readFileSync(path.join(ROOT, 'Assets/sizzle-reel-2.script.txt'), 'utf8');
  fs.writeFileSync(TMP, real);
  r = await post(P, { file: REL, text: real.replace(/^SCENE (\w+) [\d.]+/m, 'SCENE $1 banana') });
  check(r.status === 422 && r.json.ok === false && Array.isArray(r.json.errors) && r.json.errors.length > 0, 'broken script: 422 with errors', `${r.status} ${JSON.stringify(r.json).slice(0, 200)}`);
  check(fs.readFileSync(TMP, 'utf8') === real, 'broken script: the file is untouched');
  const m = /^(\s*query\s+)(\S+)/m.exec(real);
  const edited = m ? real.replace(m[0], m[1] + 'zzword') : null;
  check(!!edited && edited !== real, 'the real script has a query line to change');
  const before = backupsOf().length;
  r = await post(P, { file: REL, text: edited });
  check(r.status === 200 && r.json.ok === true && Array.isArray(r.json.warnings) && typeof r.json.total === 'number' && r.json.total > 0, 'valid edit: 200 with warnings and total', `${r.status} ${JSON.stringify(r.json).slice(0, 200)}`);
  check(fs.readFileSync(TMP, 'utf8') === edited, 'valid edit: the file is the text');
  const bk = backupsOf();
  check(bk.length === before + 1 && bk.some(n => fs.readFileSync(path.join(BACKUPS, n), 'utf8') === real), 'valid edit: a backup of the old file', `${before} → ${bk.length}`);
  check(!fs.readdirSync(path.join(ROOT, 'Assets')).some(n => n.endsWith('.tmp')), 'no temp file left behind');
  r = await post(P, { file: 'scripts/x.js', text: real });
  check(r.status === 400 && r.json.ok === false && !fs.existsSync(path.join(ROOT, 'scripts/x.js')), 'disallowed path: 400', r.status);
  r = await post(P, { file: 'Assets/../scripts/x.script.txt', text: real });
  check(r.status === 400, 'dotted path: 400', r.status);
  // a page from elsewhere cannot save: not from a foreign origin, not as a preflight-free text/plain POST
  const before2 = fs.readFileSync(TMP, 'utf8'), body2 = JSON.stringify({ file: 'Assets/zz-devserver-test.script.txt', text: real });
  r = await req(P, 'POST', '/__reel/save', { 'Content-Type': 'application/json', Origin: 'http://evil.example' }, body2);
  check(r.status === 403 && fs.readFileSync(TMP, 'utf8') === before2, 'a save from a foreign origin: 403, file untouched', r.status);
  r = await req(P, 'POST', '/__reel/save', { 'Content-Type': 'text/plain' }, body2);
  check(r.status === 415 && fs.readFileSync(TMP, 'utf8') === before2, 'a text/plain save (no preflight): 415, file untouched', r.status);
  r = await req(P, 'POST', '/__reel/save', { 'Content-Type': 'application/json' }, Buffer.alloc(3 * 1024 * 1024, 32));
  check(r.status === 413, 'over 2 MB: 413', r.status);

  // ── events ──
  const got = await new Promise(resolve => {
    let buf = '', done = false;
    const finish = v => { if (done) return; done = true; clearTimeout(t); sse.destroy(); resolve(v); };
    const t = setTimeout(() => finish(null), 3000);
    const sse = http.get({ host: '127.0.0.1', port: P, path: '/__reel/events?file=' + encodeURIComponent(REL) }, res => {
      if (res.statusCode !== 200 || !/text\/event-stream/.test(res.headers['content-type'])) return finish('status ' + res.statusCode);
      // the stream is open once its opening comment arrives: change the file then
      res.on('data', d => {
        buf += d;
        if (!sse.wrote && buf.includes('\n\n')) { sse.wrote = Date.now(); setTimeout(() => fs.writeFileSync(TMP, real + '\n# touched\n'), 50); }
        const e = /event: change\ndata: (.*)\n\n/.exec(buf);
        if (e) finish({ data: JSON.parse(e[1]), ms: Date.now() - sse.wrote });
      });
    });
    sse.on('error', () => finish('error'));
  });
  check(got && got.data && got.data.file === REL && got.ms < 2000, 'events: change within 2 s of a write on disk', JSON.stringify(got));
  r = await req(P, 'GET', '/__reel/events?file=scripts/x.js');
  check(r.status === 400, 'events for a disallowed path: 400', r.status);

  // ── the media library: the picker's catalogue and thumbnails ──
  const lib = await req(port, 'GET', '/__reel/media'), libJ = JSON.parse(lib.body.toString());
  const clips = (libJ.items || []).filter(i => i.kind === 'clip'), pics = (libJ.items || []).filter(i => i.kind === 'picture');
  check(lib.status === 200 && clips.length >= 7 && pics.length >= 50 && libJ.items.every(i => /^\.\//.test(i.path) && i.thumb && i.key && i.w > 0),
    `media: the catalogue lists every clip and picture (${clips.length} clips, ${pics.length} pictures), each with its size and a thumbnail`);
  const mara = clips.find(i => i.path === './nanome-mara.mp4');
  check(mara && Math.abs(mara.dur - 25.7) < 0.2 && mara.w === 1280, 'media: a clip carries its length and frame size', JSON.stringify(mara));
  check(!libJ.items.some(i => /-poster\.webp$|favicon|\.svg$/i.test(i.path)) && !libJ.items.some(i => i.path === './jhana-1.jpg'),
    'media: no posters, favicons or svgs, and a .jpg with a .webp twin is left out');
  const th = await req(port, 'GET', mara ? mara.thumb : '/__reel/thumb/x.webp');
  check(th.status === 200 && th.headers['content-type'] === 'image/webp' && th.body.slice(0, 4).toString() === 'RIFF' && th.body.slice(8, 12).toString() === 'WEBP',
    `media: a thumbnail is a webp (${th.body.length} bytes)`, th.status);
  const nothumb = await req(port, 'GET', '/__reel/thumb/no-such-file-12345678.webp');
  check(nothumb.status === 404, 'media: an unknown thumbnail is a 404', nothumb.status);

  // ── rendering: the editor's Export ──
  const rpost = (p, obj, headers = { 'Content-Type': 'application/json' }) => req(port, 'POST', p, headers, JSON.stringify(obj)).then(x => ({ ...x, json: JSON.parse(x.body.toString() || '{}') }));
  const status = async () => JSON.parse((await req(port, 'GET', '/__reel/render')).body.toString());
  let st = await status();
  check(st.job === null && st.formats.join() === 'wide,square,vertical', 'render: no job at first, and the formats it can make', JSON.stringify(st));
  r = await rpost('/__reel/render', { file: REL, formats: ['wide'] }, { 'Content-Type': 'text/plain' });
  check(r.status === 415, 'render: a text/plain body is refused (a page elsewhere cannot start one)', r.status);
  r = await rpost('/__reel/render', { file: REL, formats: ['wide'] }, { 'Content-Type': 'application/json', Origin: 'http://elsewhere.example' });
  check(r.status === 403, 'render: a foreign Origin is refused', r.status);
  r = await rpost('/__reel/render', { file: REL, formats: ['cinema'] });
  check(r.status === 400, 'render: an unknown format is refused', r.status);
  r = await rpost('/__reel/render', { file: REL.replace('.script.txt', '.score.txt'), formats: ['wide'] });
  check(r.status === 400, 'render: only a script renders', r.status);
  r = await rpost('/__reel/render', { file: REL, formats: ['square', 'wide'], fps: 30 });
  check(r.status === 202 && r.json.job.state === 'running' && r.json.job.items.map(i => i.format).join() === 'wide,square', 'render: a job starts, its films in order (wide, square)', `${r.status} ${JSON.stringify(r.json.job)}`);
  const again = await rpost('/__reel/render', { file: REL, formats: ['wide'] });
  check(again.status === 409, 'render: one job at a time', again.status);
  let seen = null;
  for (let k = 0; k < 150 && !seen; k++) {
    await new Promise(res => setTimeout(res, 400));
    st = await status();
    const it = st.job.items[0];
    if (it.frames) seen = it;
    if (st.job.state !== 'running') break;
  }
  const frames30 = Math.round(RS_TOTAL(fs.readFileSync(TMP, "utf8")) * 30);
  check(seen && seen.state === 'running' && seen.frames === frames30 && seen.frame >= 0 && seen.eta >= 0, 'render: its progress is the renderer\'s own (frame, frames, seconds left)', JSON.stringify(seen || st.job));
  r = await rpost('/__reel/render/cancel', {});
  check(r.status === 200 && r.json.job.state === 'cancelled', 'render: cancel stops the job', JSON.stringify(r.json.job && r.json.job.state));
  await new Promise(res => setTimeout(res, 1000));
  st = await status();
  check(st.job.items.every(i => i.state === 'cancelled'), 'render: and every film in it', st.job.items.map(i => i.state).join());
} catch (e) {
  fails++; console.log('FAIL', e.stack || e.message);
} finally {
  if (child && child.exitCode == null) child.kill('SIGTERM');
  try { fs.unlinkSync(TMP); } catch { /* never made */ }
  backupsOf().forEach(n => fs.unlinkSync(path.join(BACKUPS, n)));
  // a cancelled render leaves no film, but its chunks' folder may be left behind
  if (fs.existsSync(VIDEO)) for (const n of fs.readdirSync(VIDEO)) if (/^\.?zz-devserver-test/.test(n)) fs.rmSync(path.join(VIDEO, n), { recursive: true, force: true });
}
console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
