// The reel's synth rack: the score's instruments, drawn and playable, in the preview itself.
//
// The score (Assets/<name>.score.txt, next to the script) stays the one source of truth. The
// rack reads it with ReelMusic, plays it under the preview with ReelSynth, and changes it the way
// a person would, one line at a time (ReelMusic.setArg / setLine / toggleTrack), so a knob moves
// one number on one line and the rest of the file stays as written. Every change is heard at
// once; it is saved when you let go of the knob, through the dev server (node
// scripts/reel-dev.mjs), or with the page's host (window.REEL_HOST: the editor published on
// claude.ai keeps saves with the page), or, without either, as a draft in this tab. The preview never reloads for
// the music: the rack swaps the arrangement under the playhead.
//
//   M                open / shut (the preview shrinks to the left of it)
//   pads             each part's pads (the patterns its clips can play) as tiles: click one to
//                    edit it below, ▶ to hear it on its own
//   step             click: . → x → X (accent) → o (soft) → .  (a tune is typed: E5 . C5 …)
//   take             a pad that sings a TAKE (a melody sung over the cut) opens its view: what was
//                    sung, the notes it became and how they play, four bars at a time; its mapping
//                    as knobs (octave, shift, straighten, nuance, feel); click a note for what became
//                    of it, ▲ ▼ or the arrow keys move it a semitone
//   harmonics        a voice made of harmonics (the singer's, measured) shows them as bars: drag one
//   knob             drag up/down (Shift: fine), wheel, double-click to type a value
//   ▶                audition a sound now;  M / S  mute / solo (not saved: listening aids)
//   ↶ ↷              undo / redo (Cmd/Ctrl+Z over the rack)
// The arrangement, the clips on the bars, is the timeline's (E).
//
// Sound needs a click or a key first (the browser's rule); the ♪ chip in the HUD says so.
// Meters are dim and move only while the rack is open (moving bright pixels on a dark field
// read as flicker on mini-LED screens; like-every-cloud's Sound Lab learned that).
//
// The timeline (scripts/reel-timeline.js) draws the same score under its scenes. The rack tells it
// of every change of the score, the mix and the sound (a `reel-score` event on window), and lends
// it mute, solo, mix, focus, colour, canUndo/canRedo through window.REEL_RACK. Its edits, and the
// timeline's edits of the score, are noted in the one history (REEL_LIVE.journal), so the
// timeline's Undo takes back a score edit too.
//
// A classic script the rig injects in live mode, after reel-music.js and reel-synth.js.
(function () {
  'use strict';
  const L = window.REEL_LIVE, RM = window.ReelMusic, RSy = window.ReelSynth, RS = window.ReelScript;
  if (!L || !RM || !RSy || document.getElementById('reel-rack')) return;

  const FILE = L.file.replace(/\.script\.txt$/, '.score.txt');           // Assets/<name>.score.txt
  const NAME = FILE.replace(/^Assets\//, '');
  const DRAFT_KEY = 'reel-draft:' + FILE, K_OPEN = 'reel-rack-open', K_UNDO = 'reel-rack-undo:' + FILE, K_REDO = 'reel-rack-redo:' + FILE, K_SOUND = 'reel-sound';
  const get = (k, d, s = sessionStorage) => { try { const v = s.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
  const put = (k, v, s = sessionStorage) => { try { s.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
  const W = 540;                                                         // the rack's width, px
  const BESIDE = 1080;          // a window at least this wide keeps the preview beside the rack; a narrower one lays the rack over it
  const PALETTE = ['#b2e8fa', '#d4af37', '#b6ffba', '#ffb27d', '#b8a8f7', '#ff9b8a', '#7fd6c2', '#e8c3f0'];

  // the scenes as the score sees them (read again when the script changes: the arrangement
  // follows the cut, below)
  let SCENES, MOMENTS;
  const timing = () => {
    const SP = RS.spans(L.parsed.edit);
    SCENES = SP.map((c, i) => ({ type: L.parsed.edit.scenes[i].type, start: c.start, end: c.end }));
    MOMENTS = RM.moments(L.parsed.edit, RS);
  };
  timing();

  // ── style ─────────────────────────────────────────────────────────────
  const css = document.createElement('style');
  css.textContent = `
#reel-rack { position: fixed; top: 0; right: 0; bottom: 0; width: min(${W}px, 100vw); z-index: 60; box-sizing: border-box; overflow-y: auto; overflow-x: hidden;
  background: rgba(var(--surface-rgb), 0.97); border-left: 1px solid rgba(var(--cyan-dim-rgb), 0.3);
  font: 500 11px/1.3 var(--font-mono); color: var(--ink-quiet); user-select: none; -webkit-user-select: none; padding: 0 14px 40px; scrollbar-width: thin; }
#reel-rack[hidden] { display: none; }
#reel-rack * { box-sizing: border-box; }
#reel-rack h2 { font: 300 18px/1 var(--font-display); color: var(--cyan); letter-spacing: 0.12em; margin: 0; }
#reel-rack h3 { font: 500 11px/1 var(--font-mono); letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-faint); margin: 18px 0 8px; }
#reel-rack .rk-top { position: sticky; top: 0; z-index: 3; background: rgba(var(--surface-rgb), 0.99); padding: 14px 0 10px; border-bottom: 1px solid rgba(var(--cyan-dim-rgb), 0.18); }
#reel-rack .rk-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
#reel-rack .rk-sub { color: var(--ink-faint); margin-top: 6px; }
#reel-rack .rk-status { margin-top: 6px; color: var(--ink-quiet); min-height: 14px; }
#reel-rack .rk-status.bad { color: var(--gold); }
#reel-rack button, #reel-rack select, #reel-rack input[type=text] { font: 500 11px/1 var(--font-mono); color: var(--text-bright); background: rgba(var(--cyan-dim-rgb), 0.07);
  border: 1px solid rgba(var(--cyan-dim-rgb), 0.28); border-radius: 6px; padding: 5px 8px; cursor: pointer; }
#reel-rack button:hover { border-color: var(--cyan-dim); color: var(--cyan); }
#reel-rack button.on { background: rgba(var(--gold-rgb), 0.14); border-color: var(--gold); color: var(--gold); }
#reel-rack button.sm { padding: 3px 6px; min-width: 22px; }
#reel-rack .rk-top button { height: 28px; padding: 0 9px; flex: none; }
#reel-rack .rk-top button.sm { padding: 0; width: 28px; }
#reel-rack.rk-over { background: rgb(var(--surface-rgb)); box-shadow: -12px 0 32px var(--elevation); }
#reel-rack select { padding: 4px 6px; }
#reel-rack input[type=text] { cursor: text; width: 100%; }
#reel-rack .rk-grow { flex: 1; }
/* pads: a row a part, a tile a pad; the chosen pad's steps under them */
#reel-rack .rk-prow { display: flex; align-items: flex-start; gap: 8px; margin: 0 0 6px; }
#reel-rack .rk-prow .rk-pname { width: 52px; flex: none; padding-top: 6px; font: 600 10px/1.2 var(--font-mono); letter-spacing: 0.06em; }
#reel-rack .rk-tiles { display: flex; flex-wrap: wrap; gap: 5px; flex: 1; }
#reel-rack .rk-tile { position: relative; width: 84px; height: 44px; padding: 5px 6px; border-radius: 7px; cursor: pointer; box-sizing: border-box;
  display: flex; flex-direction: column; justify-content: space-between; background: rgba(var(--cyan-dim-rgb), 0.06); border: 1px solid rgba(var(--cyan-dim-rgb), 0.28); }
#reel-rack .rk-tile b { font: 600 10px/1 var(--font-mono); color: var(--text-bright); }
#reel-rack .rk-tile:hover { border-color: var(--gold); }
#reel-rack .rk-tile.on { border-color: var(--gold); background: rgba(var(--gold-rgb), 0.1); box-shadow: inset 0 0 0 1px var(--gold); }
#reel-rack .rk-tile button.sm { position: absolute; right: 3px; top: 3px; padding: 0; width: 20px; height: 20px; min-width: 0; }
#reel-rack .rk-paded { border: 1px solid rgba(var(--cyan-dim-rgb), 0.2); border-radius: 9px; padding: 8px 10px; margin: 4px 0 8px 60px; }
#reel-rack .rk-pvoice { display: grid; grid-template-columns: 48px 1fr; align-items: center; gap: 6px; margin: 3px 0; }
#reel-rack .rk-pvoice > span { color: var(--ink-faint); font-size: 10px; overflow: hidden; text-overflow: ellipsis; }
#reel-rack .rk-pvoice .rk-steps { margin-top: 0; }
/* modules */
#reel-rack .rk-mod { border: 1px solid rgba(var(--cyan-dim-rgb), 0.18); border-top: 2px solid var(--acc); border-radius: 9px; padding: 9px 10px 8px; margin: 0 0 10px; background: rgba(var(--cyan-dim-rgb), 0.03); }
#reel-rack .rk-mod.muted { opacity: 0.55; }
#reel-rack .rk-head { display: flex; align-items: center; gap: 6px; }
#reel-rack .rk-head b { font: 500 12px/1 var(--font-mono); color: var(--acc); letter-spacing: 0.1em; text-transform: uppercase; }
#reel-rack .rk-head .rk-kind { color: var(--ink-faint); }
#reel-rack .rk-meter { width: 60px; height: 4px; background: rgba(var(--cyan-dim-rgb), 0.1); border-radius: 2px; overflow: hidden; }
#reel-rack .rk-meter i { display: block; height: 100%; width: 0; background: rgba(var(--cyan-dim-rgb), 0.55); }
#reel-rack .rk-knobs { display: flex; flex-wrap: wrap; gap: 2px 4px; margin-top: 6px; align-items: flex-end; }
#reel-rack .rk-group { display: flex; gap: 2px; padding: 4px 4px 2px; border-radius: 6px; background: rgba(var(--cyan-dim-rgb), 0.04); align-items: flex-end; }
#reel-rack .rk-group > span.rk-gl { writing-mode: vertical-rl; transform: rotate(180deg); font-size: 9px; color: var(--ink-faint); letter-spacing: 0.1em; align-self: center; }
#reel-rack .rk-knob { width: 44px; text-align: center; cursor: ns-resize; }
#reel-rack .rk-knob svg { display: block; margin: 0 auto; }
#reel-rack .rk-knob .v { color: var(--text-bright); font-size: 9.5px; white-space: nowrap; }
#reel-rack .rk-knob .l { color: var(--ink-faint); font-size: 9px; }
#reel-rack .rk-knob input { width: 44px; padding: 1px 2px; font-size: 10px; }
#reel-rack .rk-steps { display: grid; grid-template-columns: repeat(16, 1fr); gap: 3px; margin-top: 8px; }
#reel-rack .rk-step { height: 16px; border-radius: 3px; border: 1px solid rgba(var(--cyan-dim-rgb), 0.22); cursor: pointer; }
#reel-rack .rk-step:nth-child(4n+1) { border-color: rgba(var(--cyan-dim-rgb), 0.45); }
#reel-rack .rk-step.now { box-shadow: inset 0 -2px 0 var(--gold); }
#reel-rack .rk-voice { display: flex; align-items: center; gap: 4px; }
#reel-rack .rk-line { display: flex; align-items: center; gap: 6px; margin-top: 6px; flex-wrap: wrap; }
#reel-rack .rk-line > label { color: var(--ink-faint); }
#reel-rack svg.rk-shape { background: rgba(var(--cyan-dim-rgb), 0.05); border-radius: 4px; }
#reel-rack .rk-note { color: var(--ink-faint); font-size: 10px; margin-top: 6px; line-height: 1.45; }
/* a sung take: the mapping's knobs, the view (what was sung, the notes, how they play), the whole take */
#reel-rack .rk-take { border: 1px solid rgba(var(--cyan-dim-rgb), 0.22); border-top: 2px solid var(--acc); border-radius: 9px; padding: 8px 10px 10px; margin: 4px 0 10px; background: rgba(var(--cyan-dim-rgb), 0.03); }
#reel-rack .rk-take .rk-thead { display: flex; align-items: center; gap: 6px; }
#reel-rack .rk-take .rk-knob { width: 58px; }
#reel-rack .rk-take .rk-thead b { font: 500 12px/1 var(--font-mono); color: var(--acc); letter-spacing: 0.1em; text-transform: uppercase; }
#reel-rack .rk-take canvas { display: block; width: 100%; border-radius: 6px; }
#reel-rack .rk-take canvas.rk-tcv { height: 176px; margin-top: 8px; cursor: pointer; background: rgba(var(--cyan-dim-rgb), 0.03); }
#reel-rack .rk-take canvas.rk-tcv:focus-visible { outline: 1px solid var(--gold); }
#reel-rack .rk-take canvas.rk-tov { height: 30px; margin-top: 4px; cursor: pointer; }
#reel-rack .rk-take .rk-tnav { margin-top: 6px; gap: 6px; }
#reel-rack .rk-take .rk-tnav span { color: var(--ink-quiet); }
#reel-rack .rk-take .rk-tkey { display: flex; flex-wrap: wrap; gap: 4px 12px; margin-top: 6px; color: var(--ink-faint); font-size: 10px; }
#reel-rack .rk-take .rk-tkey i { display: inline-block; width: 14px; height: 0; vertical-align: middle; margin-right: 4px; border-top: 1.5px solid; }
#reel-rack .rk-take .rk-tkey i.sung { border-color: rgba(178, 232, 250, 0.6); }
#reel-rack .rk-take .rk-tkey i.note { height: 7px; border: none; background: var(--acc); opacity: 0.7; border-radius: 1px; }
#reel-rack .rk-take .rk-tkey i.play { border-color: var(--gold); }
#reel-rack .rk-take .rk-tkey i.drift { border-color: rgba(var(--gold-rgb), 0.55); border-top-style: dashed; }
#reel-rack .rk-take .rk-tkey i.out { border-color: rgba(178, 232, 250, 0.4); border-top-style: dotted; }
#reel-rack .rk-take .rk-tsel { display: flex; align-items: flex-start; gap: 6px; margin-top: 8px; min-height: 30px; color: var(--ink-quiet); line-height: 1.45; }
#reel-rack .rk-take .rk-tsel > span { flex: 1; }
#reel-rack .rk-take .rk-tsel b { color: var(--text-bright); font-weight: 600; }
#reel-rack .rk-take .rk-tsum { color: var(--ink-quiet); font-size: 10.5px; line-height: 1.55; margin: 8px 0 0; }
#reel-rack .rk-harm svg text { font: 500 8px var(--font-mono); fill: var(--ink-faint); text-anchor: middle; }
#reel-rack .rk-harm svg { cursor: ns-resize; touch-action: none; }
#reel-rack .rk-harm .rk-hnote { color: var(--ink-faint); font-size: 10px; }
#hud .rk-chip { color: var(--ink-quiet); cursor: pointer; white-space: nowrap; }
#hud .rk-chip.off { color: var(--gold); }
#hud button.rk-chip[aria-pressed="true"] { color: var(--text-bright); border-color: rgba(var(--cyan-dim-rgb), 0.32); background: rgba(var(--cyan-dim-rgb), 0.08); }
`;
  document.head.appendChild(css);

  // ── the model ─────────────────────────────────────────────────────────
  let src = null, P = null, A = null, fileText = null, draft = false, err = '';
  // a page host that keeps saves when there is no dev server (the editor published on claude.ai)
  const HOST = !L.dev && window.REEL_HOST ? window.REEL_HOST : null;
  let hosted = false, hostRefused = false;                               // playing the host's saved version; the viewer said no
  let ctx = null, player = null;
  const undoS = get(K_UNDO, []), redoS = get(K_REDO, []);
  const root = document.createElement('div'); root.id = 'reel-rack'; root.hidden = true; document.body.appendChild(root);
  let hovering = false;
  root.addEventListener('pointerenter', () => { hovering = true; }); root.addEventListener('pointerleave', () => { hovering = false; });

  function read(text) {
    const p = RM.parse(text);                                            // throws with .errors
    const a = RM.arrange(p.score, SCENES, MOMENTS);
    src = text; P = p; A = a; err = '';
    if (player) player.set(P, A);
    tell('score');
  }
  // the timeline draws the score under the scenes (scripts/reel-timeline.js): it hears of every
  // change of the score, the mix (mute, solo) and the sound on this event
  const tell = why => dispatchEvent(new CustomEvent('reel-score', { detail: { why } }));

  // ── sound ─────────────────────────────────────────────────────────────
  let soundOn = get(K_SOUND, true, localStorage);
  function ensureAudio() {
    if (!ctx) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C || !P) return;
      ctx = new C({ latencyHint: 'interactive' });
      player = RSy.Player(ctx, P, A);
    }
    if (soundOn && ctx.state !== 'running') ctx.resume().catch(() => {});
    chip();
  }
  const unlock = () => { ensureAudio(); if (ctx && ctx.state === 'running') { removeEventListener('pointerdown', unlock, true); removeEventListener('keydown', unlock, true); } };
  addEventListener('pointerdown', unlock, true); addEventListener('keydown', unlock, true);
  function setSound(on) {
    soundOn = on; put(K_SOUND, on, localStorage);
    ensureAudio();
    if (ctx) { if (on) ctx.resume().catch(() => {}); else { player.stop(); ctx.suspend().catch(() => {}); } }
    chip(); if (!root.hidden) render();
    tell('sound');
  }
  // Mute and solo, for listening: heard at once, never saved. on: true, false, or (left out) the
  // other way round. The rack's modules and the timeline's lanes show it.
  function mute(name, on) {
    ensureAudio(); if (!player) return;
    player.E.setMute(name, on == null ? !player.E.mutes.has(name) : !!on);
    if (!root.hidden) render(); tell('mix');
  }
  function solo(name, on) {
    ensureAudio(); if (!player) return;
    player.E.setSolo(name, on == null ? !player.E.solos.has(name) : !!on);
    if (!root.hidden) render(); tell('mix');
  }
  const mixOf = name => {
    const E = player && player.E, m = !!(E && E.mutes.has(name)), so = !!(E && E.solos.has(name));
    return { muted: m, soloed: so, silent: m || !!(E && E.solos.size && !so) };
  };
  // open the rack at one instrument's module (the timeline's Shift-click on a lane)
  function focus(name) {
    const part = P && P.score.parts.find(p => p.name === name);
    if (part && part.pads.length && !(selPad && selPad.part === name)) selPad = { part: name, pad: part.pads[0].name };
    open(true);
    const m = part ? root.querySelector(`.rk-prow[data-part="${CSS.escape(name)}"]`)
      : [...root.querySelectorAll('.rk-mod')].find(x => { const b = x.querySelector('.rk-head b'); return b && b.textContent === name; });
    if (!m) return;
    m.scrollIntoView({ block: 'center' });
    m.animate([{ boxShadow: '0 0 0 3px rgba(212,175,55,0.6)' }, { boxShadow: '0 0 0 0 rgba(212,175,55,0)' }], { duration: 900 });
  }
  // the HUD's chip: sound on, off, or waiting for a click
  // Two buttons in the HUD's tools (REEL_LIVE.addTool): the sound, and the rack itself (M)
  const hud = document.getElementById('hud');
  const soundClick = e => { e.stopPropagation(); if (!ctx || ctx.state !== 'running') { soundOn = true; ensureAudio(); } else setSound(!soundOn); };
  let chipEl, rackBtn = null;
  if (L.addTool) {
    chipEl = L.addTool({ id: 'sound', label: 'sound', order: 10, cls: 'rk-chip', icon: 'sound', title: 'the preview\'s sound, on or off', onClick: soundClick });
    rackBtn = L.addTool({ id: 'synths', label: 'Synths', key: 'M', order: 30, icon: 'synths', title: 'the synth rack: the music\'s instruments and effects', onClick: () => open(root.hidden) });
  } else {                                                              // an older rig: a chip before the bar
    chipEl = document.createElement('span'); chipEl.className = 'rk-chip'; chipEl.appendChild(document.createElement('span'));
    chipEl.addEventListener('click', soundClick);
    if (hud) hud.insertBefore(chipEl, hud.querySelector('.bar'));
  }
  function chip() {
    const live = ctx && ctx.state === 'running' && soundOn;
    const words = !P ? 'no score' : live ? 'sound on' : soundOn ? 'click for sound' : 'sound off';
    if (window.REEL_UI && chipEl.tagName === 'BUTTON') {
      REEL_UI.relabel(chipEl, words, 'the preview\'s sound: ' + words);
      const svg = chipEl.querySelector('svg'); if (svg) svg.outerHTML = REEL_UI.icon(live ? 'sound' : 'mute');
    } else chipEl.firstChild.textContent = '♪ ' + words;
    chipEl.classList.toggle('off', !live);
    chipEl.setAttribute('aria-pressed', String(!!live));
  }

  L.onFrame((t, wall) => {
    if (player && soundOn) player.tick(t, L.isPlaying(), wall);
    if (!root.hidden) frame(t);
  });

  // ── saving: every change is one new score text ────────────────────────
  let saveTimer = null, saving = false, dirtyText = null;
  // hear it now, save it soon (a drag saves once, when it ends)
  function change(text, { save = true, record = true, rerender = true } = {}) {
    const before = src;
    try { read(text); } catch (e) { status((e.errors || [e.message]).join(' · '), true); return false; }
    if (record && before !== text) { undoS.push(before); if (undoS.length > 40) undoS.shift(); redoS.length = 0; put(K_UNDO, undoS); put(K_REDO, redoS); if (L.journal) L.journal.note('score'); }
    if (save) queueSave();
    if (rerender && !root.hidden) render();          // shut, it draws itself when it opens
    return true;
  }
  function queueSave() { dirtyText = src; clearTimeout(saveTimer); saveTimer = setTimeout(flush, 350); status('…'); }
  async function flush() {
    if (dirtyText == null || saving) return;
    const text = dirtyText; dirtyText = null; saving = true;
    try {
      if (L.dev) {
        const r = await fetch('/__reel/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file: FILE, text }) }).catch(e => ({ ok: false, status: e.message }));
        const j = r.json ? await r.json().catch(() => ({})) : {};
        if (!r.ok) status('not saved: ' + ((j.errors || []).join(' · ') || r.status), true);
        else { fileText = text; draft = false; try { sessionStorage.removeItem(DRAFT_KEY); } catch (e) { /* none */ } status(`saved ${NAME}`); }
      } else if (HOST && await Promise.resolve(HOST.ready).catch(() => false) && !hostRefused) {
        // the first save asks the viewer to let the page store data; a no keeps drafts in the tab
        const r = await Promise.resolve(HOST.save(FILE, text)).catch(e => ({ ok: false, errors: [e && e.message || String(e)] }));
        if (r && r.ok) { hosted = true; draft = false; try { sessionStorage.removeItem(DRAFT_KEY); } catch (e) { /* none */ } status(`saved on ${HOST.name}`); }
        else if (r && r.fallback) { hostRefused = true; if (put(DRAFT_KEY, text)) { draft = true; status(`${HOST.name} is not storing data for this page, so this is a draft in this tab`); } }
        else status('not saved: ' + ((r && r.errors) || []).join(' · '), true);
      } else if (put(DRAFT_KEY, text)) { draft = true; status('kept as a draft in this tab (run node scripts/reel-dev.mjs to save the file)'); }
      else status('not saved: this browser keeps no drafts here', true);
    } finally { saving = false; if (dirtyText != null) flush(); }
    if (!root.hidden) renderTop();
  }
  function undo(back) {
    const from = back ? undoS : redoS, to = back ? redoS : undoS;
    if (!from.length) return false;
    to.push(src);
    const text = from.pop();
    put(K_UNDO, undoS); put(K_REDO, redoS);
    if (L.journal) L.journal.step('score', back);
    change(text, { record: false });
    return true;
  }
  let statusText = '', statusBad = false;
  function status(t, bad) { statusText = t; statusBad = !!bad; const el = root.querySelector('.rk-status'); if (el) { el.textContent = t; el.classList.toggle('bad', !!bad); } }

  // ── knobs ─────────────────────────────────────────────────────────────
  // spec: [min, max, 'log' | step, unit]
  const SPEC = {
    cents: [-2400, 2400, 1, 'ct'], vlevel: [0, 1, 0.01, ''], ffreq: [30, 18000, 'log', 'Hz'], q: [0.1, 24, 0.1, ''],
    attack: [0.001, 3, 'log', 's'], decay: [0, 3, 0.01, 's'], sustain: [0, 1, 0.01, ''], release: [0.005, 5, 'log', 's'],
    lrate: [0.02, 20, 'log', 'Hz'], 'ldepth-filter': [0, 4000, 10, 'Hz'], 'ldepth-pitch': [0, 200, 1, 'ct'], 'ldepth-gain': [0, 1, 0.01, ''],
    len: [0.5, 16, 0.5, 'st'], level: [0, 1.5, 0.01, ''], pan: [-1, 1, 0.01, ''], send: [0, 1, 0.01, ''],
    tune: [20, 9000, 'log', 'Hz'], ddecay: [0.005, 3, 'log', 's'], tone: [80, 18000, 'log', 'Hz'], oct: [0, 8, 1, ''], beats: [0.5, 16, 0.5, 'bt'],
  };
  const fxSpec = (d) => [d[1], d[2], /Hz/.test(d[3]) && d[2] / Math.max(d[1], 1e-3) > 8 ? 'log' : Math.pow(10, Math.floor(Math.log10((d[2] - d[1]) / 200))), d[3]];
  const round = (v, s) => s[2] === 'log' ? +v.toPrecision(3) : +(Math.round(v / s[2]) * s[2]).toFixed(6);
  const norm = (v, s) => s[2] === 'log' ? Math.log(v / s[0]) / Math.log(s[1] / s[0]) : (v - s[0]) / (s[1] - s[0]);
  const denorm = (k, s) => s[2] === 'log' ? s[0] * Math.pow(s[1] / s[0], k) : s[0] + k * (s[1] - s[0]);
  const show = (v, s) => { const a = Math.abs(v); const t = a >= 1000 ? (v / 1000).toFixed(a >= 10000 ? 1 : 2) + 'k' : a >= 100 ? v.toFixed(0) : a >= 10 ? v.toFixed(1) : a >= 1 ? v.toFixed(2) : v.toFixed(3); return t.replace(/(\.\d*?)0+(k?)$/, '$1$2').replace(/\.(k?)$/, '$1'); };
  // a knob: `get()` its value, `set(v, final)` changes the score (final: the drag ended)
  function knob(label, spec, value, set) {
    const el = document.createElement('div'); el.className = 'rk-knob';
    el.title = `${label}: drag, wheel, or double-click to type${spec[3] ? ' (' + spec[3] + ')' : ''}`;
    let v = value;
    const R = 15, C = 21;
    const arc = (k) => { const a0 = Math.PI * 0.75, a1 = a0 + Math.PI * 1.5 * k; const p = a => [C + R * Math.cos(a), C + R * Math.sin(a)]; const [x0, y0] = p(a0), [x1, y1] = p(a1); return `M${x0.toFixed(1)} ${y0.toFixed(1)} A${R} ${R} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`; };
    const draw = () => {
      const k = Math.max(0, Math.min(1, norm(v, spec)));
      el.innerHTML = `<svg width="42" height="36" viewBox="0 0 42 38"><path d="${arc(1)}" fill="none" stroke="rgba(77,201,246,0.18)" stroke-width="3" stroke-linecap="round"/>`
        + (k > 0.001 ? `<path d="${arc(k)}" fill="none" stroke="var(--acc, var(--cyan))" stroke-width="3" stroke-linecap="round"/>` : '')
        + `<circle cx="${C}" cy="${C}" r="9" fill="rgba(77,201,246,0.06)" stroke="rgba(77,201,246,0.3)"/>`
        + `<line x1="${C}" y1="${C}" x2="${(C + 9 * Math.cos(Math.PI * 0.75 + Math.PI * 1.5 * k)).toFixed(1)}" y2="${(C + 9 * Math.sin(Math.PI * 0.75 + Math.PI * 1.5 * k)).toFixed(1)}" stroke="var(--text-bright)" stroke-width="1.5" stroke-linecap="round"/></svg>`
        + `<div class="v">${show(v, spec)}${spec[3] ? '<span style="color:var(--ink-faint)"> ' + spec[3] + '</span>' : ''}</div><div class="l">${label}</div>`;
    };
    draw();
    const commit = (nv, final) => { nv = Math.max(spec[0], Math.min(spec[1], round(nv, spec))); if (nv === v && !final) return; v = nv; draw(); set(v, final); };
    el.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      e.preventDefault(); el.setPointerCapture(e.pointerId); gestureStart();
      const y0 = e.clientY, k0 = norm(v, spec); let moved = false;
      const mv = ev => { moved = true; const k = Math.max(0, Math.min(1, k0 + (y0 - ev.clientY) / (ev.shiftKey ? 600 : 160))); commit(denorm(k, spec), false); };
      const up = () => { el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); if (moved) set(v, true); };
      el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    });
    let wheelT = null;
    el.addEventListener('wheel', e => { e.preventDefault(); if (!wheelT) gestureStart(); const k = Math.max(0, Math.min(1, norm(v, spec) - Math.sign(e.deltaY) * (e.shiftKey ? 0.005 : 0.025))); commit(denorm(k, spec), false); clearTimeout(wheelT); wheelT = setTimeout(() => { wheelT = null; set(v, true); }, 400); }, { passive: false });
    el.addEventListener('dblclick', () => {
      gestureStart();
      const inp = document.createElement('input'); inp.type = 'text'; inp.value = String(v);
      el.querySelector('.v').replaceWith(inp); inp.focus(); inp.select();
      const done = ok => { if (ok && inp.value.trim() !== '' && isFinite(+inp.value)) commit(+inp.value, true); else draw(); };
      inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false); });
      inp.addEventListener('blur', () => done(true));
    });
    return el;
  }
  // a knob on one value of one line: [kind, name, key, arg, index]
  function argKnob(label, spec, value, where) {
    return knob(label, spec, value, (v, final) => {
      let text;
      try { text = RM.setArg(src, where[0], where[1], where[2], where[3], v, where[4] || 0); }
      catch (e) { status((e.errors || [e.message]).join(' · '), true); return; }
      change(text, { save: false, record: false, rerender: false });
      if (final) { undoFix(); queueSave(); }
    });
  }
  // a drag records one undo step: the text from before it began (every move is heard, unsaved)
  let dragBase = null;
  const gestureStart = () => { dragBase = src; };
  function undoFix() {
    if (dragBase != null && dragBase !== src) { undoS.push(dragBase); if (undoS.length > 40) undoS.shift(); redoS.length = 0; put(K_UNDO, undoS); put(K_REDO, redoS); if (L.journal) L.journal.note('score'); }
    dragBase = null;
  }

  // a part's colour (the timeline's lanes and clips, the pads' rows); a sound wears its part's; a
  // sound effect its own
  function colourOf(name) {
    if (!P) return PALETTE[0];
    const parts = P.score.parts, pi = parts.findIndex(p => p.name === name || p.tracks.includes(name));
    if (pi >= 0) return PALETTE[pi % PALETTE.length];
    const fx = P.score.tracks.filter(t => !parts.some(p => p.tracks.includes(t.name))), i = fx.findIndex(t => t.name === name);
    return PALETTE[(parts.length + Math.max(0, i)) % PALETTE.length];
  }
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const btn = (text, title, fn, cls = '') => { const b = el('button', cls, text); b.title = title; b.addEventListener('click', e => { e.stopPropagation(); fn(e); }); return b; };
  // a button with an icon (scripts/reel-ui.js); with no label its name is its tooltip
  const ibtn = (icon, label, title, fn, cls = '') => {
    if (!window.REEL_UI) return btn(label || title, title, fn, cls);
    const b = REEL_UI.button({ icon, label, title, cls }); b.addEventListener('click', e => { e.stopPropagation(); fn(e); }); return b;
  };
  const sel = (opts, value, fn, title) => { const s = el('select'); s.title = title || ''; opts.forEach(o => { const op = el('option'); op.value = o; op.textContent = o; if (o === value) op.selected = true; s.appendChild(op); }); s.addEventListener('change', () => fn(s.value)); s.addEventListener('keydown', e => e.stopPropagation()); return s; };
  const group = (label, ...kids) => { const g = el('div', 'rk-group'); g.appendChild(el('span', 'rk-gl', label)); kids.forEach(k => g.appendChild(k)); return g; };
  const lineSet = (kind, name, key, text, index) => { try { change(RM.setLine(src, kind, name, key, text, index)); } catch (e) { status((e.errors || [e.message]).join(' · '), true); } };

  // ── drawing ───────────────────────────────────────────────────────────
  let meters = [], stepEls = {}, selPad = null;
  function renderTop() {
    const top = root.querySelector('.rk-top'); if (!top) return;
    top.innerHTML = '';
    const r1 = el('div', 'rk-row');
    r1.appendChild(el('h2', '', 'SYNTH RACK'));
    r1.appendChild(el('span', 'rk-grow'));
    const live = ctx && ctx.state === 'running' && soundOn;
    r1.appendChild(ibtn(live ? 'sound' : 'mute', live ? 'sound on' : soundOn ? 'click to start' : 'sound off', 'turn the preview\'s sound on or off', () => setSound(!live), live ? 'on' : ''));
    r1.appendChild(ibtn('undo', '', 'undo (Cmd/Ctrl+Z over the rack)', () => undo(true), 'sm'));
    r1.appendChild(ibtn('redo', '', 'redo (Shift+Cmd/Ctrl+Z over the rack)', () => undo(false), 'sm'));
    r1.appendChild(ibtn('close', '', 'close the synth rack (M)', () => open(false), 'sm'));
    top.appendChild(r1);
    if (P) top.appendChild(el('div', 'rk-sub', `${NAME} · ${P.score.tempo} BPM · ${P.score.key.name} · ${P.score.tracks.length} instruments · ${A.events.length} notes${draft ? ' · <span style="color:var(--gold)">draft</span>' : hosted ? ` · <span style="color:var(--gold)">your version on ${HOST.name}</span>` : ''}`));
    if (draft || hosted) {
      const r = el('div', 'rk-row'); r.style.marginTop = '6px';
      r.appendChild(ibtn('download', 'download score', 'save this version as a file', async () => {
        // on claude.ai the save dialog asks first, and what came of it is said under the rack's title
        if (HOST && HOST.download) { const s = HOST.said ? HOST.said(await HOST.download(NAME, src), 'The score') : null; if (s) status(s.text, s.bad); return; }
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([src], { type: 'text/plain' })); a.download = NAME; document.body.appendChild(a); a.click(); a.remove();
      }));
      r.appendChild(ibtn(hosted ? 'revert' : 'discard', hosted ? 'revert to the file' : 'discard draft', 'back to the file', async () => {
        try { sessionStorage.removeItem(DRAFT_KEY); } catch (e) { /* none */ }
        if (hosted && HOST) await Promise.resolve(HOST.discard(FILE)).catch(() => {});
        draft = false; hosted = false;
        if (fileText != null) change(fileText, { save: false });
      }));
      top.appendChild(r);
    }
    const st = el('div', 'rk-status' + (statusBad ? ' bad' : ''), ''); st.textContent = statusText; top.appendChild(st);
  }

  function render() {
    const scroll = root.scrollTop;
    root.innerHTML = '';
    takeView = null;
    root.appendChild(el('div', 'rk-top'));
    renderTop();
    meters = []; stepEls = {};
    if (!P) {
      root.appendChild(el('p', 'rk-note', err ? err : `There is no ${NAME} next to this script, so the reel is silent. Copy Assets/sizzle-reel-2.score.txt to start one.`));
      return;
    }
    const tracks = P.score.tracks, colour = {};
    tracks.forEach(t => { colour[t.name] = colourOf(t.name); });

    // the pads: a row a part, a tile a pad (what it plays, drawn); the chosen one's steps under them
    root.appendChild(el('h3', '', 'pads · what each part can play'));
    for (const part of P.score.parts) {
      const row = el('div', 'rk-prow'); row.dataset.part = part.name;
      const nm = el('span', 'rk-pname', part.name); nm.style.color = colourOf(part.name); row.appendChild(nm);
      const tiles = el('div', 'rk-tiles');
      part.pads.forEach(d => {
        const tile = el('div', 'rk-tile' + (selPad && selPad.part === part.name && selPad.pad === d.name ? ' on' : ''));
        tile.style.color = colourOf(part.name);
        tile.title = `${d.name}: ${d.voices.map(v => `${v.track} ${v.text || 'rises across its clip'}`).join(' · ')}${d.once ? ' (once, from its clip\'s start)' : ''}\nclick: edit it below · ▶ hear it`;
        tile.appendChild(el('b', '', d.name));
        tile.appendChild(padPicture(part, d));
        tile.appendChild(btn('▶', `hear ${d.name} on its own`, () => { ensureAudio(); if (player) player.E.preview(RM.padPreview(P.score, A, part.name, d.name, L.now())); }, 'sm'));
        tile.addEventListener('click', () => { selPad = selPad && selPad.part === part.name && selPad.pad === d.name ? null : { part: part.name, pad: d.name }; render(); });
        tiles.appendChild(tile);
      });
      row.appendChild(tiles);
      root.appendChild(row);
      const d = selPad && selPad.part === part.name && part.pads.find(x => x.name === selPad.pad);
      const sung = d && d.voices.find(v => v.take);
      if (d) root.appendChild(sung ? takeEditor(part, d, sung) : padEditor(part, d));
    }
    if (!P.score.parts.length) root.appendChild(el('p', 'rk-note', 'No PART lines yet: a part\'s pads are what its clips play.'));

    // the instruments
    root.appendChild(el('h3', '', 'instruments'));
    for (const t of tracks) root.appendChild(module(t, colour[t.name]));
    // the effects
    root.appendChild(el('h3', '', 'effects'));
    root.appendChild(fxModules());
    root.appendChild(el('p', 'rk-note', `Every control edits one line of ${NAME}; the file is the music. Mute and solo are for listening and are not saved.`));
    root.scrollTop = scroll;
  }
  // a pad's picture: one turn of it, as the timeline draws a clip
  function padPicture(part, d) {
    const NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', 72); svg.setAttribute('height', 18); svg.setAttribute('aria-hidden', 'true');
    if (!window.REEL_UI || !REEL_UI.rollPaths) return svg;
    const evs = RM.padPreview(P.score, A, part.name, d.name, L.now()), dur = Math.max(A.bar, ...evs.map(e => e.t + 0.05)), n = part.tracks.length;
    const rows = n > 1 ? Object.fromEntries(part.tracks.map((t, i) => [t, n - 1 - i])) : null;
    const pp = REEL_UI.rollPaths(evs, { H: 18, px: t => 1 + t / dur * 70, pxs: 70 / dur, rows, nRows: n });
    svg.innerHTML = pp.d.map((q, k) => q ? `<path d="${q}" fill="currentColor" fill-opacity="${[0.4, 0.6, 0.8, 1][k]}"/>` : '').join('');
    return svg;
  }
  // the chosen pad: a row of sixteen steps a sound (click: . → x → X → o → .), or its tune typed
  function padEditor(part, d) {
    const box = el('div', 'rk-paded'), acc = colourOf(part.name);
    box.style.setProperty('--acc', acc);
    d.voices.forEach(v => {
      const r = el('div', 'rk-pvoice'); r.appendChild(el('span', '', v.track));
      if (v.rise) { r.appendChild(el('span', '', 'rises across its clip')); box.appendChild(r); return; }
      if (v.notes) {
        const inp = el('input'); inp.type = 'text'; inp.value = v.text;
        inp.title = 'one note a step (E5, C#4), . to rest, | between bars; Enter to set';
        inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') inp.blur(); });
        inp.addEventListener('change', () => padSet(part.name, d.name, v.track, inp.value.trim()));
        r.appendChild(inp); box.appendChild(r); return;
      }
      const g = el('div', 'rk-steps'), cells = [], s16 = v.steps.length >= 16 ? v.steps.slice(0, 16) : v.steps.padEnd(16, '.');
      [...s16].forEach((c, i) => {
        const st = el('div', 'rk-step');
        if (c !== '.') { st.style.background = acc; st.style.opacity = c === 'X' ? 1 : c === 'x' ? 0.72 : 0.38; }
        st.title = `${v.track}, step ${i + 1}: ${c === 'X' ? 'accent' : c === 'x' ? 'hit' : c === 'o' ? 'soft' : 'rest'} (click to change)`;
        st.addEventListener('click', () => {
          const arr2 = [...s16]; arr2[i] = { '.': 'x', x: 'X', X: 'o', o: '.' }[c];
          padSet(part.name, d.name, v.track, arr2.join('') + (v.steps.length > 16 ? v.steps.slice(16) : ''));
        });
        g.appendChild(st); cells.push(st);
      });
      stepEls[`${part.name}/${d.name}/${v.track}`] = cells;
      r.appendChild(g); box.appendChild(r);
    });
    const note = el('p', 'rk-note', `${d.name}${d.once ? ' plays once, from its clip\'s start' : ' goes round on the bars'}${d.len != null ? `; a note lasts ${d.len} steps at most` : ''}. The timeline (E) places it: click a ${part.name} clip and choose ${d.name}.`);
    box.appendChild(note);
    return box;
  }
  // ── a sung take: the mapping, made visible ─────────────────────────────
  // Four of the reel's bars at a time: what was sung (the faint line: the pitch as it moved, when
  // it came, in the singer's own key, drift and all, up the take's octaves so it lies over what
  // plays), the notes it became (boxes on the sixteenths, in the score's key) and how each plays
  // (the gold line: its bend, after straighten and nuance). Under it the whole take: its notes, the
  // drift of the key a bar (dashed) and the bars shown. The window follows the playhead while it
  // plays. The mapping's lines are knobs; a note clicked says what became of it; ▲ ▼ (or the arrow
  // keys, over the view) move it to the next note of the key (Shift: a semitone), and ◀ ▶ step from
  // note to note.
  const TSPEC = { octave: [-3, 3, 1, 'oct'], shift: [-16, 16, 1, '16th'], straighten: [0, 100, 1, '%'], nuance: [0, 200, 1, '%'], feel: [0, 100, 1, '%'] };
  const TIP = {
    octave: 'moves every note by octaves',
    shift: 'moves the whole take earlier (-) or later (+), in sixteenths',
    straighten: 'takes out that share of the slow wander inside each note; the scoop in, the fall off and the vibrato stay',
    nuance: 'plays that share of how each note\'s pitch moved as it was sung (0: every note straight)',
    feel: 'plays that share of how early or late each note came (0: every note on its sixteenth)' };
  const TBARS = 4, TGUT = 26;                                            // bars shown; the note names' gutter
  const tstate = {};                                                     // per take: { bar0, sel }, kept across redraws
  let takeView = null;
  const sgn = n => (n > 0 ? '+' : '') + n;
  const tcode = s => { const m = Math.floor(s / 60 + 1e-9), r = s - m * 60; return `${m}:${r < 10 ? '0' : ''}${r.toFixed(1)}`; };
  const noteName = m => RM.NAMES[((Math.round(m) % 12) + 12) % 12] + (Math.floor(Math.round(m) / 12) - 1);
  function takeEditor(part, d, v) {
    const tk = P.score.takes.find(x => x.name === v.take), acc = colourOf(part.name);
    const box = el('div', 'rk-take'); box.style.setProperty('--acc', acc);
    if (!tk) { box.appendChild(el('p', 'rk-note', `There is no TAKE ${v.take}.`)); return box; }
    const S = RM.takeSummary(tk, A.step, A.spb), R = RM.BEND_RATE, singer = v.track;
    const st = tstate[tk.name] = tstate[tk.name] || { bar0: Math.max(0, Math.floor(L.now() / A.bar)), sel: null };
    const evs = A.events.filter(e => e.take === tk.name).sort((a, b) => a.t - b.t);
    // the rows: every note it plays or could (a left-out one put back), and every pitch that was sung
    const played = tk.notes.flatMap(n => n.heard ? [n.midi, Math.round(n.sung)] : [n.midi]).map(m => m + 12 * tk.octave);
    const lo = Math.min(...played, 60) - 2, hi = Math.max(...played, 60) + 2;
    const lastBar = Math.max(0, A.bars - TBARS);
    st.bar0 = Math.max(0, Math.min(lastBar, st.bar0));
    const inKey = m => { const k = P.score.key, iv = k.mode === 'minor' ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11]; return iv.includes(((m - k.root) % 12 + 12) % 12); };

    // head: the take's name, what sings it, hear four bars of it
    const head = el('div', 'rk-thead');
    head.appendChild(el('b', '', 'take ' + tk.name));
    head.appendChild(el('span', 'rk-kind', `sung by ${singer} · ${S ? `${S.notes} notes, from ${S.sungNotes} sung` : 'no notes'}`));
    head.appendChild(el('span', 'rk-grow'));
    // the notes, to move, stretch, add and take out on the grid (scripts/reel-notes.js, N)
    if (window.REEL_NOTES) head.appendChild(btn('Edit notes', 'the notes as a piano roll, at these bars: drag, stretch, add, take out (N)', () => window.REEL_NOTES.show(true, st.bar0 * A.bar), 'sm'));
    head.appendChild(btn('▶ 4 bars', 'hear the four bars shown, on their own', () => {
      ensureAudio(); if (!player) return;
      const t0 = st.bar0 * A.bar, t1 = t0 + TBARS * A.bar;
      player.E.preview(evs.filter(e => e.t >= t0 && e.t < t1).map(e => Object.assign({}, e, { t: e.t - t0 })));
    }, 'sm'));
    box.appendChild(head);
    // the mapping: a knob a line of the TAKE
    const knobs = Object.keys(TSPEC).map(key => { const k = argKnob(key, TSPEC[key], tk[key], ['TAKE', tk.name, key, 0]); k.title = `${key}: ${TIP[key]}. Drag, wheel, or double-click to type`; return k; });
    const ks = el('div', 'rk-knobs'); ks.appendChild(group('mapping', ...knobs)); box.appendChild(ks);

    // the view, its legend, the whole take under it
    const cv = el('canvas', 'rk-tcv'); cv.tabIndex = 0;
    cv.setAttribute('aria-label', `take ${tk.name}: what was sung, the melody made from it and how it plays; click a note, arrow keys to move it`);
    const ov = el('canvas', 'rk-tov'); ov.setAttribute('aria-label', 'the whole take: click to show those bars');
    box.appendChild(cv);
    const legend = el('div', 'rk-tkey', '<span><i class="sung"></i>what was sung</span><span><i class="note"></i>the melody made from it</span><span><i class="play"></i>how it plays</span><span><i class="out"></i>sung, left out</span><span><i class="drift"></i>the key\'s drift (below)</span>');
    box.appendChild(legend);
    box.appendChild(ov);
    const nav = el('div', 'rk-row rk-tnav');
    const where = el('span', 'rk-grow');
    nav.appendChild(btn('‹', 'the four bars before', () => { st.bar0 = Math.max(0, st.bar0 - TBARS); draw(); }, 'sm'));
    nav.appendChild(btn('›', 'the four bars after', () => { st.bar0 = Math.min(lastBar, st.bar0 + TBARS); draw(); }, 'sm'));
    nav.appendChild(where);
    box.appendChild(nav);
    // the chosen note: what became of it
    const selRow = el('div', 'rk-tsel'), selText = el('span');
    selRow.appendChild(selText);
    const up = btn('▲', `up to the next note of ${P.score.key.name} (Shift: a semitone), its n line`, e => move(1, e.shiftKey), 'sm');
    const dn = btn('▼', `down to the next note of ${P.score.key.name} (Shift: a semitone), its n line`, e => move(-1, e.shiftKey), 'sm');
    const hear = btn('▶', 'hear this note', () => { const e = evs.find(x => x.nln === st.sel); ensureAudio(); if (e && player) player.E.preview([Object.assign({}, e, { t: 0 })]); }, 'sm');
    // leave the chosen note out of the melody (what was sung stays), or put a left-out one back
    const outB = btn('Leave out', 'leave this note out of the melody (what was sung stays drawn), or put a left-out note back', () => {
      const n = tk.notes.find(x => x.ln === st.sel);
      if (!n) { status('click a note first'); return; }
      st.refocus = document.activeElement === cv;
      try { change(RM.setTakeNote(src, tk.name, n.ln, { out: !n.out })); } catch (e) { status((e.errors || [e.message]).join(' · '), true); }
    }, 'sm');
    [hear, up, dn, outB].forEach(b => selRow.appendChild(b));
    box.appendChild(selRow);
    // the mapping in words
    const d0 = S && S.drift;
    box.appendChild(el('p', 'rk-tsum', !S ? 'This take has no notes.' : [
      `${S.notes} notes play (${tcode(S.t0)} to ${tcode(S.t1)}), made from the ${S.sungNotes} sung, ${S.sung[0]} to ${S.sung[1]}.`,
      `${S.kept} of them are sung notes, each set on its sixteenth and on a note of ${P.score.key.name}: ${S.retimed} moved more than 40 ms, ${S.movedSemis} to another note than the one sung.`
        + (S.added ? ` ${S.added} were added where the melody wanted a note that was not sung.` : '')
        + (S.left ? ` ${S.left} sung notes are left out (dotted): click one to put it back.` : ''),
      `The faint line is what was sung, where it was sung.` + (d0 ? ` The key drifted ${sgn(d0[0])} to ${sgn(d0[1])} cents as it went (the dashed line below), and that is taken out first.` : ''),
      `Octave ${sgn(tk.octave)} plays it from ${S.plays[0]} to ${S.plays[1]}${tk.shift ? `, ${Math.abs(tk.shift)} sixteenths ${tk.shift > 0 ? 'later' : 'earlier'}` : ''}.`,
      (tk.nuance ? `Straighten ${tk.straighten}% takes the slow wander out of each note, and nuance ${tk.nuance}% keeps that share of how the voice moved (the scoop in, the fall off)`
        : `Nuance 0%: every note plays straight, on its pitch (turn it up for the scoop in and the fall off as sung)`) + (tk.feel ? `; feel ${tk.feel}% plays back how early or late each came` : '') + '.',
      `It sings in the voice's own colour: the harmonics of ${singer}, under instruments.`].filter(Boolean).join(' ')));

    // to the next note of the key (chromatic: a semitone)
    function move(by, chromatic) {
      const n = tk.notes.find(x => x.ln === st.sel);
      if (!n) { status('click a note first'); return; }
      let m = n.midi + by;
      if (!chromatic) while (!inKey(m)) m += by;
      st.refocus = document.activeElement === cv;                       // the rack draws again: the keys stay with the view
      try { change(RM.setTakeNote(src, tk.name, n.ln, { midi: m })); } catch (e) { status((e.errors || [e.message]).join(' · '), true); }
    }
    // the window's time and pitch, as drawn
    const geo = () => {
      const w = cv.clientWidth || 480, h = cv.clientHeight || 176, top = 14, rh = (h - top - 3) / (hi - lo + 1);
      const t0 = st.bar0 * A.bar, t1 = t0 + TBARS * A.bar;
      return { w, h, top, rh, t0, t1, X: t => TGUT + (t - t0) / (t1 - t0) * (w - TGUT - 2), T: x => t0 + (x - TGUT) / (w - TGUT - 2) * (t1 - t0), Y: m => top + (hi - m) * rh };
    };
    function draw() {
      const dpr = window.devicePixelRatio || 1, G = geo(), { w, h, top, rh, t0, t1, X, Y } = G;
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
      const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
      g.font = '500 8.5px "JetBrains Mono", monospace'; g.textBaseline = 'middle';
      // rows: the key's notes lighter; each C, and the lowest and highest, named
      for (let m = lo; m <= hi; m++) {
        g.fillStyle = inKey(m) ? 'rgba(77,201,246,0.07)' : 'rgba(0,0,0,0.16)';
        g.fillRect(TGUT, Y(m), w - TGUT, rh - 0.6);
        // each C named, and the top and bottom rows where no C is near them
        const named = m % 12 === 0 || ((m === lo + 1 || m === hi - 1) && [-2, -1, 1, 2].every(k => (m + k) % 12 !== 0));
        if (named) { g.fillStyle = 'rgba(149,174,187,0.9)'; g.fillText(noteName(m), 2, Y(m) + rh / 2); }
      }
      // bars and beats, each bar's chord over it
      for (let b = st.bar0; b <= st.bar0 + TBARS; b++) {
        for (let k = 0; k < (b < st.bar0 + TBARS ? A.spb / 4 : 1); k++) {
          const x = X(b * A.bar + k * A.beat);
          g.fillStyle = k ? 'rgba(77,201,246,0.12)' : 'rgba(77,201,246,0.4)'; g.fillRect(Math.round(x), top - (k ? 0 : 3), 1, h - top + (k ? 0 : 3));
        }
        const hm = A.harmony[b];
        if (hm && b < st.bar0 + TBARS) { g.fillStyle = 'rgba(149,174,187,0.95)'; g.fillText(`${b + 1} ${hm.chord.name}`, X(b * A.bar) + 4, 6); }
      }
      g.save(); g.beginPath(); g.rect(TGUT, 0, w - TGUT, h); g.clip();
      // what was sung: each note's pitch as it moved, in the singer's key, from when it came
      g.lineWidth = 1.2; g.lineJoin = 'round';
      for (const n of tk.notes) {
        if (!n.heard) continue;                                          // added: nothing was sung there
        const ts = (n.step + tk.shift) * A.step + n.early / 1000, c = n.curve.length ? n.curve : [0, 0], dur = n.curve.length ? (c.length - 1) / R : n.len * A.step;
        if (ts > t1 || ts + dur < t0) continue;
        g.strokeStyle = n.ln === st.sel ? '#eaf5fa' : n.out ? 'rgba(178,232,250,0.32)' : 'rgba(178,232,250,0.5)';
        g.setLineDash(n.out ? [2, 2] : []);
        g.beginPath();
        c.forEach((x, i) => { const px = X(ts + (n.curve.length ? i / R : i * dur)), py = Y(n.sung + 12 * tk.octave + x / 100) + rh / 2; i ? g.lineTo(px, py) : g.moveTo(px, py); });
        g.stroke();
      }
      g.setLineDash([]);
      // the notes it became, and how each plays
      for (const e of evs) {
        if (e.t > t1 || e.t + e.dur < t0) continue;
        const x0 = X(e.t), x1 = X(e.t + e.dur), y = Y(e.midi);
        g.globalAlpha = 0.3 + 0.5 * Math.min(1, e.vel); g.fillStyle = acc; g.fillRect(x0, y + 1, Math.max(2, x1 - x0 - 1), rh - 2); g.globalAlpha = 1;
        if (e.nln === st.sel) { g.strokeStyle = '#eaf5fa'; g.lineWidth = 1.5; g.strokeRect(x0 - 1, y, Math.max(3, x1 - x0 + 1), rh); }
        if (e.bend) {
          g.strokeStyle = '#d4af37'; g.lineWidth = 1.4; g.beginPath();
          let first = true;
          for (let i = 0; i < e.bend.length && i / R <= e.dur + 1e-6; i++) { const px = X(e.t + i / R), py = y + rh / 2 - e.bend[i] / 100 * rh; if (first) { g.moveTo(px, py); first = false; } else g.lineTo(px, py); }
          g.stroke();
        }
      }
      g.restore();
      // the playhead
      const ph = L.now();
      if (ph >= t0 && ph <= t1) { g.fillStyle = '#d4af37'; g.fillRect(Math.round(X(ph)), 0, 1.5, h); }
      st.drawnAt = ph;
      Object.assign(cv.dataset, { lo, hi, bar0: st.bar0, gut: TGUT, top });   // the rows and bars as drawn (for a test's click)
      where.textContent = `bars ${st.bar0 + 1} to ${Math.min(A.bars, st.bar0 + TBARS)} of ${A.bars}`;
      drawOv(); info();
    }
    // the whole take: its notes at their pitches, the key's drift a bar, the window
    function drawOv() {
      const dpr = window.devicePixelRatio || 1, w = ov.clientWidth || 480, h = ov.clientHeight || 30, D = A.duration;
      if (ov.width !== Math.round(w * dpr) || ov.height !== Math.round(h * dpr)) { ov.width = Math.round(w * dpr); ov.height = Math.round(h * dpr); }
      const g = ov.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
      const X = t => t / D * w;
      g.fillStyle = 'rgba(77,201,246,0.05)'; g.fillRect(0, 0, w, h);
      g.fillStyle = acc; g.globalAlpha = 0.75;
      for (const e of evs) g.fillRect(X(e.t), 2 + (hi - e.midi) / (hi - lo) * (h - 6), Math.max(1, X(e.t + e.dur) - X(e.t) - 0.5), 2);
      g.globalAlpha = 1;
      if (tk.drift.length) {
        g.strokeStyle = 'rgba(212,175,55,0.6)'; g.setLineDash([3, 2]); g.lineWidth = 1; g.beginPath();
        tk.drift.forEach((c, b) => { const x = X((b + 0.5) * A.bar), y = h / 2 - Math.max(-150, Math.min(150, c)) / 150 * (h / 2 - 2); b ? g.lineTo(x, y) : g.moveTo(x, y); });
        g.stroke(); g.setLineDash([]);
        g.fillStyle = 'rgba(212,175,55,0.25)'; g.fillRect(0, h / 2, w, 0.6);
      }
      g.strokeStyle = '#eaf5fa'; g.lineWidth = 1; g.strokeRect(X(st.bar0 * A.bar) + 0.5, 0.5, X(TBARS * A.bar) - 1, h - 1);
      const ph = L.now(); g.fillStyle = '#d4af37'; g.fillRect(X(ph), 0, 1, h);
    }
    // what became of the chosen note
    function info() {
      const n = tk.notes.find(x => x.ln === st.sel), e = n && evs.find(x => x.nln === n.ln);
      [up, dn, hear].forEach(b => { b.disabled = !n || n.out; });
      outB.disabled = !n; outB.textContent = n && n.out ? 'Put back' : 'Leave out';
      if (!n) { selText.textContent = 'Click a note to see where it came from.'; return; }
      const oct = tk.octave ? `, then ${Math.abs(tk.octave)} octave${Math.abs(tk.octave) > 1 ? 's' : ''} ${tk.octave > 0 ? 'up' : 'down'}` : '';
      const drift = RM.driftAt(tk, n.step, A.spb), moved = Math.round((n.midi - n.sung) * 100 + drift), where = RM.posText(n.step + tk.shift, A.spb);
      const sungAt = RM.posText(Math.max(0, Math.round(n.step + tk.shift + n.early / 1000 / A.step)), A.spb);
      if (n.out) {
        selText.innerHTML = `<b>Left out.</b> Sung ${RM.sungText(n.sung)} at ${sungAt}${drift ? ` (the key ${Math.abs(drift)} cents ${drift > 0 ? 'sharp' : 'flat'} there)` : ''}, level ${n.vel}. Put back, it plays <b>${noteName(n.midi + 12 * tk.octave)}</b> at ${where}.`;
        return;
      }
      if (!n.heard) {
        selText.innerHTML = `<b>${where}</b> plays <b>${noteName(n.midi + 12 * tk.octave)}</b>. Added: nothing was sung here; the melody wanted a note${n.curve.length ? ', and it moves the way one sung elsewhere did' : ''}. Level ${n.vel}.`;
        return;
      }
      const ms = Math.round(n.early), raw = n.curve.length ? Math.max(...n.curve.map(Math.abs)) : 0, plays = e && e.bend ? Math.max(...e.bend.map(Math.abs)) : 0;
      selText.innerHTML = `<b>${where}</b> plays <b>${noteName(n.midi + 12 * tk.octave)}</b>. Sung ${RM.sungText(n.sung)}`
        + (Math.abs(ms) > 40 ? ` at ${sungAt}, ${Math.abs(ms)} ms ${ms > 0 ? 'later' : 'earlier'}: moved onto the beat` : `, ${Math.abs(ms)} ms ${ms > 0 ? 'late' : 'early'}${tk.feel && ms ? ` (${Math.round(Math.abs(ms) * tk.feel / 100)} ms of it plays)` : ''}`)
        + (drift ? `; the key ${Math.abs(drift)} cents ${drift > 0 ? 'sharp' : 'flat'} there` : '')
        + (Math.abs(moved) > 100 ? `. Set to ${noteName(n.midi)}, ${Math.abs(Math.round(moved / 100))} semitone${Math.abs(Math.round(moved / 100)) > 1 ? 's' : ''} ${moved > 0 ? 'above' : 'below'} what was sung${oct}.` : `. Tuned ${sgn(moved)} cents to ${noteName(n.midi)}${oct}.`)
        + ` Level ${n.vel}, tone ${sgn(n.tone)} dB. Its pitch moved ±${raw} cents as sung; it plays ±${plays}.`;
    }
    // a click: the note under it (or the nearest within 6 px); the arrow keys move and step
    cv.addEventListener('pointerdown', ev => {
      const r = cv.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top, G = geo();
      let best = null, bd = 7;
      for (const e of evs) {
        const x0 = G.X(e.t), x1 = G.X(e.t + e.dur), y0 = G.Y(e.midi), dx = x < x0 ? x0 - x : x > x1 ? x - x1 : 0, dy = y < y0 ? y0 - y : y > y0 + G.rh ? y - y0 - G.rh : 0, dd = Math.hypot(dx, dy);
        if (dd < bd) { bd = dd; best = e; }
      }
      if (!best) {
        // no note box near: a left-out note's line of what was sung, within 7 px
        let bo = null, bod = 7;
        for (const n of tk.notes) {
          if (!n.out || !n.heard) continue;
          const ts = (n.step + tk.shift) * A.step + n.early / 1000, c = n.curve.length ? n.curve : [0, 0], dur = n.curve.length ? (c.length - 1) / R : n.len * A.step;
          c.forEach((v, i) => { const px = G.X(ts + (n.curve.length ? i / R : i * dur)), py = G.Y(n.sung + 12 * tk.octave + v / 100) + G.rh / 2, dd = Math.hypot(px - x, py - y); if (dd < bod) { bod = dd; bo = n; } });
        }
        st.sel = bo ? bo.ln : null; cv.focus(); draw(); return;
      }
      st.sel = best.nln; cv.focus(); draw();
    });
    cv.addEventListener('keydown', ev => {
      if (ev.key === 'ArrowUp' || ev.key === 'ArrowDown') { ev.preventDefault(); ev.stopPropagation(); move(ev.key === 'ArrowUp' ? 1 : -1, ev.shiftKey); return; }
      if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') {
        ev.preventDefault(); ev.stopPropagation();
        const i = evs.findIndex(e => e.nln === st.sel), j = i < 0 ? (ev.key === 'ArrowRight' ? 0 : evs.length - 1) : Math.max(0, Math.min(evs.length - 1, i + (ev.key === 'ArrowRight' ? 1 : -1)));
        const e = evs[j]; if (!e) return;
        st.sel = e.nln;
        if (e.t < st.bar0 * A.bar || e.t >= (st.bar0 + TBARS) * A.bar) st.bar0 = Math.max(0, Math.min(lastBar, Math.floor(e.t / A.bar)));
        draw();
      }
    });
    ov.addEventListener('pointerdown', ev => { const r = ov.getBoundingClientRect(); st.bar0 = Math.max(0, Math.min(lastBar, Math.floor((ev.clientX - r.left) / r.width * A.duration / A.bar) - 1)); draw(); });
    takeView = { draw, st, follow: t => { if (t < st.bar0 * A.bar || t >= (st.bar0 + TBARS) * A.bar) { st.bar0 = Math.max(0, Math.min(lastBar, Math.floor(t / A.bar))); return true; } return false; } };
    if (st.refocus) { st.refocus = false; cv.focus({ preventScroll: true }); requestAnimationFrame(() => { if (cv.isConnected) cv.focus({ preventScroll: true }); }); }
    requestAnimationFrame(() => { if (takeView && takeView.draw === draw) draw(); });
    return box;
  }
  // a sound's harmonics, as bars: each harmonic's level in dB against the first (0 at the top, -60
  // at the foot). Drag one up or down: heard at once, saved when you let go. The first is the
  // measure of the rest, so it stays at 0.
  function harmonicsRow(t, kind) {
    const wrap = el('div', 'rk-line rk-harm'); wrap.appendChild(el('label', '', 'harmonics'));
    const NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg'), n = t.harmonics.length, BW = 14, H = 46, FLOOR = -60;
    svg.setAttribute('width', n * BW + 2); svg.setAttribute('height', H + 11); svg.setAttribute('class', 'rk-shape');
    svg.setAttribute('aria-label', `${t.name}'s harmonics, dB against the first: ${t.harmonics.join(' ')}`);
    const yOf = db => 2 + Math.min(1, Math.max(0, db / FLOOR)) * (H - 4);
    let hs = t.harmonics.slice();
    const draw = () => {
      svg.innerHTML = hs.map((db, k) => `<rect x="${1 + k * BW + 1.5}" y="${yOf(db).toFixed(1)}" width="${BW - 3}" height="${Math.max(1, H - yOf(db)).toFixed(1)}" rx="1.5" fill="var(--acc)" fill-opacity="${k ? 0.72 : 1}"><title>harmonic ${k + 1}: ${db} dB</title></rect>`
        + `<text x="${(1 + k * BW + BW / 2).toFixed(1)}" y="${H + 9}">${k + 1}</text>`).join('');
    };
    draw();
    svg.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      const r = svg.getBoundingClientRect(), k = Math.floor((e.clientX - r.left - 1) / BW);
      if (k < 1 || k >= n) return;
      e.preventDefault(); svg.setPointerCapture(e.pointerId); gestureStart();
      const set = ev => {
        const db = Math.round(Math.max(FLOOR, Math.min(0, (ev.clientY - r.top - 2) / (H - 4) * FLOOR)));
        if (db === hs[k]) return;
        hs[k] = db; draw();
        try { change(RM.setArg(src, kind, t.name, 'harmonics', k, db), { save: false, record: false, rerender: false }); } catch (er) { status((er.errors || [er.message]).join(' · '), true); }
      };
      set(e);
      const mv = ev => set(ev);
      const upf = () => { svg.removeEventListener('pointermove', mv); svg.removeEventListener('pointerup', upf); svg.removeEventListener('pointercancel', upf); undoFix(); queueSave(); render(); };
      svg.addEventListener('pointermove', mv); svg.addEventListener('pointerup', upf); svg.addEventListener('pointercancel', upf);
    });
    wrap.appendChild(svg);
    wrap.appendChild(el('span', 'rk-hnote', 'each harmonic against the first, in dB: drag a bar'));
    return wrap;
  }
  function padSet(part, pad, track, pattern) {
    try { change(RM.setPad(src, part, pad, track, pattern)); } catch (e) { status((e.errors || [e.message]).join(' · '), true); }
  }

  function module(t, acc) {
    const E = player && player.E;
    const m = el('div', 'rk-mod'); m.style.setProperty('--acc', acc);
    if (E && (E.mutes.has(t.name) || (E.solos.size && !E.solos.has(t.name)))) m.classList.add('muted');
    const kind = t.type === 'drum' ? 'DRUM' : 'SYNTH';
    // head: name, what it plays, listen, mute, solo, meter
    const h = el('div', 'rk-head');
    h.appendChild(el('b', '', t.name));
    h.appendChild(el('span', 'rk-kind', t.type === 'drum' ? t.kind : t.play ? t.play.mode : ''));
    if (t.on) h.appendChild(el('span', 'rk-kind', '· on'));
    h.appendChild(el('span', 'rk-grow'));
    const mt = el('div', 'rk-meter', '<i></i>'); meters.push([t.name, mt.firstChild]); h.appendChild(mt);
    h.appendChild(btn('▶', 'hear it now', () => { ensureAudio(); if (E) E.audition(t.name, A); }, 'sm'));
    h.appendChild(btn('M', 'mute (not saved)', () => mute(t.name), 'sm' + (E && E.mutes.has(t.name) ? ' on' : '')));
    h.appendChild(btn('S', 'solo (not saved)', () => solo(t.name), 'sm' + (E && E.solos.has(t.name) ? ' on' : '')));
    m.appendChild(h);

    const K = (label, spec, value, key, arg, index) => argKnob(label, spec, value, [kind, t.name, key, arg, index]);
    if (t.type === 'synth') {
      // voices: wave, pitch, level; add and remove
      t.voices.forEach((v, i) => {
        const row = el('div', 'rk-voice');
        row.appendChild(sel(['sine', 'triangle', 'square', 'saw', 'noise'].concat(t.harmonics ? ['harmonics'] : []), v.wave === 'sawtooth' ? 'saw' : v.wave, w => { try { change(RM.setArg(src, kind, t.name, 'voice', 0, w, i)); } catch (e) { status((e.errors || [e.message]).join(' · '), true); } }, 'wave'));
        row.appendChild(K('pitch', SPEC.cents, v.cents, 'voice', 1, i));
        row.appendChild(K('level', SPEC.vlevel, v.level, 'voice', 2, i));
        row.appendChild(shape(v.wave, t));
        if (t.voices.length > 1) row.appendChild(btn('−', 'remove this voice', () => lineSet(kind, t.name, 'voice', null, i), 'sm'));
        if (i === t.voices.length - 1) row.appendChild(btn('+ voice', 'add a voice', () => lineSet(kind, t.name, 'voice', 'sine 1200 0.2', t.voices.length), 'sm'));
        m.appendChild(row);
      });
      if (t.harmonics) m.appendChild(harmonicsRow(t, kind));
      // what it plays
      const pl = el('div', 'rk-line'); pl.appendChild(el('label', '', 'play'));
      // what it plays (its pads must suit it: steps for chord, root and arp, a tune for notes)
      const DEF = t.on ? { chime: 'chime 5', note: 'note E6' } : { chord: 'chord 3', root: 'root 2', arp: 'arp 4 up', notes: 'notes', rise: 'rise' };
      pl.appendChild(sel(Object.keys(DEF), t.play.mode, mode => {
        try { change(RM.setLine(src, kind, t.name, 'play', DEF[mode])); } catch (e) { status((e.errors || [e.message]).join(' · '), true); }
      }, 'what it plays'));
      if (t.play.oct != null) pl.appendChild(K('octave', SPEC.oct, t.play.oct, 'play', 1));
      if (t.play.dir) pl.appendChild(sel(['up', 'down', 'updown'], t.play.dir, d => { try { change(RM.setArg(src, kind, t.name, 'play', 2, d)); } catch (e) { status(e.message, true); } }, 'direction'));
      if (t.play.mode === 'note') { const inp = el('input'); inp.type = 'text'; inp.value = t.play.name; inp.style.width = '60px'; inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') inp.blur(); }); inp.addEventListener('change', () => { try { change(RM.setArg(src, kind, t.name, 'play', 1, inp.value.trim())); } catch (e) { status((e.errors || [e.message]).join(' · '), true); } }); pl.appendChild(inp); }
      // a sound that sings a take plays each note as long as it was sung: no length of its own
      const takes = P.score.parts.flatMap(p => p.pads).flatMap(p => p.voices).filter(v => v.track === t.name && v.take).map(v => v.take);
      if (takes.length) pl.appendChild(el('span', 'rk-kind', 'sings take ' + [...new Set(takes)].join(', ')));
      else if (['root', 'arp', 'notes', 'chord'].includes(t.play.mode)) pl.appendChild(K('length', SPEC.len, t.len, 'len', 0));
      if (t.on) pl.appendChild(onSel(t, kind));
      m.appendChild(pl);
      // filter, envelope, lfo, mix
      const ks = el('div', 'rk-knobs');
      const fsel = sel(['off'].concat(RM.FILTERS), t.filter ? t.filter.type : 'off', v => lineSet(kind, t.name, 'filter', v === 'off' ? null : `${v} ${t.filter ? t.filter.freq : 2000} ${t.filter ? t.filter.q : 1}`), 'filter');
      ks.appendChild(t.filter ? group('filter', fsel, K('freq', SPEC.ffreq, t.filter.freq, 'filter', 1), K('Q', SPEC.q, t.filter.q, 'filter', 2)) : group('filter', fsel));
      ks.appendChild(group('env', K('A', SPEC.attack, t.env.attack, 'env', 0), K('D', SPEC.decay, t.env.decay, 'env', 1), K('S', SPEC.sustain, t.env.sustain, 'env', 2), K('R', SPEC.release, t.env.release, 'env', 3), envShape(t.env)));
      const lsel = sel(['off', 'gain', 'filter', 'pitch'], t.lfo ? t.lfo.target : 'off', v => lineSet(kind, t.name, 'lfo', v === 'off' ? null : `${v} ${t.lfo ? t.lfo.rate : 0.5} ${v === 'filter' ? 300 : v === 'pitch' ? 12 : 0.3}`), 'lfo');
      ks.appendChild(t.lfo ? group('lfo', lsel, K('rate', SPEC.lrate, t.lfo.rate, 'lfo', 1), K('depth', SPEC['ldepth-' + t.lfo.target], t.lfo.depth, 'lfo', 2)) : group('lfo', lsel));
      ks.appendChild(mix(t, K));
      m.appendChild(ks);
    } else {
      const ks = el('div', 'rk-knobs');
      ks.appendChild(group('drum', sel(RM.DRUMS, t.kind, v => { try { change(RM.setArg(src, kind, t.name, 'kind', 0, v)); } catch (e) { status(e.message, true); } }, 'kind'),
        K('tune', SPEC.tune, t.tune || RM.DRUM_DEF[t.kind].tune || 100, 'tune', 0), K('decay', SPEC.ddecay, t.decay, 'decay', 0), K('tone', SPEC.tone, t.tone || RM.DRUM_DEF[t.kind].tone || 1000, 'tone', 0)));
      if (t.on) ks.appendChild(group('on', onSel(t, kind)));
      ks.appendChild(mix(t, K));
      m.appendChild(ks);
    }
    return m;
  }
  function onSel(t, kind) { return sel(RM.MOMENTS, t.on, v => { try { change(RM.setArg(src, kind, t.name, 'on', 0, v)); } catch (e) { status(e.message, true); } }, 'plays at every moment of this kind'); }
  function mix(t, K) { return group('mix', K('level', SPEC.level, t.level, 'level', 0), K('pan', SPEC.pan, t.pan, 'pan', 0), K('reverb', SPEC.send, t.send[0], 'send', 0), K('delay', SPEC.send, t.send[1], 'send', 1)); }
  // little pictures of a wave and an envelope, redrawn only when the rack is drawn
  function shape(w, t) {
    const n = 40, pts = [];
    // a harmonics wave: its harmonics summed (sine phase), scaled to its peak
    const amps = w === 'harmonics' && t && t.harmonics ? t.harmonics.map(db => Math.pow(10, db / 20)) : null;
    const hw = x => amps.reduce((a, v, k) => a + v * Math.sin((k + 1) * x * 4 * Math.PI), 0);
    let peak = 1;
    if (amps) { peak = 1e-6; for (let i = 0; i <= 200; i++) peak = Math.max(peak, Math.abs(hw(i / 200))); }
    for (let i = 0; i <= n; i++) {
      const x = i / n, p = x * 2 % 1;
      const y = amps ? hw(x) / peak : w === 'sine' ? Math.sin(x * 4 * Math.PI) : w === 'triangle' ? 1 - 4 * Math.abs(p - 0.5) : w === 'square' ? (p < 0.5 ? 1 : -1) : w === 'sawtooth' ? 2 * p - 1 : Math.sin(i * 12.9898) * 43758.5453 % 1;
      pts.push(`${(2 + x * 44).toFixed(1)},${(11 - y * 8).toFixed(1)}`);
    }
    return el('span', '', `<svg class="rk-shape" width="48" height="22"><polyline points="${pts.join(' ')}" fill="none" stroke="var(--acc)" stroke-width="1.2"/></svg>`).firstChild;
  }
  function envShape(e) {
    const tot = e.attack + e.decay + 0.4 + e.release, X = s => 3 + s / tot * 58;
    const pts = [[0, 0], [e.attack, 1], [e.attack + e.decay, e.sustain], [e.attack + e.decay + 0.4, e.sustain], [tot, 0]].map(([s, v]) => `${X(s).toFixed(1)},${(33 - v * 28).toFixed(1)}`);
    return el('span', '', `<svg class="rk-shape" width="64" height="36"><polyline points="${pts.join(' ')}" fill="none" stroke="var(--acc)" stroke-width="1.3"/></svg>`).firstChild;
  }
  function fxModules() {
    const wrap = el('div');
    const LABEL = { reverb: 'reverb', delay: 'delay', tape: 'tape', drive: 'drive', comp: 'compressor', master: 'master' };
    Object.keys(RM.FX).forEach((name, i) => {
      const m = el('div', 'rk-mod'); m.style.setProperty('--acc', PALETTE[(i + 3) % PALETTE.length]);
      const h = el('div', 'rk-head'); h.appendChild(el('b', '', LABEL[name]));
      if (name === 'master') { h.appendChild(el('span', 'rk-grow')); const mt = el('div', 'rk-meter', '<i></i>'); meters.push(['*master', mt.firstChild]); h.appendChild(mt); }
      m.appendChild(h);
      const ks = el('div', 'rk-knobs');
      for (const [key, d] of Object.entries(RM.FX[name])) {
        const val = P.score.fx[name][key];
        if (Array.isArray(val)) val.forEach((v, j) => ks.appendChild(argKnob(`${key} ${j ? 'out' : 'in'}`, [0, 10, 0.1, 's'], v, ['FX', name, key, j])));
        else ks.appendChild(argKnob(key, fxSpec(d), val, ['FX', name, key, 0]));
      }
      m.appendChild(ks);
      wrap.appendChild(m);
    });
    return wrap;
  }

  // ── every frame, while open: the playhead, the steps, the meters ──────
  const buf = new Float32Array(512);
  let lastMeter = 0;
  let lastTake = 0;
  function frame(t) {
    if (!P || !A) return;
    const k = L.isPlaying() ? Math.floor(t / A.step + 1e-6) % 16 : -1;   // the steps go round on the reel's own clock
    for (const cells of Object.values(stepEls)) cells.forEach((c, i) => c.classList.toggle('now', i === k));
    // a take's view: its playhead, at 30 fps; playing, the four bars follow it
    if (takeView && (Math.abs(t - takeView.st.drawnAt) > 1e-3) && performance.now() - lastTake > 33) {
      lastTake = performance.now();
      if (L.isPlaying()) takeView.follow(t);
      takeView.draw();
    }
    const now = performance.now();
    if (!player || now - lastMeter < 50) return;                        // meters at 20 fps, dim
    lastMeter = now;
    for (const [name, bar] of meters) {
      const an = name === '*master' ? player.E.meter : player.E.tracks[name] && player.E.tracks[name].meter;
      if (!an) continue;
      an.getFloatTimeDomainData(buf);
      let pk = 0; for (let i = 0; i < buf.length; i++) { const a = Math.abs(buf[i]); if (a > pk) pk = a; }
      const db = 20 * Math.log10(pk || 1e-6);
      bar.style.width = Math.max(0, Math.min(100, (db + 48) / 48 * 100)).toFixed(0) + '%';
    }
  }

  // ── open, shut, keys ──────────────────────────────────────────────────
  // Beside: the preview, the HUD and the timeline make room on the right. Over (a window under
  // BESIDE px): the rack lies over the preview, as wide as the window allows, and stops at the
  // HUD, so the transport and the tools stay in reach.
  let placing = false;
  function place(openNow) {
    if (placing) return;                                                  // the resize below comes back here
    placing = true;
    const over = openNow && innerWidth < BESIDE, px = openNow && !over ? W : 0;
    root.classList.toggle('rk-over', over);
    L.reserveRight(px);
    if (hud) hud.style.right = px + 'px';
    const tl = document.getElementById('reel-tl'); if (tl) tl.style.right = px + 'px';
    root.style.bottom = over && hud && !hud.hidden ? Math.round(hud.getBoundingClientRect().height) + 'px' : '0';
    dispatchEvent(new Event('resize'));                                   // the timeline lays itself out again
    placing = false;
  }
  addEventListener('resize', () => { if (!root.hidden) place(true); });
  function open(on) {
    root.hidden = !on; put(K_OPEN, on);
    if (rackBtn) rackBtn.setAttribute('aria-pressed', String(!!on));
    if (on) { ensureAudio(); render(); }
    place(on);
  }
  addEventListener('keydown', e => {
    if (e.target.closest && e.target.closest('input, textarea, select, [contenteditable]')) return;
    if ((e.key === 'm' || e.key === 'M') && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); open(root.hidden); }
    else if ((e.key === 'z' || e.key === 'Z') && (e.metaKey || e.ctrlKey) && !root.hidden && hovering) { e.preventDefault(); e.stopImmediatePropagation(); undo(!e.shiftKey); }
  }, true);

  // ── load: the draft, else the file; follow the file when it changes ───
  (async () => {
    let text = null;
    fileText = await fetch('./' + NAME, { cache: 'no-store' }).then(r => r.ok ? r.text() : null, () => null);
    try { const d = sessionStorage.getItem(DRAFT_KEY); if (d != null) { text = d; draft = true; } } catch (e) { /* no drafts */ }
    if (text == null && HOST) { const h = await Promise.resolve(HOST.load(FILE)).catch(() => null); if (h != null) { text = h; hosted = true; } }
    if (text == null) text = fileText;
    let older = false;
    if (text != null) {
      try { read(text); } catch (e) {
        // a saved draft or version that no longer reads (one written before the music had parts and
        // clips, 2026-10-02): the file plays, and the save stays where it was
        if ((draft || hosted) && fileText != null && text !== fileText) { try { read(fileText); older = true; draft = false; hosted = false; } catch (e2) { /* both fail: say the first */ } }
        if (!older) { err = `${NAME} has mistakes:\n` + (e.errors || [e.message]).join('\n'); P = null; }
      }
    }
    if (older) status('your saved score was written for the older music, so the file plays (parts, pads and clips); your save is untouched');
    else if (draft) status('playing an unsaved draft of the score');
    else if (hosted) status(`playing your version of the score saved on ${HOST.name}`);
    ensureAudio();                                   // made now; it starts at the first click or key
    chip();
    if (L.dev && fileText != null) {
      new EventSource('/__reel/events?file=' + encodeURIComponent(FILE)).addEventListener('change', async () => {
        const t2 = await fetch('./' + NAME, { cache: 'no-store' }).then(r => r.ok ? r.text() : null, () => null);
        if (t2 == null || t2 === src) { fileText = t2 == null ? fileText : t2; return; }
        fileText = t2;
        if (!draft && dirtyText == null) { try { read(t2); status(`${NAME} changed on disk: playing it`); } catch (e) { status(`${NAME} changed on disk, with mistakes: ` + (e.errors || [e.message]).join(' · '), true); } if (!root.hidden) render(); }
      });
    }
    if (get(K_OPEN, false)) open(true);
    // the script changed in place (a scene's length, a query's words): each section starts on its
    // scene's new cut and the sound effects fall on the edit's new moments, heard at once
    if (L.onChange) L.onChange(() => {
      timing();
      if (src == null) return;
      try { read(src); } catch (e) { status((e.errors || [e.message]).join(' · '), true); return; }
      if (!root.hidden) render();
    });
    window.REEL_RACK = { open, get src() { return src; }, get parsed() { return P; }, get arrangement() { return A; }, get engine() { return player && player.E; }, get ctx() { return ctx; }, change, undo: () => undo(true), redo: () => undo(false), setSound,
      // for the timeline's music lanes (scripts/reel-timeline.js)
      mute, solo, mix: mixOf, focus, get name() { return NAME; }, get error() { return err; },
      get canUndo() { return undoS.length > 0; }, get canRedo() { return redoS.length > 0; },
      get sounding() { return !!(ctx && ctx.state === 'running' && soundOn); },
      colour: name => colourOf(name) };
    tell('ready');
  })();
})();
