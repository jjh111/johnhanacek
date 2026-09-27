// The reel script's contract: what parse() reports, the edit helpers, the cues.
//   node "Agent Reference/reel-tests/scripttest.mjs"      exits non-zero on any failure
// Works on a copy of Assets/sizzle-reel-2.script.txt in memory; writes nothing.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const RS = createRequire(import.meta.url)(resolve(ROOT, 'scripts/reel-script.js'));
const SRC = readFileSync(resolve(ROOT, 'Assets/sizzle-reel-2.script.txt'), 'utf8');

let failed = 0;
const ok = (cond, what) => { console.log(`${cond ? 'pass' : 'FAIL'}  ${what}`); if (!cond) failed++; };
const throws = (fn, re, what) => { try { fn(); ok(false, what + ' (did not throw)'); } catch (e) { ok(re.test(e.message), `${what}: ${e.message.split('\n')[0]}`); } };
const canon = v => Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])])) : v;
const same = (x, y) => JSON.stringify(canon(x)) === JSON.stringify(canon(y));
const lines = s => s.split('\n');
const changedLines = (a, b) => lines(a).map((l, i) => [i + 1, l, lines(b)[i]]).filter(([, x, y]) => x !== y);
const strip = l => l.replace(/\s*\[[^\]]*\]\s*$/, '');   // a line without its computed timecode

// ── reading ──
const P = RS.parse(SRC);
const { edit, marks, fields } = P;
const total = e => RS.spans(e).slice(-1)[0].end;
ok(edit.scenes.length === 11 && total(edit) === 60, `the real script parses: 11 scenes, ${total(edit)} s`);
ok(same(RS.parse(RS.format(edit)).edit, edit), 'format then parse gives the same edit');
ok(RS.retime(SRC) === SRC, 'retime leaves a fresh script unchanged');
ok(marks.every(m => ['scene', 'item', 'beat'].includes(m.kind) && m.scene), 'every mark has a kind and its scene');
ok(marks.filter(m => m.kind === 'scene').length === 11 && marks.filter(m => m.kind === 'item').length === 3, 'marks: 11 scenes, 3 items');
// every field line says where its value lives, and the value there is that line's words
const src = lines(SRC);
const bad = fields.filter(f => {
  const words = src[f.ln - 1].trim().replace(/^\S+\s*/, '');
  const v = f.index == null ? f.owner[f.jsonKey] : f.owner[f.jsonKey][f.index];
  if (f.kind === 'lines' || f.kind === 'str') return v !== words;
  if (f.kind === 'cue') return false;
  return v == null;
});
ok(fields.length > 100 && bad.length === 0, `${fields.length} field lines, each pointing at its own value${bad.length ? ' (bad: ' + bad.map(f => f.ln).join(',') + ')' : ''}`);
const answer = edit.scenes[2], thesis = fields.find(f => f.owner === answer && f.key === 'line' && f.index === 0);
ok(thesis && src[thesis.ln - 1].includes('Freehand expression'), 'the answer\'s first line is found by owner, key and index');

// ── changing a script one line at a time ──
const sceneLn = i => marks.find(m => m.kind === 'scene' && m.obj === edit.scenes[i]).ln;
{
  const out = RS.setDur(SRC, sceneLn(2), 5);
  const e2 = RS.parse(out).edit;
  ok(e2.scenes[2].dur === 5 && total(e2) === 60.5, 'setDur: the answer runs 5 s and the cut 60.5 s');
  const diff = changedLines(SRC, out);
  ok(diff.every(([, x, y]) => strip(x) === strip(y) || /^SCENE answer/.test(x)), `setDur changes the SCENE line and timecodes only (${diff.length} lines)`);
}
{
  const mara = marks.find(m => m.kind === 'beat' && m.obj.video === './nanome-mara.mp4');
  const e2 = RS.parse(RS.setAt(SRC, mara.ln, 2.1)).edit;
  ok(e2.scenes[5].items[0].beats[1].at === 2.1, 'setAt: the MARA beat moves to @2.1');
}
{
  const out = RS.setField(SRC, thesis.ln, 'Freehand   drawing ');
  const diff = changedLines(SRC, out);
  ok(RS.parse(out).edit.scenes[2].lines[0] === 'Freehand drawing' && diff.length === 1, 'setField: one line changes, spaces tidied');
  ok(/^ {2}line {5}Freehand drawing$/.test(diff[0][2]), 'setField keeps the field name and its padding');
}
{
  const withCue = RS.setCue(SRC, sceneLn(2), 'out', 0.5);
  const sc = RS.parse(withCue).edit.scenes[2];
  ok(sc.cues && sc.cues.out === 0.5 && RS.cue(sc, 'out') === 0.5, 'setCue adds "cue out 0.5" to the answer');
  ok(changedLines(SRC, withCue).length > 0 && lines(withCue).length === src.length + 1, 'setCue adds exactly one line');
  const moved = RS.setCue(withCue, sceneLn(2), 'out', 0.7);
  ok(RS.parse(moved).edit.scenes[2].cues.out === 0.7 && lines(moved).length === lines(withCue).length, 'setCue rewrites an existing cue in place');
  ok(RS.setCue(moved, sceneLn(2), 'out', null) === SRC, 'setCue with null removes it: back to the original, byte for byte');
}

// ── cues: defaults are the rig's own timing ──
const S = t => edit.scenes.find(s => s.type === t);
ok(RS.cue(S('open'), 'out') === 0.45 && RS.cue(S('title'), 'out') === 0.65 && RS.cue(S('answer'), 'out') === 0.32, 'out defaults: open 0.45, title 0.65, answer 0.32');
ok(RS.cue(S('results'), 'out') === 0.34 && RS.cue(S('quotes'), 'out') === 0.34 && RS.cue(S('offer'), 'out') === 0.34, 'out defaults: results, quotes, offer 0.34');
ok(RS.cue(S('answer'), 'in') === 0.04 && RS.cue(S('answer'), 'typing') === 40, 'in 0.04 and typing 40 by default');
ok(RS.cueNames('title').join() === 'out' && RS.cueNames('end').length === 0 && RS.cueNames('answer').join() === 'typing,in,out', 'which scenes have which cues');

// ── mistakes are named, by line ──
throws(() => RS.parse(SRC.replace('  name     John Hanacek', '  name     John Hanacek\n  cue      typing 30')), /title scene has no typing cue/, 'a title has no typing cue');
throws(() => RS.parse(SRC.replace('  query    who is john?', '  query    who is john?\n  cue      nope 1')), /there is no "nope" cue/, 'an unknown cue is named');
throws(() => RS.parse(SRC.replace('  query    who is john?', '  query    who is john?\n  cue      in 1\n  cue      in 2')), /already given/, 'a cue given twice');
throws(() => RS.setDur(SRC, sceneLn(5), 10), /items run 11 s but the scene is 10 s/, 'setDur refuses a results scene shorter than its items');
throws(() => RS.setField(SRC, sceneLn(2), 'x'), /not a field/, 'setField refuses a SCENE line');

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
