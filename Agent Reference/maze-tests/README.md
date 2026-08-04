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
| `sitetest.mjs` | Every page loads: component nav + footer version, canonicals, zero console errors. Update the `v1.13` string when bumping. |
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
- Squiggle suites test the CURRENT gesture heuristic; per the handoff plan the erase is
  being reworked to crossing-counting — rewrite those cases with the human-gesture
  simulator described in `../FISH_MAZE_HANDOFF.md` §3 (sparse ~60Hz points, 2–4 wide
  passes) rather than dense synthetic zigzags. That gap is exactly how the earlier
  false-passes happened.
- Two known environment-only failures in sitetest when CDNs are blocked:
  nanome2 (Three.js iframe) and onagents (unpkg). Fine on a normal connection.
