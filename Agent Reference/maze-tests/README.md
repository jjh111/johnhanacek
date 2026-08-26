# Maze test harness (dev-time only — not loaded by the site)

Headless-Chromium behavior tests for the fish engine + v1.9 Fish Maze, written during the
cloud session that built v1.8/v1.9. They dispatch synthetic mouse events at the real pages
and assert against engine state (`window.heroFish` on index, `window.designFish` on design).

## Setup

```bash
# 1. serve the repo root (fetch()es and canvases need HTTP)
python3 -m http.server 1337

# 2. anywhere with node ≥18:
npm init -y && npm install playwright-core

# 3. point the tests at a Chromium/Chrome binary
export CHROMIUM_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"  # example
# (or: npx playwright install chromium, then use its printed path)

node mazetest.mjs
```

`linkcheck.py` needs no server: `SITE_ROOT=/path/to/repo python3 linkcheck.py`
(defaults to cwd).

## Suites

| File | Asserts |
|---|---|
| `idletest.mjs` | Idle must be shaped by the drawn shapes: no seabed drift on the blueprint, penned fish patrol their room without escaping, cruisers reverse at corridor ends, index.html idle untouched. Its `stalledSecs` figure is the signal for whether room-restricted idle targets need escalating to per-fish paths — it was 0.6s over 25s, so they don't. |
| `navtest.mjs` | Fish must be guidable by food: led through a gap in a barrier, prompt abandonment of sealed-off food, and open-water seeking on index.html unaffected. Exits non-zero on failure. Keep layouts inside `DETECT_RANGE` (400px) or fish never seek at all. |
| `humantest.mjs` | **The important one.** Human-sampled strokes (sparse ~60Hz, rounded reversals): erase matrix {2,3,4,6 passes} × {fast,slow} × {wide,tight}, non-scratch gestures that must NOT erase, and a 30s parking soak. Exits non-zero on failure. |
| `latchtest.mjs` | The blueprint canvas must never latch itself to 0×0 (see below). Exits non-zero on failure. |
| `sitetest.mjs` | Every page loads: component nav + footer version, canonicals, zero console errors. Reads the expected version from `scripts/jh-chrome.js`, so it needs `SITE_ROOT` set. |
| `linkcheck.py` | Every local href/src/poster resolves (catches deleted-asset refs). Known false positives: `${r.image}`, `$2` template literals. |
| `enginetest.mjs` | index.html: boot spawns, loop→fish, dot→food, QR easter egg, debug/scare APIs. |
| `mazetest.mjs` | design.html: seed fish, square→wall+obstacles, loop→fish, tap→food, squiggle-erase, Clear keeps fish. |
| `pentest.mjs` | Enclosure model: ring blocks, food exact at cursor + "Food · enclosed", loop-inside spawns penned fish, 0 escapes/intrusions. |
| `frusttest.mjs` | Walled-off food: fish seeks, gives up, food survives. |
| `parktest2.mjs` | Anti-parking: no fish near-wall AND stationary (<15px over 2s) for long streaks. |
| `walltest.mjs` | Containment soak + squiggle realism + clean-shape non-triggers. |
| `foodtest.mjs` | Food placement near line walls; diagonal-line containment. |
| `zigedge.mjs` | Squiggle edge cases (sharp zigzag, tiny scribble). |

Notes:
- **Erase is crossing-based as of v1.10 of this work** (a stroke erases a wall it crosses ≥3
  times). The old gesture heuristic and its `isSquiggle` helper are gone. Erase cases must
  therefore *cross a wall's outline* — a scribble kept strictly inside a shape crosses nothing
  and correctly does not erase.
- **Draw like a hand, not like a plotter.** The original squiggle suites emitted dense,
  perfectly sharp synthetic zigzags and passed while the feature was broken for real users,
  whose strokes are sparse (25–35px between points at ~60Hz), wide, and only 2–4 passes.
  `humantest.mjs` has the sampler; use it rather than hand-rolling point lists.
- **The in-app Browser pane cannot run these.** Its tab reports
  `document.visibilityState === "hidden"`, so requestAnimationFrame is throttled to roughly one
  tick every two seconds, the simulation never advances, and every behaviour soak passes
  vacuously with frozen positions. Headless Chromium only for anything time-based.
- **sitetest's one standing failure is REAL, not environmental.** An earlier note here
  blamed the failures on blocked CDNs; that was wrong, and it meant a red suite got waved
  through. What actually fails, as of 2026-08-26:
  - `art.html` — the Vimeo embed for *God Like (2016)* (`player.vimeo.com/video/194577325`)
    returns **401**, on the live site as well as locally. The video is public and still up,
    but it belongs to the collaborator (Nathan Danskey) and its privacy settings do not
    permit embedding here. Visitors see an empty player. Needs a decision, not a code fix.
  - `nanome2.html` — RESOLVED. The 3D demo used to request a `.gltf` whose 6900-byte buffer
    was never committed, 404 every load, and quietly draw its procedural molecule from the
    catch. The molecule is now the model outright: same picture, no failed request. If a
    complete `.gltf` (manifest AND `.bin`) ever arrives, `ModelLoader.loadModel(url)` still
    works — see the comment in `Assets/3d-sync-demo/js/main.js`.
- **Console noise from embedded third-party players is filtered, 4xx/5xx is not.** YouTube's
  iframe emits `Permissions policy violation:` lines and a styled `%c%d … NaN` log; those
  are counted separately as `thirdParty` and don't fail a page. A dead embed still does.
  (That `%c%d … NaN` message was a long-standing mystery attributed to `writing.html`. It is
  YouTube's, it comes from `art.html`, and see the next bullet for why it looked otherwise.)
- **sitetest opens a fresh page per URL.** It used to share one, and console messages from
  the previous document flushed after the next page's listeners attached — so
  `playground.html`'s iframed children reported their errors against `writing.html`, which
  looked broken for weeks and was always clean. Per-page listeners can't fix that; only a
  page boundary can.
- `timeout(1)` is not available on stock macOS zsh — don't wrap these in it.
