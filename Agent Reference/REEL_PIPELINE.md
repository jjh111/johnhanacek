# Reel pipeline: edit a sizzle reel like a timeline

Plan of record for how sizzle reels are made after cut 2. The script is the one source of
truth; everything else reads it, edits it one line at a time, or films it.

## Where it stands

- **The script is the edit.** `Assets/sizzle-reel-2.script.txt`: one line per line on screen,
  `SCENE <kind> <seconds>`, `ITEM`, `@<seconds>` beats counted from their scene (so a change of
  length ripples), `cue <name> <value>` for a scene's inner timing.
- **`scripts/reel-script.js`** reads it everywhere (rig: classic script; renderer and tools:
  CommonJS). Contract, tested by `Agent Reference/reel-tests/scripttest.mjs`:
  - `parse(src)` → `{ edit, warnings, marks, fields }`. `marks`: one
    `{ ln, obj, kind: 'scene'|'item'|'beat', scene, owner }` per SCENE/ITEM/@ line. `fields`: one
    `{ ln, owner, key, jsonKey, index, kind }` per field line (`index`: place among the owner's
    lines of that key; a cue's is its name; null for a field given once). Mistakes throw one
    Error whose `.errors` lists `line N: …` rows.
  - `setDur(src, ln, s)`, `setAt(src, ln, s)`, `setField(src, ln, words)`,
    `setCue(src, sceneLn, name, value|null)`: change one line (setCue may add or remove one),
    refresh the [bracketed] timecodes, return the new script; throw parse's error if the change
    would break it.
  - `CUES`, `cue(scene, name)`, `cueNames(kind)`: `typing` (characters a second, 40), `in`
    (seconds from the question's Enter to the answer arriving, 0.04), `out` (seconds before the
    scene ends that its content leaves: open 0.45, title 0.65, results/quotes/offer 0.34, the
    rest 0.32, none for end). Defaults ARE the rig's timing, so writing no cue changes nothing.
  - `spans(edit)` (scene and item times), `cueSheet(edit)`, `format`, `retime`.
- **The rig** (`Assets/sizzle-reel-2.html`) plays any script: `?script=name.script.txt`
  (a file next to it). Live, it is the preview: `#t=` resume, `[`/`]`, `L` loop, scene ticks.
  **Determinism rule:** anything that touches the tank runs in `EVENTS` or `TICKS` (after
  every engine tick), never in a scene's paint function. A still, a part or a parallel chunk
  paints only some frames and must still grow the film's tank. (The opening fish's heading
  pin lived in paint until 2026-09-27, so stills and parts showed a slightly different fish.)
- **`window.REEL_LIVE`** (live mode only), for the timeline and anything else that drives
  the preview:
  `{ file, src, parsed, draft, dev, scenes, duration, now(), seek(t), isPlaying(),
  setPlaying(bool), onFrame(fn(t)), save(text) → Promise<{ok, via?: 'file'|'draft', errors?}>,
  discardDraft(), download(text?) }`. `save` validates, then writes through the dev server
  (`dev: true`) or keeps a sessionStorage draft for this tab; either way the page reloads at
  the same moment. The rig loads `scripts/reel-timeline.js` after defining it.
- **The renderer** (`scripts/render-sizzle-reel.mjs`): `--cut=2`, `--script=Assets/x.script.txt`
  (any script through cut 2's player → `x.mp4`), `--scene=`, `--from/--to` (parts never
  overwrite the full cut), `--stills=`, `--fps`, `--crf`, `--seed`.

## Work packages

Built by medium-effort subagents, each owning its files, verified by its own test in
`Agent Reference/reel-tests/`.

1. **Dev server**, `scripts/reel-dev.mjs`. Static repo server on 127.0.0.1 (default port 1337,
   next free if busy) with MIME types, `no-store`, byte ranges and traversal protection.
   `GET /__reel/ping`; `POST /__reel/save {file, text}` (only `Assets/*.script.txt`; parse
   first; 422 with the errors, else an atomic write plus a backup in `.local/reel-backups/`);
   `GET /__reel/events?file=` (SSE `change` when the file changes on disk, so a save from any
   editor reloads the preview).
2. **Cues in the scenes**, `Assets/sizzle-reel-2.html`. Every scene's typing speed, arrival
   (`in`) and exit (`out`) read `ReelScript.cue()`. Default output byte-identical (stills);
   a test script shows each cue moving what it should.
3. **Timeline panel**, `scripts/reel-timeline.js`. `E` opens a panel docked over the preview:
   ruler on the 0.5 s beat grid, playhead, tracks for scenes, items, beats and exit cues.
   Drag a scene's or item's edge (ripples), a beat, or an exit cue; click a scene for an
   inspector of its words, numbers and cues. Every change goes through the `set*` helpers and
   `REEL_LIVE.save`. Undo/redo survive the reload. Without the dev server, edits become a
   draft with Download and Discard.
4. **Faster, automatic delivery**, `scripts/render-sizzle-reel.mjs`. `--jobs=N` renders
   contiguous chunks in parallel pages and joins them without re-encoding. `--deliver` also
   writes the ≤ 14 MB web copy, a poster and `chapters.json` (read from the edit).
5. **Integration and demo.** Every suite end to end, a full `--jobs --deliver` render against
   the master, and a screen recording of the timeline editing a copy of the script.

## Later

Square and vertical layouts from the same script; scene-specific cues (line staggers, the
push); music cut to the 120 BPM grid; moving cut 1 onto the one player.
