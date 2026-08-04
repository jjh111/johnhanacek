# Fish Maze (v1.9) — Continuation Handoff
*Written August 2026, handing off from a Claude Code cloud session to a local primary instance.*

---

## ✅ FINISHING PLAN EXECUTED (local, site v1.14 — not merged to main)

Both open problems below are fixed and verified in real headless Chromium; the branch is
still unmerged, so the live site is unchanged. What landed:

1. **Erase is now crossing-based.** `isSquiggle` and `eraseShapesUnder` are gone, replaced by
   `ERASE_CROSSINGS = 3` + `wallOutline()` / `countCrossings()` / `eraseCrossedShapes()` in
   `design.html`, using `ShapeDetect.segmentsIntersect` (added to design's destructuring of
   `window.ShapeDetect`). Erase now also only *consumes* the stroke when something was actually
   erased, so a stroke that crosses nothing falls through to the rest of the router instead of
   being swallowed — that's the "failed squiggle spawns a fish" complaint gone too.
   *Root cause for the record:* the failing term was never the reversal count, it was the ink
   ratio `pathLen / (2*(w+h)+1) > 1.3`. A 3-pass scratch across a 240×170 wall scores ~0.87.
2. **Wall contact redirects velocity instead of killing it.** `applyWallPhysics` now projects
   velocity onto the wall tangent at full magnitude (floor `WALL_SLIDE_MIN = 0.8`) and nudges
   `targetHeading` toward that tangent, so sliding is the floor state for every fish tier.
   Measured: longest parked streak went **3.1s → 0.0s**.
3. **Tested like a human.** New `maze-tests/humantest.mjs` drives sparse ~60Hz strokes
   (25–35px gaps, rounded reversals, jitter). 16/16 erase cases pass across
   {2,3,4,6 passes} × {fast,slow} × {wide,tight}; 5/5 non-scratch gestures preserve their walls
   (including a fish loop straddling a wall edge, the risky false-positive); 30s parking soak
   with 6 fish shows zero parking.

**Also fixed along the way — a bug that predates this branch:** `resizeCanvas()` in
`design.html` wrote its measured rect back as an inline `width/height`, which overrides
shared.css's `100%`. One zero measurement (page laid out hidden or backgrounded) latched the
blueprint canvas at 0×0 **permanently** — the fish layer kept rendering while the entire
blueprint layer went invisible, recoverable only by reload. It reproduces 100% in a hidden tab.
This is on `main` and in `Archive/design-blueprint-frozen.html` too. Now the canvas sizes only
its backing store, with a `rect || parent || viewport` fallback chain, and never writes an
inline size. Covered by `maze-tests/latchtest.mjs`, which was confirmed to fail against the old
code and pass against the new.

**Test-suite corrections** (these were passing dishonestly):
- `zigedge.mjs` called the now-deleted `isSquiggle` directly; rewritten to assert on observed
  erase behaviour.
- `mazetest.mjs`'s squiggle scribbled *inside* the square, so it crossed nothing; now scrubs
  across it.
- `pentest.mjs` counted the seed fish — which spawns centre-screen and is therefore inside the
  test's pen every run — as an intrusion, permanently reporting ~50%. Now only fish that
  started outside can intrude. Result: 119 → 0.
- `sitetest.mjs` hardcoded the footer version; it now reads it from `scripts/jh-chrome.js`.

**Known, accepted limit:** a scribble kept strictly inside a wall's outline crosses it zero
times and does not erase. Scrubbing across the shape — the natural motion — does.
Documented as `B2_knownLimit` in `humantest.mjs`.

Remaining before merge: John's own hands-on pass on real hardware, then `git merge` when happy.

---

## Where things stand

**`main` (the live site) has NO maze work.** It ends at v1.8 (site v1.12): shared
`scripts/fish-engine.js` + `scripts/shape-detection.js`, with index.html and 404.html as
consumers. All of that is approved, tested, and deployed. The live design.html is still the
pre-maze blueprint demo (also snapshotted forever at `Archive/design-blueprint-frozen.html` —
never edit the snapshot).

**Branch `claude/personal-site-review-ghpg5q`** carries the in-flight v1.9 Fish Maze
(6 commits, `d87075d..b4bdd1e`, site version 1.13). It modifies exactly three files of
substance — `design.html`, `scripts/fish-engine.js`, `scripts/shape-detection.js` (plus docs
and `?v=` stamps). **Do not touch other pages**; index.html/404.html must stay
behavior-identical (regression suites below prove it).

## What the maze is (decided with John — do not relitigate)

- design.html hero is fullscreen; a transparent `#fishCanvas` (fixed, pointer-events:none)
  sits above the blueprint canvas and runs the engine in **embedded mode**
  (`FishCanvas(el, { interactive:false, transparent:true, renderStyle:'blueprint',
  seedJellyfish:false, palette, annotateAt })`). All input stays on the blueprint canvas;
  design's `endDraw` routes strokes.
- **Ecosystem scope:** fish + food + walls only. No coral/jellyfish/bubbles on this page.
- **Walls are the drawn OUTLINE** (chains of 24px blocks every ~14px along `idealPoints`,
  or along the segment for line/arrow). Interiors are open water: a rectangle is a pen, a
  circle a ring tank. Draw a loop inside a pen → that fish lives there. Enclose a swimming
  fish → it's caught. All verified working.
- **Fish are cyan line-art** (blueprint palette, hue constrained 188–212°, 0.14 fill).
- **Food is just food** — spawns exactly at the tap, never nudged. The system announces
  spatial knowledge instead: whisper label "Food · enclosed" via point-in-polygon.
- **Fish frustration**: no progress toward locked food for 2.5s → ignore that pellet 9s,
  back to idle. Verified working.
- **Labels toggle** shows live behavior chips over fish/food (`tier · state · enclosed /
  gave up`) via engine `setInfoLabels(bool)` + design's `annotateAt(x,y)` hook. Working.
- Stroke routing priority in design's `endDraw`: erase-gesture → loop→fish
  (`fishLayer.processStroke(points, ['fish'])`) → tap→food (`addFood`) → clean shape→wall
  (`detectShape` morph + `syncObstacles()`) → fallback fade. maxShapes 50. Clear button
  clears walls, keeps fish, resyncs obstacles.

## The two open problems (John repro'd both on real hardware; synthetic tests kept passing)

1. **Squiggle-erase doesn't trigger on real hand-drawn scribbles.** Two rounds of gesture
   heuristics (reversal counting + ink-ratio, currently in design.html `isSquiggle`) tuned
   against dense synthetic zigzags; real scratches are sparse (~60Hz sampling, 25–35px point
   gaps), wide, and few-pass, and keep failing the thresholds. A failed squiggle can fall
   through and even spawn a fish.
2. **Fish still park nose-first on walls.** Wall avoidance is *steering-blend* based
   (`applyWallPhysics` in fish-engine.js) but every behavior (food-seek, schooling
   formation, territorial states) rewrites `targetHeading` at higher gain every frame, so
   the slide nudge loses. The sustained-contact disengage only helps fish that use
   `wanderTarget`/`cruiseAngle` — medium schoolers use neither. Hard contact currently
   ZEROES the into-wall velocity component, which leaves a pushed fish stationary → parked.

## The agreed finishing plan (John approved the direction — execute this)

1. **Erase = "scratch-out": relational, not gestural.** Delete `isSquiggle`. New rule at
   the top of stroke routing: count crossings between the stroke and each wall's outline
   (`ShapeDetect.segmentsIntersect` vs the wall's `idealPoints` polyline / line segment).
   Any wall crossed **≥3 times** erases (existing amber burst + `syncObstacles()`).
   A line drawn through a wall crosses ≤2 → safe; empty-canvas strokes cross nothing.
   Zero tunable gesture constants. On-brand: the system already reasons about
   "intersects" relationships.
2. **Wall contact = tangent velocity redirection.** In `applyWallPhysics`'s hard-contact
   resolver, replace the velocity-kill with full-magnitude projection of velocity onto the
   wall tangent (sign matching current motion). A fish touching a wall then *cannot* be
   stationary — sliding becomes the floor state for every fish type, independent of the
   behavior stack. Keep: position push-out, lookahead slide steering, cruise-flip
   disengage, food frustration.
3. **Test like a human.** Build a gesture simulator (speed-based ~60Hz sampling, sparse
   points, rounded reversals, jitter). Erase matrix: {2,3,4,6 passes} × {fast,slow} ×
   {wide,tight} — every ≥3-crossing case must erase; shapes/loops/lines-through-walls must
   never false-erase. Parking soak: 30s, all tiers, food baited behind walls, school
   patrol crossing a wall — no fish near-wall-AND-stationary (<15px movement over 2s) for
   >2s. Screenshot spot-checks; don't trust counters alone.
4. Wrap: run the full battery in `Agent Reference/maze-tests/` (see its README), bump
   `version` in `scripts/jh-chrome.js` + `node scripts/sync-version.mjs`, update this doc /
   V2 plan, commit, push. Merge to main only when John says "fold it in".

## Engine API surface added for the maze (all additive; index/404 defaults unchanged)

`FishCanvas(el, opts)` opts: `interactive:false`, `transparent`, `renderStyle:'blueprint'`,
`seedFish`/`seedJellyfish`, `palette.fish[]`, `onStroke`, `onDrawingChange`,
`annotateAt(x,y)→string`, `infoLabels`.
API: `processStroke(points, allowTypes)`, `addFood(x,y)`, `setObstacles(list)`
(`{id,x,y:BOTTOM edge,width,height}` → also builds `wallRects`), `setInfoLabels(v)`,
`setDebug(v)`, `scareFishAt(x,y)`, `state.{fish,coral,food,...}` getters
(external wall entries in `coral` carry `isExternal:true`; walls are excluded from all
coral *behaviors* — homing/havens/lane-ceilings/buffers — and kept only for school-waypoint
routing).
Key engine internals: `applyWallPhysics(f)` (called after the hard position clamp),
`spawnClassified(classified)`, `drawFishInfoLabels()`, frustration block right above
"FOOD SEEKING". The engine is deliberately NOT strict mode (drawFishEntities keeps school
state on sloppy-mode `this`); one FishCanvas per page.

## Verified-working behaviors (don't regress these)

Pen containment (0 escapes / 0 intrusions both directions, incl. enclosing a live fish);
food exact at cursor + "Food · enclosed"; walled-off food survives (frustration or natural
slide-away); loop→fish, tap→food, shape→wall, Clear keeps fish; behavior label chips;
index.html: boot spawns, loop→fish, dot→food, QR easter egg via onStroke, debug/scare,
zero console errors; 404 ambient fish follows cursor.

## Running the tests locally

See `Agent Reference/maze-tests/README.md`. Short version: serve the repo root
(`python3 -m http.server 1337`), `npm i playwright-core` anywhere, set `CHROMIUM_PATH` to a
Chrome/Chromium binary (or install one via playwright), `node mazetest.mjs` etc.

## House rules

- Version single-source: `version` in `scripts/jh-chrome.js`; after bumping run
  `node scripts/sync-version.mjs` (stamps every `?v=` + README badge). Never hand-edit.
- Never edit `Archive/design-blueprint-frozen.html`.
- fish-demo/ is a compiled bundle (source `fish-src.js` is local-only/gitignored) — leave it.
- This repo is public and served — no business/personal docs, ever.
- A private preview artifact of the maze exists in the cloud session
  (claude.ai/code/artifact/8d7aa48a-c933-44c7-9fde-69dd4f28b943); local work replaces it
  with `python3 -m http.server 1337` → localhost:1337/design.html.
