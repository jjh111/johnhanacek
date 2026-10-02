// Cues in the scenes: every scene's typing speed, arrival (`in`) and exit (`out`) read the
// script's named cues (scripts/reel-script.js CUES), and a scene that writes none keeps the
// rig's own timing to the byte.
//
//   node "Agent Reference/reel-tests/cuestest.mjs"
//
// 1. Defaults are the rig's own timing. A copy of the script with every cue of every scene
//    written out at its default must film exactly like the script with none. (Once, on
//    2026-09-27, the cue-reading rig was also checked against stills filmed from the rig before
//    cues existed: 10 of 11 byte-identical, the 11th off only by the noise below.) Noise: the
//    art's circular port (a zoomed webp) decodes a little differently from run to run of the
//    SAME rig, and any edit to the rig's source moves the ⌘K box's anti-aliasing by one level
//    on 5 pixels. So a still that is not byte-equal passes only as noise: under 2000 pixels
//    off, and it is printed as such. The smallest real cue move below is 42k pixels.
//    Set CUES_REF=<a folder of stills> to also compare against stills from an older rig.
// 2. Each cue moves what it should. A copy of the script gains "cue out 1.5" on the answer,
//    "cue typing 12" on the art and "cue in 0.6" on the logos. At a moment chosen for each,
//    the cued still must differ from the default one (the answer already leaving 1.3 s before
//    its end, the art's question half typed 0.4 s in, the logos panel not yet in 0.9 s in: by
//    default it pops about 0.6 s in, the question's Enter plus 0.04). The moments are counted
//    from the scenes, so they hold whatever lengths the script gives them. "Differ" means 2000
//    pixels or more, so the noise above cannot pass for a moved joint. Both sides render from
//    copies (the script with no cues written is a copy too, in the same scene order: see
//    inorder.mjs), deleted in finally.
//
// Drives the renderer as a child process, one render at a time (the machine is shared).
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, readdirSync, rmSync, mkdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { inOrder } from './inorder.mjs';   // the scenes in the order the suite was written for

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const ReelScript = createRequire(import.meta.url)(join(ROOT, 'scripts/reel-script.js'));
const SCRATCH = process.env.CUES_SCRATCH || join(ROOT, '.local/reel-tests/cues');
const LIST = '1.6,4.5,8.5,12,14.5,18.5,40,43,47,53.5,58.5';
// [scene, cue, value, the moment to look at: seconds after the scene's start (+) or before its end (-)]
const MOMENTS = [['answer', 'out', 1.5, -1.3], ['art', 'typing', 12, 0.4], ['logos', 'in', 0.6, 0.9]];
const TEMP = 'Assets/zz-cues-test.script.txt', PLAIN = 'Assets/zz-cues-plain.script.txt';   // the cued copy; the plain one, in the same order

let fails = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };

// one render; returns its stills in time order
function render(dir, stills, extra = []) {
  rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  const r = spawnSync('node', ['scripts/render-sizzle-reel.mjs', '--cut=2', '--stills=' + stills, '--out=' + join(dir, 'x.mp4'), ...extra],
    { cwd: ROOT, encoding: 'utf8', timeout: 300000 });
  if (r.status !== 0) throw new Error(`render failed (${dir}):\n${r.stdout}\n${r.stderr}`);
  return pngs(dir);
}
const pngs = dir => { const d = join(dir, 'stills'); return existsSync(d) ? readdirSync(d).filter(f => f.endsWith('.png')).sort((a, b) => secs(a) - secs(b)).map(f => join(d, f)) : []; };
const secs = f => parseFloat(f.match(/-([\d.]+)s\.png$/)[1]);
const same = (a, b) => readFileSync(a).equals(readFileSync(b));
// pixels that differ between two stills, and by how much at most (ffmpeg decodes to raw RGB)
function pixdiff(a, b) {
  const raw = f => spawnSync('ffmpeg', ['-loglevel', 'error', '-i', f, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 26 }).stdout;
  const x = raw(a), y = raw(b);
  if (!x || !y || x.length !== y.length) return { n: Infinity, max: 255 };
  let n = 0, max = 0;
  for (let i = 0; i < x.length; i += 3) {
    const d = Math.max(Math.abs(x[i] - y[i]), Math.abs(x[i + 1] - y[i + 1]), Math.abs(x[i + 2] - y[i + 2]));
    if (d) { n++; if (d > max) max = d; }
  }
  return { n, max };
}

try {
  // ── 1. defaults are the rig's own timing ──────────────────────────
  const plain = inOrder(readFileSync(join(ROOT, 'Assets/sizzle-reel-2.script.txt'), 'utf8'));
  let spelled = plain;
  for (const m of ReelScript.parse(plain).marks.filter(k => k.kind === 'scene'))
    for (const name of ReelScript.cueNames(m.obj.type)) {
      const at = ReelScript.parse(spelled).marks.find(k => k.kind === 'scene' && k.obj.type === m.obj.type);
      spelled = ReelScript.setCue(spelled, at.ln, name, ReelScript.cue(m.obj, name));
    }
  writeFileSync(join(ROOT, TEMP), spelled);
  writeFileSync(join(ROOT, PLAIN), plain);
  const written = ReelScript.parse(spelled).edit.scenes.reduce((n, s) => n + Object.keys(s.cues || {}).length, 0);
  ok(written >= 25, `temp script: every cue of every scene written at its default (${written} cues)`);
  const base = render(join(SCRATCH, 'plain'), LIST, ['--script=' + PLAIN]);
  const full = render(join(SCRATCH, 'spelled'), LIST, ['--script=' + TEMP]);
  ok(base.length === 11 && full.length === 11, `both still lists rendered (${base.length}, ${full.length})`);
  const compare = (f, g, what) => {
    if (same(f, g)) return ok(true, `${what} at ${secs(f)} s is byte-identical`);
    const d = pixdiff(f, g);
    ok(d.n < 2000, `${what} at ${secs(f)} s: not byte-equal, ${d.n} pixels off by at most ${d.max} (${d.n < 2000 ? 'decode / anti-aliasing noise' : 'a real change'})`);
  };
  base.forEach((f, i) => full[i] && compare(f, full[i], 'default cues written out'));
  if (process.env.CUES_REF) pngs(process.env.CUES_REF).forEach((f, i) => base[i] && compare(f, base[i], 'against CUES_REF'));

  // ── 2. each cue moves its joint ───────────────────────────────────
  let src = inOrder(readFileSync(join(ROOT, 'Assets/sizzle-reel-2.script.txt'), 'utf8'));
  for (const [type, name, value] of MOMENTS) {
    const m = ReelScript.parse(src).marks.find(k => k.kind === 'scene' && k.obj.type === type);
    src = ReelScript.setCue(src, m.ln, name, value);
  }
  writeFileSync(join(ROOT, TEMP), src);
  const cued = ReelScript.parse(src).edit.scenes;
  MOMENTS.forEach(([type, name, value]) => ok(ReelScript.cue(cued.find(s => s.type === type), name) === value, `temp script: ${type} reads cue ${name} ${value}`));
  const P = ReelScript.parse(plain), SP = ReelScript.spans(P.edit);
  const when = ([type, , , off]) => { const sp = SP[P.edit.scenes.findIndex(x => x.type === type)]; return +(off < 0 ? sp.end + off : sp.start + off).toFixed(2); };
  const at = MOMENTS.map(when).join(',');
  const a = render(join(SCRATCH, 'cued'), at, ['--script=' + TEMP]);
  const b = render(join(SCRATCH, 'dflt'), at, ['--script=' + PLAIN]);
  MOMENTS.forEach(([type, name, value], i) => {
    const t = when(MOMENTS[i]);
    const d = a[i] && b[i] ? pixdiff(a[i], b[i]) : { n: 0 };
    ok(d.n >= 2000, `${type} at ${t} s differs with cue ${name} ${value}: ${d.n} pixels (${a[i]} vs ${b[i]})`);
  });
} catch (e) {
  ok(false, e.message);
} finally {
  rmSync(join(ROOT, TEMP), { force: true });
  rmSync(join(ROOT, PLAIN), { force: true });
}
console.log(fails ? `\n${fails} failed` : '\nall passed');
process.exit(fails ? 1 : 0);
