// The music under the timeline (scripts/reel-timeline.js, drawing and editing the synth rack's
// score: scripts/reel-rack.js), end to end: a real dev server, the rig in Chromium, real clicks,
// drags and keys, and the files on disk as the judge.
//   node "Agent Reference/reel-tests/musiclanestest.mjs"
// Works on temp copies (Assets/zz-mlane-test.script.txt and .score.txt, played through ?script=),
// removed in finally with the dev server's backups of them.
//   1. the music's own time: a ruler of bars (as many as the reel has), its time signature, the
//      chords on the bars, a marker for every scene's cut; a lane per part, each clip on its bars
//      to 2 px, every note of a part drawn once in its clips, the drums in rows (kick at the foot)
//   2. a clip's right edge dragged two bars on (one line: "CLIP lead 2-6 hook 0.5"), its left edge a
//      bar back, a clip moved a bar, a fade dragged in, a level dragged up: each one line of the
//      score; an edge drawn to a scene's cut when it comes near one (the lead's title clip ends
//      on the answer's cut, bar 4 beat 3)
//   3. double-click an empty stretch: a new clip of the part's pad, up to the next clip; ⌘D a copy
//      after it; ⌫ takes it out; the pad tiles in the clip's inspector switch its pad
//   4. a lane's name opens its pads: the one chosen is what a new clip gets
//   5. one Undo for both files: a scene's edge dragged, then a clip; Ctrl+Z takes back the clip,
//      Ctrl+Z again the edge; Ctrl+Shift+Z gives the edge back, and Ctrl+Z takes it again
//   6. M mutes a part (all its sounds, the engine's, never the file's) and dims its lane; S solos;
//      the cues: a box per question with its words, a tick per key, an Enter each, a select-all
//      per clear, a dot per pop; their M mutes every sound effect; a click on a question or a pop
//      plays from just before it
//   7. the chevron shuts the music to its ruler and chords; shut stays shut after a reload by
//      hand, and opens again
//   8. a short window: the panel stops where the preview would get too small, its lanes scroll up
//      and down under a ruler that stays, and the M and S column moves with them
//   9. no edit reloads the page; no page errors
import { spawn } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const NAME = 'zz-mlane-test.script.txt', SCRIPT = path.join(ROOT, 'Assets', NAME), SCORE = SCRIPT.replace(/\.script\.txt$/, '.score.txt');
const BACKUPS = path.join(ROOT, '.local', 'reel-backups');
const ORIG = fs.readFileSync(path.join(ROOT, 'Assets/sizzle-reel-2.script.txt'), 'utf8');
const ORIG_SCORE = fs.readFileSync(path.join(ROOT, 'Assets/sizzle-reel-2.score.txt'), 'utf8');
let fails = 0, passes = 0;
const check = (ok, what, extra = '') => { if (ok) passes++; else fails++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${ok || !extra ? '' : '  (' + extra + ')'}`); };
const script = () => fs.readFileSync(SCRIPT, 'utf8'), score = () => fs.readFileSync(SCORE, 'utf8');
const clipLines = (text, part) => text.split('\n').filter(l => l.startsWith('CLIP ' + part + ' ')).map(l => l.replace(/\s+/g, ' ').trim());
const freePort = () => new Promise(r => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
// wait until fn(file) holds (saves are debounced and written by the dev server)
const until = async (fn, ms = 6000) => { const t0 = Date.now(); for (;;) { if (fn()) return true; if (Date.now() - t0 > ms) return false; await sleep(80); } };

let child, browser;
try {
  fs.writeFileSync(SCRIPT, ORIG); fs.writeFileSync(SCORE, ORIG_SCORE);
  const port = await freePort();
  child = spawn(process.execPath, [path.join(ROOT, 'scripts/reel-dev.mjs'), `--port=${port}`], { stdio: ['ignore', 'pipe', 'pipe'] });
  const base = await new Promise((resolve, reject) => {
    let out = '';
    const t = setTimeout(() => reject(new Error('no listening line in 5 s: ' + out)), 5000);
    child.stdout.on('data', d => { out += d; const m = /^reel-dev: (http:\/\/127\.0\.0\.1:\d+)\//m.exec(out); if (m) { clearTimeout(t); resolve(m[1]); } });
    child.stderr.on('data', d => { out += d; });
    child.on('exit', c => reject(new Error('server exited ' + c + ': ' + out)));
  });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(), headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1, colorScheme: 'dark' });
  await ctx.route(/\.mp4(\?.*)?$/i, r => r.fulfill({ status: 404, body: '' }));           // the clips do not matter here
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const ready = () => page.waitForFunction(() => window.REEL_LIVE && window.REEL_TIMELINE && window.REEL_RACK && window.REEL_RACK.parsed
    && document.querySelector('#reel-tl .tl-mbar') && !document.getElementById('boot'), null, { timeout: 60000 });
  await page.goto(`${base}/Assets/sizzle-reel-2.html?script=${NAME}#t=27&pause=1`);
  await ready();
  await page.evaluate(() => { window.__mark = true; sessionStorage.removeItem('reel-tl-music'); });
  if (await page.evaluate(() => document.getElementById('reel-tl').hidden)) await page.keyboard.press('e');
  await page.evaluate(() => REEL_TIMELINE.music.open(true));
  await sleep(300);
  // a clip's box, found by its part and where it starts (in steps)
  const clipBox = (part, from) => page.evaluate(([p, f]) => {
    const A = REEL_RACK.arrangement, c = A.clips.find(x => x.part === p && x.from === f);
    const el = c && document.querySelector(`#reel-tl .tl-mk[data-ln="${c.ln}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, ln: c.ln };
  }, [part, from]);
  const pxs = await page.evaluate(() => document.querySelector('#reel-tl .tl-lane').clientWidth / REEL_LIVE.duration);
  const BAR = 2 * pxs, BEAT = BAR / 4;
  // a drag in small steps, as a hand does
  const dragBy = async (x, y, dx, dy, opt = {}) => {
    await page.mouse.move(x, y);
    const mod = opt.shift ? 'Shift' : opt.alt ? 'Alt' : null;
    if (mod) await page.keyboard.down(mod);
    await page.mouse.down();
    for (let k = 1; k <= 10; k++) await page.mouse.move(x + dx * k / 10, y + dy * k / 10);
    await page.mouse.up();
    if (mod) await page.keyboard.up(mod);
  };

  // 1 ── the music's own time, and the clips on it
  const geo = await page.evaluate(() => {
    const r = e => e.getBoundingClientRect(), lane = document.querySelector('#reel-tl .tl-lane'), x0 = r(lane).left, pxs = lane.clientWidth / REEL_LIVE.duration;
    const A = REEL_RACK.arrangement, P = REEL_RACK.parsed;
    const fish = [...document.querySelectorAll('#reel-tl .tl-fl')].reduce((b, e) => Math.max(b, r(e).bottom), 0);
    const barEls = [...document.querySelectorAll('#reel-tl .tl-mbar')];
    const clips = A.clips.map(c => { const el = document.querySelector(`#reel-tl .tl-mk[data-ln="${c.ln}"]`); return el ? { l: r(el).left - x0, rt: r(el).right - x0, want: c.t0 * pxs, wantR: Math.min(c.t1, REEL_LIVE.duration) * pxs, part: c.part } : null; });
    const shapes = part => { const svg = document.querySelector(`#reel-tl svg.tl-mroll[data-track="${part}"]`); return svg ? [...svg.querySelectorAll('path.tl-n')].flatMap(p => (p.getAttribute('d') || '').match(/M[^M]*/g) || []) : []; };
    const drawn = Object.fromEntries(P.score.parts.map(p => [p.name, shapes(p.name).length]));
    const evs = Object.fromEntries(P.score.parts.map(p => [p.name, A.events.filter(e => p.tracks.includes(e.track)).length]));
    // the drums' rows: the kick's ticks sit lowest, the hat's highest
    const svg = document.querySelector('#reel-tl svg.tl-mroll[data-track="drums"]');
    const ys = { kick: [], hat: [] };
    if (svg) {
      const beat = A.clips.find(c => c.part === 'drums' && c.pad === 'beat' && c.from === 176);
      const kick = A.events.filter(e => e.track === 'kick' && e.t >= beat.t0 && e.t < beat.t1).map(e => e.t * pxs);
      const hat = A.events.filter(e => e.track === 'hat' && e.t >= beat.t0 && e.t < beat.t1).map(e => e.t * pxs);
      shapes('drums').forEach(d => { const m = /^M([\d.]+) ([\d.]+)/.exec(d); if (!m) return; const xx = +m[1], yy = +m[2]; if (kick.some(k => Math.abs(k - xx) < 0.2)) ys.kick.push(yy); else if (hat.some(k => Math.abs(k - xx) < 0.2)) ys.hat.push(yy); });
    }
    return { fish, bars: barEls.length, wantBars: A.bars, sig: (document.querySelector('#reel-tl .tl-msig') || {}).textContent,
      chords: document.querySelectorAll('#reel-tl .tl-mch').length, runs: A.harmony.filter((h, i, all) => !i || h.chord.name !== all[i - 1].chord.name).length,
      cuts: document.querySelectorAll('#reel-tl .tl-mcutl').length, scenes: REEL_LIVE.parsed.edit.scenes.length,
      rulerTop: r(document.querySelector('#reel-tl .tl-mruler')).top,
      lanes: [...document.querySelectorAll('#reel-tl .tl-mlane')].map(e => e.dataset.part).join(), parts: P.score.parts.map(p => p.name).join(),
      clips, drawn, evs, kickY: Math.min(...ys.kick), hatY: Math.max(...ys.hat), nk: ys.kick.length, nh: ys.hat.length };
  });
  check(geo.bars === geo.wantBars && geo.sig === '4/4 · 120' && geo.rulerTop > geo.fish && geo.chords === geo.runs && geo.cuts === geo.scenes - 1,
    `the music's own time under the fish: ${geo.bars} bars on its ruler, "${geo.sig}", the chords on the bars (${geo.chords}), a marker at each of the ${geo.cuts} cuts`, JSON.stringify(geo).slice(0, 300));
  const placed = geo.clips.every(c => c && Math.abs(c.l - c.want) <= 2 && Math.abs(c.rt - (c.wantR - 2)) <= 2);
  check(geo.lanes === geo.parts && placed, `a lane per part (${geo.lanes}), and each of the ${geo.clips.length} clips on its bars to 2 px`, JSON.stringify(geo.clips.filter(c => !c || Math.abs(c.l - c.want) > 2).slice(0, 3)));
  check(Object.keys(geo.evs).every(n => geo.drawn[n] === geo.evs[n] && geo.evs[n] > 0), `every note of every part drawn once in its clips (${Object.entries(geo.drawn).map(([n, k]) => `${n} ${k}`).join(', ')})`, JSON.stringify({ drawn: geo.drawn, evs: geo.evs }));
  check(geo.nk > 10 && geo.nh > 10 && geo.kickY > geo.hatY, `the drums in rows, as a drum grid: the kick's ticks at the foot, the hat's at the top (${geo.nk} kicks, ${geo.nh} hats)`);

  // 2 ── edges, a move, a fade, a level: each one line of the score
  const s00 = score();
  let b = await clipBox('lead', 16);                          // the title's lead: bars 2-4
  await dragBy(b.x + b.w - 2, b.y + b.h / 2, 2 * BAR, 0);
  check(await until(() => clipLines(score(), 'lead')[0] === 'CLIP lead 2-6 hook 0.5'), `its right edge two bars on: "${clipLines(score(), 'lead')[0]}"`);
  b = await clipBox('lead', 16);
  await dragBy(b.x + 2, b.y + b.h / 2, -BAR, 0);
  check(await until(() => clipLines(score(), 'lead')[0] === 'CLIP lead 1-6 hook 0.5'), `its left edge a bar back: "${clipLines(score(), 'lead')[0]}"`);
  b = await clipBox('fx', 64);                                // the crash on bar 5
  await dragBy(b.x + b.w / 2, b.y + b.h / 2, BAR, 0);
  check(await until(() => clipLines(score(), 'fx')[0] === 'CLIP fx 6 crash 0.7'), `a clip moved a bar on: "${clipLines(score(), 'fx')[0]}"`);
  b = await clipBox('arp', 96);                               // the art's arp: bars 7-11
  await page.mouse.move(b.x + b.w / 2, b.y + b.h / 2);       // its fade handles show on hover
  await dragBy(b.x + 4, b.y - 1, 2 * BEAT, 0);
  check(await until(() => clipLines(score(), 'arp')[0] === 'CLIP arp 7-11 updown 0.7 in 2'), `its fade in dragged two beats: "${clipLines(score(), 'arp')[0]}"`);
  b = await clipBox('bass', 64);                              // the answer's bass: bars 5-6
  await dragBy(b.x + b.w / 2, b.y + b.h - 4, 0, -20);
  check(await until(() => clipLines(score(), 'bass')[1] === 'CLIP bass 5-6 eighths 1.2'), `dragged up 20 px, its level: "${clipLines(score(), 'bass')[1]}"`);
  // an edge comes near a scene's cut and is drawn to it: on the bar grid (Shift), the title's lead
  // ends on the answer's cut (7.5 s), not on the bar line half a second on
  b = await clipBox('lead', 0);
  const cutX = await page.evaluate(() => { const r = document.querySelector('#reel-tl .tl-lane').getBoundingClientRect(); return r.left + 7.55 * (r.width / REEL_LIVE.duration); });
  await dragBy(b.x + b.w - 2, b.y + b.h / 2, cutX - (b.x + b.w + 1), 0, { shift: true });
  check(await until(() => clipLines(score(), 'lead')[0] === 'CLIP lead 1-4.3 hook 0.5'), `an edge near a cut is drawn to it, off the bar grid: "${clipLines(score(), 'lead')[0]}" (the answer cuts at 7.5 s, the end of bar 4's beat 3)`);
  const editsN = 6;
  for (let i = 0; i < editsN; i++) { await page.keyboard.press('Control+z'); await sleep(120); }
  check(await until(() => score() === s00), `${editsN} undos: the score as it was, byte for byte`);

  // 3 ── a new clip, a copy, its pad, gone
  const s0 = score();
  const lane = await page.evaluate(() => { const e = document.querySelector('#reel-tl .tl-mlane[data-part="drums"]').getBoundingClientRect(); return { y: e.y + e.height / 2 }; });
  const xAt = t => page.evaluate(t => { const r = document.querySelector('#reel-tl .tl-lane').getBoundingClientRect(); return r.left + t * (r.width / REEL_LIVE.duration); }, t);
  await page.mouse.dblclick(await xAt(46.7), lane.y);         // bar 24, in the quotes, where the drums rest
  check(await until(() => clipLines(score(), 'drums').includes('CLIP drums 24-26 beat')), `double-click an empty stretch: a new clip of the drums' last pad, to the next clip ("CLIP drums 24-26 beat")`);
  const order = clipLines(score(), 'drums').map(l => l.split(' ')[2]).join(' ');
  check(order === '5-6 7-9.2 9.3-10 11 12-17 18-20 21-23.2 24-26 27 28-30.1', `written among the drums' clips in the order they play (${order})`);
  const sel = await page.evaluate(() => { const A = REEL_RACK.arrangement, c = A.clips.find(x => x.part === 'drums' && x.from === 368); return c && REEL_TIMELINE.music.selected === c.ln; });
  check(sel, 'and it is the one selected');
  b = await clipBox('drums', 368);
  await page.mouse.click(b.x + b.w / 2, b.y + b.h / 2);       // a click: the inspector
  await page.waitForSelector('#reel-tl .tl-insp-col:not([hidden]) .tl-pad[data-pad="half"]');
  await page.locator('#reel-tl .tl-insp-col .tl-pad[data-pad="half"]').click();
  check(await until(() => clipLines(score(), 'drums').includes('CLIP drums 24-26 half')), 'a pad tile in its inspector switches its pad ("half")');
  await page.locator('#reel-tl .tl-insp-col input[aria-label="level"]').evaluate(e => { e.value = '0.6'; e.dispatchEvent(new Event('change')); });
  check(await until(() => clipLines(score(), 'drums').includes('CLIP drums 24-26 half 0.6')), 'its level slider writes its level ("0.6")');
  const before = score();
  await page.keyboard.press('Control+d');
  await sleep(500);
  const said = await page.evaluate(() => document.querySelector('#reel-tl .tl-err').textContent);
  check(score() === before && /no room/.test(said), `no room for a copy before the fill on bar 27: ⌘D says so ("${said}") and writes nothing`);
  await page.keyboard.press('Delete');
  check(await until(() => !clipLines(score(), 'drums').some(l => l.includes(' 24-26 '))), '⌫ takes the selected clip out');
  b = await clipBox('fx', 432);                               // the crash on bar 28: room after it
  await page.mouse.click(b.x + b.w / 2, b.y + b.h / 2);
  await page.keyboard.press('Control+d');
  check(await until(() => clipLines(score(), 'fx').includes('CLIP fx 29 crash')), `⌘D: a copy right after it ("CLIP fx 29 crash")`);
  await page.keyboard.press('Delete');
  check(await until(() => !clipLines(score(), 'fx').includes('CLIP fx 29 crash')), 'and ⌫ the copy');
  for (let i = 0; i < 6; i++) { await page.keyboard.press('Control+z'); await sleep(120); }
  check(await until(() => score() === s0), 'six undos: the score as it was');
  await page.keyboard.press('Escape');

  // 4 ── a lane's name: its pads, and the one a new clip gets
  await page.locator('#reel-tl button.tl-mlb[data-track="bass"]').click();
  await page.waitForSelector('#reel-tl .tl-insp-col:not([hidden]) .tl-pad[data-pad="pulse"]');
  const tiles = await page.evaluate(() => [...document.querySelectorAll('#reel-tl .tl-insp-col .tl-pad')].map(e => e.dataset.pad + (e.querySelector(':scope > svg path') ? '+' : '')).join(' '));
  check(tiles === 'eighths+ pulse+ long+', `the bass's name opens its pads, each drawn (${tiles})`);
  await page.locator('#reel-tl .tl-insp-col .tl-pad[data-pad="pulse"]').click();
  const bl = await page.evaluate(() => { const e = document.querySelector('#reel-tl .tl-mlane[data-part="bass"]').getBoundingClientRect(); return e.y + e.height / 2; });
  await page.mouse.dblclick(await xAt(1.2), bl);              // bar 1, before the bass starts
  check(await until(() => clipLines(score(), 'bass')[0] === 'CLIP bass 1 pulse'), `the pad chosen is what a new clip gets ("${clipLines(score(), 'bass')[0]}")`);
  await page.keyboard.press('Control+z');
  check(await until(() => score() === s0), 'Ctrl+Z: the score as it was');
  await page.keyboard.press('Escape');

  // 5 ── one Undo for both files
  const sA = script(), mA = score();
  const g = await page.locator('#reel-tl .tl-sc[data-scene="2"] .tl-grip').boundingBox();
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
  await page.keyboard.down('Shift'); await page.mouse.down();
  for (let k = 1; k <= 8; k++) await page.mouse.move(g.x + g.width / 2 + 0.5 * pxs * k / 8, g.y + g.height / 2);
  await page.mouse.up(); await page.keyboard.up('Shift');
  const s1ok = await until(() => /^SCENE answer 5\s/m.test(script()));
  const s1 = script();
  b = await clipBox('lead', 176);                             // the results' lead: bars 12-17
  await dragBy(b.x + b.w - 2, b.y + b.h / 2, -BAR, 0);
  const m1ok = await until(() => clipLines(score(), 'lead')[1] === 'CLIP lead 12-16 hook out 2');
  check(s1ok && m1ok, `a scene's edge dragged (the script: "SCENE answer 5"), then a clip's ("${clipLines(score(), 'lead')[1]}")`);
  await page.keyboard.press('Control+z');
  check(await until(() => score() === mA) && script() === s1, 'Ctrl+Z takes back the clip: the score as it was, byte for byte, the script still edited');
  await page.keyboard.press('Control+z');
  check(await until(() => script() === sA) && score() === mA, 'Ctrl+Z again takes back the edge: the script as it was, byte for byte');
  await page.keyboard.press('Control+Shift+z');
  check(await until(() => script() === s1) && score() === mA, 'Ctrl+Shift+Z gives the edge back');
  await page.keyboard.press('Control+z');
  check(await until(() => script() === sA) && score() === mA, 'and Ctrl+Z takes it again: both files as they were');

  // 6 ── mute and solo, the cues
  const mix = () => page.evaluate(() => {
    const E = REEL_RACK.engine, dim = p => [...document.querySelectorAll(`#reel-tl .tl-mk[data-part="${p}"]`)].every(e => e.classList.contains('tl-mute'));
    return { mutes: [...E.mutes].sort().join(), solos: [...E.solos].sort().join(), drumsDim: dim('drums'), bassDim: dim('bass'), leadDim: dim('lead'),
      mOn: document.querySelector('#reel-tl .tl-mms[data-track="drums"] button').classList.contains('tl-on') };
  });
  await page.locator('#reel-tl .tl-mms[data-track="drums"] button').first().click();
  await sleep(150);
  let mx = await mix();
  check(mx.mutes === 'clap,hat,kick' && mx.drumsDim && !mx.bassDim && mx.mOn && score() === mA, 'M mutes the drums (kick, clap and hat) in the engine, lights M and dims their clips; the score is untouched', JSON.stringify(mx));
  await page.locator('#reel-tl .tl-mms[data-track="drums"] button').first().click();
  await page.locator('#reel-tl .tl-mms[data-track="lead"] button').nth(1).click();
  await sleep(150);
  mx = await mix();
  check(!mx.mutes && mx.solos === 'lead' && !mx.leadDim && mx.bassDim && mx.drumsDim, 'M again unmutes; S solos the lead and dims every other part', JSON.stringify(mx));
  await page.locator('#reel-tl .tl-mms[data-track="lead"] button').nth(1).click();
  const cues = await page.evaluate(() => {
    const A = REEL_RACK.arrangement, Q = ReelScript.queries(REEL_LIVE.parsed.edit), n = sel => document.querySelectorAll('#reel-tl ' + sel).length;
    return { questions: Q.length, clears: Q.filter(q => isFinite(q.clear)).length, keys: A.events.filter(e => e.track === 'keys').length, pops: A.events.filter(e => e.track === 'pop').length,
      boxes: n('.tl-mq'), ticks: n('.tl-mkt'), enters: n('.tl-mke2'), selects: n('.tl-mks'), dots: n('.tl-mpd'),
      texts: [...document.querySelectorAll('#reel-tl .tl-mq')].map(e => e.textContent).join('|') === Q.map(q => q.text).join('|') };
  });
  check(cues.boxes === cues.questions && cues.texts && cues.ticks === cues.keys && cues.keys > 100 && cues.enters === cues.questions && cues.selects === cues.clears && cues.dots === cues.pops && cues.pops > 4,
    `the cues: each of the ${cues.questions} questions with its words, a tick per key (${cues.ticks}), an Enter each, a select-all per clear (${cues.selects}), a dot per pop (${cues.dots})`, JSON.stringify(cues));
  await page.locator('#reel-tl .tl-mms[data-track="*cues"] button').first().click();
  await sleep(150);
  const fxm = await page.evaluate(() => ({ mutes: [...REEL_RACK.engine.mutes].sort().join(), fx: REEL_RACK.parsed.score.tracks.filter(t => t.on).map(t => t.name).sort().join() }));
  await page.locator('#reel-tl .tl-mms[data-track="*cues"] button').first().click();
  await sleep(150);
  check(fxm.mutes === fxm.fx && await page.evaluate(() => REEL_RACK.engine.mutes.size) === 0, `the cues' M mutes every sound effect (${fxm.mutes}); again, and they sound`);
  const q2 = page.locator('#reel-tl .tl-mq').nth(1), qt = +(await q2.getAttribute('data-t'));
  await q2.click(); await sleep(150);
  let now = await page.evaluate(() => REEL_LIVE.now());
  check(Math.abs(now - (qt - 0.3)) < 0.05, `a click on the second question plays from just before its typing (${qt} s → ${now.toFixed(2)} s)`);
  const pd = page.locator('#reel-tl .tl-mpd').nth(1), pt = +(await pd.getAttribute('data-t'));
  await pd.click(); await sleep(150);
  now = await page.evaluate(() => REEL_LIVE.now());
  check(Math.abs(now - (pt - 0.4)) < 0.05, `a click on the second pop (${pt} s) plays from just before it (${now.toFixed(2)} s)`);

  // 7 ── shut, a reload, open
  const hOpen = await page.evaluate(() => document.getElementById('reel-tl').getBoundingClientRect().height);
  const lanesH = await page.evaluate(() => { const t = document.querySelector('#reel-tl .tl-mlane').getBoundingClientRect().top, q = [...document.querySelectorAll('#reel-tl .tl-mms')].pop().getBoundingClientRect().bottom; return q - t + 4; });
  await page.locator('#reel-tl button.tl-mtog').click();
  await sleep(200);
  const shut = await page.evaluate(() => ({ h: document.getElementById('reel-tl').getBoundingClientRect().height, clips: document.querySelectorAll('#reel-tl .tl-mk').length,
    bars: document.querySelectorAll('#reel-tl .tl-mbar').length, exp: document.querySelector('#reel-tl button.tl-mtog').getAttribute('aria-expanded') }));
  check(shut.clips === 0 && shut.bars === geo.bars && shut.exp === 'false' && Math.abs(hOpen - shut.h - lanesH) <= 3,
    `the chevron shuts the music to its ruler and chords: ${Math.round(hOpen)} → ${Math.round(shut.h)} px, the lanes' height`, JSON.stringify({ shut, lanesH }));
  await page.reload();
  await ready();
  const after = await page.evaluate(() => ({ opened: REEL_TIMELINE.music.opened, clips: document.querySelectorAll('#reel-tl .tl-mk').length }));
  check(!after.opened && after.clips === 0, 'shut stays shut after a reload by hand');
  await page.evaluate(() => { window.__mark = true; });
  if (await page.evaluate(() => document.getElementById('reel-tl').hidden)) await page.keyboard.press('e');
  await page.locator('#reel-tl button.tl-mtog').click();
  await sleep(200);
  check(await page.evaluate(() => document.querySelectorAll('#reel-tl .tl-mk').length) === geo.clips.length, 'and the chevron opens it again');

  // 8 ── a short window: the lanes scroll under a ruler that stays
  await page.setViewportSize({ width: 1440, height: 640 });
  await sleep(400);
  const tall = await page.evaluate(async () => {
    const tl = document.getElementById('reel-tl'), view = tl.querySelector('.tl-view');
    const st = document.getElementById('stage').getBoundingClientRect();
    const out = { vs: tl.classList.contains('tl-vs'), h: tl.getBoundingClientRect().height, stageH: st.height, sh: view.scrollHeight, ch: view.clientHeight };
    view.scrollTop = view.scrollHeight;
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const r = e => e.getBoundingClientRect();
    out.scrolled = view.scrollTop;
    out.rulerTop = r(tl.querySelector('.tl-ruler')).top - r(view).top;
    const lb = tl.querySelector('.tl-mlb[data-track="cues"]'), row = tl.querySelector('.tl-mms[data-track="*cues"]');
    out.rowVsLane = Math.round(r(row).top - r(lb).top);
    out.inView = r(lb).bottom <= r(view).bottom + 1 && r(lb).top >= r(view).top;
    return out;
  });
  check(tall.vs && tall.sh > tall.ch && tall.stageH >= 150, `a 640 px window: the panel stops at ${Math.round(tall.h)} px (the preview keeps ${Math.round(tall.stageH)} px) and its lanes scroll`, JSON.stringify(tall));
  check(tall.scrolled > 0 && Math.abs(tall.rulerTop) <= 1 && tall.inView && Math.abs(tall.rowVsLane) <= 2,
    'scrolled to the last lane: the ruler stays on top, and the last lane\'s M and S sit beside it', JSON.stringify(tall));
  await page.setViewportSize({ width: 1600, height: 1000 });

  // 9 ── no reloads, no errors
  check(await page.evaluate(() => !!window.__mark), 'no edit reloaded the page');
  check(errors.length === 0, 'no page errors', errors.join(' | '));
} catch (e) {
  check(false, 'the run: ' + e.message);
} finally {
  if (browser) await browser.close();
  if (child) child.kill();
  for (const f of [SCRIPT, SCORE]) fs.rmSync(f, { force: true });
  try { for (const f of fs.readdirSync(BACKUPS)) if (f.includes('zz-mlane-test')) fs.rmSync(path.join(BACKUPS, f), { force: true }); } catch (e) { /* none */ }
}
console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
