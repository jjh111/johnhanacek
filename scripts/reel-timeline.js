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
// every fish line at its time. A line holds until another of its kind changes it, and no further
// than its scene's cut unless it carries (ReelScript.fishHolds). Drag a mark to move its line
// anywhere in the cut (across a cut, it moves into that scene). Where the gold stops at a cut or at
// the reel's end, its end is a handle: drag it back and the fish is the reel's own from there (a
// `<who> auto` line); drag it on past the cut and the lines that stopped there carry on, to an auto
// where it lands. Click a mark to edit its line in the Fish panel (scripts/reel-fish.js); click a
// span to jump there with that fish chosen.
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
  const K_OPEN = 'reel-tl-open', K_SEL = 'reel-tl-sel:' + L.file, K_UNDO = 'reel-undo:' + L.file, K_REDO = 'reel-redo:' + L.file, K_VIEW = 'reel-tl-view:' + L.file, K_MUS = 'reel-tl-music', K_IDLE = 'reel-tl-unused';
  const DEPTH = 30;

  // ── the model: where everything is, read from the parse (again after every change) ──
  const fmt = s => { const m = Math.floor(s / 60 + 1e-9), r = s - m * 60; return `${m}:${r < 10 ? '0' : ''}${r.toFixed(1)}`; };
  const n3 = x => +(+x).toFixed(3);
  const sceneAtT = T => SCENES.find(S => T >= S.start - 1e-9 && T < S.end - 1e-9) || SCENES[SCENES.length - 1];   // the scene playing at T
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
      .map(S => ({ S, out: RS.cue(S.sc, 'out', EDIT), set: !!(S.sc.cues && S.sc.cues.out != null) }));
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
  // the music, under the fish: a hairline, its own ruler of bars, its chords, then (open) a lane
  // per part (a clip's pad name in a head of LANE.head px, what it plays under it), a gap, and the
  // sound effects' cues. The panel is as tall as what it shows (panelH, below).
  const MUS = { gap: 10, ruler: 18, chords: 14, sep: 8 };
  const LANE = { head: 10, cues: 28 };
  Y.mus = FISH_END + MUS.gap; Y.musChords = Y.mus + MUS.ruler; Y.musLanes = Y.musChords + MUS.chords + 4;
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
#reel-tl .tl-fe { position: absolute; width: 10px; height: ${Y.laneH}px; margin-left: -10px; border-radius: 0 4px 4px 0; cursor: ew-resize; z-index: 4;
  border: 1px solid var(--gold); border-left: 0; background: repeating-linear-gradient(90deg, rgba(var(--gold-rgb), 0.55) 0 1px, transparent 1px 3px); }
#reel-tl .tl-fe:hover, #reel-tl .tl-fe.tl-on { background: rgba(var(--gold-rgb), 0.45); }
#reel-tl .tl-fm:hover, #reel-tl .tl-fm.tl-on { background: rgba(var(--gold-rgb), 0.25); }
#reel-tl .tl-fm.tl-sel { background: var(--gold); color: rgb(var(--surface-rgb)); box-shadow: 0 0 0 3px rgba(var(--gold-rgb), 0.3); }
#reel-tl .tl-ph { position: absolute; left: 0; top: ${Y.ruler}px; height: ${FISH_END - Y.ruler}px; width: 1px; background: var(--gold); pointer-events: none; will-change: transform; z-index: 5; }
#reel-tl .tl-ph::before { content: ''; position: absolute; left: -4px; top: 0; border: 4.5px solid transparent; border-top: 6px solid var(--gold); }
#reel-tl .tl-ro-out { position: absolute; top: ${Y.card + 4}px; padding: 4px 7px; border: 1px solid rgba(var(--gold-rgb), 0.6); border-radius: 4px; background: rgba(var(--surface-rgb), 0.96);
  color: var(--text-bright); pointer-events: none; white-space: nowrap; z-index: 6; }
#reel-tl .tl-ro-out[hidden] { display: none; }
/* the music: its own ruler of bars, its chords, the scenes' cuts, a lane per part with its clips,
   the cues */
#reel-tl .tl-msep { position: absolute; left: 0; right: 0; top: ${Y.mus - MUS.gap / 2}px; border-top: 1px solid rgba(var(--cyan-dim-rgb), 0.15); pointer-events: none; }
#reel-tl .tl-mruler { position: absolute; left: 0; right: 0; top: ${Y.mus}px; height: ${MUS.ruler}px; cursor: col-resize;
  background: rgba(var(--cyan-dim-rgb), 0.05); border-bottom: 1px solid rgba(var(--cyan-dim-rgb), 0.3); }
#reel-tl .tl-mbar { position: absolute; top: ${Y.mus}px; height: ${MUS.ruler}px; padding-left: 3px; border-left: 1px solid rgba(var(--cyan-dim-rgb), 0.6);
  font: 600 9.5px/${MUS.ruler}px var(--font-mono); color: var(--ink-quiet); pointer-events: none; }
#reel-tl .tl-msig { position: absolute; height: ${MUS.ruler - 4}px; padding: 0 5px; border-radius: 3px; z-index: 4; pointer-events: none;
  font: 600 9px/${MUS.ruler - 6}px var(--font-mono); color: var(--gold); background: rgba(var(--surface-rgb), 0.94); border: 1px solid rgba(var(--gold-rgb), 0.6); }
#reel-tl .tl-mch { position: absolute; top: ${Y.musChords}px; height: ${MUS.chords}px; padding: 0 5px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; pointer-events: none;
  font: 500 9.5px/${MUS.chords}px var(--font-mono); color: var(--ink-quiet); border-left: 1px solid rgba(var(--cyan-dim-rgb), 0.25); }
#reel-tl .tl-mcutl { position: absolute; top: ${Y.mus}px; width: 0; border-left: 1px dashed rgba(var(--gold-rgb), 0.45); pointer-events: none; z-index: 2; }
#reel-tl .tl-mcutl span { position: absolute; left: -6px; top: 0; width: 12px; height: 9px; pointer-events: auto; cursor: help; }
#reel-tl .tl-mcutl span::before { content: ''; position: absolute; left: 1px; top: 0; border: 5px solid transparent; border-top: 6px solid var(--gold); }
#reel-tl .tl-mbars { position: absolute; left: 0; top: ${Y.mus}px; pointer-events: none; background-repeat: repeat-x; background-position: 0 0;
  background-image: linear-gradient(to right, rgba(var(--cyan-dim-rgb), 0.2) 1px, transparent 1px); }
#reel-tl .tl-mbars.tl-beats { background-image: linear-gradient(to right, rgba(var(--cyan-dim-rgb), 0.2) 1px, transparent 1px), linear-gradient(to right, rgba(var(--cyan-dim-rgb), 0.07) 1px, transparent 1px); }
#reel-tl .tl-mnone { position: absolute; top: ${Y.mus}px; height: ${MUS.ruler}px; padding: 0 6px; font: 500 10px/${MUS.ruler}px var(--font-mono); color: var(--ink-faint); }
/* a part's lane and its clips: a head with the pad's name, what it plays under it; edges, fades */
#reel-tl .tl-mlane { position: absolute; left: 0; right: 0; border-bottom: 1px solid rgba(var(--cyan-dim-rgb), 0.08); }
#reel-tl .tl-mk { position: absolute; border: 1px solid; border-radius: 4px; cursor: grab; z-index: 1; box-sizing: border-box; }
#reel-tl .tl-mk:hover { box-shadow: 0 0 0 1px rgba(var(--gold-rgb), 0.55); }
#reel-tl .tl-mk.tl-sel { border-color: var(--gold) !important; box-shadow: 0 0 0 1px var(--gold); z-index: 2; }
#reel-tl .tl-mk.tl-mute { opacity: 0.4; }
#reel-tl .tl-mkn { display: block; height: ${LANE.head}px; padding: 0 5px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; pointer-events: none;
  font: 600 8.5px/${LANE.head}px var(--font-mono); color: var(--text-bright); }
#reel-tl .tl-mke { position: absolute; top: 0; bottom: 0; width: 7px; cursor: ew-resize; z-index: 2; border-radius: 3px; }
#reel-tl .tl-mke.tl-l { left: -3px; }
#reel-tl .tl-mke.tl-r { right: -3px; }
#reel-tl .tl-mke:hover { background: rgba(var(--gold-rgb), 0.5); }
#reel-tl .tl-mkf { position: absolute; top: -3px; width: 8px; height: 8px; border-radius: 2px; background: var(--c); border: 1px solid rgb(var(--surface-rgb)); cursor: ew-resize; z-index: 3; opacity: 0; }
#reel-tl .tl-mk:hover .tl-mkf, #reel-tl .tl-mk.tl-sel .tl-mkf { opacity: 1; }
#reel-tl .tl-mkf:hover { background: var(--gold); }
/* the notes, over the clips: four strengths; a fade's corner shaded under its line */
#reel-tl svg.tl-mroll { position: absolute; left: 0; overflow: visible; pointer-events: none; z-index: 3; }
#reel-tl svg.tl-mroll .tl-n { fill: var(--c); stroke: none; }
#reel-tl svg.tl-mroll .tl-n1 { fill-opacity: 0.3; }
#reel-tl svg.tl-mroll .tl-n2 { fill-opacity: 0.55; }
#reel-tl svg.tl-mroll .tl-n3 { fill-opacity: 0.8; }
#reel-tl svg.tl-mroll .tl-fsh { fill: rgb(var(--surface-rgb)); fill-opacity: 0.55; stroke: none; }
#reel-tl svg.tl-mroll .tl-fln { fill: none; stroke: var(--c); stroke-width: 1.2; }
#reel-tl svg.tl-mroll .tl-nb { fill: none; stroke: var(--gold); stroke-width: 1; stroke-linejoin: round; stroke-opacity: 0.9; }
#reel-tl svg.tl-mroll.tl-mute { opacity: 0.3; }
/* a lane's name, kept at the left of the view: a part's opens its pads */
#reel-tl .tl-mlb { position: absolute; height: ${LANE.head + 2}px; padding: 0 5px; border-radius: 3px; white-space: nowrap; z-index: 4; cursor: help;
  font: 600 9px/${LANE.head}px var(--font-mono); color: var(--text-bright); background: rgba(var(--surface-rgb), 0.92); border: 1px solid var(--c); }
#reel-tl button.tl-mlb { height: ${LANE.head + 2}px; min-width: 0; padding: 0 5px; cursor: pointer; font: 600 9px/${LANE.head}px var(--font-mono);
  color: var(--text-bright); background: rgba(var(--surface-rgb), 0.92); border: 1px solid var(--c); border-radius: 3px; }
#reel-tl button.tl-mlb:hover { border-color: var(--gold); color: var(--gold); }
#reel-tl .tl-mlb.tl-mute { color: var(--ink-faint); border-style: dashed; }
#reel-tl .tl-midlerow { position: absolute; left: 0; right: 0; border-bottom: 1px solid rgba(var(--cyan-dim-rgb), 0.08); }
#reel-tl button.tl-mlb.tl-midle { --c: rgba(var(--cyan-dim-rgb), 0.35); color: var(--ink-quiet); border-style: dashed; font-weight: 500; }
/* the cues: a tick a key, the Enter, the question while it stands on the bar, the select-all
   that clears it; a dot for each pop */
#reel-tl .tl-mq { position: absolute; height: 13px; padding: 0 4px 0 9px; border-radius: 3px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; cursor: pointer;
  font: 500 9.5px/11px var(--font-mono); color: var(--ink-quiet); background: rgba(var(--cyan-dim-rgb), 0.07); border: 1px solid rgba(var(--cyan-dim-rgb), 0.25); }
#reel-tl .tl-mq:hover { border-color: var(--gold); color: var(--text-bright); }
#reel-tl .tl-mkt { position: absolute; width: 1px; height: 11px; background: var(--c); pointer-events: none; }
#reel-tl .tl-mke2, #reel-tl .tl-mks { position: absolute; width: 13px; height: 13px; margin-left: -6.5px; color: var(--c); z-index: 2; pointer-events: none; display: flex;
  background: rgb(var(--surface-rgb)); border-radius: 3px; }
#reel-tl .tl-mke2 .ri, #reel-tl .tl-mks .ri { width: 13px; height: 13px; }
#reel-tl .tl-mpd { position: absolute; width: 9px; height: 9px; margin-left: -4.5px; border-radius: 50%; background: var(--c); cursor: pointer; z-index: 2; }
#reel-tl .tl-mpd:hover { background: var(--gold); }
#reel-tl .tl-mq.tl-mute, #reel-tl .tl-mkt.tl-mute, #reel-tl .tl-mke2.tl-mute, #reel-tl .tl-mks.tl-mute, #reel-tl .tl-mpd.tl-mute { opacity: 0.3; }
#reel-tl .tl-mms { position: absolute; left: 0; width: ${GUT}px; display: flex; align-items: center; gap: 2px; padding: 0 2px 0 5px; }
#reel-tl .tl-mms::before { content: ''; position: absolute; left: 1px; top: 2px; bottom: 2px; width: 2px; border-radius: 1px; background: var(--c); }
#reel-tl .tl-mms button { flex: 1; height: 12px; min-width: 0; padding: 0; border-radius: 3px; font: 600 9px/1 var(--font-mono);
  background: transparent; color: var(--ink-faint); border: 1px solid rgba(var(--cyan-dim-rgb), 0.3); }
#reel-tl .tl-mms button.tl-on { background: var(--gold); border-color: var(--gold); color: rgb(var(--surface-rgb)); }
#reel-tl button.tl-mtog { position: absolute; left: 3px; width: ${GUT - 6}px; height: ${MUS.ruler}px; min-width: 0; padding: 0; display: flex; align-items: center; justify-content: center; gap: 0; }
#reel-tl button.tl-mtog .ri { width: 12px; height: 12px; }
/* the inspector's music pages: a clip (its bars, its pad, level, fades), a part's pads */
#reel-tl .tl-pads { display: grid; grid-template-columns: repeat(auto-fill, minmax(94px, 1fr)); gap: 6px; margin: 4px 0 10px; }
#reel-tl .tl-pad { position: relative; height: 54px; padding: 6px 7px; border-radius: 7px; cursor: pointer; color: var(--c); display: flex; flex-direction: column; justify-content: space-between;
  background: rgba(var(--cyan-dim-rgb), 0.06); border: 1px solid rgba(var(--cyan-dim-rgb), 0.3); }
#reel-tl .tl-pad b { font: 600 10.5px/1 var(--font-mono); color: var(--text-bright); }
#reel-tl .tl-pad:hover, #reel-tl .tl-pad:focus-visible { border-color: var(--gold); outline: none; }
#reel-tl .tl-pad.tl-on { border-color: var(--gold); background: rgba(var(--gold-rgb), 0.1); box-shadow: inset 0 0 0 1px var(--gold); }
#reel-tl .tl-pad button.tl-pplay { position: absolute; right: 4px; top: 4px; width: 22px; height: 22px; min-width: 0; padding: 0; }
#reel-tl .tl-pad button.tl-pplay .ri { width: 11px; height: 11px; }
#reel-tl .tl-mlv { display: flex; gap: 8px; align-items: center; }
#reel-tl .tl-mlv input[type=range] { flex: 1; min-width: 0; padding: 0; border: 0; background: none; accent-color: var(--gold); }
#reel-tl .tl-mlv .tl-cue { flex: none; width: 74px; }
#reel-tl .tl-macts { display: flex; flex-wrap: wrap; gap: 6px; margin: 12px 0 6px; }
#reel-tl .tl-mhint { color: var(--ink-faint); font-size: 10px; line-height: 1.5; margin: 8px 0 4px; user-select: none; }
/* the status bar: one row under everything, its own rule above it */
#reel-tl .tl-status { position: absolute; left: 0; right: 0; bottom: 0; height: ${STATUS}px; padding: 0 8px 0 12px; display: flex; align-items: center; gap: 8px; white-space: nowrap;
  border-top: 1px solid rgba(var(--cyan-dim-rgb), 0.18); }
#reel-tl .tl-status .tl-where { color: var(--cyan); overflow: hidden; text-overflow: ellipsis; min-width: min(16ch, 40%); flex: 0 1 auto; }
#reel-tl .tl-status .tl-err { color: var(--text-bright); border-left: 2px solid #ff8a7a; padding-left: 8px; overflow: hidden; text-overflow: ellipsis; flex: 1; min-width: 0; }
#reel-tl .tl-status .tl-err:empty { display: none; }
#reel-tl .tl-status .tl-err.tl-ok { border-left-color: var(--gold); }
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
    // how long each line holds (ReelScript.fishHolds), by its line
    const HELD = new Map();
    RS.fishHolds(EDIT).forEach(x => { const f = P.fields.find(g => g.key === 'fish' && g.owner === EDIT.scenes[x.i] && g.index === x.k); if (f) HELD.set(f.ln, (HELD.get(f.ln) || []).concat(x)); });
    FISH_WHO.forEach(([who, y]) => {
      const track = L.fish && L.fish.track ? L.fish.track(who) : [];
      track.forEach(sp => {
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
      // What fish lines decide (the gold) stops at its scene's cut, unless a line carries on past
      // it, or at a later line, or at the reel's end. Where it stops at a cut or at the reel's end
      // its end is a handle, like a clip's: drag it back and a `<who> auto` line is written where
      // it lands; drag it on past the cut and the lines that stopped there carry on (`carry`), to
      // a `<who> auto` where it lands. (Stopped by a line, the line's mark is there to drag.)
      const runs = [];
      track.forEach((sp, k) => { if (!sp.set) return; const r = runs[runs.length - 1]; if (r && r.k === k - 1) { r.t1 = sp.t1; r.k = k; } else runs.push({ t0: sp.t0, t1: sp.t1, k }); });
      runs.forEach(run => {
        const atEnd = run.t1 >= DUR - 1e-3;
        const cutLines = [...HELD.entries()].filter(([, hs]) => hs.some(x => x.who === who && x.by === 'cut' && Math.abs(x.t1 - run.t1) < 1e-6)).map(([ln, hs]) => ({ ln, c: hs[0].c }));
        if (!atEnd && !cutLines.length) return;
        const el = h('div', 'fe', content); el.dataset.who = who; el.style.top = y + 'px'; el.dataset.end = atEnd ? 'reel' : 'cut';
        el.title = atEnd ? `what the fish lines decide holds to the end of the reel\ndrag back to where ${FNAME[who]} goes back to the reel's own (a "${who} auto" line)`
          : `what the fish lines decide stops at this cut\ndrag on past it to carry it into the next scene (to a "${who} auto" where you let go), or back to stop it sooner`;
        const E = { el, T: null };
        recs.push({ el, span: m => [E.T != null ? E.T : m(run.t1)] });
        el.addEventListener('pointerdown', e => {
          if (e.button !== 0) return;
          el.classList.add('tl-on');
          drag(e, el, (dt, ev) => {
            const T0 = Math.max(run.t0 + 0.05, Math.min(DUR, run.t1 + dt)), S = sceneAtT(Math.min(T0, DUR - 0.05));
            const at = Math.min(n3(S.sc.dur - 0.05), Math.max(0, snap(T0 - S.start, ev)));
            E.T = T0 >= DUR - 0.05 ? DUR : S.start + at; E.to = { S, at, end: T0 >= DUR - 0.05 };
            layout(still);
            show1(E.T, E.T > run.t1 + 0.05 ? `${FNAME[who]}: carried on ${E.to.end ? 'to the end of the reel' : `to ${S.sc.type} @${at}`}  (${fmt(E.T)})`
              : `${FNAME[who]}: the reel's own from ${S.sc.type} @${at}  (${fmt(E.T)})`);
          }, moved => {
            el.classList.remove('tl-on');
            const to = E.to, T = E.T; E.T = E.to = null;
            if (!moved || !to || Math.abs(T - run.t1) < 0.05) { layout(); return; }
            commit(src => {
              let out = src;
              // on past the cut: the lines that stopped there carry on (their line count stays,
              // so the scene's line numbers hold for the auto after them)
              if (T > run.t1) cutLines.forEach(({ ln, c }) => { out = RS.setField(out, ln, RS.writeFish(Object.assign({}, c, { carry: true }))); });
              if (!to.end) { const Q = RS.parse(out); out = RS.addLine(out, Q.marks.find(m => m.kind === 'scene' && m.obj === Q.edit.scenes[to.S.i]).ln, 'fish', `@${to.at} ${who} auto`); }
              return out;
            });
          });
        });
      });
      const seen = new Map();                     // lines at the same moment stand side by side
      FISHL.filter(F => inLane(F.v, who)).forEach(F => {
        const k = (F.S.start + F.v.at).toFixed(3), n = seen.get(k) || 0; seen.set(k, n + 1);
        const el = h('div', 'fm', content); el.dataset.ln = F.ln; el.dataset.who = who;
        el.innerHTML = window.REEL_UI ? REEL_UI.icon(FICON(F.v)) : '•';
        el.style.top = y + 'px'; el.style.marginLeft = (-Y.laneH / 2 + n * 16) + 'px';
        const holds = (HELD.get(F.ln) || []).filter(x => x.who === who);
        el.title = `fish ${RS.writeFish(F.v)} (line ${F.ln}) · ${fmt(F.S.start + F.v.at)}`
          + (holds.length ? ` · holds to ${holds[0].by === 'reel' ? 'the end' : fmt(holds[0].t1)}${holds[0].by === 'cut' ? ' (its scene\'s end)' : ''}` : '')
          + '\ndrag to move it (across a cut, into that scene); click to edit it in the Fish panel';
        const M = { el, F };
        FISHM.push(M);
        recs.push({ el, span: m => [F.dragT != null ? F.dragT : m(F.S.start) + F.v.at] });
        el.addEventListener('pointerdown', e => {
          if (e.button !== 0) return;
          const t0 = F.S.start + F.v.at;
          el.classList.add('tl-on');
          drag(e, el, (dt, ev) => {                 // a line moves anywhere in the cut: it holds from where it lands
            const T = Math.max(0, Math.min(DUR - 0.05, t0 + dt)), S = sceneAtT(T);
            const at = Math.min(n3(S.sc.dur - 0.05), Math.max(0, snap(T - S.start, ev)));
            F.dragT = S.start + at; F.dragTo = { S, at };
            layout(still);
            show1(F.dragT, `fish @${F.v.at} → ${S === F.S ? '' : S.sc.type + ' '}@${at}  (${fmt(F.dragT)})`);
          }, moved => {
            el.classList.remove('tl-on');
            const to = F.dragTo; F.dragT = F.dragTo = null;
            if (!moved) {                           // a click: edit the line in the Fish panel
              L.seek(F.S.start + F.v.at);
              if (window.REEL_FISH) window.REEL_FISH.select(F.ln); else { select(F.S.i, true); point(F.ln); }
              layout();
            } else if (to && (to.S !== F.S || to.at !== F.v.at)) {
              // the Fish panel finds the line again by its words in its new scene, if it had it selected
              if (window.REEL_FISH && window.REEL_FISH.selected === F.ln) put('reel-fish-sel:' + L.file, { text: RS.writeFish(Object.assign({}, F.v, { at: to.at })), i: to.S.i });
              commit(src => RS.moveFish(src, F.ln, to.S.i, to.at));
            } else layout();
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
  // on claude.ai the save dialog asks first: what came of it is said here (a browser download says nothing)
  dl.onclick = async () => { const s = window.REEL_HOST && REEL_HOST.said ? REEL_HOST.said(await L.download(L.src), 'The script') : null; if (s) passing(s.text, s.bad); };
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
  const say = errs => { errs = [].concat(errs || []).map(String).filter(Boolean); err.classList.remove('tl-ok'); err.textContent = errs[0] || ''; err.title = errs.join('\n'); };
  // a passing word in the same place (a download kept), gone after a few seconds
  let passT = 0;
  function passing(text, bad) {
    clearTimeout(passT); say(text); err.classList.toggle('tl-ok', !bad);
    if (!bad) passT = setTimeout(() => { if (err.textContent === text) say(''); }, 4000);
  }

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
    CLIPS.forEach(k => {
      const a = parseFloat(k.el.style.left) || 0, w = parseFloat(k.el.style.width) || 0, room = L0 + (k.tagW || 0) + 8;
      const d = Math.max(0, Math.min(room - a, w - 60));
      const tr = d > 0 ? `translateX(${d.toFixed(0)}px)` : '';
      if (k.nm.style.transform !== tr) k.nm.style.transform = tr;
    });
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

  // ── the music: the score's clips on the music's own bars ─────────────
  // What the synth rack holds (REEL_RACK: the score's parse, its arrangement, the mix), drawn
  // under the fish lanes and drawn again whenever the rack says it changed (a reel-score event).
  // The music keeps its own time, as a music program does: a ruler of bars and beats (its time
  // signature and tempo at its left), the chords on the bars, and the scenes' cuts as notches and
  // faint lines, so the picture is always in view and a clip's edge is drawn to a cut when it comes
  // near one. Under it, a lane per part (drums, bass, chords, arp, lead, fx: its name, M and S),
  // and on it the part's clips, each showing what it plays (a drum grid, notes at their pitches,
  // a riser's wedge) under the name of its pad:
  //   drag a clip           move it (on the grid: a bar zoomed out, a beat in, a sixteenth closer;
  //                         Shift: the bar; Alt: free of the grid and the cuts)
  //   drag its edges        where it starts and ends
  //   drag its top corners  its fade in and out (in beats)
  //   drag it up or down    its level (start with an upward or downward pull)
  //   double-click a lane   a new clip there, of the pad last chosen for the part
  //   click a clip          the inspector: its bars, its pad (a pad each, to hear and to choose),
  //                         its level and fades, Play from here, Duplicate, Delete (⌫ and ⌘D too)
  //   click a lane's name   its pads: hear one, choose the one a new clip gets
  // A part with no clips keeps out of the way: one thin row at the foot of the parts names them
  // ("unused: lead"), and a click shows their lanes (to add a clip) or folds them again.
  // Each change is one line of the score (ReelMusic.setClip, addClip, removeClip) through the rack
  // (REEL_RACK.change), which plays it at once and keeps it; Undo takes it back.
  let musOpen = get(K_MUS, true), showIdle = get(K_IDLE, false), PARTS = [], MX = [], MLB = [], ROLLS = [], CLIPS = [], BARN = [], CUTL = [], musSig = null, musH = 0, bars = null;
  let selClip = null, inspMode = null;               // the selected clip's line; what the inspector shows
  const chosen = {};                                 // a part's pad for the next new clip
  const lanes = new Map();                           // a lane's name → its M and S, and what dims when it is silent
  const RK = () => window.REEL_RACK, RMu = () => window.ReelMusic;
  const AR = () => { const R = RK(); return R && R.arrangement; };
  let musEmpty = true;                               // no score yet (or none beside this script): one row says so
  const musEnd = () => musEmpty ? Y.mus + MUS.ruler : musOpen && musH ? musH : Y.musLanes - 4;
  const rgba = (hex, a) => { const n = parseInt(String(hex).slice(1), 16); return `rgba(${n >> 16 & 255}, ${n >> 8 & 255}, ${n & 255}, ${a})`; };
  const ON = { key: 'every letter typed', space: 'every space typed', clear: 'the select-all that clears each question', enter: 'each Enter', beat: 'every @ moment', cut: 'every cut', item: 'each work' };
  const bt = (s, A) => RMu().rangeText(s.from, s.to, A.spb);           // a clip's bars, as the score writes them
  const clipName = c => c.pad + (Math.abs(c.level - 1) > 1e-9 ? ' · ' + c.level : '');
  // a part's lane: a row a sound for a part of several (the drums: kick at the foot, as a drum grid
  // has it), a piano roll as tall as its range for one that plays pitches, a strip for one drum
  function shapeOf(p, A) {
    const n = p.tracks.length, head = LANE.head;
    if (n > 1) return { h: head + n * 8 + 3, rows: Object.fromEntries(p.tracks.map((t, i) => [t, n - 1 - i])), nRows: n };
    let lo = Infinity, hi = -Infinity, sung = false;
    A.events.forEach(e => { if (e.track === p.tracks[0] && e.midi != null) { lo = Math.min(lo, e.midi); hi = Math.max(hi, e.midi); if (e.take) sung = true; } });
    if (lo === Infinity) return { h: head + 14 };
    // a sung take: taller, two pixels a semitone, so how each note bends can be seen
    if (sung) return { h: head + Math.max(22, Math.min(40, 4 + (hi - lo + 1) * 2)) + 3, lo, hi };
    return { h: head + Math.max(14, Math.min(22, 6 + (hi - lo + 1) * 1.2)) + 3, lo, hi };
  }
  // a cheap fingerprint of every note, so a knob that changes no note redraws nothing
  function noteHash(A, Pm) {
    const idx = new Map(Pm.score.tracks.map((t, i) => [t.name, i + 1]));
    let x = 2166136261;
    const mix = n => { x = Math.imul(x ^ (n | 0), 16777619); };
    for (const e of A.events) {
      mix(idx.get(e.track) || 0); mix(Math.round(e.t * 1000)); mix(Math.round(e.dur * 1000)); mix(e.midi || 0); mix(Math.round(e.vel * 1000)); mix(e.rise ? 2 : 0);
      if (e.bend) for (const c of e.bend) mix(c);                       // a sung note's bend: nuance and straighten move it
    }
    return x >>> 0;
  }
  function musicSig() {
    const R = RK(), Pm = R && R.parsed, A = R && R.arrangement;
    if (!Pm || !A) return JSON.stringify([musOpen, R ? R.error || 'none' : 'wait']);
    return JSON.stringify([musOpen, showIdle, Pm.score.tempo, Pm.score.beatsPerBar, Pm.score.tracks.map(t => [t.name, t.on || '']),
      Pm.score.parts.map(p => [p.name, p.tracks, p.pads.map(d => d.name + ':' + d.voices.map(v => v.track + (v.steps || v.text || '')).join(','))]),
      A.clips.map(c => [c.ln, c.part, c.from, c.to, c.pad, c.level, c.fadeIn, c.fadeOut]), A.harmony.map(x => x.chord.name).join(' '),
      noteHash(A, Pm), RS.queries(EDIT).map(q => q.text), MOMENTS.map(M => M.label), SCENES.map(S => S.start)]);
  }
  function populateMusic() {
    const R = RK(), Pm = R && R.parsed, A = R && R.arrangement;
    mcontent.textContent = ''; mgut.textContent = ''; mrecs = []; MLB = []; ROLLS = []; CLIPS = []; BARN = []; CUTL = []; lanes.clear(); musH = 0;
    h('div', 'msep', mcontent);
    bars = h('div', 'mbars', mcontent);                // the bars and beats, faintly, under the whole music (sized in layout)
    const tog = h('button', 'mtog', mgut); tog.type = 'button'; tog.style.top = Y.mus + 'px';
    tog.innerHTML = window.REEL_UI ? REEL_UI.icon(musOpen ? 'chevDown' : 'chevRight') + REEL_UI.icon('music') : (musOpen ? '▾♪' : '▸♪');
    tog.title = musOpen ? 'the music: shut it to its bars and chords' : 'the music: open its parts and their clips';
    tog.setAttribute('aria-expanded', String(musOpen)); tog.setAttribute('aria-label', 'the music\'s lanes');
    tog.onclick = () => setMusic(!musOpen);
    musEmpty = !Pm || !A;
    if (musEmpty) {
      PARTS = []; MX = [];
      const el = h('div', 'mnone', mcontent, !R ? 'the music is loading…' : R.error ? R.error.split('\n')[0] : `no ${R.name} next to this script: the reel is silent`);
      mrecs.push({ el, span: () => [0, DUR] });
      return;
    }
    PARTS = Pm.score.parts; MX = Pm.score.tracks.filter(t => t.on);
    // the ruler: a number a bar (layout thins them), its time signature, scrubbed like the clock's
    const mr = h('div', 'mruler', mcontent);
    mr.title = `the music's bars: ${Pm.score.beatsPerBar}/4 at ${Pm.score.tempo} BPM, a bar ${A.bar.toFixed(2).replace(/\.?0+$/, '')} s. Click or drag to move the playhead`;
    mr.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      const seek = ev => L.seek((ev.clientX - lane.getBoundingClientRect().left) / pxs), was = L.isPlaying();
      if (was) L.setPlaying(false);
      seek(e);
      drag(e, mr, (dt, ev) => seek(ev), () => { if (was && L.now() < L.duration - 0.05) L.setPlaying(true); });
    });
    for (let b = 1; b <= A.bars; b++) { const n = h('span', 'mbar', mcontent, String(b)); mrecs.push({ el: n, span: m => [m((b - 1) * A.bar)] }); BARN.push(n); }
    const sig = h('div', 'msig', mcontent, `${Pm.score.beatsPerBar}/4 · ${Pm.score.tempo}`); sig.title = mr.title; sig.style.top = (Y.mus + 2) + 'px'; MLB.push(sig);
    // the chords: a run of bars each
    const runs = [];
    A.harmony.forEach(x => { const r = runs[runs.length - 1]; if (r && r.name === x.chord.name) r.end = x.end; else runs.push({ name: x.chord.name, t: x.t, end: x.end, bar: x.bar }); });
    runs.forEach(x => { const c = h('div', 'mch', mcontent, x.name); c.title = `${x.name} from bar ${x.bar}`; mrecs.push({ el: c, span: m => [m(x.t), m(x.end)] }); });
    // the scenes' cuts: a notch on the ruler, a faint line down the music, the scene's number
    SCENES.forEach(S => {
      if (!S.i) return;
      const k = h('div', 'mcutl', mcontent); k.dataset.scene = S.i;
      const pos = RMu().posText(Math.round(S.start / A.step), A.spb);
      h('span', null, k).title = `the cut to scene ${S.i + 1}, ${S.sc.type}, at ${fmt(S.start)}: bar ${pos.includes('.') ? pos.replace('.', ' beat ').replace(/\.(\d)$/, ', sixteenth $1') : pos}. A clip's edge is drawn to it when it comes near`;
      mrecs.push({ el: k, span: m => [m(S.start)] }); CUTL.push(k);
    });
    if (musOpen) {
      let top = Y.musLanes;
      // a part with no clips is drawn only when asked for (or while its pads are in the inspector)
      const used = new Set(A.clips.map(cl => cl.part)), idle = PARTS.filter(p => !used.has(p.name));
      const shown = PARTS.filter(p => used.has(p.name) || showIdle || (inspMode === 'part' && insp.dataset.part === p.name));
      shown.forEach((p, i) => {
        const shape = shapeOf(p, A), c = R.colour(p.name), ln = mixRow(p.tracks, top, shape.h, c, p.name);
        const bg = h('div', 'mlane', mcontent); bg.style.top = top + 'px'; bg.style.height = shape.h + 'px'; bg.dataset.part = p.name;
        bg.title = `${p.name}: double-click to add a clip of ${chosenPad(p, A)} here`;
        bg.addEventListener('pointerdown', e => { if (e.button === 0 && inspMode === 'clip') closeInsp(); });
        bg.addEventListener('dblclick', e => addAt(p, (e.clientX - lane.getBoundingClientRect().left) / pxs, e));
        roll(p, shape, top, c, ln, A);
        A.clips.filter(cl => cl.part === p.name).forEach(cl => clipEl(cl, p, top, shape, c, ln, A));
        tag(p.name, `${p.name}: ${p.tracks.join(', ')} · pads ${p.pads.map(d => d.name).join(', ')}\nclick: its pads, to hear and choose · double-click its lane: a new clip`, top, shape.h, c, ln, () => openPart(p.name));
        const lb = MLB[MLB.length - 1];
        CLIPS.filter(k => k.part === p.name).forEach(k => { Object.defineProperty(k, 'tagW', { get: () => lb.offsetWidth, configurable: true }); });
        top += shape.h + (i < shown.length - 1 ? 1 : 0);
      });
      if (idle.length) {
        const names = idle.map(p => p.name).join(', ');
        const row = h('div', 'midlerow', mcontent); row.style.top = (top + 1) + 'px'; row.style.height = (LANE.head + 4) + 'px';
        const b = h('button', 'mlb midle', mcontent, (showIdle ? '▾ ' : '▸ ') + 'unused: ' + names); b.type = 'button'; b.style.top = (top + 2) + 'px';
        b.dataset.track = '*idle'; b.setAttribute('aria-expanded', String(showIdle));
        b.title = showIdle ? `fold the parts with no clips (${names}) into this row` : `${names}: no clips. Click to show ${idle.length > 1 ? 'their lanes' : 'its lane'}, to add one`;
        b.onclick = e => { e.stopPropagation(); showIdle = !showIdle; put(K_IDLE, showIdle); redrawMusic(true); };
        b.addEventListener('pointerdown', e => e.stopPropagation());
        MLB.push(b); top += LANE.head + 5;
      }
      if (MX.length) { top += MUS.sep; cueLane(top, A, R); top += LANE.cues; }
      musH = top;
    }
    CUTL.forEach(k => { k.style.height = (musEnd() - Y.mus) + 'px'; });
    applyMix();
    if (inspMode === 'clip') { const cl = A.clips.find(c => c.ln === selClip); if (cl) buildClip(cl); else closeInsp(); }
    else if (inspMode === 'part') { if (PARTS.some(p => p.name === insp.dataset.part)) buildPart(insp.dataset.part); else closeInsp(); }
    markSel();
  }
  // the pad a new clip of the part gets: the one last chosen, else its last clip's, else its first
  function chosenPad(p, A) {
    if (chosen[p.name] && p.pads.some(d => d.name === chosen[p.name])) return chosen[p.name];
    const last = A.clips.filter(c => c.part === p.name).pop();
    return last ? last.pad : p.pads[0] ? p.pads[0].name : '';
  }
  // a lane's M and S, in the icon column, with its colour beside them: a part's sounds, or (the
  // cues) every sound effect's, at once
  function mixRow(names, top, H, c, key) {
    const row = h('div', 'mms', mgut); row.style.top = top + 'px'; row.style.height = H + 'px'; row.style.setProperty('--c', c); row.dataset.track = key;
    const m = h('button', null, row, 'M'), so = h('button', null, row, 'S');
    m.type = so.type = 'button';
    const who = key === '*cues' ? 'the sound effects' : key;
    m.title = `${who}: mute while you listen (not saved)`; so.title = `${who}: solo while you listen (not saved)`;
    m.setAttribute('aria-label', 'mute ' + who); so.setAttribute('aria-label', 'solo ' + who);
    const all = (R, k) => names.every(n => R.mix(n)[k]);
    m.onclick = () => { const R = RK(); if (!R || !R.mute) return; const on = !all(R, 'muted'); names.forEach(n => R.mute(n, on)); };
    so.onclick = () => { const R = RK(); if (!R || !R.solo) return; const on = !all(R, 'soloed'); names.forEach(n => R.solo(n, on)); };
    const ln = { names, m, so, els: [] }; lanes.set(key, ln);
    return ln;
  }
  // a lane's name, kept at the left of the view (a click: its pads)
  function tag(name, tip, top, H, c, ln, onClick) {
    const lb = h(onClick ? 'button' : 'div', 'mlb', mcontent, name); lb.style.top = (top + 1) + 'px';
    if (onClick) { lb.type = 'button'; lb.onclick = e => { e.stopPropagation(); onClick(); }; lb.addEventListener('pointerdown', e => e.stopPropagation()); }
    lb.style.setProperty('--c', c); lb.dataset.track = name; lb.title = tip;
    MLB.push(lb); ln.els.push(lb);
  }
  // A part's notes, every clip's, in one SVG the width of the lane, made again on every zoom: under
  // each clip's name, in rows for a part of several sounds, fainter where the level is lower; and
  // each clip's fades, the faded corner shaded under a line.
  function roll(p, shape, top, c, ln, A) {
    const NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'tl-mroll'); svg.setAttribute('aria-hidden', 'true'); svg.dataset.track = p.name;
    svg.style.top = top + 'px'; svg.style.height = shape.h + 'px'; svg.style.setProperty('--c', c);
    const path = cls => { const q = document.createElementNS(NS, 'path'); q.setAttribute('class', cls); svg.appendChild(q); return q; };
    const r = { svg, p, shape, evs: A.events.filter(e => p.tracks.includes(e.track)), levels: A.levels[p.tracks[0]] || null,
      clips: A.clips.filter(cl => cl.part === p.name), shade: path('tl-fsh'), notes: [1, 2, 3, 4].map(k => path('tl-n tl-n' + k)), bends: path('tl-nb'), fade: path('tl-fln') };
    mcontent.appendChild(svg); ROLLS.push(r); ln.els.push(svg);
  }
  const levelAt = (pts, t) => window.ReelMusic.levelAt(pts, t);
  const f1 = n => n.toFixed(1);
  function drawRoll(r) {
    const H = r.shape.h, y0 = LANE.head + 1, A = AR();
    r.svg.setAttribute('width', W); r.svg.setAttribute('height', H); r.svg.style.width = W + 'px';
    const P = REEL_UI.rollPaths(r.evs, { H: H - 1, y0, px: x, pxs, lo: r.shape.lo, hi: r.shape.hi, rows: r.shape.rows, nRows: r.shape.nRows,
      level: r.levels ? t => levelAt(r.levels, t) : null });
    r.notes.forEach((q, k) => q.setAttribute('d', P.d[k]));
    r.bends.setAttribute('d', P.bends || '');
    let sh = '', ln = '';
    if (A) r.clips.forEach(cl => {
      const a = x(cl.t0), b = x(cl.t1) - 2, fi = cl.fadeIn * A.beat * pxs, fo = cl.fadeOut * A.beat * pxs, top = y0 - 1, bot = H - 2;
      if (fi > 0) { sh += `M${f1(a)} ${top}H${f1(a + fi)}L${f1(a)} ${bot}Z`; ln += `M${f1(a)} ${bot}L${f1(a + fi)} ${top}`; }
      if (fo > 0) { sh += `M${f1(b)} ${top}H${f1(b - fo)}L${f1(b)} ${bot}Z`; ln += `M${f1(b - fo)} ${top}L${f1(b)} ${bot}`; }
    });
    r.shade.setAttribute('d', sh); r.fade.setAttribute('d', ln);
  }
  function drawMusic() {
    const A = AR();
    ROLLS.forEach(drawRoll);
    if (bars && A) {
      const barPx = A.bar * pxs, beatPx = A.beat * pxs;
      bars.style.width = W + 'px'; bars.style.height = (musEnd() - Y.mus) + 'px';
      bars.style.backgroundSize = `${barPx.toFixed(3)}px 100%, ${beatPx.toFixed(3)}px 100%`;
      bars.classList.toggle('tl-beats', beatPx >= 9);
      // a number a bar, or every 2nd, 4th, 8th where they would crowd
      const every = [1, 2, 4, 8, 16].find(k => k * barPx >= 22) || 16;
      BARN.forEach((n, i) => { n.hidden = i % every !== 0; });
    }
    // the fade handles sit where each fade ends
    if (A) CLIPS.forEach(k => { k.fI.style.left = (k.cl.fadeIn * A.beat * pxs - 4) + 'px'; k.fO.style.right = (k.cl.fadeOut * A.beat * pxs - 4) + 'px'; });
  }
  // ── a clip ─────────────────────────────────────────────────────────────
  function clipEl(cl, p, top, shape, c, ln, A) {
    const el = h('div', 'mk', mcontent); el.dataset.part = p.name; el.dataset.ln = cl.ln;
    el.style.top = top + 'px'; el.style.height = (shape.h - 1) + 'px'; el.style.setProperty('--c', c);
    el.style.background = `linear-gradient(to bottom, ${rgba(c, 0.36)} 0 ${LANE.head}px, ${rgba(c, 0.09)} ${LANE.head}px)`;
    el.style.borderColor = rgba(c, 0.8);
    const nm = h('span', 'mkn', el, clipName(cl));
    const eL = h('i', 'mke l', el), eR = h('i', 'mke r', el), fI = h('i', 'mkf i', el), fO = h('i', 'mkf o', el);
    eL.title = 'drag: where it starts'; eR.title = 'drag: where it ends'; fI.title = 'drag: its fade in'; fO.title = 'drag: its fade out';
    el.title = `${p.name} plays ${cl.pad}, bars ${bt(cl, A)} (${fmt(cl.t0)} → ${fmt(cl.t1)})${cl.level !== 1 ? ', at ' + cl.level : ''}${cl.fadeIn ? ', in ' + cl.fadeIn + ' beats' : ''}${cl.fadeOut ? ', out ' + cl.fadeOut + ' beats' : ''}`
      + '\ndrag: move · its edges: start and end · its top corners: fades · up or down: level · click: the inspector';
    mrecs.push({ el, span: m => [m(cl.t0), m(Math.min(cl.t1, DUR))] });  // past the reel's end, drawn to the end of the view
    CLIPS.push({ el, cl, fI, fO, nm, part: p.name }); ln.els.push(el);
    el.addEventListener('pointerdown', e => clipDown(e, cl, el, p, top));
    // a clip of a part that sings a take: double-click opens its notes there (scripts/reel-notes.js)
    const sings = p.pads.some(d => d.voices.some(v => v.take));
    if (sings) el.title += '\ndouble-click: its notes, to edit (N)';
    el.addEventListener('dblclick', e => {
      e.stopPropagation();
      if (sings && window.REEL_NOTES) window.REEL_NOTES.show(true, (e.clientX - lane.getBoundingClientRect().left) / pxs);
    });
  }
  function markSel() { CLIPS.forEach(k => k.el.classList.toggle('tl-sel', k.cl.ln === selClip)); }
  // the grid a drag snaps to: the finest of a sixteenth, a beat and a bar still 12 px wide (Shift:
  // the bar; Alt: a sixteenth, and no pull from the cuts); a scene's cut pulls within 8 px
  function gridUnit(ev, A) {
    if (ev.altKey) return 1;
    if (ev.shiftKey) return A.spb;
    return [1, 4, A.spb].find(u => u * A.step * pxs >= 12) || A.spb;
  }
  function snapStep(s, unit, ev, A) {
    let q = Math.round(s / unit) * unit;
    if (!ev.altKey) SCENES.forEach(S => {
      const c = Math.round(S.start / A.step);
      if (Math.abs(c - s) * A.step * pxs <= 8 && Math.abs(c - s) < Math.abs(q - s)) q = c;
    });
    return q;
  }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function clipDown(e, cl, el, p, top) {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const A = AR(); if (!A) return;
    selClip = cl.ln; markSel();
    if (inspMode === 'clip' && insp.dataset.ln !== String(cl.ln)) buildClip(cl);   // already open: it follows the selection
    const cls = e.target.classList, len = cl.to - cl.from, end = A.bars * A.spb;
    const zone = cls.contains('tl-mke') ? (cls.contains('tl-l') ? 'from' : 'to') : cls.contains('tl-mkf') ? (cls.contains('tl-i') ? 'in' : 'out') : null;
    const others = A.clips.filter(o => o.part === cl.part && o.ln !== cl.ln);
    const lo = Math.max(0, ...others.filter(o => o.to <= cl.from).map(o => o.to)), hi = Math.min(end, ...others.filter(o => o.from >= cl.to).map(o => o.from));
    const x0 = e.clientX, y0 = e.clientY;
    let mode = zone, nf = cl.from, nt = cl.to, lv = cl.level, fi = cl.fadeIn, fo = cl.fadeOut, moved = false;
    try { el.setPointerCapture(e.pointerId); } catch (x_) { /* synthetic pointer */ }
    readout.style.top = Math.max(0, top - 26) + 'px';
    const mv = ev => {
      const dx = ev.clientX - x0, dy = y0 - ev.clientY;
      if (!mode) { if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return; mode = Math.abs(dy) > Math.abs(dx) ? 'level' : 'move'; }
      moved = true; dragging = true;
      const unit = gridUnit(ev, A), d = dx / pxs / A.step, minLen = ev.altKey ? 1 : 4;
      if (mode === 'move') { nf = clamp(snapStep(cl.from + d, unit, ev, A), lo, hi - len); nt = nf + len; }
      else if (mode === 'from') nf = clamp(snapStep(cl.from + d, unit, ev, A), lo, cl.to - minLen);
      else if (mode === 'to') nt = clamp(snapStep(cl.to + d, unit, ev, A), cl.from + minLen, hi);
      else if (mode === 'in') fi = clamp(Math.round((cl.fadeIn + d / 4) * (ev.altKey ? 4 : 1)) / (ev.altKey ? 4 : 1), 0, len / 4 - fo);
      else if (mode === 'out') fo = clamp(Math.round((cl.fadeOut - d / 4) * (ev.altKey ? 4 : 1)) / (ev.altKey ? 4 : 1), 0, len / 4 - fi);
      else lv = clamp(Math.round((cl.level + dy / 100) * 20) / 20, 0.05, 1.5);
      el.style.left = x(nf * A.step).toFixed(1) + 'px'; el.style.width = Math.max(4, x(nt * A.step) - x(nf * A.step) - 2).toFixed(1) + 'px';
      el.querySelector('.tl-mkn').textContent = clipName({ pad: cl.pad, level: lv });
      const k = CLIPS.find(c => c.el === el);
      if (k) { k.fI.style.left = (fi * A.beat * pxs - 4) + 'px'; k.fO.style.right = (fo * A.beat * pxs - 4) + 'px'; }
      const what = mode === 'level' ? `level ${cl.level} → ${lv}` : mode === 'in' ? `fade in ${cl.fadeIn} → ${fi} beats` : mode === 'out' ? `fade out ${cl.fadeOut} → ${fo} beats`
        : `bars ${bt(cl, A)} → ${RMu().rangeText(nf, nt, A.spb)}`;
      show1(nf * A.step, `${p.name} ${cl.pad}: ${what}`);
    };
    const up = ev => {
      el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up);
      dragging = false; readout.hidden = true; readout.style.top = '';
      if (ev.type === 'pointercancel') { redrawMusic(true); return; }
      if (!moved) { selectClip(cl.ln); return; }       // a click: the inspector
      const ch = {};
      if (nf !== cl.from) ch.from = nf; if (nt !== cl.to) ch.to = nt; if (lv !== cl.level) ch.level = lv;
      if (fi !== cl.fadeIn) ch.fadeIn = fi; if (fo !== cl.fadeOut) ch.fadeOut = fo;
      if (Object.keys(ch).length) scoreEdit(src => RMu().setClip(src, cl.ln, ch)); else redrawMusic(true);
    };
    el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  }
  // a new clip where a lane is double-clicked: from the bar (Alt: the beat) under the pointer, up
  // to four bars, as far as the next clip lets it
  function addAt(p, t, ev) {
    const A = AR(); if (!A || !p.pads.length) return;
    const unit = ev && ev.altKey ? 4 : A.spb, from = Math.floor(t / A.step / unit) * unit;
    const mine = A.clips.filter(c => c.part === p.name);
    if (mine.some(c => from >= c.from && from < c.to)) return;
    const to = Math.min(from + 4 * A.spb, A.bars * A.spb, ...mine.filter(c => c.from > from).map(c => c.from));
    if (to <= from) return;
    const pad = chosenPad(p, A);
    scoreEdit(src => RMu().addClip(src, { part: p.name, from, to, pad }), next => {
      const c = RMu().parse(next).score.clips.find(x_ => x_.part === p.name && x_.from === from);
      if (c) { selClip = c.ln; if (inspMode === 'clip') insp.dataset.ln = ''; }
    });
  }
  function removeSel() {
    const A = AR(), cl = A && A.clips.find(c => c.ln === selClip);
    if (!cl) return;
    closeInsp();
    scoreEdit(src => RMu().removeClip(src, cl.ln));
  }
  // a copy right after it, as long as there is room before the next clip
  function duplicateSel() {
    const A = AR(), cl = A && A.clips.find(c => c.ln === selClip);
    if (!cl) return;
    const len = cl.to - cl.from, next = Math.min(A.bars * A.spb, ...A.clips.filter(c => c.part === cl.part && c.from >= cl.to).map(c => c.from));
    const to = Math.min(cl.to + len, next);
    if (to - cl.to < 4) { say([`no room after this ${cl.part} clip: the next one starts at bar ${RMu().posText(next, A.spb)}`]); return; }
    scoreEdit(src => RMu().addClip(src, { part: cl.part, from: cl.to, to, pad: cl.pad, level: cl.level }), next => {
      const c = RMu().parse(next).score.clips.find(x_ => x_.part === cl.part && x_.from === cl.to);
      if (c) selClip = c.ln;
    });
  }
  // ── the inspector's music pages: a clip, a part's pads ────────────────
  function openInsp(mode) {
    if (selected >= 0) { SCENES[selected].el.classList.remove('tl-sel'); selected = -1; put(K_SEL, -1); }
    inspMode = mode; insp.hidden = false; root.classList.add('tl-insp'); layout();
  }
  function closeInsp() {
    selClip = null; inspMode = null; markSel();
    if (selected < 0) { insp.hidden = true; root.classList.remove('tl-insp'); layout(); }
  }
  function selectClip(ln) {
    const A = AR(), cl = A && A.clips.find(c => c.ln === ln); if (!cl) return;
    selClip = ln; markSel();
    if (inspMode !== 'clip' || insp.dataset.ln !== String(ln)) { openInsp('clip'); buildClip(cl); }
  }
  function openPart(name) { selClip = null; markSel(); openInsp('part'); buildPart(name); }
  function inspHead(title, note) {
    insp.textContent = '';
    const head = h('div', 'ih', insp);
    h('h3', null, head, title);
    if (note) h('span', 'note', head, note);
    const x_ = button(head, '', 'close the inspector (Esc)', null, null, 'close'); x_.setAttribute('aria-label', 'close the inspector'); x_.onclick = closeInsp;
  }
  // the pads of a part as tiles: each its name and a picture of what it plays; a click chooses it,
  // its ▶ plays it on its own (one turn, over the chords where the playhead is)
  function padTiles(parent, pname, current, pick) {
    const R = RK(), Pm = R && R.parsed, A = AR(), p = Pm && Pm.score.parts.find(x_ => x_.name === pname);
    if (!p) return;
    const grid = h('div', 'pads', parent), c = R.colour(pname), shape = shapeOf(p, A);
    p.pads.forEach(d => {
      const tile = h('div', 'pad' + (d.name === current ? ' on' : ''), grid); tile.style.setProperty('--c', c); tile.dataset.pad = d.name;
      tile.setAttribute('role', 'button'); tile.tabIndex = 0;
      tile.title = `${d.name}: ${d.voices.map(v => `${v.track} ${v.text || 'rises across its clip'}`).join(' · ')}${d.once ? ' (once, from its clip\'s start)' : ''}`;
      h('b', null, tile, d.name);
      const evs = RMu().padPreview(Pm.score, A, pname, d.name, L.now()), dur = Math.max(A.bar, ...evs.map(e => e.t + 0.05));
      const P_ = REEL_UI.rollPaths(evs, { H: 20, px: t => 2 + t / dur * 70, pxs: 70 / dur, lo: shape.lo, hi: shape.hi, rows: shape.rows, nRows: shape.nRows });
      const sv = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); sv.setAttribute('width', 74); sv.setAttribute('height', 20); sv.setAttribute('aria-hidden', 'true');
      sv.innerHTML = P_.d.map((q, k) => q ? `<path d="${q}" fill="currentColor" fill-opacity="${[0.4, 0.6, 0.8, 1][k]}"/>` : '').join('');
      tile.appendChild(sv);
      const play = button(tile, '', `hear ${d.name} on its own`, null, 'pplay', 'play');
      play.onclick = e => { e.stopPropagation(); const E = R.engine; if (E && E.preview) E.preview(RMu().padPreview(Pm.score, AR(), pname, d.name, L.now())); else say(['click once for sound, then ▶']); };
      tile.onclick = () => pick(d.name);
      tile.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); pick(d.name); } };
    });
  }
  function buildClip(cl) {
    const A = AR(), p = PARTS.find(x_ => x_.name === cl.part);
    insp.dataset.ln = cl.ln; delete insp.dataset.part;
    inspHead(`${cl.part} · ${cl.pad}`, `bars ${bt(cl, A)} · ${fmt(cl.t0)} → ${fmt(cl.t1)}`);
    // where it plays: its first and last bar, as the score writes them (5, 5.3, 5.3.2)
    const r = h('div', 'row cues', insp); h('label', null, r, 'bars');
    const fromIn = numBox(r, 'from', RMu().posText(cl.from, A.spb), v => { const g = RMu().readRange(v, A.spb); if (!g) throw new Error(`"${v}" is not a bar, as in 5 or 5.3`); return { from: g.from }; });
    const toIn = numBox(r, 'to', RMu().rangeText(cl.from, cl.to, A.spb).split('-').pop(), v => { const g = RMu().readRange(v, A.spb); if (!g) throw new Error(`"${v}" is not a bar, as in 8 or 8.2`); return { to: g.to }; });
    fromIn.title = 'the bar it starts on (5, or bar 5 beat 3: 5.3)'; toIn.title = 'the last bar it plays (8, or to bar 8 beat 2: 8.2)';
    const g = h('div', 'grp', insp); h('span', null, g, 'pad');
    padTiles(insp, cl.part, cl.pad, name => { chosen[cl.part] = name; if (name !== cl.pad) scoreEdit(src => RMu().setClip(src, cl.ln, { pad: name })); });
    const lv = h('div', 'row', insp); h('label', null, lv, 'level');
    const box = h('div', 'mlv', lv);
    const sl = h('input', null, box); sl.type = 'range'; sl.min = '0'; sl.max = '1.5'; sl.step = '0.05'; sl.value = String(cl.level); sl.setAttribute('aria-label', 'level');
    const lvIn = numBox(box, 'level', String(cl.level), v => { const n = Number(v); if (!(n >= 0 && n <= 1.5)) throw new Error('a level is 0 to 1.5'); return { level: n }; });
    sl.oninput = () => { lvIn.value = sl.value; };
    sl.onchange = () => { const n = Number(sl.value); if (n !== cl.level) scoreEdit(src => RMu().setClip(src, cl.ln, { level: n })); };
    const fr = h('div', 'row cues', insp); h('label', null, fr, 'fades');
    numBox(fr, 'in', String(cl.fadeIn), v => { const n = Number(v); if (!(n >= 0)) throw new Error('a fade is 0 or more beats'); return { fadeIn: n }; }).title = 'fade in, in beats';
    numBox(fr, 'out', String(cl.fadeOut), v => { const n = Number(v); if (!(n >= 0)) throw new Error('a fade is 0 or more beats'); return { fadeOut: n }; }).title = 'fade out, in beats';
    const acts = h('div', 'macts', insp);
    button(acts, 'Play from here', 'play the reel from this clip\'s start', null, null, 'play').onclick = () => { L.seek(cl.t0); L.setPlaying(true); };
    button(acts, 'Duplicate', 'a copy right after it (⌘D)', null, null, 'copy').onclick = duplicateSel;
    button(acts, 'Delete', 'take it out (⌫)', null, null, 'discard').onclick = removeSel;
    h('p', 'mhint', insp, `Drag the clip to move it, its edges to start and end it, its top corners to fade it, up or down for its level. ${p ? 'Its pads are the ' + p.name + ' part\'s.' : ''}`);
    // an input that writes one change to the clip: Enter or leaving it
    function numBox(parent, label, value, read) {
      const c = h('div', 'cue', parent), lab = h('label', null, c, label), inp = h('input', null, c);
      inp.type = 'text'; inp.value = value; inp.dataset.orig = value; inp.spellcheck = false; inp.dataset.key = 'clip:' + label;
      lab.htmlFor = inp.id = 'reel-tl-in' + (uid++);
      const go = () => {
        if (inp.value.trim() === inp.dataset.orig) return;
        let ch;
        try { ch = read(inp.value.trim()); } catch (er) { say([er.message]); inp.value = inp.dataset.orig; return; }
        scoreEdit(src => RMu().setClip(src, cl.ln, ch));
        inp.value = inp.dataset.orig;
      };
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go(); } else if (e.key === 'Escape') { inp.value = inp.dataset.orig; inp.blur(); } e.stopPropagation(); });
      inp.addEventListener('blur', go);
      return inp;
    }
  }
  function buildPart(name) {
    const R = RK(), A = AR(), p = PARTS.find(x_ => x_.name === name); if (!p) return;
    insp.dataset.part = name; delete insp.dataset.ln;
    const n = A.clips.filter(c => c.part === name).length;
    inspHead(name, `${p.tracks.join(', ')} · ${n} clip${n === 1 ? '' : 's'}`);
    const g = h('div', 'grp', insp); h('span', null, g, 'pads');
    padTiles(insp, name, chosenPad(p, A), pad => { chosen[name] = pad; buildPart(name); redrawMusic(true); });
    h('p', 'mhint', insp, `▶ plays a pad on its own. The one lit is what a new clip gets: double-click the ${name} lane where it should start. Its sounds are in the synth rack.`);
    const acts = h('div', 'macts', insp);
    button(acts, 'Open in the synth rack', `the ${name} part's sounds and pads, with their knobs and steps (M)`, null, null, 'synths').onclick = () => { if (R && R.focus) R.focus(name); };
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
      if (entT) { const k = h('div', 'mke2', mcontent); k.innerHTML = window.REEL_UI ? REEL_UI.icon('enter') : '⏎'; k.style.top = (top + 2) + 'px'; k.style.setProperty('--c', col(entT)); put1(k, q.enter); }
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
  // `after(text)` runs once it is taken (a new clip's line chosen as the selection).
  function scoreEdit(fn, after) {
    const R = RK();
    if (!R || !window.ReelMusic || R.src == null) { say(['there is no score to change (the synth rack has none)']); return; }
    let next;
    try { next = fn(R.src); } catch (e) { say(e.errors || [e.message]); redrawMusic(true); return; }
    if (next === R.src) return;
    say('');
    if (after) after(next);
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
  function setMusic(on) { musOpen = !!on; put(K_MUS, musOpen); if (!musOpen && inspMode === 'clip') closeInsp(); redrawMusic(true); }
  let musRaf = 0;
  addEventListener('reel-score', () => { if (!musRaf) musRaf = requestAnimationFrame(() => { musRaf = 0; redrawMusic(false); }); });

  // ── the inspector: the scene's lines, in the order they are written ──
  let selected = -1;
  function select(i, keep) {
    const S = SCENES[i]; if (!S) return;
    if (!keep) L.seek(S.start);
    selClip = null; inspMode = 'scene'; markSel(); delete insp.dataset.ln; delete insp.dataset.part;
    if (selected >= 0) SCENES[selected].el.classList.remove('tl-sel');
    selected = i; S.el.classList.add('tl-sel'); put(K_SEL, i);
    build(S);
    insp.hidden = false; root.classList.add('tl-insp');
    layout();
  }
  function unselect() {
    if (selected >= 0) SCENES[selected].el.classList.remove('tl-sel');
    selected = -1; put(K_SEL, -1); if (inspMode === 'scene') inspMode = null;
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
        const dflt = RS.cue({ type: S.sc.type, cues: {} }, n, EDIT);   // every scene's, else the rig's own
        if (RS.CUES[n].words) {                    // a word, not a number: the ease's curves
          const lab = h('label', null, c, n), sel = h('select', null, c); sel.id = 'reel-tl-in' + (uid++); lab.htmlFor = sel.id; sel.dataset.key = 'cue:' + n;
          [''].concat(RS.CUES[n].words).forEach(w => { const o = h('option', null, sel, w || `(${dflt})`); o.value = w; if ((set ? S.sc.cues[n] : '') === w) o.selected = true; });
          sel.title = RS.CUES[n].about + ' (the first: the default)';
          sel.addEventListener('change', () => commit(src => RS.setCue(src, S.ln, n, sel.value || null)));
          sel.addEventListener('keydown', e => e.stopPropagation());
          return;
        }
        const inp = input(c, n, set ? String(S.sc.cues[n]) : '', (src, v) => RS.setCue(src, S.ln, n, v === '' ? null : Number(v)),
          { num: true, placeholder: String(dflt), key: 'cue:' + n });
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
    else if (e.key === 'Escape' && (inspMode || selClip != null)) closeInsp();
    // a selected clip: ⌫ takes it out, ⌘D copies it after itself
    else if ((e.key === 'Delete' || e.key === 'Backspace') && selClip != null && !e.metaKey && !e.ctrlKey) { e.preventDefault(); removeSel(); }
    else if ((e.key === 'd' || e.key === 'D') && (e.metaKey || e.ctrlKey) && selClip != null) { e.preventDefault(); duplicateSel(); }
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
    music: { open: setMusic, get opened() { return musOpen; }, select: selectClip, part: openPart, get selected() { return selClip; } } };
})();
