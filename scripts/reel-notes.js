// The voice's notes as a piano roll (N): the take the score sings, on the reel's own bars, edited
// the way a music program edits a clip (John, 2026-10-06: "i need to be able to edit the
// notes/timing of this stuff like ableton to dial it in").
//
//   the keys      a piano down the left, every C named; the rows of the key (A minor) lighter
//   the ruler     the bars and beats, each bar's chord, the scenes' cuts (gold); click or drag it
//                 to move the playhead
//   the notes     every note of the take at its pitch (as it plays, its octaves up), as long as it
//                 sounds, brighter when louder; a note left out (a sung one the melody does not
//                 play) is a dotted outline; what was sung under them, faintly (Sung)
//   velocity      a stem a note at the foot: drag one up or down (the selected ones move together)
//
// Click a note to choose it (Shift: one more), drag it to move it (its start snaps to the grid;
// Shift keeps it to one axis; ⌘ to the sixteenth), drag its right edge to stretch it, its left
// edge to move its start, Option-drag to copy it. Drag on empty rows to choose a box of notes.
// Double-click: a new note there (as long as the last one made), or a note away. Keys, with the
// roll in focus: ←→ move by the grid (Option: a sixteenth; Shift: longer or shorter), ↑↓ a
// semitone (Shift: an octave), ⌫ away, 0 leave out or put back, Q quantize the starts to the
// grid, ⌘D a copy after the selection, ⌘C ⌘V copy and paste at the playhead, ⌘A all, ⌘1 ⌘2 a finer
// or coarser grid, - = zoom, Esc lets go. ⌘Z undoes it all, one edit at a time (the timeline's
// one Undo).
//
// Every change is one edit of the score's n lines, through ReelMusic.editTake and the synth rack
// (REEL_RACK.change): heard at once, kept like any other, and the lines stay in time order. A sung
// note keeps where it was sung (its `early`); moved more than a bar from it, what was sung stays
// there as a note left out, and the note goes on as a plain one.
(function () {
  'use strict';
  const L = window.REEL_LIVE;
  if (!L || document.getElementById('reel-notes')) return;
  const UI = window.REEL_UI, RK = () => window.REEL_RACK, RM = () => window.ReelMusic;

  const get = (k, d) => { try { const v = sessionStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
  const put = (k, v) => { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* no storage: the view starts fresh */ } };
  const K_OPEN = 'reel-notes-open', K_VIEW = 'reel-notes-view:' + L.file, K_H = 'reel-notes-h', K_OPT = 'reel-notes-opts';
  const KEYW = 48, RULER = 24, VELH = 46, FOOT = 24, MINH = 200;
  const GRIDS = [[1, '1/16'], [2, '1/8'], [4, '1/4'], [8, '1/2'], [16, 'bar']];
  const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const nm = m => NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
  const BLACK = new Set([1, 3, 6, 8, 10]);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  let opts = Object.assign({ grid: 2, scale: true, fold: false, sung: true, hear: true, follow: true }, get(K_OPT, {}));
  let H = get(K_H, 360);
  const view = Object.assign({ t0: 0, pxs: 70, rowH: 13, sy: 0 }, get(K_VIEW, {}));
  let M = null;                 // what the roll shows, read from the rack's score (readModel)
  let sel = new Set();          // the chosen notes, by line
  let drag = null, lastLen = 2, clip = null, pendingSel = null, timelineWas = false, say = '';

  // ── style: the editor's own look (the timeline's buttons, the site's tokens) ──
  const css = document.createElement('style');
  css.textContent = `
#reel-notes { position: fixed; left: 0; right: 0; bottom: 0; height: 320px; z-index: 50; box-sizing: border-box; display: flex; flex-direction: column;
  background: rgba(var(--surface-rgb), 0.97); border-top: 1px solid rgba(var(--cyan-dim-rgb), 0.3);
  font: 500 11px/1 var(--font-mono); color: var(--ink-quiet); letter-spacing: 0.02em; user-select: none; -webkit-user-select: none; }
#reel-notes[hidden], #reel-notes [hidden] { display: none !important; }
#reel-notes * { box-sizing: border-box; }
#reel-notes .nt-grip { position: absolute; left: 0; right: 0; top: -5px; height: 9px; cursor: ns-resize; z-index: 3; }
#reel-notes .nt-bar { flex: none; height: 36px; display: flex; align-items: center; gap: 6px; padding: 0 8px 0 10px; white-space: nowrap; overflow: hidden;
  border-bottom: 1px solid rgba(var(--cyan-dim-rgb), 0.15); }
#reel-notes .nt-title { display: flex; align-items: baseline; gap: 8px; margin-right: 4px; }
#reel-notes .nt-title b { font: 600 12px/1 var(--font-mono); color: var(--text-bright); letter-spacing: 0.08em; text-transform: uppercase; }
#reel-notes .nt-title span { color: var(--ink-faint); }
#reel-notes .nt-grow { flex: 1; min-width: 4px; }
#reel-notes .nt-sep { width: 1px; align-self: stretch; margin: 8px 2px; background: rgba(var(--cyan-dim-rgb), 0.2); flex: none; }
#reel-notes button, #reel-notes select { font: 500 11px/1 var(--font-mono); color: var(--text-bright); background: rgba(var(--cyan-dim-rgb), 0.1);
  border: 1px solid rgba(var(--cyan-dim-rgb), 0.4); border-radius: 5px; padding: 0 9px; height: 26px; min-width: 26px; cursor: pointer; flex: none; }
#reel-notes select { padding: 0 6px; }
#reel-notes button:hover:not(:disabled), #reel-notes button:focus-visible, #reel-notes select:hover, #reel-notes select:focus-visible { border-color: var(--gold); color: var(--gold); outline: none; }
#reel-notes button:disabled { color: var(--ink-faint); cursor: default; opacity: 0.6; }
#reel-notes button[aria-pressed="true"] { border-color: rgba(var(--gold-rgb), 0.7); color: var(--gold); background: rgba(var(--gold-rgb), 0.1); }
#reel-notes button:has(> .ri):not(:has(> .rl)) { padding: 0; width: 28px; }
#reel-notes button kbd { font: 500 9px/1 var(--font-mono); color: var(--ink-faint); border: 1px solid rgba(var(--cyan-dim-rgb), 0.3); border-radius: 3px; padding: 2px 3px; }
#reel-notes .nt-bar.nt-k kbd { display: none; }
#reel-notes .nt-bar.nt-l button:has(> .ri) .rl { display: none; }
#reel-notes .nt-bar.nt-l button:has(> .ri) { padding: 0; width: 28px; }
#reel-notes .nt-bar.nt-t .nt-title span, #reel-notes .nt-bar.nt-t .nt-gl { display: none; }
#reel-notes .nt-gl { color: var(--ink-faint); }
#reel-notes canvas.nt-ov { flex: none; display: block; width: 100%; height: 14px; cursor: pointer; border-bottom: 1px solid rgba(var(--cyan-dim-rgb), 0.12); }
#reel-notes .nt-main { flex: 1; min-height: 0; display: flex; position: relative; }
#reel-notes canvas.nt-keys { flex: none; display: block; width: ${KEYW}px; height: 100%; border-right: 1px solid rgba(var(--cyan-dim-rgb), 0.2); cursor: pointer; }
#reel-notes .nt-roll { flex: 1; min-width: 0; position: relative; overflow: hidden; }
#reel-notes .nt-roll canvas { position: absolute; left: 0; top: 0; width: 100%; height: 100%; display: block; outline: none; }
#reel-notes .nt-roll canvas:focus-visible { box-shadow: inset 0 0 0 1px rgba(var(--gold-rgb), 0.6); }
#reel-notes .nt-ph { position: absolute; top: 0; bottom: 0; left: 0; width: 2px; margin-left: -1px; background: var(--gold); pointer-events: none; z-index: 2; will-change: transform; }
#reel-notes .nt-foot { flex: none; height: ${FOOT}px; display: flex; align-items: center; gap: 12px; padding: 0 10px; white-space: nowrap; overflow: hidden;
  border-top: 1px solid rgba(var(--cyan-dim-rgb), 0.12); color: var(--ink-faint); }
#reel-notes .nt-foot .nt-sel { color: var(--text-bright); flex: none; }
#reel-notes .nt-foot .nt-say { color: var(--gold); flex: none; }
#reel-notes .nt-foot .nt-say.err { color: #ff9b8a; }
#reel-notes .nt-none { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: var(--ink-faint); }
`;
  document.head.appendChild(css);

  // ── the panel ─────────────────────────────────────────────────────────
  const h = (tag, cls, parent, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; if (parent) parent.appendChild(e); return e; };
  const root = h('div', null, document.body); root.id = 'reel-notes'; root.hidden = true;
  root.setAttribute('role', 'region'); root.setAttribute('aria-label', 'the voice\'s notes');
  const grip = h('div', 'nt-grip', root); grip.title = 'drag: the panel taller or shorter';
  const bar = h('div', 'nt-bar', root);
  const title = h('div', 'nt-title', bar); h('b', null, title, 'Notes'); const kind = h('span', null, title, '');
  const btn = (o, fn) => { const b = UI ? UI.button(o) : Object.assign(document.createElement('button'), { type: 'button', textContent: o.label || o.title }); b.addEventListener('click', e => { fn(e); if (e.detail) b.blur(); }); bar.appendChild(b); return b; };
  const toggle = (o, key) => { const b = btn(o, () => { opts[key] = !opts[key]; put(K_OPT, opts); b.setAttribute('aria-pressed', String(opts[key])); if (key === 'fold' || key === 'scale') { if (M && !M.none) { rowsOf(); fitRows(false); centreRows(); } } draw(); }); b.setAttribute('aria-pressed', String(opts[key])); return b; };
  h('div', 'nt-sep', bar);
  h('span', 'nt-gl', bar, 'grid');
  const gridSel = h('select', null, bar); gridSel.title = 'the grid a move, a stretch and a new note snap to (⌘1 finer, ⌘2 coarser)';
  GRIDS.forEach(([v, label]) => { const o = h('option', null, gridSel, label); o.value = v; });
  gridSel.value = String(opts.grid);
  gridSel.addEventListener('change', () => { opts.grid = +gridSel.value; put(K_OPT, opts); draw(); });
  gridSel.addEventListener('keydown', e => e.stopPropagation());
  const bQ = btn({ icon: 'quantize', label: 'Quantize', key: 'Q', title: 'the chosen notes\' starts to the grid' }, () => quantize());
  h('div', 'nt-sep', bar);
  const bScale = toggle({ icon: 'scale', label: 'Key', title: 'only the rows of the key (A minor): a note moved up or down stays in it' }, 'scale');
  const bFold = toggle({ icon: 'fold', label: 'Fold', title: 'only the rows a note is on' }, 'fold');
  const bSung = toggle({ icon: 'wander', label: 'Sung', title: 'what was sung, faintly, under the notes' }, 'sung');
  const bHear = toggle({ icon: 'sound', label: 'Hear', title: 'hear a note as you choose it or move it' }, 'hear');
  const bFollow = toggle({ icon: 'follow', label: 'Follow', title: 'keep the playhead in view while the reel plays' }, 'follow');
  h('div', 'nt-sep', bar);
  btn({ icon: 'zoomOut', title: 'zoom out (-)' }, () => zoomAt(rollW() / 2, 1 / 1.5));
  btn({ icon: 'fit', label: 'Fit', title: 'the whole take in view' }, () => fitAll());
  btn({ icon: 'zoomIn', title: 'zoom in (=)' }, () => zoomAt(rollW() / 2, 1.5));
  h('div', 'nt-grow', bar);
  const bUndo = btn({ icon: 'undo', label: 'Undo', key: '⌘Z', title: 'take back the last edit' }, () => undo(true));
  const bRedo = btn({ icon: 'redo', label: 'Redo', title: 'do it again' }, () => undo(false));
  const bClose = btn({ icon: 'close', title: 'shut the notes (N)' }, () => show(false));
  const refit = UI ? UI.fit(bar, ['nt-k', 'nt-t', 'nt-l']) : () => {};
  const ov = h('canvas', 'nt-ov', root); ov.setAttribute('aria-label', 'the whole take: click or drag to show that stretch');
  const main = h('div', 'nt-main', root);
  const keys = h('canvas', 'nt-keys', main); keys.setAttribute('aria-hidden', 'true'); keys.title = 'click a key: hear it';
  const rollEl = h('div', 'nt-roll', main);
  const cv = h('canvas', null, rollEl); cv.tabIndex = 0;
  cv.setAttribute('aria-label', 'the notes: click to choose, drag to move, double-click to add or take away; arrow keys move the chosen ones');
  const ph = h('div', 'nt-ph', rollEl);
  const none = h('div', 'nt-none', rollEl, 'the music is loading…');
  const foot = h('div', 'nt-foot', root);
  const selEl = h('span', 'nt-sel', foot), sayEl = h('span', 'nt-say', foot), hint = h('span', null, foot);
  hint.textContent = 'double-click: a note · drag: move (⌥ copies) · its edge: longer · ⌫ away · 0 leave out · ↑↓ a row (⇧ octave) · ←→ grid (⇧ length)';

  // ── the model ─────────────────────────────────────────────────────────
  // The first take a pad sings (the voice's), its notes at the pitches they play (up the take's
  // octaves), the arrangement's bars and chords, and the clips that let it play.
  function readModel() {
    const R = RK(), A = R && R.arrangement, P = R && R.parsed;
    if (!R || !P || !A) { M = null; return; }
    let who = null;
    for (const p of P.score.parts) for (const d of p.pads) for (const v of d.voices) if (!who && v.take) who = { part: p.name, track: v.track, take: v.take };
    const tk = who && P.score.takes.find(t => t.name === who.take);
    if (!tk) { M = { R, P, A, none: true }; return; }
    const oct = 12 * tk.octave, endStep = Math.round(A.duration / A.step);
    const keyOf = (step, pitch) => step + ':' + pitch;
    const before = M && !M.none ? new Map([...sel].map(l => { const x = M.byLn.get(l); return x ? [keyOf(x.step, x.pitch), true] : null; }).filter(Boolean)) : null;
    const notes = tk.notes.map(n => ({ n, ln: n.ln, step: n.step, len: n.len, pitch: n.midi + oct, vel: n.vel, out: n.out, heard: n.heard }));
    let lo = Infinity, hi = -Infinity;
    notes.forEach(x => { lo = Math.min(lo, x.pitch); hi = Math.max(hi, x.pitch); });
    if (lo === Infinity) { lo = 60; hi = 72; }
    const keep = M && !M.none && M.take === who.take ? [M.lo, M.hi] : null;
    M = { R, P, A, tk, ...who, oct, notes, byLn: new Map(notes.map(x => [x.ln, x])), endStep,
      lo: Math.min(lo - 3, keep ? keep[0] : Infinity), hi: Math.max(hi + 3, keep ? keep[1] : -Infinity),
      clips: A.clips.filter(c => c.part === who.part), colour: R.colour ? R.colour(who.part) : '#e98a7a', step: A.step, spb: A.spb };
    rowsOf();
    const lns = new Set(notes.map(x => x.ln));
    if (pendingSel) { sel = new Set(pendingSel.filter(l => lns.has(l))); pendingSel = null; }
    else if (before) sel = new Set(notes.filter(x => before.has(keyOf(x.step, x.pitch))).map(x => x.ln));   // another's edit: the same notes, where they still are
    kind.textContent = `${M.track} · take ${M.take} · ${notes.filter(x => !x.out).length} notes`;
  }
  // the rows: every semitone of the range; Key, only the key's (and any a note is on); Fold, only
  // those a note is on
  function rowsOf() {
    const used = new Set(M.notes.map(x => x.pitch)), rows = [];
    if (opts.fold) [...used].sort((a, b) => b - a).forEach(p => rows.push(p));
    if (!rows.length) for (let p = M.hi; p >= M.lo; p--) if (!opts.scale || inKey(p) || used.has(p)) rows.push(p);
    M.rows = rows; M.rowOf = new Map(rows.map((p, i) => [p, i]));
  }
  // a pitch so many rows up (or down) from p, among the rows shown; past the ends, by semitones
  function rowStep(p, by) {
    const i = M.rowOf.get(p);
    if (i == null || !(opts.scale || opts.fold)) return p + by;
    const j = i - by;
    if (j >= 0 && j < M.rows.length) return M.rows[j];
    return p + by;
  }
  const selNotes = () => (M && !M.none ? M.notes.filter(x => sel.has(x.ln)) : []);
  const inKey = m => { const k = M && M.P.score.key; if (!k) return true; const iv = k.mode === 'minor' ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11]; return iv.includes(((m - k.root) % 12 + 12) % 12); };

  // ── geometry ──────────────────────────────────────────────────────────
  const rollW = () => cv.clientWidth || 800, rollH = () => cv.clientHeight || 200;
  const gridH = () => Math.max(20, rollH() - RULER - VELH);
  const X = t => (t - view.t0) * view.pxs, T = x => view.t0 + x / view.pxs;
  const rowY = i => RULER + i * view.rowH - view.sy;
  const rowAt = y => Math.floor((y - RULER + view.sy) / view.rowH);
  const maxSy = () => Math.max(0, (M && M.rows ? M.rows.length : 0) * view.rowH - gridH());
  const minPxs = () => rollW() / Math.max(1, (M ? M.A.duration : L.duration) + 1);
  const keepView = () => {
    const D = M ? M.A.duration : L.duration;
    view.pxs = clamp(view.pxs, minPxs(), 900);
    view.t0 = clamp(view.t0, -0.5, Math.max(-0.5, D + 0.5 - rollW() / view.pxs));
    view.sy = clamp(view.sy, 0, maxSy());
    put(K_VIEW, { t0: view.t0, pxs: view.pxs, rowH: view.rowH, sy: view.sy });
  };
  function zoomAt(x, f) { const t = T(x); view.pxs = clamp(view.pxs * f, minPxs(), 900); view.t0 = t - x / view.pxs; keepView(); draw(); }
  function fitAll() {
    if (!M || M.none) return;
    const ns = M.notes; if (!ns.length) return;
    const t0 = Math.min(...ns.map(x => x.step)) * M.step, t1 = Math.max(...ns.map(x => x.step + x.len)) * M.step;
    view.pxs = clamp((rollW() - 20) / Math.max(1, t1 - t0), minPxs(), 900); view.t0 = t0 - 10 / view.pxs; keepView(); draw();
  }
  // the rows fill the height when they can, a row no thinner than 10 px nor taller than 22 (more
  // than fit scroll up and down)
  function fitRows(keepTop) {
    if (!M || M.none) return;
    const top = view.sy / view.rowH;
    view.rowH = clamp(Math.floor(gridH() / M.rows.length), 10, 22);
    view.sy = keepTop ? top * view.rowH : view.sy;
    keepView();
  }
  // the grid a move snaps to: the chosen one, or (⌘) the sixteenth
  const snap = (k, g) => Math.round(k / g) * g;

  // ── drawing ───────────────────────────────────────────────────────────
  const dpr = () => window.devicePixelRatio || 1;
  function size(c, w, hh) { const d = dpr(); if (c.width !== Math.round(w * d) || c.height !== Math.round(hh * d)) { c.width = Math.round(w * d); c.height = Math.round(hh * d); } const g = c.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0); return g; }
  const rgba = (hex, a) => { const n = parseInt(String(hex).slice(1), 16); return `rgba(${n >> 16 & 255}, ${n >> 8 & 255}, ${n & 255}, ${a})`; };
  let raf = 0;
  function draw() { if (!raf) raf = requestAnimationFrame(() => { raf = 0; paint(); }); }
  function paint() {
    if (root.hidden) return;
    const ok = M && !M.none;
    none.hidden = !!ok;
    if (!M) none.textContent = 'the music is loading…';
    else if (M.none) none.textContent = 'no take in this score: a pad that sings one ("pad john take john") puts its notes here';
    paintRoll(); paintKeys(); paintOv(); placeHead(L.now()); status();
    bUndo.disabled = !(RK() && RK().canUndo); bRedo.disabled = !(RK() && RK().canRedo);
    bQ.disabled = !sel.size;
  }
  // what a drag would make of a note, while it lasts: where it would start, its pitch and length
  function shown(x) {
    if (!drag || !drag.set || !drag.set.has(x.ln)) return x;
    if (drag.kind === 'move') return Object.assign({}, x, { step: x.step + drag.dt, pitch: x.pitch + drag.dp });
    if (drag.kind === 'resizeR') return Object.assign({}, x, { len: Math.max(1, x.len + drag.dl) });
    if (drag.kind === 'resizeL') { const d = clamp(drag.dt, -x.step, x.len - 1); return Object.assign({}, x, { step: x.step + d, len: x.len - d }); }
    if (drag.kind === 'vel') return Object.assign({}, x, { vel: clamp(x.vel + drag.dv, 0, 1.5) });
    return x;
  }
  function paintRoll() {
    const w = rollW(), H0 = rollH(), g = size(cv, w, H0);
    g.clearRect(0, 0, w, H0);
    if (!M || M.none) return;
    const A = M.A, gh = gridH(), top = RULER, vy = RULER + gh;
    g.font = '500 9px "JetBrains Mono", monospace'; g.textBaseline = 'middle';
    // rows: the key's notes lighter, the rest darker; a stronger line at each C
    g.save(); g.beginPath(); g.rect(0, top, w, gh); g.clip();
    M.rows.forEach((p, i) => {
      const y = rowY(i); if (y + view.rowH < top || y > vy) return;
      g.fillStyle = inKey(p) ? 'rgba(77,201,246,0.07)' : 'rgba(0,0,0,0.2)'; g.fillRect(0, y, w, view.rowH - 1);
      if (p % 12 === 0 || opts.fold) { g.fillStyle = 'rgba(77,201,246,0.16)'; g.fillRect(0, y + view.rowH - 1, w, 1); }
    });
    // where the take cannot play (outside its clips): shaded
    g.fillStyle = 'rgba(0,0,0,0.28)';
    let from = 0;
    M.clips.slice().sort((a, b) => a.t0 - b.t0).forEach(c => { if (c.t0 > from) g.fillRect(X(from), top, X(c.t0) - X(from), gh); from = Math.max(from, c.t1); });
    if (from < A.duration) g.fillRect(X(from), top, X(A.duration) - X(from), gh);
    g.fillRect(X(A.duration), top, w, gh);
    // the grid, the beats, the bars
    const gs = opts.grid * A.step * view.pxs, t0 = Math.max(0, view.t0), t1 = T(w);
    const lines = (every, style) => { if (every * view.pxs < 5) return; g.fillStyle = style; for (let t = Math.ceil(t0 / every) * every; t <= t1; t += every) g.fillRect(Math.round(X(t)), top, 1, gh + VELH); };
    if (gs >= 6) lines(opts.grid * A.step, 'rgba(77,201,246,0.06)');
    lines(A.beat, 'rgba(77,201,246,0.12)');
    lines(A.bar, 'rgba(77,201,246,0.32)');
    // the scenes' cuts, faint and gold, down the rows
    cuts().forEach(c => { const x = X(c.t); if (x < -2 || x > w + 2) return; g.fillStyle = 'rgba(212,175,55,0.28)'; for (let y = top; y < vy; y += 6) g.fillRect(Math.round(x), y, 1, 3); });
    // what was sung, under the notes
    if (opts.sung) {
      const R = (RM() && RM().BEND_RATE) || 32;
      g.lineWidth = 1.2; g.lineJoin = 'round';
      M.notes.forEach(x => {
        const n = x.n; if (!x.heard) return;
        const ts = n.step * A.step + n.early / 1000, c = n.curve.length ? n.curve : [0, 0], dur = n.curve.length ? (c.length - 1) / R : n.len * A.step;
        if (X(ts + dur) < 0 || X(ts) > w) return;
        g.strokeStyle = sel.has(x.ln) ? 'rgba(234,245,250,0.6)' : 'rgba(178,232,250,0.3)';
        g.beginPath();
        c.forEach((v, i) => { const px = X(ts + (n.curve.length ? i / R : i * dur)), yy = pitchY(n.sung + M.oct + v / 100); i ? g.lineTo(px, yy) : g.moveTo(px, yy); });
        g.stroke();
      });
    }
    // the notes: left out ones dotted, the rest filled by how loud; the chosen ones outlined
    const draws = M.notes.map(x => ({ x, s: shown(x) }));
    if (drag && drag.kind === 'copy') drag.notes.forEach(x => draws.push({ x, s: Object.assign({}, x, { step: x.step + drag.dt, pitch: x.pitch + drag.dp }), ghost: true }));
    for (const { x, s, ghost } of draws) {
      const i = M.rowOf.get(s.pitch); if (i == null) continue;
      const x0 = X(s.step * A.step), x1 = X((s.step + s.len) * A.step), y = rowY(i);
      if (x1 < 0 || x0 > w || y + view.rowH < top || y > vy) continue;
      const on = sel.has(x.ln) && !ghost, wv = Math.max(2, x1 - x0 - 1), hh = view.rowH - 2;
      if (x.out) {
        g.setLineDash([2, 2]); g.strokeStyle = on ? '#eaf5fa' : 'rgba(178,232,250,0.5)'; g.lineWidth = 1;
        g.strokeRect(x0 + 0.5, y + 1.5, wv - 1, hh - 1); g.setLineDash([]);
        continue;
      }
      g.globalAlpha = (ghost ? 0.5 : 1) * (0.42 + 0.5 * Math.min(1, s.vel));
      g.fillStyle = M.colour; g.fillRect(x0, y + 1, wv, hh);
      g.globalAlpha = 1;
      g.strokeStyle = on ? '#eaf5fa' : rgba(M.colour, 0.95); g.lineWidth = on ? 1.5 : 1;
      g.strokeRect(x0 + 0.5, y + 1.5, wv - 1, hh - 1);
      if (wv >= 28 && view.rowH >= 11) { g.fillStyle = on ? '#020a12' : 'rgba(2,10,18,0.8)'; g.fillText(nm(s.pitch), x0 + 4, y + 1 + hh / 2); }
    }
    // the box being drawn
    if (drag && drag.kind === 'marquee') {
      const a = Math.min(drag.x0, drag.x1), b = Math.min(drag.y0, drag.y1);
      g.fillStyle = 'rgba(212,175,55,0.08)'; g.strokeStyle = 'rgba(212,175,55,0.8)'; g.lineWidth = 1; g.setLineDash([3, 3]);
      g.fillRect(a, b, Math.abs(drag.x1 - drag.x0), Math.abs(drag.y1 - drag.y0)); g.strokeRect(a + 0.5, b + 0.5, Math.abs(drag.x1 - drag.x0), Math.abs(drag.y1 - drag.y0)); g.setLineDash([]);
    }
    g.restore();
    // the velocity strip: a stem a note, its head at its level (1 at the top)
    g.fillStyle = 'rgba(2,10,18,0.45)'; g.fillRect(0, vy, w, VELH);
    g.fillStyle = 'rgba(77,201,246,0.25)'; g.fillRect(0, vy, w, 1);
    g.fillStyle = 'rgba(149,174,187,0.75)'; g.fillText('level', 4, vy + 8);
    for (const { x, s } of draws) {
      if (x.out) continue;
      const px = X(s.step * A.step); if (px < -4 || px > w + 4) continue;
      const vh = (VELH - 8) * Math.min(1, s.vel / 1), on = sel.has(x.ln);
      g.fillStyle = on ? '#eaf5fa' : rgba(M.colour, 0.9);
      g.fillRect(Math.round(px), vy + VELH - 2 - vh, 1.5, vh);
      g.fillRect(Math.round(px) - 2, vy + VELH - 2 - vh - 1.5, 5.5, 3);
    }
    // the ruler: the bars (numbered where there is room), each bar's chord, the scenes' cuts
    g.fillStyle = 'rgba(2,10,18,0.55)'; g.fillRect(0, 0, w, RULER);
    g.fillStyle = 'rgba(77,201,246,0.3)'; g.fillRect(0, RULER - 1, w, 1);
    const barPx = A.bar * view.pxs, every = [1, 2, 4, 8, 16].find(k => k * barPx >= 26) || 16;
    for (let b = Math.max(0, Math.floor(view.t0 / A.bar)); b < A.bars && b * A.bar <= t1; b++) {
      const x = X(b * A.bar);
      g.fillStyle = 'rgba(77,201,246,0.45)'; g.fillRect(Math.round(x), 12, 1, RULER - 12);
      if (b % every === 0) { g.fillStyle = 'rgba(234,245,250,0.85)'; g.fillText(String(b + 1), x + 3, 7); }
      const hm = A.harmony[b];
      if (hm && barPx >= 34 && (b === 0 || !A.harmony[b - 1] || A.harmony[b - 1].chord.name !== hm.chord.name || barPx >= 60)) { g.fillStyle = 'rgba(149,174,187,0.95)'; g.fillText(hm.chord.name, x + 3, 18); }
    }
    cuts().forEach(c => {
      const x = X(c.t); if (x < -10 || x > w + 10) return;
      g.fillStyle = '#d4af37'; g.beginPath(); g.moveTo(x - 4, 0); g.lineTo(x + 4, 0); g.lineTo(x, 6); g.closePath(); g.fill();
      if (barPx >= 18) { g.fillStyle = 'rgba(212,175,55,0.95)'; g.fillText(String(c.i + 1), x + 5, 4); }
    });
  }
  // a pitch's height (cents and all) among the rows shown: between the two rows round it
  const pitchY = p => {
    const r = M.rows; let i = r.findIndex(q => q <= p);
    if (i < 0) return rowY(r.length - 1) + view.rowH / 2;
    if (i === 0 || r[i] === p) return rowY(i) + view.rowH / 2 - (i === 0 ? (p - r[0]) * view.rowH : 0);
    const f = (p - r[i]) / (r[i - 1] - r[i]);
    return rowY(i) + view.rowH / 2 - f * view.rowH;
  };
  function paintKeys() {
    const kh = rollH(), g = size(keys, KEYW, kh);
    g.clearRect(0, 0, KEYW, kh);
    if (!M || M.none) return;
    const gh = gridH();
    g.fillStyle = 'rgba(2,10,18,0.55)'; g.fillRect(0, 0, KEYW, RULER);
    g.save(); g.beginPath(); g.rect(0, RULER, KEYW, gh); g.clip();
    g.font = '500 9px "JetBrains Mono", monospace'; g.textBaseline = 'middle';
    M.rows.forEach((p, i) => {
      const y = rowY(i); if (y + view.rowH < RULER || y > RULER + gh) return;
      const black = BLACK.has(((p % 12) + 12) % 12);
      g.fillStyle = black ? '#0b1a24' : '#c9dde6'; g.fillRect(0, y, black ? KEYW * 0.62 : KEYW, view.rowH - 1);
      if (black) { g.fillStyle = '#c9dde6'; g.fillRect(KEYW * 0.62, y, KEYW * 0.38, view.rowH - 1); }
      if (p % 12 === 0 || opts.fold || view.rowH >= 14) { g.fillStyle = black ? '#c9dde6' : '#0b1a24'; g.fillText(nm(p), 3, y + view.rowH / 2); }
    });
    g.restore();
    g.fillStyle = 'rgba(2,10,18,0.45)'; g.fillRect(0, RULER + gh, KEYW, VELH);
  }
  // the whole take at the top: every note, the cuts, and the stretch in view
  function paintOv() {
    const w = ov.clientWidth || 800, hh = ov.clientHeight || 14, g = size(ov, w, hh);
    g.clearRect(0, 0, w, hh);
    if (!M || M.none) return;
    const A = M.A, D = A.duration, Xo = t => KEYW + (t / D) * (w - KEYW - 2);
    g.fillStyle = 'rgba(77,201,246,0.05)'; g.fillRect(KEYW, 0, w - KEYW, hh);
    const span = Math.max(1, M.hi - M.lo);
    g.fillStyle = M.colour;
    M.notes.forEach(x => { if (x.out) return; g.globalAlpha = 0.8; g.fillRect(Xo(x.step * A.step), 2 + (M.hi - x.pitch) / span * (hh - 5), Math.max(1, Xo((x.step + x.len) * A.step) - Xo(x.step * A.step) - 0.5), 1.6); });
    g.globalAlpha = 1;
    cuts().forEach(c => { g.fillStyle = 'rgba(212,175,55,0.6)'; g.fillRect(Xo(c.t), 0, 1, hh); });
    g.strokeStyle = '#eaf5fa'; g.lineWidth = 1; g.strokeRect(Xo(Math.max(0, view.t0)) + 0.5, 0.5, Math.max(4, Xo(Math.min(D, T(rollW()))) - Xo(Math.max(0, view.t0)) - 1), hh - 1);
    g.fillStyle = '#d4af37'; g.fillRect(Xo(L.now()), 0, 1.5, hh);
  }
  // the scenes' cuts on the reel's clock
  function cuts() {
    const S = window.ReelScript, P = L.parsed;
    if (!S || !P) return [];
    return S.spans(P.edit).map((s, i) => ({ t: s.start, i })).filter(c => c.i > 0);
  }
  function placeHead(t) {
    const x = X(t);
    ph.hidden = root.hidden || !M || M.none || x < 0 || x > rollW();
    if (!ph.hidden) ph.style.transform = `translateX(${x.toFixed(1)}px)`;
  }
  // the chosen notes in words, and what the last action came to
  function status() {
    const S = selNotes();
    if (!S.length) selEl.textContent = M && !M.none ? `${M.notes.filter(x => !x.out).length} notes · grid ${GRIDS.find(g => g[0] === opts.grid)[1]}` : '';
    else {
      const a = S.reduce((m, x) => (x.step < m.step ? x : m), S[0]), pos = RM().posText(a.step, M.spb);
      const pitches = [...new Set(S.map(x => nm(x.pitch)))].slice(0, 4).join(' ');
      const lens = [...new Set(S.map(x => x.len))], vels = [...new Set(S.map(x => x.vel.toFixed(2)))];
      selEl.textContent = `${S.length === 1 ? '1 note' : S.length + ' notes'} · ${pos} · ${pitches}${S.length > 4 ? ' …' : ''} · ${lens.length === 1 ? lenText(lens[0]) : 'lengths vary'} · level ${vels.length === 1 ? vels[0] : 'varies'}`
        + (S.some(x => x.out) ? ' · left out' : '') + (S.length === 1 && S[0].heard ? ' · sung' : S.length === 1 ? ' · added' : '');
    }
    sayEl.textContent = say; sayEl.classList.toggle('err', /^!/.test(say));
    if (/^!/.test(say)) sayEl.textContent = say.slice(1);
  }
  const lenText = k => { const f = { 1: '1/16', 2: '1/8', 3: '3/16', 4: '1/4', 6: '3/8', 8: '1/2', 12: '3/4', 16: '1 bar' }; return f[k] || k + '/16'; };
  let sayTimer = 0;
  const tell = (text, err) => { say = (err ? '!' : '') + text; clearTimeout(sayTimer); sayTimer = setTimeout(() => { say = ''; status(); }, 4000); status(); };

  // ── edits: one ReelMusic.editTake, through the rack ───────────────────
  function commit(ops) {
    ops = ops.filter(Boolean);
    if (!ops.length || !M || M.none) { draw(); return false; }
    let res;
    try { res = RM().editTake(M.R.src, M.take, ops); } catch (e) { tell((e.errors || [e.message]).join(' · '), true); draw(); return false; }
    if (res.text === M.R.src) { draw(); return false; }
    pendingSel = res.lns.filter(l => l != null);
    if (!M.R.change(res.text)) { pendingSel = null; tell('the change did not take', true); }
    return true;
  }
  function undo(back) {
    const T2 = window.REEL_TIMELINE;
    if (T2) back ? T2.undo() : T2.redo();          // the one Undo: the last edit, the score's or the script's
    else { const R = RK(); if (R) back ? R.undo() : R.redo(); }
  }
  const room = (notes, d) => clamp(d, -Math.min(...notes.map(x => x.step)), M.endStep - 1 - Math.max(...notes.map(x => x.step)));
  function quantize() {
    const S = selNotes(); if (!S.length) { tell('choose the notes to quantize'); return; }
    const g = opts.grid, ops = S.map(x => { const q = clamp(snap(x.step, g), 0, M.endStep - 1); return q !== x.step ? { ln: x.ln, step: q } : null; }).filter(Boolean);
    if (!ops.length) { tell('they are on the grid already'); return; }
    commit(ops); tell(`${ops.length} on the ${lenText(g)} grid`);
  }
  function duplicate() {
    const S = selNotes().filter(x => !x.out); if (!S.length) return;
    const s0 = Math.min(...S.map(x => x.step)), s1 = Math.max(...S.map(x => x.step + x.len)), span = Math.max(opts.grid, Math.ceil((s1 - s0) / opts.grid) * opts.grid);
    const ops = S.filter(x => x.step + span < M.endStep).map(x => ({ add: { step: x.step + span, midi: x.pitch - M.oct, len: x.len, vel: x.vel } }));
    if (commit(ops)) tell(`a copy, ${lenText(span)} later`);
  }
  function copySel() {
    const S = selNotes().filter(x => !x.out); if (!S.length) return;
    const s0 = Math.min(...S.map(x => x.step));
    clip = S.map(x => ({ d: x.step - s0, midi: x.pitch - M.oct, len: x.len, vel: x.vel }));
    tell(`${clip.length} copied: ⌘V puts them at the playhead`);
  }
  function paste() {
    if (!clip || !clip.length) { tell('nothing copied (⌘C)'); return; }
    const at = clamp(snap(Math.round(L.now() / M.step), opts.grid), 0, M.endStep - 1);
    if (commit(clip.filter(c => at + c.d < M.endStep).map(c => ({ add: { step: at + c.d, midi: c.midi, len: c.len, vel: c.vel } })))) tell(`pasted at ${RM().posText(at, M.spb)}`);
  }
  function toggleOut() {
    const S = selNotes(); if (!S.length) return;
    const to = !S.every(x => x.out);
    commit(S.map(x => ({ ln: x.ln, out: to })));
    tell(to ? `${S.length} left out (0 puts ${S.length > 1 ? 'them' : 'it'} back)` : `${S.length} put back`);
  }
  // a note now, on its own (not while the reel plays: the preview would cut it)
  function audition(x, pitch) {
    if (!opts.hear || L.isPlaying() || !M || M.none) return;
    const E = RK() && RK().engine; if (!E) return;
    E.preview([{ track: M.track, t: 0, dur: clamp(x.len * M.step, 0.12, 0.6), vel: x.vel || 0.8, midi: pitch != null ? pitch : x.pitch, tone: 0 }]);
  }

  // ── the pointer ───────────────────────────────────────────────────────
  const local = e => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  function hitNote(x, y) {
    if (y < RULER || y > RULER + gridH()) return null;
    for (let k = M.notes.length - 1; k >= 0; k--) {          // the last drawn first; a playing note before a left-out one
      const nt = M.notes[k], i = M.rowOf.get(nt.pitch); if (i == null) continue;
      const x0 = X(nt.step * M.step), x1 = X((nt.step + nt.len) * M.step), y0 = rowY(i);
      if (y < y0 || y > y0 + view.rowH || x < x0 - 2 || x > x1 + 2) continue;
      const w = x1 - x0, er = Math.min(8, Math.max(4, w * 0.3));
      if (nt.out && M.notes.some(o => !o.out && o.pitch === nt.pitch && X(o.step * M.step) <= x && X((o.step + o.len) * M.step) >= x)) continue;
      return { nt, edge: x >= x1 - er ? 'r' : x <= x0 + 4 && w > 18 ? 'l' : null };
    }
    return null;
  }
  // the stem in the velocity strip nearest the pointer (within 8 px)
  function hitStem(x) {
    let best = null, bd = 8;
    M.notes.forEach(nt => { if (nt.out) return; const d = Math.abs(X(nt.step * M.step) - x); if (d < bd || (d === bd && sel.has(nt.ln))) { bd = d; best = nt; } });
    return best;
  }
  cv.addEventListener('pointerdown', e => {
    if (e.button !== 0 || !M || M.none) return;
    cv.focus({ preventScroll: true });
    const { x, y } = local(e);
    if (y < RULER) { scrub(e); return; }
    if (y > RULER + gridH()) {
      const nt = hitStem(x); if (!nt) return;
      if (!sel.has(nt.ln)) sel = new Set([nt.ln]);
      drag = { kind: 'vel', y0: y, notes: selNotes().filter(q => !q.out), dv: 0, moved: false };
      drag.set = new Set(drag.notes.map(q => q.ln));
    } else {
      const ht = hitNote(x, y);
      if (ht) {
        const nt = ht.nt;
        if (e.shiftKey && sel.has(nt.ln)) { sel.delete(nt.ln); draw(); return; }
        if (e.shiftKey) sel.add(nt.ln); else if (!sel.has(nt.ln)) sel = new Set([nt.ln]);
        audition(nt);
        const k = ht.edge === 'r' ? 'resizeR' : ht.edge === 'l' ? 'resizeL' : (e.altKey || e.ctrlKey) ? 'copy' : 'move';
        drag = { kind: k, x0: x, y0: y, anchor: nt, notes: selNotes(), dt: 0, dp: 0, dl: 0, moved: false, free: e.metaKey, heard: nt.pitch };
        drag.set = new Set(drag.notes.map(q => q.ln));
        if (k === 'copy') drag.set = new Set();               // the originals stay; the copies are drawn
      } else {
        if (!e.shiftKey) sel = new Set();
        drag = { kind: 'marquee', x0: x, y0: y, x1: x, y1: y, base: new Set(sel), moved: false };
      }
    }
    cv.setPointerCapture(e.pointerId);
    draw();
  });
  cv.addEventListener('pointermove', e => {
    const { x, y } = local(e);
    if (!drag) { hover(x, y); return; }
    const dx = x - drag.x0, dy = y - drag.y0;
    if (!drag.moved && Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
    drag.moved = true;
    const A = M.A, raw = dx / view.pxs / A.step, g = drag.free ? 1 : opts.grid;
    if (drag.kind === 'move' || drag.kind === 'copy') {
      const a = drag.anchor;
      let dt = room(drag.notes, snap(a.step + raw, g) - a.step);
      const r0 = M.rowOf.get(a.pitch), r1 = clamp(r0 + Math.round(dy / view.rowH), 0, M.rows.length - 1);
      let dp = M.rows[r1] - a.pitch;
      if (e.shiftKey) { if (Math.abs(dx) >= Math.abs(dy)) dp = 0; else dt = 0; }
      if (dp !== drag.dp) audition(a, a.pitch + dp);
      drag.dt = dt; drag.dp = dp;
    } else if (drag.kind === 'resizeR') {
      const a = drag.anchor, end = a.step + a.len;
      drag.dl = Math.max(1 - Math.min(...drag.notes.map(q => q.len)), snap(end + raw, g) - end);
    } else if (drag.kind === 'resizeL') {
      const a = drag.anchor;
      drag.dt = snap(a.step + raw, g) - a.step;
    } else if (drag.kind === 'vel') {
      drag.dv = -dy / (VELH - 8);
    } else if (drag.kind === 'marquee') {
      drag.x1 = x; drag.y1 = y;
      const xa = Math.min(drag.x0, x), xb = Math.max(drag.x0, x), ya = Math.min(drag.y0, y), yb = Math.max(drag.y0, y);
      sel = new Set(drag.base);
      M.notes.forEach(nt => {
        const i = M.rowOf.get(nt.pitch); if (i == null) return;
        const x0 = X(nt.step * M.step), x1 = X((nt.step + nt.len) * M.step), y0 = rowY(i);
        if (x1 >= xa && x0 <= xb && y0 + view.rowH >= ya && y0 <= yb) sel.add(nt.ln);
      });
    }
    draw();
  });
  const endDrag = e => {
    if (!drag) return;
    const d = drag; drag = null;
    try { cv.releasePointerCapture(e.pointerId); } catch (err) { /* already gone */ }
    if (!d.moved) { draw(); return; }
    const mid = x => x.pitch - M.oct;
    if (d.kind === 'move' && (d.dt || d.dp)) commit(d.notes.map(x => ({ ln: x.ln, step: d.dt ? x.step + d.dt : null, midi: d.dp ? mid(x) + d.dp : null })));
    else if (d.kind === 'copy' && (d.dt || d.dp)) commit(d.notes.filter(x => !x.out).map(x => ({ add: { step: x.step + d.dt, midi: mid(x) + d.dp, len: x.len, vel: x.vel } })));
    else if (d.kind === 'resizeR' && d.dl) { commit(d.notes.map(x => ({ ln: x.ln, len: Math.max(1, x.len + d.dl) }))); lastLen = Math.max(1, d.anchor.len + d.dl); }
    else if (d.kind === 'resizeL' && d.dt) commit(d.notes.map(x => { const dd = clamp(d.dt, -x.step, x.len - 1); return dd ? { ln: x.ln, step: x.step + dd, len: x.len - dd } : null; }));
    else if (d.kind === 'vel' && d.dv) commit(d.notes.map(x => ({ ln: x.ln, vel: Math.round(clamp(x.vel + d.dv, 0, 1.5) * 100) / 100 })));
    draw();
  };
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', e => { drag = null; draw(); });
  // double-click: a note away, or a new one where none was (as long as the last one made)
  cv.addEventListener('dblclick', e => {
    if (!M || M.none) return;
    const { x, y } = local(e);
    if (y < RULER || y > RULER + gridH()) return;
    const ht = hitNote(x, y);
    if (ht) { if (commit([{ ln: ht.nt.ln, remove: true }])) tell(ht.nt.heard ? 'left out (what was sung stays, dotted; 0 puts it back)' : 'taken away'); return; }
    const i = rowAt(y), p = M.rows[clamp(i, 0, M.rows.length - 1)], step = clamp(Math.floor(T(x) / M.step / opts.grid) * opts.grid, 0, M.endStep - 1);
    const len = Math.max(1, Math.min(lastLen, M.endStep - step));
    if (commit([{ add: { step, midi: p - M.oct, len, vel: 0.8 } }])) audition({ pitch: p, len, vel: 0.8 });
  });
  function hover(x, y) {
    if (!M || M.none) return;
    if (y < RULER) { cv.style.cursor = 'col-resize'; return; }
    if (y > RULER + gridH()) { cv.style.cursor = hitStem(x) ? 'ns-resize' : 'default'; return; }
    const ht = hitNote(x, y);
    cv.style.cursor = ht ? (ht.edge ? 'ew-resize' : 'grab') : 'crosshair';
  }
  // the ruler: the playhead goes where it is clicked, and follows a drag; the reel plays on after
  function scrub(e) {
    const was = L.isPlaying(); if (was) L.setPlaying(false);
    const go = ev => L.seek(clamp(T(local(ev).x), 0, L.duration));
    go(e);
    const mv = ev => go(ev), up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); if (was) L.setPlaying(true); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  }
  // the overview: the view goes where it is clicked (dragged, it follows)
  ov.addEventListener('pointerdown', e => {
    if (!M || M.none) return;
    const w = ov.clientWidth, go = ev => { const r = ov.getBoundingClientRect(), t = (ev.clientX - r.left - KEYW) / (w - KEYW - 2) * M.A.duration; view.t0 = t - rollW() / view.pxs / 2; keepView(); draw(); };
    go(e);
    const mv = ev => go(ev), up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  });
  // a key on the piano: heard
  keys.addEventListener('pointerdown', e => {
    if (!M || M.none) return;
    const r = keys.getBoundingClientRect(), y = e.clientY - r.top, i = rowAt(y);
    if (i < 0 || i >= M.rows.length || y < RULER) return;
    const was = opts.hear; opts.hear = true; audition({ pitch: M.rows[i], len: 3, vel: 0.8 }); opts.hear = was;
  });
  // the wheel: across in time (Shift, or a sideways swipe), up and down the rows; ⌘ or a pinch zooms
  const wheel = e => {
    if (!M || M.none) return;
    e.preventDefault();
    const { x } = local(e);
    if (e.ctrlKey || e.metaKey) { zoomAt(x, Math.exp(-e.deltaY * 0.01)); return; }
    if (e.altKey) { const top = view.sy / view.rowH; view.rowH = clamp(view.rowH * Math.exp(-e.deltaY * 0.006), 7, 28); view.sy = top * view.rowH; keepView(); draw(); return; }
    const dx = e.shiftKey ? e.deltaY : e.deltaX, dy = e.shiftKey ? 0 : e.deltaY;
    if (dx) view.t0 += dx / view.pxs;
    if (dy) { if (maxSy() > 0) view.sy += dy; else view.t0 += dy / view.pxs; }
    keepView(); draw();
  };
  cv.addEventListener('wheel', wheel, { passive: false });
  keys.addEventListener('wheel', wheel, { passive: false });

  // ── keys, with the roll in focus ──────────────────────────────────────
  const stop = e => { e.preventDefault(); e.stopPropagation(); };
  cv.addEventListener('keydown', e => {
    if (!M || M.none) return;
    const mod = e.metaKey || e.ctrlKey, S = selNotes(), k = e.key;
    if ((k === 'Delete' || k === 'Backspace') && S.length) { stop(e); commit(S.map(x => ({ ln: x.ln, remove: true }))); tell(S.some(x => x.heard) ? 'sung notes left out (dotted), added ones taken away' : 'taken away'); return; }
    if ((k === 'ArrowLeft' || k === 'ArrowRight') && S.length) {
      stop(e);
      const dir = k === 'ArrowRight' ? 1 : -1;
      if (e.shiftKey) { commit(S.map(x => ({ ln: x.ln, len: Math.max(1, x.len + dir * opts.grid) }))); return; }
      const d = room(S, dir * (e.altKey ? 1 : opts.grid)); if (d) commit(S.map(x => ({ ln: x.ln, step: x.step + d })));
      return;
    }
    if ((k === 'ArrowUp' || k === 'ArrowDown') && S.length) {
      stop(e);
      const by = k === 'ArrowUp' ? 1 : -1, to = x => (e.shiftKey ? x.pitch + 12 * by : rowStep(x.pitch, by));   // a row (Key: the next note of it), Shift an octave
      commit(S.map(x => ({ ln: x.ln, midi: to(x) - M.oct })));
      audition(S[0], to(S[0]));
      return;
    }
    if (mod && (k === 'd' || k === 'D')) { stop(e); duplicate(); return; }
    if (mod && (k === 'a' || k === 'A')) { stop(e); sel = new Set(M.notes.filter(x => !x.out).map(x => x.ln)); draw(); return; }
    if (mod && (k === 'c' || k === 'C')) { stop(e); copySel(); return; }
    if (mod && (k === 'v' || k === 'V')) { stop(e); paste(); return; }
    if (mod && (k === 'u' || k === 'U')) { stop(e); quantize(); return; }
    if (mod && (k === '1' || k === '2')) {
      stop(e);
      const i = GRIDS.findIndex(g => g[0] === opts.grid), j = clamp(i + (k === '1' ? -1 : 1), 0, GRIDS.length - 1);
      opts.grid = GRIDS[j][0]; gridSel.value = String(opts.grid); put(K_OPT, opts); draw(); return;
    }
    if (mod || e.altKey) return;
    if (k === '0' && S.length) { stop(e); toggleOut(); return; }
    if ((k === 'q' || k === 'Q') && S.length) { stop(e); quantize(); return; }
    if (k === 'Escape' && sel.size) { stop(e); sel = new Set(); draw(); return; }
    if (k === '=' || k === '+') { stop(e); zoomAt(rollW() / 2, 1.5); return; }
    if (k === '-') { stop(e); zoomAt(rollW() / 2, 1 / 1.5); return; }
  });

  // ── open and shut; the panel's place ──────────────────────────────────
  // The notes take the timeline's place at the foot of the window (it comes back when they shut),
  // keep left of the synth rack when it stands beside the preview, and are as tall as you drag them.
  function fitPanel() {
    const hud = document.getElementById('hud'), hh = hud && !hud.hidden ? hud.getBoundingClientRect().height : 0;
    const rack = document.getElementById('reel-rack'), rw = rack && !rack.hidden && !rack.classList.contains('rk-over') ? rack.getBoundingClientRect().width : 0;
    root.style.bottom = Math.round(hh) + 'px'; root.style.right = Math.round(rw) + 'px';
    const roomH = Math.max(MINH, Math.round(innerHeight - hh - 170)), hNow = clamp(H, MINH, roomH);
    root.style.height = hNow + 'px';
    L.reserveBottom(hh + hNow);
    refit();
  }
  let tool = null;
  function show(open, at) {
    if (open === !root.hidden) { if (open && at != null) reveal(at); return; }
    if (open) {
      const tl = document.getElementById('reel-tl');
      timelineWas = !!(tl && !tl.hidden && window.REEL_TIMELINE);
      if (timelineWas) window.REEL_TIMELINE.show(false);
      root.hidden = false; put(K_OPEN, true);
      fitPanel(); readModel();
      if (!get(K_VIEW, null)) { view.pxs = rollW() / 16; view.t0 = Math.max(0, L.now() - 2); }
      fitRows(false);
      if (M && !M.none && view.sy === 0) centreRows();
      if (at != null) reveal(at);
      keepView(); draw();
      setTimeout(() => cv.focus({ preventScroll: true }), 0);
    } else {
      root.hidden = true; put(K_OPEN, false);
      const tl = document.getElementById('reel-tl');
      if (timelineWas && window.REEL_TIMELINE) window.REEL_TIMELINE.show(true);       // it reserves its own room
      else if (tl && !tl.hidden) dispatchEvent(new Event('resize'));                  // shown already (E): it sizes itself again
      else L.reserveBottom(0);
      timelineWas = false;
    }
    if (tool) tool.setAttribute('aria-pressed', String(open));
  }
  // the rows the take uses, in the middle of the view
  function centreRows() {
    const ps = M.notes.filter(x => !x.out).map(x => M.rowOf.get(x.pitch)).filter(i => i != null);
    if (!ps.length) return;
    const mid = (Math.min(...ps) + Math.max(...ps) + 1) / 2;
    view.sy = mid * view.rowH - gridH() / 2; keepView();
  }
  // a moment brought into view (a click in the timeline's voice lane, the take view's button)
  function reveal(t) { const w = rollW() / view.pxs; if (t < view.t0 + w * 0.1 || t > view.t0 + w * 0.9) { view.t0 = t - w * 0.25; keepView(); } draw(); }
  // the panel taller or shorter, by its top edge
  grip.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    const y0 = e.clientY, h0 = root.getBoundingClientRect().height;
    grip.setPointerCapture(e.pointerId);
    const mv = ev => { H = Math.round(h0 + (y0 - ev.clientY)); put(K_H, H); fitPanel(); fitRows(true); draw(); };
    const up = () => { grip.removeEventListener('pointermove', mv); grip.removeEventListener('pointerup', up); };
    grip.addEventListener('pointermove', mv); grip.addEventListener('pointerup', up);
  });
  addEventListener('resize', () => { if (!root.hidden) { fitPanel(); keepView(); draw(); } });
  // the timeline shown again (E) while the notes are open: they give it the foot of the window
  const tlWatch = new MutationObserver(() => { const tl = document.getElementById('reel-tl'); if (tl && !tl.hidden && !root.hidden) { timelineWas = false; show(false); } });
  const watchTl = () => { const tl = document.getElementById('reel-tl'); if (tl) tlWatch.observe(tl, { attributes: true, attributeFilter: ['hidden'] }); else setTimeout(watchTl, 500); };
  watchTl();

  // the score changed (here, in the rack, the timeline, an undo): drawn again, the chosen notes kept
  addEventListener('reel-score', () => { readModel(); if (!root.hidden) draw(); });
  if (L.onChange) L.onChange(() => { if (!root.hidden) draw(); });
  // every frame: the playhead, and (playing, Follow on) the view kept on it
  L.onFrame(t => {
    if (root.hidden || !M || M.none) return;
    if (opts.follow && L.isPlaying() && !drag) {
      const w = rollW(), x = X(t);
      if (x > w * 0.92 || x < 0) { view.t0 = t - (w * 0.08) / view.pxs; keepView(); draw(); }
    }
    placeHead(t);
    if (performance.now() - (paintOv.at || 0) > 120) { paintOv.at = performance.now(); paintOv(); }
  });
  // the key and the HUD's button
  addEventListener('keydown', e => {
    if (e.target.closest && e.target.closest('input, textarea, select, [contenteditable]')) return;
    if ((e.key === 'n' || e.key === 'N') && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); show(root.hidden); }
  });
  if (L.addTool) tool = L.addTool({ id: 'notes', label: 'Notes', key: 'N', order: 22, icon: 'notes',
    title: 'the voice\'s notes as a piano roll: move, stretch, add and take out notes on the grid', onClick: () => show(root.hidden) });

  window.REEL_NOTES = {
    show: (on = true, at) => show(!!on, at), get open() { return !root.hidden; },
    get selection() { return selNotes().map(x => x.ln); }, select: lns => { sel = new Set(lns); draw(); },
    get view() { return Object.assign({}, view, { keyW: KEYW, ruler: RULER, velH: VELH }); },
    // where a note is drawn, in the window's pixels (for tests): its box
    box: ln => { const x = M && M.byLn.get(ln); if (!x) return null; const i = M.rowOf.get(x.pitch), r = cv.getBoundingClientRect(); return { x: r.left + X(x.step * M.step), w: (x.len * M.step) * view.pxs, y: r.top + rowY(i), h: view.rowH }; },
    point: (t, pitch) => { const r = cv.getBoundingClientRect(), i = M.rowOf.get(pitch); return { x: r.left + X(t), y: r.top + rowY(i) + view.rowH / 2 }; },
    get model() { return M; }, commit, draw,
  };
  if (get(K_OPEN, false)) {
    const ready = () => (RK() && RK().arrangement ? show(true) : setTimeout(ready, 300));
    ready();
  }
})();
