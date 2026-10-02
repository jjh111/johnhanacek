// An edit, in place (REEL_LIVE.apply / save in Assets/sizzle-reel-2.html): the film is built again
// inside the running page and nothing reloads.
//   node "Agent Reference/reel-tests/applytest.mjs"
// A real dev server, the real rig in Chromium, temp copies of the script (Assets/zz-apply-*.script.txt,
// removed in finally with the dev server's backups of them). Clips are refused (both pages show the
// same empty windows), and the tank is hidden for the picture checks (the fish swim on their own
// clock); everything else is compared to the pixel.
//   1. a text edit and a timing edit, applied in place, draw the very frame a fresh load of the
//      edited script draws at the same moment (the answer, and a moment in the results)
//   2. nothing leaks: one section per scene, one tier group per query, one <video> per clip slot,
//      and the clips of an edit that leaves them alone are the same elements, still loaded
//   3. an edit is quick: it takes a small fraction of a second, where a reload took the whole page
//   4. the tank: a fish line keeps it swimming (the same big fish); an edit that moves the school's
//      birth past the playhead takes the school out and leaves the big fish swimming; food written
//      at the playhead drops at once
//   4b. scrubbing: back and forth after the school's birth, the same fish swim on (nothing taken
//      out or put back, nothing regrown); back past its birth the school is taken out, forward
//      again it is drawn in; scrubbing over the end card's taps drops no food, playing through
//      them does
//   5. the clock: playing stays playing and keeps its time; a loop stays on its scene; a cut shorter
//      than the playhead brings the playhead to its end
//   6. a script with a mistake is refused and nothing changes
//   7. another editor's save (the file changed on disk) plays here in place; this page's own save
//      coming back from the dev server changes nothing
//   8. no page errors
import { spawn } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { inOrder } from './inorder.mjs';   // the scenes in the order the suite was written for

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const RS = createRequire(import.meta.url)(path.join(ROOT, 'scripts/reel-script.js'));
const A = 'zz-apply-a.script.txt', B = 'zz-apply-b.script.txt';
const BACKUPS = path.join(ROOT, '.local', 'reel-backups');
const ORIG = inOrder(fs.readFileSync(path.join(ROOT, 'Assets/sizzle-reel-2.script.txt'), 'utf8'));
let fails = 0, passes = 0;
const check = (ok, what, extra = '') => { if (ok) passes++; else fails++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${ok || !extra ? '' : '  (' + extra + ')'}`); };
const freePort = () => new Promise(r => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const P0 = RS.parse(ORIG), sceneLn = type => P0.marks.find(m => m.kind === 'scene' && m.obj.type === type).ln;
const spans = src => RS.spans(RS.parse(src).edit);
const at = (src, type, s) => spans(src)[RS.parse(src).edit.scenes.findIndex(x => x.type === type)].start + s;

let child, browser;
try {
  fs.writeFileSync(path.join(ROOT, 'Assets', A), ORIG);
  const port = await freePort();
  child = spawn(process.execPath, [path.join(ROOT, 'scripts/reel-dev.mjs'), `--port=${port}`], { stdio: ['ignore', 'pipe', 'pipe'] });
  const base = await new Promise((resolve, reject) => {
    let out = '';
    const t = setTimeout(() => reject(new Error('no listening line in 5 s: ' + out)), 5000);
    child.stdout.on('data', d => { out += d; const m = /^reel-dev: (http:\/\/127\.0\.0\.1:\d+)\//m.exec(out); if (m) { clearTimeout(t); resolve(m[1]); } });
    child.stderr.on('data', d => { out += d; });
    child.on('exit', c => reject(new Error('server exited ' + c + ': ' + out)));
  });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(), headless: true });
  const errors = [];
  const open = async (name, hash) => {
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1200 }, deviceScaleFactor: 1, colorScheme: 'dark' });
    await ctx.route(/\.mp4(\?.*)?$/i, r => r.fulfill({ status: 404, body: '' }));
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/Assets/sizzle-reel-2.html?script=${name}#${hash}`);
    await page.waitForFunction(() => window.REEL_LIVE && window.REEL_TIMELINE && window.REEL_FISH && !document.getElementById('boot'), null, { timeout: 60000 });
    await page.evaluate(() => { window.__mark = true; });
    return { ctx, page };
  };
  // the picture without the fish (they swim on their own clock) and without the HUD
  const still = async page => {
    await page.evaluate(() => { ['tank', 'chip', 'chipLead'].forEach(id => { document.getElementById(id).style.visibility = 'hidden'; }); });
    await page.evaluate(() => Promise.all([...document.querySelectorAll('#scenes img')].map(i => i.decode().catch(() => null))));
    await sleep(400);
    return (await page.locator('#stage').screenshot()).toString('base64');
  };
  // pixels that differ between two PNGs, counted in a page
  const diff = (page, a, b) => page.evaluate(async ([a, b]) => {
    const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = 'data:image/png;base64,' + s; });
    const [ia, ib] = await Promise.all([load(a), load(b)]);
    if (ia.width !== ib.width || ia.height !== ib.height) return -1;
    const c = document.createElement('canvas'); c.width = ia.width; c.height = ia.height;
    const g = c.getContext('2d');
    g.drawImage(ia, 0, 0); const da = g.getImageData(0, 0, c.width, c.height).data;
    g.clearRect(0, 0, c.width, c.height); g.drawImage(ib, 0, 0); const db = g.getImageData(0, 0, c.width, c.height).data;
    let n = 0; for (let i = 0; i < da.length; i += 4) if (da[i] !== db[i] || da[i + 1] !== db[i + 1] || da[i + 2] !== db[i + 2]) n++;
    return n;
  }, [a, b]);

  // ── 1. the same frame as a fresh load ─────────────────────────────────
  // a text edit (the answer's first line) and a timing edit before it (the title half a second
  // longer), then a picture moved in the results
  const S1 = RS.setField(RS.setDur(ORIG, sceneLn('title'), P0.edit.scenes.find(s => s.type === 'title').dur + 0.5),
    P0.fields.find(f => f.key === 'line' && f.owner.type === 'answer').ln, 'Freehand drawing, in place');
  const T1 = +at(S1, 'answer', 2.2).toFixed(2);
  const { ctx: cA, page: pA } = await open(A, `t=${T1}&pause=1`);
  const t0 = await pA.evaluate(async s => { const t = performance.now(); const r = REEL_LIVE.apply(s); await new Promise(res => setTimeout(res, 0)); return { r, ms: performance.now() - t }; }, S1);
  check(t0.r.ok && !t0.r.restocked, 'a text and a timing edit apply in place', JSON.stringify(t0.r));
  const imgA = await still(pA);
  fs.writeFileSync(path.join(ROOT, 'Assets', B), S1);
  const { ctx: cB, page: pB } = await open(B, `t=${T1}&pause=1`);
  const imgB = await still(pB);
  const d1 = await diff(pB, imgA, imgB);
  check(d1 === 0, `in place, the answer draws the frame a fresh load of the edited script draws (${d1} pixels differ at ${T1} s)`, d1);
  // a picture moved: the results' second item's first beat, later
  const P1 = RS.parse(S1), beat = P1.marks.filter(m => m.kind === 'beat' && m.scene.type === 'results')[3];
  const S2 = RS.setAt(S1, beat.ln, +(beat.obj.at + 0.5).toFixed(2));
  const T2 = +at(S2, 'results', 7.4).toFixed(2);
  await pA.evaluate(([s, t]) => { REEL_LIVE.apply(s); REEL_LIVE.seek(t); }, [S2, T2]);
  const imgA2 = await still(pA);
  fs.writeFileSync(path.join(ROOT, 'Assets', B), S2);
  await cB.close();                                // (a new page: a goto that changes only the #hash would not load again)
  const { ctx: cB2, page: pB2 } = await open(B, `t=${T2}&pause=1`);
  const imgB2 = await still(pB2);
  const d2 = await diff(pB2, imgA2, imgB2);
  check(d2 === 0, `and so does the results scene after a moment is moved (${d2} pixels differ at ${T2} s)`, d2);
  await cB2.close();
  await pA.evaluate(() => ['tank', 'chip', 'chipLead'].forEach(id => { document.getElementById(id).style.visibility = ''; }));

  // ── 2. nothing leaks; the clips are kept ──────────────────────────────
  const count = () => pA.evaluate(() => ({ segs: document.querySelectorAll('#scenes > .seg').length, scenes: REEL_LIVE.scenes.length,
    tiers: document.querySelectorAll('#tiers > .tg').length, queries: ReelScript.queries(REEL_LIVE.parsed.edit).length,
    videos: document.querySelectorAll('video').length, slots: REEL_LIVE.parsed.fields.filter(f => f.key === 'video').length,
    stray: [...document.querySelectorAll('video')].filter(v => !v.closest('#scenes')).length }));
  const c1 = await count();
  check(c1.segs === c1.scenes && c1.tiers === c1.queries && c1.videos === c1.slots && !c1.stray,
    `one section per scene, one tier group per query, one clip element per clip slot (${c1.segs}/${c1.scenes}, ${c1.tiers}/${c1.queries}, ${c1.videos}/${c1.slots})`, JSON.stringify(c1));
  const kept = await pA.evaluate(s => {
    const before = [...document.querySelectorAll('video')];
    before.forEach((v, i) => { v.__n = i; });
    REEL_LIVE.apply(s);
    const after = [...document.querySelectorAll('video')];
    return { n: after.length, same: after.filter(v => before.includes(v)).length };
  }, RS.setField(S2, P1.fields.find(f => f.key === 'line' && f.owner.type === 'answer').ln, 'Freehand drawing, twice'));
  check(kept.n === c1.videos && kept.same === kept.n, `an edit that leaves the clips alone keeps every clip element, still loaded (${kept.same} of ${kept.n})`, JSON.stringify(kept));
  // ten edits in a row, then the same counts
  await pA.evaluate(s => { const RS_ = ReelScript, P = RS_.parse(s), ln = P.marks.find(m => m.kind === 'scene' && m.obj.type === 'answer').ln;
    let x = s; for (let k = 1; k <= 10; k++) { x = RS_.setDur(x, ln, 4.5 + k * 0.05); REEL_LIVE.apply(x); } }, S2);
  const c2 = await count();
  check(c2.segs === c1.segs && c2.tiers === c1.tiers && c2.videos === c1.videos && !c2.stray, 'after ten edits in a row, the same counts: nothing piles up', JSON.stringify(c2));

  // ── 3. quick ──────────────────────────────────────────────────────────
  const ms = await pA.evaluate(s => { const out = [];
    for (let k = 0; k < 6; k++) { const t = performance.now(); REEL_LIVE.apply(ReelScript.setField(s, ReelScript.parse(s).fields.find(f => f.key === 'line' && f.owner.type === 'answer').ln, 'Freehand ' + k)); out.push(performance.now() - t); }
    return out.sort((a, b) => a - b)[3]; }, S2);
  check(ms < 250, `an edit takes ${ms.toFixed(0)} ms in place (the median of six)`, ms.toFixed(0));

  // ── 4. the tank ───────────────────────────────────────────────────────
  await pA.evaluate(s => REEL_LIVE.apply(s), ORIG);
  const T4 = +at(ORIG, 'results', 3).toFixed(2);
  await pA.evaluate(t => { REEL_LIVE.seek(t); REEL_LIVE.setPlaying(false); }, T4);
  await sleep(500);
  const res4 = sceneLn('results');
  const fishEdit = await pA.evaluate(([s, ln]) => {
    const big = REEL_LIVE.debug.big(), g = REEL_LIVE.debug.regrows;
    const r = REEL_LIVE.apply(ReelScript.addLine(s, ln, 'fish', '@0.5 big idle circle'));
    return { r, same: REEL_LIVE.debug.big() === big && !!big, regrows: REEL_LIVE.debug.regrows - g };
  }, [ORIG, res4]);
  check(fishEdit.r.ok && !fishEdit.r.restocked && fishEdit.same && fishEdit.regrows === 0, 'a fish line keeps the tank swimming: the same big fish, nothing taken out or put in', JSON.stringify(fishEdit));
  const food = await pA.evaluate(([s, ln, t]) => {
    const n0 = REEL_LIVE.debug.tank.state.food.length, sc = REEL_LIVE.scenes.find(x => x.type === 'results');
    const r = REEL_LIVE.apply(ReelScript.addLine(REEL_LIVE.src, ln, 'fish', `@${(Math.floor((t - sc.start) / 0.05) * 0.05).toFixed(2)} feed 0.5 0.8`));
    return { r, n0, n1: REEL_LIVE.debug.tank.state.food.length };
  }, [ORIG, res4, T4]);
  check(food.r.ok && food.n1 === food.n0 + 1, `food written at the playhead drops at once (${food.n0} → ${food.n1} pieces)`, JSON.stringify(food));
  // the school is born in the command scene; half a second after its first fish, lengthen the
  // scene before it: the birth moves past the playhead, and the school is taken out (only it)
  const cmd = spans(ORIG)[P0.edit.scenes.findIndex(s => s.type === 'command')];
  const born = await pA.evaluate(() => REEL_LIVE.fish.born.school);
  await pA.evaluate(t => REEL_LIVE.seek(t), born + 0.5);
  await sleep(300);
  const restock = await pA.evaluate(s => {
    const before = REEL_LIVE.fish.now().school, big = REEL_LIVE.debug.big(), g = REEL_LIVE.debug.regrows;
    const r = REEL_LIVE.apply(s);
    window.__big4 = big;
    return { r, before: before && before.n, born: REEL_LIVE.fish.born.school, now: REEL_LIVE.now(), regrows: REEL_LIVE.debug.regrows - g };
  }, RS.setDur(ORIG, sceneLn('art'), P0.edit.scenes.find(s => s.type === 'art').dur + 2));
  await sleep(300);
  const after4 = await pA.evaluate(() => ({ school: REEL_LIVE.fish.now().school, big: !!window.__big4 && REEL_LIVE.debug.big() === window.__big4, n: REEL_LIVE.debug.tank.state.fish.length }));
  check(restock.r.ok && restock.r.restocked && restock.before >= 1 && !after4.school && after4.big && after4.n === 1 && restock.regrows === 0 && restock.born > restock.now,
    `an edit that moves the school's birth past the playhead takes the school out; the big fish swims on (born at ${restock.born.toFixed(2)} s, the playhead ${restock.now.toFixed(2)} s)`, JSON.stringify({ restock, after4, cmd }));

  // ── 4b. scrubbing ─────────────────────────────────────────────────────
  await pA.evaluate(s => REEL_LIVE.apply(s), ORIG);
  await pA.evaluate(() => { REEL_LIVE.setPlaying(false); REEL_LIVE.seek(30); });
  await sleep(300);
  const scrub = await pA.evaluate(async () => {
    const L = REEL_LIVE, tank = L.debug.tank, ids = () => tank.state.fish.map(f => f.id).join(','), g = L.debug.regrows, frame = () => new Promise(r => requestAnimationFrame(r));
    // food dropped, counted as it drops (a pellet from earlier may still be in the water)
    let dropped = 0; const add = tank.addFood; tank.addFood = (...a) => { dropped++; return add.apply(tank, a); };
    const a = ids(), food0 = dropped;
    for (let k = 0; k < 30; k++) { L.seek(24 + 12 * Math.abs(Math.sin(k * 1.7))); await frame(); }
    const b = ids(), food1 = dropped;
    const born = L.fish.born.school, big = L.debug.big();
    L.seek(born - 0.5); await frame(); await frame();
    const back = { n: tank.state.fish.length, big: L.debug.big() === big, school: !!L.fish.now().school };
    L.seek(born + 0.5); await frame(); await frame();
    const fwd = { n: tank.state.fish.length, big: L.debug.big() === big, school: L.fish.now().school && L.fish.now().school.n };
    const end = L.scenes[L.scenes.length - 1];
    const d0 = dropped;
    L.seek(end.start + 1.5); await frame(); L.seek(end.start + 3); await frame(); await frame();
    const scrubbedFood = dropped - d0;
    L.seek(end.start + 1.5); await frame(); L.setPlaying(true);
    await new Promise(r => setTimeout(r, 1300)); L.setPlaying(false);
    tank.addFood = add;
    return { same: a === b, a, food: [food0, food1], back, fwd, scrubbedFood, playedFood: dropped - d0 - scrubbedFood, regrows: L.debug.regrows - g };
  });
  check(scrub.same && scrub.regrows === 0 && scrub.food[1] === scrub.food[0], `scrubbing back and forth (30 jumps) after the school's birth: the same fish swim on, nothing regrown, no food dropped (${scrub.a})`, JSON.stringify(scrub));
  check(!scrub.back.school && scrub.back.big && scrub.back.n === 1 && scrub.fwd.school === 4 && scrub.fwd.big && scrub.fwd.n === 5,
    'back past the school\'s birth it is taken out, forward again it is drawn in; the big fish is the same fish throughout', JSON.stringify({ back: scrub.back, fwd: scrub.fwd }));
  check(scrub.scrubbedFood === 0 && scrub.playedFood >= 1, `scrubbing over the end card's taps drops no food; playing through them does (${scrub.scrubbedFood} → ${scrub.playedFood})`, JSON.stringify(scrub));

  // ── 5. the clock ──────────────────────────────────────────────────────
  await pA.evaluate(s => REEL_LIVE.apply(s), ORIG);
  await pA.evaluate(() => { REEL_LIVE.seek(30); REEL_LIVE.setPlaying(true); });
  await sleep(600);
  const play = await pA.evaluate(s => { const t0 = REEL_LIVE.now(); REEL_LIVE.apply(s); return { t0, t1: REEL_LIVE.now(), playing: REEL_LIVE.isPlaying() }; },
    RS.setField(ORIG, P0.fields.find(f => f.key === 'line' && f.owner.type === 'answer').ln, 'Freehand, playing'));
  await sleep(500);
  const play2 = await pA.evaluate(() => ({ t: REEL_LIVE.now(), playing: REEL_LIVE.isPlaying() }));
  check(play.playing && play2.playing && Math.abs(play.t1 - play.t0) < 0.1 && play2.t > play.t1 + 0.3, `playing stays playing through an edit, and its time runs on (${play.t0.toFixed(2)} → ${play2.t.toFixed(2)} s)`, JSON.stringify({ play, play2 }));
  await pA.evaluate(() => REEL_LIVE.setPlaying(false));
  await pA.keyboard.press('l');
  const loop = await pA.evaluate(s => { const i = REEL_LIVE.scenes.find(x => REEL_LIVE.now() >= x.start && REEL_LIVE.now() < x.end).i; REEL_LIVE.apply(s); return { i, loop: document.querySelector('#hud .scene').textContent }; },
    RS.setField(ORIG, P0.fields.find(f => f.key === 'line' && f.owner.type === 'answer').ln, 'Freehand, looping'));
  await sleep(200);
  const loopTxt = await pA.evaluate(() => ({ txt: document.querySelector('#hud .scene').textContent, pressed: document.querySelector('#hud [data-do="loop"]').getAttribute('aria-pressed') }));
  check(/looping/.test(loopTxt.txt) && loopTxt.pressed === 'true', 'a loop stays on its scene through an edit', JSON.stringify({ loop, loopTxt }));
  await pA.keyboard.press('l');
  const endLn = sceneLn('end'), endDur = P0.edit.scenes.find(s => s.type === 'end').dur;
  await pA.evaluate(t => REEL_LIVE.seek(t), spans(ORIG).slice(-1)[0].end - 0.2);
  const shrink = await pA.evaluate(s => { REEL_LIVE.apply(s); return { t: REEL_LIVE.now(), d: REEL_LIVE.duration }; }, RS.setDur(ORIG, endLn, endDur - 1));
  check(Math.abs(shrink.t - shrink.d) < 1e-6, `a cut that ends before the playhead brings it to the new end (${shrink.t} of ${shrink.d} s)`, JSON.stringify(shrink));

  // ── 6. a mistake ──────────────────────────────────────────────────────
  const bad = await pA.evaluate(() => { const v = REEL_LIVE.version, src = REEL_LIVE.src; const r = REEL_LIVE.apply(src.replace(/^SCENE answer \S+/m, 'SCENE answer lots')); return { r, same: REEL_LIVE.version === v && REEL_LIVE.src === src }; });
  check(!bad.r.ok && bad.r.errors && bad.r.errors.length && bad.same, `a script with a mistake is refused and nothing changes ("${bad.r.errors && bad.r.errors[0]}")`, JSON.stringify(bad));

  // ── 7. another editor's save, and this page's own ─────────────────────
  await pA.evaluate(s => REEL_LIVE.save(s).then(() => REEL_LIVE.settled()), ORIG);
  const v7 = await pA.evaluate(() => REEL_LIVE.version);
  const OTHER = RS.setField(ORIG, P0.fields.find(f => f.key === 'line' && f.owner.type === 'answer').ln, 'Freehand, from elsewhere');
  fs.writeFileSync(path.join(ROOT, 'Assets', A), OTHER);
  await pA.waitForFunction(v => REEL_LIVE.version > v, v7, { timeout: 8000 }).catch(() => {});
  const got = await pA.evaluate(() => ({ line: REEL_LIVE.parsed.edit.scenes.find(s => s.type === 'answer').lines[0], mark: !!window.__mark }));
  check(got.line === 'Freehand, from elsewhere' && got.mark, 'the file saved by another editor plays here, in place', JSON.stringify(got));
  const v8 = await pA.evaluate(async s => { await REEL_LIVE.save(s); await REEL_LIVE.settled(); return REEL_LIVE.version; }, ORIG);
  await sleep(1500);
  const v9 = await pA.evaluate(() => REEL_LIVE.version);
  check(v9 === v8 && fs.readFileSync(path.join(ROOT, 'Assets', A), 'utf8') === ORIG, 'this page\'s own save, coming back from the dev server, changes nothing', `${v8} → ${v9}`);
  check(await pA.evaluate(() => !!window.__mark), 'the page never reloaded');
  await cA.close();

  const own = errors.filter(e => !/Failed to load|NotSupportedError|no supported source/i.test(e));
  check(!own.length, 'no page errors', own.join(' | '));
} catch (e) {
  fails++; console.log('FAIL ' + (e.stack || e));
} finally {
  if (browser) await browser.close().catch(() => {});
  if (child) child.kill();
  for (const n of [A, B]) {
    try { fs.unlinkSync(path.join(ROOT, 'Assets', n)); } catch (e) { /* not made */ }
    if (fs.existsSync(BACKUPS)) for (const b of fs.readdirSync(BACKUPS)) if (b.startsWith(n + '.')) fs.unlinkSync(path.join(BACKUPS, b));
  }
}
console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
