// Words on the stage, changed where they stand (scripts/reel-text.js): a real dev server, the rig
// in Chromium, real double-clicks and typing, and the script file on disk as the judge.
//   node "Agent Reference/reel-tests/texttest.mjs"
// Works on a temp copy of the script (Assets/zz-text-test.script.txt, played through ?script=),
// removed in finally with the dev server's backups of it.
//   1. paused, every line the script wrote is tagged with its script line; a render tags nothing
//   2. the pointer over a line shows its outline; a double-click edits it in place, and Enter
//      writes that one line of the script, played at once (no reload)
//   3. a part of a line: a stat's label, an award's words, a result's title (the rest of the line
//      as it was), a quote's line keeping its emphasis, a cite's role, the title's name (drawn
//      letter by letter), the question in the bar
//   4. Esc puts the words back and writes nothing; a | in a part refused, the line as it was
//   5. ⌘Z (the timeline shut) takes an edit back, byte for byte
//   6. no reload, no page errors
import { spawn } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const NAME = 'zz-text-test.script.txt', TMP = path.join(ROOT, 'Assets', NAME);
const BACKUPS = path.join(ROOT, '.local', 'reel-backups');
const ORIG = fs.readFileSync(path.join(ROOT, 'Assets/sizzle-reel-2.script.txt'), 'utf8');
let fails = 0, passes = 0;
const check = (ok, what, extra = '') => { if (ok) passes++; else fails++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${ok || !extra ? '' : '  (' + extra + ')'}`); };
const file = () => fs.readFileSync(TMP, 'utf8');
const line = ln => file().split('\n')[ln - 1];
const freePort = () => new Promise(r => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const sleep = ms => new Promise(r => setTimeout(r, ms));

let child, browser;
try {
  fs.writeFileSync(TMP, ORIG);
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
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1, colorScheme: 'dark' });
  await ctx.route(/\.mp4(\?.*)?$/i, r => r.fulfill({ status: 404, body: '' }));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}/Assets/sizzle-reel-2.html?script=${NAME}#t=10&pause=1`);
  await page.waitForFunction(() => window.REEL_LIVE && window.REEL_TEXT && window.REEL_TIMELINE && !document.getElementById('boot'), null, { timeout: 60000 });
  await page.evaluate(() => { window.__mark = true; });
  const P = await page.evaluate(() => REEL_LIVE.parsed.fields.map(f => ({ ln: f.ln, key: f.key, kind: f.kind, index: f.index, scene: REEL_LIVE.parsed.edit.scenes.indexOf(f.owner) })));
  const scenes = await page.evaluate(() => REEL_LIVE.scenes.map(s => ({ type: s.type, start: s.start, end: s.end })));
  // the first moment in a scene when a tagged line (ln, part) is all the way in (not still sliding
  // out of its clip), the reel paused there
  async function showing(type, ln, part = 'all') {
    const sc = scenes.find(s => s.type === type);
    for (let t = sc.start + 0.5; t < sc.end - 0.2; t += 0.25) {
      const hit = await page.evaluate(([t, ln, part]) => { REEL_LIVE.setPlaying(false); REEL_LIVE.seek(t); return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => {
        if (!REEL_TEXT.lines().some(l => l.ln === ln && (l.part || 'all') === part)) return r(false);
        const el = [...document.querySelectorAll(`#stage [data-ln="${ln}"]`)].find(x => (x.dataset.part || 'all') === part);
        const li = el.querySelector(':scope > .li'); if (!li) return r(true);
        const a = el.getBoundingClientRect(), b = li.getBoundingClientRect();
        r(b.top >= a.top - 1 && b.bottom <= a.bottom + 1);
      }))); }, [+t.toFixed(2), ln, part]);
      if (hit) { await sleep(150); return t; }
    }
    throw new Error(`${type}: line ${ln} (${part}) never comes all the way in`);
  }
  // the tagged element's centre, in client px
  const centre = (ln, part = 'all') => page.evaluate(([ln, part]) => {
    const t = [...document.querySelectorAll(`#stage [data-ln="${ln}"]`)].find(x => (x.dataset.part || 'all') === part);
    const r = (t.querySelector(':scope > .li') || t).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, [ln, part]);
  // double-click a line, replace its words, Enter; wait until the edit is played and kept
  async function retype(ln, part, text, how = 'all') {
    const c = await centre(ln, part);
    const v0 = await page.evaluate(() => REEL_LIVE.version);
    await page.mouse.move(c.x, c.y); await sleep(80);
    await page.mouse.dblclick(c.x, c.y); await sleep(80);
    const on = await page.evaluate(() => REEL_TEXT.editing);   // never type into the preview's keys
    if (!on || on.ln !== ln) throw new Error(`line ${ln} (${part}): a double-click did not start editing it (${JSON.stringify(on)})`);
    if (how === 'all') { await page.keyboard.press('Control+a'); await page.keyboard.type(text); }
    else if (how === 'end') { await page.keyboard.press('End'); await page.keyboard.type(text); }
    await page.keyboard.press('Enter');
    await page.waitForFunction(v => REEL_LIVE.version > v, v0, { timeout: 8000 }).catch(() => {});
    await page.evaluate(() => REEL_LIVE.settled());
  }
  const fieldLn = (scene, key, index = undefined) => P.find(f => scenes[f.scene] && scenes[f.scene].type === scene && f.key === key && (index === undefined || f.index === index));

  // 1. tags
  const tagged = await page.evaluate(() => REEL_TEXT.lines());
  const ans = fieldLn('answer', 'line', 0);
  check(tagged.length >= 3 && tagged.some(l => l.ln === ans.ln), `paused in the answer, its lines are tagged with their script lines (${tagged.map(l => l.ln + ':' + l.part).join(' ')})`);
  const renderTags = await (async () => {
    const p2 = await ctx.newPage();
    await p2.goto(`${base}/Assets/sizzle-reel-2.html?render=1&script=${NAME}`);
    await p2.waitForFunction(() => window.REEL, null, { timeout: 60000 });
    const n = await p2.evaluate(() => document.querySelectorAll('[data-ln]').length);
    await p2.close();
    return n;
  })();
  check(renderTags === 0, 'a render tags nothing: its markup is as it always was', renderTags);

  // 2. hover and the first edit: the answer's first line
  await showing('answer', ans.ln);
  let c = await centre(ans.ln);
  await page.mouse.move(c.x, c.y); await sleep(120);
  const hov = await page.evaluate(() => ({ box: !document.getElementById('reel-tx-box').hidden, tip: document.getElementById('reel-tx-tip').textContent, cursor: REEL_LIVE.stage.style.cursor }));
  check(hov.box && /double-click/.test(hov.tip) && hov.cursor === 'text', 'the pointer over a line outlines it and says to double-click', JSON.stringify(hov));
  await retype(ans.ln, 'all', 'Freehand drawing');
  check(line(ans.ln).trim() === 'line     Freehand drawing', 'double-click, type, Enter: the answer\'s line is written to the file', line(ans.ln));
  const shown = await page.evaluate(ln => { const t = document.querySelector(`#stage [data-ln="${ln}"] .li`); return t && t.textContent; }, ans.ln);
  check(shown === 'Freehand drawing' && await page.evaluate(() => !!window.__mark), 'and the stage shows it at once, in place', shown);

  // 3. parts of lines
  const stat = fieldLn('answer', 'stat', 0), st0 = line(stat.ln);
  await showing('answer', stat.ln, 'label');
  await retype(stat.ln, 'label', 'years of design');
  check(line(stat.ln).replace(/\S+ years of design$/, '') === st0.replace(/\S+ [^@]*$/, '').replace(/ \d+ .*$/, ' ') || /^\s*stat\s+(@\S+\s+)?\d+ years of design$/.test(line(stat.ln)),
    `a stat's label: "${line(stat.ln).trim()}" (its @ time and number as they were)`, `${st0.trim()} → ${line(stat.ln).trim()}`);
  check(st0.trim().replace(/\S+(\s\S+)*$/, '') === line(stat.ln).trim().replace(/\S+(\s\S+)*$/, '') && st0.trim().split(/\s+/).slice(0, 3).join(' ') === line(stat.ln).trim().split(/\s+/).slice(0, 3).join(' '),
    'the stat keeps its @ time and its number', `${st0.trim()} → ${line(stat.ln).trim()}`);
  const award = fieldLn('feature', 'award', 2), aw0 = line(award.ln);
  await showing('feature', award.ln, 'text');
  await retype(award.ln, 'text', 'AsMA R&D Award');
  check(line(award.ln).trim() === aw0.trim().replace(/^(award\s+@\S+\s+\S+\s+).*$/, '$1AsMA R&D Award'), `an award's words, its time and year as they were ("${line(award.ln).trim()}")`, aw0.trim());
  const row = fieldLn('results', 'row', 0), rw0 = line(row.ln);
  await showing('results', row.ln, 'title');
  await retype(row.ln, 'title', 'Nanome 2 with MARA');
  check(line(row.ln).trim() === rw0.trim().replace(/^(row\s+[^|]+\|\s*[^|]+\|\s*)[^|]+?(\s*\|)/, '$1Nanome 2 with MARA$2'), `a result's title, the rest of its row as it was ("${line(row.ln).trim()}")`, rw0.trim());
  // a quote line with emphasis: typed at its end, the <em> kept
  // (a voice's lines and cite belong to the voice, inside the quotes scene)
  const voiced = await page.evaluate(() => { const L = REEL_LIVE, q = L.parsed.edit.scenes.find(s => s.type === 'quotes'), src = L.src.split('\n');
    const mine = f => q.quotes.includes(f.owner);
    return { em: (L.parsed.fields.find(f => mine(f) && f.key === 'line' && /<em>/.test(src[f.ln - 1])) || {}).ln, cite: (L.parsed.fields.find(f => mine(f) && f.key === 'cite') || {}).ln }; });
  const qln = { ln: voiced.em };
  const q0 = line(qln.ln);
  await showing('quotes', qln.ln);
  await retype(qln.ln, 'all', ' (yes)', 'end');
  check(line(qln.ln).trim() === q0.trim() + ' (yes)' && /<em>/.test(line(qln.ln)), `a quote's line keeps its emphasis ("${line(qln.ln).trim()}")`, q0.trim());
  const cite = { ln: voiced.cite };
  await showing('quotes', cite.ln, 'pair');
  const nm = line(cite.ln).trim().replace(/^cite\s+/, '').split(/\s*\|\s*/)[0];
  await retype(cite.ln, 'pair', `${nm} · Founder, in place`);
  check(line(cite.ln).trim() === `cite     ${nm} | Founder, in place`, `a cite's name and role ("${line(cite.ln).trim()}")`);
  const nmF = fieldLn('title', 'name');
  await showing('title', nmF.ln, 'letters');
  await retype(nmF.ln, 'letters', 'John J. Hanacek');
  check(line(nmF.ln).trim() === 'name     John J. Hanacek', `the title's name, drawn letter by letter, edited as its words ("${line(nmF.ln).trim()}")`);
  const qF = fieldLn('results', 'query');
  const res = scenes.find(s => s.type === 'results');
  await page.evaluate(t => { REEL_LIVE.setPlaying(false); REEL_LIVE.seek(t); }, res.start + 2); await sleep(300);
  const bar = await page.evaluate(() => { const q = document.querySelector('#bar .qt'); const r = q.getBoundingClientRect(); return { ln: +q.dataset.ln, x: r.left + Math.min(40, r.width / 2), y: r.top + r.height / 2 }; });
  check(bar.ln === qF.ln, 'the bar says which question it is typing', JSON.stringify(bar));
  {
    const v0 = await page.evaluate(() => REEL_LIVE.version);
    await page.mouse.dblclick(bar.x, bar.y); await sleep(80);
    await page.keyboard.press('Control+a'); await page.keyboard.type('what did he ship?'); await page.keyboard.press('Enter');
    await page.waitForFunction(v => REEL_LIVE.version > v, v0, { timeout: 8000 }).catch(() => {});
    await page.evaluate(() => REEL_LIVE.settled());
  }
  check(line(qF.ln).trim() === 'query    what did he ship?', `the question in the bar ("${line(qF.ln).trim()}")`);

  // 4. Esc, and a | refused
  const before = file();
  await showing('answer', ans.ln);
  c = await centre(ans.ln);
  await page.mouse.dblclick(c.x, c.y); await sleep(80);
  await page.keyboard.press('Control+a'); await page.keyboard.type('not this');
  await page.keyboard.press('Escape'); await sleep(300);
  const esc = await page.evaluate(ln => document.querySelector(`#stage [data-ln="${ln}"] .li`).textContent, ans.ln);
  check(file() === before && esc === 'Freehand drawing' && !(await page.evaluate(() => REEL_TEXT.editing)), 'Esc puts the words back and writes nothing', esc);
  await showing('results', row.ln, 'title');
  c = await centre(row.ln, 'title');
  await page.mouse.dblclick(c.x, c.y); await sleep(80);
  await page.keyboard.press('Control+a'); await page.keyboard.type('a | b'); await page.keyboard.press('Enter'); await sleep(400);
  const tipBad = await page.evaluate(() => document.getElementById('reel-tx-tip').textContent);
  check(file() === before && /\|/.test(tipBad), `a | in a part is refused, and says why ("${tipBad}")`);

  // 5. undo, with the timeline shut
  check(await page.evaluate(() => document.getElementById('reel-tl').hidden), 'the timeline is shut');
  for (let k = 0; k < 8; k++) {
    const v0 = await page.evaluate(() => REEL_LIVE.version);
    await page.mouse.click(5, 5);                 // focus on the page, not a line
    await page.keyboard.press('Control+z');
    await page.waitForFunction(v => REEL_LIVE.version > v, v0, { timeout: 5000 }).catch(() => {});
    await page.evaluate(() => REEL_LIVE.settled());
    if (file() === ORIG) break;
  }
  check(file() === ORIG, '⌘Z, the timeline shut, takes every edit back: the file as it began, byte for byte');

  // 6.
  check(await page.evaluate(() => !!window.__mark), 'no edit reloaded the page');
  const own = errors.filter(e => !/Failed to load|NotSupportedError|no supported source/i.test(e));
  check(!own.length, 'no page errors', own.join(' | '));
} catch (e) {
  fails++; console.log('FAIL ' + (e.stack || e));
} finally {
  if (browser) await browser.close().catch(() => {});
  if (child) child.kill();
  try { fs.unlinkSync(TMP); } catch (e) { /* not made */ }
  if (fs.existsSync(BACKUPS)) for (const b of fs.readdirSync(BACKUPS)) if (b.startsWith(NAME + '.')) fs.unlinkSync(path.join(BACKUPS, b));
}
console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
