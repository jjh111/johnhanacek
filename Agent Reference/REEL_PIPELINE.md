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
  `{ file, src, parsed, draft, hosted, dev, host, version, scenes, duration, now(), seek(t),
  isPlaying(), setPlaying(bool), onFrame(fn(t, wallMs)), journal, save(text) → Promise<{ok, via: 'file'|'host'|'draft',
  applied, restocked, errors?}>, apply(text, from?), onChange(fn), settled(), discardDraft(),
  download(text?), debug }` (src, parsed, duration, draft, hosted and version are getters: an
  edit replaces them; `scenes` is one array whose contents an edit replaces). `save` plays the
  edit at once, in place (nothing reloads), then keeps it: through the dev server, else the
  page's host, else a sessionStorage draft for this tab. Every change of script reaches the
  tools through `onChange`. See "Edits in place" below. The rig loads the tools after defining it.
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
  (Artifact, `asset: true`) and writes `films/latest`, and the panel lists those films with Play
  and Download. When no Claude session can receive the comment, the button copies the request
  and the panel says why. Anywhere else, it gives the renderer's command.
- **Downloads inside claude.ai (2026-10-02).** The page runs in a sandboxed frame, where a link
  neither opens a tab (`target=_blank`) nor downloads (`download`): the films were first listed
  as Open and Download links, and John's click on Download "didn't give me anything". So a film
  plays in the panel (Play opens a `<video controls>` under its row; Close takes it away) and its
  Download fetches the film from the page (`/_blob/<id>`, same origin) and hands the Blob to the
  `downloads` capability (`REEL_HOST.saveFilm`), whose dialog asks the viewer first. Every
  download in the editor (the film, the script from the timeline or Export, the score from the
  rack or Export) now says what came of it where its button is: saved, the dialog answered no, a
  dialog already open, or a view that cannot save files (`REEL_HOST.said(result, what)`). On the
  dev server the films stay links, and a browser download says nothing back.
- **Tests:** timelinetest (37: the HUD's buttons, zoom, a stat dragged and undone by the Undo
  button, a moment's click, Export), devservertest (42: the render guards, one job at a time,
  progress, cancel; the render is started for real, then stopped), hosttest (the films listed with
  Play and Download and no links, the player fetching the film, the film handed to the save dialog
  as a Blob, a no said; one comment sent naming formats and version, the no-session fallback),
  scripttest (`setAt` on a stat).

## The media picker (2026-09-29)

John: "give me a better media picker for the img/video per slot (I don't memorize file names)".

- **The library** is `scripts/reel-media.mjs`: every clip and every picture of 400 px and up in
  the top of `Assets/` and in `grad/`, `blokdok/` and `posters/` (83 files, 39 MB). A `.jpg` or
  `.png` with a `.webp` twin is left out; a clip's `<name>-poster.webp` is its thumbnail's source,
  not a picture of its own. ffmpeg reads each file's size and length once (cached by bytes and
  date) and makes a 320 px webp thumbnail (about 10 KB) in `.local/reel-media/thumbs/`.
- **The picker** (`scripts/reel-picker.js`): a grid of thumbnails with name, size and a clip's
  length; the slot's own file marked NOW, the reel's others IN THE REEL; search by name or
  folder, folder chips, and "in the reel"; a clip plays muted while the pointer rests on it;
  arrows move, Enter or a click picks, Esc shuts. The inspector's `img` and `video` lines are
  chips (thumbnail, name, Change…) that open it, with the name still typeable under the chip.
  A pick is one `setField`; a clip shorter than the slot's `from` also sets `from 0`, since an
  in-point past the end shows nothing.
- **Where the catalogue comes from:** the dev server (`GET /__reel/media`, thumbnails at
  `/__reel/thumb/<key>.webp`, the key naming the file's version); the claude.ai build, which now
  carries `reel-media.json`, `reel-thumbs/` and every file in the library, so a pick plays in the
  preview at once (188 files, 40.8 MB); anywhere else, only what the script already uses.
- **Tests:** devservertest (the catalogue, a clip's length, what is left out, a thumbnail's
  bytes, a 404), timelinetest (the chip, 76 pictures with the slot's own marked, search and
  Enter, a too-short clip's in-point reset, Undo), hosttest (the library travels with the page;
  a pick saves to the store).

## Buttons that fold (2026-09-29)

John: "button labels can be too large for the button size, have icons and collapse rule for
responsive". At 820 px (a claude.ai side panel) "Export video" overflowed a 24 px button, the
HUD's tools ran off the window, and the inspector squeezed the cards to a strip.

- **One kit**, `scripts/reel-ui.js`, loaded before the rig's own script: 31 icons drawn on one 16 px grid in
  `currentColor`, and `REEL_UI.button({ icon, label, key, title, cls })`, whose anatomy every bar
  folds: an icon, a label (`.rl`) and a key hint (`kbd`). The label is also the accessible name,
  and the tooltip keeps the name and the key when the label is folded away. `relabel` changes a
  button's words in all three places at once (the sound chip).
- **The collapse rule** is `REEL_UI.fit(bar, steps)`. Buttons never shrink (`flex: none`). While
  anything overflows (the bar, or a button's own content), the bar takes the next class in
  `steps`, each on top of the last, cheapest first. When it grows, it gives them back as far as
  it fits. It is measured, not set by breakpoints: fonts differ, and tools add their buttons
  after the bar is drawn. A ResizeObserver on the bar and on each of its children re-runs it, so
  a label that changes or a tool that arrives refits it as surely as the window does.
- **The HUD** folds in six steps: key hints, the tools' labels, the scene's name, the three seek
  buttons (restart, −5 s, +5 s move into a More menu above the bar), the time, and last the scrub
  bar takes a row of its own. **The timeline's status bar** folds in five: labels (Export video
  keeps its label longest), the total, the save line, Export's label, the zoom readout and Fit.
- **The panels** change shape by their own width. The timeline's inspector sits beside the cards
  at 440 px, or 44% of a narrower panel; under 760 px the gutter's names go and the inspector
  opens over the whole panel with its own close. The synth rack sits beside the preview in a
  window of 1080 px and up; in a narrower one it lies over the preview, opaque, as wide as the
  window allows, and stops at the HUD so the transport and tools stay in reach. Export and the
  picker were already fluid dialogs; they gained icons, and the picker keeps two columns on a
  phone.
- **Measured** at 1440, 1024, 820, 600 and 390 px wide with the timeline, the inspector and the
  rack open: no button or bar overflows, and none leaves the window
  (`reel-tests/timelinetest.mjs` checks 820 and 390).

## Directing the fish (2026-09-29)

John: "we can remove the gradient that hard hides the fish, let them swim around and be viewed.
bring in some mvp waypoints for the fish / settings timings and performative controls for
attention, idles and actions."

- **Nothing hides a fish.** The tank's mask faded the top 38% of its canvas out, and a fish that
  rose to look at something faded with it. It is gone; the canvas and the fish's water are where
  they were (the bottom of the frame), so every frame without fish lines is the frame it was.
  The live preview also keeps the HUD's strip clear of the picture: its gradient sat on the
  coral and the fish whenever the window was wider than the frame.
- **Fish lines** in the script, one per direction, inside a scene:
  `fish @<s> <who> <what>`. Who: `big` (the fish drawn in the opening), `school` (the four the
  command scene makes) or `all`. What: `to x y` (swim to a point and stay there), `look x y |
  auto | off`, `idle hover | sweep | circle | wander`, `pace 0.3-3`, and once, at their time,
  `dart` and `turn` (the big fish), `scatter` and `regroup` (the school), `feed x y` (no who: the
  food is for any fish). Points are fractions of the frame (0-1 across, 0-1 down), like `focus`,
  so one line serves wide, square and vertical. `to`, `look`, `idle` and `pace` hold until the
  next line of their kind for that fish, or the scene's end (until 2026-10-02: now across the
  cuts, see "Fish lines that outlast their scene"). `reel-script.js` reads them
  (`readFish`/`writeFish`, every mistake a sentence: "only the big fish can dart; the school
  scatters"), lists them on the cue sheet, and edits them like any line: `setAt` moves one's @,
  `addLine` and `removeLine` put one in and take one out.
- **The director** (the rig, beside the scenes' own attention). A scene without fish lines swims
  exactly as before: the committed rig and this one put every fish in the same place, 0 px apart
  at every quarter second of the cut. With lines, the big fish's `steer` hook goes to its spot
  (kept in the water: 140 px off the sides, 120 below the tank's top, 80 above its floor) and
  hovers there nose toward what it looks at, or sweeps across it (up to 260 px each way), circles
  it (an ellipse up to 140 × 64 px, the way it already swims), or is let go to the engine's own
  swimming (wander). Sent across the school's path it swims round underneath rather than waiting
  behind it: the scenes' own courtesy (slow to a crawl) deadlocked against a school going the
  other way. The school's `schoolTarget` sweeps, mills (hover), circles or wanders about its
  spot; the engine still keeps it in the upper water. Dart (a burst straight ahead, 0.55 s),
  turn (about-face in 1.2 s), scatter and regroup (the engine's own phases, now callable:
  `tank.schoolPhase(name)`) and feed are EVENTS, so a render plays them to the frame.
- **The Fish panel** (`scripts/reel-fish.js`, F, a fish in the HUD): choose the big fish, the
  school or both, then press. Every control writes one line at the playhead into the scene under
  it. Paused, a press saves at once; playing, presses gather into a take (a red strip counts
  them) that pausing keeps in one save. Place / A point / Feed make the next click on the stage
  the point. The panel says what the chosen fish is doing now and lights its current idle, look
  and pace. While it is open the stage shows the water (dashed) and this scene's spots, look
  points and food, numbered, with each fish's path between its spots; drag a mark to move it,
  click it to jump to its moment. Its saves go on the timeline's undo stack. It sits beside the
  preview in a window of 1100 px and up (the stage makes room, `REEL_LIVE.reserveLeft`), over it
  in a narrower one. Keys while open: D T S G for the actions, 1-4 for the idles.
- **The timeline** shows fish lines as gold triangles among a scene's moments: drag one to
  retime it, click it for its line in the inspector.
- **Tests:** scripttest (the grammar, round trips, every mistake), fishdirecttest (in render mode,
  all three formats: the big fish reaches its spot, the school its side, scatter spreads it,
  circle goes round, dart bursts, turn about-faces, wander hands back to the engine, food lands),
  fishpaneltest (Dart writes its line and never a second, Place and a stage click, a mark
  dragged, Undo, the school's scatter key, a two-line take kept on pause, delete, an 820 px
  window), formattest (the stage fits above the HUD).

## The fish, coherent (2026-09-30)

John, after trying it (and saving four fish lines in the hosted editor, now in the repo): the
attention should show in the timeline; a press left the old button lit while its line appeared;
surface the controls better and make them editable; one coherent way through the timeline, the
behaviours and placing on the stage.

- **Why the old button stayed lit:** a line written at the playhead was rounded to the nearest
  0.05 s, so half the time it began just after the playhead, and the panel (rightly) showed the
  state before it. Lines now land on the grid step at or before the playhead.
- **The timeline's fish lanes.** Under the cards, a lane for the big fish and one for the school:
  the rig's own account of each fish across the cut (`REEL_LIVE.fish.track(who)`), cut into spans
  wherever what it does changes. A span says what the fish looks at (each scene's attention now
  has a name: the title, the answer, the picture, the plan, the work, the clip, the logos, the
  quotes, the offer, the end card) and, where a fish line decides, how it idles. Cyan is the
  reel's own choreography, gold a fish line's, hatched nothing to look at (it swims freely), a
  dashed outline before the fish is drawn. Every fish line is a gold mark in its fish's lane
  (both lanes for `all` and for food), with the same icon as its button in the panel: drag it
  to retime the line, click it to edit it in the panel. Click a span to jump there with that
  fish chosen. Fish lines left the moments rows, which are the scene's content again.
- **The panel has one shape.** At the top the fish (Big fish / School / Both). Under it the
  **selected line's editor**: when, who, what it does (a menu: switching keeps what it can), its
  point (typed, or Pick on the stage, or "Scene's" for `to auto`), idle, pace, Delete; each
  change one save, and the line stays selected through the reload. Then **At the playhead**: a
  sentence ("The big fish looks at the work and circles at its spot (0.4, 0.68)") and one row of
  buttons per kind (Look at, Idle, Pace, Spot, Once) with what the fish does now lit; press
  another to change it from the playhead on. Then **this scene's lines**, numbered in time
  order: click one to select it.
- **One selection, everywhere:** its row, its numbered mark on the stage (gold, filled) and its
  mark in the fish lanes (gold, filled) light together, whichever of the three picked it
  (`reel-fish-select` events; `REEL_FISH.select(ln)`). A new line comes back selected.
- **Attention on the stage:** while the panel is open, a dotted line runs live from the chosen
  fish to what it is looking at, labelled ("the big fish looks at the work"): cyan for the
  scene's own, gold for a point a line gave it.
- **`to auto`** sends a fish back to the scene's own spot, beside what it looks at: a way to
  end a waypoint inside a scene.
- **Tests:** fishpaneltest (24: the lit button follows a press between grid steps, Sweep
  rewrites Circle at the same moment, the lanes' spans and marks, a lane mark selects its line,
  the editor's point, verb and time, the take, Delete, 820 px), scripttest (`to auto`).

## Edits in place (2026-09-30)

John: "the entire artifact refreshes whenever I move anything". Every save ended in
`location.reload()`, because the rig built the film once, as the page opened. On claude.ai that
was the whole artifact starting again: the clips fetched again, the tank regrown from nothing
(the fish being directed jumped back to where they were born), every panel put back from
storage. Now nothing reloads for an edit.

- **The film is a function.** `build()` fills every registry (MEDIA, EVENTS, LAYOUT, QUERIES,
  TICKS, ATTN, BORN, the director's DIR and LOOKS) and the scene DOM from the script, in the
  same order as before, so renders are unchanged: 15 frames per format, and the fish in them,
  identical to the committed rig's to the byte (wide, square, vertical), and every suite green.
- **`applyText(text)`**, live only: parse (a script with mistakes is refused, nothing changes),
  then `timeScenes()`, `build()` and LAYOUT in one task, about 20-30 ms, no frame drawn in
  between. The playhead, the play state and the loop stay. The frame it draws is the frame a
  fresh load of the edited script draws at that moment, to the pixel (applytest).
- **Clips and pictures are kept.** Live, a clip is fetched once, as a blob (`CLIPS`, by
  file); the `<video>` and `<img>` elements a build made wait in `POOL` while the next build
  takes them back, still loaded. What the new build does not take is let go.
- **The tank keeps swimming.** Every event has an id: `spawn big`, `spawn fish 2`,
  `food 10 2`, `fish 5 @2.5 big dart` (its scene and its time there, so moving another scene
  does not make it new). An edit regrows the tank only when the spawns already due differ (a
  fish or the coral born on the other side of the playhead); otherwise the fish carry on, and
  an event that is new and already due runs at once (food written at the playhead drops;
  a dart pressed while paused plays, and ends on the wall clock, since a paused reel's clock
  stands still). Each fish keeps the side it chose of a thing it was already looking at.
- **Saving is behind the picture.** `save` = apply, then keep: one save at a time, the latest
  text last, each promise answered when its text (or a later one) is kept. A save that fails
  keeps the edit as a draft in the tab and says why. `settled()` resolves when everything is
  kept: Export waits on it, because the renderer reads the file and Claude renders the store.
- **The tools follow.** `onChange` (a microtask after the rig has changed): the timeline
  re-reads its model and draws its cards again (`populate()`), keeping the zoom, the scroll,
  the inspector's scene, its scroll and the field you were typing in; the Fish panel re-reads
  its lines and keeps the selected one (by its words, else by its line); the synth rack
  re-arranges the score against the new cuts; Export and the picker read the script as it
  plays. Undo and redo are saves, so they are instant too.
- **Other editors.** With the dev server, a change on disk plays here in place; this page's
  own saves come back as no news (`MINE`), and a draft here is kept. On claude.ai this tab's
  copy of a save now carries its time, and the store is read behind it: a newer save there
  (another tab's, or one Claude wrote) is offered ("A newer save of the script is here · Play
  it · Keep mine"), and plays in place. The tab copy used to win outright, which is how an old
  header came back into the store on 2026-09-30.
- A reload by hand still comes back to the same moment (`#t=`), and the panels to where they
  were (sessionStorage).
- **Tests:** applytest (18: the same frame as a fresh load, twice; no piling up over ten
  edits; the clips kept; the tank kept for a fish line, regrown when the school's birth moves
  past the playhead; food at once; the clock, the loop, a shorter cut; a mistake refused;
  another editor's save, and our own echo). timelinetest (55), fishpaneltest (26) and hosttest
  now fail on any reload, or any regrowth for a fish line. rendertest reads its scene cuts from
  the script (it had the cut's timings from before John's first edits written in).

## Scrubbing, the timeline, and words on the stage (2026-10-01)

John: "when scrolling around on the timeline the pop effect is playing over and over. do a final
UI alignment pass ... apply icons for the tracks (reword items results, what does this actually
mean? ...) ... is it possible to get direct manipulation of the text in situ".

- **No more pop.** Live, every step back in time regrew the tank from nothing: each fish jumped
  to where it was born, the coral dropped in again, and every food event before the playhead fired
  again, ripple and all. A scrub is a stream of steps back, so it popped over and over. Now a spawn
  remembers what it put in the tank (`ev.made`), and `rewind(t)` takes out only what was born
  after t, through the engine's new `remove(fishOrCoral)`. Every fish already there swims on from
  where it is. A momentary event (food, a dart, a scatter, a regroup) happens only when the clock
  plays through it (`simulate(t, played)`: the reel is playing, nobody seeked since the last
  frame, and that frame was earlier and less than 0.5 s back), so a seek or a scrub drops nothing. A spawn happens however the clock
  got there, so the tank always holds what it should. A render never steps back and keeps the
  regrow; its frames and the fish in them are the committed rig's, to the byte, in all three
  formats.
- **The sound did it too.** The live player started the music again at every jump, so a scrub
  while it played was a restart a frame: the pads clicked, and the score's `pop` (a sound effect
  on every beat) went off over and over near a beat (18 pops and 64 restarts in one short scrub,
  measured). Now the player compares how far the reel moved with how far the wall clock did, by
  the frame's own clock (`onFrame` hands each tool the `performance.now()` its playhead was read
  at). One jump (a click, a key, the loop) starts the sound again at once; a second within 0.2 s
  is a scrub, and the sound waits, silent, until the reel has played on smoothly for 0.2 s. A
  drift between the audio's clock and the reel's is closed by moving what comes next, never by
  starting over. The ruler holds the reel still while you scrub it, like a video player, and it
  plays on from where you let go. And a seek someone makes (not the loop, not play) marks its
  frame as not played through, so nothing momentary in a short jump happens either.
- An edit restocks the same way: a spawn still due keeps what it made; one whose birth moved
  past the playhead is taken out; one that moved before it is put in. `save` and `apply` report
  `restocked` (it was `regrew`). `REEL_LIVE.debug.regrows` counts regrows, for the tests: live,
  it stays 0.
- **The view stays where you put it.** Playing and zoomed in, the timeline scrolled back to the
  playhead every frame, under your hand. The panel's own scrolls go through `scrollTo`, so a
  scroll it did not make is yours, and the view stays there until the playhead jumps, play starts
  again, or the playhead comes back into view.
- **Tracks are icons.** Each track is named by an icon in a 34 px column (time, scenes, works,
  moments, out, the big fish, the school), its name in the tooltip, and the lanes start right
  after it. Lanes and gaps share one scale, one rule parts the cards from the fish lanes, and no
  padding is doubled: the panel is 248 px tall. The close button sits in the status bar after
  Export; ⌘Z works with the panel shut.
- **"Items" are works.** "items (results only)" meant the ITEM lines of the results scene ("what
  has he shipped?"): the works it shows one after another. The lane is called works now, each
  named by the first part of its eyebrow (Nanome, BadVR, OpenProse), and the inspector says
  "work 2: BadVR". The inspector also lists the scene's fish lines; a click selects one in the
  Fish panel.
- **Words change where they stand** (`scripts/reel-text.js`). Paused, a line on the stage that
  came from the script shows a dashed gold outline under the pointer, framed to its words.
  Double-click it and type: Enter keeps it, and so does clicking away; Esc puts it back. One line
  of the script changes, through `setField`, and plays at once, in place. A part is written back
  in the script's own words (`ReelScript.writeValue(kind, value)`): a stat's label beside its
  number, a cite's role beside the name, an award beside the others. A double-click while it
  plays pauses it first. A hint names the keys the first few times. Its saves go on the
  timeline's undo stack, so ⌘Z takes a word back like any other edit. What the script does not
  hold (the media kit's logos and the offer's heading, the rig's own Plan, Receipt and ✓) is
  edited where it was before.
  - The rig tags, live only, every element it draws from a script line: `data-ln` (the line) and
    `data-part` (`all`, `label`, `yr`, `text`, `what`, `title`, `micro`, `part:N`, `k`,
    `line:N`, `pair`, `cta`, `letters`). A render carries no tags. The bar's question is tagged
    per frame, and is not repainted while it is being edited.
  - `window.REEL_TEXT = { editing, lines(), edit(ln, part), commit(), cancel() }`.
- **Tests:** applytest (21: scrubbing back and forth keeps the same fish, regrows nothing and
  drops no food; back past the school's birth takes it out, forward draws it in; playing through
  the end card's taps drops food), texttest (20, new: tags live and none in a render, the outline,
  a whole line and each kind of part, the bar's question, Esc, a refused `|`, ⌘Z byte for byte),
  timelinetest (60: the icon column, the works' names, the panel's height, a scroll that stays
  while playing, a ruler scrub that holds the reel and plays on), musictest (seeking every frame
  while it plays: 2 restarts and no pop, where it was a restart a step; let go before a beat, its
  pop sounds once).

- **Open: a fish in the big fish's way (from John's edits of 2026-10-01).** His waypoint
  `fish @0 big to 0.16 0.75` as the results open sends the big fish left through the school.
  A medium fish gives way down and to the left, into the floor's edge zone; the edge steering
  turns it back up, and it crawls in front of the big fish at about 1 px a tick (25.5 to 27.2 s
  in wide). fishtest counts 1.75 s within reach in wide and 0.5 s in square, against its 0.5 s
  limit; with the script as it was before these edits (the waypoint at 0.62) there is none. Keeping the give-way flight out of the edge
  zones was tried and made it worse (5 s over seven encounters: the tank is chaotic, so one
  change moves every later meeting), so it was not kept. Either the waypoint moves, or the
  give-way is tuned with the whole cut watched.
- formattest's wide reference stills (local, `.local/reel-tests/format/wide-ref/`) were filmed
  again for John's edits of 2026-10-01, from the rig before this round. Recording them in a
  fresh worktree showed a first-run effect: that run's stills differed from every later run's at
  36.5, 43, 49 and 53.5 s, the old rig's and the new rig's alike, to the pixel. So the references
  are a later run's, and the old ones are kept beside them (`wide-ref-0930`).

## The music under the timeline (2026-10-01)

John: "the music timeline needs to be brought into the context of the other timeline, right
underneath (collapsable, with proper controls)". The arrangement lived only in the synth rack, a
small matrix scaled to the rack's width, with nothing lined up against the scenes.

- **Under the fish lanes, on the same clock.** A head row: a block per section, over its scene's
  card to the pixel, naming its chords and how many instruments play (♪8); the section the
  playhead is in is lit. Open (the chevron and note in the icon column), a lane per instrument:
  a cell per section, lit in the instrument's colour (the rack's palette) where the score plays
  it, as strong as its level, its name and level written in it; a silent cell is a dashed outline
  with the name, to click. Then a lane per sound effect, a mark at each moment it sounds:
  sounds closer than 0.12 s are one mark, so a question's letters make one span and a chime's
  notes one tick. Shut, the music is its head row alone (the panel 236 px shorter).
- **Controls.** Click a cell: the instrument plays there or stops (`ReelMusic.toggleTrack`, one
  `play` line). Drag a lit cell up or down: its level, live in the cell, written on release
  (`setTrackLevel`, 0.05 steps); Alt-click: half or full. Shift-click: the synth rack opens at that
  instrument's module (`REEL_RACK.focus`). M and S beside each lane, in the icon column with the
  instrument's colour: mute and solo in the engine for listening, never saved; a silent lane dims
  (`REEL_RACK.mute`, `solo`, `mix`). A click on a sound effect's mark plays from just before it.
- **One Undo.** The score's edits go through the rack (`REEL_RACK.change`), which plays them,
  keeps them (the file, the host, a draft) and keeps their undo texts, as before. What is new is
  one history over both files: `REEL_LIVE.journal` (`note(kind)` a new edit, `step(kind, back)` an
  undo or redo of one, `peek(back)` the kind the next would touch, `drop(kind)` an edit that did
  not happen), in sessionStorage. The timeline, the Fish panel and the words on the stage note
  `script`; the rack notes `score`. The timeline's Undo, Redo and ⌘Z ask the journal and undo
  the right file: drag a scene's edge, click a cell, and ⌘Z takes back the cell, then the edge.
- **The rack tells.** It fires `reel-score` on window after every change of its score (an edit, an
  undo, the cut, the file or the host), of the mix and of the sound, and once when it is ready.
  The timeline draws the music again on the next frame, only when what it shows changed (else it
  only relights M, S and the dimmed lanes). A shut rack no longer redraws itself for each change.
- **A short window.** The panel is as tall as what it shows (510 px open at 1600×1000). Past what
  the window can spare (the preview keeps 200 px), it stops, and its lanes scroll up and down
  under a ruler that stays; the M and S column moves with them. The wheel then scrolls up and
  down; Shift + wheel, across.
- **Tests:** musiclanestest (25, new: the heads over the cards, the lanes and their lit cells,
  a span of keys per question and a tick per Enter, the one Undo across both files and Redo, a
  click, an Alt-click and a drag written to the score file, M and S in the engine and never the
  file, a mark's seek, shut and open and shut across a reload, a 640 px window). timelinetest's
  panel-height check allows the music's one row.

## The music as one piece (2026-10-01)

John: "the music is currently chunked into the sections in a hard way, but it should flow
between and bridge, redo the music itself focusing on coherence of the whole video, and the
interface should support that". The arranger started every section's patterns, melody and
chord list again on its picture cut. Cuts land on beats (the script's 0.5 s grid), not on
bars, so the groove jumped at each one; notes were cut off at a section's end; instruments
switched on and off at the cut; each section's chords ignored the last section's.

- **One clock.** Bars (2 s) and steps (0.125 s) count from the reel's 0, and a steps pattern
  runs on it: every kick in the cut sits on a step its pattern plays (musictest), across every
  seam. An arp's place in its run counts every note since 0, so its line carries on too.
- **Where a section's music starts.** On the bar line nearest its cut when that is a beat away
  or less, else on the cut itself (`start bar` or `start cut` decides for one): title 2 s (its
  cut 2.5), answer 8 (7.5), results 22 (21.5), feature 34 (34.5), logos 40 (39.5); command,
  quotes and end on their cuts (17, 45, 59, a bar's half from either bar line). It ends where
  the next starts. Its chords change on its start and then on every bar line (a first piece
  shorter than half a bar joins the next bar; `F:2` holds two); its melody starts on its start.
- **The seams.** A section's `into` says how the music arrives there: `fade [beats]` (2: a
  crossfade centred on the seam), `swell` (4: in over the beats before it, on a soft rise),
  `build` (4: a fill on the snare, eighths then sixteenths, louder all the way, standing in for
  the snare's own pattern, a rise, then a crash and the section's hits on the arrival), `drop`
  (1: the drums and the bass silent for the beats before it, then a crash) and `cut`. Each
  instrument that flows (patterns, chords, melodies) has a level across the cut,
  `A.levels[track] = [{ t, v }]` (linear between points; two at one time a step), made from its
  sections' levels and the seams; its notes run on into a fade, so a leaving instrument rings
  out instead of stopping. A hit (a drum with no steps, a synth that plays hit or rise) lands on
  the picture cut, or after a build or a drop on the arrival. `A.transitions` lists the seams
  (their kind, beats, window); `A.harmony` the chords with their times.
- **The synth** routes each note through its track's arrangement gain (`gen → arr → chan`),
  automated from `A.levels` by `E.automate` (live and offline alike); a seam's own notes
  (`bypass`) go straight to the channel (`genX`), so a fill sounds even where the snare's level
  is nothing. A `crash` drum joins the kinds.
- **The score, written again** (`Assets/sizzle-reel-2.score.txt`): A minor, the loop Am F C G
  shared out across the sections so each starts where the last left off (open Am; title F C G;
  answer Am F; art C G; command F:2 G:2 to the chorus; results Am F C G with the hook; feature
  C G Am; logos F G:2; quotes Am F:2 C E:2, leaning on the dominant; offer Am F G; end Am9). A
  4-bar hook on the lead in both choruses; a bell plays its first bar as a call over the open,
  the breakdown and the end, where it resolves on A. Filters open across the intro (400 →
  1800 → 12000 Hz), lift through the command, hold the breakdown at 2400 Hz and close over the
  end. Seams: a swell into the title, a drop into the answer (the groove lands on a downbeat
  with a crash), fades through the verses (a longer one, 4 beats, into the breakdown), builds
  into the results and the offer, a drop into the end. Measured offline: peak -3.4 dBFS, -15.9
  LUFS; the only steps over 7 dB are the arrivals (the title's boom, the crashes at 8, 22 and
  54 s, the drop at 59 s); every other seam moves a few dB.
- **The timeline shows it.** The music's head blocks sit where each section's music plays, a
  dashed line where its picture cuts when the two differ; its chords sit on their bars over a
  faint bar grid; a chip on every seam names how the music crosses it (gold when the score sets
  it) and a click writes the next way in (fade, swell, build, drop, cut) as the section's
  `into`; the seam's stretch glows across the lanes. Each flowing instrument's lane carries a
  ribbon of its level across the cut, the ramps of its fades and builds plain to see; the cells
  are outlined where an instrument plays (a hit's cell filled as strong as its level); a
  build's fill, rise and crash are gold marks on their lanes. `check` prints each section's
  seam and how far its music leads or follows its cut.
- **Tests:** musictest (the groove's continuity, the starts, chords on the bars and held
  ones, a build's fill, rise, crash and boom, the fill standing in for the snare, a drop, a
  fade's levels, the lead ringing on past the chorus, into and start refused when wrong, and
  the mix: every section sounds, nothing clips, the results louder than the art);
  musiclanestest (31: the heads where the music plays, chords, cut lines, a chip per seam and
  a click that writes the next way in and undoes, the ribbons and their ramps, the builds'
  marks).

## The music, simple, and what it plays (2026-10-02)

John: "the score itself is too convoluted, the blocks show only that it's happening not what's in
it. simplify the whole music itself and show it better in ui. there's some simple elements, and
show sound effect cues too. all synth."

- **Six parts and four sound effects, all synth.** kick, clap and hat (the beat), bass (the
  chord's root on the eighths), chords (the chord, held for its bar) and lead (the tune: four
  bars, once round the chords); keys, select, enter and pop, which the edit plays itself. Gone:
  boom, crash, riser, arp, glass, bell, shaker, and the space key (a space types silently, so a
  question reads as words). The score's header explains the format in one screen.
- **One loop, going round.** `CHORDS F C G Am`, one a bar, goes round on the reel's own bars
  from its first frame (until now each section started its own chord list again on its start);
  the tune (`notes`) loops from 0 with them, so the two always agree, as the steps already did.
  A section says only which parts play, how loud, and how the music arrives (`into`); one that
  names its own `chords` plays them from its start (the end holds Am). F C G Am, not Am F C G,
  so that both choruses arrive on Am (the results at 22 s and the offer at 54: the loop's fourth
  bar) with the tune's head, E E D C A.
- **A part plays wherever its level is above nothing, as one part.** The arranger makes each
  part's notes over the stretches where its level is above nothing (its fades included), no
  longer section by section: a chord held over a seam inside a bar is held, never struck again
  (F over the art/command seam at 17 s), and a tune is never restarted. In `notes` a note lasts
  until the next one, `len` steps at most (the bar from 22 s: 4, 2, 2, 4, 4 steps).
- **The arrangement.** The open: the chords alone, filtered open (500 → 9000 Hz). The title: the
  chords, the tune at half, the bass at half, swelling in. The answer: the groove lands (kick,
  hat, bass, chords) after a beat's drop. The art: hat and bass at 0.7, the chords. The command:
  the kick back, the clap at 0.7. The results: everything and the tune, after a build (a fill on
  the clap). The feature: no clap, no tune. The logos: the clap back. The quotes: the chords, the
  tune at 0.7, the bass at half, fading in over 4 beats. The offer: everything, after a build.
  The end: the chords hold Am after a drop, closing (9000 → 900 Hz). Measured offline: peak
  -4.0 dBFS, -16.8 LUFS integrated; every section within half a dB of the old mix but the end
  (-22.6 dB mean: a held chord, closing).
- **The timeline draws what each part plays.** Each part's lane is as tall as its notes need (a
  drum 14 px, a pitched part 18-30 px by its range) and draws every event: a hit is a tick,
  taller when louder; a note sits at its pitch, as long as it sounds; fainter where its level is
  lower (four strengths: velocity × the level where it starts); a build's fill in gold; behind,
  faintly, its level across the cut, so where it plays and how it fades is the lane's shape. One
  SVG per lane, its paths made again on every zoom (`REEL_UI.rollPaths`; the synth rack's
  arrangement draws with it too). The blocks are now stretches to click (outlined on hover, the
  level written on hover when it is not 1); a lane's name stays at the left of the view, what it
  plays in its tooltip. The head's chords run across seams (a chord held over one is one label).
  Open, the panel is 440 px at 1600×1000 (it was 510).
- **The cues.** One lane for the sound effects, read from the edit: a box for each question
  while it stands on the bar, with its words; a tick for each key typed before it; an Enter;
  the select-all that clears it; and a dot for each pop on an @ moment (its tooltip names the
  picture, clip or quote that comes on). A click on a question plays from just before its
  typing, on a dot from just before the pop. The lane's M and S mute or solo every sound effect.
- **Also:** the rack's step lights follow the reel's own clock (they counted from each section's
  start); `ReelMusic.levelAt` is shared by the timeline and the rack.
- **Tests:** musictest (the loop across every cut, a section starting mid-bar on the bar's
  chord, the end's own Am, a chord held over a seam, the tune going round from 0 and its note
  lengths, the clap's fill, the drop, the fades, six parts and four effects, the mix);
  musiclanestest (34: every event drawn once on its lane, the lead at as many heights as it
  has pitches, the fills in gold, a louder kick a taller tick, the stretches, a box per question
  with its words, a tick per key, an Enter each, a select-all per clear, a dot per pop, the
  cues' M for every sound effect, a question's and a pop's seek).

## The music on its own bars: parts, pads and clips (2026-10-02)

John: "I still can't move the edges of the audio elements or adjust them. think ableton mixed
with easy pad. consistent musical setup, standard; aware of the other sizes but its own clear
time signature timeline." The music was one SECTION per scene: nothing to drag, and its
stretches were the picture's. (His tab had also kept playing the older score, and his 12 saves
on claude.ai went onto it: arp and kick added to the art, a riser into the offer, a longer bass
decay, more reverb on the arp. They are in the new arrangement.)

- **The format, as a music program has it.** Sounds (SYNTH, DRUM: unchanged but for steps and
  notes, which moved to pads). Parts: `PART drums` with its pads, `pad beat kick X...x...X...x...
  clap ....x.......x...  hat ..x...x...x...x.` (sixteen steps a bar per sound), a tune for a
  sound that plays notes (`pad hook C5 . . . | …`), nothing for a riser (`pad rise riser`: a
  sweep across its clip); `len` caps a note, `once` plays from its clip's start (the crash).
  Clips: `CLIP <part> <bars> <pad> [level] [in <beats>] [out <beats>]`, bars as positions
  (`5`, `5-8`, `4.4-6`, `9.3`, `5.2.3`; each end at its own precision, both included). `TIME
  4/4`, and `CHORDS 30-32 Am` for bars with chords of their own. A part's clips may not overlap;
  a sound belongs to one part; an old SECTION, `into`, `sweep`, or steps on a sound fail by line
  and say what took their place.
- **A clip is a window onto its pad.** Pads go round on the bars from the reel's 0 (a `once` pad
  from its clip's start), so a clip moved or stretched plays what the music plays there, in time
  with the chords and the other parts. A part's clips are its sounds' level (`A.levels`: a step
  or a fade at each end, the level between). A note lasts until its pad's next, `len` at most,
  never past its clip; a chord's notes carried on (the same chord, or a common tone) are held.
- **The arrangement** (`node scripts/reel-music.js check` draws it on the bars): six parts,
  drums (beat, groove, half, hats, fill), bass (eighths, pulse, long), chords (hold, stabs), arp
  (updown, run), lead (hook, high), fx (rise, crash). The groove lands at the answer with a crash;
  the art has the arp and the kick (John's); fills and risers into both choruses, crashes on
  them; the quotes are the chords, the hook at 0.7 and a long bass; the end holds Am. Measured
  offline: peak -3.8 dBFS, -16.2 LUFS.
- **The timeline's music** has its own ruler of bars and beats (`4/4 · 120` at its left), the
  chords on the bars, and a gold marker and dashed line at each scene's cut. A lane per part, its
  clips drawn with what they play (`REEL_UI.rollPaths` with rows: the drums as a drum grid, kick at
  the foot). Drag a clip to move it, its edges to start and end it, its top corners to fade it,
  up or down for its level; the grid is the finest of a sixteenth, a beat and a bar still 12 px
  wide (Shift the bar, Alt free), and a scene's cut pulls an edge within 8 px. Double-click a lane
  for a new clip (the part's chosen pad, up to four bars, to the next clip); click a clip for its
  inspector (bars typed, pad tiles with ▶, a level slider, fades, Play from here, Duplicate,
  Delete; ⌫ and ⌘D); click a lane's name for its pads. Selecting on press but opening the
  inspector only on a click keeps a dragged clip under the pointer (opening it re-lays the panel
  out). A clip past the reel's end is drawn to the view's end. Each change is one line
  (`setClip`, `addClip` in play order among its part's lines, `removeClip`) on the one Undo.
- **The rack** lost its arrangement matrix to the timeline and gained the pads: a row a part,
  a tile a pad (its picture, ▶ to hear one turn of it on its own through `ReelSynth.preview`,
  past the clips' levels), the chosen pad's step grid per sound or its tune (`setPad`, one line).
  A part and its sounds share a colour in both panels. A saved score that no longer parses (one
  in the old format, in a tab or on claude.ai) gives way to the file, with a note; the save is
  left alone.
- **Tests:** musictest (the format, the window semantics, a fill, a once pad, a riser, the tune
  in time, note lengths, held chords, levels from clips, padPreview, positions read and written
  back, the line editors, eleven refusals, the mix, the rack's pad step, tune and ▶);
  musiclanestest (42: the ruler, chords and cut markers, every clip to 2 px and every note drawn,
  the drum rows, an edge each way, a move, a fade, a level, the cut's pull, a double-click's clip
  in play order, its pad and level from the inspector, ⌘D refused and done, ⌫, a part's chosen
  pad, one Undo across both files, M/S per part, the cues, shut and open, a short window).

## Fish lines that outlast their scene (2026-10-02)

(Later the same day the default went back: a line belongs to its scene, and `carry` runs it on
past the cut. See "Transitions, interchangeable scenes and the shot list" below.)

John: "it's now tricky to set up the fish behaviors when they are locked to the section i have to
keep re-creating them." He had: the big fish sent to the lower left in the command scene, then
the same spot written again at the top of results, because each scene's end let it go.

- **A line holds until it is changed.** `to`, `look`, `idle` and `pace` hold from their time,
  across the cuts, until the next line of their kind for that fish (anywhere later in the cut) or
  its `auto`. A line is still written in the scene where it starts, and its @ still counts from
  that scene, so it moves with the scene when an edit ripples. Where no line holds, the fish keep
  the reel's own choreography, as before (0 px).
- **The ways back:** `to auto` and `look auto` (as before), `idle auto` (new: its own idle) and
  `pace 1`, one per kind (`ReelScript.RESET`), and `<who> auto` (new), which gives all four back
  at once. At one moment an `auto` comes before the other lines, so "auto, then circle" circles
  whichever is written first.
- **One account of it:** `ReelScript.fishHolds(edit)` gives every holding line, for each fish it
  directs (an `all` line once per fish, ending apart if a later line names one of them), its
  start, its end and the line that ends it. The rig's director plays it (`direct()` is now its
  spans), the Fish panel and the timeline draw it, and the cue sheet prints where each line stops
  (`fish big idle circle  → 0:25.35`, `→ the end`).
- **The Fish panel** lists the lines still holding from earlier scenes above the scene's own
  (`↳`, with their scene), each with where it stops; their spots show on the stage too, so a spot
  set in the command scene is dragged from the results scene without writing it again. Selecting
  one keeps the playhead where it is. A line's editor says how long it holds and has **Stop here**
  (its kind's way back, written at the playhead) and a jump to where it stops. A selected line
  stays selected across a cut while it still holds. At the playhead, **Reel's own** (key 0) writes
  `<who> auto`. The panel's words say a press holds "from here on, across the cuts".
- **The timeline:** the gold of a fish line runs on past the cards' edges until it is changed. A
  mark drags anywhere in the cut: across a cut its line moves into that scene (`moveFish`: out of
  one scene, into the other at the @ it lands on, snapped on the scene's own grid). Where the gold
  runs to the reel's end, its end is a handle: drag it back and a `<who> auto` line is written
  where it lands.
- **John's script plays as it did.** His lines (command: the spot at 0.21 0.71 and a circle;
  results: food, a slower pace and a sweep) used to stop at those scenes' ends, so a `big auto`
  went at the top of results and of feature, where the old rule let go. The committed rig playing
  his saved script and this one playing it with the two lines put every fish in the same place at
  every quarter second of the cut. Delete the one in results and the command scene's circle
  carries on into it.
- **Tests:** scripttest (holds across cuts, the `all` line's two ends, an `auto` first at one
  moment, the cue sheet's ends, `moveFish` across a cut, the ways back), fishdirecttest (in
  render mode: the results scene's wander still has the big fish 1.5 s into the feature, and the
  feature's `big auto` steers it again), fishpaneltest (the sweep still lit and listed in the
  next scene, the timeline's end handle writes `big auto`, Stop here writes `idle auto`, a mark
  dragged back across a cut lands in the scene before).

## Transitions, interchangeable scenes and the shot list (2026-10-02)

John: "I also need some controls for the ease in aspects like out, the transitions take a long
time give me some flexibility. i realized that the fish cues anchored to the sections would make
them more modular, but overall i think we need to make these sections interchangeable and present
a shotlist that can be re-organized."

- **Transitions as cues.** Beside `in` (seconds from the question's Enter to the arrival), `out`
  (seconds before the cut that the content starts to leave) and `typing`, a scene now takes
  `arrive` (how long its arrival takes, against the rig's own 0.6 s), `leave` (how long its
  leaving takes, against 0.3 s) and `ease` (`own`, `expo`, `cubic`, `sine`, `back`, `linear`: `own`
  keeps each motion's own curve; the others put every arrival on the family's out-curve and every
  leaving on its in-curve). `arrive 0.3` brings everything in twice as fast: each motion's
  duration, each stagger in a cascade, each step after the Enter, the window's dive, the panes'
  pushes and the crossfades between pictures. A `cue` line above the first SCENE sets a cue for
  every scene (`setReelCue`); a scene's own wins (`cue(sc, name, edit)`). The end card has no
  `out` or `leave`: it stays to its cut.
- **One motion per scene in the rig.** `motionOf(sc)` reads the three cues into `{ a(x), l(x),
  ei(e), eo(e), eio(e) }`; `MO` is the motion of the scene being painted, and `lines`, `pop`,
  `fade`, `drawRule`, the stats and the columns read it; every builder scales its own steps with
  its scene's. With no cues, `a` and `l` multiply by 1 and every curve is the call's own, so no
  number changes: every element's inline style, class and SVG attribute, and every fish's place,
  at 63 moments of the cut (cuts, middles, transitions), is what the committed rig drew, in wide,
  square and vertical. (The renderer's stills differ by a pixel or two in places between two runs of
  the same rig, at the caret and in video frames, and a glyph's glow can rasterise a hair apart
  across rigs with identical DOM, which is why the check reads the DOM and not the pixels.)
- **Interchangeable scenes.** What tied the scenes to their order was the glass: the hero oval at
  the title, the bar after it, the end card's oval at the end, the fish's chip and the opening's
  camera, all found by type and assumed first and last. Now each scene wears one thing (the
  opening nothing, the title the oval, the end card its oval, every scene that asks the bar), and
  `glass()` builds the morphs from the scenes as they stand: an oval collapses into the bar in its
  own scene's last half second, an oval opens out of the bar (or out of a line) at its scene's
  start, the bar grows out of a line after an opening, a scene that wears nothing shrinks the glass
  away. The bar's and the glass's fades are lists of keyed fades; the chip shows from the first
  opening until the bar or the end card; the camera closes in at each opening. A question left
  behind by a scene that wears no bar does not come back with the bar. In the cut's own order these
  are the three morphs it always had, to the frame. `moveScene`, `duplicateScene` and `removeScene`
  move whole blocks (a scene's lines, beats, cues and fish lines, and any notes right above it).
- **Fish lines belong to their scene again.** A holding line stops at its scene's end (`by: 'cut'`)
  unless it ends in `carry` (`by: 'reel'` or `'line'`), so a scene keeps its own fish wherever it
  is put. The two `big auto` lines John's script got for the morning's rule are gone; the film is
  the same either way. In the Fish panel a line's editor has **Carry on**; in the timeline the gold's
  end at a cut is a handle: on past the cut carries the lines that stopped there to a `<who> auto`
  where it lands, back writes the auto. "Reel's own" moved to the A key (0 is the timeline's fit).
- **The shot list** (`scripts/reel-shots.js`, S, a HUD button): a row per shot with its first
  picture (the picker's thumbnails) or its words, what it says, its length and its transitions as
  chips (gold its own, cyan every shot's, plain the rig's), the one under the playhead marked. Click
  a row to go there and open it: its length; a little table of when it arrives (after the Enter)
  and how long that takes, when it leaves (before the cut) and how long that takes; its curve; its
  typing; Play here, Earlier, Later, Duplicate, Delete. Drag a row to move the shot (a gold line
  shows where it lands; Alt+↑/↓ on a row too). "Every shot" sets the reel-wide cues. One save each,
  on the timeline's Undo. It shares the preview's left side with the Fish panel. The music stays on
  its bars: moving shots does not move the score.
- **Tests:** scripttest (the cues, every scene's, the scene moves, carry), ordertest (new: the cut
  played in five other orders, each scene wearing its own in its middle with no page error, and
  arrive, ease and leave measured on the answer's first line), shotstest (new: open and the shared
  side, rows, a click, a drag and its Undo, Alt+↓ and Later, a shot's arrive, ease and length, every
  shot's arrive, Duplicate, Delete, an 820 px window, no reload), fishdirecttest (a scene's lines let
  go at the cut, a carried wander holds into the next), fishpaneltest (the gold's handle at a cut
  carries, Carry on toggles), and the DOM check above.
- **The suites and John's order.** The same evening John used the shot list: the command scene
  before the answer, the art after the feature. The suites had found scenes by their place in the
  cut (`scenes[2]` was the answer), so they now work on a copy of his script with the scenes put
  back in the order they were written for (`reel-tests/inorder.mjs`, `ReelScript.moveScene`): what
  he changes inside a scene still reaches them, where he puts it does not. Order is tested on its
  own terms (ordertest), and samefilmtest compares the film he saved, in his order. hosttest,
  which plays the built editor with his script as it is, finds the answer and the pictured scene
  by type.

## The music meets the cuts (2026-10-03)

John reordered the shots (the command before the answer, the art after the feature) and asked to
"move the music to meet the cuts". The clips had been written on whole bars for the 63.5 s cut,
when the art cut on bar 7, the command on 9.3, the quotes on 23.3 and the offer on bar 28; his
shorter title (5 s to 3.25 s) had put every later cut 1.75 s ahead of its music, and the reorder
put the art's arp and kick under the answer.

- **Each scene keeps its music, on its own cut.** Every clip now starts and ends on a scene's
  cut, wherever it falls between beats (the cuts sit on eighths: the command at 5.75 s is
  `3.4.3`, a clip ending on it ends `3.4.2`). A pad still goes round on the bars, so a clip that
  opens between beats plays what the music plays there, in time; only the window moves. The art
  keeps John's arp and kick (groove 0.8, arp 0.7, bass 0.7) wherever the art is.
- **What leads into a cut ends on it.** A riser and a `roll` fill the bar before the cut into the
  results and into the offer; a crash lands on the cut (0.7 on the first scene after the title,
  the command now). The old `fill` went round on the bars, so on a cut between beats its build
  peaked on the bar line before the cut; `roll` is its claps alone, `once`, so it plays from its
  clip's start and ends on any cut (its kick would have fallen between the beats; the bar before
  a drop goes without it).
- **The end ends.** The chords' clip ran to bar 32 (64 s), past the 61.75 s film, so its fade
  out was never heard; it now ends on the reel's last frame, fading over its last bar.
- **Measured, not guessed.** The offline mix is as loud as before (peak -3.8 dBFS, -16.1 LUFS);
  around each cut, in sixteenths, it now changes on the cut: the command's crash and drums lift
  it 2-6 dB, the crash at the results and the offer lands on the roll's peak (up to 3 dB more),
  the quotes' breakdown and the end card drop it 5 dB, and the last frame is silent (-74 dB,
  where the old ending was cut off at -53); the old mix changed on none of them. In the timeline
  every clip's edge is within 0.1 px of a cut marker, except a roll's and a riser's starts, a bar
  before theirs.
- **Writing it down.** A clip line's stretch column is 15 wide (`CLIP drums   14.4.3-17.2.2  groove`)
  so clips on cuts line up like clips on bars; `RM.clipLine` is exported.
- **Tests.** musictest and musiclanestest play `reel-tests/fixtures/sizzle-reel-2.score.txt`,
  the arrangement on whole bars they were written against (the scripts have `inorder.mjs`; the
  score has its fixture), and musictest checks the real score reads and plays inside the real
  cut, in John's order, and that a clip on sixteenths writes to the same columns.

## The film again, and a walkthrough of the editor (2026-10-03)

John: "render the new film and also make a new walkthrough of our UI system (go through each
feature/control set, keep the whole thing at a minute)".

- **The film** was rendered from the saved edit (`e382f3`, the store's script and score equal to
  the repo's): wide, 60 fps, `--jobs=3 --deliver`, 14.5 min here. The web copy (13.8 MB) went to
  the editor's assets and `films/latest`, where Export plays and downloads it.
- **`scripts/record-walkthrough.mjs`** records the walkthrough: the hosted build, served with the
  stand-in for claude.ai's capabilities that hosttest uses, driven through ten control sets in
  60 s. Three things it had to learn: a button a panel has scrolled out of view still has a box,
  and a click there lands on whatever is behind it (the Fish panel's Place, under the timeline's
  music ruler, which moves the playhead), so every click scrolls its target into view and
  checks `elementFromPoint` first; typed words must only follow a double-click that really
  started editing, or they arrive as the editor's keys (F, R, Space…); ffmpeg here has no
  `drawtext`, so captions are drawn by the browser into images laid into a band above the page.
  The page draws about 25 frames a second with the timeline open (13 with the preview filling
  the window) and the screencast keeps about 15 of them; no Chromium flag tried did better.

## The school under the copy, one song, and the portrait (2026-10-05)

John: "fix any visual issues and let's try to drastically simplify the audio track down to just
some core essentials the score skips and jumps and changes concepts right now. sound effects are
good but let's strip the song itself down and keep it coherent throughout. also add the oval
image of me to a relevant about section."

- **What was wrong, measured.** The film was read every quarter second, and at each moment every
  line of copy on the stage (its text's boxes, clipped by every ancestor that hides overflow, so an
  odometer's hidden digits do not count) against every fish's body. In John's order the four
  medium fish are made in the third scene, so they swim through every content scene after it, and
  the school rose into the copy: the answer's figures, the award rows, the art's captions, the
  logos panel and the quotes' names. 16.75 s of the 61.75 s cut had a school fish over a line of
  copy. (The big fish: none in wide or vertical, 0.25 s in square.)
- **Why.** The engine keeps fish off the canvas's edges (`BUFFER_ZONE` 100 px, `ANTICIPATE_ZONE`
  180 px ahead), and the tank's canvas starts at mid-frame (stage 540), so the school's water ran
  up to about stage 580: under the content band's middle. Its waypoint was deep enough (836); its
  slots, a scatter and a dart out of the big fish's way were not.
- **`surface(f)`**, a fish-engine host hook (opt-in; inert on every other page): the top of the
  water for fish `f`, tank px (`f` null for the school's waypoint). The edge avoidance measures
  its top edge from there (anticipation, buffer, hard edge, emergency push), and the school's
  waypoint and slot clamps start there. Unset, every number is the old one: the committed rig
  played with the committed engine and with this one gives the same 1106 fish samples, position
  and heading, bit for bit. The rig returns `F.surface` for the school (wide 170: stage 710, the
  window grid's foot; square 170, stage 790; vertical 340, stage 1380, each its band's foot) and
  0 for the big fish, which is steered beside the copy and keeps the whole tank, as does a school
  a `fish … school to` line sends somewhere. After: 0.5 s in wide (a fish behind a window, under
  its caption), 0 in square and vertical.
- **Square's water is shallow.** Under its copy there are 290 px of tank, and the surface pushed
  the school down onto the big fish's depth: fishtest found a medium fish within reach of the big
  fish for 2.38 s of the cut (its limit is 0.5). Six settings were measured on all three counts
  (contact, the school over copy, the big fish over copy); the big fish standing 24 px deeper
  (`spotY` 300) gives 0.28 s of contact and no school fish over copy. The big fish's tail grazes
  the answer's "products shipped" for 0.5 s as it swims to its spot (0.25 s before; aiming its
  look lower did not change it).
- **Findings the suites had waited on** (all from John's order, all at the commit before). The
  format suite measured its tier chips mid-pop (the pop overshoots 1 px past the margin; every
  other piece of copy was already skipped while it moves, and now the chips are too), and in
  vertical "Meets Structured Data." at 90 px was 938 px in a 936 px band, its period cut by its
  mask: 88 px now. The render suite wanted the third chapter to be "who is john?" (each chapter
  is now checked against its own scene), and a chunk to start within 6 ms of its cut: John's
  cuts fall on quarter seconds, half a frame at the suite's 30 fps, so a chunk starts on the
  frame after (within a frame).
- **One song.** The arrangement is three clips: the chords from the first frame (`in 4`, `out
  4`), the bass from the title, one soft groove (kick and hats, 0.8) from the first question to
  the end card, where it fades over two beats and the chords and the bass ring out. No rolls,
  risers, crashes, hook or arp; the sound effects carry the cuts. Offline: peak -4.5 dBFS,
  -16.9 LUFS (the mix before, -16.1); from 6 s to 56 s every two seconds sit within 0.3 dB of each
  other. The pads stay in their parts, so the rack and the timeline can put any of it back.
- **The portrait.** An answer scene takes `img` (`img ./jjh-20250323-95 flower headshot
  Large.webp`): the picture the About page shows, in its oval (a 2:3 picture rounded by half, as
  `.about-portrait` does). It opens out of its centre with the answer, its ring drawn round it,
  and leaves with it, as the art scene's round window does; inside, a 4% push toward the face.
  Wide: right of the copy at the window grid's height (336 × 504, on the right margin). Square:
  140 × 210 beside the headline. Vertical: 186 × 279 above the copy, which moves 60 px down (at
  first it moved 200 and met the big fish). It is an `img` line, so the inspector gives it the
  media picker; the cue sheet lists it, and the shot list uses it as the answer's picture.

## A polish pass: the bar as marks, more pictures per beat (2026-10-05)

John: "simplify the search bar graphic (no commandk, use logos for the parse types not specific
words/methods) try to bring in more videos/frames per beat, like AR responders. I use youtube
videos on the site, so I'd need to add local unless you can grab some clips), just do your best
at another polish pass."

- **The bar.** No ⌘K. The tiers under it are round chips with a mark each, no words: lines of
  text for keyword search (BM25), a small constellation for semantic search (MiniLM), a spark for
  a model (LFM2.5 · WebGPU, or a local one), the drawn loop for scene language (the mark its plan
  card shows), the Services star for an intent; any other name, a dot. `tierKind` reads the name
  the script gives (`tiers BM25 | MiniLM`), which stays the chip's label for a screen reader and
  the editor. The kinds' classes are `t-…`: as plain `intent` the chip took the offer card's own
  `.intent` rule and grew to the card's size (the format suite found it). The pager under the bar
  says "1 / 3": the bar already says the question.
- **YouTube is out of reach.** The environment's network policy refuses www.youtube.com (the
  CONNECT is answered 403), so John's site videos (the A1R first-responder HUD, HoloTRIAGE, the
  robot twin, the XR design reel) cannot be fetched here. Allowing youtube.com and googlevideo.com
  in the environment's network settings would let a later pass cut from them.
- **More pictures per beat, from what is here.** A beat with only a picture keeps the words
  before it (the column did already; the AvatarMEDIC caption slot now does too, so a feature
  beat needs no caption of its own). The windows cut on the music's grid:
  Nanome: the hero's panel, the atom-building clip (`nanome-assisted-building.mp4`, unused
  until now), MARA's command, MARA in the headset. BadVR: the HUD loop, the hand-tracked close-up
  ("application · 16 functions", `BadVR 20210616181741853.png`), a closer look at its boards.
  OpenProse: eight of its approaches, screenshots of the pages in
  `openprose/canvas-display/brand/` (1600×900, saved 1280×720 in `Assets/openprose-approaches/`,
  15-37 KB each, a folder the media picker now lists), a sixteenth each while the counters roll
  to 137 and 471, then the homepage they came to under the quote. AvatarMEDIC: HoloTRIAGE at the
  patient, at "Keep Going!" and at the green AED, then the Clinic close and wide. Art: Influence's
  five photographs are one installation, so its screen goes from a spark to a diamond, a cube and
  an icosahedron while the pull-out runs across them. The manual figure from MunichRE was tried
  and dropped: its label column is transparent and its callout lines cross the map.
- **`cut`**, a beat flag: its picture comes in at once on its time, where a beat's picture
  otherwise dissolves in over the last (0.35 s); the cue sheet marks it `(cut)`.
- **More pictures, not more pops.** The score's `pop on beat` fired on every @ moment, and 17
  picture beats would have made its 8 pops 25 (seven in under two seconds through the OpenProse
  flip). A beat is a sound-effect moment when it brings words (lines, a lead, a quote, a caption):
  `RM.moments`, which the timeline's cue lane reads too. The pops are the 8 they were.
- **Rendering many clips.** A render gave every clip of the cut its file when the page loaded,
  and with eleven clip slots in each of three parallel pages the browser went down before the
  first frame ("Target page, context or browser has been closed"). Render mode now gives a clip
  its file only from a second before its layer to half a second after (`REEL.frame`), and waits
  for it to load before it seeks. Live mode is unchanged.
- **The editor's start.** The synth rack's three scripts loaded one after another once the
  preview was up, each waiting behind the clips the preview was fetching, and then the rack
  waited on the store for the score (up to 2.5 s) after the rig had already waited on it for the
  script: with a slow store the rack came up at about 8 s with clips Chrome can decode, 9-11 s in
  hosttest's harness. Now the three are fetched side by side (`async = false` keeps their order),
  and the host reads each file once a page (`REEL_HOST.load` keeps its first answer): the rig asks
  for the score's saved version beside the script's (unless the rack has a draft of it), so the
  two waits overlap. Measured with a 4 s store: the rack follows the picture by 0.2 s (5.8 s)
  with decodable clips, where it took 8.1 s. hosttest's harness serves H.264, which headless
  Chromium cannot decode, so each clip element falls back to streaming its whole file from a
  server with no byte ranges and the start there runs 5-8 s against its 8 s limit; Chrome on
  claude.ai plays the blobs and never makes those requests.

## A melody sung over the cut, and bigger frames (2026-10-05)

John sang a melody over the film and sent the recording: "fold into the work gracefully, I sang
a melody for this, can we try to map / normalize it as best we can, keep my nuance of voice
within harmonics, then update the UI to reflect what the mappings are. Make the content frames
around 20 percent larger too. For badvr content just zoom out a bit to show the labels."

- **`scripts/reel-sing.py`** reads a recording into the score as a `TAKE` (librosa and ffmpeg;
  `python3 scripts/reel-sing.py <recording> --apply`). The recording is analysed and never kept:
  only what was read from it goes into the score (the raw audio is John's and stays out of this
  public repo). What it does, in order:
  - *pitch*: pYIN every 10 ms. Notes are runs that snap to one note of the score's `KEY` (100 ms
    of a new note before it changes); glide fragments under 110 ms join their neighbour.
  - *syllables*: a new syllable on the same note is a new note, where the level dips 7 dB and
    comes back or an onset rises 4 dB. Until this round a later step merged same-pitch neighbours
    back, and "da, da, da" on F2 played as one held note; the rendered voice showed it.
  - *when*: the reel's 0 inside the recording, from the eighths' phase most onsets fall on and the
    bar whose chords the sung notes sit on most (3.03 s in; 53% of onsets within 40 ms of an eighth
    against 32% by chance, and the chord fit peaks at 2.9-3.3 s). No film sound reached the mic
    (cross-correlation against the film's own soundtrack found nothing), so the music is the only
    clock. Onsets go to the sixteenth.
  - *key*: a singer's key drifts (here -64 to +78 cents a bar). The drift is tracked note by note
    (Viterbi over offsets, a cost per change, cheaper after a breath), so the intervals inside a
    phrase stay as sung; each note's centre then goes to the nearest note of A minor (a chord tone
    of its bar, or the note before, wins a near tie). In key within 50 cents: 66% as sung, 84%
    with the drift out. The drift is written into the take (`drift`, cents a bar) for the editor.
  - *octaves*: the low notes (E2, F2) are real: their fundamental and third harmonic are present
    and nothing sits an octave below, so the leaps stay as sung.
  - *nuance*: each note keeps how its pitch moved, cents from its own centre 32 times a second,
    measured on the drift-corrected pitch near its written note (a glide into it from far away no
    longer pulls its centre off).
  - *level and colour*: each note's loudness (0.3-1) and tone (its harmonics 2-8 against the
    voice's, ±6 dB); and the voice's harmonics, H1-H16 in dB from the fundamental, the median of
    its steady notes: 0 -2 -10 -14 -25 -33 -39 … (warm, a strong second).
- **The score.** `TAKE john` holds 140 `n` lines (`n 5.2.3 F2 4 0.39 +0 F2-24 +20 | 104 -5 …`:
  where, the note, sixteenths, level, tone, what was sung, how early or late in ms, then the
  bend) and its mapping, each a line: `octave +1` (D3-G4, a tenor over the bass, under the
  lead's register), `shift` (sixteenths), `straighten 60` (that share of the slow wander inside a
  note goes, a five-point average, the first and last three points easing out of it so the scoop
  and the fall stay), `nuance 100` (that share of the movement plays; each point held to ±200
  cents, beyond which it is the glide into the next note), `feel 20` (that share of how early or
  late each note came). `SYNTH voice` sings it: `voice harmonics 0 0.8` plays the sound's
  `harmonics` line as one PeriodicWave, each note's tone tilting the harmonics above the first;
  `env 0.045 0.45 0.35 0.12` speaks like the sung syllables (peak at 50 ms, about 4 dB down by
  half a 0.5 s note, 11 dB by its end, as measured). `PART voice` with `pad john take john`, and
  `CLIP voice 1-31.4.2 john in 1 out 4`: a window onto the take, which plays where it was sung.
  At level 0.32 it sits 1.4 dB over the band A-weighted, the melody without burying it.
- **The synth.** A take's note carries its bend; the oscillator's detune follows it (linear
  between points, from `cut` when a note is resumed mid-way), live and offline. Waves are kept
  per sound and whole dB of tone.
- **The editor.** The rack's voice pad opens the take view: four bars at a time (the reel's, with
  their chords), what was sung (the faint line, as sung, drift and all), the notes it became (boxes
  on the sixteenths) and how they play (the gold line), the whole take under it with the key's
  drift dashed, the window following the playhead. The mapping's five lines are knobs. A note
  clicked says what became of it ("5.3.3 plays F3. Sung F2-29, the key 10 cents flat there: moved
  +19 cents to F2, then 1 octave up. Came 10 ms late …"); ▲ ▼ and the arrow keys move it to the
  next note of the key (Shift: a semitone), one `n` line. The summary says it in words. The voice
  sound shows its harmonics as bars to drag (H1 is the measure of the rest and stays at 0), its
  wave drawn from them. The timeline's voice lane is taller and draws each note's bend in gold.
- **The frames, 20% larger** (wide): windows 1080×608 (were 900×506), from 204 to 812 where the
  band ended at 710 over empty water; the art's port r 300 (250), the answer's portrait 404×606
  (336×504), the logos and offer cards 608 tall. The copy beside a window is 600 wide (780): a
  line John wrote on one line wraps there, balanced, its mask sliding the block as one (the wide
  frame never wrapped before), and a label (an eyebrow) takes a smaller size once until it fits
  (`fitLabel`), snapped so its line box is whole pixels: a 20.2 px line moved every line under it
  by a fraction, and Chrome rastered "XR + AI" one of two ways from render to render (0.57 px, a
  render in three). That was half of it: a line slid in percent of its own height stood at a
  different fraction of a pixel at each moment of the slide, and Chrome keeps a moving line's
  raster from whichever moment it made it, so "XR + AI" (at y 349.84) still came out one of two
  ways after a run of earlier stills (2253 px, formattest's second run against its first). Lines
  now slide in whole pixels (`lines()`: 108% of the line's height, rounded), and the moment renders
  the same after any history: alone, after 17.2 s, after the suite's run of stills, one hash. The
  same change let formattest see the opening's caption at 1.5 s (before, its last fraction of a
  percent of slide counted as motion): centred on the stage while the camera zooms about the drawn
  loop, it rode 76 px right of the screen's middle, 7-14 px into square's and vertical's right
  margin. It now keeps to the middle of the screen the whole way out (`camK`, the camera's own
  curve, shared with `paintCamera`). Copy beside a window centres on 432 (the rest on 457) and never starts above
  the frames' top (`colTop` 204: the OpenProse column, with its quote, is 542 tall and had reached
  the tier marks). Square keeps its layout (its copy columns are as narrow as its headlines allow)
  and vertical's windows already span its width.
- **The fish under the bigger frames.** Under a frame that reaches 812 the tank has 100 px less
  water, and the fish learned to keep under it where it is. Each framed scene names its frame's
  x-range (`FRAMES` in the rig: the results' and feature's windows, the art's port, the logos' and
  offer's cards; not the answer's portrait, on the far side of the copy the fish look at). Under
  one, the school's water starts at 824 (`surfaceFramed`, 12 px under the foot; 710 elsewhere, as
  before) and the big fish keeps its centre under 862 (`bigTop`: its back and fin under the foot),
  heading down the way it faces when over it; beside one, they swim as before (a ceiling over the
  whole tank had sent the big fish down and round for 2.5 s in the art scene, 500 px clear of the
  port). The water comes down over the second before a framed scene (`frameDepth`, a smoothstep;
  the big fish's ceiling from then too): a top that dropped onto the school at the cut turned its
  fish back each its own way round, one the long way through a loop to the tank's floor, and a
  fish line in the scene's first second found the school in pieces. A big turn under a frame goes
  round by the belly, not nose up through the top (it had reared into the logos card), and swims
  round, a small loop down: turned on the spot, nose down, its tail stood up into the logos card at
  39 s. A fish line's food lands no higher than 818 (`feedTop`), so no fish feeds inside the copy:
  the results' `feed 0.18 0.7` had the big fish's fin in the wrapped Nanome lines. The engine
  learned three things, all behind the reel's own options (`surface`, `calmSchool` with
  `largeRightOfWay`), so index, design and 404 swim as before: a fish seeks no food above its
  water's top (the school had waited under a pellet the big fish came down to eat); a medium fish
  gives way with a berth of 45 px (25), going for food or not; and one near its water's top flees
  level, faster (3.4 px a tick), not up through it (fish right over the big one had fled through
  the offer card's link line). Measured in wide on the cut's own seed, each fish as points along
  its body: the big fish over copy 0 s and over a frame 0 s; the school over copy 0 s and over a
  frame 0.75 s, three grazes of a few px at a frame's foot (2.75 s before); fishtest's contact 0.20 s
  (0.27 before), square 0.23 s; the big fish over a frame 0 s on seeds 1-4 too. fishdirecttest's
  `big to` lands 87 px off at 3.4 s (its limit 90; 80 before) and `school to` 562 px across (536
  before). One thing tried and dropped: letting a fish line's move keep its pace until 180 px out
  landed `big to` at 62 px, but John's own `big to` and `idle circle` in the command scene then
  ran the big fish after a fish it had scared (0.8 s within reach on every seed; 0.2 s without).
- **BadVR**: the hand-tracked picture at zoom 1 to 1.06, so its labels read (APP, application, VX);
  the block close-up beat is gone. John's lines are as he wrote them (the feed point included).
- Suites: `reel-tests/taketest.mjs` (the take read and mapped, the synth offline, the take view,
  the harmonics bars, undo, the timeline's lane); formattest's wide references recorded again
  (the old ones in `wide-ref-1005b`), and its live check reads the stage and the timeline in one
  frame after the rack is up (the score is longer now, and the rack can land between two reads).

## Later

Scene-specific cues (line staggers, the push); moving cut 1 onto the one player; stems out of
the renderer; per-format cues, should a narrow frame ever need its own timing; the score's
patterns and knobs from the timeline (today they are the rack's).
