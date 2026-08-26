# Search / Command Bar QA suites

Playwright suites for the SEARCH_COMMAND_BAR build (Aug 2026). Same setup as
`maze-tests/`: they need a real headless Chromium and must sit next to a
`node_modules` containing `playwright-core` (ESM ignores NODE_PATH — copy the
suite files to a scratch dir with a node_modules symlink, or npm-install here).

```bash
# once
npm install --no-save playwright-core          # from repo root (gitignored)
export CHROMIUM_PATH="$HOME/Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"

# serve the repo — the suites hardcode 127.0.0.1:4571
python3 -m http.server 4571

node phase1.mjs   # core extraction parity: overlay + search.html shells (26 checks)
node phase2.mjs   # semantic tier: lazy embedder, hybrid upgrade-in-place (downloads ~24MB per cold run)
node phase3.mjs   # command bar: actions run, intent cards, topline routing, linked titles
node mock-llm.mjs &   # phase4 needs the mock OpenAI endpoint on :9911
node phase4.mjs   # tool-use: registry → tools → confirm chip → tap runs
node phase5.mjs   # explorer: topline gating, postcard lead, related chips, media cards
node phase6a.mjs  # the postcard: adaptive density, LOD pin/hover, pretext wrap, suggestions
node phase6b.mjs  # scene language: plan cards, materialization, census, enclosure verify
node phase6c.mjs  # escalation: seam + artifact rail + model-emitted scene language (needs mock-llm)
node phase7.mjs   # tier strip: UX sequence, collapsed signals, fact-vs-control, proxy clicks
SHOTDIR=/tmp node phase8.mjs   # action gating (orphan tokens), no filler eyebrow,
                  # SEMANTIC density zoom, Shallows light theme both surfaces
                  # (writes theme screenshots into $SHOTDIR)
node phase9.mjs   # Phase 9 (all four slices): 9a stable surface (morph not
                  # rebuild, scroll discipline, the never-scrolling command
                  # frame, chrome consolidation) · 9b fact rows (awards
                  # unrolled, density reaches inside the dossier) · 9c grammar
                  # (badge links, ↑↓ cursor, Enter commits, 4-rung Esc ladder)
                  # · 9d workspace (⤢ two-pane, pin fills the pane, persisted)
```

Notes:
- **phase4 blocks localhost:1234/11434 at the network layer** (this machine
  runs a real Ollama) and filters `net::` console errors — those are the
  expected local-probe refusals, not failures.
- `fusionlab.mjs` / `intentlab.mjs` are OFFLINE tuning labs, not pass/fail
  suites: they replay the 22-query eval against real MiniSearch + the real
  chunk vectors to tune `hybridMerge` weights. They import
  `@huggingface/transformers` from the repo-root node_modules
  (`npm install --no-save @huggingface/transformers`). Re-run them before
  touching the fusion constants in search-core.js.
- Chunk vectors must exist (`node scripts/build-chunk-vectors.mjs`) or
  phase2/labs will fail on missing `vec` fields.
- **Headless Chromium reports `prefers-color-scheme: light`**, and jh-chrome
  follows the OS preference when no `jh-theme` is stored — so an un-forced
  page renders the LIGHT theme in these suites. Any dark-mode assertion or
  screenshot must pass `colorScheme: 'dark'` to `browser.newContext()`
  (phase8 does); a "dark baseline" captured without it is silently light.
