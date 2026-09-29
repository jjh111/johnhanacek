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

## The editor on claude.ai (2026-09-29)

John asked to use the editor without running anything. The dev server needs a local checkout,
so the editor is also published as a claude.ai artifact: the same rig, timeline and rack.

- **One hook, three homes.** The rig, the timeline and the rack save through the dev server when
  it answers `/__reel/ping` with `server: 'reel-dev'` (stricter than a 200, because a host may
  answer any path with a page). Otherwise they save to `window.REEL_HOST` when a page defines one
  and its `ready` resolves true. Otherwise they keep a draft in the tab. The host's saved
  version plays in place of the file; Revert (`discardDraft`) deletes it and plays the file.
  Contract (documented in the rig where it reads it): `{ name, ready, load(path), save(path,
  text), discard(path), download(filename, text), media(path) }`.
- **Never wait on the viewer to start.** claude.ai asks the viewer before a page first uses its
  store, and the call waits until they answer. Version 1 of the hosted editor read the store
  before drawing, so it sat on a black screen behind that question (John saw exactly that). Now
  `load()` reads the store only when `permissions.state('db')` (which never asks) is already
  `granted`, gives up after 2.5 s either way (a later answer offers "Play it"), and the first
  save is what asks. Each save also leaves a copy in the tab, so the reload after a save plays it
  at once, whether or not the grant is remembered. A viewer's no turns saves into tab drafts. The
  dev-server check no longer holds the start either: the reel plays, and only saving waits on it.
  While it loads, a boot line names what it is waiting for, so a stall is never a black screen.
- **`scripts/reel-host-claude.js`** is claude.ai's host: the page's `db` capability, one document
  per file at `files/<name>` = `{ text, file, savedAt }`; downloads through the viewer's save
  dialog; media paths with a space become underscores (a published path cannot hold one); a
  first-visit card names the keys; the reel's place is kept for the tab across the reload a
  save causes.
- **`scripts/build-reel-editor.mjs`** writes the page and its 27 files (16.8 MB; the clips
  are the bulk) into `--out`, plus `files.json` for the Artifact tool's `files`. The page has
  no document shell of its own and starts with its title. `../` paths become flat. The chrome's
  light theme is switched off, so a light-theme viewer still gets the dark film.
- **Bringing edits home:** `ArtifactData get` of `files/sizzle-reel-2.script.txt` and
  `files/sizzle-reel-2.score.txt`, write them over the repo's files, check them
  (`reel-script.js check`, `reel-music.js check`), commit, render.
- **Test:** `reel-tests/hosttest.mjs` builds the page, serves it from a plain UTF-8 server with a
  stand-in for claude.ai's capabilities whose store calls wait on the viewer's answer, as
  claude.ai's do, and a light theme stamped on the page. It checks the reel starts asking
  nothing and stays dark, the first save asks and lands, the reload plays it at once, a rack
  change does the same, Download goes through the save dialog, Revert plays the file, a grant
  from before loads the saved version in a new tab, a slow store never holds the start, a no
  keeps drafts, and without the capabilities the page still plays.

Limits: the hosted page carries only the pictures and clips the script names when it is built,
so a new picture needs a rebuild and republish; it opens on the wide format.

## What John saw in the editor (2026-09-29)

John's first session in the hosted editor: some text sat too low (the title, scene 2, worst); was
that the editor or the film ("I need WYSIWYG")? The smaller fish shoved the big fish around (they
should be scared off by it). The coral could run wider along the bottom.

- **The editor is the film.** Measured, not assumed: the hosted page, built fresh and wrapped the
  way claude.ai wraps a page, paused at 13 moments in windows of 1280, 1600 and 2560 px, against
  the renderer's own frames (`?render=1`, `REEL.frame(t)`): 714 text and panel boxes, the largest
  difference 0.00 px. It was 1 px on the logo wall before `#stage` stated its own `font-size`
  (16px, what the film inherits): claude.ai's frame sets `body { font: 14px ... }`, and a line box
  sized by `line-height: normal` followed it. A hosted page must never inherit type from its host.
  The fonts cannot differ by platform either: Raleway's hhea and typo metrics agree (940/-234,
  USE_TYPO_METRICS set) and JetBrains Mono's three tables agree (1020/300).
- **So "too low" was real, in the film too.** The title and end copy were centred on their box,
  and an oval is not a box: the tagline's ends sat on the lower curve. `fitInOval(block, oval,
  clear)` measures each line's width at its top and bottom edges against the ellipse and moves the
  block to the nearest position where every line keeps `clear` (4% of the oval's width) inside.
  Title and end, every format; the wide title oval is 400 px tall (was 380).
- **The opening.** The engine lifts a new large fish into the upper half of the tank, which put
  the loop's fish 115 px above the loop and over the caption. The rig now sets it where it was
  drawn and holds it level until the caption is out.
- **Coral beds.** The command scene's two coral strokes are wide low rectangles
  (`JHStrokes.points.rect`); the engine grows a stalk per 20 px of width, up to 8, so each bed
  runs along the floor.
- **Right of way** (`largeRightOfWay`, a fish-engine host option, inert on every other page). A
  bigger fish takes no push, steer or separation from a smaller one; the smaller one resolves the
  whole overlap. With `calmSchool`, a medium fish is scared off instead of crowding in: it darts
  away, mostly sideways, for under a second, once it is within both fishes' reach (their
  bodyWidths plus 25 px; this big fish is 102), or 110 px further while the big fish swims at it.
  A big fish hovering in place scares nobody.
- **The big fish's parking, rebuilt around that.** The shoves had been hiding its fidgets: nothing
  pushes it now, so it no longer drifts toward its next spot. It stays while it is 60-400 px out
  on its side of the thing it looks at. A new look it already faces is judged by that band, not by
  the exact spot (a 14 px correction used to cost a turn through a full circle). Parked, it slows
  as it nears the band's top or inner edge; the slow swim, nose up, used to carry it 120 px up
  over a long look. A look can name its side (`look(t0, t1, x, y, side)`): the command scene
  says right, since the school is born on the left, and square and vertical used to swim the big
  fish straight into it. The school's patrol keeps 320 px from the big fish.
- **Measured, and now a suite:** `reel-tests/fishtest.mjs` simulates the cut at 60 Hz in the
  renderer's page and reads the tank after every tick. On the 60 s cut, before this change, the
  big fish was shoved 314 px and touched for 4.3 s in wide, 995 px and 14.8 s in square. Now it is
  never shoved (no tick over 0.5 px) and smaller fish spend under 0.5 s within reach, in every
  format; the suite holds that. U-turns: wide 6 to 4, vertical 7 to 2. Averaged over six seeds, a
  school member is scared off 4 times a cut in vertical, 12 in wide and 15 in square (square is
  cramped: 1080 px for the big fish, the school and the copy).
- **His edits came home** (`ArtifactData` → `Assets/sizzle-reel-2.script.txt`, checked by both
  checkers): the title runs 5 s with the tagline "Product Design Engineer | Artist", the answer's
  support line is "Tools for new thought", the feature's clip beats moved to @0.25 and @4, the
  logos run 5.5 s, and the end card reads "Science meets Craft". The cut is 63.5 s. Four suites had
  pinned the 60 s cut's numbers; they now read them from the script (the cut's total, the answer's
  length, cue moments counted from their scenes), so an edit in the editor cannot break them.

## Buttons, scene cards and Export (2026-09-29)

John, the same evening: the beats row did not make sense and its small marks could not be
selected; the items row was empty for every scene but one; the out marks floated apart from their
scenes; the timeline should zoom and its targets be bigger; how does the video get exported? And:
"give me interface controls, not just keyboard shortcuts."

- **Every key is a button.** The HUD has a transport (restart, scene back, -5 s, play, +5 s, scene
  forward, loop) and a tools slot. A tool adds its own button with
  `REEL_LIVE.addTool({ id, label, key, title, order, cls, onClick })`, which returns the button;
  the timeline, the rack and Export mark theirs `aria-pressed` while open. One table (`DO`) is
  behind the buttons and the keys, and every tooltip names its key. A mouse click leaves no focus
  behind, so space stays the preview's.
- **Scenes are cards.** Everything that belongs to a scene sits inside its card: its items (only
  results scenes have them; the gutter says so), its moments, and its out. Beats are now
  **moments**, the word "beats" having a musical meaning in an editor with a synth rack. A moment
  is any @ time: a beat's own line, or the @ that leads a stat or an award. `setAt` rewrites both,
  so the stats and awards drag like the rest. Each moment is a 24 px target: a diamond for a
  picture or clip, a square for a quote, a circle for a stat or award, named where there is room.
  Moments that crowd take a second row. The out is the hatched end of its card, with its handle
  on the "out" row at the card's foot. At fit zoom it used to sit on the card's resize grip; the
  grip now stops above that row.
- **Zoom**, from the whole reel (fit) to 360 px a second: the − fit + buttons, ⌘/Ctrl + wheel or
  a pinch (around the pointer), or `-` `=` `0`. The wheel scrolls a zoomed timeline. The view
  follows the playhead while it plays. A card scrolled half out keeps its name in view. The zoom
  and the scroll survive the reload a save causes. Clicking a moment, an item or an out opens its
  scene in the inspector with that line lit. Undo and Redo are buttons.
- **Export** (`scripts/reel-export.js`), one panel with three paths. On the dev server it
  renders there: `POST /__reel/render` { file, formats, fps } runs the renderer per format, one job
  at a time, behind the save's guard (JSON only, this server's pages only); `GET` reports each
  film's frame, frames and seconds left, read off the renderer's own progress line; `POST
  /__reel/render/cancel` stops it. The films are linked when done. On claude.ai, "Ask Claude to
  render" posts a comment and sends it to Claude (`comments.sendToClaude`, from the click). The
  artifact wakes the Claude session watching it. The request names the formats, the frame rate and
  the saved version (a six-character hash of the script). Claude renders it, uploads each film
  (Artifact, `asset: true`) and writes `films/latest`, and the panel lists those films with Open
  and Download. When no Claude session can receive the comment, the button copies the request
  and the panel says why. Anywhere else, it gives the renderer's command.
- **Tests:** timelinetest (37: the HUD's buttons, zoom, a stat dragged and undone by the Undo
  button, a moment's click, Export), devservertest (42: the render guards, one job at a time,
  progress, cancel; the render is started for real, then stopped), hosttest (the films listed, one
  comment sent naming formats and version, the no-session fallback), scripttest (`setAt` on a
  stat).

## Later

Scene-specific cues (line staggers, the push); moving cut 1 onto the one player; a music track
in the timeline (sections under the scenes); stems out of the renderer; per-format cues, should
a narrow frame ever need its own timing.
