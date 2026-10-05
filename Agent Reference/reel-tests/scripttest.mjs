// The reel script's contract: what parse() reports, the edit helpers, the cues.
//   node "Agent Reference/reel-tests/scripttest.mjs"      exits non-zero on any failure
// Works on a copy of Assets/sizzle-reel-2.script.txt in memory; writes nothing.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { inOrder } from './inorder.mjs';   // the scenes in the order the suite was written for

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const RS = createRequire(import.meta.url)(resolve(ROOT, 'scripts/reel-script.js'));
const SRC0 = inOrder(readFileSync(resolve(ROOT, 'Assets/sizzle-reel-2.script.txt'), 'utf8')), SRC = SRC0;

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
// the cut is as long as its scenes (John sets the lengths in the editor: 60 s, then 63.5, then 61.75)
const sum = edit.scenes.reduce((a, sc) => a + sc.dur, 0);
ok(edit.scenes.length === 11 && Math.abs(total(edit) - sum) < 1e-9, `the real script parses: 11 scenes, ${total(edit)} s`);
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
ok(thesis && answer.lines[0] && src[thesis.ln - 1].includes(answer.lines[0]), 'the answer\'s first line is found by owner, key and index');

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
  // (found again by its clip, not its place: the item has cut-in beats around it since 2026-10-05)
  ok(e2.scenes[5].items[0].beats.some(b => b.video === './nanome-mara.mp4' && b.at === 2.1), 'setAt: the MARA beat moves to @2.1');
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

  // A line holds until the next line of its kind for that fish, or its `auto`, and no further
  // than its scene's end, unless it carries (`carry`): then on past the cut.
  // (scenes: 4 command, 5 results, 6 feature, 7 logos)
  const lnIn = (src, i) => { const Q = RS.parse(src); return Q.marks.find(m => m.kind === 'scene' && m.obj === Q.edit.scenes[i]).ln; };
  let h = RS.addLine(SRC, lnIn(SRC, 4), 'fish', '@1 big idle circle carry');
  h = RS.addLine(h, lnIn(h, 4), 'fish', '@2 all to 0.3 0.8');
  h = RS.addLine(h, lnIn(h, 4), 'fish', '@2.5 big pace 0.6 carry');
  h = RS.addLine(h, lnIn(h, 6), 'fish', '@1 big idle sweep');
  h = RS.addLine(h, lnIn(h, 7), 'fish', '@0.5 big auto');
  const PH = RS.parse(h), SPH = RS.spans(PH.edit), END = SPH[SPH.length - 1].end, HS = RS.fishHolds(PH.edit);
  const held = (verb, who, i) => HS.find(x => x.c.verb === verb && x.who === who && (i == null || x.i === i));
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  const circle = held('idle', 'big', 4), sweep = held('idle', 'big', 6), toBig = held('to', 'big'), toSchool = held('to', 'school'), pace = held('pace', 'big');
  ok(toBig && toSchool && near(toBig.t1, SPH[4].end) && toBig.by === 'cut' && near(toSchool.t1, SPH[4].end),
    'a line stops at its scene\'s end: the command\'s "all to" holds to the cut, for both fish');
  ok(circle && circle.c.carry && near(circle.t0, SPH[4].start + 1) && near(circle.t1, SPH[6].start + 1) && circle.by === 'line' && circle.end.i === 6,
    `a line that carries runs on past the cut: the command's circle holds through results, to the feature's sweep (${circle && circle.t0} → ${circle && circle.t1})`);
  ok(sweep && near(sweep.t1, SPH[6].end) && sweep.by === 'cut', 'the feature\'s sweep, not carried, stops at its own cut');
  ok(pace && near(pace.t1, SPH[7].start + 0.5) && pace.by === 'line', 'a carried pace runs on until the logos\' "big auto"');
  ok(HS.length === 5 && !HS.some(x => x.c.verb === 'auto'), 'one hold per line and fish (the "all" line twice); an auto holds nothing itself');
  const sheet = RS.cueSheet(PH.edit);
  ok(/fish big idle circle carry {2}→ \d:\d/.test(sheet) && /fish big idle sweep {2}→ \d:\d/.test(sheet) && /fish all to 0\.3 0\.8 {2}→ \d:[\d.]+\n/.test(sheet),
    'the cue sheet says where each line stops holding');
  // carried to the reel's end when nothing changes it
  const PE = RS.parse(RS.addLine(SRC, lnIn(SRC, 9), 'fish', '@1 school idle circle carry')), HE = RS.fishHolds(PE.edit)[0];
  ok(HE && HE.by === 'reel' && near(HE.t1, RS.spans(PE.edit).slice(-1)[0].end) && /school idle circle carry {2}→ the end/.test(RS.cueSheet(PE.edit)), 'with nothing after it, a carried line holds to the reel\'s end');
  // at one moment, an auto comes first: "auto, then sweep" sweeps, whatever order they are written in
  const PA = RS.parse(RS.addLine(h, lnIn(h, 6), 'fish', '@1 big auto')), HA = RS.fishHolds(PA.edit);
  ok(near(HA.find(x => x.c.verb === 'idle' && x.i === 6).t1, SPH[6].end) && near(HA.find(x => x.c.verb === 'pace').t1, SPH[6].start + 1),
    'an auto and a line at one moment: the auto first, so the sweep holds and the carried pace ends there');
  // moving a line across a cut: out of its scene, into the other
  const cl = PH.fields.find(f => f.key === 'fish' && f.owner === PH.edit.scenes[4] && f.owner.fish[f.index].verb === 'idle').ln;
  const mv = RS.moveFish(h, cl, 5, 2), PM = RS.parse(mv);
  ok(lines(mv).length === lines(h).length && PM.edit.scenes[4].fish.length === 2 && PM.edit.scenes[5].fish.some(c => c.verb === 'idle' && c.at === 2 && c.mode === 'circle' && c.carry),
    'moveFish takes a line across a cut: out of the command scene, into results at @2, still carrying');
  ok(RS.moveFish(h, cl, 4, 3) === RS.setAt(h, cl, 3), 'moveFish in its own scene is a retime');
  // the ways back, and carry
  ok(RS.writeFish(RS.readFish('@1 big auto')) === '@1 big auto' && RS.writeFish(RS.readFish('@1 school idle auto')) === '@1 school idle auto'
    && RS.writeFish(RS.readFish('@2 all look 0.5 0.4 carry')) === '@2 all look 0.5 0.4 carry', '"big auto", "idle auto" and "… carry" read and round-trip');
  throws(() => RS.readFish('@1 big auto now'), /auto takes nothing after it/, 'auto takes nothing after it');
  throws(() => RS.readFish('@1 auto'), /say which fish/, 'auto names its fish');
  throws(() => RS.readFish('@1 big dart carry'), /happens once/, 'a once verb has nothing to carry');
  throws(() => RS.readFish('@1 big auto carry'), /holds nothing to carry/, 'auto has nothing to carry');
  ok(RS.RESET.to === 'to auto' && RS.RESET.look === 'look auto' && RS.RESET.idle === 'idle auto' && RS.RESET.pace === 'pace 1', 'each kind has its way back (RESET)');
}

// ── cues: defaults are the rig's own timing ──
// (asked of each scene without the cues the script gives it: John sets some, open and title's out)
const S = t => Object.assign({}, edit.scenes.find(s => s.type === t), { cues: {} });
ok(RS.cue(S('open'), 'out') === 0.45 && RS.cue(S('title'), 'out') === 0.65 && RS.cue(S('answer'), 'out') === 0.32, 'out defaults: open 0.45, title 0.65, answer 0.32');
ok(RS.cue(S('results'), 'out') === 0.34 && RS.cue(S('quotes'), 'out') === 0.34 && RS.cue(S('offer'), 'out') === 0.34, 'out defaults: results, quotes, offer 0.34');
ok(RS.cue(S('answer'), 'in') === 0.04 && RS.cue(S('answer'), 'typing') === 40, 'in 0.04 and typing 40 by default');
ok(RS.cueNames('title').join() === 'arrive,out,leave,ease' && RS.cueNames('end').join() === 'arrive,ease' && RS.cueNames('answer').join() === 'typing,in,arrive,out,leave,ease', 'which scenes have which cues');
ok(RS.cue(S('answer'), 'arrive') === 0.6 && RS.cue(S('answer'), 'leave') === 0.3 && RS.cue(S('answer'), 'ease') === 'own', 'arrive 0.6, leave 0.3 and ease own by default: the rig\'s own');

// ── transitions for every scene: cue lines above the first SCENE ──
{
  let r = RS.setReelCue(SRC, 'arrive', 0.4);
  r = RS.setReelCue(r, 'ease', 'cubic');
  const PR = RS.parse(r), first = PR.marks.find(m => m.kind === 'scene').ln;
  ok(same(PR.edit.cues, { arrive: 0.4, ease: 'cubic' }) && lines(r).slice(0, first).filter(l => /^cue\s/.test(l)).length === 2 && changedLines(SRC, r).length >= 1,
    'setReelCue writes cue lines above the first scene, after the seed');
  const ans = PR.edit.scenes.find(x => x.type === 'answer');
  ok(RS.cue(ans, 'arrive', PR.edit) === 0.4 && RS.cue(ans, 'ease', PR.edit) === 'cubic' && RS.cue(ans, 'arrive') === 0.6, 'a scene without its own takes every scene\'s (passed the edit)');
  const own = RS.parse(RS.setCue(r, PR.marks.find(m => m.obj === ans).ln, 'arrive', 0.2)).edit;
  ok(RS.cue(own.scenes.find(x => x.type === 'answer'), 'arrive', own) === 0.2, 'a scene\'s own cue still wins');
  ok(same(RS.parse(RS.format(PR.edit)).edit, PR.edit), 'format then parse keeps the cues for every scene');
  ok(RS.setReelCue(RS.setReelCue(r, 'arrive', null), 'ease', null) === SRC, 'and taken out again: back to the original, byte for byte');
  ok(RS.queries(RS.parse(RS.setReelCue(SRC, 'typing', 20)).edit)[0].typed > RS.queries(edit)[0].typed + 0.2, 'a typing cue for every scene types every question slower');
  throws(() => RS.parse('cue fast 1\nSCENE open 2\n  caption x\n  reveal y'), /there is no "fast" cue/, 'a cue for every scene must be one of the cues');
  throws(() => RS.setReelCue(SRC, 'ease', 'bouncy'), /one of own, expo, cubic, sine, back, linear/, 'the ease is one of its words');
  throws(() => RS.setReelCue(SRC, 'arrive', 0.01), /at least 0.05/, 'an arrival takes 0.05 s at least');
}

// ── the scenes in another order ──
{
  const ks = src => RS.parse(src).edit.scenes.map(x => x.type).join(' ');
  const m1 = RS.moveScene(SRC, 2, 7);
  ok(ks(m1) === 'open title art command results feature logos answer quotes offer end', 'moveScene puts a scene somewhere else: the answer after the logos');
  ok(RS.moveScene(m1, 7, 2) === SRC, 'and back again: the original, byte for byte');
  const P1 = RS.parse(m1), a1 = P1.edit.scenes[7];
  ok(same(a1, edit.scenes[2]), 'the scene goes with all its lines: words, stats, cues and fish');
  ok(Math.abs(RS.spans(P1.edit).slice(-1)[0].end - total(edit)) < 1e-9 && /SCENE answer 4\.5\s+\[0:3\d/.test(m1), 'the cut is as long as before, and the timecodes are refreshed');
  const d1 = RS.duplicateScene(SRC, 3), Pd = RS.parse(d1);
  ok(Pd.edit.scenes.length === 12 && Pd.edit.scenes[3].type === 'art' && Pd.edit.scenes[4].type === 'art' && same(Pd.edit.scenes[3], Pd.edit.scenes[4]), 'duplicateScene puts a copy right after it');
  const r1 = RS.removeScene(SRC, 7), Pr = RS.parse(r1);
  ok(Pr.edit.scenes.length === 10 && !Pr.edit.scenes.some(x => x.type === 'logos'), 'removeScene takes one out');
  throws(() => RS.removeScene('SCENE end 2\n  board offer\n  line x', 0), /at least one scene/, 'the last scene is not taken out');
  throws(() => RS.moveScene(SRC, 0, 11), /no scene 12/, 'a scene that is not there is named');
  const noted = SRC.replace(/\nSCENE art /, '\n# the art, as a note\nSCENE art ');
  const mn = RS.moveScene(noted, 3, 9);
  ok(/# the art, as a note\nSCENE art /.test(mn) && ks(mn).endsWith('offer art end'), 'a note written right above a scene goes with it');
}

// ── mistakes are named, by line ──
throws(() => RS.parse(SRC.replace('  name     John Hanacek', '  name     John Hanacek\n  cue      typing 30')), /title scene has no typing cue/, 'a title has no typing cue');
throws(() => RS.parse(SRC.replace('  query    who is john?', '  query    who is john?\n  cue      nope 1')), /there is no "nope" cue/, 'an unknown cue is named');
throws(() => RS.parse(SRC.replace('  query    who is john?', '  query    who is john?\n  cue      in 1\n  cue      in 2')), /already given/, 'a cue given twice');
throws(() => RS.setDur(SRC, sceneLn(5), 10), /items run 11 s but the scene is 10 s/, 'setDur refuses a results scene shorter than its items');
throws(() => RS.setField(SRC, sceneLn(2), 'x'), /not a field/, 'setField refuses a SCENE line');

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
