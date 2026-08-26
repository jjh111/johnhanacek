# Control Surfaces — Exhaustive Inventory
*Status: Reference (Aug 2026) | Produced by 4 parallel code audits for the compound-command work
("add 5 small fish, 3 medium, max large"). Line refs correct at audit time; nothing was modified.*

Legend: ✅ EXPOSED today (element/global/API exists) · 🔧 needs a small exposure (1–5 lines) ·
🏗 needs real work · ⚠️ trap/bug found in passing.

---

## 1. Fish engine (`scripts/fish-engine.js`) — the parameter-rich core

### Exposed API (`FishCanvas()` return, :6779–6852)
✅ `canvas, ctx, getPos, startAnimation, setDebug, setInfoLabels, get debugMode, get infoLabels,
scareFishAt(x,y)→bool, processStroke(points, allowTypes)→{type,spawned}, addFood(x,y) [1 pellet],
setObstacles(list), clearFish() [fish AND food], classifyStroke, state.{fish,coral,bubbles,food,
jellyfish,strokes,particles,ripples}` — the `state.*` getters return **live array refs**, so
per-entity mutation works today (`state.fish[i].state/x/y/bodyWidth/percRanges/energy/curiosity/
nervousness/hueShift`) — but must be followed by `startAnimation()` to wake the loop.

### Constructor opts (12 total)
`interactive, renderStyle('blueprint'), fishHue('full'), transparent, floorAffinity,
infoLabels, seedFish, seedJellyfish, foodLifetime(15000; design uses 20000), palette
(only .fish honored — rest silently ignored), onDrawingChange, onStroke (interactive path
only — processStroke does NOT fire it), annotateAt`.

### Entity types & size classes (the compound-command math)
7 classified types: `food` (tap <8pts, bbox <25) · `bubble` (closed circle) · `coral` (closed
rect) · `jellyfish` (closed triangle) · **`fish` (OPEN self-crossing ichthys, loopSize>28,
aspect>0.22 — a closed circle is a bubble)** · `line` (temp, pops bubbles) · null.

**Fish tier is by `bodyWidth` (HALF-width), not loopSize**: `<35` small, `35–60` medium, `≥60`
large (:758–759, :6510). In drawn-loop terms: **loop ≲74px → small, ≈74–127px → medium,
≳127px → large** (the two shape generators derive bodyWidth differently; crossover at
loopSize 60 also flips simple→SVG rendering). **No size clamps anywhere** — a 2000px stroke
makes a 1000-half-width fish. Spawn margin 80px; large fish repositioned to upper third.

### Population caps (`computeEntityLimits()` :910, mobile <600px | desktop)
food 8|12 · bubbles 12|20 · coral 4|6 · jellyfish 1|2 · **large fish 1|2 · medium 4|6 ·
small 6|9 · total fish 11|16**. **Nothing is rejected — caps EVICT** (FIFO, except total-fish
which evicts the least-visible edge fish). So "add 20 small fish" on desktop churns: 9 live,
11 evicted. A compound command must clamp to caps and say so — or raise them via a setter.

### 🔧 Small exposures that unlock compound commands
- **`spawnClassified` passthrough — the single highest-leverage line**: spawn any entity at any
  size/position, no stroke synthesis. `spawn('fish', {x, y, bodyWidth: 30})`.
- `setLimits({MAX_SMALL_FISH: …})` — caps are `let` bindings, trivial setter.
- `pause()/resume()` (~4 lines, cancel/restart RAF pattern already exists in resizeCanvas).
- `scareFishAt(x, y, radius)` (radius is function-local 60).
- `addFood(x, y, count, spread)`.
- Expose `FORCE_WEIGHTS` (13 steering weights) + `SIZE_AWARENESS` by reference; runtime
  `setFoodLifetime`; re-expose the two seed IIFEs; `markNavDirty()`; `resizeCanvas()`.

### 🏗 Real work
- Global animation speed/time-scale: fixed-step loop, no dt, ~50 call sites.
- `FishCanvas.ambient` (404 fish) cannot be stopped/reconfigured: unconditional RAF, no stored
  id, listeners never removed. Opts are only `bodyWidth`, `color`; returns live `{fish, cursor}`
  — but 404.html **discards the handle** (🔧 one line to keep it).

### ⚠️ Engine traps
- Pushing coral directly into `state.coral` skips `markNavDirty()` → stale pathfinding.
- `MAX_CORAL` eviction (`coral.shift()`) **can silently delete host-supplied `isExternal`
  walls** — walls and coral share one array. Latent on design (no coral spawns there) but real.

---

## 2. index.html — fish minigame

✅ Today: `window.heroFish` (full API above) · `#toggleDebug` (Logic) · `#toggleHint`/`#closeHint`
(draw guide) · **QR easter egg is programmatically triggerable — `revealQR()`/`hideQR()` are
global function declarations** (also `registerLineForX(points)` with two crossing lines) ·
`.hero-sig-inline` click = undocumented oval-collapse mini-mode · `updateSpotlight(x,y)` global ·
sections: `#about #believe #featured-work #highlights #endorsements #explore #contact` ·
2 autoplay videos (OpenProse, Nanome — global gate buttons only under reduced-motion/coarse).
Commands registered: `fish.feed`, `fish.logic`, `fish.scare`.

**Gaps (no command yet, all ✅-reachable):** clear tank (`heroFish.clearFish()` — no UI at all),
info labels (`setInfoLabels` — no toggle exists on index), spawn (via `processStroke`, the
design ichthys pattern), reveal the QR egg, fish/food census (`state.fish.length` — no readout
UI exists), hint show/hide. 🔧 X-egg tunables (`X_MIN_LEN 45`, `X_MIN_ANGLE 35°`, window 2500ms)
and hint threshold are consts. **Note: `.hero-search-input` does not exist anywhere — the
overlay's `setupHeroSearch` is a dead code path.**

## 3. design.html — blueprint + maze

✅ Today: `window.designFish` · `#clearCanvas` (Walls) · `#clearFish` · `#toggleLabels` ·
`#toggleGuide`/`#closeGuide` · **global page functions** (top-level declarations):
`clearCanvas(), eraseCrossedShapes(points)→count, insideEnclosure(x,y)→bool, syncObstacles(),
generateIdealShape(), startAnimation(), endDraw(), initAmbientParticles(), updateSpotlight()` ·
ShapeDetect global · sections `#intro #projects #pastwork #education #awards #endorsements
#services #explore` (+unlisted `#credentials #external`) · 2 live `<model-viewer>` awards
(camera APIs once loaded; lazy via IntersectionObserver + saveData/2g skip) · three 2-loop
videos (`nanomeVideo` has a gate button; the other two replay on video click only after
parking) · YouTube iframe (no JS API). Commands: `maze.clearWalls/clearFish/labels/feed/spawn`.

**🔧 Sealed state (top-level `let/const`, NOT on window):** `recognizedShapes[]` (the walls),
`whisperLabels[]`, `particles[]`, `ripples[]`, `currentStroke`, `TIMING` (incl. **`maxShapes:50`
— declared but NEVER enforced**, ⚠️), `ERASE_CROSSINGS=3`, `colors` palette, `showLabels`.
Consequences: **no undo / delete-last-wall** (needs `recognizedShapes.pop()+syncObstacles()+
startAnimation()` — two of three are global); no programmatic wall-draw (same trio); no
"say something on the canvas" (whisperLabels sealed); no erase-difficulty/palette retune.
**Asymmetry:** design lacks logic-view + scare commands; index lacks labels + clear + spawn —
both engines support the full set.

**endDraw router knobs** (branch order): erase ≥3 crossings → loop→fish (`allowTypes:['fish']`
is the whitelist — widening it enables coral/jellyfish/bubble spawns on design) → tap<25px→
food/Point → shape confidence>0.5→wall → fallback fade.

## 4. art.html — cosmic canvas

✅ Everything is top-level = on window: **`spawnRipple(x,y)`** (expansion ring + sparkles +
forest brightening), `CONFIG` (`starCount:400, expansionSpeed:4, fadeSpeed:0.015` — live-
tunable; `maxRadius` dead), `initStars(), startAnimation(), stopAnimation(), brightenForest()`,
state arrays `stars/expansions/sparkles`, `starBoost` (cap 0.45) · **`jhanaSlideshow` object
API**: `.start/.stop/.next/.prev/.showSlide(i)/.togglePause` + `#jhanaPauseBtn` · 
`copySeedPhrase()` global (⚠️ button label resets to "Copy" not "Copy Seed Phrase") ·
sections `#about #installations #writing #sculpture #4dart #photography`.
**No shooting stars exist** — would be new work, not exposure.

## 5. about.html / services.html / nanome2.html

Mostly content; controls = nav + anchors + CTAs:
- **about**: sections `#bio #experience #education #expertise #awards` (+`#research #contact`
  NOT in TOC — invisible to synthesized section commands until added), mailto, socials.
- **services**: sections `#intro #coaching #design-services #endorsements #book`;
  **the site's only booking CTA**: `mailto:...?subject=Intro%20Call%20—%20AI%20Coaching`.
- **nanome2**: sections `#overview #process #demo` (+`#video #links` unlisted) · 3 autoplay
  videos (desktop: no control surface at all) · **3D sync demo gate**: unlock = `.demo-overlay`
  click (inline `classList.add('active')`) but ⚠️ an IntersectionObserver **auto-relocks**
  when scrolled away — an "unlock the demo" command must also scroll it into view · YouTube
  iframe (no API).

## 6. openprose.html — richest surface, almost all sealed

✅ Exposed: `window.__embedDebug()` (read-only embed states) · `swap-logo-changed` CustomEvent
(listen-only) · durable handles: `documentElement[data-mode]` + `localStorage['openprose-
canonical-mode']` (theme), synthesized clicks on `#mode-toggle`, `.logo-tile[data-family=
style|infinite|circle|swish|cursive]`, `#expl-trigger`/`#expl-close` (exploration sheet),
`#install-copy`, `#canvas-video-slot .yt-facade` (click-to-load YouTube — nothing reaches
Google before it) · same-origin iframes can post `{cv:'fs-toggle'|'fs-exit'}` for the Review
Canvas fullscreen · sections `#brief #canvas-tool #breadth #logo #creatures #finalists`.

🔧 Sealed in IIFEs: symmetry hero (`spawnRipple(u,v)` lake / `spawnCloudClear(u,v)` sky brush,
`scheduleRain`), bloom canvas (`plop/pluck`, auto-drops, recolors on data-mode via
MutationObserver), mode `flip()`, `applyLogo()/idx`, embed manager (`wake/sleep/drain`,
MAX_LIVE 5, 6 auto panels), fullscreen overlay open/close.

## 7. playground.html — bespoke (rebuild pending; loads overlay but NOT jh-chrome)

✅ All top-level = on window: **`zoomAt(vx,vy,f), zoomCenter(f), fitAllCards(), resetView(),
loadCard(card), checkCardVisibility()`**, state `worldX/worldY/worldScale` (0.20–1.50) ·
buttons `#btnZoomIn/Out/Reset`, filters `[data-filter=all|game|tool|demo|ideas]` (filtering
unloads hidden iframes), per-card `.size-btn[sm|md|lg]` + `.card-unload` · **10 cards
addressable by id** (`card-cyberbird/sna/3dsync/bhg/gold/goth/matrix/typo/hypercube/dynaboard`;
3 are click-gated no-autoload). "Zoom to card X" = position + `zoomAt` — everything needed
is exposed. Per plan decision #5: don't invest, but commands cost nothing here.

## 8. writing.html + 404.html — OUTSIDE the command bar today

- **writing.html loads NO shared scripts** (no overlay, no chrome, no ⌘K/`/`/?q=). Its own
  rich exposed API: `openFile(path)` (essay picker; **URL-invocable via `#slug`**: eduos-plea,
  eduos-classroom, eduos-quickstart, eduos-implementation, metamedium-overview,
  metamedium-lineage), `closePanel(), navPrev/Next/Back/Forward(), downloadCurrent()` (the
  site's only download), **`toggleTheme()`** + `localStorage['jh-theme']` (one of only two
  theme systems on the site). ⚠️ **BUG: `let history = []` at :1064 shadows `window.history`;
  `closePanel()` :1252 calls `history.replaceState(...)` on the Array → TypeError every panel
  close** (hash never cleared; visible close survives only because it's the last statement).
- **404.html**: no overlay. Ambient fish handle is **discarded** at :140 (🔧 assign it to a
  global to enable "make the fish follow x/y" via the live `cursor` object). Its `.nav-right`
  contains PAGE links, not anchors — the section-command synthesizer would mis-read it if the
  overlay ever lands there.

## 9. Site chrome (jh-chrome.js, shared.js)

- **Video gate**: exists ONLY under `prefers-reduced-motion` or coarse-pointer. Programmatic
  play/pause works both worlds via DOM (`querySelectorAll('video').forEach(v=>v.pause())` —
  gate buttons sync via play/pause events). 🔧 `initAutoplayGate` is private (can't gate
  desktop on demand). **"Pause all videos / play all videos" is buildable today, site-wide.**
- **Cursor spotlight** ⚠️: cannot actually be disabled — `.active` is re-added on next
  mousemove by a private flag. DOM workaround: `display:none` the element. 🔧 real setter.
  No reduced-motion guard on it either.
- **Lightbox**: full API exists in shared.js but **no live page has the markup** — dormant
  surface site-wide.
- **Nav**: `#nav .visible` settable but scroll recomputes on hero pages (no pin). `.nav-toggle`
  click is toggle-only (no idempotent open/close). `<jh-nav current>` doesn't react to
  attribute changes. `window.JH_SITE` readable (version etc.).

## 10. The search's own meta-surface (entirely unregistered today)

✅ Exposed now: `openSearch(q)`, `closeSearch()`, `JHSearch.{checkEngines({probeLocal}),
runQuery, doSearchOnly, doAIGeneration, executeCommand(id), commands, chunks, semanticState,
enginesChecked}` · readable state: `body.dataset.searchEngine`
(bm25|webgpu-active|lmstudio|ollama|custom|webgpu-available), `dataset.searchSemantic`.

DOM-only (🔧 clean setters missing — and ids differ between shells, `so-` vs bare):
AI on/off (checkbox + change event; **not persisted** — resets to on every load), engine
switching (section clicks, guarded no-ops), Detect local (**click IS the network consent**),
Load browser model (`enableBtn`; overlay-only one-shot `engineBarLoadBtn`), custom endpoint
set/clear (⚠️ clear leaves `activeEngine='custom'` stale).

Storage keys: `jh-local-llm-optin` (⚠️ **one-way latch, no reset path anywhere**),
`searchCustomEndpoint`, `searchActiveEngine` (⚠️ **written but NEVER read — dead key;
engine choice doesn't actually persist**), `jh-force-webgpu` (console-only escape hatch, no
UI — perfect meta-command candidate). CacheStorage holds the 585MB model; **no clear path
exists** ("forget the downloaded model" = unbuilt).

⚠️ Design tension: `onCommandRun` closes the overlay — a settings meta-command would dismiss
the very panel showing its effect. Meta-commands need a keep-open flag on the command.

---

## 11. What compound commands need (implications, not yet built)

1. **Registry schema grows params**: `{id, title, …, params: {count:{type:'int',min,max},
   size:{enum:['small','medium','large']}}, run(args)}` — the same schema feeds the tool-use
   tier as real OpenAI function parameters (today all tools take `{}`).
2. **A quantity/size parser in the grammar tier**: numbers (`5`, `five`, `a couple`, `max`),
   size words, and conjunction splitting ("add 5 small fish, 3 medium **and** max large" →
   three invocations of one parameterized command). Deterministic, regex+lexicon — the
   Scratch-era way; the LLM tier gets the same ability via tool parameters for free.
3. **`spawnClassified` passthrough + `setLimits`** in the engine (the two 🔧 that make
   "N fish of tier X" honest — synthesizing N ichthys strokes works today but fights the
   caps; "max large" wants `setLimits` or clamp-and-report).
4. **Cap-aware feedback**: commands should report "added 6 of 9 (tank limit)" rather than
   silently evicting.
5. **Confirm-chip batching**: a compound utterance via the LLM tier yields multiple tool
   calls — chips should render as a batch with one "run all".
