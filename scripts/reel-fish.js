// The reel's fish, directed from the preview: the Fish panel (F) and its marks on the stage.
//
// The script's `fish` lines direct the fish scene by scene (FISH in scripts/reel-script.js, played
// by the rig's director): `fish @1.5 big to 0.72 0.8` sends the big fish to a spot, `look`,
// `idle` and `pace` say what it does there, and dart, turn, scatter, regroup and feed happen once.
// This panel writes those lines by performing them. Every control writes one line, at the
// playhead, into the scene under it, for the fish chosen at the top (the big fish, the school,
// or both):
//   paused      a press is one line, saved at once; the preview reloads at the same moment
//   playing     presses gather into a take, each at the moment it was pressed, and pausing keeps
//               the whole take in one save (Discard drops it first)
//   Go to, Look at a point, Feed   the next click on the stage says where
// The same fish doing the same kind of thing at the same moment rewrites its line rather than
// adding a second. While the panel is open the stage shows the water (where a fish can be sent)
// and this scene's spots, look points and food, numbered in time order: drag one to move it,
// click it to jump to its moment. Each save goes on the timeline's undo stack, so its Undo (and
// ⌘Z) takes a fish line back like any other edit.
// Keys while it is open: D dart, T turn, S scatter, G regroup, 1-4 hover, sweep, circle, wander;
// Esc drops a pick. F opens and shuts it. A classic script the rig injects in live mode only.
(function () {
  'use strict';
  const L = window.REEL_LIVE, RS = window.ReelScript, UI = window.REEL_UI;
  if (!L || !RS || !L.fish || !RS.writeFish || document.getElementById('reel-fish')) return;
  const [W, H] = L.frame, P = L.parsed, SC = L.scenes;
  const get = (k, d) => { try { const v = sessionStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
  const put = (k, v) => { try { sessionStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
  // the undo stacks are the timeline's (scripts/reel-timeline.js): whole script texts
  const K_OPEN = 'reel-fish-open', K_WHO = 'reel-fish-who', K_UNDO = 'reel-undo:' + L.file, K_REDO = 'reel-redo:' + L.file, DEPTH = 30;
  const q05 = x => +(Math.round(x / 0.05) * 0.05).toFixed(2);
  const f2 = x => +(Math.round(x * 100) / 100).toFixed(2);
  const fmt = s => { const m = Math.floor(s / 60 + 1e-9), r = s - m * 60; return `${m}:${r < 10 ? '0' : ''}${r.toFixed(1)}`; };
  const sceneAt = t => { let s = SC[0]; for (const x of SC) if (t >= x.start - 1e-6) s = x; return s; };
  // each scene's fish lines as written, in time order: { ln, c } (c: the line, read)
  const LINES = SC.map(() => []);
  P.fields.forEach(f => { if (f.key === 'fish') LINES[P.edit.scenes.indexOf(f.owner)].push({ ln: f.ln, c: f.owner.fish[f.index] }); });
  LINES.forEach(l => l.sort((a, b) => a.c.at - b.c.at || a.ln - b.ln));
  const WHO_NAME = { big: 'the big fish', school: 'the school', all: 'all the fish' };

  // ── style: the site's tokens, never text dimmed with alpha ────────────
  const css = document.createElement('style');
  css.textContent = `
#reel-fish { position: fixed; left: 0; top: 0; bottom: var(--reel-bottom, 0px); width: 312px; z-index: 54;   /* over the timeline (50), under the HUD (55) and its More menu */ box-sizing: border-box; display: flex; flex-direction: column;
  background: rgba(var(--surface-rgb), 0.97); border-right: 1px solid rgba(var(--cyan-dim-rgb), 0.3); font: 500 11px/1.4 var(--font-mono); color: var(--ink-quiet); }
#reel-fish[hidden], #reel-fish [hidden] { display: none !important; }
#reel-fish * { box-sizing: border-box; }
#reel-fish.fp-over { left: 8px; top: 8px; bottom: auto; width: min(312px, calc(100vw - 16px)); max-height: calc(100vh - var(--reel-bottom, 0px) - 16px);
  border: 1px solid rgba(var(--cyan-dim-rgb), 0.4); border-radius: 12px; box-shadow: 0 12px 40px var(--elevation); }
#reel-fish .fp-head { display: flex; align-items: center; gap: 8px; padding: 12px 10px 6px 14px; }
#reel-fish .fp-head .ri { color: var(--cyan); }
#reel-fish h2 { margin: 0; flex: 1; font: 300 18px/1 var(--font-display); color: var(--cyan); letter-spacing: 0.06em; }
#reel-fish .fp-body { flex: 1; overflow-y: auto; padding: 0 14px 14px; scrollbar-width: thin; }
#reel-fish .fp-where { color: var(--text-bright); }
#reel-fish .fp-now { color: var(--ink-faint); margin-top: 2px; min-height: 2.8em; }
#reel-fish .fp-seg { display: flex; margin: 8px 0 2px; border: 1px solid rgba(var(--cyan-dim-rgb), 0.35); border-radius: 7px; overflow: hidden; }
#reel-fish .fp-seg button { flex: 1; border: 0; border-radius: 0; height: 30px; justify-content: center; }
#reel-fish .fp-seg button + button { border-left: 1px solid rgba(var(--cyan-dim-rgb), 0.25); }
#reel-fish h3 { margin: 12px 0 6px; font: 600 10px/1 var(--font-mono); letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink-faint); }
#reel-fish .fp-row { display: flex; flex-wrap: wrap; gap: 5px; }
#reel-fish button { font: 500 11px/1 var(--font-mono); color: var(--text-bright); background: rgba(var(--cyan-dim-rgb), 0.08); border: 1px solid rgba(var(--cyan-dim-rgb), 0.35);
  border-radius: 6px; height: 28px; padding: 0 8px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
#reel-fish button:hover:not(:disabled), #reel-fish button:focus-visible { border-color: var(--gold); color: var(--gold); outline: none; }
#reel-fish button:disabled { color: var(--ink-faint); opacity: 0.55; cursor: default; }
#reel-fish button[aria-pressed="true"], #reel-fish button.fp-on { border-color: var(--gold); color: var(--gold); background: rgba(var(--gold-rgb), 0.12); }
#reel-fish button kbd { font: 500 9px/1 var(--font-mono); color: var(--ink-faint); border: 1px solid rgba(var(--cyan-dim-rgb), 0.3); border-radius: 3px; padding: 2px 3px; }
#reel-fish .fp-x { width: 28px; padding: 0; justify-content: center; }
#reel-fish .fp-take { margin-top: 12px; padding: 8px 10px; border-radius: 8px; border-left: 2px solid #ff8a7a; background: rgba(255, 138, 122, 0.07); color: var(--text-bright);
  display: flex; align-items: center; gap: 8px; }
#reel-fish .fp-take .ri { color: #ff8a7a; }
#reel-fish .fp-take span { flex: 1; }
#reel-fish .fp-list { display: grid; gap: 2px; }
#reel-fish .fp-line { display: grid; grid-template-columns: 22px 44px 1fr auto; gap: 6px; align-items: center; padding: 2px 4px; border-radius: 5px; cursor: pointer; }
#reel-fish .fp-line:hover, #reel-fish .fp-line.fp-lit { background: rgba(var(--cyan-dim-rgb), 0.1); }
#reel-fish .fp-line i { font-style: normal; text-align: center; color: var(--gold); }
#reel-fish .fp-line.fp-school i { color: var(--cyan); }
#reel-fish .fp-line .fp-at { color: var(--text-bright); }
#reel-fish .fp-line button { height: 22px; width: 22px; padding: 0; justify-content: center; }
#reel-fish .fp-none { color: var(--ink-faint); }
#reel-fish .fp-say { margin-top: 10px; color: var(--text-bright); border-left: 2px solid #ff8a7a; padding-left: 8px; }
#reel-fish .fp-say:empty { display: none; }
#reel-fish .fp-hint { color: var(--ink-faint); margin-top: 12px; }
/* the marks on the stage: sized in screen px whatever the stage's scale (--k is 1 / its scale) */
#reel-fish-marks { position: absolute; left: 0; top: 0; z-index: 30; pointer-events: none; --k: 1; }
#reel-fish-marks[hidden] { display: none; }
#reel-fish-marks .fm-water { position: absolute; border: calc(1.5px * var(--k)) dashed rgba(var(--cyan-dim-rgb), 0.5); border-radius: calc(10px * var(--k)); }
#reel-fish-marks .fm-water span { position: absolute; left: calc(10px * var(--k)); top: calc(-19px * var(--k)); font: 500 calc(11px * var(--k))/1 var(--font-mono);
  letter-spacing: 0.1em; color: var(--ink-quiet); text-transform: uppercase; }
#reel-fish-marks svg { position: absolute; left: 0; top: 0; overflow: visible; }
#reel-fish-marks svg path { fill: none; stroke: var(--gold); stroke-width: calc(1.5px * var(--k)); stroke-dasharray: calc(5px * var(--k)) calc(5px * var(--k)); opacity: 0.8; }
#reel-fish-marks svg path.fm-school { stroke: var(--cyan); }
#reel-fish-marks .fm { position: absolute; width: calc(30px * var(--k)); height: calc(30px * var(--k)); margin: calc(-15px * var(--k)) 0 0 calc(-15px * var(--k));
  border-radius: 50%; border: calc(2px * var(--k)) solid var(--gold); background: rgba(var(--surface-rgb), 0.6); pointer-events: auto; cursor: grab; touch-action: none;
  display: flex; align-items: center; justify-content: center; font: 600 calc(12px * var(--k))/1 var(--font-mono); color: var(--gold); }
#reel-fish-marks .fm.fm-school { border-color: var(--cyan); color: var(--cyan); }
#reel-fish-marks .fm.fm-look { border-style: dashed; }
#reel-fish-marks .fm.fm-feed { border-radius: 30%; border-color: var(--text-bright); color: var(--text-bright); }
#reel-fish-marks .fm.fm-on { box-shadow: 0 0 0 calc(4px * var(--k)) rgba(var(--gold-rgb), 0.3); }
#reel-fish-marks .fm b { position: absolute; left: calc(100% + 6px * var(--k)); top: 50%; transform: translateY(-50%); white-space: nowrap; pointer-events: none;
  font: 500 calc(11px * var(--k))/1 var(--font-mono); color: var(--text-bright); background: rgba(var(--surface-rgb), 0.85); padding: calc(4px * var(--k)) calc(6px * var(--k));
  border-radius: calc(4px * var(--k)); }
#reel-fish-marks .fm-pick { position: absolute; left: 0; top: 0; z-index: 5; pointer-events: auto; cursor: crosshair; background: rgba(var(--cyan-dim-rgb), 0.05); }   /* over the marks: a pick lands anywhere */
#reel-fish-marks .fm-say { position: absolute; z-index: 6; left: 50%; top: calc(20px * var(--k)); transform: translateX(-50%); white-space: nowrap; pointer-events: none;
  font: 500 calc(13px * var(--k))/1 var(--font-mono); color: var(--text-bright); background: rgba(var(--surface-rgb), 0.92); border: calc(1px * var(--k)) solid var(--gold);
  border-radius: calc(8px * var(--k)); padding: calc(9px * var(--k)) calc(12px * var(--k)); }
`;
  document.head.appendChild(css);

  // ── the panel ─────────────────────────────────────────────────────────
  const el = (tag, cls, parent, text) => { const e = document.createElement(tag); if (cls) e.className = cls.split(' ').map(c => 'fp-' + c).join(' '); if (text != null) e.textContent = text; if (parent) parent.appendChild(e); return e; };
  const btn = (parent, icon, label, title, key) => {
    const b = UI ? UI.button({ icon, label, title, key }) : Object.assign(document.createElement('button'), { type: 'button', textContent: label, title });
    parent.appendChild(b); return b;
  };
  const root = el('div', null, document.body); root.id = 'reel-fish'; root.hidden = true;
  root.setAttribute('role', 'region'); root.setAttribute('aria-label', 'Fish direction');
  // a mouse click leaves no focus behind, so space stays the preview's play and pause
  root.addEventListener('click', e => { const b = e.target.closest('button'); if (b && e.detail) b.blur(); });
  const head = el('div', 'head', root);
  head.insertAdjacentHTML('beforeend', UI ? UI.icon('fish') : '');
  el('h2', null, head, 'Fish');
  const xBtn = btn(head, 'close', '', 'close the fish panel (F)'); xBtn.classList.add('fp-x'); xBtn.setAttribute('aria-label', 'close the fish panel');
  const body = el('div', 'body', root);
  const where = el('div', 'where', body), nowEl = el('div', 'now', body);
  const seg = el('div', 'seg', body); seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', 'Which fish');
  let who = ['big', 'school', 'all'].includes(get(K_WHO, 'big')) ? get(K_WHO, 'big') : 'big';
  const whoBtns = [['big', 'Big fish'], ['school', 'School'], ['all', 'Both']].map(([w, t]) => {
    const b = el('button', null, seg, t); b.type = 'button'; b.dataset.who = w; b.title = `direct ${WHO_NAME[w]}`;
    b.onclick = () => setWho(w);
    return b;
  });

  // Each control: its row, its icon and words, its key, the line it writes (body: the words after
  // the @ time), and which fish it can be for.
  const C = {};
  const control = (row, name, icon, label, title, key, body, only) => {
    const b = btn(row, icon, label, title, key); b.dataset.fish = name;
    C[name] = { b, body, only };
    b.onclick = () => run(name);
    return b;
  };
  el('h3', null, body, 'Go to');
  const rTo = el('div', 'row', body);
  control(rTo, 'to', 'place', 'Place on the stage', 'the next click on the stage is where it swims to, and stays', null, null);
  el('h3', null, body, 'Look at');
  const rLook = el('div', 'row', body);
  control(rLook, 'auto', 'auto', 'The scene', 'what the scene shows (the reel\'s own choreography)', null, w => `${w} look auto`);
  control(rLook, 'look', 'eye', 'A point', 'the next click on the stage is what it looks at', null, null);
  control(rLook, 'off', 'eyeOff', 'Nothing', 'look at nothing: it only does its idle', null, w => `${w} look off`);
  el('h3', null, body, 'Idle');
  const rIdle = el('div', 'row', body);
  [['hover', 'Hover', '1'], ['sweep', 'Sweep', '2'], ['circle', 'Circle', '3'], ['wander', 'Wander', '4']].forEach(([m, t, k]) =>
    control(rIdle, m, m, t, `${m}: ${RS.IDLES[m]}`, k, w => `${w} idle ${m}`));
  el('h3', null, body, 'Pace');
  const rPace = el('div', 'row', body);
  [['slow', 'Slow', 0.6], ['own', 'Own', 1], ['fast', 'Fast', 1.6]].forEach(([n, t, k]) =>
    control(rPace, n, n === 'own' ? 'fish' : n, t, `swim at ${k}× its own pace`, null, w => `${w} pace ${k}`));
  el('h3', null, body, 'Now');
  const rAct = el('div', 'row', body);
  control(rAct, 'dart', 'dart', 'Dart', RS.FISH.dart.about + ' (the big fish)', 'D', w => `${w} dart`, 'big');
  control(rAct, 'turn', 'turn', 'Turn', RS.FISH.turn.about + ' (the big fish)', 'T', w => `${w} turn`, 'big');
  control(rAct, 'scatter', 'scatter', 'Scatter', RS.FISH.scatter.about, 'S', w => `${w} scatter`, 'school');
  control(rAct, 'regroup', 'regroup', 'Regroup', RS.FISH.regroup.about, 'G', w => `${w} regroup`, 'school');
  control(rAct, 'feed', 'food', 'Feed', 'the next click on the stage drops food there, for any fish', null, null);
  const takeEl = el('div', 'take', body); takeEl.hidden = true;
  takeEl.insertAdjacentHTML('beforeend', UI ? UI.icon('record') : '');
  const takeTxt = el('span', null, takeEl);
  const takeDrop = btn(takeEl, 'discard', 'Discard', 'drop this take'); takeDrop.onclick = () => { take = []; drawTake(); };
  const sayEl = el('div', 'say', body); sayEl.setAttribute('role', 'status');
  el('h3', null, body, 'This scene\'s fish lines');
  const list = el('div', 'list', body);
  el('p', 'hint', body, 'Each control writes a line at the playhead. Paused, it saves at once; playing, your presses gather into a take that pausing keeps. Drag a mark on the stage to move it. Undo is the timeline\'s (⌘Z).');
  const say = errs => { errs = [].concat(errs || []).map(String).filter(Boolean); sayEl.textContent = errs[0] || ''; sayEl.title = errs.join('\n'); };

  // ── the marks on the stage ────────────────────────────────────────────
  const marks = document.createElement('div'); marks.id = 'reel-fish-marks'; marks.hidden = true;
  marks.style.width = W + 'px'; marks.style.height = H + 'px';
  L.stage.appendChild(marks);
  const WA = L.fish.water;
  const water = document.createElement('div'); water.className = 'fm-water';
  Object.assign(water.style, { left: WA.x0 + 'px', top: WA.y0 + 'px', width: (WA.x1 - WA.x0) + 'px', height: (WA.y1 - WA.y0) + 'px' });
  water.innerHTML = '<span>the water</span>'; water.title = 'where a fish can be sent: a spot outside it is brought in to its edge';
  const pathSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); pathSvg.setAttribute('width', W); pathSvg.setAttribute('height', H);
  const pickEl = document.createElement('div'); pickEl.className = 'fm-pick'; pickEl.hidden = true;
  pickEl.style.width = W + 'px'; pickEl.style.height = H + 'px';
  const pickSay = document.createElement('div'); pickSay.className = 'fm-say'; pickSay.hidden = true;
  const view = L.view;
  const toStage = e => { const v = view(); return { x: Math.max(0, Math.min(W, (e.clientX - v.x) / v.s)), y: Math.max(0, Math.min(H, (e.clientY - v.y) / v.s)) }; };

  function drawMarks(i) {
    marks.textContent = '';
    marks.append(water, pathSvg, pickEl, pickSay);
    pathSvg.textContent = '';
    const sc = SC[i], rows = LINES[i], trail = { big: [], school: [] };
    rows.forEach((r, k) => {
      const c = r.c;
      if (c.x == null) return;
      const m = document.createElement('div');
      const w = c.who || 'feed';
      m.className = 'fm' + (c.verb === 'look' ? ' fm-look' : c.verb === 'feed' ? ' fm-feed' : '') + (w === 'school' ? ' fm-school' : '');
      m.style.left = (c.x * W) + 'px'; m.style.top = (c.y * H) + 'px';
      m.textContent = String(k + 1);
      const tag = document.createElement('b');
      tag.textContent = `@${c.at} ${c.verb === 'feed' ? 'food' : `${c.who} ${c.verb === 'to' ? 'goes here' : 'looks here'}`}`;
      m.appendChild(tag);
      m.title = `${RS.writeFish(c)}\ndrag to move it; click to jump to ${fmt(sc.start + c.at)}`;
      m.dataset.ln = r.ln;
      markDrag(m, r);
      marks.appendChild(m);
      if (c.verb === 'to') (c.who === 'all' ? ['big', 'school'] : [c.who]).forEach(x => trail[x].push([c.x * W, c.y * H]));
    });
    Object.entries(trail).forEach(([x, pts]) => {
      if (pts.length < 2) return;
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('d', 'M' + pts.map(q => q.map(n => n.toFixed(1)).join(' ')).join('L'));
      if (x === 'school') p.setAttribute('class', 'fm-school');
      pathSvg.appendChild(p);
    });
  }
  function markDrag(m, r) {
    m.addEventListener('pointerdown', e => {
      if (e.button !== 0 || pick) return;
      e.preventDefault(); e.stopPropagation();
      try { m.setPointerCapture(e.pointerId); } catch (x) { /* synthetic */ }
      const x0 = e.clientX, y0 = e.clientY; let moved = false, at = null;
      const mv = ev => {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > 3) moved = true;
        if (!moved) return;
        at = toStage(ev); m.style.left = at.x + 'px'; m.style.top = at.y + 'px';
        m.querySelector('b').textContent = `${f2(at.x / W)} ${f2(at.y / H)}`;
      };
      const up = () => {
        m.removeEventListener('pointermove', mv); m.removeEventListener('pointerup', up); m.removeEventListener('pointercancel', up);
        if (!moved || !at) { L.seek(SC[cur].start + r.c.at); return; }
        const c = Object.assign({}, r.c, { x: f2(at.x / W), y: f2(at.y / H) });
        try { save(RS.setField(L.src, r.ln, RS.writeFish(c))); } catch (err) { say(err.errors || [err.message]); drawMarks(cur); }
      };
      m.addEventListener('pointermove', mv); m.addEventListener('pointerup', up); m.addEventListener('pointercancel', up);
    });
  }

  // ── picking a point on the stage ──────────────────────────────────────
  let pick = null;
  const PICK_SAY = {
    to: w => `Click where ${WHO_NAME[w]} should swim to · Esc to cancel`,
    look: w => `Click what ${WHO_NAME[w]} should look at · Esc to cancel`,
    feed: () => 'Click where the food should drop · Esc to cancel',
  };
  function startPick(kind) {
    pick = kind; pickEl.hidden = false; pickSay.hidden = false; pickSay.textContent = PICK_SAY[kind](who);
    C[kind].b.setAttribute('aria-pressed', 'true');
  }
  function endPick() {
    if (pick) C[pick].b.removeAttribute('aria-pressed');
    pick = null; pickEl.hidden = true; pickSay.hidden = true;
  }
  pickEl.addEventListener('pointerdown', e => {
    if (!pick || e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const p = toStage(e), kind = pick, xy = `${f2(p.x / W)} ${f2(p.y / H)}`;
    endPick();
    write(kind === 'feed' ? `feed ${xy}` : `${who} ${kind === 'to' ? 'to' : 'look'} ${xy}`);
  });

  // ── writing lines ─────────────────────────────────────────────────────
  let take = [];                                  // lines pressed while playing: { i, at, body }
  function run(name) {
    const c = C[name];
    if (!c || c.b.disabled) return;
    if (name === 'to' || name === 'look' || name === 'feed') { if (pick === name) endPick(); else { endPick(); startPick(name); } return; }
    write(c.body(who));
  }
  // one line at the playhead, in the scene under it (clear of the scene's very end)
  function write(bodyText) {
    const t = L.now(), sc = sceneAt(t);
    const at = Math.max(0, Math.min(q05(t - sc.start), q05(sc.dur - 0.1)));
    const x = { i: sc.i, at, body: bodyText };
    try { RS.readFish(`@${at} ${bodyText}`); } catch (e) { say([e.message]); return; }
    if (L.isPlaying()) { take.push(x); drawTake(); return; }
    keep([x]);
  }
  // the same fish doing the same kind of thing at the same moment: rewrite its line, not a second
  function placeLine(src, x) {
    const p = RS.parse(src), sc = p.edit.scenes[x.i], c = RS.readFish(`@${x.at} ${x.body}`);
    const same = p.fields.find(f => {
      if (f.key !== 'fish' || f.owner !== sc) return false;
      const o = sc.fish[f.index];
      return Math.abs(o.at - c.at) < 0.026 && o.verb === c.verb && (o.who || '') === (c.who || '');
    });
    if (same) return RS.setField(src, same.ln, RS.writeFish(c));
    return RS.addLine(src, p.marks.find(m => m.kind === 'scene' && m.obj === sc).ln, 'fish', RS.writeFish(c));
  }
  function keep(list) {
    let src = L.src;
    try { list.forEach(x => { src = placeLine(src, x); }); } catch (e) { say(e.errors || [e.message]); return; }
    save(src);
  }
  let busy = false;
  async function save(next) {
    if (next === L.src) { say(['already so: that line is in the script as it is']); return; }
    if (busy) return;
    busy = true; say('');
    const u0 = get(K_UNDO, []), r0 = get(K_REDO, []);
    put(K_UNDO, (Array.isArray(u0) ? u0 : []).concat([L.src]).slice(-DEPTH)); put(K_REDO, []);
    let r;
    try { r = await L.save(next); } catch (e) { r = { ok: false, errors: [e.message] }; }
    if (!r || !r.ok) { put(K_UNDO, u0); put(K_REDO, r0); busy = false; say((r && r.errors) || ['the save failed']); drawMarks(cur); }
    // saved: the page reloads at the same moment
  }
  function drawTake() {
    takeEl.hidden = !take.length;
    takeTxt.textContent = `${take.length} line${take.length === 1 ? '' : 's'} in this take · pause to keep ${take.length === 1 ? 'it' : 'them'}`;
  }

  // ── the scene under the playhead ──────────────────────────────────────
  let cur = -1;
  function drawScene(i) {
    cur = i;
    const sc = SC[i];
    list.textContent = '';
    if (!LINES[i].length) el('div', 'none', list, 'None: the fish follow the reel\'s own choreography here.');
    LINES[i].forEach((r, k) => {
      const c = r.c, row = el('div', 'line' + (c.who === 'school' ? ' school' : ''), list);
      el('i', null, row, c.x != null ? String(k + 1) : '·');
      el('span', 'at', row, `@${c.at}`);
      el('span', null, row, RS.writeFish(c).replace(/^@\S+\s+/, ''));
      const del = btn(row, 'close', '', 'delete this line'); del.setAttribute('aria-label', `delete the fish line @${c.at}`);
      del.onclick = e => { e.stopPropagation(); try { save(RS.removeLine(L.src, r.ln)); } catch (err) { say(err.errors || [err.message]); } };
      row.title = `line ${r.ln}: click to jump to ${fmt(sc.start + c.at)}`;
      row.dataset.ln = r.ln;
      row.onclick = () => L.seek(sc.start + c.at);
    });
    drawMarks(i);
  }
  // what the chosen fish is doing now, and which controls light up
  function drawNow(t) {
    const sc = SC[cur], w = who === 'school' ? 'school' : 'big', D = L.fish.told(w, t);
    const into = t - sc.start;
    where.textContent = `Scene ${sc.i + 1} · ${sc.type} · ${into.toFixed(1)} s in (${fmt(t)})`;
    const spot = D.to ? `swims to its spot (${f2(D.to.x / W)}, ${f2(D.to.y / H)})` : 'swims to what it looks at';
    const idle = D.idle || (w === 'school' ? 'sweep' : 'hover');
    const look = D.look === 'auto' ? 'what the scene shows' : D.look === 'off' ? 'nothing' : `a point (${f2(D.look.x / W)}, ${f2(D.look.y / H)})`;
    nowEl.textContent = `Now ${WHO_NAME[w]} ${idle === 'wander' ? 'wanders' : `${spot}, ${idle}s there`}, looking at ${look}${D.pace !== 1 ? `, at ${D.pace}× pace` : ''}.`;
    const lit = { auto: D.look === 'auto', off: D.look === 'off', look: typeof D.look === 'object' && D.look !== null,
      hover: idle === 'hover', sweep: idle === 'sweep', circle: idle === 'circle', wander: idle === 'wander',
      slow: D.pace < 1, own: D.pace === 1, fast: D.pace > 1, to: !!D.to };
    Object.entries(lit).forEach(([n, on]) => C[n].b.classList.toggle('fp-on', !!on));
    const k = (1 / view().s).toFixed(4);
    if (marks.style.getPropertyValue('--k') !== k) marks.style.setProperty('--k', k);
  }
  function setWho(w) {
    who = w; put(K_WHO, w);
    whoBtns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.who === w)));
    Object.entries(C).forEach(([, c]) => { c.b.disabled = !!(c.only && w !== 'all' && w !== c.only); });
    if (pick) pickSay.textContent = PICK_SAY[pick](who);
    if (cur >= 0) drawNow(L.now());
  }
  let wasPlaying = false, lastNow = -1;
  L.onFrame(t => {
    const playing = L.isPlaying();
    if (wasPlaying && !playing && take.length) { const tk = take; take = []; drawTake(); keep(tk); }   // pausing keeps the take
    wasPlaying = playing;
    if (root.hidden) return;
    const i = sceneAt(t).i;
    if (i !== cur) drawScene(i);
    if (Math.abs(t - lastNow) > 0.08) { lastNow = t; drawNow(t); }
  });

  // ── open, shut, and where the panel sits ──────────────────────────────
  // Beside the preview in a window of BESIDE px and up (the stage makes room on the left);
  // over it in a narrower one.
  const BESIDE = 1100, PW = 312;
  function placePanel() {
    const over = innerWidth < BESIDE;
    root.classList.toggle('fp-over', over);
    L.reserveLeft(!root.hidden && !over ? PW : 0);
  }
  let tool = null;
  function open(on) {
    if (on === undefined) on = root.hidden;
    root.hidden = !on; marks.hidden = !on; put(K_OPEN, !!on);
    if (tool) tool.setAttribute('aria-pressed', String(!!on));
    if (!on) endPick();
    placePanel();
    if (on) { cur = -1; drawScene(sceneAt(L.now()).i); drawNow(L.now()); }
  }
  xBtn.onclick = () => open(false);
  addEventListener('resize', () => { if (!root.hidden) placePanel(); });
  const KEYS = { d: 'dart', t: 'turn', s: 'scatter', g: 'regroup', 1: 'hover', 2: 'sweep', 3: 'circle', 4: 'wander' };
  addEventListener('keydown', e => {
    if (e.target.closest && e.target.closest('input, textarea, select, [contenteditable]')) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'f' || e.key === 'F') { e.preventDefault(); open(root.hidden); return; }
    if (root.hidden) return;
    if (e.key === 'Escape' && pick) { e.preventDefault(); endPick(); return; }
    const name = KEYS[e.key.toLowerCase()];
    if (name) { e.preventDefault(); run(name); }
  });
  if (L.addTool) tool = L.addTool({ id: 'fish', label: 'Fish', key: 'F', order: 25, icon: 'fish',
    title: 'direct the fish: where they swim, what they look at, what they do', onClick: () => open(root.hidden) });
  setWho(who);
  if (get(K_OPEN, false)) open(true);
  // for tests and the console
  window.REEL_FISH = { open: on => open(on === undefined ? true : on), get isOpen() { return !root.hidden; }, who: setWho, run,
    pick: startPick, get picking() { return pick; }, get take() { return take.slice(); }, lines: i => LINES[i == null ? cur : i].map(r => ({ ln: r.ln, text: RS.writeFish(r.c) })) };
})();
