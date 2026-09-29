// The reel's timeline: edit a sizzle reel script by dragging its times, in the preview itself.
//
// The script (Assets/sizzle-reel-2.script.txt) stays the one source of truth. This panel only
// reads it (REEL_LIVE.parsed) and changes it the way a person would, one line at a time, through
// ReelScript's setDur / setAt / setField / setCue, then hands the new text to REEL_LIVE.save,
// which writes the file through the dev server (node scripts/reel-dev.mjs), or keeps it with the
// page's host (the editor published on claude.ai), or keeps a draft in this tab, and reloads the
// preview at the same moment. So the panel keeps no state of its own
// beyond what must survive that reload: open or shut, the scene in the inspector, the zoom, and
// the undo and redo stacks (whole script texts, in sessionStorage).
//
// Every scene is a card, and what belongs to a scene sits inside its card:
//   items      a results scene's items, each work it shows in turn (only results scenes have them)
//   moments    when something happens inside the scene: a picture, a clip, a quote, a stat, an
//              award, a fish line (the script's @ times; fish lines are gold triangles). Drag one
//              to retime it; click it to open it
//   out        the hatched end of each card: where the scene's content starts to leave (its
//              `cue out`). Drag the hatch's edge
// Every action is a button, and its key an accelerator (named in the button's tooltip):
//   Timeline (E)          open / shut; the preview shrinks to fit above it (its button is in the HUD)
//   Undo / Redo (⌘Z, ⇧⌘Z) each is a save, so each reloads
//   − fit + (- 0 =)       zoom; also Ctrl/⌘ + wheel or a pinch. The wheel scrolls a zoomed timeline
//   Export video (X)      how the script becomes a film (scripts/reel-export.js)
//   drag a card's right edge    its length; everything after it ripples
//   drag an item's right edge   its length, and its results scene grows with it, so the items
//                               before it stay put (items are hung from the scene's end)
//   snap             0.25 s;  Shift: 0.5 s (a beat at 120 BPM);  Alt/Option: 0.05 s
//   click a card     seek to it and open the inspector: every line of the scene as an input
//
// A classic script the rig injects in live mode only, after defining window.REEL_LIVE; without
// it this does nothing. Its DOM and its <style> are its own, all under #reel-tl. About a hundred
// absolutely placed elements are laid out on open, on resize and on zoom; a frame moves only the
// playhead.
(function () {
  'use strict';
  const L = window.REEL_LIVE, RS = window.ReelScript;
  if (!L || !RS || document.getElementById('reel-tl')) return;

  // ── storage that survives the reload every save causes ────────────────
  const get = (k, d) => { try { const v = sessionStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
  const put = (k, v) => { try { sessionStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
  const K_OPEN = 'reel-tl-open', K_SEL = 'reel-tl-sel:' + L.file, K_UNDO = 'reel-undo:' + L.file, K_REDO = 'reel-redo:' + L.file, K_VIEW = 'reel-tl-view:' + L.file;
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
  const words = (s, n) => String(s || '').replace(/<[^>]+>/g, '').split(/\s+/).filter(Boolean).slice(0, n).join(' ');
  // Moments: every @ time. A beat has its own @ line; a stat or an award leads its words with one.
  const MOMENTS = [];
  P.marks.filter(m => m.kind === 'beat').forEach(m => {
    const own = m.owner === m.scene ? sceneOf.get(m.scene) : itemAt.get(m.owner);
    const b = m.obj, file = (b.video || b.img || '').replace(/^\.\//, '');
    const said = b.caption || b.lead || (b.line || b.lines || b.quote || [])[0] || '';
    MOMENTS.push({ ln: m.ln, own, S: own.S || own, at: b.at, len: own.end - own.start, kind: b.video ? 'clip' : b.img ? 'picture' : 'quote',
      gist: file || said, label: file ? file.replace(/\.[a-z0-9]+$/i, '') : words(said, 4) });
  });
  P.fields.forEach(f => {
    if (f.key === 'fish') {                           // a fish line: when the fish do something (scripts/reel-fish.js)
      const S = sceneOf.get(f.owner), v = f.owner.fish[f.index];
      if (!S) return;
      const what = RS.writeFish(v).replace(/^@\S+\s+/, '');
      MOMENTS.push({ ln: f.ln, own: S, S, at: v.at, len: S.end - S.start, kind: 'fish', field: true, fish: true,
        gist: 'fish ' + what, label: what.replace(/\s+[\d.]+\s+[\d.]+$/, '') });
      return;
    }
    if (f.key !== 'stat' && f.key !== 'award') return;
    const S = sceneOf.get(f.owner), v = S && f.owner[f.jsonKey][f.index];
    if (!v || v.at == null) return;
    const stat = f.key === 'stat';
    MOMENTS.push({ ln: f.ln, own: S, S, at: v.at, len: S.end - S.start, kind: f.key, field: true,
      gist: stat ? `stat ${v.n} ${v.label}` : `award ${v.yr} ${v.text}`, label: stat ? `${v.n} ${words(v.label, 2)}` : `${v.yr} ${words(v.text, 2)}` });
  });
  const OUTS = SCENES.filter(S => RS.cueNames(S.sc.type).includes('out'))
    .map(S => ({ S, out: RS.cue(S.sc, 'out'), set: !!(S.sc.cues && S.sc.cues.out != null) }));

  // ── geometry ──────────────────────────────────────────────────────────
  const PANEL = 300;                       // the panel's height
  const Y = { ruler: 8, card: 40, cardH: 196, items: 90, m0: 124, m1: 154, body: 84, bodyH: 150, outRow: 194 };   // outRow: the out handles' band, to the card's foot
  const PIN = 24, GAP = 26, MAX_PXS = 360;  // a moment's hit box; the room it needs from the next; the deepest zoom (px a second)
  const SLIM = 760, INSP = 440;            // a panel narrower than SLIM is slim; the inspector's width in a wide one

  // ── style: the site's tokens, never text dimmed with alpha ────────────
  const css = document.createElement('style');
  css.textContent = `
#reel-tl { position: fixed; left: 0; right: 0; height: ${PANEL}px; z-index: 50; box-sizing: border-box;
  background: rgba(var(--surface-rgb), 0.95); border-top: 1px solid rgba(var(--cyan-dim-rgb), 0.3);
  font: 500 11px/1 var(--font-mono); color: var(--ink-quiet); letter-spacing: 0.02em; user-select: none; -webkit-user-select: none; }
#reel-tl[hidden], #reel-tl [hidden] { display: none !important; }
#reel-tl * { box-sizing: border-box; }
#reel-tl .tl-main { position: absolute; left: 0; top: 0; bottom: 0; right: 0; }
#reel-tl.tl-insp .tl-main { right: var(--tl-iw, 440px); }
#reel-tl .tl-gl { position: absolute; left: 16px; width: 80px; color: var(--ink-faint); font-size: 11px; text-transform: lowercase; letter-spacing: 0.08em; cursor: help; }
#reel-tl .tl-gl small { display: block; margin-top: 4px; font-size: 10px; letter-spacing: 0.04em; }
#reel-tl .tl-view { position: absolute; left: 100px; right: 20px; top: 0; bottom: 48px; overflow-x: auto; overflow-y: hidden;
  scrollbar-width: thin; scrollbar-color: rgba(var(--cyan-dim-rgb), 0.45) transparent; }
#reel-tl .tl-view::-webkit-scrollbar { height: 8px; }
#reel-tl .tl-view::-webkit-scrollbar-thumb { background: rgba(var(--cyan-dim-rgb), 0.45); border-radius: 4px; }
#reel-tl .tl-lane { position: relative; height: 100%; min-width: 100%; }
#reel-tl .tl-ruler { position: absolute; left: 0; right: 0; top: ${Y.ruler}px; height: 24px; cursor: col-resize;
  border-bottom: 1px solid rgba(var(--cyan-dim-rgb), 0.3);
  background-image: linear-gradient(to right, rgba(var(--cyan-dim-rgb), 0.35) 1px, transparent 1px);
  background-repeat: repeat-x; background-position: 0 100%; background-size: 10px 5px; }
#reel-tl .tl-tick { position: absolute; bottom: 0; height: 12px; border-left: 1px solid rgba(var(--cyan-dim-rgb), 0.6); padding: 0 0 0 4px; color: var(--ink-faint); pointer-events: none; font-size: 10px; line-height: 10px; }
#reel-tl .tl-blk { position: absolute; border: 1px solid rgba(var(--cyan-dim-rgb), 0.35); background: rgba(var(--cyan-dim-rgb), 0.06); border-radius: 6px;
  overflow: hidden; white-space: nowrap; cursor: pointer; transition: border-color 0.2s, background 0.2s; }
#reel-tl .tl-blk:hover { background: rgba(var(--cyan-dim-rgb), 0.11); }
#reel-tl .tl-sc { top: ${Y.card}px; height: ${Y.cardH}px; padding: 9px 10px 0; }
#reel-tl .tl-sc b, #reel-tl .tl-sc i { will-change: transform; }
#reel-tl .tl-sc b { display: block; font: 300 15px/1.1 var(--font-display); color: var(--text-bright); overflow: hidden; text-overflow: ellipsis; letter-spacing: 0.01em; }
#reel-tl .tl-sc i { display: block; font-style: normal; color: var(--ink-faint); margin-top: 6px; overflow: hidden; text-overflow: ellipsis; }
#reel-tl .tl-sc::after { content: ''; position: absolute; left: 0; right: 0; top: ${Y.body - Y.card - 4}px; border-top: 1px dashed rgba(var(--cyan-dim-rgb), 0.2); pointer-events: none; }
#reel-tl .tl-sc.tl-cur { border-bottom: 2px solid var(--gold); }
#reel-tl .tl-sc.tl-sel { border-color: var(--gold); background: rgba(var(--gold-rgb), 0.07); }
#reel-tl .tl-sc.tl-sel b { color: var(--gold); }
#reel-tl .tl-it { top: ${Y.items}px; height: 26px; padding: 7px 8px 0; color: var(--ink-quiet); text-overflow: ellipsis; z-index: 2; background: rgba(var(--cyan-dim-rgb), 0.12); }
#reel-tl .tl-grip { position: absolute; right: -1px; top: 0; bottom: 0; width: 14px; cursor: ew-resize; z-index: 1; }
#reel-tl .tl-sc .tl-grip { bottom: ${Y.card + Y.cardH - Y.outRow}px; }   /* above the out row, so the two never overlap */
#reel-tl .tl-grip::after { content: ''; position: absolute; right: 4px; top: 22%; bottom: 22%; width: 3px; border-radius: 2px; background: rgba(var(--cyan-dim-rgb), 0.35); transition: background 0.15s; }
#reel-tl .tl-blk:hover .tl-grip::after { background: rgba(var(--cyan-dim-rgb), 0.7); }
#reel-tl .tl-grip:hover::after, #reel-tl .tl-grip.tl-on::after { background: var(--gold); }
/* the out hatch: part of its card, from the cue to the card's end */
#reel-tl .tl-otz { position: absolute; top: ${Y.body}px; height: ${Y.bodyH}px; pointer-events: none; z-index: 1; border-radius: 0 0 5px 0; overflow: hidden;
  border-left: 1px solid rgba(var(--cyan-dim-rgb), 0.7);
  background: repeating-linear-gradient(135deg, rgba(var(--cyan-dim-rgb), 0.22) 0 2px, transparent 2px 7px); }
#reel-tl .tl-otz.tl-def { background: repeating-linear-gradient(135deg, rgba(var(--cyan-dim-rgb), 0.12) 0 2px, transparent 2px 7px); border-left-style: dashed; }
#reel-tl .tl-otz span { position: absolute; left: 5px; bottom: 6px; color: var(--ink-quiet); font-size: 10px; }
#reel-tl .tl-ot { position: absolute; top: ${Y.outRow}px; height: ${Y.body + Y.bodyH - Y.outRow}px; width: 18px; margin-left: -9px; cursor: ew-resize; z-index: 3; }
#reel-tl .tl-ot::before { content: ''; position: absolute; left: 8px; top: 0; bottom: 0; width: 2px; background: var(--cyan); opacity: 0.8; }
#reel-tl .tl-ot.tl-def::before { background: var(--ink-faint); }
#reel-tl .tl-ot::after { content: ''; position: absolute; left: 4px; bottom: 9px; width: 10px; height: 18px; border-radius: 3px;
  border: 1px solid var(--cyan); background: rgba(var(--surface-rgb), 0.95); }
#reel-tl .tl-ot.tl-def::after { border-color: var(--ink-faint); }
#reel-tl .tl-ot:hover::before, #reel-tl .tl-ot.tl-on::before { background: var(--gold); opacity: 1; }
#reel-tl .tl-ot:hover::after, #reel-tl .tl-ot.tl-on::after { border-color: var(--gold); }
/* a moment: a ${PIN}px target, its mark, and its name when there is room */
#reel-tl .tl-bt { position: absolute; width: ${PIN}px; height: 26px; margin-left: -${PIN / 2}px; cursor: ew-resize; z-index: 4; }
#reel-tl .tl-bt::before { content: ''; position: absolute; left: ${PIN / 2 - 5}px; top: 8px; width: 10px; height: 10px; transform: rotate(45deg); background: var(--cyan); }
#reel-tl .tl-bt.tl-f::before { transform: none; border-radius: 50%; }
#reel-tl .tl-bt.tl-quote::before { transform: none; border-radius: 2px; }
#reel-tl .tl-bt.tl-fish::before { transform: none; width: 11px; clip-path: polygon(0 0, 100% 50%, 0 100%); background: var(--gold); }
#reel-tl .tl-bt::after { content: ''; position: absolute; left: ${PIN / 2}px; top: -4px; height: 4px; width: 1px; background: rgba(var(--cyan-dim-rgb), 0.6); }
#reel-tl .tl-bt:hover::before, #reel-tl .tl-bt.tl-on::before { background: var(--gold); }
#reel-tl .tl-lb { position: absolute; left: ${PIN - 2}px; top: 7px; font-size: 10px; line-height: 12px; color: var(--ink-quiet); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; pointer-events: none; }
#reel-tl .tl-bt:hover .tl-lb, #reel-tl .tl-bt.tl-on .tl-lb { color: var(--gold); }
#reel-tl .tl-ph { position: absolute; left: 0; top: ${Y.ruler}px; height: ${Y.card + Y.cardH - Y.ruler}px; width: 1px; background: var(--gold); pointer-events: none; will-change: transform; z-index: 5; }
#reel-tl .tl-ph::before { content: ''; position: absolute; left: -4px; top: 0; border: 4.5px solid transparent; border-top: 6px solid var(--gold); }
#reel-tl .tl-ro-out { position: absolute; top: ${Y.card + 4}px; padding: 4px 7px; border: 1px solid rgba(var(--gold-rgb), 0.6); border-radius: 4px; background: rgba(var(--surface-rgb), 0.96);
  color: var(--text-bright); pointer-events: none; white-space: nowrap; z-index: 6; }
#reel-tl .tl-ro-out[hidden] { display: none; }
#reel-tl .tl-status { position: absolute; left: 16px; right: 20px; bottom: 10px; height: 30px; display: flex; align-items: center; gap: 10px; white-space: nowrap;
  border-top: 1px solid rgba(var(--cyan-dim-rgb), 0.15); padding-top: 8px; }
#reel-tl .tl-status .tl-where { color: var(--cyan); overflow: hidden; text-overflow: ellipsis; min-width: min(16ch, 40%); flex: 0 1 auto; }
#reel-tl .tl-status .tl-err { color: var(--text-bright); border-left: 2px solid #ff8a7a; padding-left: 8px; overflow: hidden; text-overflow: ellipsis; flex: 1; min-width: 0; }
#reel-tl .tl-status .tl-err:empty { display: none; }
#reel-tl .tl-status .tl-gap { flex: 1; }
#reel-tl .tl-status .tl-err:not(:empty) ~ .tl-gap { display: none; }
#reel-tl .tl-status .tl-note { color: var(--ink-faint); }
#reel-tl .tl-status .tl-grp { display: flex; gap: 4px; align-items: center; margin: 0; padding: 0; border: 0; }
#reel-tl .tl-status .tl-zr { min-width: 4ch; text-align: center; color: var(--ink-quiet); }
/* The collapse rule (REEL_UI.fit): the bar's buttons never shrink; while it overflows it takes
   these steps in order, each on top of the last. A label folds into its button's tooltip. */
#reel-tl .tl-status > button, #reel-tl .tl-status .tl-grp, #reel-tl .tl-status .tl-note { flex: none; }
#reel-tl .tl-status.fit-labels button:not(.tl-go) .rl { display: none; }
#reel-tl .tl-status.fit-labels button:not(.tl-go):has(> .ri) { padding: 0; width: 28px; }
#reel-tl .tl-status.fit-note .tl-note { display: none; }
#reel-tl .tl-status.fit-where .tl-where { display: none; }
#reel-tl .tl-status.fit-go .tl-go .rl { display: none; }
#reel-tl .tl-status.fit-go .tl-go { padding: 0; width: 28px; }
#reel-tl .tl-status.fit-zoom .tl-zr, #reel-tl .tl-status.fit-zoom [data-act="fit"] { display: none; }
#reel-tl button { font: 500 11px/1 var(--font-mono); color: var(--text-bright); background: rgba(var(--cyan-dim-rgb), 0.1); border: 1px solid rgba(var(--cyan-dim-rgb), 0.4);
  border-radius: 5px; padding: 0 9px; height: 26px; min-width: 26px; cursor: pointer; }
#reel-tl button:hover:not(:disabled), #reel-tl button:focus-visible { border-color: var(--gold); color: var(--gold); outline: none; }
#reel-tl button:disabled { color: var(--ink-faint); cursor: default; opacity: 0.6; }
#reel-tl button.tl-go { border-color: rgba(var(--gold-rgb), 0.65); color: var(--gold); }
#reel-tl button:has(> .ri):not(:has(> .rl)) { padding: 0; width: 28px; flex: none; }   /* an icon alone: a square */
#reel-tl .tl-x { position: absolute; top: 8px; right: 20px; z-index: 7;   /* opaque: it sits on the ruler's end */
  background: linear-gradient(rgba(var(--cyan-dim-rgb), 0.1), rgba(var(--cyan-dim-rgb), 0.1)), rgb(var(--surface-rgb)); }
#reel-tl.tl-insp .tl-x { right: calc(var(--tl-iw, 440px) + 20px); }
#reel-tl .tl-insp-col { position: absolute; right: 0; top: 0; bottom: 0; width: var(--tl-iw, 440px); overflow-y: auto; border-left: 1px solid rgba(var(--cyan-dim-rgb), 0.3);
  padding: 12px 18px 16px; user-select: text; -webkit-user-select: text; }
/* A narrow panel: under ${SLIM}px the gutter's names go (the cards, items and moments keep their
   tooltips) and the inspector opens over the whole panel, a page of its own with its own close */
#reel-tl.tl-slim .tl-gl { display: none; }
#reel-tl.tl-slim .tl-view { left: 12px; right: 12px; }
#reel-tl.tl-slim .tl-status { left: 12px; right: 12px; }
#reel-tl.tl-slim .tl-x { right: 12px; }
#reel-tl.tl-slim.tl-insp .tl-main { right: 0; }
#reel-tl.tl-slim .tl-insp-col { z-index: 8; border-left: 0; background: rgba(var(--surface-rgb), 0.99); padding: 12px 14px 16px; }
#reel-tl .tl-insp-col[hidden] { display: none; }
#reel-tl .tl-ih { display: flex; align-items: baseline; gap: 10px; margin-bottom: 6px; }
#reel-tl .tl-ih h3 { margin: 0; font: 300 18px/1.2 var(--font-display); color: var(--gold); flex: 1; }
#reel-tl .tl-insp-col .tl-grp { margin: 12px 0 4px; padding-top: 8px; border-top: 1px solid rgba(var(--cyan-dim-rgb), 0.2); color: var(--cyan); display: flex; align-items: center; gap: 8px; }
#reel-tl .tl-row { display: grid; grid-template-columns: 64px 1fr; align-items: center; gap: 8px; margin: 3px 0; border-radius: 4px; transition: background 0.6s; }
#reel-tl .tl-row.tl-cues { grid-template-columns: 64px repeat(3, 1fr); }
#reel-tl .tl-hl, #reel-tl .tl-insp-col .tl-grp.tl-hl { background: rgba(var(--gold-rgb), 0.16); transition: none; }
#reel-tl .tl-row label, #reel-tl .tl-insp-col .tl-grp label, #reel-tl .tl-cue label { color: var(--ink-faint); }
#reel-tl .tl-cue { display: flex; align-items: center; gap: 5px; }
#reel-tl .tl-cue input { width: 100%; min-width: 0; }
#reel-tl input { font: 500 11px/1.3 var(--font-mono); color: var(--text-bright); background: rgba(var(--cyan-dim-rgb), 0.06); border: 1px solid rgba(var(--cyan-dim-rgb), 0.25);
  border-radius: 4px; padding: 4px 6px; width: 100%; outline: none; }
#reel-tl input[type=number] { width: 72px; }
#reel-tl .tl-cue input[type=number] { width: 100%; }
#reel-tl input:focus { border-color: var(--gold); }
#reel-tl input::placeholder { color: var(--ink-faint); }
#reel-tl .tl-flag { color: var(--ink-quiet); }
#reel-tl .tl-mbox { display: grid; gap: 4px; min-width: 0; }
#reel-tl button.tl-mchip { display: grid; grid-template-columns: 72px minmax(0, 1fr) auto; align-items: center; gap: 10px; height: 50px; padding: 3px 10px 3px 3px; text-align: left; }
#reel-tl .tl-mth { width: 72px; height: 42px; border-radius: 4px; background: #000 center / cover no-repeat; display: flex; align-items: center; justify-content: center; color: var(--ink-faint); }
#reel-tl .tl-mnm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#reel-tl .tl-mgo { color: var(--gold); }
#reel-tl .tl-mbox input { color: var(--ink-quiet); }
`;
  document.head.appendChild(css);

  // ── the DOM ───────────────────────────────────────────────────────────
  // every class wears tl-: the rig's own classes (.status, .row, .note…) are global and would reach in
  const h = (tag, cls, parent, text) => { const e = document.createElement(tag); if (cls) e.className = cls.split(' ').map(c => 'tl-' + c).join(' '); if (text != null) e.textContent = text; if (parent) parent.appendChild(e); return e; };
  // a button: an icon, and a label the collapse rule may fold away (the name stays in the tooltip)
  const button = (parent, text, title, act, cls, icon) => {
    let b;
    if (icon && window.REEL_UI) { b = REEL_UI.button({ icon, label: text, title }); if (cls) b.className = cls.split(' ').map(c => 'tl-' + c).join(' '); parent.appendChild(b); }
    else { b = h('button', cls || null, parent, text); b.type = 'button'; b.title = title; }
    if (act) b.dataset.act = act;
    return b;
  };
  const root = h('div', null, document.body); root.id = 'reel-tl'; root.hidden = true;
  root.setAttribute('role', 'region'); root.setAttribute('aria-label', 'Reel timeline');
  const main = h('div', 'main', root);
  // the gutter says what each band of the cards holds
  [['time', Y.ruler + 7, 'click or drag the ruler to move the playhead'],
   ['scenes', Y.card + 12, 'each scene is a card: drag its right edge to change its length; click it to change its words'],
   ['items', Y.items + 2, 'a results scene shows several works, one after another: its items. Only results scenes have them', 'results only'],
   ['moments', Y.m0 + 2, 'when something happens inside a scene: a picture, a clip, a quote, a stat, an award, and the fish lines (gold triangles; the Fish panel, F, writes them). Drag one to retime it; click it to open it'],
   ['out', Y.body + Y.bodyH - 18, 'the hatched end of each card: where the scene\'s content starts to leave. Drag the handle at its foot']]
    .forEach(([t, y, tip, sub]) => { const g = h('div', 'gl', main, t); g.style.top = y + 'px'; g.title = tip; if (sub) h('small', null, g, sub); });
  const view = h('div', 'view', main);
  const lane = h('div', 'lane', view);
  const ruler = h('div', 'ruler', lane); ruler.title = 'click or drag to move the playhead';
  const recs = [];                                // every placed thing: { el, span(map) → [t0, t1?] }
  SCENES.forEach(S => {
    const el = h('div', 'blk sc', lane); el.dataset.scene = S.i;
    S.nm = h('b', null, el, `${S.i + 1} ${S.sc.type}`); S.q = h('i', null, el, S.what || ' ');
    el.title = `${S.i + 1} ${S.sc.type} · ${S.sc.dur} s · ${fmt(S.start)} → ${fmt(S.end)}${S.what ? '\n' + S.what : ''}\nclick to change its words`;
    const g = h('div', 'grip', el); g.title = 'drag to change the scene\'s length';
    S.el = el; S.grip = g;
    recs.push({ el, span: m => [m(S.start), m(S.end)] });
  });
  OUTS.forEach(O => {
    const z = h('div', 'otz' + (O.set ? '' : ' def'), lane); h('span', null, z, 'out'); O.zone = z;
    const el = h('div', 'ot' + (O.set ? '' : ' def'), lane); O.el = el;
    el.title = `${O.S.sc.type}: its content starts to leave ${O.out} s before the scene ends${O.set ? '' : ' (the default)'}. Drag to change`;
    recs.push({ el: z, span: m => [m(O.S.end) - (O.drag != null ? O.drag : O.out), m(O.S.end)] });
    recs.push({ el, span: m => [m(O.S.end) - (O.drag != null ? O.drag : O.out)] });
  });
  ITEMS.forEach(I => {
    const el = h('div', 'blk it', lane, I.obj.eyebrow || (I.obj.headline || []).join(' ') || 'item');
    el.title = `item ${I.k + 1} of the results · ${I.obj.dur} s · ${fmt(I.start)} → ${fmt(I.end)}\n${I.obj.eyebrow || ''}`;
    const g = h('div', 'grip', el); g.title = 'drag to change the item\'s length';
    I.el = el; I.grip = g;
    recs.push({ el, span: m => [m(I.start), m(I.end)] });
  });
  MOMENTS.forEach(M => {
    const el = h('div', 'bt' + (M.fish ? ' fish' : M.field ? ' f' : M.kind === 'quote' ? ' quote' : ''), lane); M.el = el;
    M.lb = h('span', 'lb', el, M.label);
    el.title = `@${M.at} · ${M.gist}\n${M.field ? M.kind : M.kind} ${fmt(M.own.start + M.at)} · drag to retime, click to open`;
    recs.push({ el, span: m => [m(M.own.start) + (M.drag != null ? M.drag : M.at)], moment: M });
  });
  const ph = h('div', 'ph', lane);
  const readout = h('div', 'ro-out', lane); readout.hidden = true;
  const close = button(root, '', 'close the timeline (E)', 'close', 'x', 'close'); close.setAttribute('aria-label', 'close the timeline');

  const status = h('div', 'status', main);
  const where = h('span', 'where', status);
  const err = h('span', 'err', status); err.setAttribute('role', 'status');
  h('span', 'gap', status);
  // where saves go: the file (dev server), the page's host (claude.ai), or a draft in this tab
  const home = (busy) => L.dev ? `Saving to ${L.file}${busy ? '…' : ''}` : L.host ? `Saving to ${L.host}${busy ? '…' : ''}`
    : busy ? 'Keeping a draft in this tab…' : 'Draft in this tab: no dev server';
  if (!L.dev && (L.draft || L.hosted)) {
    const dl = button(status, 'Download', 'save this version as ' + L.file.replace(/^.*\//, ''), 'download', null, 'download');
    dl.onclick = () => L.download(L.src);
    const ds = button(status, L.hosted ? 'Revert' : 'Discard', L.hosted ? `drop the version saved on ${L.host} and play the file again` : 'drop the draft and play the file again', 'discard', null, L.hosted ? 'revert' : 'discard');
    ds.onclick = () => { put(K_UNDO, []); put(K_REDO, []); L.discardDraft(); };
  }
  const edit = h('div', 'grp', status);
  const bUndo = button(edit, 'Undo', 'undo the last change (⌘Z / Ctrl+Z)', 'undo', null, 'undo');
  const bRedo = button(edit, 'Redo', 'redo it (⇧⌘Z / Ctrl+Shift+Z)', 'redo', null, 'redo');
  const zoom = h('div', 'grp', status);
  const bOut = button(zoom, '', 'zoom out (-)', 'zoom-out', null, 'zoomOut'); bOut.setAttribute('aria-label', 'zoom out');
  const zr = h('span', 'zr', zoom, 'fit');
  const bIn = button(zoom, '', 'zoom in (=), or Ctrl/⌘ + wheel, or pinch', 'zoom-in', null, 'zoomIn'); bIn.setAttribute('aria-label', 'zoom in');
  const bFit = button(zoom, 'Fit', 'the whole reel in view (0)', 'fit', null, 'fit');
  const warn = P.warnings.length;
  const note = h('span', 'note', status, `total ${fmt(DUR)}${warn ? ` · ${warn} warning${warn > 1 ? 's' : ''}` : ''}`);
  if (warn) note.title = P.warnings.join('\n');
  const bEx = button(status, 'Export video', 'make the video from this edit (X)', 'export', 'go', 'export');
  where.textContent = home(false);
  if (!L.dev && L.draft) where.textContent += ' (unsaved draft)';
  else if (L.hosted) where.textContent += ' (your saved version)';
  where.title = where.textContent;
  // the collapse rule (scripts/reel-ui.js): labels fold into tooltips, then the total goes, then
  // the save line, then Export's label, then the zoom's readout and Fit
  if (window.REEL_UI) REEL_UI.fit(status, ['fit-labels', 'fit-note', 'fit-where', 'fit-go', 'fit-zoom']);
  const say = errs => { errs = [].concat(errs || []).map(String).filter(Boolean); err.textContent = errs[0] || ''; err.title = errs.join('\n'); };

  const insp = h('div', 'insp-col', root); insp.hidden = true;
  insp.setAttribute('aria-label', 'Scene inspector');

  // ── layout: on open, on resize, on zoom, and while a drag previews its ripple ──
  const view0 = get(K_VIEW, null);
  let Z = view0 && view0.z > 1 ? view0.z : 1, W = 1, VW = 1, pxs = 1;
  const x = t => t * pxs;
  const zMax = () => Math.max(1, MAX_PXS * DUR / (view.clientWidth || 1));
  function layout(map) {
    map = map || (t => t);
    const t0 = VW > 1 ? view.scrollLeft / pxs : null;   // the time at the view's left edge stays put
    VW = view.clientWidth || 1; Z = Math.min(Z, zMax());
    W = Math.max(VW, Math.round(VW * Z)); pxs = W / DUR;
    lane.style.width = W + 'px';
    recs.forEach(r => {
      const [a, b] = r.span(map);
      r.el.style.left = x(a).toFixed(1) + 'px';
      if (b != null) r.el.style.width = Math.max(4, x(b) - x(a) - 2).toFixed(1) + 'px';   // a 2 px gutter between blocks
    });
    placeMoments(map);
    if (!map.drag) { ticks(); if (t0 != null) view.scrollLeft = t0 * pxs; }
    stick();
    zr.textContent = Z < 1.05 ? 'fit' : (Z < 10 ? Z.toFixed(1) : Math.round(Z)) + '×';
    bOut.disabled = bFit.disabled = Z < 1.05; bIn.disabled = Z >= zMax() - 0.01;
    frame(L.now());
  }
  // Moments close together take a second row; a name shows where there is room for it.
  function placeMoments(map) {
    const ms = MOMENTS.map(M => ({ M, px: x(map(M.own.start) + (M.drag != null ? M.drag : M.at)) })).sort((a, b) => a.px - b.px);
    const last = [-1e9, -1e9];
    ms.forEach(o => {
      o.row = last[0] + GAP <= o.px ? 0 : last[1] + GAP <= o.px ? 1 : (last[0] <= last[1] ? 0 : 1);
      last[o.row] = o.px; o.M.el.style.top = (o.row ? Y.m1 : Y.m0) + 'px';
    });
    ms.forEach((o, i) => {
      let next = x(map(o.M.S.end)) - 6;                    // never past its own card
      for (let j = i + 1; j < ms.length; j++) if (ms[j].row === o.row) { next = Math.min(next, ms[j].px - PIN / 2); break; }
      const room = Math.floor(next - o.px - PIN / 2 - 2);
      o.M.lb.hidden = room < 26;
      o.M.lb.style.maxWidth = Math.min(160, Math.max(0, room)) + 'px';
    });
  }
  // a card scrolled half out of view keeps its name in view
  function stick() {
    const L0 = view.scrollLeft;
    SCENES.forEach(S => {
      const a = parseFloat(S.el.style.left) || 0, w = parseFloat(S.el.style.width) || 0;
      const d = Math.max(0, Math.min(L0 - a, w - 120));
      const tr = d > 0 ? `translateX(${d.toFixed(0)}px)` : '';
      if (S.nm.style.transform !== tr) { S.nm.style.transform = tr; S.q.style.transform = tr; }
    });
  }
  function ticks() {
    ruler.querySelectorAll('.tl-tick').forEach(e => e.remove());
    const step = [0.25, 0.5, 1, 2, 5, 10, 15, 30].find(s => s * pxs >= 64) || 30;
    const minor = step <= 0.5 ? step / 5 : step <= 2 ? step / 4 : step / 5;
    ruler.style.backgroundSize = `${(pxs * minor).toFixed(3)}px 5px`;
    const label = t => { const m = Math.floor(t / 60 + 1e-9), r = n3(t - m * 60); return `${m}:${r < 10 ? '0' : ''}${step < 1 ? r.toFixed(2).replace(/0$/, '') : Math.round(r)}`; };
    // the last label stops short of the close button, which sits on the ruler's end
    for (let t = 0; t <= DUR + 1e-6 && x(t) < W - 48; t = n3(t + step)) { const e = h('span', 'tick', ruler, label(t)); e.style.left = x(t).toFixed(1) + 'px'; }
  }
  let curScene = -1, lastT = null, dragging = false;
  function frame(t) {
    if (root.hidden) return;
    const tt = Math.max(0, Math.min(DUR, t));
    ph.style.transform = `translateX(${x(tt).toFixed(1)}px)`;
    let c = 0; SCENES.forEach(S => { if (t >= S.start - 1e-6) c = S.i; });
    if (c !== curScene) { if (SCENES[curScene]) SCENES[curScene].el.classList.remove('tl-cur'); SCENES[c].el.classList.add('tl-cur'); curScene = c; }
    // zoomed in, the view follows the playhead while it plays, and after a jump
    const jumped = lastT != null && Math.abs(tt - lastT) > 0.3; lastT = tt;
    if (Z > 1.05 && !dragging && ((L.isPlaying && L.isPlaying()) || jumped)) {
      const p = x(tt) - view.scrollLeft;
      if (p < 0 || p > VW - 24) view.scrollLeft = Math.max(0, x(tt) - VW * 0.15);
    }
  }
  L.onFrame(frame);

  // ── zoom ──────────────────────────────────────────────────────────────
  const keepView = () => put(K_VIEW, { z: Z, left: view.scrollLeft / pxs });
  // zoom to z, keeping the time under `at` (px from the view's left) where it is:
  // by default the playhead when it is in view, else the middle
  function zoomTo(z, at) {
    z = Math.max(1, Math.min(zMax(), z));
    if (Math.abs(z - Z) < 1e-3) return;
    if (at == null) { const p = x(Math.max(0, Math.min(DUR, L.now()))) - view.scrollLeft; at = p >= 0 && p <= VW ? p : VW / 2; }
    const t = (view.scrollLeft + at) / pxs;
    Z = z; VW = 0; layout();                          // VW 0: no left-edge anchoring, the anchor below decides
    view.scrollLeft = Math.max(0, t * pxs - at);
    stick(); keepView();
  }
  bIn.onclick = () => zoomTo(Z * 1.6);
  bOut.onclick = () => zoomTo(Z / 1.6);
  bFit.onclick = () => zoomTo(1);
  view.addEventListener('wheel', e => {
    const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? VW : 1;
    if (e.ctrlKey || e.metaKey) { e.preventDefault(); zoomTo(Z * Math.exp(-e.deltaY * k * 0.0025), e.clientX - view.getBoundingClientRect().left); }
    else if (Z > 1.05 && Math.abs(e.deltaY) > Math.abs(e.deltaX)) { e.preventDefault(); view.scrollLeft += e.deltaY * k; }
  }, { passive: false });
  let g0 = null;                                        // Safari's pinch
  view.addEventListener('gesturestart', e => { e.preventDefault(); g0 = Z; });
  view.addEventListener('gesturechange', e => { e.preventDefault(); if (g0 != null) zoomTo(g0 * e.scale, e.clientX - view.getBoundingClientRect().left); });
  view.addEventListener('gestureend', e => { e.preventDefault(); g0 = null; });
  let scrollT; view.addEventListener('scroll', () => { stick(); clearTimeout(scrollT); scrollT = setTimeout(keepView, 200); });

  // the preview shrinks to fit above the panel (the rig keeps the bottom of the window for it)
  // and takes the whole window back when the panel shuts
  function fitStage() {
    const hud = document.getElementById('hud'), hh = hud && !hud.hidden ? hud.getBoundingClientRect().height : 0;
    root.style.bottom = Math.round(hh) + 'px';
    L.reserveBottom(hh + PANEL);
    // the panel's own width decides its shape (the synth rack may take the right of the window):
    // wide, the inspector sits beside the cards at INSP px; narrower, at 44% of the panel; slim,
    // over all of it
    const pw = root.clientWidth || innerWidth, slim = pw < SLIM;
    root.classList.toggle('tl-slim', slim);
    root.style.setProperty('--tl-iw', (slim ? pw : Math.min(INSP, Math.max(320, Math.round(pw * 0.44)))) + 'px');
  }
  let tool = null;
  function show(open) {
    root.hidden = !open; put(K_OPEN, open);
    if (tool) tool.setAttribute('aria-pressed', String(!!open));
    if (open) {
      fitStage(); VW = 0; layout();
      const v = get(K_VIEW, null); if (v && v.left != null) view.scrollLeft = v.left * pxs;
    } else L.reserveBottom(0);
  }
  close.onclick = () => show(false);
  addEventListener('resize', () => { if (!root.hidden) { fitStage(); layout(); } });

  // ── saving: every change is one new script text ───────────────────────
  let busy = false;
  const stack = k => { const s = get(k, []); return Array.isArray(s) ? s : []; };
  const stacks = () => { bUndo.disabled = !stack(K_UNDO).length || busy; bRedo.disabled = !stack(K_REDO).length || busy; };
  async function save(next, undo, redo) {
    if (busy) return false;
    const u0 = stack(K_UNDO), r0 = stack(K_REDO);
    try { RS.parse(next); } catch (e) { say(e.errors || [e.message]); layout(); return false; }   // never save a broken script
    busy = true; say(''); where.textContent = home(true); stacks();
    put(K_UNDO, undo.slice(-DEPTH)); put(K_REDO, redo.slice(-DEPTH));
    let res;
    try { res = await L.save(next); } catch (e) { res = { ok: false, errors: [e.message] }; }
    if (!res || !res.ok) {                         // nothing changed: put the stacks and the picture back
      put(K_UNDO, u0); put(K_REDO, r0); busy = false;
      where.textContent = home(false); stacks();
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
  bUndo.onclick = () => undo(true);
  bRedo.onclick = () => undo(false);
  stacks();
  bEx.onclick = () => { if (window.REEL_EXPORT) window.REEL_EXPORT.open(); else say(['export did not load (scripts/reel-export.js)']); };
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
    const x0 = e.clientX; let moved = false; dragging = true;
    try { target.setPointerCapture(e.pointerId); } catch (x_) { /* synthetic pointer */ }
    const mv = ev => { const dx = ev.clientX - x0; if (Math.abs(dx) > 3) moved = true; if (moved) move(dx / pxs, ev); };
    const fin = ev => {
      target.removeEventListener('pointermove', mv); target.removeEventListener('pointerup', fin); target.removeEventListener('pointercancel', fin);
      readout.hidden = true; dragging = false; up(moved, ev);
    };
    target.addEventListener('pointermove', mv); target.addEventListener('pointerup', fin); target.addEventListener('pointercancel', fin);
  }
  const show1 = (t, text) => {
    readout.hidden = false; readout.textContent = text;
    const w = readout.offsetWidth, lo = view.scrollLeft, hi = view.scrollLeft + VW - w;
    readout.style.left = Math.min(hi, Math.max(lo, x(t) + 8)).toFixed(0) + 'px';
  };
  // ripple: every time at or after the edge moves by d; the scale stays, so the tail may run off
  const ripple = (edge, d) => { const m = t => (t >= edge - 1e-6 ? t + d : t); m.drag = true; return m; };
  const still = t => t; still.drag = true;

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
      drag(e, I.el, () => {}, moved => { if (!moved) { select(I.S.i, true); L.seek(I.start); point(I.ln); } });
    });
  });
  MOMENTS.forEach(M => M.el.addEventListener('pointerdown', e => {
    const hi = Math.max(0, n3(M.len - 0.05));
    M.el.classList.add('tl-on');
    drag(e, M.el, (dt, ev) => {
      M.drag = Math.min(hi, Math.max(0, snap(M.at + dt, ev)));
      layout(still);
      show1(M.own.start + M.drag, `@${M.at} → @${M.drag}  (${fmt(M.own.start + M.drag)})`);
    }, moved => {
      M.el.classList.remove('tl-on');
      const v = M.drag; M.drag = null;
      if (!moved) { L.seek(M.own.start + M.at); select(M.S.i, true); point(M.ln); layout(); }
      else if (v !== M.at) commit(src => RS.setAt(src, M.ln, v)); else layout();
    });
  }));
  OUTS.forEach(O => O.el.addEventListener('pointerdown', e => {
    const len = O.S.sc.dur;
    O.el.classList.add('tl-on');
    drag(e, O.el, (dt, ev) => {
      O.drag = Math.min(len, Math.max(0, snap(O.out - dt, ev)));   // right is later, so a smaller out
      layout(still);
      show1(O.S.end - O.drag, `out ${O.out} → ${O.drag} s before the end`);
    }, moved => {
      O.el.classList.remove('tl-on');
      const v = O.drag; O.drag = null;
      if (!moved) { L.seek(O.S.end - O.out); select(O.S.i, true); point('cue:out'); layout(); }
      else if (v !== O.out) commit(src => RS.setCue(src, O.S.ln, 'out', v)); else layout();
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
  // bring one line of the inspector into view and light it for a moment (a line number, or 'cue:out')
  function point(which) {
    const inp = insp.querySelector(typeof which === 'number' ? `input[data-ln="${which}"]` : `input[data-key="${which}"]`);
    const row = inp && (inp.closest('.tl-row, .tl-grp') || inp.parentElement);
    if (!row) return;
    row.scrollIntoView({ block: 'nearest' });
    row.classList.add('tl-hl'); setTimeout(() => row.classList.remove('tl-hl'), 900);
  }
  const wordsOf = (ln, key) => lines[ln - 1].trim().slice(key.length).trim();
  let uid = 0;
  // one labelled input; Enter or leaving it saves a change, Esc puts it back
  function input(parent, label, value, act, opts = {}) {
    const id = 'reel-tl-in' + (uid++);
    if (!opts.bare) { const lab = h('label', null, parent, label); lab.htmlFor = id; }
    const inp = h('input', null, parent); inp.id = id;
    if (opts.bare) inp.setAttribute('aria-label', label);
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
  // An img or video line: a chip with the file's thumbnail and name opens the media picker
  // (scripts/reel-picker.js); the name stays typeable under it.
  function mediaRow(f, ln) {
    const kind = f.key === 'img' ? 'picture' : 'clip', cur = wordsOf(ln, f.key);
    const r = h('div', 'row', insp); h('label', null, r, f.key);
    const box = h('div', 'mbox', r);
    const chip = button(box, '', `choose ${kind === 'picture' ? 'a picture' : 'a clip'} for this moment by looking at it`, 'media', 'mchip');
    chip.dataset.ln = ln;
    const th = h('span', 'mth', chip); th.textContent = kind === 'clip' ? '▶' : '';
    h('span', 'mnm', chip, cur.replace(/^\.\//, ''));
    h('span', 'mgo', chip, 'Change…');
    const P_ = window.REEL_PICKER;
    if (P_) P_.thumbFor(cur, kind).then(u => { if (u) { th.style.backgroundImage = `url("${u}")`; th.textContent = ''; } }).catch(() => {});
    chip.onclick = () => {
      if (!window.REEL_PICKER) return say(['the media picker did not load (scripts/reel-picker.js)']);
      window.REEL_PICKER.open({ kind, current: cur, onPick: it => pickMedia(f, ln, it) });
    };
    input(box, `${f.key} file`, cur, (src, v) => RS.setField(src, ln, v), { ln, key: f.key, bare: true });
  }
  // a new file for the slot; a clip's in-point past the new clip's end would show nothing, so it
  // starts the new clip at 0
  function pickMedia(f, ln, it) {
    commit(src => {
      let out = RS.setField(src, ln, it.path);
      const fr = f.key === 'video' && it.dur ? P.fields.find(g => g.owner === f.owner && g.key === 'from') : null;
      if (fr && f.owner.from >= it.dur - 0.5) out = RS.setField(out, fr.ln, '0');
      return out;
    });
  }
  function build(S) {
    insp.textContent = '';
    const head = h('div', 'ih', insp);
    h('h3', null, head, `${S.i + 1} ${S.sc.type}`);
    h('span', 'note', head, `${fmt(S.start)} → ${fmt(S.end)}`);
    const x_ = button(head, '', 'close the inspector (Esc)', null, null, 'close'); x_.setAttribute('aria-label', 'close the inspector'); x_.onclick = unselect;
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
        h('span', null, g, m.owner === m.scene ? 'moment' : 'moment in the item');
        input(g, '@', String(m.obj.at), (src, v) => RS.setAt(src, ln, Number(v)), { num: true, ln, key: '@' });
      } else if (f && f.kind === 'cue') {
        // shown in the cues row below
      } else if (f && f.kind === 'flag') {
        const r = h('div', 'row', insp); h('label', null, r, f.key); h('span', 'flag', r, 'on (a flag: delete the line to turn it off)');
      } else if (f && (f.key === 'img' || f.key === 'video')) {
        mediaRow(f, ln);
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

  // ── keys: accelerators for the buttons above ──────────────────────────
  addEventListener('keydown', e => {
    if (e.target.closest && e.target.closest('input, textarea, select, [contenteditable]')) return;
    const plain = !e.metaKey && !e.ctrlKey && !e.altKey;
    if ((e.key === 'e' || e.key === 'E') && plain) { e.preventDefault(); show(root.hidden); }
    else if ((e.key === 'z' || e.key === 'Z') && (e.metaKey || e.ctrlKey) && !root.hidden) { e.preventDefault(); undo(!e.shiftKey); }
    else if (root.hidden) return;
    else if ((e.key === '=' || e.key === '+') && plain) { e.preventDefault(); zoomTo(Z * 1.6); }
    else if (e.key === '-' && plain) { e.preventDefault(); zoomTo(Z / 1.6); }
    else if (e.key === '0' && plain) { e.preventDefault(); zoomTo(1); }
    else if (e.key === 'Escape' && selected >= 0) unselect();
  });
  // the HUD's button for the panel (older rigs: the key alone)
  if (L.addTool) tool = L.addTool({ id: 'timeline', label: 'Timeline', key: 'E', order: 20, icon: 'timeline',
    title: 'the timeline: drag the edit\'s times; click a scene to change its words', onClick: () => show(root.hidden) });

  // ── back to where the last reload left it ─────────────────────────────
  if (get(K_OPEN, false)) show(true);
  const sel = get(K_SEL, -1);
  if (!root.hidden && SCENES[sel]) select(sel, true);
  window.REEL_TIMELINE = { show, select, undo: () => undo(true), redo: () => undo(false), zoom: z => zoomTo(z), get zoomLevel() { return Z; } };   // for tests and the console
})();
