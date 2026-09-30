// The reel script's contract: what parse() reports, the edit helpers, the cues.
//   node "Agent Reference/reel-tests/scripttest.mjs"      exits non-zero on any failure
// Works on a copy of Assets/sizzle-reel-2.script.txt in memory; writes nothing.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const RS = createRequire(import.meta.url)(resolve(ROOT, 'scripts/reel-script.js'));
const SRC0 = readFileSync(resolve(ROOT, 'Assets/sizzle-reel-2.script.txt'), 'utf8'), SRC = SRC0;

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
// the cut is as long as its scenes, on the 120 BPM grid (John sets the length in the editor: 60 s, then 63.5)
const sum = edit.scenes.reduce((a, sc) => a + sc.dur, 0);
ok(edit.scenes.length === 11 && Math.abs(total(edit) - sum) < 1e-9 && total(edit) % 0.5 === 0, `the real script parses: 11 scenes, ${total(edit)} s, whole beats at 120 BPM`);
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
  ok(e2.scenes[2].dur === 5 && Math.abs(total(e2) - (total(edit) + 5 - answer.dur)) < 1e-9, `setDur: the answer runs 5 s and the cut ${total(edit) + 5 - answer.dur} s`);
  const diff = changedLines(SRC, out);
  ok(diff.every(([, x, y]) => strip(x) === strip(y) || /^SCENE answer/.test(x)), `setDur changes the SCENE line and timecodes only (${diff.length} lines)`);
}
{
  const mara = marks.find(m => m.kind === 'beat' && m.obj.video === './nanome-mara.mp4');
  const e2 = RS.parse(RS.setAt(SRC, mara.ln, 2.1)).edit;
  ok(e2.scenes[5].items[0].beats[1].at === 2.1, 'setAt: the MARA beat moves to @2.1');
}
{
  // a stat's @ leads its words (the timeline drags it like a beat)
  const st = fields.find(f => f.key === 'stat' && f.owner === answer && f.index === 1);
  const out = RS.setAt(SRC, st.ln, 1.25);
  ok(RS.parse(out).edit.scenes[2].stats[1].at === 1.25 && changedLines(SRC, out).length === 1, 'setAt: a stat\'s @ time moves, and only its line changes');
  let refused = false; try { RS.setAt(SRC, sceneLn(2), 1); } catch (e) { refused = /no @ time/.test(e.message); }
  ok(refused, 'setAt refuses a line with no @ time');
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

// ── fish lines: directing the fish ──
// on the cut with its own fish lines taken out, so these counts are the suite's own
{
  const SRC = lines(SRC0).filter(l => !/^\s*fish\s/.test(l)).join('\n'), src = lines(SRC);
  const PB = RS.parse(SRC), sceneLn = i => PB.marks.find(m => m.kind === 'scene' && m.obj === PB.edit.scenes[i]).ln;
  const res = sceneLn(5);
  let out = RS.addLine(SRC, res, 'fish', '@0.5 big to 0.72 0.8');
  out = RS.addLine(out, res, 'fish', '@3   school   idle circle');
  out = RS.addLine(out, res, 'fish', '@4 feed 0.4 0.85');
  out = RS.addLine(out, res, 'fish', '@5 all look off');
  out = RS.addLine(out, res, 'fish', '@6 all dart');
  const P2 = RS.parse(out), f2 = P2.edit.scenes[5].fish, fl = P2.fields.filter(f => f.key === 'fish');
  ok(same(f2, [{ at: 0.5, who: 'big', verb: 'to', x: 0.72, y: 0.8 }, { at: 3, who: 'school', verb: 'idle', mode: 'circle' },
    { at: 4, verb: 'feed', x: 0.4, y: 0.85 }, { at: 5, who: 'all', verb: 'look', look: 'off' }, { at: 6, who: 'all', verb: 'dart' }]),
    'fish lines read into { at, who, verb, … }: a spot, an idle, food, a look, an action for all');
  ok(lines(out).length === src.length + 5 && fl.every(f => f.owner === P2.edit.scenes[5]), 'addLine adds one line each, in the scene');
  ok(lines(out)[fl[1].ln - 1] === '  fish     @3 school idle circle', 'addLine writes the field with its padding, spaces tidied');
  ok(same(RS.parse(RS.format(P2.edit)).edit, P2.edit), 'format then parse keeps the fish lines');
  const moved = RS.setAt(out, fl[0].ln, 1.25);
  ok(RS.parse(moved).edit.scenes[5].fish[0].at === 1.25 && changedLines(out, moved).length === 1, 'setAt moves a fish line\'s @ time, and only its line changes');
  ok(RS.removeLine(RS.removeLine(RS.removeLine(RS.removeLine(RS.removeLine(out, fl[4].ln), fl[3].ln), fl[2].ln), fl[1].ln), fl[0].ln) === SRC, 'removeLine takes them out again: back to the original, byte for byte');
  ok(/fish big to 0\.72 0\.8/.test(RS.cueSheet(P2.edit)), 'the cue sheet lists the fish lines at their time');
  ok(RS.writeFish(RS.readFish('@2 big pace 1.5')) === '@2 big pace 1.5', 'readFish and writeFish round-trip');
  ok(same(RS.readFish('@4 big to auto'), { at: 4, who: 'big', verb: 'to', auto: true }) && RS.writeFish(RS.readFish('@4 big to auto')) === '@4 big to auto',
    '"to auto" sends a fish back to the scene\'s own spot, and round-trips');
  throws(() => RS.addLine(SRC, res, 'fish', '1.5 big to 0.5 0.5'), /an @ time, who/, 'a fish line needs its @ time');
  throws(() => RS.addLine(SRC, res, 'fish', '@1 fish to 0.5 0.5'), /say big, school or all/, 'who is named');
  throws(() => RS.addLine(SRC, res, 'fish', '@1 big swim'), /not something the fish do/, 'an unknown verb is named');
  throws(() => RS.addLine(SRC, res, 'fish', '@1 big to 1.4 0.5'), /between 0 and 1/, 'a point is a fraction of the frame');
  throws(() => RS.addLine(SRC, res, 'fish', '@1 school dart'), /only the big fish can dart/, 'the school does not dart');
  throws(() => RS.addLine(SRC, res, 'fish', '@1 big scatter'), /only the school can scatter/, 'the big fish does not scatter');
  throws(() => RS.addLine(SRC, res, 'fish', '@1 big feed 0.3 0.3'), /names no fish/, 'feed names no fish');
  throws(() => RS.addLine(SRC, res, 'fish', '@1 big idle dance'), /hover, sweep, circle, wander/, 'the idles are named');
  throws(() => RS.addLine(SRC, res, 'fish', '@1 big pace 9'), /between 0.3 and 3/, 'the pace is bounded');
  throws(() => RS.addLine(SRC, res, 'fish', '@1 big look 0.5'), /auto .* or off/, 'look takes a point, auto or off');
  throws(() => RS.removeLine(SRC, sceneLn(5)), /opens a part/, 'removeLine refuses a SCENE line');
  const late = RS.parse(RS.addLine(SRC, res, 'fish', '@40 big turn'));
  ok(late.warnings.some(w => /fish @40 is outside its scene/.test(w)), 'a fish line past its scene\'s end is a warning');
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
