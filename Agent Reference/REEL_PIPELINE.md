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

## Built (2026-09-27)

All five packages landed, built by medium-effort subagents, then reviewed. Every suite in
`Agent Reference/reel-tests/` passes: scripttest (25), devservertest (30), timelinetest (25),
cuestest and rendertest.

- **The loop:** `node scripts/reel-dev.mjs`, open the page it prints, press E. A drag or an
  edit saves the file, and the preview is back at the same moment, paused if it was, in about
  0.3 s. Before the fixes below it took about 2.8 s, while the preview waited for its clips.
- **Cues:** with no cues written, the film is unchanged. The one-time proof against stills
  from the pre-cue rig gave 10 of 11 byte-identical, the 11th off only by decode noise.
  `cuestest` now checks that every cue written out at its default films the same as none,
  and that each cue moves its moment.
- **--jobs:** a full `--jobs=3 --deliver` film matched the one-page master everywhere except
  1.3 s of logo edges after a chunk that began mid-scene (36 dB). Chunks now start at scene
  cuts, and every frame of a 10 s test range is 45 dB or better. Speed on this 4-core box:
  about 1.2-1.4×.
- **Fixes from review:**
  - The live preview no longer waits for clips.
  - The dev server lets the browser keep media (ETag, 304).
  - Pause survives a save (`#t=…&pause=1`).
  - `REEL_LIVE.reserveBottom(px)` replaces a stylesheet `!important` override.
  - The tests carry no machine paths.

Known, not yet fixed:
- After a reload, the live preview grows its tank at the moment it lands, so a fish can wear
  a different colour than in the film (colour follows spawn order). Films are exact. The fix
  is to fast-forward the tank on a virtual clock at load, as the renderer does.
- Tier chips pop at the question's Enter; `cue in` moves the answer, not the chips.
- Dragging an item's edge changes two lines, its ITEM and its results SCENE, because items
  hang from the scene's end, so the items before it stay put.
- Browser tests serve clips as VP9 stand-ins through Playwright, so reloads there take about
  2.5 s. Through the real server with real H.264 it is about 0.3 s.

## Formats: square and vertical (built 2026-09-28)

The same script plays in three frames: `?format=wide` (1920×1080, the default and the frame
the cut was made in), `square` (1080×1080) and `vertical` (1080×1920). Nothing in the script
knows about formats.

- **One table.** `FORMATS` at the top of the rig's script holds every rect a scene uses, per
  format: side margins `M`, the bar and tier rows, the copy centre `colY`, the tank band
  (`tankY`, `tankH`) and the fish depths in it (`spotY`, `schoolY`), the opening loop and its
  guide, the title and end ovals and the nav pill, each scene's windows, columns, port, panel,
  offer card and plan card, the command's strokes and the end card's taps. Wide's entries are
  the numbers the rig always had, so wide films as it did.
- **The type lives in the stylesheet**, under `#stage.narrow` (both new frames),
  `#stage.square` and `#stage.vertical`. Wide's rules are untouched.
- **The grid:** 72 px margins and one 936 px band in both narrow frames. The bar spans the
  band; tier chips and the pager sit on the row under it; every window, card and panel sits on
  the margins; copy centres on the band's middle (square 487, vertical 825).
- **Square keeps the wide split**, narrower: copy left (450) and the work right (450×540), the
  art's port on the right. The result list spans the whole band before the window dives out
  of its first thumbnail. The tank starts at 620 and shows from about 795.
- **Vertical stacks the split:** what was left goes on top. The result list, then each
  result's copy, sit above the window. The feature's window sits above its copy, and the art's
  port above its column. The tank is the bottom third (canvas from 1040, 880 tall; the
  choreographed fish sit around 1520-1570). The plan card spans the band.
- **Legibility:** at 1080 wide a frame plays at about a third of its size on a phone, so
  nothing that reads as copy is under 27 px (result snippets 27, copy lines 28 in square and
  34 in vertical, cites 28-30), labels are 20-26 px, and the fish's data chip 16.
- **Wrap before shrink.** In a narrow frame a masked line may wrap (its mask slides the
  wrapped block as one): eyebrows, copy lines, the answer's support line, stat labels, cites,
  window captions, award rows, the offer's lines and headline, the end line and the quotes.
  Headlines, balanced quotes, cites and the end line use `text-wrap: balance`, copy lines
  `pretty`. A cite breaks after its dot, never before it. The title's tagline stacks its three
  parts. The answer's four stats stay in one row with their labels wrapped. The client wall
  wraps its logos onto more rows. The offer's three columns become three rows.
- **Shrunk a step**, where wrapping alone did not fit the band: headlines (square 64,
  vertical 96, from 92), the answer (square 70), the name (92-100 from 116), the URL (80-84),
  the quotes in square (54/62) and vertical (64/80), the square's column quote (48) and the
  offer headline (square 46, vertical 66), the logos (44-50 from 50) and the data chip (16).
- **The fish** look at the same things, at the format's coordinates. In a narrow frame the
  data chip hangs on whichever side of the fish the camera still shows, or under it.
- **Renderer:** `--format=square|vertical` sets the viewport and the page query, refuses if the
  rig laid out a different size (`REEL.size`), and suffixes every output: the film
  (`sizzle-reel-2-square.mp4`), parts, stills (`sizzle-2-square-12.00s.png`) and `--deliver`'s.
  Every other flag works with it. Cut 1 has no formats.
- **Live:** `?format=` works in the preview, the stage scales to fit the window, and the HUD
  and the timeline (E) work as in wide.
- **Test:** `Agent Reference/reel-tests/formattest.mjs`: the stage size per format; every half
  second, every settled piece of copy inside the frame and its margins, unclipped, apart from
  the others and off the work; wide stills against stills from the rig before formats (all
  byte-identical or noise; the stills that show a clip are judged outside its window, because
  the unchanged rig decodes a video frame differently from run to run); the live preview with
  the timeline. `--layout-only` skips the renders.

## Music (2026-09-28)

John asked for music made by synths you can see and play, with editable effects, drawing on
his like-every-cloud repo. That repo's Sound Lab (`soundlab.html`) and `src/audio/synthVoice.ts`
supplied the vocabulary: a sound is a **patch as data** (osc/noise voices → filter → envelope,
one LFO on gain, filter or pitch), procedural drums and air, tape wow/flutter/age/hiss as a
treatment, and one home key so accents never clash (frequent sounds quiet and atonal, rare ones
in key). The reel's music is that vocabulary written as a score.

- **The score is the music.** `Assets/sizzle-reel-2.score.txt`, next to the script and named
  after it (a new cut copies both). Plain text in the script's style: `TEMPO`, `KEY`, `CHORDS`;
  `SYNTH <name>` and `DRUM <name>` blocks (`voice`, `filter`, `env`, `lfo`, `play`, `steps`,
  `notes`, `len`, `level`, `pan`, `send`; drums `kind`, `tune`, `decay`, `tone`); `FX` blocks
  (reverb, delay, tape, drive, comp, master); one `SECTION` per scene, by kind or number, with
  the tracks it plays (`name:0.5` for half level), its chords and an optional filter `sweep`.
  Its header is the manual.
- **Cut to the picture.** Steps are sixteenths (0.125 s at 120 BPM). A pattern and a chord
  progression start again at every cut, so each section's downbeat is its cut, even in a
  7-beat scene. A chord that repeats is held, not struck again.
- **The edit plays its own sound effects.** A track with `on key|space|enter|clear|cut|item|beat`
  plays at every such moment. The keys are `ReelScript.queries(edit)`, the rig's typing times,
  moved out of the rig so both read one list (the test proves the move is bit-exact).
- **`scripts/reel-music.js`** (UMD, pure): `parse` → `{ score, warnings, blocks, fields }`, mistakes
  thrown as `line N: …` rows; `moments(edit, ReelScript)`; `arrange(score, scenes, moments)` →
  `{ events, sections, sweeps, duration }`; `setLine`, `setArg`, `toggleTrack`, `setTrackLevel`
  change one line and re-parse. CLI: `check` (the arrangement, section by section), `json`.
- **`scripts/reel-synth.js`** (browser): `create(ctx, score)` builds the graph once (per-track
  gain, pan, reverb and delay sends; music bus → sweep filter; sfx bus; drive → tape → comp →
  master; seeded noise, a generated impulse response); notes are built per event. `Player`
  schedules 0.3 s ahead of the preview's clock and restarts on any seek, loop or pause.
  `renderOffline` mixes the film in an `OfflineAudioContext`, feeding notes a second ahead
  (all at once, the graph renders in quadratic time: 100 s for the 60 s cut; fed, about 18 s).
- **The synth rack, `scripts/reel-rack.js`.** M opens it at the right (`REEL_LIVE.reserveRight`),
  and the preview shrinks beside it. An arrangement matrix (sections across, instruments down,
  click a cell), then one module per instrument (voices with wave pictures, play mode, filter,
  envelope with its shape, LFO, mix; step grid with a playhead; ▶ audition; mute and solo, not
  saved), then the effects. Knobs drag, wheel, or take a typed value. Every control is one line
  of the score through the `set*` helpers: heard at once, saved when you let go (dev server, or a
  draft in the tab), one undo step per gesture. The preview never reloads for music; a save from
  a text editor reaches the rack through `/__reel/events`. Meters are dim and move only while
  the rack is open (the Sound Lab removed its scope for flicker on mini-LED screens).
- **The film carries it.** The renderer arranges the score in Node, mixes it in a blank page of
  the same browser, writes `<name>-music.wav` next to the MP4 and muxes it in as 192 kb/s AAC
  (the web copy keeps it at 128 kb/s). A part carries its own stretch. `--audio-only` mixes the
  soundtrack alone in seconds; `--mute` leaves it out. The log gives peak and integrated LUFS
  (the cut sits at about -16 LUFS, peak -3.4 dBFS).
- **Deterministic enough.** Two mixes agree to within a few 16-bit steps (-70 dBFS and far
  below): Chromium sums a node's inputs in an order that varies run to run, so float sums differ
  in the seventh digit. Everything else (noise, reverb, the clock) is seeded or offline.
- **Test:** `Agent Reference/reel-tests/musictest.mjs` (reader, arrangement on the grid, keys
  at the rig's times, one-line edits, mistakes by line, the offline mix's length, levels, fade
  and repeatability, a muxed part, dev-server saves, and the rack end to end: M, a knob drag,
  a step, a cell, three undos back to the original bytes).

Known limits: live notes already sounding when you seek come back in from their attack; the
rack edits values, not the score's structure beyond voices, play mode and steps (a new
instrument or section is a few lines of text); the music has been checked by measurement
(levels, spectrum, loudness), and taste is John's to tune in the rack.

## Later

Scene-specific cues (line staggers, the push); moving cut 1 onto the one player; a music track
in the timeline (sections under the scenes); stems out of the renderer; per-format cues, should
a narrow frame ever need its own timing.
