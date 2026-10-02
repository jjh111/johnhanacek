// The reel's timeline: edit a sizzle reel script by dragging its times, in the preview itself.
//
// The script (Assets/sizzle-reel-2.script.txt) stays the one source of truth. This panel only
// reads it (REEL_LIVE.parsed) and changes it the way a person would, one line at a time, through
// ReelScript's setDur / setAt / setField / setCue, then hands the new text to REEL_LIVE.save,
// which plays it at once, in place (nothing reloads), and keeps it in the background: the file
// through the dev server (node scripts/reel-dev.mjs), or the page's host (the editor published
// on claude.ai), or a draft in this tab. Every change of script (this panel's, the Fish panel's,
// an undo) comes back through REEL_LIVE.onChange, and the panel redraws its cards from the new
// parse where they were: the zoom, the scroll, the scene in the inspector and the field you were
// typing in stay. What it keeps in sessionStorage (open or shut, the inspector's scene, the zoom,
// the undo and redo stacks: whole script texts) is for a reload by hand.
//
// Every scene is a card, and what belongs to a scene sits inside its card:
//   works      the works a results scene shows, one after another (its ITEMs in the script: Nanome,
//              the AROC HUD, OpenProse); only results scenes have them
//   moments    when something appears inside the scene: a picture, a clip, a quote, a stat, an
//              award (the script's @ times). Drag one to retime it; click it to open it
//   out        the hatched end of each card: where the scene's content starts to leave (its
//              `cue out`). Drag the hatch's edge
// Under the cards, a lane for each fish (the big fish, the school): what it does across the cut,
// as spans that say what it looks at and how it idles (cyan: the scene's own choreography; gold:
// a fish line decides; hatched: nothing to look at, so it swims freely), and a gold mark for
// every fish line at its time. Drag a mark to retime its line; click it to edit the line in the
// Fish panel (scripts/reel-fish.js); click a span to jump there with that fish chosen.
// Under the fish lanes, the music: the score next to the script, which the synth rack keeps
// (scripts/reel-rack.js, REEL_RACK), on the same clock, as one piece. A head shows each section
// where its music plays (on the bar near its cut; a dashed line where the picture cuts), the
// chords on the bars, and a chip on every seam saying how the music crosses it (click: the next
// way in: fade, swell, build, drop, cut). Open (the chevron in the icon column), every part has a
// lane that shows what it plays, note for note: a drum's hits as ticks (taller, louder), a pitched
// part's notes at their pitches, fainter where its level is lower, its level behind them as a
// faint shape (its fades as ramps); then one lane of cues for the sound effects the edit plays
// itself: a tick a key of each question the command bar types, its Enter, the question while it
// stands on the bar, the select-all that clears it, and a dot for each pop on an @ moment. Click
// a stretch of a lane to play the part there or stop it; drag a lit one up or down for its level
// (Alt-click: half or full); Shift-click opens the part in the synth rack. M and S beside each
// lane mute and solo it while you listen (not saved; the cues' mute every sound effect). Undo
// takes back the last edit, the script's or the score's (REEL_LIVE.journal).
// Every action is a button, and its key an accelerator (named in the button's tooltip):
//   Timeline (E)          open / shut; the preview shrinks to fit above it (its button is in the HUD)
//   Undo / Redo (⌘Z, ⇧⌘Z) each is a save, played at once like any edit
//   − fit + (- 0 =)       zoom; also Ctrl/⌘ + wheel or a pinch. The wheel scrolls a zoomed timeline
//   Export video (X)      how the script becomes a film (scripts/reel-export.js)
//   drag a card's right edge    its length; everything after it ripples
//   drag a work's right edge    how long it shows, and its results scene grows with it, so the
//                               works before it stay put (they hang from the scene's end)
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

  // ── storage for a reload by hand ──────────────────────────────────────
  const get = (k, d) => { try { const v = sessionStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
  const put = (k, v) => { try { sessionStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
  const K_OPEN = 'reel-tl-open', K_SEL = 'reel-tl-sel:' + L.file, K_UNDO = 'reel-undo:' + L.file, K_REDO = 'reel-redo:' + L.file, K_VIEW = 'reel-tl-view:' + L.file, K_MUS = 'reel-tl-music';
  const DEPTH = 30;

  // ── the model: where everything is, read from the parse (again after every change) ──
  const fmt = s => { const m = Math.floor(s / 60 + 1e-9), r = s - m * 60; return `${m}:${r < 10 ? '0' : ''}${r.toFixed(1)}`; };
  const n3 = x => +(+x).toFixed(3);
  const words = (s, n) => String(s || '').replace(/<[^>]+>/g, '').split(/\s+/).filter(Boolean).slice(0, n).join(' ');
  let P, EDIT, SP, DUR, lines, markOf, SCENES, ITEMS, itemAt, sceneOf, MOMENTS, OUTS;
  function model() {
    P = L.parsed; EDIT = P.edit; SP = RS.spans(EDIT); DUR = L.duration;
    lines = String(L.src).split('\n');
    markOf = new Map(P.marks.map(m => [m.obj, m]));
    SCENES = EDIT.scenes.map((sc, i) => ({
      sc, i, ln: markOf.get(sc).ln, start: SP[i].start, end: SP[i].end,
      what: sc.query || sc.name || sc.caption || sc.line || '',
    }));
    ITEMS = []; itemAt = new Map();
    SCENES.forEach(S => (S.sc.items || []).forEach((it, k) => {
      const r = { obj: it, S, k, ln: markOf.get(it).ln, start: SP[S.i].items[k].start, end: SP[S.i].items[k].end };
      ITEMS.push(r); itemAt.set(it, r);
    }));
    sceneOf = new Map(SCENES.map(S => [S.sc, S]));
    // Moments: every @ time. A beat has its own @ line; a stat or an award leads its words with one.
    MOMENTS = [];
    P.marks.filter(m => m.kind === 'beat').forEach(m => {
      const own = m.owner === m.scene ? sceneOf.get(m.scene) : itemAt.get(m.owner);
      const b = m.obj, file = (b.video || b.img || '').replace(/^\.\//, '');
      const said = b.caption || b.lead || (b.line || b.lines || b.quote || [])[0] || '';
      MOMENTS.push({ ln: m.ln, own, S: own.S || own, at: b.at, len: own.end - own.start, kind: b.video ? 'clip' : b.img ? 'picture' : 'quote',
        gist: file || said, label: file ? file.replace(/\.[a-z0-9]+$/i, '') : words(said, 4) });
    });
    P.fields.forEach(f => {
      if (f.key !== 'stat' && f.key !== 'award') return;
      const S = sceneOf.get(f.owner), v = S && f.owner[f.jsonKey][f.index];
      if (!v || v.at == null) return;
      const stat = f.key === 'stat';
      MOMENTS.push({ ln: f.ln, own: S, S, at: v.at, len: S.end - S.start, kind: f.key, field: true,
        gist: stat ? `stat ${v.n} ${v.label}` : `award ${v.yr} ${v.text}`, label: stat ? `${v.n} ${words(v.label, 2)}` : `${v.yr} ${words(v.text, 2)}` });
    });
    OUTS = SCENES.filter(S => RS.cueNames(S.sc.type).includes('out'))
      .map(S => ({ S, out: RS.cue(S.sc, 'out'), set: !!(S.sc.cues && S.sc.cues.out != null) }));
  }
  model();

  // ── geometry ──────────────────────────────────────────────────────────
  // One rhythm, top to bottom: the ruler, the scene cards (a head of words, then the works, two
  // rows of moments and the out handles in the card's body), a hairline, the two fish lanes. A
  // narrow column of icons on the left names each track; the status bar runs under all of it.
  const GUT = 34, STATUS = 38;             // the icon column's width; the status bar's height
  // card: its top; head: its words; works: the works row; m0/m1: the moments' rows; body: under
  // the head's rule, where the out hatch runs; outRow: the out handles' band, to the card's foot
  const Y = { ruler: 0, rulerH: 22, card: 26, cardH: 118, head: 33, works: 60, m0: 82, m1: 102, outRow: 124, fish: 150, laneH: 20, laneGap: 4 };
  Y.body = Y.card + Y.head; Y.bodyH = Y.card + Y.cardH - Y.body; Y.sep = Y.card + Y.cardH + 3;
  const FISH_END = Y.fish + 2 * Y.laneH + Y.laneGap;
  // the music, under the fish: a hairline, a head of sections, then (open) a lane per part, each as
  // tall as what it plays needs (a drum's ticks, a tune's range), a gap, and the sound effects'
  // cues. The panel is as tall as what it shows (panelH, below).
  const MUS = { gap: 10, head: 20, sep: 8 };
  const LANE = { drum: 14, pitch: [18, 30], cues: 28 };
  Y.mus = FISH_END + MUS.gap; Y.musLanes = Y.mus + MUS.head + 4;
  const BOTTOM = 12;                       // under the last lane: room for the view's scrollbar
  const PIN = 22, GAP = 24, MAX_PXS = 360;  // a moment's hit box; the room it needs from the next; the deepest zoom (px a second)
  const SLIM = 760, INSP = 420;            // a panel narrower than SLIM is slim; the inspector's width in a wide one

  // ── style: the site's tokens, never text dimmed with alpha ────────────
  const css = document.createElement('style');
  css.textContent = `
#reel-tl { position: fixed; left: 0; right: 0; height: 248px; z-index: 50; box-sizing: border-box;
  background: rgba(var(--surface-rgb), 0.96); border-top: 1px solid rgba(var(--cyan-dim-rgb), 0.3);
  font: 500 11px/1 var(--font-mono); color: var(--ink-quiet); letter-spacing: 0.02em; user-select: none; -webkit-user-select: none; }
#reel-tl[hidden], #reel-tl [hidden] { display: none !important; }
#reel-tl * { box-sizing: border-box; }
#reel-tl .tl-main { position: absolute; left: 0; top: 0; bottom: 0; right: 0; }
#reel-tl.tl-insp .tl-main { right: var(--tl-iw, ${INSP}px); }
/* the tracks' icons: one per row band, the name in the tooltip */
#reel-tl .tl-gut { position: absolute; left: 0; top: 0; width: ${GUT}px; bottom: ${STATUS}px; border-right: 1px solid rgba(var(--cyan-dim-rgb), 0.15); overflow: hidden; }
#reel-tl .tl-gin { position: absolute; left: 0; top: 0; width: ${GUT}px; height: 100%; will-change: transform; }
#reel-tl .tl-gi.tl-fix { z-index: 2; background: rgb(var(--surface-rgb)); }
#reel-tl .tl-gi { position: absolute; left: 0; width: ${GUT}px; display: flex; align-items: center; justify-content: center; color: var(--ink-faint); cursor: help; }
#reel-tl .tl-gi .ri { width: 14px; height: 14px; }
#reel-tl .tl-gi:hover { color: var(--cyan); }
#reel-tl .tl-view { position: absolute; left: ${GUT}px; right: 0; top: 0; bottom: ${STATUS}px; overflow-x: auto; overflow-y: hidden; overscroll-behavior: contain;
  scrollbar-width: thin; scrollbar-color: rgba(var(--cyan-dim-rgb), 0.45) transparent; }
#reel-tl .tl-view::-webkit-scrollbar { height: 8px; }
#reel-tl .tl-view::-webkit-scrollbar-thumb { background: rgba(var(--cyan-dim-rgb), 0.45); border-radius: 4px; }
#reel-tl .tl-lane { position: relative; height: 100%; min-width: 100%; }
/* too tall for the window: the lanes scroll up and down under a ruler that stays (Shift + wheel: across) */
#reel-tl.tl-vs .tl-view { overflow-y: auto; }
#reel-tl.tl-vs .tl-ruler { background-color: rgb(var(--surface-rgb)); z-index: 7; }
#reel-tl .tl-ruler { position: absolute; left: 0; right: 0; top: ${Y.ruler}px; height: ${Y.rulerH}px; cursor: col-resize;
  border-bottom: 1px solid rgba(var(--cyan-dim-rgb), 0.3);
  background-image: linear-gradient(to right, rgba(var(--cyan-dim-rgb), 0.35) 1px, transparent 1px);
  background-repeat: repeat-x; background-position: 0 100%; background-size: 10px 4px; }
#reel-tl .tl-tick { position: absolute; bottom: 0; height: 11px; border-left: 1px solid rgba(var(--cyan-dim-rgb), 0.6); padding: 0 0 0 4px; color: var(--ink-faint); pointer-events: none; font-size: 10px; line-height: 10px; }
/* a hairline between the cards and the fish lanes */
#reel-tl .tl-sep { position: absolute; left: 0; right: 0; top: ${Y.sep}px; border-top: 1px solid rgba(var(--cyan-dim-rgb), 0.15); pointer-events: none; }
#reel-tl .tl-blk { position: absolute; border: 1px solid rgba(var(--cyan-dim-rgb), 0.35); background: rgba(var(--cyan-dim-rgb), 0.06); border-radius: 5px;
  overflow: hidden; white-space: nowrap; cursor: pointer; transition: border-color 0.2s, background 0.2s; }
#reel-tl .tl-blk:hover { background: rgba(var(--cyan-dim-rgb), 0.11); }
#reel-tl .tl-sc { top: ${Y.card}px; height: ${Y.cardH}px; padding: 5px 8px 0; }
#reel-tl .tl-sc b, #reel-tl .tl-sc i { will-change: transform; }
#reel-tl .tl-sc b { display: block; font: 400 13px/1.15 var(--font-display); color: var(--text-bright); overflow: hidden; text-overflow: ellipsis; letter-spacing: 0.01em; }
#reel-tl .tl-sc i { display: block; font-style: normal; font-size: 10px; line-height: 12px; color: var(--ink-faint); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; }
#reel-tl .tl-sc::after { content: ''; position: absolute; left: 0; right: 0; top: ${Y.head - 1}px; border-top: 1px dashed rgba(var(--cyan-dim-rgb), 0.2); pointer-events: none; }
#reel-tl .tl-sc.tl-cur { border-bottom: 2px solid var(--gold); }
#reel-tl .tl-sc.tl-sel { border-color: var(--gold); background: rgba(var(--gold-rgb), 0.07); }
#reel-tl .tl-sc.tl-sel b { color: var(--gold); }
#reel-tl .tl-it { top: ${Y.works}px; height: 20px; padding: 0 16px 0 6px; line-height: 18px; font-size: 10px; color: var(--ink-quiet); text-overflow: ellipsis; z-index: 2; background: rgba(var(--cyan-dim-rgb), 0.12); }
#reel-tl .tl-grip { position: absolute; right: -1px; top: 0; bottom: 0; width: 12px; cursor: ew-resize; z-index: 1; }
#reel-tl .tl-sc .tl-grip { bottom: ${Y.card + Y.cardH - Y.outRow}px; }   /* above the out row, so the two never overlap */
#reel-tl .tl-grip::after { content: ''; position: absolute; right: 3px; top: 22%; bottom: 22%; width: 3px; border-radius: 2px; background: rgba(var(--cyan-dim-rgb), 0.35); transition: background 0.15s; }
#reel-tl .tl-blk:hover .tl-grip::after { background: rgba(var(--cyan-dim-rgb), 0.7); }
#reel-tl .tl-grip:hover::after, #reel-tl .tl-grip.tl-on::after { background: var(--gold); }
/* the out hatch: part of its card, from the cue to the card's end */
#reel-tl .tl-otz { position: absolute; top: ${Y.body}px; height: ${Y.bodyH}px; pointer-events: none; z-index: 1; border-radius: 0 0 4px 0; overflow: hidden;
  border-left: 1px solid rgba(var(--cyan-dim-rgb), 0.7);
  background: repeating-linear-gradient(135deg, rgba(var(--cyan-dim-rgb), 0.22) 0 2px, transparent 2px 7px); }
#reel-tl .tl-otz.tl-def { background: repeating-linear-gradient(135deg, rgba(var(--cyan-dim-rgb), 0.12) 0 2px, transparent 2px 7px); border-left-style: dashed; }
#reel-tl .tl-ot { position: absolute; top: ${Y.outRow}px; height: ${Y.card + Y.cardH - Y.outRow}px; width: 16px; margin-left: -8px; cursor: ew-resize; z-index: 3; }
#reel-tl .tl-ot::after { content: ''; position: absolute; left: 3px; bottom: 3px; width: 10px; height: 14px; border-radius: 3px;
  border: 1px solid var(--cyan); background: rgba(var(--surface-rgb), 0.95); }
#reel-tl .tl-ot.tl-def::after { border-color: var(--ink-faint); }
#reel-tl .tl-ot:hover::after, #reel-tl .tl-ot.tl-on::after { border-color: var(--gold); background: rgba(var(--gold-rgb), 0.25); }
/* a moment: a ${PIN}px target, its mark, and its name when there is room */
#reel-tl .tl-bt { position: absolute; width: ${PIN}px; height: 20px; margin-left: -${PIN / 2}px; cursor: ew-resize; z-index: 4; }
#reel-tl .tl-bt::before { content: ''; position: absolute; left: ${PIN / 2 - 5}px; top: 5px; width: 10px; height: 10px; transform: rotate(45deg); background: var(--cyan); }
#reel-tl .tl-bt.tl-f::before { transform: none; border-radius: 50%; }
#reel-tl .tl-bt.tl-quote::before { transform: none; border-radius: 2px; }
#reel-tl .tl-bt:hover::before, #reel-tl .tl-bt.tl-on::before { background: var(--gold); }
#reel-tl .tl-lb { position: absolute; left: ${PIN - 4}px; top: 4px; font-size: 10px; line-height: 12px; color: var(--ink-quiet); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; pointer-events: none; }
#reel-tl .tl-bt:hover .tl-lb, #reel-tl .tl-bt.tl-on .tl-lb { color: var(--gold); }
/* the fish lanes: spans of one state each, and a mark per fish line */
#reel-tl .tl-fl { position: absolute; height: ${Y.laneH}px; border-radius: 4px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; cursor: pointer;
  padding: 0 6px; font: 500 10px/${Y.laneH - 2}px var(--font-mono); color: var(--ink-quiet); border: 1px solid transparent; }
#reel-tl .tl-fl-auto { background: rgba(var(--cyan-dim-rgb), 0.11); border-color: rgba(var(--cyan-dim-rgb), 0.28); }
#reel-tl .tl-fl-set { background: rgba(var(--gold-rgb), 0.12); border-color: rgba(var(--gold-rgb), 0.5); color: var(--text-bright); }
#reel-tl .tl-fl-free { background: repeating-linear-gradient(135deg, rgba(var(--cyan-dim-rgb), 0.14) 0 2px, transparent 2px 6px); }
#reel-tl .tl-fl-no { color: var(--ink-faint); border: 1px dashed rgba(var(--cyan-dim-rgb), 0.18); }
#reel-tl .tl-fl:hover { border-color: var(--gold); }
#reel-tl .tl-fm { position: absolute; width: ${Y.laneH}px; height: ${Y.laneH}px; margin-left: -${Y.laneH / 2}px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
  background: rgb(var(--surface-rgb)); border: 1px solid var(--gold); color: var(--gold); cursor: ew-resize; z-index: 4; }
#reel-tl .tl-fm .ri { width: 12px; height: 12px; }
#reel-tl .tl-fm:hover, #reel-tl .tl-fm.tl-on { background: rgba(var(--gold-rgb), 0.25); }
#reel-tl .tl-fm.tl-sel { background: var(--gold); color: rgb(var(--surface-rgb)); box-shadow: 0 0 0 3px rgba(var(--gold-rgb), 0.3); }
#reel-tl .tl-ph { position: absolute; left: 0; top: ${Y.ruler}px; height: ${FISH_END - Y.ruler}px; width: 1px; background: var(--gold); pointer-events: none; will-change: transform; z-index: 5; }
#reel-tl .tl-ph::before { content: ''; position: absolute; left: -4px; top: 0; border: 4.5px solid transparent; border-top: 6px solid var(--gold); }
#reel-tl .tl-ro-out { position: absolute; top: ${Y.card + 4}px; padding: 4px 7px; border: 1px solid rgba(var(--gold-rgb), 0.6); border-radius: 4px; background: rgba(var(--surface-rgb), 0.96);
  color: var(--text-bright); pointer-events: none; white-space: nowrap; z-index: 6; }
#reel-tl .tl-ro-out[hidden] { display: none; }
/* the music: a head of sections, a lane per part (what it plays, note for note), the cues */
#reel-tl .tl-msep { position: absolute; left: 0; right: 0; top: ${Y.mus - MUS.gap / 2}px; border-top: 1px solid rgba(var(--cyan-dim-rgb), 0.15); pointer-events: none; }
#reel-tl .tl-mh { position: absolute; top: ${Y.mus}px; height: ${MUS.head}px; padding: 0 6px; border-radius: 4px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; cursor: pointer;
  font: 500 10px/${MUS.head - 2}px var(--font-mono); color: var(--ink-quiet); background: rgba(var(--cyan-dim-rgb), 0.06); border: 1px solid rgba(var(--cyan-dim-rgb), 0.22); }
#reel-tl .tl-mh:hover { border-color: var(--gold); }
#reel-tl .tl-mh.tl-cur { border-color: rgba(var(--gold-rgb), 0.75); color: var(--text-bright); }
#reel-tl .tl-mh.tl-none { cursor: default; color: var(--ink-faint); }
/* a part in a section: a stretch to click, its notes showing through; hovered, its level on the right when not 1 */
#reel-tl .tl-mc { position: absolute; padding: 0 5px; border-radius: 3px; overflow: hidden; white-space: nowrap; cursor: pointer; text-align: right; z-index: 1;
  font: 500 9px/1 var(--font-mono); color: transparent; border: 1px dashed transparent; }
#reel-tl .tl-mc:hover { border-color: rgba(var(--gold-rgb), 0.8); color: var(--text-bright); text-shadow: 0 0 3px rgb(var(--surface-rgb)), 0 0 3px rgb(var(--surface-rgb)); }
#reel-tl .tl-mc.tl-on:hover { border-style: solid; }
#reel-tl .tl-mc.tl-lv { cursor: ns-resize; border: 1px solid var(--gold); color: var(--gold); }
/* a lane's name, kept at the left of the view */
#reel-tl .tl-mlb { position: absolute; height: 13px; padding: 0 4px; border-radius: 3px; white-space: nowrap; z-index: 3; cursor: help;
  font: 500 9px/11px var(--font-mono); color: var(--text-bright); background: rgba(var(--surface-rgb), 0.88); border: 1px solid var(--c); }
#reel-tl .tl-mlb.tl-mute { color: var(--ink-faint); border-style: dashed; }
/* the notes: the level behind, faint; the notes in four strengths; a seam's own in gold */
#reel-tl svg.tl-mroll { position: absolute; left: 0; overflow: visible; pointer-events: none; }
#reel-tl svg.tl-mroll .tl-lva { fill: var(--c); fill-opacity: 0.09; stroke: none; }
#reel-tl svg.tl-mroll .tl-n { fill: var(--c); stroke: none; }
#reel-tl svg.tl-mroll .tl-n1 { fill-opacity: 0.3; }
#reel-tl svg.tl-mroll .tl-n2 { fill-opacity: 0.55; }
#reel-tl svg.tl-mroll .tl-n3 { fill-opacity: 0.8; }
#reel-tl svg.tl-mroll .tl-own { fill: var(--gold); }
#reel-tl svg.tl-mroll.tl-mute { opacity: 0.3; }
/* the cues: a tick a key, the Enter, the question while it stands on the bar, the select-all
   that clears it; a dot for each pop */
#reel-tl .tl-mq { position: absolute; height: 13px; padding: 0 4px 0 9px; border-radius: 3px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; cursor: pointer;
  font: 500 9.5px/11px var(--font-mono); color: var(--ink-quiet); background: rgba(var(--cyan-dim-rgb), 0.07); border: 1px solid rgba(var(--cyan-dim-rgb), 0.25); }
#reel-tl .tl-mq:hover { border-color: var(--gold); color: var(--text-bright); }
#reel-tl .tl-mkt { position: absolute; width: 1px; height: 11px; background: var(--c); pointer-events: none; }
#reel-tl .tl-mke, #reel-tl .tl-mks { position: absolute; width: 13px; height: 13px; margin-left: -6.5px; color: var(--c); z-index: 2; pointer-events: none; display: flex;
  background: rgb(var(--surface-rgb)); border-radius: 3px; }
#reel-tl .tl-mke .ri, #reel-tl .tl-mks .ri { width: 13px; height: 13px; }
#reel-tl .tl-mpd { position: absolute; width: 9px; height: 9px; margin-left: -4.5px; border-radius: 50%; background: var(--c); cursor: pointer; z-index: 2; }
#reel-tl .tl-mpd:hover { background: var(--gold); }
#reel-tl .tl-mq.tl-mute, #reel-tl .tl-mkt.tl-mute, #reel-tl .tl-mke.tl-mute, #reel-tl .tl-mks.tl-mute, #reel-tl .tl-mpd.tl-mute { opacity: 0.3; }
/* the music as one piece: the bars under it, the chords on them, where the picture cuts, a chip on
   every seam (how the music crosses it), the seam's stretch */
#reel-tl .tl-mbars { position: absolute; left: 0; top: ${Y.mus}px; pointer-events: none;
  background-image: linear-gradient(to right, rgba(var(--cyan-dim-rgb), 0.12) 1px, transparent 1px); background-repeat: repeat-x; background-position: 0 0; }
#reel-tl .tl-mch { position: absolute; top: ${Y.mus + 1}px; height: ${MUS.head - 2}px; padding: 0 6px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; pointer-events: none; z-index: 1;
  font: 500 10px/${MUS.head - 2}px var(--font-mono); color: var(--ink-quiet); border-left: 1px solid rgba(var(--cyan-dim-rgb), 0.25); }
#reel-tl .tl-mch.tl-first { border-left: 0; padding-left: 12px; }   /* clear of the seam's chip (the generic icon-button rule is out-ranked above: 18 px, not 28) */
#reel-tl .tl-mcut { position: absolute; top: ${Y.mus - 4}px; height: ${MUS.head + 8}px; width: 7px; margin-left: -3px; z-index: 3; cursor: help; }
#reel-tl .tl-mcut::before { content: ''; position: absolute; left: 3px; top: 0; bottom: 0; border-left: 1px dashed var(--ink-quiet); }
#reel-tl .tl-lane .tl-mcontent button.tl-mseam { position: absolute; top: ${Y.mus + 1}px; width: 18px; height: 18px; min-width: 0; margin-left: -9px; padding: 0; border-radius: 50%; z-index: 4;
  display: flex; align-items: center; justify-content: center; background: rgb(var(--surface-rgb)); border: 1px solid rgba(var(--gold-rgb), 0.75); color: var(--gold); }
#reel-tl .tl-lane .tl-mcontent button.tl-mseam.tl-def { border-color: rgba(var(--cyan-dim-rgb), 0.55); color: var(--ink-quiet); }
#reel-tl .tl-lane .tl-mcontent button.tl-mseam .ri { width: 11px; height: 11px; }
#reel-tl .tl-mwin { position: absolute; top: ${Y.musLanes - 2}px; pointer-events: none; border-radius: 3px;
  background: linear-gradient(to right, transparent, rgba(var(--gold-rgb), 0.1), transparent); }
#reel-tl .tl-mwin.swell, #reel-tl .tl-mwin.build, #reel-tl .tl-mwin.drop { background: linear-gradient(to right, transparent, rgba(var(--gold-rgb), 0.13)); }
#reel-tl .tl-mms { position: absolute; left: 0; width: ${GUT}px; display: flex; align-items: center; gap: 2px; padding: 0 2px 0 5px; }
#reel-tl .tl-mms::before { content: ''; position: absolute; left: 1px; top: 2px; bottom: 2px; width: 2px; border-radius: 1px; background: var(--c); }
#reel-tl .tl-mms button { flex: 1; height: 12px; min-width: 0; padding: 0; border-radius: 3px; font: 600 9px/1 var(--font-mono);
  background: transparent; color: var(--ink-faint); border: 1px solid rgba(var(--cyan-dim-rgb), 0.3); }
#reel-tl .tl-mms button.tl-on { background: var(--gold); border-color: var(--gold); color: rgb(var(--surface-rgb)); }
#reel-tl button.tl-mtog { position: absolute; left: 3px; width: ${GUT - 6}px; height: ${MUS.head}px; min-width: 0; padding: 0; display: flex; align-items: center; justify-content: center; gap: 0; }
#reel-tl button.tl-mtog .ri { width: 12px; height: 12px; }
/* the status bar: one row under everything, its own rule above it */
#reel-tl .tl-status { position: absolute; left: 0; right: 0; bottom: 0; height: ${STATUS}px; padding: 0 8px 0 12px; display: flex; align-items: center; gap: 8px; white-space: nowrap;
  border-top: 1px solid rgba(var(--cyan-dim-rgb), 0.18); }
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
#reel-tl .tl-insp-col { position: absolute; right: 0; top: 0; bottom: 0; width: var(--tl-iw, ${INSP}px); overflow-y: auto; border-left: 1px solid rgba(var(--cyan-dim-rgb), 0.3);
  padding: 8px 12px 12px; user-select: text; -webkit-user-select: text; scrollbar-width: thin; }
/* A narrow panel: under ${SLIM}px the inspector opens over the whole panel, a page of its own
   with its own close */
#reel-tl.tl-slim.tl-insp .tl-main { right: 0; }
#reel-tl.tl-slim .tl-insp-col { z-index: 8; border-left: 0; background: rgba(var(--surface-rgb), 0.99); }
#reel-tl .tl-insp-col[hidden] { display: none; }
#reel-tl .tl-ih { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
#reel-tl .tl-ih h3 { margin: 0; font: 400 15px/1.2 var(--font-display); color: var(--gold); flex: 1; }
#reel-tl .tl-insp-col .tl-grp { margin: 8px 0 2px; padding-top: 6px; border-top: 1px solid rgba(var(--cyan-dim-rgb), 0.2); color: var(--cyan); display: flex; align-items: center; gap: 8px; }
#reel-tl .tl-row { display: grid; grid-template-columns: 56px 1fr; align-items: center; gap: 8px; margin: 2px 0; border-radius: 4px; transition: background 0.6s; }
#reel-tl .tl-row.tl-cues { grid-template-columns: 56px repeat(3, 1fr); }
#reel-tl .tl-hl, #reel-tl .tl-insp-col .tl-grp.tl-hl { background: rgba(var(--gold-rgb), 0.16); transition: none; }
#reel-tl .tl-row label, #reel-tl .tl-insp-col .tl-grp label, #reel-tl .tl-cue label { color: var(--ink-faint); }
#reel-tl .tl-cue { display: flex; align-items: center; gap: 5px; }
#reel-tl .tl-cue input { width: 100%; min-width: 0; }
#reel-tl input { font: 500 11px/1.3 var(--font-mono); color: var(--text-bright); background: rgba(var(--cyan-dim-rgb), 0.06); border: 1px solid rgba(var(--cyan-dim-rgb), 0.25);
  border-radius: 4px; padding: 3px 6px; width: 100%; outline: none; }
#reel-tl input[type=number] { width: 72px; }
#reel-tl .tl-cue input[type=number] { width: 100%; }
#reel-tl input:focus { border-color: var(--gold); }
#reel-tl input::placeholder { color: var(--ink-faint); }
#reel-tl .tl-flag { color: var(--ink-quiet); }
#reel-tl button.tl-fline { justify-content: flex-start; width: 100%; color: var(--text-bright); border-color: rgba(var(--gold-rgb), 0.45); overflow: hidden; }
#reel-tl button.tl-fline .rl { overflow: hidden; text-overflow: ellipsis; }
#reel-tl .tl-mbox { display: grid; gap: 4px; min-width: 0; }
#reel-tl button.tl-mchip { display: grid; grid-template-columns: 64px minmax(0, 1fr) auto; align-items: center; gap: 10px; height: 44px; padding: 3px 10px 3px 3px; text-align: left; }
#reel-tl .tl-mth { width: 64px; height: 36px; border-radius: 4px; background: #000 center / cover no-repeat; display: flex; align-items: center; justify-content: center; color: var(--ink-faint); }
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
  // the tracks' icons, each on its own band of the lane (its name and what it does in the tooltip)
  const gut = h('div', 'gut', main), gin = h('div', 'gin', gut);
  [['clock', Y.ruler, Y.rulerH, 'time: click or drag the ruler to move the playhead'],
   ['scenes', Y.card, Y.head, 'scenes: each scene is a card. Drag its right edge to change its length; click it to see its lines'],
   ['works', Y.works, 20, 'works: the results scene ("what has he shipped?") shows several works, one after another (Nanome, the AROC HUD, OpenProse…). Each block is one work: drag its right edge to change how long it shows, click it to see its lines'],
   ['moment', Y.m0, Y.outRow - Y.m0, 'moments: when something appears inside a scene: a picture, a clip, a quote, a stat, an award. Drag one to retime it; click it to see its line'],
   ['out', Y.outRow, Y.card + Y.cardH - Y.outRow, 'out: the hatched end of each card, where the scene\'s content starts to leave. Drag the handle at its foot'],
   ['fish', Y.fish, Y.laneH, 'the big fish: what it looks at and does across the cut, and its fish lines (gold marks). Click a span to direct it from there'],
   ['school', Y.fish + Y.laneH + Y.laneGap, Y.laneH, 'the school of four: what it swims under and does across the cut, and its fish lines (gold marks)']]
    .forEach(([icon, top, height, tip]) => {
      const g = h('div', icon === 'clock' ? 'gi fix' : 'gi', icon === 'clock' ? gut : gin); g.style.top = top + 'px'; g.style.height = height + 'px';
      g.title = tip; g.setAttribute('aria-label', tip.replace(/:.*$/, ''));
      g.innerHTML = window.REEL_UI ? REEL_UI.icon(icon) : '';
      g.dataset.track = icon;
    });
  const view = h('div', 'view', main);
  const lane = h('div', 'lane', view);
  const ruler = h('div', 'ruler', lane); ruler.title = 'click or drag to move the playhead';
  h('div', 'sep', lane);
  // The cards, items, moments, outs and fish lanes: drawn from the model, and drawn again (with
  // their handlers) after every change of script. Each is placed by layout() through `recs`.
  const content = h('div', 'content', lane);
  let recs = [], FISHM = [];                      // every placed thing: { el, span(map) → [t0, t1?] }; the fish lines' marks
  // the music's own (drawn again when the score changes, not the script): see "the music", below
  const mcontent = h('div', 'mcontent', lane), mgut = h('div', 'mgut', gin);
  let mrecs = [];
  // ── the fish lanes: what each fish does across the cut ────────────────
  // The rig's own account of it (REEL_LIVE.fish.track): spans of one state each, labelled with
  // what the fish looks at and how it idles, and a mark for every fish line at its time.
  const FISH_WHO = [['big', Y.fish], ['school', Y.fish + Y.laneH + Y.laneGap]];
  const FNAME = { big: 'the big fish', school: 'the school' };
  const inLane = (v, who) => v.verb === 'feed' || v.who === 'all' || v.who === who;   // food is for any fish
  const FICON = v => v.verb === 'to' ? 'place' : v.verb === 'look' ? (v.look === 'off' ? 'eyeOff' : v.look === 'auto' ? 'auto' : 'eye')
    : v.verb === 'idle' ? v.mode : v.verb === 'pace' ? (v.pace < 1 ? 'slow' : v.pace > 1 ? 'fast' : 'fish') : v.verb === 'feed' ? 'food' : v.verb;
  // a span's words: short in the lane, whole in its tooltip
  function spanWords(sp, who) {
    if (sp.absent) return ['', `${FNAME[who]} is not in the tank yet`];
    const pt = a => `(${a[0]}, ${a[1]})`;
    const look = sp.look === 'auto' ? sp.what : sp.look === 'point' ? 'a point ' + pt(sp.at) : sp.look === 'off' ? 'nothing' : '';
    const pace = sp.pace !== 1 ? ` · ${sp.pace}×` : '';
    if (sp.idle === 'wander') return [`wanders${pace}`, `${FNAME[who]} wanders: the fish engine's own swimming${pace ? ', at ' + sp.pace + '× its pace' : ''}`];
    // the reel's own choreography needs only its thing; a span a line decides says what it does too
    const short = !sp.set ? look : look ? `${look} · ${sp.idle}${sp.to ? ' ◎' : ''}${pace}` : sp.to ? `◎ ${sp.idle}${pace}` : '';
    const long = `${FNAME[who]} ${look ? `looks at ${look}${sp.look === 'auto' ? ' (what the scene shows)' : ''}` : 'has nothing to look at, so it swims freely'}, `
      + `${sp.idle}s${sp.to ? ` at its spot ${pt(sp.to)}` : sp.look === 'auto' ? ' beside it' : ''}${pace ? ', at ' + sp.pace + '× its pace' : ''}`
      + (sp.set ? '. A fish line decides this.' : '. The reel\'s own choreography.');
    return [short, long];
  }
  // the line the Fish panel has selected wears its colour here too
  const litFish = ln => FISHM.forEach(M => M.el.classList.toggle('tl-sel', M.F.ln === ln));
  addEventListener('reel-fish-select', e => litFish(e.detail && e.detail.ln));
  function populate() {
    content.textContent = ''; recs = []; FISHM = [];
    SCENES.forEach(S => {
      const el = h('div', 'blk sc', content); el.dataset.scene = S.i;
      S.nm = h('b', null, el, `${S.i + 1} ${S.sc.type}`); S.q = h('i', null, el, S.what || ' ');
      el.title = `${S.i + 1} ${S.sc.type} · ${S.sc.dur} s · ${fmt(S.start)} → ${fmt(S.end)}${S.what ? '\n' + S.what : ''}\nclick to change its words`;
      const g = h('div', 'grip', el); g.title = 'drag to change the scene\'s length';
      S.el = el; S.grip = g;
      recs.push({ el, span: m => [m(S.start), m(S.end)] });
      // a results scene cannot be shorter than its items (the list needs a moment first)
      const floor = (S.sc.items || []).reduce((a, it) => a + it.dur, 0);
      g.addEventListener('pointerdown', e => {
        let d = S.sc.dur;
        g.classList.add('tl-on');
        drag(e, g, (dt, ev) => {
          d = Math.max(floor ? n3(floor + snapOf(ev)) : snapOf(ev), snap(S.sc.dur + dt, ev));
          layout(ripple(S.end, d - S.sc.dur));
          show1(S.start + d, `${S.sc.type} ${S.sc.dur} → ${d} s · total ${fmt(DUR + d - S.sc.dur)}`);
        }, moved => {
          g.classList.remove('tl-on');
          if (moved && d !== S.sc.dur) commit(src => RS.setDur(src, S.ln, d)); else layout();
        });
      });
      el.addEventListener('pointerdown', e => {
        if (e.button !== 0) return;
        drag(e, el, () => {}, moved => { if (!moved) select(S.i); });
      });
    });
    OUTS.forEach(O => {
      const z = h('div', 'otz' + (O.set ? '' : ' def'), content); O.zone = z;
      const el = h('div', 'ot' + (O.set ? '' : ' def'), content); O.el = el;
      el.title = `${O.S.sc.type}: its content starts to leave ${O.out} s before the scene ends${O.set ? '' : ' (the default)'}. Drag to change`;
      recs.push({ el: z, span: m => [m(O.S.end) - (O.drag != null ? O.drag : O.out), m(O.S.end)] });
      recs.push({ el, span: m => [m(O.S.end) - (O.drag != null ? O.drag : O.out)] });
      el.addEventListener('pointerdown', e => {
        const len = O.S.sc.dur;
        el.classList.add('tl-on');
        drag(e, el, (dt, ev) => {
          O.drag = Math.min(len, Math.max(0, snap(O.out - dt, ev)));   // right is later, so a smaller out
          layout(still);
          show1(O.S.end - O.drag, `out ${O.out} → ${O.drag} s before the end`);
        }, moved => {
          el.classList.remove('tl-on');
          const v = O.drag; O.drag = null;
          if (!moved) { L.seek(O.S.end - O.out); select(O.S.i, true); point('cue:out'); layout(); }
          else if (v !== O.out) commit(src => RS.setCue(src, O.S.ln, 'out', v)); else layout();
        });
      });
    });
    ITEMS.forEach(I => {
      // named by its eyebrow's first words (Nanome, BadVR, OpenProse)
      const el = h('div', 'blk it', content, (I.obj.eyebrow || '').split(' · ')[0] || (I.obj.headline || []).join(' ') || 'work ' + (I.k + 1));
      el.title = `work ${I.k + 1} of the results · ${I.obj.dur} s · ${fmt(I.start)} → ${fmt(I.end)}\n${I.obj.eyebrow || ''}\nclick to see its lines; drag its right edge to change how long it shows`;
      const g = h('div', 'grip', el); g.title = 'drag to change how long this work shows';
      I.el = el; I.grip = g;
      recs.push({ el, span: m => [m(I.start), m(I.end)] });
      g.addEventListener('pointerdown', e => {
        let d = I.obj.dur;
        g.classList.add('tl-on');
        drag(e, g, (dt, ev) => {
          d = Math.max(snapOf(ev), snap(I.obj.dur + dt, ev));
          layout(ripple(I.end, d - I.obj.dur));
          show1(I.start + d, `work ${I.obj.dur} → ${d} s · scene ${n3(I.S.sc.dur + d - I.obj.dur)} s · total ${fmt(DUR + d - I.obj.dur)}`);
        }, moved => {
          g.classList.remove('tl-on');
          if (moved && d !== I.obj.dur) commit(itemDur(I, d)); else layout();
        });
      });
      el.addEventListener('pointerdown', e => {
        if (e.button !== 0) return;
        drag(e, el, () => {}, moved => { if (!moved) { select(I.S.i, true); L.seek(I.start); point(I.ln); } });
      });
    });
    MOMENTS.forEach(M => {
      const el = h('div', 'bt' + (M.field ? ' f' : M.kind === 'quote' ? ' quote' : ''), content); M.el = el;
      M.lb = h('span', 'lb', el, M.label);
      el.title = `@${M.at} · ${M.gist}\n${M.field ? M.kind : M.kind} ${fmt(M.own.start + M.at)} · drag to retime, click to open`;
      recs.push({ el, span: m => [m(M.own.start) + (M.drag != null ? M.drag : M.at)], moment: M });
      el.addEventListener('pointerdown', e => {
        const hi = Math.max(0, n3(M.len - 0.05));
        el.classList.add('tl-on');
        drag(e, el, (dt, ev) => {
          M.drag = Math.min(hi, Math.max(0, snap(M.at + dt, ev)));
          layout(still);
          show1(M.own.start + M.drag, `@${M.at} → @${M.drag}  (${fmt(M.own.start + M.drag)})`);
        }, moved => {
          el.classList.remove('tl-on');
          const v = M.drag; M.drag = null;
          if (!moved) { L.seek(M.own.start + M.at); select(M.S.i, true); point(M.ln); layout(); }
          else if (v !== M.at) commit(src => RS.setAt(src, M.ln, v)); else layout();
        });
      });
    });
    const FISHL = P.fields.filter(f => f.key === 'fish' && sceneOf.get(f.owner)).map(f => ({ ln: f.ln, v: f.owner.fish[f.index], S: sceneOf.get(f.owner) }));
    FISH_WHO.forEach(([who, y]) => {
      (L.fish && L.fish.track ? L.fish.track(who) : []).forEach(sp => {
        const el = h('div', 'fl ' + (sp.absent ? 'fl-no' : sp.set ? 'fl-set' : sp.look === 'none' ? 'fl-free' : 'fl-auto'), content);
        const [short, long] = spanWords(sp, who);
        el.textContent = short; el.style.top = y + 'px'; el.dataset.who = who;
        el.title = `${fmt(sp.t0)} → ${fmt(sp.t1)} · ${long}\nclick to direct ${FNAME[who]} from here`;
        recs.push({ el, span: m => [m(sp.t0), m(sp.t1)] });
        el.addEventListener('pointerdown', e => {
          if (e.button !== 0) return;
          const t = Math.max(0, Math.min(DUR, (e.clientX - lane.getBoundingClientRect().left) / pxs));
          drag(e, el, () => {}, moved => { if (moved) return; L.seek(t); if (window.REEL_FISH) window.REEL_FISH.show(who); });
        });
      });
      const seen = new Map();                     // lines at the same moment stand side by side
      FISHL.filter(F => inLane(F.v, who)).forEach(F => {
        const k = (F.S.start + F.v.at).toFixed(3), n = seen.get(k) || 0; seen.set(k, n + 1);
        const el = h('div', 'fm', content); el.dataset.ln = F.ln; el.dataset.who = who;
        el.innerHTML = window.REEL_UI ? REEL_UI.icon(FICON(F.v)) : '•';
        el.style.top = y + 'px'; el.style.marginLeft = (-Y.laneH / 2 + n * 16) + 'px';
        el.title = `fish ${RS.writeFish(F.v)} (line ${F.ln}) · ${fmt(F.S.start + F.v.at)}\ndrag to retime it; click to edit it in the Fish panel`;
        const M = { el, F };
        FISHM.push(M);
        recs.push({ el, span: m => [m(F.S.start) + (F.drag != null ? F.drag : F.v.at)] });
        el.addEventListener('pointerdown', e => {
          if (e.button !== 0) return;
          const hi = Math.max(0, n3(F.S.sc.dur - 0.05));
          el.classList.add('tl-on');
          drag(e, el, (dt, ev) => {
            F.drag = Math.min(hi, Math.max(0, snap(F.v.at + dt, ev)));
            layout(still);
            show1(F.S.start + F.drag, `fish @${F.v.at} → @${F.drag}  (${fmt(F.S.start + F.drag)})`);
          }, moved => {
            el.classList.remove('tl-on');
            const v = F.drag; F.drag = null;
            if (!moved) {                           // a click: edit the line in the Fish panel
              L.seek(F.S.start + F.v.at);
              if (window.REEL_FISH) window.REEL_FISH.select(F.ln); else { select(F.S.i, true); point(F.ln); }
              layout();
            } else if (v !== F.v.at) commit(src => RS.setAt(src, F.ln, v)); else layout();
          });
        });
      });
    });
    if (window.REEL_FISH && window.REEL_FISH.selected) litFish(window.REEL_FISH.selected);   // the panel may have loaded first
  }
  populate();
  const ph = h('div', 'ph', lane);
  const readout = h('div', 'ro-out', lane); readout.hidden = true;

  const status = h('div', 'status', main);
  const where = h('span', 'where', status);
  const err = h('span', 'err', status); err.setAttribute('role', 'status');
  h('span', 'gap', status);
  // where saves go: the file (dev server), the page's host (claude.ai), or a draft in this tab
  const home = (busy) => L.dev ? `Saving to ${L.file}${busy ? '…' : ''}` : L.host ? `Saving to ${L.host}${busy ? '…' : ''}`
    : busy ? 'Keeping a draft in this tab…' : 'Draft in this tab: no dev server';
  // a version kept here or with the host (not the file) can be downloaded, or dropped for the file
  const dl = button(status, 'Download', 'save this version as ' + L.file.replace(/^.*\//, ''), 'download', null, 'download');
  dl.onclick = () => L.download(L.src);
  // (Discard for a draft in this tab; Revert for the version saved with the host)
  const ds = button(status, 'Discard', 'drop the draft and play the file again', 'discard', null, 'discard');
  ds.onclick = () => { put(K_UNDO, []); put(K_REDO, []); L.discardDraft(); };
  function dress(rev) {
    if (ds.dataset.mode === (rev ? 'revert' : 'discard')) return;
    ds.dataset.mode = rev ? 'revert' : 'discard';
    const label = rev ? 'Revert' : 'Discard', title = rev ? `drop the version saved on ${L.host} and play the file again` : 'drop the draft and play the file again';
    if (!window.REEL_UI) { ds.textContent = label; ds.title = title; return; }
    REEL_UI.relabel(ds, label, title);
    const svg = ds.querySelector('svg'); if (svg) svg.outerHTML = REEL_UI.icon(rev ? 'revert' : 'discard');
  }
  const edit = h('div', 'grp', status);
  const bUndo = button(edit, 'Undo', 'undo the last change (⌘Z / Ctrl+Z)', 'undo', null, 'undo');
  const bRedo = button(edit, 'Redo', 'redo it (⇧⌘Z / Ctrl+Shift+Z)', 'redo', null, 'redo');
  const zoom = h('div', 'grp', status);
  const bOut = button(zoom, '', 'zoom out (-)', 'zoom-out', null, 'zoomOut'); bOut.setAttribute('aria-label', 'zoom out');
  const zr = h('span', 'zr', zoom, 'fit');
  const bIn = button(zoom, '', 'zoom in (=), or Ctrl/⌘ + wheel, or pinch', 'zoom-in', null, 'zoomIn'); bIn.setAttribute('aria-label', 'zoom in');
  const bFit = button(zoom, 'Fit', 'the whole reel in view (0)', 'fit', null, 'fit');
  const note = h('span', 'note', status);
  const bEx = button(status, 'Export video', 'make the video from this edit (X)', 'export', 'go', 'export');
  const close = button(status, '', 'close the timeline (E)', 'close', 'x', 'close'); close.setAttribute('aria-label', 'close the timeline');
  // the bar's words: where saves go (and whether one is on its way), the total and the warnings
  function refreshStatus(busy) {
    const kept = !L.dev && (L.draft || L.hosted);
    dl.hidden = ds.hidden = !kept; dress(L.hosted);
    where.textContent = home(busy) + (busy ? '' : !L.dev && L.draft ? ' (unsaved draft)' : L.hosted ? ' (your saved version)' : '');
    where.title = where.textContent;
    const warn = P.warnings.length;
    note.textContent = `total ${fmt(DUR)}${warn ? ` · ${warn} warning${warn > 1 ? 's' : ''}` : ''}`;
    note.title = warn ? P.warnings.join('\n') : '';
  }
  refreshStatus(false);
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
    lane.style.width = W + 'px'; lane.style.height = (musEnd() + BOTTOM) + 'px';
    ph.style.height = (musEnd() - Y.ruler) + 'px';
    const place = r => {
      const [a, b] = r.span(map);
      r.el.style.left = x(a).toFixed(1) + 'px';
      if (b != null) r.el.style.width = Math.max(4, x(b) - x(a) - 2).toFixed(1) + 'px';   // a 2 px gutter between blocks
    };
    recs.forEach(place); mrecs.forEach(place);
    if (!map.drag) drawMusic();
    placeMoments(map);
    if (!map.drag) { ticks(); if (t0 != null) scrollTo(t0 * pxs); }
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
    MLB.forEach(lb => { lb.style.left = (L0 + 4) + 'px'; });
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
  // The view follows the playhead while it plays (zoomed in), and after a jump. A scroll of yours
  // wins: the view stays where you put it until the playhead jumps, play starts again, or the
  // playhead comes back into view (it used to pull the view back under you, frame after frame).
  // The panel's own scrolls go through scrollTo, so a scroll it did not make is yours.
  let follow = true, placed = null, wasPlaying = false;
  function scrollTo(left) { left = Math.max(0, left); placed = left; view.scrollLeft = left; placed = view.scrollLeft; }
  function frame(t) {
    if (root.hidden) return;
    const tt = Math.max(0, Math.min(DUR, t));
    ph.style.transform = `translateX(${x(tt).toFixed(1)}px)`;
    let c = 0; SCENES.forEach(S => { if (t >= S.start - 1e-6) c = S.i; });
    if (c !== curScene) { if (SCENES[curScene]) SCENES[curScene].el.classList.remove('tl-cur'); SCENES[c].el.classList.add('tl-cur'); curScene = c; }
    let ms = -1; for (let i = 0; i < MHEADS.length; i++) if (t >= MHEADS[i].sc.start - 1e-6) ms = i;
    if (ms !== curSec) { if (MHEADS[curSec]) MHEADS[curSec].el.classList.remove('tl-cur'); if (MHEADS[ms]) MHEADS[ms].el.classList.add('tl-cur'); curSec = ms; }
    const jumped = lastT != null && Math.abs(tt - lastT) > 0.3; lastT = tt;
    const playing = !!(L.isPlaying && L.isPlaying()), p = x(tt) - view.scrollLeft, inView = p >= 0 && p <= VW - 24;
    if (jumped || inView || (playing && !wasPlaying)) follow = true;
    wasPlaying = playing;
    if (Z > 1.05 && !dragging && follow && (playing || jumped) && !inView) scrollTo(x(tt) - VW * 0.15);
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
    scrollTo(t * pxs - at);
    stick(); keepView();
  }
  bIn.onclick = () => zoomTo(Z * 1.6);
  bOut.onclick = () => zoomTo(Z / 1.6);
  bFit.onclick = () => zoomTo(1);
  view.addEventListener('wheel', e => {
    const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? VW : 1;
    if (e.ctrlKey || e.metaKey) { e.preventDefault(); zoomTo(Z * Math.exp(-e.deltaY * k * 0.0025), e.clientX - view.getBoundingClientRect().left); }
    else if (root.classList.contains('tl-vs') && Math.abs(e.deltaY) > Math.abs(e.deltaX)) return;   // up and down (Shift + wheel: across)
    else if (Z > 1.05 && Math.abs(e.deltaY) > Math.abs(e.deltaX)) { e.preventDefault(); follow = false; view.scrollLeft += e.deltaY * k; }
  }, { passive: false });
  let g0 = null;                                        // Safari's pinch
  view.addEventListener('gesturestart', e => { e.preventDefault(); g0 = Z; });
  view.addEventListener('gesturechange', e => { e.preventDefault(); if (g0 != null) zoomTo(g0 * e.scale, e.clientX - view.getBoundingClientRect().left); });
  view.addEventListener('gestureend', e => { e.preventDefault(); g0 = null; });
  let scrollT; view.addEventListener('scroll', () => {
    if (placed == null || Math.abs(view.scrollLeft - placed) > 2) follow = false;   // not where the panel put it: yours
    stick(); stickY(); clearTimeout(scrollT); scrollT = setTimeout(keepView, 200);
  });
  // a panel too tall for the window scrolls up and down: the ruler stays on top, and the icon
  // column moves with the lanes it names
  function stickY() {
    const y = view.scrollTop;
    gin.style.transform = y ? `translateY(${-y}px)` : '';
    ruler.style.transform = y ? `translateY(${y}px)` : '';
  }

  // the preview shrinks to fit above the panel (the rig keeps the bottom of the window for it)
  // and takes the whole window back when the panel shuts
  function fitStage() {
    const hud = document.getElementById('hud'), hh = hud && !hud.hidden ? hud.getBoundingClientRect().height : 0;
    root.style.bottom = Math.round(hh) + 'px';
    // as tall as what it shows; past what the window can spare (the preview keeps 200 px), the
    // lanes scroll up and down under the ruler
    const want = musEnd() + BOTTOM + STATUS, room = Math.max(240, Math.round(innerHeight - hh - 200)), pH = Math.min(want, room);
    root.style.height = pH + 'px';
    root.classList.toggle('tl-vs', want > room);
    if (want <= room && view.scrollTop) { view.scrollTop = 0; stickY(); }
    L.reserveBottom(hh + pH);
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
      const v = get(K_VIEW, null); if (v && v.left != null) scrollTo(v.left * pxs);
    } else L.reserveBottom(0);
  }
  close.onclick = () => show(false);
  addEventListener('resize', () => { if (!root.hidden) { fitStage(); layout(); } });

  // ── saving: every change is one new script text ───────────────────────
  // REEL_LIVE.save plays it at once (the panel redraws through onChange, below) and keeps it in
  // the background; the bar says "Saving…" until it is kept. Edits never wait for a save.
  let pending = 0;
  const stack = k => { const s = get(k, []); return Array.isArray(s) ? s : []; };
  const stacks = () => {
    const R = window.REEL_RACK;                    // the score's edits are on the one Undo too
    bUndo.disabled = !stack(K_UNDO).length && !(R && R.canUndo); bRedo.disabled = !stack(K_REDO).length && !(R && R.canRedo);
  };
  async function save(next, undo, redo) {
    const u0 = stack(K_UNDO), r0 = stack(K_REDO);
    try { RS.parse(next); } catch (e) { say(e.errors || [e.message]); layout(); return false; }   // never save a broken script
    say('');
    put(K_UNDO, undo.slice(-DEPTH)); put(K_REDO, redo.slice(-DEPTH));
    pending++; refreshStatus(true); stacks();
    let res;
    try { res = await L.save(next); } catch (e) { res = { ok: false, errors: [e.message] }; }
    pending--;
    if (!res || !res.applied) {                    // nothing changed: the stacks and the picture as they were
      put(K_UNDO, u0); put(K_REDO, r0);
      refreshStatus(pending > 0); stacks();
      say((res && res.errors) || ['the save failed']); layout();
      return false;
    }
    refreshStatus(pending > 0); stacks();
    if (!res.ok) say(res.errors || ['not saved']);   // played, but kept only as a draft here (it says why)
    return true;
  }
  // change the script with one helper call (or a chain of them); a helper that throws is shown
  function commit(change) {
    let next;
    try { next = change(L.src); } catch (e) { say(e.errors || [e.message]); layout(); return; }
    if (next === L.src) { layout(); return; }
    if (L.journal) L.journal.note('script');       // in the one history now, so a score edit just after comes after it
    save(next, stack(K_UNDO).concat([L.src]), []).then(ok => { if (!ok && L.journal) L.journal.drop('script'); });
  }
  function undo(back) {
    const from = stack(back ? K_UNDO : K_REDO), to = stack(back ? K_REDO : K_UNDO);
    if (!from.length) { say(back ? ['nothing to undo'] : ['nothing to redo']); return; }
    const prev = from.pop(); to.push(L.src);
    if (L.journal) L.journal.step('script', back);
    back ? save(prev, from, to) : save(prev, to, from);
  }
  // One Undo for every edit: the last one, the script's or the score's (REEL_LIVE.journal says
  // which; the synth rack keeps the score's texts and undoes its own)
  function undoAny(back) {
    const J = L.journal, R = window.REEL_RACK, kind = J ? J.peek(back) : null;
    if (kind === 'score' && R && (back ? R.canUndo : R.canRedo)) { say(''); back ? R.undo() : R.redo(); return; }
    if (kind === 'score' && J) J.step('score', back);   // the rack no longer holds it: let it go
    undo(back);
  }
  bUndo.onclick = () => undoAny(true);
  bRedo.onclick = () => undoAny(false);
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

  // Scrubbing holds the reel still under the pointer, like a video player, and it plays on from
  // where you let go. (Scrubbed while it played, the music started again at every step.)
  ruler.addEventListener('pointerdown', e => {
    const seek = ev => L.seek((ev.clientX - lane.getBoundingClientRect().left) / pxs);
    const was = L.isPlaying();
    if (was) L.setPlaying(false);
    seek(e);
    drag(e, ruler, (dt, ev) => seek(ev), () => { if (was && L.now() < L.duration - 0.05) L.setPlaying(true); });
    // a still press is a seek too, and drag() only calls move once the pointer travels
  });

  // ── the music: the score's arrangement on the same clock ──────────────
  // What the synth rack holds (REEL_RACK: the score's parse, its arrangement against the cut, the
  // mix) drawn under the fish lanes, and drawn again whenever the rack says it changed (a
  // reel-score event): the score, the cut, the mix. The music is one piece (ReelMusic.arrange): a
  // head shows each section where its music plays (on the bar line nearest the cut, a dashed line
  // where the picture cuts when the two differ), the chords on the bars, and a chip on every seam
  // saying how the music crosses it (click: the next way). Open, each part has a lane that shows
  // what it plays, note for note (until 2026-10-02 a lane was a row of blocks that only said a
  // part was playing): a drum's hits as ticks, taller when louder; a pitched part's notes at their
  // pitches, as long as they sound, fainter where its level is lower; and behind them, faintly,
  // its level across the cut, so where it plays and how it fades in and out is the lane's shape.
  // Under the parts, one lane of cues for the sound effects the edit plays itself: each question
  // the command bar types (a tick a key, its Enter, the question while it stands on the bar, the
  // select-all that clears it) and a dot for each pop on an @ moment.
  let musOpen = get(K_MUS, true), MB = [], MX = [], MHEADS = [], MLB = [], ROLLS = [], musSig = null, curSec = -1, BAR = 2, bars = null, musH = 0;
  const lanes = new Map();                           // a lane's name → its M and S, and what dims when it is silent
  const RK = () => window.REEL_RACK;
  const musEnd = () => musOpen && musH ? musH : Y.mus + MUS.head;
  const rgba = (hex, a) => { const n = parseInt(String(hex).slice(1), 16); return `rgba(${n >> 16 & 255}, ${n >> 8 & 255}, ${n & 255}, ${a})`; };
  const lvA = lv => (0.14 + 0.26 * Math.min(1, lv)).toFixed(3);   // a lit hit cell's strength: its level
  const ON = { key: 'every letter typed', space: 'every space typed', clear: 'the select-all that clears each question', enter: 'each Enter', beat: 'every @ moment', cut: 'every cut', item: 'each work' };
  // the ways the music crosses a seam, in the order a click on its chip goes through them
  const SEAMS = ['fade', 'swell', 'build', 'drop', 'cut'];
  const SEAM_ICON = { fade: 'xfade', swell: 'swell', build: 'build', drop: 'drop', cut: 'seamCut' };
  const seamWords = tr => {
    const n = tr.beats, b = `${n} beat${n === 1 ? '' : 's'}`;
    return { fade: `a crossfade across the seam (${b}): what leaves fades out as what arrives fades in`,
      swell: `a swell: what arrives comes in over the ${b} before it`,
      build: `a build: a fill on the clap over the ${b} before it, louder all the way in`,
      drop: `a drop: the drums and the bass rest for the ${b} before it`,
      cut: 'a cut: everything changes on it' }[tr.kind];
  };
  // A lane is as tall as what it plays needs: a drum's hits little, a tune its range of pitches.
  const NOTE = n => ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][((n % 12) + 12) % 12] + (Math.floor(n / 12) - 1);
  function laneShape(evs) {
    let lo = Infinity, hi = -Infinity;
    evs.forEach(e => { if (e.midi != null) { lo = Math.min(lo, e.midi); hi = Math.max(hi, e.midi); } });
    if (lo === Infinity) return { h: LANE.drum, pitched: false };
    return { h: Math.max(LANE.pitch[0], Math.min(LANE.pitch[1], 6 + (hi - lo + 1) * 2)), pitched: true, lo, hi };
  }
  // what a part plays, in words (its name's tooltip)
  function plays(t, shape) {
    const range = shape.pitched ? `, ${shape.lo === shape.hi ? NOTE(shape.lo) : NOTE(shape.lo) + ' to ' + NOTE(shape.hi)}` : '';
    if (t.type === 'drum') return t.steps ? `${t.name}: a ${t.kind} on the steps ${t.steps}, round every bar (a taller tick, a louder hit)` : `${t.name}: a ${t.kind}, once on each section's cut`;
    const m = t.play.mode, bars = +(((t.notes || []).length) / 16).toFixed(2);
    return `${t.name}: ` + ({ chord: 'the chord, held for its bar', root: `the chord's root on the steps ${t.steps}`, arp: `the chord's notes in turn (${t.play.dir}) on the steps ${t.steps}`,
      notes: `the tune, ${bars} bar${bars === 1 ? '' : 's'} round with the chords`, hit: 'the chord once, on each section\'s cut', rise: 'a sweep up into a seam' }[m] || m) + range;
  }
  // a cheap fingerprint of every note, so a knob that changes no note redraws nothing
  function noteHash(A, Pm) {
    const idx = new Map(Pm.score.tracks.map((t, i) => [t.name, i + 1]));
    let x = 2166136261;
    const mix = n => { x = Math.imul(x ^ (n | 0), 16777619); };
    for (const e of A.events) { mix(idx.get(e.track) || 0); mix(Math.round(e.t * 1000)); mix(Math.round(e.dur * 1000)); mix(e.midi || 0); mix(Math.round(e.vel * 1000)); mix(e.bypass ? 1 : e.rise ? 2 : 0); }
    return x >>> 0;
  }
  function musicSig() {
    const R = RK(), Pm = R && R.parsed, A = R && R.arrangement;
    if (!Pm || !A) return JSON.stringify([musOpen, R ? R.error || 'none' : 'wait']);
    return JSON.stringify([musOpen, Pm.score.tracks.map(t => [t.name, t.on || '', t.type === 'drum' ? t.kind + (t.steps || '') : t.play && t.play.mode + (t.steps || '') + (t.notes || []).length]),
      A.sections.map(sc => [sc.ref, sc.type, sc.cut, sc.start, sc.end, sc.play.map(p => p.name + ':' + p.level).join(' ')]),
      (A.harmony || []).map(x => x.chord.name + '@' + x.t).join(' '), (A.transitions || []).map(tr => [tr.ref, tr.kind, tr.beats, tr.set, tr.t0, tr.t1]),
      A.levels || {}, noteHash(A, Pm), RS.queries(EDIT).map(q => q.text), MOMENTS.map(M => M.label)]);
  }
  function populateMusic() {
    const R = RK(), Pm = R && R.parsed, A = R && R.arrangement;
    mcontent.textContent = ''; mgut.textContent = ''; mrecs = []; MHEADS = []; MLB = []; ROLLS = []; lanes.clear(); curSec = -1; musH = 0;
    h('div', 'msep', mcontent);
    bars = h('div', 'mbars', mcontent);                // the bars, faintly, under the whole music (sized in layout)
    const tog = h('button', 'mtog', mgut); tog.type = 'button'; tog.style.top = Y.mus + 'px';
    tog.innerHTML = window.REEL_UI ? REEL_UI.icon(musOpen ? 'chevDown' : 'chevRight') + REEL_UI.icon('music') : (musOpen ? '▾♪' : '▸♪');
    tog.title = musOpen ? 'the music: shut it to its sections' : 'the music: open it to every part, note for note, and the sound effects\' cues';
    tog.setAttribute('aria-expanded', String(musOpen)); tog.setAttribute('aria-label', 'the music\'s lanes');
    tog.onclick = () => setMusic(!musOpen);
    if (!Pm || !A) {
      MB = []; MX = [];
      const el = h('div', 'mh none', mcontent, !R ? 'the music is loading…' : R.error ? R.error.split('\n')[0] : `no ${R.name} next to this script: the reel is silent`);
      mrecs.push({ el, span: () => [0, DUR] });
      return;
    }
    const tracks = Pm.score.tracks;
    MB = tracks.filter(t => !t.on); MX = tracks.filter(t => t.on); BAR = A.bar || 2;
    // the head: a block per section where its music plays
    A.sections.forEach(sc => {
      const el = h('div', 'mh', mcontent); el.dataset.ref = sc.ref;
      const chords = sc.harmony.map(x => x.chord.name).filter((n, i, all) => !i || n !== all[i - 1]).join(' ');
      const off = Math.abs(sc.start - sc.cut) > 1e-6;
      el.title = `${sc.type} · its music ${fmt(sc.start)} → ${fmt(sc.end)}${off ? `, on the bar ${(Math.abs(sc.start - sc.cut)).toFixed(1)} s ${sc.start < sc.cut ? 'before' : 'after'} the picture cuts (${fmt(sc.cut)})` : ''} · ${chords}${sc.own ? ' (its own chords)' : ''}`
        + `\n${sc.play.length} playing: ${sc.play.map(p => p.name + (p.level !== 1 ? ' ' + p.level : '')).join(', ') || 'nothing'}\nclick to play from here`;
      mrecs.push({ el, span: m => [m(sc.start), m(sc.end)] });
      MHEADS.push({ el, sc });
      el.addEventListener('pointerdown', e => { if (e.button !== 0) return; drag(e, el, () => {}, moved => { if (!moved) L.seek(sc.start); }); });
      if (off) {
        const k = h('div', 'mcut', mcontent);
        k.title = `the picture cuts to ${sc.type} here (${fmt(sc.cut)}); its music arrives on the bar ${sc.start < sc.cut ? 'just before' : 'just after'} it (${fmt(sc.start)}). "start cut" in its SECTION puts the music on the cut`;
        mrecs.push({ el: k, span: m => [m(sc.cut)] });
      }
    });
    // the chords on the bars, across the sections: a chord held over a seam is one
    const runs = [], starts = A.sections.map(sc => sc.start);
    (A.harmony || []).forEach(x => { const r = runs[runs.length - 1]; if (r && r.name === x.chord.name && Math.abs(r.end - x.t) < 1e-6) r.end = x.end; else runs.push({ name: x.chord.name, t: x.t, end: x.end }); });
    runs.forEach(x => {
      const c = h('div', 'mch' + (starts.some(s => Math.abs(s - x.t) < 1e-6) ? ' first' : ''), mcontent, x.name);
      mrecs.push({ el: c, span: m => [m(x.t), m(x.end)] });
    });
    // the seams: how the music crosses each one (click for the next way)
    (A.transitions || []).forEach(tr => {
      const b = h('button', 'mseam' + (tr.set ? '' : ' def'), mcontent); b.type = 'button'; b.dataset.ref = tr.ref; b.dataset.kind = tr.kind;
      b.innerHTML = window.REEL_UI ? REEL_UI.icon(SEAM_ICON[tr.kind]) : tr.kind[0];
      const nx = SEAMS[(SEAMS.indexOf(tr.kind) + 1) % SEAMS.length];
      b.title = `into ${tr.ref}: ${seamWords(tr)}${tr.set ? '' : ' (the default)'}\nclick for a ${nx} instead`;
      b.setAttribute('aria-label', `how the music arrives at ${tr.ref}: ${tr.kind}`);
      mrecs.push({ el: b, span: m => [m(tr.t)] });
      b.addEventListener('pointerdown', e => e.stopPropagation());
      b.addEventListener('click', e => { e.stopPropagation(); scoreEdit(src => window.ReelMusic.setLine(src, 'SECTION', tr.ref, 'into', nx)); });
    });
    if (!musOpen) return;
    // a lane per part, note for note
    let top = Y.musLanes;
    MB.forEach(t => {
      const evs = A.events.filter(e => e.track === t.name), shape = laneShape(evs), c = R.colour(t.name), lv = A.levels && A.levels[t.name];
      const ln = mixRow([t.name], top, shape.h, c, t.name);
      roll(t.name, evs, shape, top, c, ln, lv);
      A.sections.forEach(sc => cell(t, sc, top, shape.h, c, !lv));
      tag(t.name, plays(t, shape) + '\nclick a stretch of it to play it there or stop it · Shift-click: the synth rack', top, shape.h, c, ln);
      top += shape.h;
    });
    if (MX.length) { top += MUS.sep; cueLane(top, A, R); top += LANE.cues; }
    musH = top;
    // each seam's stretch, down through the lanes
    (A.transitions || []).forEach(tr => {
      if (!(tr.t1 > tr.t0) || !(MB.length + MX.length)) return;
      const w = h('div', 'mwin ' + tr.kind, mcontent);
      w.style.height = (musH - Y.musLanes + 2) + 'px';
      mrecs.push({ el: w, span: m => [m(tr.t0), m(tr.t1)] });
    });
    applyMix();
  }
  // a lane's M and S, in the icon column, with its colour beside them: one part's, or (the cues)
  // every sound effect's at once
  function mixRow(names, top, H, c, key) {
    const row = h('div', 'mms', mgut); row.style.top = top + 'px'; row.style.height = H + 'px'; row.style.setProperty('--c', c); row.dataset.track = key;
    const m = h('button', null, row, 'M'), so = h('button', null, row, 'S');
    m.type = so.type = 'button';
    const who = names.length > 1 ? 'the sound effects' : names[0];
    m.title = `${who}: mute while you listen (not saved)`; so.title = `${who}: solo while you listen (not saved)`;
    m.setAttribute('aria-label', 'mute ' + who); so.setAttribute('aria-label', 'solo ' + who);
    const all = (R, k) => names.every(n => R.mix(n)[k]);
    m.onclick = () => { const R = RK(); if (!R || !R.mute) return; const on = !all(R, 'muted'); names.forEach(n => R.mute(n, on)); };
    so.onclick = () => { const R = RK(); if (!R || !R.solo) return; const on = !all(R, 'soloed'); names.forEach(n => R.solo(n, on)); };
    const ln = { names, m, so, els: [] }; lanes.set(key, ln);
    return ln;
  }
  // a lane's name, kept at the left of the view (what it plays, in its tooltip)
  function tag(name, tip, top, H, c, ln) {
    const lb = h('div', 'mlb', mcontent, name); lb.style.top = (top + Math.max(1, Math.round((Math.min(H, 16) - 13) / 2))) + 'px';
    lb.style.setProperty('--c', c); lb.dataset.track = name; lb.title = tip;
    MLB.push(lb); ln.els.push(lb);
  }
  // A part's notes: one SVG the width of the lane, its paths made again on every zoom: the level
  // behind (a faint area), the notes in four strengths (velocity × level where each
  // starts), and in gold what a seam plays itself (a fill)
  function roll(name, evs, shape, top, c, ln, levels) {
    const NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'tl-mroll'); svg.setAttribute('aria-hidden', 'true'); svg.dataset.track = name;
    svg.style.top = top + 'px'; svg.style.height = shape.h + 'px'; svg.style.setProperty('--c', c);
    const path = cls => { const p = document.createElementNS(NS, 'path'); p.setAttribute('class', cls); svg.appendChild(p); return p; };
    const r = { svg, evs, shape, levels, area: levels ? path('tl-lva') : null,
      notes: [1, 2, 3, 4].map(k => path('tl-n tl-n' + k)), own: path('tl-n tl-own') };
    mcontent.appendChild(svg); ROLLS.push(r); ln.els.push(svg);
  }
  const levelAt = (pts, t) => window.ReelMusic.levelAt(pts, t);
  const f1 = n => n.toFixed(1);
  function drawRoll(r) {
    const H = r.shape.h;
    r.svg.setAttribute('width', W); r.svg.setAttribute('height', H); r.svg.style.width = W + 'px';
    if (r.levels) {
      const y = v => f1(H - 1 - Math.min(1.25, v) / 1.25 * (H - 3));
      let line = '';
      r.levels.forEach((p, i) => { line += `${i ? 'L' : 'M'}${f1(x(p.t))} ${y(p.v)}`; });
      const last = r.levels[r.levels.length - 1];
      r.area.setAttribute('d', `M0 ${H}` + line.replace(/^M/, 'L') + `L${f1(x(last.t))} ${H}Z`);
    }
    const P = REEL_UI.rollPaths(r.evs, { H, px: x, pxs, lo: r.shape.lo, hi: r.shape.hi, level: r.levels ? t => levelAt(r.levels, t) : null });
    r.notes.forEach((path, k) => path.setAttribute('d', P.d[k]));
    r.own.setAttribute('d', P.own);
  }
  function drawMusic() {
    ROLLS.forEach(drawRoll);
    if (bars) {
      bars.style.width = W + 'px'; bars.style.height = (musEnd() - Y.mus) + 'px';
      bars.style.backgroundSize = `${(BAR * pxs).toFixed(3)}px 100%`;
    }
  }
  // The cues: what sets each sound effect off, read from the edit itself. Its top row is the command
  // bar: a tick for each key a question types, its Enter, the question while it stands on the bar,
  // and the select-all that clears it; its bottom row a dot for each pop on an @ moment (and any
  // sound on a cut or a work).
  function cueLane(top, A, R) {
    const of = kind => MX.find(t => t.on === kind), col = t => R.colour(t.name);
    const c0 = col(MX[0]), ln = mixRow(MX.map(t => t.name), top, LANE.cues, c0, '*cues');
    tag('cues', `the sound effects, cued by the edit: ${MX.map(t => `${t.name} on ${ON[t.on] || t.on}`).join('; ')}. Move a question or a moment and its sounds move with it`, top, LANE.cues, c0, ln);
    const seekOn = (el, t) => el.addEventListener('pointerdown', e => { if (e.button !== 0) return; drag(e, el, () => {}, moved => { if (!moved) L.seek(Math.max(0, t)); }); });
    const put1 = (el, t) => { mrecs.push({ el, span: m => [m(t)] }); ln.els.push(el); };
    const keyT = of('key'), spaceT = of('space'), entT = of('enter'), clrT = of('clear');
    if (keyT || spaceT || entT || clrT) RS.queries(EDIT).forEach(q => {
      const end = isFinite(q.clear) ? q.clear : SCENES[q.scene].end;
      const box = h('div', 'mq', mcontent, q.text); box.style.top = (top + 2) + 'px'; box.dataset.t = +q.t0.toFixed(3);
      box.title = `"${q.text}": typed ${fmt(q.times[0])} → ${fmt(q.typed)}${keyT ? ` (${keyT.name}: a tick a key)` : ''}, Enter at ${fmt(q.enter)}${entT ? ` (${entT.name})` : ''}, then on the bar until ${isFinite(q.clear) ? `${fmt(q.clear)}, when a select-all clears it${clrT ? ` (${clrT.name})` : ''}` : 'its scene ends'}\nclick to play from just before it`;
      mrecs.push({ el: box, span: m => [m(q.enter), m(end)] }); ln.els.push(box);
      seekOn(box, q.t0 - 0.3);
      q.times.forEach((tk, i) => {
        const tr = q.text[i] === ' ' ? spaceT : keyT; if (!tr) return;
        const k = h('div', 'mkt', mcontent); k.style.top = (top + 3) + 'px'; k.style.setProperty('--c', col(tr)); put1(k, tk);
      });
      if (entT) { const k = h('div', 'mke', mcontent); k.innerHTML = window.REEL_UI ? REEL_UI.icon('enter') : '⏎'; k.style.top = (top + 2) + 'px'; k.style.setProperty('--c', col(entT)); put1(k, q.enter); }
      if (clrT && isFinite(q.clear)) { const k = h('div', 'mks', mcontent); k.innerHTML = window.REEL_UI ? REEL_UI.icon('select') : '[]'; k.style.top = (top + 2) + 'px'; k.style.setProperty('--c', col(clrT)); put1(k, q.clear); }
    });
    // what an @ moment, a cut or a work is, for a dot's tooltip
    const what = (t, on) => {
      if (on === 'beat') { const M = MOMENTS.find(m => Math.abs(m.own.start + m.at - t) < 1e-3); return M ? `the ${M.kind} ${M.label ? '"' + M.label + '"' : ''} comes on in ${M.S.sc.type}` : 'an @ moment'; }
      if (on === 'cut') { const S = SCENES.find(s => Math.abs(s.start - t) < 1e-3); return S ? `the cut to ${S.sc.type}` : 'a cut'; }
      if (on === 'item') { const I = ITEMS.find(r => Math.abs(r.start - t) < 1e-3); return I ? `the work ${I.obj.eyebrow || I.obj.title || ''} comes on` : 'a work comes on'; }
      return ON[on] || on;
    };
    MX.filter(t => ['beat', 'cut', 'item'].includes(t.on)).forEach(t => {
      let last = -1;
      A.events.filter(e => e.track === t.name).forEach(e => {
        if (e.t - last < 0.12) return;                                               // a chime's notes are one sound
        last = e.t;
        const d = h('div', 'mpd', mcontent); d.style.top = (top + 17) + 'px'; d.style.setProperty('--c', col(t)); d.dataset.track = t.name; d.dataset.t = +e.t.toFixed(3);
        d.title = `${t.name} at ${fmt(e.t)}: ${what(e.t, t.on)}\nclick to play from just before it`;
        put1(d, e.t); seekOn(d, e.t - 0.4);
      });
    });
  }
  // A part in a section: a stretch of its lane you can click (its notes show through). Lit, it
  // plays there: click stops it, a drag up or down sets its level (shown on the right when it is
  // not 1), Alt-click halves it or gives it back; dark, a click plays it there. Shift-click opens
  // the part in the synth rack. A hit that has no level of its own is filled as strong as its level.
  function cell(t, sc, top, H, c, hit) {
    const p = sc.play.find(x => x.name === t.name), el = h('div', 'mc' + (p ? ' on' : ''), mcontent);
    const label = lv => lv !== 1 ? String(lv) : '';
    el.textContent = p ? label(p.level) : ''; el.dataset.track = t.name; el.dataset.ref = sc.ref;
    el.style.top = top + 'px'; el.style.height = H + 'px'; el.style.lineHeight = (H - 2) + 'px'; el.style.setProperty('--c', c);
    if (p && hit) el.style.background = rgba(c, lvA(p.level));
    el.title = p ? `${t.name} plays in ${sc.type}${p.level !== 1 ? ' at ' + p.level + ' of its level' : ''}\nclick: stop it here · drag up or down: its level · Alt-click: half or full · Shift-click: open it in the synth rack`
      : `${t.name} is silent in ${sc.type}\nclick: play it here · Shift-click: open it in the synth rack`;
    mrecs.push({ el, span: m => [m(sc.start), m(sc.end)] }); lanes.get(t.name).els.push(el);
    el.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      try { el.setPointerCapture(e.pointerId); } catch (x_) { /* synthetic pointer */ }
      const y0 = e.clientY; let moved = false, lv = p ? p.level : 1;
      const mv = ev => {
        if (!p) return;
        const dy = y0 - ev.clientY;
        if (!moved && Math.abs(dy) < 4) return;
        moved = true; el.classList.add('tl-lv');
        lv = Math.max(0.05, Math.min(1.5, Math.round((p.level + dy / 100) * 20) / 20));
        el.textContent = String(lv); if (hit) el.style.background = rgba(c, lvA(lv));
        readout.style.top = Math.max(0, top - 24) + 'px';           // over the lane being set
        show1(sc.start, `${t.name} in ${sc.type}: level ${p.level} → ${lv}`);
      };
      const up = ev => {
        el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up);
        el.classList.remove('tl-lv'); readout.hidden = true; readout.style.top = '';
        if (ev.type === 'pointercancel') { redrawMusic(true); return; }
        if (ev.shiftKey) { const R = RK(); if (R && R.focus) R.focus(t.name); return; }
        if (moved) { if (lv !== p.level) scoreEdit(src => window.ReelMusic.setTrackLevel(src, sc.ref, t.name, lv)); else el.textContent = label(lv); return; }
        if (p && ev.altKey) scoreEdit(src => window.ReelMusic.setTrackLevel(src, sc.ref, t.name, p.level === 1 ? 0.5 : 1));
        else scoreEdit(src => window.ReelMusic.toggleTrack(src, sc.ref, t.name));
      };
      el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    });
  }
  // mute and solo, as the rack's engine holds them: the buttons lit, a silent lane dim
  function applyMix() {
    const R = RK(); if (!R || !R.mix) return;
    lanes.forEach(ln => {
      const ms = ln.names.map(n => R.mix(n)), muted = ms.every(m => m.muted), soloed = ms.every(m => m.soloed), silent = ms.every(m => m.silent);
      ln.m.classList.toggle('tl-on', muted); ln.so.classList.toggle('tl-on', soloed);
      ln.m.setAttribute('aria-pressed', String(muted)); ln.so.setAttribute('aria-pressed', String(soloed));
      ln.els.forEach(el => el.classList.toggle('tl-mute', silent));
    });
  }
  // A change of the score goes through the rack, which plays it at once, keeps it (the file, the
  // page's host, or a draft) and notes it in the one history; it comes back here as reel-score.
  function scoreEdit(fn) {
    const R = RK();
    if (!R || !window.ReelMusic || R.src == null) { say(['there is no score to change (the synth rack has none)']); return; }
    let next;
    try { next = fn(R.src); } catch (e) { say(e.errors || [e.message]); redrawMusic(true); return; }
    if (next === R.src) return;
    say('');
    if (!R.change(next)) { say(['the score refused that change']); redrawMusic(true); }
  }
  function redrawMusic(force) {
    const sig = musicSig();
    if (force || sig !== musSig) {
      musSig = sig; populateMusic();
      if (!root.hidden) { fitStage(); layout(); }
    } else applyMix();
    stacks();
  }
  function setMusic(on) { musOpen = !!on; put(K_MUS, musOpen); redrawMusic(true); }
  let musRaf = 0;
  addEventListener('reel-score', () => { if (!musRaf) musRaf = requestAnimationFrame(() => { musRaf = 0; redrawMusic(false); }); });

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
      if (inp.value === inp.dataset.orig) return;
      const v = inp.value.trim();
      if (opts.num && v !== '' && !Number.isFinite(Number(v))) { say([`"${v}" is not a number`]); inp.value = inp.dataset.orig; return; }
      commit(src => act(src, v));
      // taken, the inspector is drawn again from the new script (this input with it); refused, it
      // shows the script as it was
      inp.value = inp.dataset.orig;
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
  // A fish line: edited in the Fish panel, where its time, who, what it does and its point each
  // have a control (and its point a mark on the stage).
  function fishRow(f, ln) {
    const r = h('div', 'row', insp); h('label', null, r, 'fish');
    const b = button(r, RS.writeFish(f.owner.fish[f.index]), 'edit this fish line in the Fish panel (F)', null, 'fline', 'fish');
    b.dataset.ln = ln;
    b.onclick = () => { if (window.REEL_FISH) window.REEL_FISH.select(ln); else say(['the Fish panel did not load (scripts/reel-fish.js)']); };
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
        h('span', null, g, `work ${I.k + 1}: ${(m.obj.eyebrow || '').split(' · ')[0]}`);
        input(g, 'length', String(m.obj.dur), (src, v) => itemDur(I, Number(v))(src), { num: true, ln, key: 'ITEM' });
      } else if (m && m.kind === 'beat') {
        const g = h('div', 'grp', insp);
        h('span', null, g, m.owner === m.scene ? 'moment' : 'moment in the work');
        input(g, '@', String(m.obj.at), (src, v) => RS.setAt(src, ln, Number(v)), { num: true, ln, key: '@' });
      } else if (f && f.kind === 'cue') {
        // shown in the cues row below
      } else if (f && f.kind === 'flag') {
        const r = h('div', 'row', insp); h('label', null, r, f.key); h('span', 'flag', r, 'on (a flag: delete the line to turn it off)');
      } else if (f && (f.key === 'img' || f.key === 'video')) {
        mediaRow(f, ln);
      } else if (f && f.key === 'fish') {
        fishRow(f, ln);
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
    // Undo and redo answer with the panel shut too: the Fish panel and the words on the stage
    // keep their edits on the same stacks (the synth rack keeps its own, while the pointer is on it)
    else if ((e.key === 'z' || e.key === 'Z') && (e.metaKey || e.ctrlKey)) { e.preventDefault(); undoAny(!e.shiftKey); }
    else if (root.hidden) return;
    else if ((e.key === '=' || e.key === '+') && plain) { e.preventDefault(); zoomTo(Z * 1.6); }
    else if (e.key === '-' && plain) { e.preventDefault(); zoomTo(Z / 1.6); }
    else if (e.key === '0' && plain) { e.preventDefault(); zoomTo(1); }
    else if (e.key === 'Escape' && selected >= 0) unselect();
  });
  // the HUD's button for the panel (older rigs: the key alone)
  if (L.addTool) tool = L.addTool({ id: 'timeline', label: 'Timeline', key: 'E', order: 20, icon: 'timeline',
    title: 'the timeline: drag the edit\'s times; click a scene to change its words', onClick: () => show(root.hidden) });

  // ── a change of script: the cards drawn again, where they were ────────
  // (an edit here or in the Fish panel, an undo, the file saved by another editor, a draft let
  // go). The zoom and the scroll stay; the inspector keeps its scene, its scroll and the field
  // you were typing in.
  function inspState() {
    const a = document.activeElement, own = a && a.tagName === 'INPUT' && insp.contains(a);
    let caret = null;
    try { if (own && a.selectionStart != null) caret = [a.selectionStart, a.selectionEnd]; } catch (e) { /* a number input has none */ }
    return { top: insp.scrollTop, ln: own ? a.dataset.ln : null, key: own ? a.dataset.key : null, caret };
  }
  function restoreInsp(s) {
    insp.scrollTop = s.top;
    if (s.ln == null && s.key == null) return;
    const q = (s.ln != null ? `[data-ln="${s.ln}"]` : '') + (s.key != null ? `[data-key="${CSS.escape(s.key)}"]` : '');
    const inp = insp.querySelector('input' + q);
    if (!inp) return;
    inp.focus({ preventScroll: true });
    try { if (s.caret) inp.setSelectionRange(Math.min(s.caret[0], inp.value.length), Math.min(s.caret[1], inp.value.length)); } catch (e) { /* a number input has none */ }
  }
  if (L.onChange) L.onChange(() => {
    const st = selected >= 0 ? inspState() : null;
    model(); populate(); refreshStatus(pending > 0); stacks();
    curScene = -1;
    if (selected >= 0) {
      if (SCENES[selected]) { SCENES[selected].el.classList.add('tl-sel'); build(SCENES[selected]); restoreInsp(st); }
      else unselect();
    }
    if (!root.hidden) layout();
  });

  // ── back to where a reload by hand left it ────────────────────────────
  musSig = musicSig(); populateMusic();
  if (get(K_OPEN, false)) show(true);
  const sel = get(K_SEL, -1);
  if (!root.hidden && SCENES[sel]) select(sel, true);
  window.REEL_TIMELINE = { show, select, undo: () => undoAny(true), redo: () => undoAny(false), zoom: z => zoomTo(z), get zoomLevel() { return Z; },   // for tests and the console
    music: { open: setMusic, get opened() { return musOpen; } } };
})();
