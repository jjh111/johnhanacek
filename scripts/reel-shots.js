// The reel's shot list (S): every scene of the script as a shot, in order, to put in another
// order, to time and to give its transitions.
//
// A scene is self-contained: its lines, beats, cues and fish lines go with it wherever it is put
// (ReelScript.moveScene), and the rig builds the film from the script's order, the hero oval, the
// bar and the end card's oval morphing between whatever scenes are next to each other. So the
// shots can be shuffled freely; the music stays on its own bars.
//   the list       one row per shot: its number, a picture of it (its first picture or clip, or
//                  its words), what it is and says, its length, and its transitions (how long it
//                  takes to arrive and to leave; gold where the shot sets its own, cyan where every
//                  shot's is set, plain where it is the rig's own). The shot under the playhead is
//                  marked. Click a row to go there and open it; drag a row to move the shot.
//   a shot, open   its length; when it arrives (after the question's Enter) and how long it takes,
//                  when it starts to leave (before its cut) and how long it takes, the curve, how
//                  fast its question types; empty means the default (shown greyed). Play from
//                  here, Duplicate, Delete, and Earlier / Later to move it one place.
//   every shot     the same transitions for all of them at once (cue lines above the first SCENE);
//                  a shot's own still wins.
// Every change is one save on the timeline's undo stack (its Undo and ⌘Z take it back), played at
// once in place. Keys: S opens and shuts it (when the Fish panel, which shares its side of the
// preview, is not open); on a focused row ↑ ↓ choose, Alt+↑ ↓ move, Enter plays from there,
// ⌫ deletes, ⌘D copies. A classic script the rig injects in live mode only.
(function () {
  'use strict';
  const L = window.REEL_LIVE, RS = window.ReelScript, UI = window.REEL_UI;
  if (!L || !RS || !RS.moveScene || document.getElementById('reel-shots')) return;
  const SC = L.scenes;
  let P = L.parsed;
  const get = (k, d) => { try { const v = sessionStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
  const put = (k, v) => { try { sessionStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
  // the undo stacks are the timeline's (scripts/reel-timeline.js): whole script texts
  const K_OPEN = 'reel-shots-open', K_UNDO = 'reel-undo:' + L.file, K_REDO = 'reel-redo:' + L.file, K_EVERY = 'reel-shots-every', DEPTH = 30;
  const fmt = s => { const m = Math.floor(s / 60 + 1e-9), r = s - m * 60; return `${m}:${r < 10 ? '0' : ''}${r.toFixed(1)}`; };
  const n3 = x => +(+x).toFixed(3);
  const sceneAt = t => { let s = SC[0]; for (const x of SC) if (t >= x.start - 1e-6) s = x; return s; };
  const lnOf = i => P.marks.find(m => m.kind === 'scene' && m.obj === P.edit.scenes[i]).ln;
  const strip = s => String(s || '').replace(/<[^>]+>/g, '');
  // what a shot is and says: its question (or name, caption, line), and a line of what it shows
  function words(sc) {
    const said = sc.query || sc.name || sc.caption || sc.line || sc.board || '';
    const shows = sc.type === 'answer' ? (sc.lines || [])[0] : sc.type === 'title' ? (sc.tagline || []).join(' · ') : sc.type === 'open' ? sc.reveal
      : sc.type === 'command' ? ((sc.plan || [])[0] || {}).what : sc.type === 'results' ? (sc.items || []).map(it => (it.eyebrow || '').split('·')[0].trim()).join(' · ')
      : sc.type === 'quotes' ? ((sc.quotes || [])[0] || { lines: [] }).lines[0] : sc.type === 'offer' ? ((sc.three || [])[0] || {}).k || sc.board
      : sc.headline ? sc.headline.join(' ') : sc.line || '';
    return { said: strip(said), shows: strip(shows) };
  }
  // its first picture or clip, if it has one
  function firstMedia(sc) {
    const beats = (sc.beats || []).concat(...(sc.items || []).map(it => it.beats || []));
    const b = beats.find(x => x.img || x.video);
    return b ? { path: b.img || b.video, kind: b.img ? 'picture' : 'clip' } : null;
  }

  // ── style: the site's tokens, never text dimmed with alpha ────────────
  const css = document.createElement('style');
  css.textContent = `
#reel-shots { position: fixed; left: 0; top: 0; bottom: var(--reel-bottom, 0px); width: 316px; z-index: 54; box-sizing: border-box; display: flex; flex-direction: column;
  background: rgba(var(--surface-rgb), 0.97); border-right: 1px solid rgba(var(--cyan-dim-rgb), 0.3); font: 500 11px/1.4 var(--font-mono); color: var(--ink-quiet); }
#reel-shots[hidden], #reel-shots [hidden] { display: none !important; }
#reel-shots * { box-sizing: border-box; }
#reel-shots.sh-over { left: 8px; top: 8px; bottom: auto; width: min(316px, calc(100vw - 16px)); max-height: calc(100vh - var(--reel-bottom, 0px) - 16px);
  border: 1px solid rgba(var(--cyan-dim-rgb), 0.4); border-radius: 12px; box-shadow: 0 12px 40px var(--elevation); }
#reel-shots .sh-head { display: flex; align-items: center; gap: 8px; padding: 12px 10px 4px 14px; }
#reel-shots .sh-head > .ri { color: var(--cyan); }
#reel-shots h2 { margin: 0; flex: 1; font: 300 18px/1 var(--font-display); color: var(--cyan); letter-spacing: 0.06em; }
#reel-shots .sh-sum { padding: 0 14px 8px; color: var(--text-bright); }
#reel-shots .sh-body { flex: 1; overflow-y: auto; padding: 0 10px 12px; scrollbar-width: thin; }
#reel-shots button { font: 500 11px/1 var(--font-mono); color: var(--text-bright); background: rgba(var(--cyan-dim-rgb), 0.08); border: 1px solid rgba(var(--cyan-dim-rgb), 0.35);
  border-radius: 6px; height: 26px; padding: 0 7px; cursor: pointer; display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }
#reel-shots button .ri { width: 14px; height: 14px; }
#reel-shots button:hover:not(:disabled), #reel-shots button:focus-visible { border-color: var(--gold); color: var(--gold); outline: none; }
#reel-shots button:disabled { color: var(--ink-faint); opacity: 0.55; cursor: default; }
#reel-shots button[aria-pressed="true"] { border-color: var(--gold); color: var(--gold); background: rgba(var(--gold-rgb), 0.14); }
#reel-shots .sh-x { width: 28px; padding: 0; justify-content: center; }
#reel-shots .sh-every { margin: 2px 0 10px; border: 1px solid rgba(var(--cyan-dim-rgb), 0.25); border-radius: 8px; }
#reel-shots .sh-every > summary { list-style: none; cursor: pointer; padding: 7px 10px; display: flex; gap: 8px; align-items: center; color: var(--text-bright); }
#reel-shots .sh-every > summary::-webkit-details-marker { display: none; }
#reel-shots .sh-every > summary .ri { width: 13px; height: 13px; color: var(--cyan); transition: transform 0.15s; }
#reel-shots .sh-every[open] > summary .ri { transform: rotate(90deg); }
#reel-shots .sh-every > summary span { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#reel-shots .sh-list { display: grid; gap: 4px; position: relative; }
#reel-shots .sh-row { display: grid; grid-template-columns: 18px 64px 1fr; gap: 8px; align-items: center; padding: 6px 6px 6px 4px; border-radius: 8px; cursor: grab;
  border: 1px solid transparent; background: rgba(var(--cyan-dim-rgb), 0.04); touch-action: none; user-select: none; position: relative; }
#reel-shots .sh-row:hover { background: rgba(var(--cyan-dim-rgb), 0.09); }
#reel-shots .sh-row:focus-visible { outline: none; border-color: rgba(var(--cyan-dim-rgb), 0.6); }
#reel-shots .sh-row.sh-sel { border-color: var(--gold); background: rgba(var(--gold-rgb), 0.08); }
#reel-shots .sh-row.sh-now::before { content: ''; position: absolute; left: -6px; top: 8px; bottom: 8px; width: 3px; border-radius: 2px; background: var(--gold); }
#reel-shots .sh-row.sh-drag { opacity: 0.35; }
#reel-shots .sh-n { text-align: center; color: var(--gold); font-weight: 600; }
#reel-shots .sh-tile { width: 64px; height: 36px; border-radius: 5px; overflow: hidden; background: rgba(var(--cyan-dim-rgb), 0.1); border: 1px solid rgba(var(--cyan-dim-rgb), 0.25);
  display: flex; align-items: center; justify-content: center; padding: 3px; text-align: center; font: 500 7px/1.15 var(--font-mono); color: var(--text-bright); }
#reel-shots .sh-tile img { width: 100%; height: 100%; object-fit: cover; display: block; margin: -3px; width: calc(100% + 6px); height: calc(100% + 6px); }
#reel-shots .sh-tile.sh-oval { border-radius: 50% / 50%; }
#reel-shots .sh-meta { min-width: 0; display: grid; gap: 2px; }
#reel-shots .sh-top { display: flex; gap: 6px; align-items: baseline; color: var(--text-bright); }
#reel-shots .sh-top b { font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; font-size: 10px; color: var(--cyan); }
#reel-shots .sh-top span { margin-left: auto; color: var(--ink-quiet); }
#reel-shots .sh-said, #reel-shots .sh-shows { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#reel-shots .sh-said { color: var(--text-bright); }
#reel-shots .sh-tx { display: flex; gap: 4px; flex-wrap: wrap; }
#reel-shots .sh-chip { font-size: 10px; padding: 1px 5px; border-radius: 4px; border: 1px solid rgba(var(--cyan-dim-rgb), 0.25); color: var(--ink-quiet); }
#reel-shots .sh-chip.sh-every-set { border-color: rgba(var(--cyan-dim-rgb), 0.7); color: var(--cyan); }
#reel-shots .sh-chip.sh-own-set { border-color: rgba(var(--gold-rgb), 0.7); color: var(--gold); }
#reel-shots .sh-drop { position: absolute; left: 0; right: 0; height: 2px; background: var(--gold); border-radius: 1px; pointer-events: none; box-shadow: 0 0 0 2px rgba(var(--gold-rgb), 0.25); }
#reel-shots .sh-ed { display: grid; grid-template-columns: 54px 1fr 1fr; gap: 6px 8px; align-items: center; margin: 2px 0 6px 22px; padding: 10px; border-radius: 8px;
  border: 1px solid rgba(var(--gold-rgb), 0.5); background: rgba(var(--gold-rgb), 0.05); }
#reel-shots .sh-every .sh-ed { margin: 0 8px 8px; }
#reel-shots .sh-ed > span { color: var(--ink-faint); }
#reel-shots .sh-ed > .sh-col { font-size: 9px; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: -3px; }
#reel-shots .sh-ed .sh-f { display: flex; flex-wrap: wrap; gap: 4px 5px; align-items: center; color: var(--ink-quiet); }
#reel-shots .sh-ed .sh-f.sh-wide { grid-column: span 2; }
#reel-shots .sh-ed .sh-acts { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 4px; padding-top: 4px; border-top: 1px solid rgba(var(--gold-rgb), 0.2); }
#reel-shots input, #reel-shots select { font: 500 11px/1.2 var(--font-mono); color: var(--text-bright); background: rgba(var(--cyan-dim-rgb), 0.06);
  border: 1px solid rgba(var(--cyan-dim-rgb), 0.3); border-radius: 5px; height: 24px; padding: 0 5px; outline: none; }
#reel-shots input { width: 52px; }
#reel-shots input::placeholder { color: var(--ink-faint); }
#reel-shots select { width: 92px; }
#reel-shots input:focus, #reel-shots select:focus { border-color: var(--gold); }
#reel-shots .sh-say { margin: 8px 4px 0; color: var(--text-bright); border-left: 2px solid #ff8a7a; padding-left: 8px; }
#reel-shots .sh-say:empty { display: none; }
#reel-shots .sh-tip { margin: 10px 4px 0; color: var(--ink-faint); }
`;
  document.head.appendChild(css);

  // ── the panel ─────────────────────────────────────────────────────────
  const el = (tag, cls, parent, text) => { const e = document.createElement(tag); if (cls) e.className = cls.split(' ').map(c => 'sh-' + c).join(' '); if (text != null) e.textContent = text; if (parent) parent.appendChild(e); return e; };
  const btn = (parent, icon, label, title, key) => {
    const b = UI ? UI.button({ icon, label, title, key }) : Object.assign(document.createElement('button'), { type: 'button', textContent: label, title });
    parent.appendChild(b); return b;
  };
  const root = el('div', null, document.body); root.id = 'reel-shots'; root.hidden = true;
  root.setAttribute('role', 'region'); root.setAttribute('aria-label', 'Shot list');
  root.addEventListener('click', e => { const b = e.target.closest('button'); if (b && e.detail) b.blur(); });
  const head = el('div', 'head', root);
  head.insertAdjacentHTML('beforeend', UI ? UI.icon('scenes') : '');
  el('h2', null, head, 'Shots');
  const xBtn = btn(head, 'close', '', 'close the shot list (S)'); xBtn.classList.add('sh-x'); xBtn.setAttribute('aria-label', 'close the shot list');
  const sum = el('div', 'sum', root);
  const body = el('div', 'body', root);
  const every = el('details', 'every', body);
  every.open = !!get(K_EVERY, false);
  every.addEventListener('toggle', () => put(K_EVERY, every.open));
  const everySum = el('summary', null, every);
  const everyEd = el('div', 'ed', every);
  const list = el('div', 'list', body); list.setAttribute('role', 'listbox'); list.setAttribute('aria-label', 'the shots, in order');
  const sayEl = el('div', 'say', body); sayEl.setAttribute('role', 'status');
  el('p', 'tip', body, 'Drag a shot to move it: its words, pictures, transitions and fish go with it. The music stays on its bars.');
  const say = errs => { errs = [].concat(errs || []).map(String).filter(Boolean); sayEl.textContent = errs[0] || ''; sayEl.title = errs.join('\n'); };

  // ── saving: one save, on the timeline's undo stack ────────────────────
  let follow = null;                              // the shot to select once a change has played
  async function save(next, sel) {
    if (next === L.src) return;
    say('');
    const u0 = get(K_UNDO, []), r0 = get(K_REDO, []);
    put(K_UNDO, (Array.isArray(u0) ? u0 : []).concat([L.src]).slice(-DEPTH)); put(K_REDO, []);
    follow = sel;
    let res;
    try { res = await L.save(next); } catch (e) { res = { ok: false, errors: [e.message] }; }
    if (!res || !res.applied) { put(K_UNDO, u0); put(K_REDO, r0); follow = null; say((res && res.errors) || ['the save failed']); draw(); return; }
    if (L.journal) L.journal.note('script');      // one history with the score's edits (the timeline's Undo)
    if (!res.ok) say(res.errors || ['not saved']);
  }
  const change = (fn, sel) => { let next; try { next = fn(L.src); } catch (e) { say(e.errors || [e.message]); draw(); return; } save(next, sel); };

  // ── a shot's transitions ──────────────────────────────────────────────
  const cueNow = (i, name) => RS.cue(P.edit.scenes[i], name, P.edit);
  const ownCue = (i, name) => { const c = P.edit.scenes[i].cues; return c && c[name] != null ? c[name] : null; };
  const reelCue = name => (P.edit.cues && P.edit.cues[name] != null ? P.edit.cues[name] : null);
  // a number field: empty is the default (its value greyed); Enter or leaving it keeps a change
  function numField(box, name, value, def, unit, step, commit) {
    const inp = el('input', null, box); inp.type = 'number'; inp.step = String(step); inp.min = '0';
    inp.value = value == null ? '' : String(value); inp.placeholder = def == null ? 'own' : String(n3(def)); inp.dataset.cue = name;
    inp.title = (RS.CUES[name] ? RS.CUES[name].about : name) + ' (empty: the default)';
    const go = () => { const v = inp.value.trim(); const nv = v === '' ? null : +v; if (nv === value || (nv != null && !Number.isFinite(nv))) { inp.value = value == null ? '' : String(value); return; } commit(nv); };
    inp.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); go(); } else if (e.key === 'Escape') { inp.value = value == null ? '' : String(value); inp.blur(); } };
    inp.onblur = go;
    if (unit) el('span', null, box, unit);
    return inp;
  }
  function easeField(box, value, def, commit, label) {
    const s = el('select', null, box); s.dataset.cue = 'ease';
    const opt = (v, t) => { const o = el('option', null, s, t); o.value = v; if ((value || '') === v) o.selected = true; };
    opt('', label);
    RS.EASES.forEach(e => opt(e, e));
    s.title = RS.CUES.ease.about;
    s.onchange = () => commit(s.value === '' ? null : s.value);
    s.onkeydown = e => e.stopPropagation();
    return s;
  }
  // the editor rows, for a shot (i) or for every shot (i null)
  function editor(box, i) {
    box.textContent = '';
    const type = i == null ? null : P.edit.scenes[i].type, names = i == null ? Object.keys(RS.CUES) : RS.cueNames(type);
    const set = (name, v) => change(src => (i == null ? RS.setReelCue(src, name, v) : RS.setCue(src, lnOf(i), name, v)), i);
    const val = name => (i == null ? reelCue(name) : ownCue(i, name));
    // the default shown greyed: for a shot, what it gets without its own (every shot's, or the rig's);
    // for every shot, the rig's own (the out's varies by shot)
    const def = name => (i == null ? (name === 'out' ? null : RS.CUES[name].def('answer')) : RS.cue({ type, cues: {} }, name, P.edit));
    // a row: its label, then cells (a whole row when it has one); a cell: [cue, unit, title] or null
    const cell = (c, wide) => {
      const f = el('div', 'f' + (wide ? ' wide' : ''), box);
      if (!c || !names.includes(c[0])) { if (c) el('span', null, f, '—').title = `a ${type} shot has no ${c[0]}`; return f; }
      numField(f, c[0], val(c[0]), def(c[0]), c[1], c[0] === 'typing' ? 1 : 0.05, v => set(c[0], v)).title = c[2] + ' (empty: the default, greyed)';
      return f;
    };
    if (i != null) {
      el('span', null, box, 'Length');
      const f = el('div', 'f wide', box);
      const inp = numField(f, 'dur', P.edit.scenes[i].dur, null, 's', 0.25, v => { if (v != null && v > 0) change(src => RS.setDur(src, lnOf(i), n3(v)), i); else draw(); });
      inp.placeholder = ''; inp.dataset.cue = 'dur'; inp.title = 'how long the shot runs; everything after it moves';
      el('span', null, f, `${fmt(SC[i].start)} → ${fmt(SC[i].end)}`);
    }
    // the transitions as a little table: when each starts, and how long it takes
    el('span', null, box, ''); el('span', 'col', box, 'starts'); el('span', 'col', box, 'takes');
    el('span', null, box, 'Arrives').title = 'when its content starts to arrive (seconds after its question\'s Enter) and how long the arrival takes';
    cell(['in', 's ↵', 'seconds after the question\'s Enter that the content starts to arrive']); cell(['arrive', 's', 'seconds the arrival takes: every motion and stagger scales with it']);
    if (names.includes('out') || names.includes('leave')) {
      el('span', null, box, 'Leaves').title = 'when its content starts to leave (seconds before its cut) and how long the leaving takes';
      cell(['out', 's ⇥', 'seconds before the cut that the content starts to leave']); cell(['leave', 's', 'seconds the leaving takes']);
    }
    if (names.includes('ease')) {
      el('span', null, box, 'Curve');
      const f = el('div', 'f wide', box);
      easeField(f, val('ease'), def('ease'), v => set('ease', v), i == null ? 'own' : `(${def('ease')})`);
    }
    if (names.includes('typing')) { el('span', null, box, 'Typing'); cell(['typing', '/s', 'characters a second its question types at'], true); }
    if (i == null) return;
    const acts = el('div', 'acts', box);
    const play = btn(acts, 'play', 'Play here', 'play from the start of this shot'); play.dataset.act = 'play';
    play.onclick = () => { L.seek(SC[i].start + 0.001); if (L.setPlaying) L.setPlaying(true); };
    const up = btn(acts, 'back', 'Earlier', 'move it one place earlier (Alt+↑)'); up.dataset.act = 'up'; up.disabled = i === 0;
    up.onclick = () => change(src => RS.moveScene(src, i, i - 1), i - 1);
    const dn = btn(acts, 'fwd', 'Later', 'move it one place later (Alt+↓)'); dn.dataset.act = 'down'; dn.disabled = i === SC.length - 1;
    dn.onclick = () => change(src => RS.moveScene(src, i, i + 1), i + 1);
    const dup = btn(acts, 'copy', 'Duplicate', 'a copy of this shot right after it (⌘D)'); dup.dataset.act = 'duplicate';
    dup.onclick = () => change(src => RS.duplicateScene(src, i), i + 1);
    const del = btn(acts, 'discard', 'Delete', 'take this shot out (⌫; Undo brings it back)'); del.dataset.act = 'delete'; del.disabled = SC.length < 2;
    del.onclick = () => change(src => RS.removeScene(src, i), Math.max(0, Math.min(i, SC.length - 2)));
  }

  // ── the list ──────────────────────────────────────────────────────────
  let sel = null, rows = [];
  // a transition chip: gold where the shot sets it, cyan where every shot's is, plain the rig's own
  function chip(box, i, name, text) {
    const own = ownCue(i, name) != null, reel = !own && reelCue(name) != null && RS.cueNames(P.edit.scenes[i].type).includes(name);
    const c = el('span', 'chip' + (own ? ' own-set' : reel ? ' every-set' : ''), box, text);
    c.title = `${RS.CUES[name].about}: ${cueNow(i, name)}${own ? ' (this shot\'s own)' : reel ? ' (every shot\'s)' : ' (the rig\'s own)'}`;
  }
  async function tile(t, sc) {
    const m = firstMedia(sc);
    const shape = sc.type === 'title' || sc.type === 'end' ? ' sh-oval' : '';
    t.className = 'sh-tile' + shape;
    const w = words(sc);
    t.textContent = w.shows || w.said || sc.type;
    if (m && window.REEL_PICKER) {
      const u = await window.REEL_PICKER.thumbFor(m.path, m.kind).catch(() => null);
      if (u) { t.textContent = ''; const im = new Image(); im.alt = ''; im.draggable = false; im.src = u; t.appendChild(im); }
    }
  }
  function draw() {
    P = L.parsed;
    const n = SC.length;
    sum.textContent = `${n} shot${n === 1 ? '' : 's'} · ${fmt(L.duration)}`;
    const ec = P.edit.cues ? Object.entries(P.edit.cues).map(([k, v]) => `${k} ${v}`).join(' · ') : '';
    everySum.innerHTML = (UI ? UI.icon('chevRight') : '') + '<span></span>';
    everySum.querySelector('span').textContent = `Every shot: ${ec || 'the rig\'s own transitions'}`;
    everySum.title = 'transitions for every shot at once; a shot\'s own still wins';
    editor(everyEd, null);
    list.textContent = ''; rows = [];
    if (sel != null && sel >= n) sel = n - 1;
    SC.forEach((S, i) => {
      const sc = P.edit.scenes[i], w = words(sc);
      const r = el('div', 'row' + (sel === i ? ' sel' : ''), list);
      r.dataset.i = i; r.tabIndex = 0; r.setAttribute('role', 'option'); r.setAttribute('aria-selected', String(sel === i));
      r.title = `${i + 1} · ${sc.type} · ${fmt(S.start)} → ${fmt(S.end)}\nclick to go there; drag to move it`;
      el('span', 'n', r, String(i + 1));
      tile(el('div', 'tile', r), sc);
      const meta = el('div', 'meta', r);
      const top = el('div', 'top', meta); el('b', null, top, sc.type); el('span', null, top, `${n3(sc.dur)} s`);
      el('div', 'said', meta, w.said || '—');
      if (w.shows && w.shows !== w.said) el('div', 'shows', meta, w.shows);
      const tx = el('div', 'tx', meta);
      chip(tx, i, 'arrive', `arrive ${n3(cueNow(i, 'arrive'))}s`);
      if (RS.cueNames(sc.type).includes('leave')) chip(tx, i, 'leave', `leave ${n3(cueNow(i, 'leave'))}s`);
      if (cueNow(i, 'ease') !== 'own') chip(tx, i, 'ease', cueNow(i, 'ease'));
      rows.push(r);
      press(r, i);
      if (sel === i) { const ed = el('div', 'ed', list); ed.dataset.shot = i; editor(ed, i); }
    });
    markNow(L.now(), true);
  }
  let nowI = -1;
  function markNow(t, force) {
    const i = sceneAt(t).i;
    if (i === nowI && !force) return;
    nowI = i;
    rows.forEach((r, k) => r.classList.toggle('sh-now', k === i));
  }
  // a click on a shot goes there and opens it; on the open one, it closes it
  function select(i, seek) {
    if (seek && sel === i) sel = null;
    else { sel = i; if (seek && i != null) L.seek(SC[i].start + 0.001); }
    draw();
    const r = rows[sel]; if (r) { r.focus({ preventScroll: true }); r.scrollIntoView({ block: 'nearest' }); }
  }

  // ── pressing a row: a click goes there, a drag moves the shot ─────────
  let drop = null;
  function press(r, i) {
    r.addEventListener('dragstart', e => e.preventDefault());   // a picture in it is not dragged away by the browser
    r.addEventListener('pointerdown', e => {
      if (e.button !== 0 || e.target.closest('input, select, button')) return;
      const y0 = e.clientY; let moving = false, to = i;
      try { r.setPointerCapture(e.pointerId); } catch (x) { /* synthetic */ }
      const mv = ev => {
        if (!moving && Math.abs(ev.clientY - y0) < 5) return;
        if (!moving) { moving = true; r.classList.add('sh-drag'); drop = el('div', 'drop', list); }
        // the gap the pointer is nearest: before row k (or after the last)
        let k = rows.length, top = 0;
        for (let j = 0; j < rows.length; j++) { const b = rows[j].getBoundingClientRect(); if (ev.clientY < b.top + b.height / 2) { k = j; break; } }
        const lb = list.getBoundingClientRect();
        if (k < rows.length) top = rows[k].getBoundingClientRect().top - lb.top - 3;
        else { const b = rows[rows.length - 1].getBoundingClientRect(); top = b.bottom - lb.top + 1; }
        drop.style.top = top + 'px';
        to = k > i ? k - 1 : k;                   // the shot's new index, once it has left its own place
        const b = body.getBoundingClientRect();     // near an edge of the list, it scrolls
        if (ev.clientY < b.top + 24) body.scrollTop -= 8; else if (ev.clientY > b.bottom - 24) body.scrollTop += 8;
      };
      const up = () => {
        r.removeEventListener('pointermove', mv); r.removeEventListener('pointerup', up); r.removeEventListener('pointercancel', up);
        r.classList.remove('sh-drag'); if (drop) { drop.remove(); drop = null; }
        if (!moving) { select(i, true); return; }
        if (to !== i) change(src => RS.moveScene(src, i, to), to);
      };
      r.addEventListener('pointermove', mv); r.addEventListener('pointerup', up); r.addEventListener('pointercancel', up);
    });
  }
  // keys on a focused row
  list.addEventListener('keydown', e => {
    const r = e.target.closest('.sh-row'); if (!r) return;
    const i = +r.dataset.i, n = SC.length;
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault(); e.stopPropagation();
      const j = i + (e.key === 'ArrowUp' ? -1 : 1);
      if (j < 0 || j >= n) return;
      if (e.altKey) change(src => RS.moveScene(src, i, j), j); else { sel = j; draw(); rows[j].focus(); }
    } else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); sel = i; L.seek(SC[i].start + 0.001); if (L.setPlaying) L.setPlaying(true); draw(); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && n > 1) { e.preventDefault(); e.stopPropagation(); change(src => RS.removeScene(src, i), Math.max(0, Math.min(i, n - 2))); }
    else if ((e.key === 'd' || e.key === 'D') && (e.metaKey || e.ctrlKey)) { e.preventDefault(); e.stopPropagation(); change(src => RS.duplicateScene(src, i), i + 1); }
  });

  // ── open, shut, and where the panel sits ──────────────────────────────
  // Beside the preview in a window of BESIDE px and up (the stage makes room on the left); over
  // it in a narrower one. It shares the left side with the Fish panel: one at a time.
  const BESIDE = 1100, PW = 316;
  function placePanel() {
    const over = innerWidth < BESIDE;
    root.classList.toggle('sh-over', over);
    L.reserveLeft(!root.hidden && !over ? PW : 0);
  }
  let tool = null;
  function open(on) {
    if (on === undefined) on = root.hidden;
    if (on && window.REEL_FISH && window.REEL_FISH.isOpen) window.REEL_FISH.open(false);
    root.hidden = !on; put(K_OPEN, !!on);
    if (tool) tool.setAttribute('aria-pressed', String(!!on));
    placePanel();
    if (on) draw();
  }
  xBtn.onclick = () => open(false);
  addEventListener('resize', () => { if (!root.hidden) placePanel(); });
  addEventListener('keydown', e => {
    if (e.defaultPrevented || (e.target.closest && e.target.closest('input, textarea, select, [contenteditable]'))) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if ((e.key === 's' || e.key === 'S') && !(window.REEL_FISH && window.REEL_FISH.isOpen)) { e.preventDefault(); open(root.hidden); }
  });
  if (L.addTool) tool = L.addTool({ id: 'shots', label: 'Shots', key: 'S', order: 15, icon: 'scenes',
    title: 'the shot list: put the shots in order, time them, set their transitions', onClick: () => open(root.hidden) });
  L.onFrame(t => { if (!root.hidden) markNow(t); });
  // a change of script (here, in the timeline, an undo, another editor): drawn again, the shot
  // just moved, copied or changed selected
  if (L.onChange) L.onChange(() => {
    P = L.parsed;
    if (follow != null) { sel = Math.max(0, Math.min(SC.length - 1, follow)); follow = null; }
    if (!root.hidden) { draw(); const r = rows[sel]; if (r && document.activeElement && root.contains(document.activeElement)) r.focus({ preventScroll: true }); }
  });
  if (get(K_OPEN, false)) open(true);
  // for tests and the console
  window.REEL_SHOTS = {
    open: on => open(on === undefined ? true : on), get isOpen() { return !root.hidden; },
    select: i => { open(true); select(i, false); }, get selected() { return sel; },
    rows: () => rows.map(r => r.querySelector('.sh-top b').textContent),
  };
})();
