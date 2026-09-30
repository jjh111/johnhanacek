// The reel's fish, directed from the preview: the Fish panel (F), its marks on the stage, and the
// line it shares with the timeline's fish lanes.
//
// The script's `fish` lines direct the fish scene by scene (FISH in scripts/reel-script.js, played
// by the rig's director): `fish @1.5 big to 0.72 0.8` sends the big fish to a spot, `look`,
// `idle` and `pace` say what it does there, and dart, turn, scatter, regroup and feed happen once.
// The panel has two halves, for one fish chosen at the top (the big fish, the school, or both):
//   At the playhead   one row per kind of thing (look, idle, pace, spot), its button lit for what
//                     the fish does at the playhead now. Pressing another writes a line at the
//                     playhead, so it changes from there to the scene's end; pressing it again at
//                     the same moment rewrites that line rather than adding a second. The once
//                     buttons (dart, turn, scatter, regroup, feed) write a line each.
//                     Paused, a press saves at once and the preview comes back at the same
//                     moment. Playing, presses gather into a take (each at the moment it was
//                     pressed, its button dashed) that pausing keeps in one save.
//   This scene's lines   every fish line of the scene under the playhead, numbered in time order.
//                     Click one to open it: its time, who, what it does, and its point (typed, or
//                     picked on the stage), each change one save; Delete takes it out.
// One line is selected at a time, and it is the same line everywhere: its row here, its numbered
// mark on the stage (drag a mark to move its point, click it to select), and its gold mark in the
// timeline's fish lanes (click a mark there to select it here). While the panel is open the stage
// also shows the water (where a fish can be sent) and, live, a dashed line from the chosen fish
// to what it is looking at. Saves go on the timeline's undo stack, so its Undo (and ⌘Z) takes a
// fish line back like any other edit.
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
  const K_OPEN = 'reel-fish-open', K_WHO = 'reel-fish-who', K_SEL = 'reel-fish-sel:' + L.file, K_UNDO = 'reel-undo:' + L.file, K_REDO = 'reel-redo:' + L.file, DEPTH = 30;
  // a line written at the playhead lands on the 0.05 s grid at or before it, so the playhead is
  // already inside what it changes (rounded up, the line began after the playhead and the panel
  // went on showing the old state)
  const floor05 = x => +(Math.floor(x / 0.05 + 1e-6) * 0.05).toFixed(2);
  const f2 = x => +(Math.round(x * 100) / 100).toFixed(2);
  const fmt = s => { const m = Math.floor(s / 60 + 1e-9), r = s - m * 60; return `${m}:${r < 10 ? '0' : ''}${r.toFixed(1)}`; };
  const sceneAt = t => { let s = SC[0]; for (const x of SC) if (t >= x.start - 1e-6) s = x; return s; };
  // each scene's fish lines as written, numbered in time order: { ln, c, i (its scene), n }
  const LINES = SC.map(() => []), BY_LN = new Map();
  P.fields.forEach(f => { if (f.key === 'fish') LINES[P.edit.scenes.indexOf(f.owner)].push({ ln: f.ln, c: f.owner.fish[f.index] }); });
  LINES.forEach((l, i) => { l.sort((a, b) => a.c.at - b.c.at || a.ln - b.ln); l.forEach((r, k) => { r.i = i; r.n = k + 1; BY_LN.set(r.ln, r); }); });
  const WHO_NAME = { big: 'the big fish', school: 'the school', all: 'both' };
  const pt = (x, y) => `(${f2(x)}, ${f2(y)})`;
  // a line in words
  const said = c => ({
    to: () => c.auto ? 'back to the scene\'s own spot' : `goes to ${pt(c.x, c.y)}`,
    look: () => c.look === 'auto' ? 'looks at what the scene shows' : c.look === 'off' ? 'looks at nothing' : `looks at ${pt(c.x, c.y)}`,
    idle: () => ({ hover: 'hovers', sweep: 'sweeps', circle: 'circles', wander: 'wanders' })[c.mode],
    pace: () => `swims at ${c.pace}× pace`,
    dart: () => 'darts', turn: () => 'turns round', scatter: () => 'scatters', regroup: () => 'regroups',
    feed: () => `food at ${pt(c.x, c.y)}`,
  })[c.verb]();

  // ── style: the site's tokens, never text dimmed with alpha ────────────
  const css = document.createElement('style');
  css.textContent = `
#reel-fish { position: fixed; left: 0; top: 0; bottom: var(--reel-bottom, 0px); width: 332px; z-index: 54; box-sizing: border-box; display: flex; flex-direction: column;
  background: rgba(var(--surface-rgb), 0.97); border-right: 1px solid rgba(var(--cyan-dim-rgb), 0.3); font: 500 11px/1.4 var(--font-mono); color: var(--ink-quiet); }
#reel-fish[hidden], #reel-fish [hidden] { display: none !important; }
#reel-fish * { box-sizing: border-box; }
#reel-fish.fp-over { left: 8px; top: 8px; bottom: auto; width: min(332px, calc(100vw - 16px)); max-height: calc(100vh - var(--reel-bottom, 0px) - 16px);
  border: 1px solid rgba(var(--cyan-dim-rgb), 0.4); border-radius: 12px; box-shadow: 0 12px 40px var(--elevation); }
#reel-fish .fp-head { display: flex; align-items: center; gap: 8px; padding: 12px 10px 4px 14px; }
#reel-fish .fp-head .ri { color: var(--cyan); }
#reel-fish h2 { margin: 0; flex: 1; font: 300 18px/1 var(--font-display); color: var(--cyan); letter-spacing: 0.06em; }
#reel-fish .fp-body { flex: 1; overflow-y: auto; padding: 0 14px 14px; scrollbar-width: thin; }
#reel-fish .fp-where { color: var(--text-bright); }
#reel-fish .fp-seg { display: flex; margin: 8px 0 0; border: 1px solid rgba(var(--cyan-dim-rgb), 0.35); border-radius: 7px; overflow: hidden; }
#reel-fish .fp-seg button { flex: 1; border: 0; border-radius: 0; height: 30px; justify-content: center; }
#reel-fish .fp-seg button + button { border-left: 1px solid rgba(var(--cyan-dim-rgb), 0.25); }
#reel-fish h3 { margin: 16px 0 6px; padding-top: 10px; border-top: 1px solid rgba(var(--cyan-dim-rgb), 0.2); font: 600 10px/1 var(--font-mono); letter-spacing: 0.12em;
  text-transform: uppercase; color: var(--cyan); }
#reel-fish .fp-now { color: var(--text-bright); margin: 0 0 8px; }
#reel-fish .fp-ctl { display: grid; grid-template-columns: 50px 1fr; gap: 6px 8px; align-items: center; }
#reel-fish .fp-ctl > span { color: var(--ink-faint); }
#reel-fish .fp-row { display: flex; flex-wrap: wrap; gap: 4px; }
#reel-fish button { font: 500 11px/1 var(--font-mono); color: var(--text-bright); background: rgba(var(--cyan-dim-rgb), 0.08); border: 1px solid rgba(var(--cyan-dim-rgb), 0.35);
  border-radius: 6px; height: 26px; padding: 0 7px; cursor: pointer; display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }
#reel-fish button .ri { width: 14px; height: 14px; }
#reel-fish button:hover:not(:disabled), #reel-fish button:focus-visible { border-color: var(--gold); color: var(--gold); outline: none; }
#reel-fish button:disabled { color: var(--ink-faint); opacity: 0.55; cursor: default; }
#reel-fish button[aria-pressed="true"], #reel-fish button.fp-on { border-color: var(--gold); color: var(--gold); background: rgba(var(--gold-rgb), 0.14); }
#reel-fish button.fp-pend { border-style: dashed; border-color: #ff8a7a; }
#reel-fish button kbd { font: 500 9px/1 var(--font-mono); color: var(--ink-faint); border: 1px solid rgba(var(--cyan-dim-rgb), 0.3); border-radius: 3px; padding: 2px 3px; }
#reel-fish .fp-x { width: 28px; padding: 0; justify-content: center; }
#reel-fish .fp-tip { color: var(--ink-faint); margin-top: 8px; }
#reel-fish .fp-take { margin-top: 10px; padding: 8px 10px; border-radius: 8px; border-left: 2px solid #ff8a7a; background: rgba(255, 138, 122, 0.07); color: var(--text-bright);
  display: flex; align-items: center; gap: 8px; }
#reel-fish .fp-take .ri { color: #ff8a7a; }
#reel-fish .fp-take span { flex: 1; }
#reel-fish .fp-list { display: grid; gap: 2px; }
#reel-fish .fp-line { display: grid; grid-template-columns: 20px 40px 1fr; gap: 6px; align-items: center; padding: 4px 6px; border-radius: 6px; cursor: pointer;
  border: 1px solid transparent; color: var(--ink-quiet); }
#reel-fish .fp-line:hover { background: rgba(var(--cyan-dim-rgb), 0.08); }
#reel-fish .fp-line.fp-sel { border-color: var(--gold); background: rgba(var(--gold-rgb), 0.1); color: var(--text-bright); }
#reel-fish .fp-line b { text-align: center; font-weight: 600; color: var(--gold); }
#reel-fish .fp-line .fp-at { color: var(--text-bright); }
#reel-fish .fp-none { color: var(--ink-faint); }
#reel-fish .fp-ed { margin: 12px 0 0; padding: 10px; border: 1px solid rgba(var(--gold-rgb), 0.55); border-radius: 8px; display: grid;
  grid-template-columns: 50px 1fr; gap: 7px 8px; align-items: center; background: rgba(var(--gold-rgb), 0.05); }
#reel-fish .fp-edhead { grid-column: 1 / -1; display: grid; grid-template-columns: 20px 1fr auto; gap: 6px; align-items: center; color: var(--text-bright);
  padding-bottom: 6px; border-bottom: 1px solid rgba(var(--gold-rgb), 0.25); }
#reel-fish .fp-edhead b { text-align: center; color: var(--gold); }
#reel-fish .fp-edhead button { width: 26px; padding: 0; justify-content: center; }
#reel-fish .fp-ed > span { color: var(--ink-faint); }
#reel-fish input, #reel-fish select { font: 500 11px/1.2 var(--font-mono); color: var(--text-bright); background: rgba(var(--cyan-dim-rgb), 0.06);
  border: 1px solid rgba(var(--cyan-dim-rgb), 0.3); border-radius: 5px; height: 26px; padding: 0 6px; outline: none; }
#reel-fish input { width: 64px; }
#reel-fish select { width: 100%; }
#reel-fish input:focus, #reel-fish select:focus { border-color: var(--gold); }
#reel-fish .fp-say { margin-top: 10px; color: var(--text-bright); border-left: 2px solid #ff8a7a; padding-left: 8px; }
#reel-fish .fp-say:empty { display: none; }
/* the marks on the stage: sized in screen px whatever the stage's scale (--k is 1 / its scale) */
#reel-fish-marks { position: absolute; left: 0; top: 0; z-index: 30; pointer-events: none; --k: 1; }
#reel-fish-marks[hidden] { display: none; }
#reel-fish-marks .fm-water { position: absolute; border: calc(1.5px * var(--k)) dashed rgba(var(--cyan-dim-rgb), 0.5); border-radius: calc(10px * var(--k)); }
#reel-fish-marks .fm-water span { position: absolute; left: calc(10px * var(--k)); top: calc(-19px * var(--k)); font: 500 calc(11px * var(--k))/1 var(--font-mono);
  letter-spacing: 0.1em; color: var(--ink-quiet); text-transform: uppercase; }
#reel-fish-marks svg { position: absolute; left: 0; top: 0; overflow: visible; }
#reel-fish-marks svg .fm-trail { fill: none; stroke: var(--gold); stroke-width: calc(1.5px * var(--k)); stroke-dasharray: calc(5px * var(--k)) calc(5px * var(--k)); opacity: 0.8; }
#reel-fish-marks svg .fm-trail.fm-school { stroke: var(--cyan); }
#reel-fish-marks svg .fm-gaze { fill: none; stroke: var(--cyan); stroke-width: calc(1.5px * var(--k)); stroke-dasharray: calc(2px * var(--k)) calc(6px * var(--k)); stroke-linecap: round; }
#reel-fish-marks svg .fm-gaze.fm-told { stroke: var(--gold); }
#reel-fish-marks svg .fm-eye { fill: rgba(var(--surface-rgb), 0.5); stroke: var(--cyan); stroke-width: calc(1.5px * var(--k)); }
#reel-fish-marks svg .fm-eye.fm-told { stroke: var(--gold); }
#reel-fish-marks .fm-gazet { position: absolute; transform: translate(-50%, calc(-100% - 16px * var(--k))); white-space: nowrap; pointer-events: none;
  font: 500 calc(11px * var(--k))/1 var(--font-mono); color: var(--text-bright); background: rgba(var(--surface-rgb), 0.85); padding: calc(4px * var(--k)) calc(6px * var(--k));
  border-radius: calc(4px * var(--k)); border: calc(1px * var(--k)) solid rgba(var(--cyan-dim-rgb), 0.5); }
#reel-fish-marks .fm-gazet.fm-told { border-color: var(--gold); }
#reel-fish-marks .fm { position: absolute; width: calc(30px * var(--k)); height: calc(30px * var(--k)); margin: calc(-15px * var(--k)) 0 0 calc(-15px * var(--k));
  border-radius: 50%; border: calc(2px * var(--k)) solid var(--gold); background: rgba(var(--surface-rgb), 0.6); pointer-events: auto; cursor: grab; touch-action: none;
  display: flex; align-items: center; justify-content: center; font: 600 calc(12px * var(--k))/1 var(--font-mono); color: var(--gold); }
#reel-fish-marks .fm.fm-school { border-color: var(--cyan); color: var(--cyan); }
#reel-fish-marks .fm.fm-look { border-style: dashed; }
#reel-fish-marks .fm.fm-feed { border-radius: 30%; border-color: var(--text-bright); color: var(--text-bright); }
#reel-fish-marks .fm.fm-sel { background: var(--gold); color: rgb(var(--surface-rgb)); box-shadow: 0 0 0 calc(5px * var(--k)) rgba(var(--gold-rgb), 0.3); }
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
  const where = el('div', 'where', body);
  const seg = el('div', 'seg', body); seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', 'Which fish');
  let who = ['big', 'school', 'all'].includes(get(K_WHO, 'big')) ? get(K_WHO, 'big') : 'big';
  const whoBtns = [['big', 'Big fish'], ['school', 'School'], ['all', 'Both']].map(([w, t]) => {
    const b = el('button', null, seg, t); b.type = 'button'; b.dataset.who = w; b.title = `direct ${w === 'all' ? 'all the fish' : WHO_NAME[w]}`;
    b.onclick = () => setWho(w);
    return b;
  });

  // The selected line's editor sits here, at the top, so picking a line anywhere (its row, its
  // mark on the stage, its mark in the timeline) brings it into view.
  const edWrap = el('div', 'edwrap', body); edWrap.hidden = true;
  // At the playhead: each control, its row, its icon and words, its key, the line it writes (the
  // words after the @ time) and which fish it is for. A control with no `body` picks a point.
  const hNow = el('h3', null, body, 'At the playhead');
  hNow.title = 'A lit button is what the fish does at the playhead. Press another to change it from here to the scene\'s end. Playing, presses gather into a take that pausing keeps.';
  const nowEl = el('p', 'now', body);
  const ctl = el('div', 'ctl', body);
  const rowOf = label => { el('span', null, ctl, label); return el('div', 'row', ctl); };
  const C = {};
  const control = (row, name, icon, label, title, key, body_, only) => {
    const b = btn(row, icon, label, title, key); b.dataset.fish = name;
    C[name] = { b, body: body_, only };
    b.onclick = () => run(name);
    return b;
  };
  const rLook = rowOf('Look at');
  control(rLook, 'auto', 'auto', 'Scene', 'what the scene shows: the reel\'s own choreography', null, w => `${w} look auto`);
  control(rLook, 'look', 'eye', 'Point', 'a point: the next click on the stage is what it looks at', null, null);
  control(rLook, 'off', 'eyeOff', 'Nothing', 'nothing: it only does its idle', null, w => `${w} look off`);
  const rIdle = rowOf('Idle');
  [['hover', 'Hover', '1'], ['sweep', 'Sweep', '2'], ['circle', 'Circle', '3'], ['wander', 'Wander', '4']].forEach(([m, t, k]) =>
    control(rIdle, m, m, t, `${m}: ${RS.IDLES[m]} (${k})`, null, w => `${w} idle ${m}`));
  const rPace = rowOf('Pace');
  [['slow', 'Slow', 0.6], ['own', 'Own', 1], ['fast', 'Fast', 1.6]].forEach(([n, t, k]) =>
    control(rPace, n, n === 'own' ? 'fish' : n, t, `swim at ${k}× its own pace`, null, w => `${w} pace ${k}`));
  const rSpot = rowOf('Spot');
  control(rSpot, 'to', 'place', 'Place', 'the next click on the stage is where it swims to, and stays', null, null);
  control(rSpot, 'toauto', 'auto', 'Scene\'s', 'the scene\'s own spot, beside what it looks at', null, w => `${w} to auto`);
  const rAct = rowOf('Once');
  control(rAct, 'dart', 'dart', 'Dart', RS.FISH.dart.about + ', the big fish (D)', null, w => `${w} dart`, 'big');
  control(rAct, 'turn', 'turn', 'Turn', RS.FISH.turn.about + ', the big fish (T)', null, w => `${w} turn`, 'big');
  control(rAct, 'scatter', 'scatter', 'Scatter', RS.FISH.scatter.about + ' (S)', null, w => `${w} scatter`, 'school');
  control(rAct, 'regroup', 'regroup', 'Regroup', RS.FISH.regroup.about + ' (G)', null, w => `${w} regroup`, 'school');
  control(rAct, 'feed', 'food', 'Feed', 'the next click on the stage drops food there, for any fish', null, null);
  el('p', 'tip', body, 'Lit: what it does now. Press another to change it from here on.');
  const takeEl = el('div', 'take', body); takeEl.hidden = true;
  takeEl.insertAdjacentHTML('beforeend', UI ? UI.icon('record') : '');
  const takeTxt = el('span', null, takeEl);
  const takeDrop = btn(takeEl, 'discard', 'Discard', 'drop this take'); takeDrop.onclick = () => { take = []; drawTake(); };
  const sayEl = el('div', 'say', body); sayEl.setAttribute('role', 'status');
  el('h3', null, body, 'This scene\'s lines');
  const list = el('div', 'list', body);
  const say = errs => { errs = [].concat(errs || []).map(String).filter(Boolean); sayEl.textContent = errs[0] || ''; sayEl.title = errs.join('\n'); };

  // ── the marks on the stage ────────────────────────────────────────────
  const marks = document.createElement('div'); marks.id = 'reel-fish-marks'; marks.hidden = true;
  marks.style.width = W + 'px'; marks.style.height = H + 'px';
  L.stage.appendChild(marks);
  const WA = L.fish.water;
  const water = document.createElement('div'); water.className = 'fm-water';
  Object.assign(water.style, { left: WA.x0 + 'px', top: WA.y0 + 'px', width: (WA.x1 - WA.x0) + 'px', height: (WA.y1 - WA.y0) + 'px' });
  water.innerHTML = '<span>the water</span>'; water.title = 'where a fish can be sent: a spot outside it is brought in to its edge';
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('width', W); svg.setAttribute('height', H);
  const trails = document.createElementNS(NS, 'g');
  const gaze = document.createElementNS(NS, 'line'), eye = document.createElementNS(NS, 'circle');
  gaze.setAttribute('class', 'fm-gaze'); eye.setAttribute('class', 'fm-eye'); eye.setAttribute('r', 9);
  svg.append(trails, gaze, eye);
  const gazeTxt = document.createElement('div'); gazeTxt.className = 'fm-gazet';
  const pickEl = document.createElement('div'); pickEl.className = 'fm-pick'; pickEl.hidden = true;
  pickEl.style.width = W + 'px'; pickEl.style.height = H + 'px';
  const pickSay = document.createElement('div'); pickSay.className = 'fm-say'; pickSay.hidden = true;
  marks.append(water, svg, gazeTxt, pickEl, pickSay);
  const view = L.view;
  const toStage = e => { const v = view(); return { x: Math.max(0, Math.min(W, (e.clientX - v.x) / v.s)), y: Math.max(0, Math.min(H, (e.clientY - v.y) / v.s)) }; };
  let markEls = [];
  function drawMarks(i) {
    markEls.forEach(m => m.remove()); markEls = [];
    trails.textContent = '';
    const sc = SC[i], trail = { big: [], school: [] };
    LINES[i].forEach(r => {
      const c = r.c;
      if (c.x == null) return;
      const m = document.createElement('div');
      m.className = 'fm' + (c.verb === 'look' ? ' fm-look' : c.verb === 'feed' ? ' fm-feed' : '') + (c.who === 'school' ? ' fm-school' : '') + (sel && sel.ln === r.ln ? ' fm-sel' : '');
      m.style.left = (c.x * W) + 'px'; m.style.top = (c.y * H) + 'px';
      m.textContent = String(r.n);
      const tag = document.createElement('b');
      tag.textContent = `@${c.at} ${c.verb === 'feed' ? 'food' : `${c.who === 'all' ? 'both' : c.who} ${c.verb === 'to' ? 'go here' : 'look here'}`}`;
      m.appendChild(tag);
      m.title = `line ${r.n}: fish ${RS.writeFish(c)}\ndrag to move it; click to select it (${fmt(sc.start + c.at)})`;
      m.dataset.ln = r.ln;
      markDrag(m, r);
      marks.insertBefore(m, pickEl);
      markEls.push(m);
      if (c.verb === 'to') (c.who === 'all' ? ['big', 'school'] : [c.who]).forEach(x => trail[x].push([c.x * W, c.y * H]));
    });
    Object.entries(trail).forEach(([x, pts]) => {
      if (pts.length < 2) return;
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('d', 'M' + pts.map(q => q.map(n => n.toFixed(1)).join(' ')).join('L'));
      p.setAttribute('class', 'fm-trail' + (x === 'school' ? ' fm-school' : ''));
      trails.appendChild(p);
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
        m.querySelector('b').textContent = pt(at.x / W, at.y / H);
      };
      const up = () => {
        m.removeEventListener('pointermove', mv); m.removeEventListener('pointerup', up); m.removeEventListener('pointercancel', up);
        if (!moved || !at) { selectLine(r.ln, true); return; }
        edit(r, c => Object.assign(c, { x: f2(at.x / W), y: f2(at.y / H) }));
      };
      m.addEventListener('pointermove', mv); m.addEventListener('pointerup', up); m.addEventListener('pointercancel', up);
    });
  }
  // What the chosen fish is looking at, live: a dotted line from it to the thing (cyan: what the
  // scene shows; gold: a point a fish line gave it).
  function drawGaze(t) {
    const w = who === 'school' ? 'school' : 'big', A = L.fish.attention(w, t), f = L.fish.now()[w];
    const on = !!(A && f);
    gaze.style.display = eye.style.display = gazeTxt.style.display = on ? '' : 'none';
    if (!on) return;
    [gaze, eye, gazeTxt].forEach(n => n.classList.toggle('fm-told', !A.auto));
    gaze.setAttribute('x1', f.x.toFixed(1)); gaze.setAttribute('y1', f.y.toFixed(1)); gaze.setAttribute('x2', A.x.toFixed(1)); gaze.setAttribute('y2', A.y.toFixed(1));
    eye.setAttribute('cx', A.x.toFixed(1)); eye.setAttribute('cy', A.y.toFixed(1));
    gazeTxt.style.left = A.x + 'px'; gazeTxt.style.top = A.y + 'px';
    gazeTxt.textContent = `${w === 'big' ? 'the big fish' : 'the school'} looks at ${A.auto ? A.what : 'this point'}`;
  }

  // ── picking a point on the stage ──────────────────────────────────────
  // for a control (a new line at the playhead) or for the selected line's point
  let pick = null;
  const PICK_SAY = {
    to: w => `Click where ${w === 'all' ? 'the fish' : WHO_NAME[w]} should swim to · Esc to cancel`,
    look: w => `Click what ${w === 'all' ? 'the fish' : WHO_NAME[w]} should look at · Esc to cancel`,
    feed: () => 'Click where the food should drop · Esc to cancel',
    edit: () => 'Click the new point for the selected line · Esc to cancel',
  };
  function startPick(kind) {
    endPick();
    pick = kind; pickEl.hidden = false; pickSay.hidden = false; pickSay.textContent = PICK_SAY[kind](who);
    if (C[kind]) C[kind].b.setAttribute('aria-pressed', 'true');
    if (kind === 'edit' && edPick) edPick.setAttribute('aria-pressed', 'true');
  }
  function endPick() {
    if (pick && C[pick]) C[pick].b.removeAttribute('aria-pressed');
    if (edPick) edPick.removeAttribute('aria-pressed');
    pick = null; pickEl.hidden = true; pickSay.hidden = true;
  }
  pickEl.addEventListener('pointerdown', e => {
    if (!pick || e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const p = toStage(e), kind = pick, x = f2(p.x / W), y = f2(p.y / H);
    endPick();
    if (kind === 'edit') { const r = sel && BY_LN.get(sel.ln); if (r) edit(r, c => Object.assign(c, { x, y }, c.verb === 'look' ? { look: undefined } : {}, c.verb === 'to' ? { auto: undefined } : {})); return; }
    write(kind === 'feed' ? `feed ${x} ${y}` : `${who} ${kind} ${x} ${y}`, C[kind].b);
  });

  // ── writing lines ─────────────────────────────────────────────────────
  let take = [];                                  // lines pressed while playing: { i, at, body, b }
  function run(name) {
    const c = C[name];
    if (!c || c.b.disabled) return;
    if (!c.body) { if (pick === name) endPick(); else startPick(name); return; }
    write(c.body(who), c.b);
  }
  // one line at the playhead, in the scene under it (clear of the scene's very end)
  function write(bodyText, b) {
    const t = L.now(), sc = sceneAt(t);
    const at = Math.max(0, Math.min(floor05(t - sc.start), floor05(sc.dur - 0.1)));
    try { RS.readFish(`@${at} ${bodyText}`); } catch (e) { say([e.message]); return; }
    const x = { i: sc.i, at, body: bodyText };
    if (L.isPlaying()) { take.push(x); if (b) b.classList.add('fp-pend'); drawTake(); return; }
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
  function keep(list_) {
    let src = L.src;
    try { list_.forEach(x => { src = placeLine(src, x); }); } catch (e) { say(e.errors || [e.message]); return; }
    const last = list_[list_.length - 1];
    save(src, { text: RS.writeFish(RS.readFish(`@${last.at} ${last.body}`)), i: last.i });   // the new line comes back selected
  }
  // change one line: `change` edits a copy of it, read back through the script's own reader
  function edit(r, change) {
    const c = change(Object.assign({}, r.c));
    Object.keys(c).forEach(k => c[k] === undefined && delete c[k]);
    let text;
    try { text = RS.writeFish(c); RS.readFish(text); } catch (e) { say([e.message]); drawScene(cur); return; }
    try { save(RS.setField(L.src, r.ln, text), { text, i: r.i }); } catch (e) { say(e.errors || [e.message]); drawScene(cur); }
  }
  function retime(r, at) {
    const sc = SC[r.i], v = Math.max(0, Math.min(floor05(sc.dur - 0.05), +(+at).toFixed(2)));
    if (!Number.isFinite(v)) { say([`"${at}" is not a time`]); return; }
    try { save(RS.setAt(L.src, r.ln, v), { text: RS.writeFish(Object.assign({}, r.c, { at: v })), i: r.i }); } catch (e) { say(e.errors || [e.message]); }
  }
  function remove(r) {
    try { save(RS.removeLine(L.src, r.ln), null); } catch (e) { say(e.errors || [e.message]); }
  }
  let busy = false;
  async function save(next, keepSel) {
    if (next === L.src) { say(['already so: that line is in the script as it is']); return; }
    if (busy) return;
    busy = true; say('');
    const u0 = get(K_UNDO, []), r0 = get(K_REDO, []), s0 = get(K_SEL, null);
    put(K_UNDO, (Array.isArray(u0) ? u0 : []).concat([L.src]).slice(-DEPTH)); put(K_REDO, []);
    put(K_SEL, keepSel);
    let res;
    try { res = await L.save(next); } catch (e) { res = { ok: false, errors: [e.message] }; }
    if (!res || !res.ok) { put(K_UNDO, u0); put(K_REDO, r0); put(K_SEL, s0); busy = false; say((res && res.errors) || ['the save failed']); drawScene(cur); }
    // saved: the page reloads at the same moment, the line selected
  }
  function drawTake() {
    takeEl.hidden = !take.length;
    takeTxt.textContent = `${take.length} line${take.length === 1 ? '' : 's'} in this take · pause to keep ${take.length === 1 ? 'it' : 'them'}`;
    if (!take.length) Object.values(C).forEach(c => c.b.classList.remove('fp-pend'));
  }

  // ── the selected line ─────────────────────────────────────────────────
  let sel = null, edPick = null;                  // { ln }; the editor's Pick button
  function selectLine(ln, seek) {
    const r = BY_LN.get(ln);
    sel = r ? { ln } : null;
    put(K_SEL, r ? { text: RS.writeFish(r.c), i: r.i } : null);
    dispatchEvent(new CustomEvent('reel-fish-select', { detail: { ln: r ? ln : null } }));
    if (!r) { drawScene(cur); return; }
    if (seek) L.seek(SC[r.i].start + r.c.at + 1e-3);
    if (r.c.who && r.c.who !== who) setWho(r.c.who, true);
    if (r.i !== cur) cur = r.i;
    drawScene(r.i);
  }
  // after a reload: the line saved last (by its words, in its scene)
  function restoreSel() {
    const s = get(K_SEL, null);
    if (!s || s.i == null || !LINES[s.i]) return;
    const r = LINES[s.i].find(x => RS.writeFish(x.c) === s.text);
    if (r) { sel = { ln: r.ln }; dispatchEvent(new CustomEvent('reel-fish-select', { detail: { ln: r.ln } })); }
  }

  // ── this scene's lines, and the editor of the selected one ────────────
  let cur = -1;
  const VERBS = [['to', 'Go to a spot'], ['look', 'Look at'], ['idle', 'Idle'], ['pace', 'Pace'], ['dart', 'Dart (the big fish)'], ['turn', 'Turn (the big fish)'],
    ['scatter', 'Scatter (the school)'], ['regroup', 'Regroup (the school)'], ['feed', 'Feed']];
  // a line turned into another verb keeps what it can and takes plain defaults for the rest
  function asVerb(c, v) {
    const o = { at: c.at, verb: v };
    const def = RS.FISH[v];
    if (!def.nobody) o.who = c.who || who;
    if (def.only && o.who !== 'all' && o.who !== def.only) o.who = def.only;
    if (v === 'to' || v === 'feed') { o.x = c.x != null ? c.x : 0.5; o.y = c.y != null ? c.y : 0.8; }
    if (v === 'look') { if (c.x != null) { o.x = c.x; o.y = c.y; } else o.look = 'auto'; }
    if (v === 'idle') o.mode = c.mode || 'hover';
    if (v === 'pace') o.pace = c.pace || 1;
    return o;
  }
  function drawScene(i) {
    cur = i;
    const sc = SC[i];
    list.textContent = ''; edPick = null; edWrap.textContent = ''; edWrap.hidden = true;
    if (!LINES[i].length) el('div', 'none', list, 'None yet: the fish follow the reel\'s own choreography in this scene. Press a control above to direct them from the playhead.');
    LINES[i].forEach(r => {
      const c = r.c, on = sel && sel.ln === r.ln, row = el('div', 'line' + (on ? ' sel' : ''), list);
      el('b', null, row, String(r.n));
      el('span', 'at', row, `@${c.at}`);
      el('span', null, row, `${c.who ? (c.who === 'all' ? 'both' : c.who === 'big' ? 'big fish' : 'school') + ' ' : ''}${said(c)}`);
      row.title = `line ${r.ln}: fish ${RS.writeFish(c)} · ${fmt(sc.start + c.at)}\nclick to edit it`;
      row.dataset.ln = r.ln;
      row.setAttribute('role', 'button'); row.tabIndex = 0;
      row.onclick = () => selectLine(on ? null : r.ln, !on);
      row.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); row.onclick(); } };
      if (on) { editor(r); edWrap.hidden = false; requestAnimationFrame(() => edWrap.scrollIntoView({ block: 'nearest' })); }
    });
    drawMarks(i);
  }
  function editor(r) {
    const c = r.c, sc = SC[r.i], box = el('div', 'ed', edWrap);
    box.setAttribute('aria-label', `edit line ${r.n}`);
    const eh = el('div', 'edhead', box);
    el('b', null, eh, String(r.n));
    el('span', null, eh, `${c.who ? (c.who === 'all' ? 'both' : c.who === 'big' ? 'big fish' : 'school') + ' ' : ''}${said(c)}`);
    const shut = btn(eh, 'close', '', 'done: let go of this line'); shut.dataset.ed = 'done'; shut.setAttribute('aria-label', 'let go of this line');
    shut.onclick = () => selectLine(null);
    // when
    el('span', null, box, 'When');
    const wr = el('div', 'row', box);
    const at = el('input', null, wr); at.type = 'number'; at.step = '0.05'; at.min = '0'; at.max = String(sc.dur); at.value = c.at; at.dataset.ed = 'at';
    at.setAttribute('aria-label', 'seconds into the scene');
    const commitAt = () => { if (+at.value !== c.at) retime(r, at.value); };
    at.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); commitAt(); } else if (e.key === 'Escape') { at.value = c.at; at.blur(); } };
    at.onblur = commitAt;
    const back = btn(wr, 'back', '', 'a twentieth of a second earlier'); back.dataset.ed = 'earlier'; back.onclick = () => retime(r, c.at - 0.05);
    const fwd = btn(wr, 'fwd', '', 'a twentieth of a second later'); fwd.dataset.ed = 'later'; fwd.onclick = () => retime(r, c.at + 0.05);
    const go = btn(wr, 'play', '', 'move the playhead here'); go.dataset.ed = 'go'; go.onclick = () => L.seek(sc.start + c.at + 1e-3);
    [back, fwd, go].forEach(b => { b.style.width = '26px'; b.style.padding = '0'; b.style.justifyContent = 'center'; });
    // who
    if (!RS.FISH[c.verb].nobody) {
      el('span', null, box, 'Who');
      const wr2 = el('div', 'row', box);
      [['big', 'Big fish'], ['school', 'School'], ['all', 'Both']].forEach(([w, t]) => {
        const b = el('button', null, wr2, t); b.type = 'button'; b.dataset.ed = 'who-' + w;
        b.setAttribute('aria-pressed', String(c.who === w));
        const only = RS.FISH[c.verb].only;
        b.disabled = !!(only && w !== 'all' && w !== only);
        b.onclick = () => { if (c.who !== w) edit(r, o => Object.assign(o, { who: w })); };
      });
    }
    // what
    el('span', null, box, 'Does');
    const vs = el('select', null, box); vs.dataset.ed = 'verb'; vs.setAttribute('aria-label', 'what the line does');
    VERBS.forEach(([v, t]) => { const o = el('option', null, vs, t); o.value = v; if (v === c.verb) o.selected = true; });
    vs.onchange = () => edit(r, o => asVerb(o, vs.value));
    // its settings
    const pointRow = (label, extra) => {
      el('span', null, box, label);
      const pr = el('div', 'row', box);
      if (c.x != null) {
        [['x', 'across', c.x], ['y', 'down', c.y]].forEach(([k, name, v]) => {
          const inp = el('input', null, pr); inp.type = 'number'; inp.step = '0.01'; inp.min = '0'; inp.max = '1'; inp.value = v; inp.dataset.ed = k;
          inp.title = `${name}: 0 to 1, a fraction of the frame`; inp.setAttribute('aria-label', name);
          const commit = () => { const n = +inp.value; if (n !== v && n >= 0 && n <= 1) edit(r, o => Object.assign(o, { [k]: f2(n) })); else inp.value = v; };
          inp.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); commit(); } else if (e.key === 'Escape') { inp.value = v; inp.blur(); } };
          inp.onblur = commit;
        });
      }
      edPick = btn(pr, 'place', 'Pick', 'click the stage for this line\'s point'); edPick.dataset.ed = 'pick';
      edPick.onclick = () => (pick === 'edit' ? endPick() : startPick('edit'));
      if (extra) extra(pr);
    };
    if (c.verb === 'to') pointRow('Spot', pr => {
      const b = btn(pr, 'auto', 'Scene\'s', 'the scene\'s own spot, beside what it looks at'); b.dataset.ed = 'to-auto';
      b.setAttribute('aria-pressed', String(!!c.auto));
      b.onclick = () => { if (!c.auto) edit(r, o => Object.assign(o, { auto: true, x: undefined, y: undefined })); };
    });
    if (c.verb === 'feed') pointRow('Where');
    if (c.verb === 'look') pointRow('At', pr => {
      [['auto', 'Scene'], ['off', 'Nothing']].forEach(([k, t]) => {
        const b = el('button', null, pr, t); b.type = 'button'; b.dataset.ed = 'look-' + k;
        b.setAttribute('aria-pressed', String(c.look === k));
        b.onclick = () => { if (c.look !== k) edit(r, o => Object.assign(o, { look: k, x: undefined, y: undefined })); };
      });
    });
    if (c.verb === 'idle') {
      el('span', null, box, 'Idle');
      const ir = el('div', 'row', box);
      Object.keys(RS.IDLES).forEach(m => {
        const b = btn(ir, m, m[0].toUpperCase() + m.slice(1), `${m}: ${RS.IDLES[m]}`); b.dataset.ed = 'idle-' + m;
        b.setAttribute('aria-pressed', String(c.mode === m));
        b.onclick = () => { if (c.mode !== m) edit(r, o => Object.assign(o, { mode: m })); };
      });
    }
    if (c.verb === 'pace') {
      el('span', null, box, 'Pace');
      const pr = el('div', 'row', box);
      const inp = el('input', null, pr); inp.type = 'number'; inp.step = '0.1'; inp.min = '0.3'; inp.max = '3'; inp.value = c.pace; inp.dataset.ed = 'pace';
      inp.setAttribute('aria-label', 'pace, 1 is its own');
      const commit = () => { const n = +inp.value; if (n !== c.pace && n >= 0.3 && n <= 3) edit(r, o => Object.assign(o, { pace: +n.toFixed(2) })); else inp.value = c.pace; };
      inp.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); commit(); } else if (e.key === 'Escape') { inp.value = c.pace; inp.blur(); } };
      inp.onblur = commit;
      el('span', null, pr, '× its own pace (0.3 to 3)');
    }
    // out
    el('span', null, box, '');
    const dr = el('div', 'row', box);
    const del = btn(dr, 'discard', 'Delete line', 'take this line out of the script'); del.dataset.ed = 'delete';
    del.onclick = () => remove(r);
  }

  // what the chosen fish does at the playhead, and which controls light up
  function drawNow(t) {
    const sc = SC[cur], w = who === 'school' ? 'school' : 'big', D = L.fish.told(w, t), A = L.fish.attention(w, t);
    where.textContent = `Scene ${sc.i + 1} · ${sc.type} · ${(t - sc.start).toFixed(1)} s in (${fmt(t)})`;
    const idle = D.idle || (w === 'school' ? 'sweep' : 'hover');
    const born = L.fish.born[w];
    const name = w === 'big' ? 'The big fish' : 'The school';
    if (born == null || t < born) nowEl.textContent = `${name} is not in the tank yet${born != null ? ` (it comes at ${fmt(born)})` : ''}.`;
    else {
      const look = A ? (A.auto ? A.what : `a point ${pt(A.x / W, A.y / H)}`) : D.look === 'off' ? 'nothing' : 'nothing (it swims freely)';
      nowEl.textContent = idle === 'wander' ? `${name} wanders${D.pace !== 1 ? ` at ${D.pace}× pace` : ''}.`
        : `${name} looks at ${look} and ${({ hover: 'hovers', sweep: 'sweeps', circle: 'circles' })[idle]} ${D.to ? `at its spot ${pt(D.to.x / W, D.to.y / H)}` : A ? 'beside it' : 'where it is'}${D.pace !== 1 ? `, at ${D.pace}× pace` : ''}.`;
    }
    const lit = { auto: D.look === 'auto', off: D.look === 'off', look: typeof D.look === 'object' && D.look !== null,
      hover: idle === 'hover', sweep: idle === 'sweep', circle: idle === 'circle', wander: idle === 'wander',
      slow: D.pace < 1, own: D.pace === 1, fast: D.pace > 1, to: !!D.to, toauto: !D.to };
    Object.entries(lit).forEach(([n, on]) => C[n].b.classList.toggle('fp-on', !!on));
    const k = (1 / view().s).toFixed(4);
    if (marks.style.getPropertyValue('--k') !== k) marks.style.setProperty('--k', k);
  }
  function setWho(w, quiet) {
    who = w; put(K_WHO, w);
    whoBtns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.who === w)));
    Object.values(C).forEach(c => { c.b.disabled = !!(c.only && w !== 'all' && w !== c.only); });
    if (pick && PICK_SAY[pick]) pickSay.textContent = PICK_SAY[pick](who);
    if (cur >= 0 && !quiet) { drawNow(L.now()); drawGaze(L.now()); }
  }
  let wasPlaying = false, lastNow = -1;
  L.onFrame(t => {
    const playing = L.isPlaying();
    if (wasPlaying && !playing && take.length) { const tk = take; take = []; drawTake(); keep(tk); }   // pausing keeps the take
    wasPlaying = playing;
    if (root.hidden) return;
    const i = sceneAt(t).i;
    if (i !== cur) {                              // a new scene: its lines (a line selected in another scene lets go)
      if (sel && BY_LN.get(sel.ln) && BY_LN.get(sel.ln).i !== i) { sel = null; dispatchEvent(new CustomEvent('reel-fish-select', { detail: { ln: null } })); }
      drawScene(i);
    }
    if (Math.abs(t - lastNow) > 0.08) { lastNow = t; drawNow(t); }
    drawGaze(t);
  });

  // ── open, shut, and where the panel sits ──────────────────────────────
  // Beside the preview in a window of BESIDE px and up (the stage makes room on the left);
  // over it in a narrower one.
  const BESIDE = 1100, PW = 332;
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
    if (on) { cur = -1; const t = L.now(); drawScene(sceneAt(t).i); drawNow(t); drawGaze(t); }
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
    title: 'direct the fish: what they look at, how they idle, where they go, what they do', onClick: () => open(root.hidden) });
  setWho(who, true);
  restoreSel();
  if (get(K_OPEN, false)) open(true);
  // for the timeline (its fish lanes), tests and the console
  window.REEL_FISH = {
    open: on => open(on === undefined ? true : on), get isOpen() { return !root.hidden; },
    who: w => setWho(w), show: w => { open(true); if (w) setWho(w); },
    select: ln => { open(true); selectLine(ln, false); }, get selected() { return sel ? sel.ln : null; },
    run, pick: startPick, get picking() { return pick; }, get take() { return take.slice(); },
    lines: i => LINES[i == null ? cur : i].map(r => ({ ln: r.ln, n: r.n, text: RS.writeFish(r.c) })),
  };
})();
