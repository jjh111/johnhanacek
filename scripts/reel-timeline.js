// The reel's timeline: edit a sizzle reel script by dragging its times, in the preview itself.
//
// The script (Assets/sizzle-reel-2.script.txt) stays the one source of truth. This panel only
// reads it (REEL_LIVE.parsed) and changes it the way a person would, one line at a time, through
// ReelScript's setDur / setAt / setField / setCue, then hands the new text to REEL_LIVE.save,
// which writes the file through the dev server (node scripts/reel-dev.mjs), or keeps it with the
// page's host (the editor published on claude.ai), or keeps a draft in this tab, and reloads the
// preview at the same moment. So the panel keeps no state of its own
// beyond what must survive that reload: open or shut, the scene in the inspector, and the undo
// and redo stacks (whole script texts, in sessionStorage).
//
//   E                open / shut (the preview shrinks to fit above it)
//   drag a scene's right edge   its length; everything after it ripples
//   drag an item's right edge   its length, and its results scene grows with it, so the items
//                               before it stay put (items are hung from the scene's end)
//   drag a beat / an out mark   its @ time / the scene's `cue out`
//   snap             0.25 s;  Shift: 0.5 s (a beat at 120 BPM);  Alt/Option: 0.05 s
//   click a scene    seek to it and open the inspector: every line of the scene as an input
//   Cmd/Ctrl+Z       undo, Shift+Cmd/Ctrl+Z redo (each is a save, so each reloads)
//
// A classic script the rig injects in live mode only, after defining window.REEL_LIVE; without
// it this does nothing. Its DOM and its <style> are its own, all under #reel-tl. About eighty
// absolutely placed elements are laid out on open and on resize; a frame moves only the playhead.
(function () {
  'use strict';
  const L = window.REEL_LIVE, RS = window.ReelScript;
  if (!L || !RS || document.getElementById('reel-tl')) return;

  // ── storage that survives the reload every save causes ────────────────
  const get = (k, d) => { try { const v = sessionStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
  const put = (k, v) => { try { sessionStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
  const K_OPEN = 'reel-tl-open', K_SEL = 'reel-tl-sel:' + L.file, K_UNDO = 'reel-undo:' + L.file, K_REDO = 'reel-redo:' + L.file;
  const DEPTH = 30;

  // ── the model: where everything is, read from the parse ───────────────
  const P = L.parsed, EDIT = P.edit, SP = RS.spans(EDIT), DUR = L.duration;
  const lines = String(L.src).split('\n');
  const markOf = new Map(P.marks.map(m => [m.obj, m]));
  const fmt = s => { const m = Math.floor(s / 60 + 1e-9), r = s - m * 60; return `${m}:${r < 10 ? '0' : ''}${r.toFixed(1)}`; };
  const n3 = x => +(+x).toFixed(3);
  const SCENES = EDIT.scenes.map((sc, i) => ({
    sc, i, ln: markOf.get(sc).ln, start: SP[i].start, end: SP[i].end,
    what: sc.query || sc.name || sc.caption || sc.line || '',
  }));
  const ITEMS = [], itemAt = new Map();
  SCENES.forEach(S => (S.sc.items || []).forEach((it, k) => {
    const r = { obj: it, S, k, ln: markOf.get(it).ln, start: SP[S.i].items[k].start, end: SP[S.i].items[k].end };
    ITEMS.push(r); itemAt.set(it, r);
  }));
  const sceneOf = new Map(SCENES.map(S => [S.sc, S]));
  const BEATS = P.marks.filter(m => m.kind === 'beat').map(m => {
    const own = m.owner === m.scene ? sceneOf.get(m.scene) : itemAt.get(m.owner);
    const b = m.obj, gist = (b.video || b.img || '').replace(/^\.\//, '') || b.caption || b.lead || (b.line || b.lines || b.quote || [])[0] || '';
    return { m, ln: m.ln, own, at: b.at, len: own.end - own.start, gist };
  });
  const TIMED = [];                              // stats' and awards' @ times: shown, not dragged
  SCENES.forEach(S => {
    (S.sc.stats || []).forEach(s => { if (s.at != null) TIMED.push({ S, at: s.at, gist: `stat ${s.n} ${s.label}` }); });
    (S.sc.awards || []).forEach(a => TIMED.push({ S, at: a.at, gist: `award ${a.yr} ${a.text}` }));
  });
  const OUTS = SCENES.filter(S => RS.cueNames(S.sc.type).includes('out'))
    .map(S => ({ S, out: RS.cue(S.sc, 'out'), set: !!(S.sc.cues && S.sc.cues.out != null) }));

  // ── style: the site's tokens, never text dimmed with alpha ────────────
  const css = document.createElement('style');
  css.textContent = `
#reel-tl { position: fixed; left: 0; right: 0; height: 250px; z-index: 50; box-sizing: border-box;
  background: rgba(var(--surface-rgb), 0.94); border-top: 1px solid rgba(var(--cyan-dim-rgb), 0.3);
  font: 500 11px/1 var(--font-mono); color: var(--ink-quiet); letter-spacing: 0.02em; user-select: none; -webkit-user-select: none; }
#reel-tl[hidden] { display: none; }
#reel-tl * { box-sizing: border-box; }
#reel-tl .tl-main { position: absolute; left: 0; top: 0; bottom: 0; right: 0; }
#reel-tl.tl-insp .tl-main { right: 440px; }
#reel-tl .tl-gl { position: absolute; left: 20px; width: 70px; color: var(--ink-faint); font-size: 11px; text-transform: lowercase; letter-spacing: 0.08em; }
#reel-tl .tl-lane { position: absolute; left: 100px; right: 24px; top: 0; bottom: 0; overflow: hidden; }
#reel-tl .tl-ruler { position: absolute; left: 0; right: 0; top: 10px; height: 22px; cursor: col-resize;
  border-bottom: 1px solid rgba(var(--cyan-dim-rgb), 0.3);
  background-image: linear-gradient(to right, rgba(var(--cyan-dim-rgb), 0.35) 1px, transparent 1px);
  background-repeat: repeat-x; background-position: 0 100%; background-size: 10px 5px; }
#reel-tl .tl-tick { position: absolute; bottom: 0; height: 11px; border-left: 1px solid rgba(var(--cyan-dim-rgb), 0.6); padding: 0 0 0 4px; color: var(--ink-faint); pointer-events: none; font-size: 10px; line-height: 10px; }
#reel-tl .tl-blk { position: absolute; border: 1px solid rgba(var(--cyan-dim-rgb), 0.35); background: rgba(var(--cyan-dim-rgb), 0.08); border-radius: 5px;
  overflow: hidden; white-space: nowrap; cursor: pointer; transition: border-color 0.2s, background 0.2s; }
#reel-tl .tl-blk:hover { background: rgba(var(--cyan-dim-rgb), 0.14); }
#reel-tl .tl-sc { top: 42px; height: 48px; padding: 8px 10px 0; }
#reel-tl .tl-sc b { display: block; font: 300 15px/1.1 var(--font-display); color: var(--text-bright); overflow: hidden; text-overflow: ellipsis; letter-spacing: 0.01em; }
#reel-tl .tl-sc i { display: block; font-style: normal; color: var(--ink-faint); margin-top: 6px; overflow: hidden; text-overflow: ellipsis; }
#reel-tl .tl-sc.tl-cur { border-bottom: 2px solid var(--gold); }
#reel-tl .tl-sc.tl-sel { border-color: var(--gold); background: rgba(var(--gold-rgb), 0.08); }
#reel-tl .tl-sc.tl-sel b { color: var(--gold); }
#reel-tl .tl-it { top: 98px; height: 26px; padding: 7px 8px 0; color: var(--ink-quiet); text-overflow: ellipsis; }
#reel-tl .tl-grip { position: absolute; right: -1px; top: 0; bottom: 0; width: 9px; cursor: ew-resize; }
#reel-tl .tl-grip::after { content: ''; position: absolute; right: 3px; top: 30%; bottom: 30%; width: 2px; border-radius: 1px; background: rgba(var(--cyan-dim-rgb), 0.5); opacity: 0; transition: opacity 0.15s; }
#reel-tl .tl-blk:hover .tl-grip::after, #reel-tl .tl-grip.tl-on::after { opacity: 1; background: var(--gold); }
#reel-tl .tl-mk { position: absolute; width: 11px; margin-left: -5px; cursor: ew-resize; }
#reel-tl .tl-mk::before { content: ''; position: absolute; left: 5px; top: 0; bottom: 0; width: 1px; background: var(--cyan); }
#reel-tl .tl-bt { top: 132px; height: 22px; }
#reel-tl .tl-bt::after { content: ''; position: absolute; left: 1px; top: 0; width: 9px; height: 9px; transform: rotate(45deg) scale(0.78); background: var(--cyan); }
#reel-tl .tl-ro { top: 144px; height: 10px; cursor: default; pointer-events: auto; }
#reel-tl .tl-ro::before { background: var(--ink-faint); }
#reel-tl .tl-ro::after { content: ''; position: absolute; left: 3px; top: 0; width: 5px; height: 5px; border-radius: 50%; background: var(--ink-faint); }
#reel-tl .tl-ot { top: 164px; height: 20px; }
#reel-tl .tl-ot::after { content: ''; position: absolute; left: 1px; top: 0; border: 5px solid transparent; border-top: 6px solid var(--cyan); }
#reel-tl .tl-ot.tl-def::before { background: var(--ink-faint); }
#reel-tl .tl-ot.tl-def::after { border-top-color: var(--ink-faint); }
#reel-tl .tl-mk:hover::before, #reel-tl .tl-mk.tl-on::before { background: var(--gold); width: 2px; left: 4px; }
#reel-tl .tl-mk.tl-on::after, #reel-tl .tl-mk:hover::after { background-color: var(--gold); }
#reel-tl .tl-ot:hover::after, #reel-tl .tl-ot.tl-on::after { background: none; border-top-color: var(--gold); }
#reel-tl .tl-ph { position: absolute; left: 0; top: 10px; bottom: 44px; width: 1px; background: var(--gold); pointer-events: none; will-change: transform; }
#reel-tl .tl-ph::before { content: ''; position: absolute; left: -4px; top: 0; border: 4.5px solid transparent; border-top: 6px solid var(--gold); }
#reel-tl .tl-ro-out { position: absolute; top: 44px; padding: 4px 7px; border: 1px solid rgba(var(--gold-rgb), 0.6); border-radius: 4px; background: rgba(var(--surface-rgb), 0.96);
  color: var(--text-bright); pointer-events: none; white-space: nowrap; z-index: 2; }
#reel-tl .tl-ro-out[hidden] { display: none; }
#reel-tl .tl-status { position: absolute; left: 20px; right: 24px; bottom: 12px; height: 24px; display: flex; align-items: center; gap: 14px; white-space: nowrap;
  border-top: 1px solid rgba(var(--cyan-dim-rgb), 0.15); padding-top: 8px; }
#reel-tl .tl-status .tl-where { color: var(--cyan); }
#reel-tl .tl-status .tl-err { color: var(--text-bright); border-left: 2px solid #ff8a7a; padding-left: 8px; overflow: hidden; text-overflow: ellipsis; flex: 1; min-width: 0; }
#reel-tl .tl-status .tl-err:empty { display: none; }
#reel-tl .tl-status .tl-gap { flex: 1; }
#reel-tl .tl-status .tl-err:not(:empty) ~ .tl-gap { display: none; }
#reel-tl .tl-status .tl-note { color: var(--ink-faint); }
#reel-tl button { font: 500 11px/1 var(--font-mono); color: var(--text-bright); background: rgba(var(--cyan-dim-rgb), 0.1); border: 1px solid rgba(var(--cyan-dim-rgb), 0.4);
  border-radius: 4px; padding: 4px 8px; cursor: pointer; }
#reel-tl button:hover { border-color: var(--gold); color: var(--gold); }
#reel-tl .tl-insp-col { position: absolute; right: 0; top: 0; bottom: 0; width: 440px; overflow-y: auto; border-left: 1px solid rgba(var(--cyan-dim-rgb), 0.3);
  padding: 12px 18px 16px; user-select: text; -webkit-user-select: text; }
#reel-tl .tl-insp-col[hidden] { display: none; }
#reel-tl .tl-ih { display: flex; align-items: baseline; gap: 10px; margin-bottom: 6px; }
#reel-tl .tl-ih h3 { margin: 0; font: 300 18px/1.2 var(--font-display); color: var(--gold); flex: 1; }
#reel-tl .tl-grp { margin: 12px 0 4px; padding-top: 8px; border-top: 1px solid rgba(var(--cyan-dim-rgb), 0.2); color: var(--cyan); display: flex; align-items: center; gap: 8px; }
#reel-tl .tl-row { display: grid; grid-template-columns: 64px 1fr; align-items: center; gap: 8px; margin: 3px 0; }
#reel-tl .tl-row.tl-cues { grid-template-columns: 64px repeat(3, 1fr); }
#reel-tl .tl-row label, #reel-tl .tl-grp label, #reel-tl .tl-cue label { color: var(--ink-faint); }
#reel-tl .tl-cue { display: flex; align-items: center; gap: 5px; }
#reel-tl .tl-cue input { width: 100%; min-width: 0; }
#reel-tl input { font: 500 11px/1.3 var(--font-mono); color: var(--text-bright); background: rgba(var(--cyan-dim-rgb), 0.06); border: 1px solid rgba(var(--cyan-dim-rgb), 0.25);
  border-radius: 4px; padding: 4px 6px; width: 100%; outline: none; }
#reel-tl input[type=number] { width: 72px; }
#reel-tl .tl-cue input[type=number] { width: 100%; }
#reel-tl input:focus { border-color: var(--gold); }
#reel-tl input::placeholder { color: var(--ink-faint); }
#reel-tl .tl-flag { color: var(--ink-quiet); }
`;
  document.head.appendChild(css);

  // ── the DOM ───────────────────────────────────────────────────────────
  // every class wears tl-: the rig's own classes (.status, .row, .note…) are global and would reach in
  const h = (tag, cls, parent, text) => { const e = document.createElement(tag); if (cls) e.className = cls.split(' ').map(c => 'tl-' + c).join(' '); if (text != null) e.textContent = text; if (parent) parent.appendChild(e); return e; };
  const root = h('div', null, document.body); root.id = 'reel-tl'; root.hidden = true;
  root.setAttribute('role', 'region'); root.setAttribute('aria-label', 'Reel timeline');
  const main = h('div', 'main', root);
  const ROWS = [['time', 14], ['scenes', 60], ['items', 106], ['beats', 139], ['out', 170]];
  ROWS.forEach(([t, y]) => { h('div', 'gl', main, t).style.top = y + 'px'; });
  const lane = h('div', 'lane', main);
  const ruler = h('div', 'ruler', lane); ruler.title = 'click or drag to seek';
  const recs = [];                                // every placed thing: { el, span(map) → [t0, t1?] }
  SCENES.forEach(S => {
    const el = h('div', 'blk sc', lane); el.dataset.scene = S.i;
    h('b', null, el, `${S.i + 1} ${S.sc.type}`); h('i', null, el, S.what || ' ');
    el.title = `${S.i + 1} ${S.sc.type} · ${S.sc.dur} s · ${fmt(S.start)} → ${fmt(S.end)}${S.what ? '\n' + S.what : ''}`;
    const g = h('div', 'grip', el); g.title = 'drag to change the length';
    S.el = el; S.grip = g;
    recs.push({ el, span: m => [m(S.start), m(S.end)] });
  });
  ITEMS.forEach(I => {
    const el = h('div', 'blk it', lane, I.obj.eyebrow || (I.obj.headline || []).join(' ') || 'item');
    el.title = `ITEM ${I.obj.dur} s · ${fmt(I.start)} → ${fmt(I.end)}\n${I.obj.eyebrow || ''}`;
    const g = h('div', 'grip', el); g.title = 'drag to change the length';
    I.el = el; I.grip = g;
    recs.push({ el, span: m => [m(I.start), m(I.end)] });
  });
  BEATS.forEach(B => {
    const el = h('div', 'mk bt', lane); B.el = el;
    el.title = `@${B.at}${B.gist ? ' · ' + B.gist : ''}`;
    recs.push({ el, span: m => [m(B.own.start) + (B.drag != null ? B.drag : B.at)] });
  });
  TIMED.forEach(T => {
    const el = h('div', 'mk ro', lane); el.title = `@${T.at} · ${T.gist} (edit it in the inspector)`;
    recs.push({ el, span: m => [m(T.S.start) + T.at] });
  });
  OUTS.forEach(O => {
    const el = h('div', 'mk ot' + (O.set ? '' : ' def'), lane); O.el = el;
    el.title = `${O.S.sc.type}: content leaves ${O.out} s before the end${O.set ? '' : ' (the default)'}`;
    recs.push({ el, span: m => [m(O.S.end) - (O.drag != null ? O.drag : O.out)] });
  });
  const ph = h('div', 'ph', lane);
  const readout = h('div', 'ro-out', lane); readout.hidden = true;

  const status = h('div', 'status', main);
  const where = h('span', 'where', status);
  const err = h('span', 'err', status); err.setAttribute('role', 'status');
  h('span', 'gap', status);
  // where saves go: the file (dev server), the page's host (claude.ai), or a draft in this tab
  const home = (busy) => L.dev ? `Saving to ${L.file}${busy ? '…' : ''}` : L.host ? `Saving to ${L.host}${busy ? '…' : ''}`
    : busy ? 'Keeping a draft in this tab…' : 'Draft in this tab: no dev server';
  if (!L.dev && (L.draft || L.hosted)) {
    const dl = h('button', null, status, 'Download'); dl.type = 'button'; dl.dataset.act = 'download'; dl.title = 'save this version as ' + L.file.replace(/^.*\//, '');
    dl.onclick = () => L.download(L.src);
    const ds = h('button', null, status, L.hosted ? 'Revert' : 'Discard'); ds.type = 'button'; ds.dataset.act = 'discard';
    ds.title = L.hosted ? `drop the version saved on ${L.host} and play the file again` : 'drop the draft and play the file again';
    ds.onclick = () => { put(K_UNDO, []); put(K_REDO, []); L.discardDraft(); };
  }
  h('span', 'note', status, 'drag an edge or a mark · click a scene · ⌘Z undo');
  const warn = P.warnings.length;
  const note = h('span', 'note', status, `total ${fmt(DUR)}${warn ? ` · ${warn} warning${warn > 1 ? 's' : ''}` : ''}`);
  if (warn) note.title = P.warnings.join('\n');
  where.textContent = home(false);
  if (!L.dev && L.draft) where.textContent += ' (unsaved draft)';
  else if (L.hosted) where.textContent += ' (your saved version)';
  const say = errs => { errs = [].concat(errs || []).map(String).filter(Boolean); err.textContent = errs[0] || ''; err.title = errs.join('\n'); };

  const insp = h('div', 'insp-col', root); insp.hidden = true;
  insp.setAttribute('aria-label', 'Scene inspector');

  // ── layout: on open, on resize, and while a drag previews its ripple ──
  let W = 1, pxs = 1;
  const x = t => t * pxs;
  function layout(map) {
    map = map || (t => t);
    W = lane.clientWidth || 1; pxs = W / DUR;
    recs.forEach(r => {
      const [a, b] = r.span(map);
      r.el.style.left = x(a).toFixed(1) + 'px';
      if (b != null) r.el.style.width = Math.max(4, x(b) - x(a) - 2).toFixed(1) + 'px';   // a 2 px gutter between blocks
    });
    if (!map.drag) ticks();
    frame(L.now());
  }
  function ticks() {
    ruler.querySelectorAll('.tl-tick').forEach(e => e.remove());
    ruler.style.backgroundSize = `${(pxs * 0.5).toFixed(3)}px 5px`;
    const step = pxs * 2 >= 56 ? 2 : 5;
    for (let t = 0; t <= DUR + 1e-6 && x(t) < W - 34; t += step) { const e = h('span', 'tick', ruler, fmt(t).replace(/\.0$/, '')); e.style.left = x(t).toFixed(1) + 'px'; }
  }
  let curScene = -1;
  function frame(t) {
    if (root.hidden) return;
    ph.style.transform = `translateX(${x(Math.max(0, Math.min(DUR, t))).toFixed(1)}px)`;
    let c = 0; SCENES.forEach(S => { if (t >= S.start - 1e-6) c = S.i; });
    if (c !== curScene) { if (SCENES[curScene]) SCENES[curScene].el.classList.remove('tl-cur'); SCENES[c].el.classList.add('tl-cur'); curScene = c; }
  }
  L.onFrame(frame);

  // the preview shrinks to fit above the panel (the rig keeps the bottom of the window for it)
  // and takes the whole window back when the panel shuts
  function fitStage() {
    const hud = document.getElementById('hud'), hh = hud && !hud.hidden ? hud.getBoundingClientRect().height : 0;
    root.style.bottom = Math.round(hh) + 'px';
    L.reserveBottom(hh + 250);
  }
  function show(open) {
    root.hidden = !open; put(K_OPEN, open);
    if (open) { fitStage(); layout(); } else L.reserveBottom(0);
  }
  addEventListener('resize', () => { if (!root.hidden) { fitStage(); layout(); } });

  // ── saving: every change is one new script text ───────────────────────
  let busy = false;
  const stack = k => { const s = get(k, []); return Array.isArray(s) ? s : []; };
  async function save(next, undo, redo) {
    if (busy) return false;
    const u0 = stack(K_UNDO), r0 = stack(K_REDO);
    try { RS.parse(next); } catch (e) { say(e.errors || [e.message]); layout(); return false; }   // never save a broken script
    busy = true; say(''); where.textContent = home(true);
    put(K_UNDO, undo.slice(-DEPTH)); put(K_REDO, redo.slice(-DEPTH));
    let res;
    try { res = await L.save(next); } catch (e) { res = { ok: false, errors: [e.message] }; }
    if (!res || !res.ok) {                         // nothing changed: put the stacks and the picture back
      put(K_UNDO, u0); put(K_REDO, r0); busy = false;
      where.textContent = home(false);
      say((res && res.errors) || ['the save failed']); layout();
      return false;
    }
    return true;                                   // the page reloads
  }
  // change the script with one helper call (or a chain of them); a helper that throws is shown
  function commit(change) {
    let next;
    try { next = change(L.src); } catch (e) { say(e.errors || [e.message]); layout(); return; }
    if (next === L.src) { layout(); return; }
    save(next, stack(K_UNDO).concat([L.src]), []);
  }
  function undo(back) {
    const from = stack(back ? K_UNDO : K_REDO), to = stack(back ? K_REDO : K_UNDO);
    if (!from.length) { say(back ? ['nothing to undo'] : ['nothing to redo']); return; }
    const prev = from.pop(); to.push(L.src);
    back ? save(prev, from, to) : save(prev, to, from);
  }
  // an item's length: its results scene grows by the same amount, so the items before it (hung
  // from the scene's end) stay where they are and only what follows moves, as a scene edge does
  const itemDur = (I, d) => src => {
    const grow = n3(d - I.obj.dur);
    return RS.setDur(RS.setDur(src, I.ln, d), I.S.ln, n3(I.S.sc.dur + grow));
  };

  // ── dragging ──────────────────────────────────────────────────────────
  const snapOf = e => (e.shiftKey ? 0.5 : e.altKey ? 0.05 : 0.25);
  const snap = (v, e) => { const q = snapOf(e); return n3(Math.round(v / q) * q); };
  function drag(e, target, move, up) {
    e.preventDefault(); e.stopPropagation();
    const x0 = e.clientX; let moved = false;
    try { target.setPointerCapture(e.pointerId); } catch (x) { /* synthetic pointer */ }
    const mv = ev => { const dx = ev.clientX - x0; if (Math.abs(dx) > 3) moved = true; if (moved) move(dx / pxs, ev); };
    const fin = ev => {
      target.removeEventListener('pointermove', mv); target.removeEventListener('pointerup', fin); target.removeEventListener('pointercancel', fin);
      readout.hidden = true; up(moved, ev);
    };
    target.addEventListener('pointermove', mv); target.addEventListener('pointerup', fin); target.addEventListener('pointercancel', fin);
  }
  const show1 = (t, text) => { readout.hidden = false; readout.textContent = text; readout.style.left = Math.min(W - readout.offsetWidth, Math.max(0, x(t) + 8)).toFixed(0) + 'px'; };
  // ripple: every time at or after the edge moves by d; the scale stays, so the tail may run off
  const ripple = (edge, d) => { const m = t => (t >= edge - 1e-6 ? t + d : t); m.drag = true; return m; };

  SCENES.forEach(S => {
    // a results scene cannot be shorter than its items (the list needs a moment first)
    const floor = (S.sc.items || []).reduce((a, it) => a + it.dur, 0);
    S.grip.addEventListener('pointerdown', e => {
      let d = S.sc.dur;
      S.grip.classList.add('tl-on');
      drag(e, S.grip, (dt, ev) => {
        d = Math.max(floor ? n3(floor + snapOf(ev)) : snapOf(ev), snap(S.sc.dur + dt, ev));
        layout(ripple(S.end, d - S.sc.dur));
        show1(S.start + d, `${S.sc.type} ${S.sc.dur} → ${d} s · total ${fmt(DUR + d - S.sc.dur)}`);
      }, moved => {
        S.grip.classList.remove('tl-on');
        if (moved && d !== S.sc.dur) commit(src => RS.setDur(src, S.ln, d)); else layout();
      });
    });
    S.el.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      drag(e, S.el, () => {}, moved => { if (!moved) select(S.i); });
    });
  });
  ITEMS.forEach(I => {
    I.grip.addEventListener('pointerdown', e => {
      let d = I.obj.dur;
      I.grip.classList.add('tl-on');
      drag(e, I.grip, (dt, ev) => {
        d = Math.max(snapOf(ev), snap(I.obj.dur + dt, ev));
        layout(ripple(I.end, d - I.obj.dur));
        show1(I.start + d, `item ${I.obj.dur} → ${d} s · scene ${n3(I.S.sc.dur + d - I.obj.dur)} s · total ${fmt(DUR + d - I.obj.dur)}`);
      }, moved => {
        I.grip.classList.remove('tl-on');
        if (moved && d !== I.obj.dur) commit(itemDur(I, d)); else layout();
      });
    });
    I.el.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      drag(e, I.el, () => {}, moved => { if (!moved) { select(I.S.i, true); L.seek(I.start); } });
    });
  });
  BEATS.forEach(B => B.el.addEventListener('pointerdown', e => {
    const hi = Math.max(0, n3(B.len - 0.05));
    B.el.classList.add('tl-on');
    drag(e, B.el, (dt, ev) => {
      B.drag = Math.min(hi, Math.max(0, snap(B.at + dt, ev)));
      layout(t => t);
      show1(B.own.start + B.drag, `@${B.at} → @${B.drag}  (${fmt(B.own.start + B.drag)})`);
    }, moved => {
      B.el.classList.remove('tl-on');
      const v = B.drag; B.drag = null;
      if (!moved) { L.seek(B.own.start + B.at); layout(); } else if (v !== B.at) commit(src => RS.setAt(src, B.ln, v)); else layout();
    });
  }));
  OUTS.forEach(O => O.el.addEventListener('pointerdown', e => {
    const len = O.S.sc.dur;
    O.el.classList.add('tl-on');
    drag(e, O.el, (dt, ev) => {
      O.drag = Math.min(len, Math.max(0, snap(O.out - dt, ev)));   // right is later, so a smaller out
      layout(t => t);
      show1(O.S.end - O.drag, `out ${O.out} → ${O.drag} s before the end`);
    }, moved => {
      O.el.classList.remove('tl-on');
      const v = O.drag; O.drag = null;
      if (!moved) { L.seek(O.S.end - O.out); layout(); } else if (v !== O.out) commit(src => RS.setCue(src, O.S.ln, 'out', v)); else layout();
    });
  }));
  ruler.addEventListener('pointerdown', e => {
    const seek = ev => L.seek((ev.clientX - lane.getBoundingClientRect().left) / pxs);
    seek(e);
    drag(e, ruler, (dt, ev) => seek(ev), () => {});
    // a still press is a seek too, and drag() only calls move once the pointer travels
  });

  // ── the inspector: the scene's lines, in the order they are written ──
  let selected = -1;
  function select(i, keep) {
    const S = SCENES[i]; if (!S) return;
    if (!keep) L.seek(S.start);
    if (selected >= 0) SCENES[selected].el.classList.remove('tl-sel');
    selected = i; S.el.classList.add('tl-sel'); put(K_SEL, i);
    build(S);
    insp.hidden = false; root.classList.add('tl-insp');
    layout();
  }
  function unselect() {
    if (selected >= 0) SCENES[selected].el.classList.remove('tl-sel');
    selected = -1; put(K_SEL, -1);
    insp.hidden = true; root.classList.remove('tl-insp'); layout();
  }
  const wordsOf = (ln, key) => lines[ln - 1].trim().slice(key.length).trim();
  let uid = 0;
  // one labelled input; Enter or leaving it saves a change, Esc puts it back
  function input(parent, label, value, act, opts = {}) {
    const id = 'reel-tl-in' + (uid++);
    const lab = h('label', null, parent, label); lab.htmlFor = id;
    const inp = h('input', null, parent); inp.id = id;
    if (opts.num) { inp.type = 'number'; inp.step = '0.05'; inp.min = '0'; } else inp.type = 'text';
    inp.value = value; inp.dataset.orig = value; inp.spellcheck = false;
    if (opts.placeholder != null) inp.placeholder = opts.placeholder;
    if (opts.ln) inp.dataset.ln = opts.ln;
    if (opts.key) inp.dataset.key = opts.key;
    const go = () => {
      if (inp.value === inp.dataset.orig || busy) return;
      const v = inp.value.trim();
      if (opts.num && v !== '' && !Number.isFinite(Number(v))) { say([`"${v}" is not a number`]); inp.value = inp.dataset.orig; return; }
      commit(src => act(src, v));
      if (!busy) inp.value = inp.dataset.orig;        // refused: the input shows the script again
    };
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); go(); }
      else if (e.key === 'Escape') { inp.value = inp.dataset.orig; inp.blur(); }
      e.stopPropagation();                            // the rig's keys (space, L, R…) are for the preview
    });
    inp.addEventListener('blur', go);
    return inp;
  }
  function build(S) {
    insp.textContent = '';
    const head = h('div', 'ih', insp);
    h('h3', null, head, `${S.i + 1} ${S.sc.type}`);
    h('span', 'note', head, `${fmt(S.start)} → ${fmt(S.end)}`);
    const x_ = h('button', null, head, '×'); x_.type = 'button'; x_.title = 'close the inspector'; x_.setAttribute('aria-label', 'close the inspector'); x_.onclick = unselect;
    const next = SCENES[S.i + 1] ? SCENES[S.i + 1].ln : lines.length + 1;
    const byLn = new Map();
    P.marks.forEach(m => { if (m.ln >= S.ln && m.ln < next) byLn.set(m.ln, { mark: m }); });
    P.fields.forEach(f => { if (f.ln > S.ln && f.ln < next) byLn.set(f.ln, { field: f }); });
    [...byLn.keys()].sort((a, b) => a - b).forEach(ln => {
      const { mark: m, field: f } = byLn.get(ln);
      if (m && m.kind === 'scene') {
        input(h('div', 'row', insp), 'length', String(S.sc.dur), (src, v) => RS.setDur(src, ln, Number(v)), { num: true, ln, key: 'SCENE' });
      } else if (m && m.kind === 'item') {
        const I = itemAt.get(m.obj), g = h('div', 'grp', insp);
        h('span', null, g, `ITEM ${I.k + 1}`);
        input(g, 'length', String(m.obj.dur), (src, v) => itemDur(I, Number(v))(src), { num: true, ln, key: 'ITEM' });
      } else if (m && m.kind === 'beat') {
        const g = h('div', 'grp', insp);
        h('span', null, g, m.owner === m.scene ? 'beat' : 'beat in item');
        input(g, '@', String(m.obj.at), (src, v) => RS.setAt(src, ln, Number(v)), { num: true, ln, key: '@' });
      } else if (f && f.kind === 'cue') {
        // shown in the cues row below
      } else if (f && f.kind === 'flag') {
        const r = h('div', 'row', insp); h('label', null, r, f.key); h('span', 'flag', r, 'on (a flag: delete the line to turn it off)');
      } else if (f) {
        input(h('div', 'row', insp), f.key, wordsOf(ln, f.key), (src, v) => RS.setField(src, ln, v), { ln, key: f.key });
      }
    });
    const names = RS.cueNames(S.sc.type);
    if (names.length) {
      const g = h('div', 'grp', insp); h('span', null, g, 'cues');
      const r = h('div', 'row cues', insp); h('span', null, r, '');
      names.forEach(n => {
        const c = h('div', 'cue', r), set = S.sc.cues && S.sc.cues[n] != null;
        const inp = input(c, n, set ? String(S.sc.cues[n]) : '', (src, v) => RS.setCue(src, S.ln, n, v === '' ? null : Number(v)),
          { num: true, placeholder: String(RS.CUES[n].def(S.sc.type)), key: 'cue:' + n });
        inp.title = RS.CUES[n].about + ' (empty: the default)';
      });
    }
  }

  // ── keys ──────────────────────────────────────────────────────────────
  addEventListener('keydown', e => {
    if (e.target.closest && e.target.closest('input, textarea, select, [contenteditable]')) return;
    if ((e.key === 'e' || e.key === 'E') && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); show(root.hidden); }
    else if ((e.key === 'z' || e.key === 'Z') && (e.metaKey || e.ctrlKey) && !root.hidden) { e.preventDefault(); undo(!e.shiftKey); }
    else if (e.key === 'Escape' && !root.hidden && selected >= 0) unselect();
  });
  const hint = document.querySelector('#hud > span:last-child');
  if (hint && !/E timeline/.test(hint.textContent)) hint.textContent += ' · E timeline';

  // ── back to where the last reload left it ─────────────────────────────
  if (get(K_OPEN, false)) show(true);
  const sel = get(K_SEL, -1);
  if (!root.hidden && SCENES[sel]) select(sel, true);
  window.REEL_TIMELINE = { show, select, undo: () => undo(true), redo: () => undo(false) };   // for tests and the console
})();
