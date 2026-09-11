# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Portfolio website for John Hanacek showcasing work at the intersection of **Creativity, Curiosity, AI & Human Augmentation**.

**Site Structure:**
Each page is a standalone HTML document with embedded CSS and JavaScript. All pages share `styles/shared.css` (design system), the `<jh-nav>`/`<jh-footer>` chrome components (`scripts/jh-chrome.js`), and Google Fonts (Raleway, JetBrains Mono).

**Roadmap:** `Agent Reference/V2_RELEASE_PLAN.md` is the single source of truth for what's planned and decided. v1.7 "Foundation" ✅ → v1.8 "Unified Canvas Engine" ✅ → v1.9 "Fish Maze" ✅ → **v2.0 "Release" ✅ (tagged 2026-08-30)** — Search Enrichment became the full command-bar product (see `Agent Reference/SEARCH_COMMAND_BAR.md`), plus the QA/polish/de-boxing close-out. Next cycle: the bar as the site's interface (resource register, site-wide jumps, chunks-as-content compiler — planned in SEARCH_COMMAND_BAR.md discussions).

## Sitemap

### Public pages (in sitemap.xml, canonical to https://www.johnhanacek.com)

| Page | Shape | Role |
|------|-------|------|
| `index.html` | Triangle | Homepage — fish minigame hero canvas, portfolio intro |
| `design.html` | Rounded Square | Design — Fish Maze: blueprint drawing canvas + living fish (v1.9 flagship; original demo preserved in Archive) |
| `art.html` | Circle | Art — cosmic canvas, writing/worldbuilding, Earth Star, Influence |
| `about.html` | Diamond | About — bio, experience, education, expertise, awards |
| `services.html` | Star | Services — AI coaching (JH Coaching OS), Claude Code coaching, founding designer |
| `nanome2.html` | — | Nanome 2 Redesign case study (subpage of Design) |
| `openprose.html` | — | OpenProse founding-design case study (subpage of Design). Brings its own design language (IBM Plex + Kecal, warm paper) and loads `styles/jh-chrome.css` **instead of** `shared.css` — see below |
| `playground.html` | Hexagon | Playground — a Review Canvas of the whole site: every page and every demo, live, in canvas/grid/focus modes |
| `writing.html` | — | Writing index/reader — fetches and renders the `writing/*.md` essays (EduOS + MetaMedium sets); linked from art.html |
| `search.html` | 🔍 | AI-powered search (3-tier: BM25 / WebGPU / local LLM) |

`404.html` — custom 404 with fish canvas overlay (noindex, has JSON-LD).

### Unlisted pages & internal experiments (registry — do not add to sitemap/nav)

These are intentional. All carry `<meta name="robots" content="noindex, nofollow">` unless noted. Never add `Disallow:` lines for them to robots.txt (that would publish the paths); obscurity = unlisted + noindex.

| File | Status |
|------|--------|
| `onagents.html` | Finished ~37k-word essay "The Problems of Agent Orchestration". Still `noindex`, but now **linked from playground.html** — the canvas was its release vehicle, so it is discoverable by humans while staying out of search. |
| `tidepool.html` | Internal experiment — bioluminescent tidepool canvas visualizing an AI-agent ecosystem. Now listed on playground.html (still `noindex`). |
| `beach-beers.html` | Internal experiment — whimsical animated SVG scene. Now listed on playground.html (still `noindex`). |
| `fish-demo/` | Standalone extraction of the fish minigame (`index.html` + `fish.js`). Testbed / seed for the v1.8 `scripts/fish-engine.js` extraction. |
| `Assets/JH-brand-styleguide.html` | Internal brand/design-token reference ("Deep Sea Terminal" styleguide v1.0). |
| `Assets/DemosPlayground/test-llm.html`, `test-vision.html` | LLM/VLM proof-of-concept pages (Qwen 0.8B WebGPU + LMStudio/Ollama). |
| `Assets/DemosPlayground/pretext-wrap-test.html` | Test rig for `scripts/pretext-wrap.js` — circle and ellipse obstacles with prose flowing both sides. |
| `Assets/media-kit.html` | Render rig for the social media pack — 13 boards in the site's tokens (7 endorsements, clients, services ×2, outcomes, awards, offer). **The copy lives in `Assets/media-kit.json`** — edit that file, never board markup; the rig only draws. `node scripts/render-media-kit.mjs` screenshots each at 2x into `Assets/media-kit/` (square / portrait / wide; `--light`, `--only=`, `--video` for 12 s MP4s). Both rigs serve the repo via `scripts/serve-verified.mjs` (port-probe + sentinel proof — the 2026-09-10 404-resume incident). |

**Never commit business/personal documents (invoices, contracts) to this repo — it is public and served.** Resumes in `Assets/` are intentionally public.

## Navigation System

Rendered by the `<jh-nav current="home|design|art|about|services|search">` component from `scripts/jh-chrome.js` — edit the nav in that one file, not per-page:

```
[🔍 Search] [Triangle/Home] [Square/Design] [Circle/Art]   "John Hanacek"   [Diamond/About] [Star/Services] [Hexagon/Play]
```

- Search icon leftmost, then primary shapes: Home, Design, Art
- Center: "John Hanacek" text link → index.html
- Secondary shapes (right): About, Services, Play
- `current` attribute sets `class="active"` + `aria-current="page"`
- Each page keeps its own `.nav-toggle` + `.nav-right` (per-page section TOC)
- **Two states, one measured boundary** (`initNavFit` in jh-chrome.js): DESKTOP (shapes + title + full-word TOC row) until the row stops fitting — per page, ~1020px (art) to ~1340px (design), with index ~1220 and about/services ~1140 (v2.08 measurements: the +10% type moved every fold point, which is exactly what a measured boundary is for) — then MENU (`.nav-menu` on `#nav`): title gone, TOC in the hamburger dropdown with full words, shape strip wearing its labels at one fluid size down to 320px, in 44px-tall targets. On TOUCH the hero shape-nav pill wears the same grammar — labels on by default, a 22px glyph inside the folded bar's own 16–26px band, 44×44 targets — instead of the bare 20px glyphs it used to show while the bar an inch above it showed the same marks with words. No abbreviation tier (the old auto 2-char codes collided: about.html rendered EX twice) and no viewport breakpoints for the swap; hysteresis prevents boundary flicker (regression suite: `Agent Reference/maze-tests/navfittest.mjs`). Pages without a `.nav-right` get `.nav-no-toc` (toggle hidden)
- Nav is fixed, appears after scrolling past hero section
- `writing.html` wears the chrome too now (integrated 2026-08; keeps its own reader header/toggle, shares `jh-theme`)

**Shape SVGs:** single-sourced in `scripts/jh-shapes.js` (triangle, rounded-square, circle, diamond, star, hexagon, search magnifier) — consumed by both `<jh-nav>` and the hero shape-nav strips via `data-jh-hero-nav` placeholders; nav-link metadata lives there too.

## Design System — "Deep Sea Terminal"

**Color Palette (`:root` in `styles/jh-chrome.css` — NOT shared.css):**
- `--sea-deep`: #020a12 (page background) · `--sea-mid`: #051018
- `--cyan`: #b2e8fa (headings, accents) · `--cyan-dim`: #4dc9f6 (borders/glows only)
- `--gold`: #d4af37 (hover accent, highlights)
- `--text-primary`: #b0cedc (body) · `--text-bright`: #eaf5fa · `--text-heading`: #b2e8fa
- `--muted`: #95aebb (dimmed text) · `--border`: rgba(var(--cyan-dim-rgb), 0.2)
- `--ink-quiet`: #a5d5e6 · `--ink-faint`: #86bccf — see the alpha rule below

**v2.08 ink brightness.** Every dark-mode TEXT token is its v2.07 value at **+15% HSL
lightness** (hue and saturation held; capped at 97% — this palette has no pure white).
`--cyan` is in that set because 14 of its 25 uses are `color:`, and `--cyan-rgb` with it
because that triplet is almost entirely dimmed cyan text. `--cyan-dim` is NOT — it is
never a text color, only borders and glows, so decoration weight is unchanged.

**Two rules that keep the palette one palette:**
1. **A page may ALIAS tokens; it must never RESTATE values.** `playground.html` is the
   model (`--paper: var(--sea-deep)`); `writing.html` was the counter-example and is now
   aliases only. A restated hex is a frozen copy that drifts silently — and worse, a
   page's own `[data-theme="light"]` block (0,1,0) LOSES to jh-chrome's
   `:root[data-theme="light"]` (0,2,0), so a hand-rolled light theme half-applies. That
   is exactly what writing.html shipped: the site's cool ground with its own warm gold.
2. **Never dim text with alpha.** `rgba(var(--cyan-rgb), 0.35)` reads as "quiet" but buys
   it with contrast, and **alpha cannot be fixed by a theme** — the same 0.35 that is too
   faint on black is too faint on paper. The canvas chrome failed AA in BOTH themes this
   way (2.6–4.3:1 dark, 1.7–2.3:1 light). Use `--ink-quiet` / `--ink-faint`, which carry
   a real per-theme value. Alpha on *borders, fills and glows* is fine.

**Theme flips must not straddle a transition.** An element with a `transition` on `color`
does not re-resolve a `var()`-derived color when `data-theme` flips — it keeps the old
theme's computed value indefinitely. jh-chrome.js adds `.jh-theme-switching` around the
attribute swap (dropped two frames later) and that class kills transitions. Loading into
a theme was always fine; only the live toggle broke, which is why it went unnoticed —
`contrasttest.mjs` now tests both paths for exactly this reason.

**Typography:**
- Headings: 'Raleway' (thin weights 200-600)
- Subheadings/Labels: 'Raleway'
- Body/Code: 'JetBrains Mono' (monospace, primary body font)
- **ONE scale, ten steps** (`--text-4xs` … `--text-3xl` in jh-chrome.css) and **one
  multiplier**, `--type-scale`. Every font-size on the site is a step — there is no
  such thing as a literal `font-size: 0.62rem` any more (v2.08 folded 45 distinct
  literals across ~160 declarations onto the ladder; 25 of them lived in the
  0.4–0.95rem band where no two neighbours were tellable apart, which is what read
  to visitors as "lots of fonts"). Step values are the historical ones, so the
  SIZE lives entirely in the multiplier: 1.1 site-wide, **1.15 in the tablet band**
  (601–1024px). Sizes derived from a step multiply by it explicitly (`h2`'s clamp,
  the about-card clamp). The hero `h1` clamps are deliberately outside it — they
  are fitted to the oval drawn around them and answer to vw.
- **Weights move in one step, mono only.** Running text 400 → 500, everything that
  was emphasis at 500 (h3, h4, `strong`, the year badges) → 600. Raleway keeps its
  thin 200/300 display faces — that thinness is the voice. Free of layout risk:
  JetBrains Mono's 400/500/600 share an advance width, so no line can rewrap.
- Loaded from Google Fonts — **one request string on every page** (Raleway
  200;300;400;500;600 + JetBrains Mono 400;500;600). Raleway 100 was loaded for
  years and never used; JetBrains 600 was used (`.oval-scroll-label`) and never
  loaded. writing.html and playground.html carried their own third and fourth
  variants of the string. openprose.html keeps its own — it needs Raleway 300 only.
  (Cinzel was retired; only onagents.html still uses it.)
- Reference: `Assets/JH-brand-styleguide.html`

**Accessibility:**
- WCAG AA compliant color contrast — **verified, not assumed**: `Agent Reference/maze-tests/contrasttest.mjs`
  sweeps 10 pages × both themes × both entry paths (loaded into a theme, and the real
  `.jh-theme-btn` clicked) and exits non-zero on any failure. Currently 0. Run it after
  any color, weight or size change; measuring by flipping `data-theme` from JS alone
  reads mid-transition values and will lie to you.
- Prefers-reduced-motion support
- Skip-link for keyboard navigation
- Semantic HTML with ARIA labels
- Structured JSON-LD data on all pages

## Versioning (single source of truth)

The site version lives in **one** place: `version` in the `SITE` object in `scripts/jh-chrome.js`. It renders the footer badge at runtime. After bumping it (or changing any shared asset), run:

```
node scripts/sync-version.mjs
```

which stamps every `?v=` cache-bust ref across root `*.html` **and** the `Portfolio vX.Y` badge in README.md. Never hand-edit `?v=` values.

## Key Features

### Interactive Hero Canvas (index.html — Fish Minigame)
- Interactive aquatic ecosystem with fish, coral, food, bubbles, jellyfish
- Real-time physics, AI behaviors, and steering systems
- Touch and mouse support for drawing entities
- See `Assets/FISH_SYSTEM_TECHNICAL.md` for full technical reference
- Debug mode: "Logic view" checkbox in the hero controls (wired to `heroFish.setDebug`)
- **Shared engine (v1.8):** the whole system lives in `scripts/fish-engine.js` — `FishCanvas(canvasEl, opts)` (full minigame, used by index.html; page hooks: `onDrawingChange`, `onStroke`) and `FishCanvas.ambient(canvasEl)` (single cursor-following fish, used by 404.html). `fish-demo/` still runs its own `fish.js` — that file is a compiled esbuild bundle whose source (`fish-src.js`) lives only on John's machine (gitignored); rebase it onto the engine locally when convenient

**Fish Minigame Architecture:**
- **Layered Behavior System**: Priority stack (Edge Avoidance → Heading Commitment → State Behaviors → Collision → Formation → Wander)
- **Three Fish Categories**: Small (<35px), Medium (35-60px), Large (>60px)
- **Small Fish**: Home in coral, flee from predators, behavior locking
- **Medium Fish**: V-formation schooling with stable slot assignments
- **Large Fish**: Solitary, territorial, dominance challenges
- Design doc: `Assets/FISH_MINIGAME_DESIGN.md`

### Blueprint Drawing Canvas + Fish Maze (design.html — v1.9 flagship)
- Fullscreen blueprint canvas; shape recognition (circles, squares, triangles, arrows, lines) with morph animations, whisper labels, particle effects
- **Fish Maze:** a transparent `#fishCanvas` above the blueprint runs the shared engine in embedded mode (`interactive:false`, `renderStyle:'blueprint'` cyan line-art). Stroke routing priority in design's `endDraw`: scratch-out erases any wall the stroke crosses ≥3 times (amber burst) → loop spawns a fish → tap feeds fish (blueprint Point when tank empty) → clean shape becomes a blueprint wall + maze obstacle → fallback stroke fades
- **Erase is relational, not gestural.** A stroke removes a wall by *crossing its outline* ≥3 times (`ERASE_CROSSINGS`, via `ShapeDetect.segmentsIntersect`) — no speed, density, or ink-ratio thresholds to tune per device. A line drawn through a wall crosses twice and is safe; a stroke on empty canvas crosses nothing; a scribble kept strictly *inside* a shape crosses nothing and deliberately does not erase. This replaced a reversal-counting + ink-ratio heuristic that was tuned against dense synthetic zigzags and silently failed on real sparse hand-drawn scratches
- Walls are the drawn OUTLINE (block chains along idealPoints — a rectangle is a pen, a circle a ring tank; interiors are open water). Engine wall physics (`applyWallPhysics` in `scripts/fish-engine.js`): lookahead slide steering + hard containment that **redirects** velocity along the wall face at full magnitude rather than zeroing the into-wall component — so a fish in contact with a wall can never be stationary, whatever the behaviour stack wants. Plus sustained-contact disengage.
- **Solids are told apart by capability, not by type.** `SOLID_KINDS` gives each solid `blocks / shelters / raisesLane / softBuffer / engineRenders`. Coral has all but `blocks`; a maze wall has only `blocks`. Capabilities are opt-in, so a new coral behaviour can never silently apply itself to walls. `isExternal` is just the "supplied by the host page" marker
- **Idle is shaped by the shapes, via rooms.** The same grid is flood-filled into *rooms* — connected open water, per size class. A fish idles in the room it is actually in: small fish patrol its rim (`rim_patrol`), cruisers reverse at the ends of their **corridor** rather than at the canvas edge and pull their lane inside the room. Before this, every tier's idle was anchored to coral and a seabed, neither of which the blueprint has, so idle fish sank to the bottom third and treated the maze as pure collision. Room-restricted targets alone proved sufficient — a 25s soak showed 0.6s of stall — so idle deliberately does **not** run per-fish pathfinding
- **`floorAffinity` is a per-page setting, not a per-page code path.** The aquarium has a seabed (fish sink toward it, cruise lanes hang above the coral); design.html passes `floorAffinity:false` so fish use the full canvas
- **Fish navigate, they don't only steer.** A navigation field (`NAV_CELL` grid + multi-source BFS out from every food pellet, one field per size class dilated by fish clearance) lets fish route *around* walls, through gaps and out of dead ends — so you can lead a fish through a maze by placing food. Local steering alone provably cannot escape a concave pen. The field is rebuilt only when walls or food change, and **with no walls it is never built at all**, so index.html seeks in exact straight lines as it always has. It also answers "is this food reachable, at my size?" as a fact, replacing a 2.5s no-progress guess Clear button removes walls, fish remain; maxShapes 50
- The "Labels" toggle also shows live behavior chips over fish/food (`tier · state · enclosed/gave up`) via engine `setInfoLabels` + the `annotateAt` hook
- The original pre-maze MetaMedium whitepaper demo is snapshotted verbatim at `Archive/design-blueprint-frozen.html` — never edit that snapshot

### Site-wide AI Search / Command Bar (scripts/search-core.js + shells)
- **One pipeline, two shells.** `scripts/search-core.js` owns ALL knowledge and behavior
  (intents, prompts, chunks, engines, generation, command registry); `scripts/search-overlay.js`
  (⌘K overlay, lazy-loads the core on first open) and `search.html` are thin shells passing an
  `el(name)` element adapter. The old "keep the two copies in step" rule is retired — there is
  one copy. Umbrella plan + build record: `Agent Reference/SEARCH_COMMAND_BAR.md`; QA suites:
  `Agent Reference/search-tests/`.
- **Tier 0**: BM25 (MiniSearch) + regex intent grammar — instant, always on
- **Tier 0.5**: semantic layer — chunk vectors precomputed into `Assets/search-chunks.json`
  (`node scripts/build-chunk-vectors.mjs` after editing chunk text; int8 base64) + a ~24 MB
  MiniLM q8 embedder on WASM (works on iOS), lazy-loaded on first search. Results upgrade in
  place via two-mode reciprocal-rank fusion (constants in `hybridMerge` — tuned by
  `search-tests/fusionlab.mjs`, re-run it before touching them). Model choice + HF repo traps:
  `Agent Reference/SEARCH_EMBEDDER_RESEARCH.md`
- **Tier 1**: In-browser LFM2.5-350M (q4f16, 255 MB) via WebGPU on Transformers.js 4.2.0's
  generic `pipeline('text-generation')`. Replaced Qwen3.5-0.8B on 2026-09-01: measured on the
  real RAG prompt, Qwen took 48–109 s to its FIRST token every query (prefill) and 69 s to load
  from cache; LFM2.5 is 0.2–0.3 s to first token, 45–100 tok/s, sub-second cache load.
  **Not available in Safari** (desktop or iOS): onnxruntime-web's WebGPU backend never
  initialises on WebKit (`De().webgpuInit is not a function`) — `checkEngines` says so up
  front instead of downloading into an error. Numbers + Safari findings: SEARCH_MODEL_RESEARCH.md
- **Tier 2**: Local LMStudio/Ollama. **Never probed on page load** — detection runs when the
  overlay first opens, localhost only after the visitor clicks Detect (or opted in before,
  `jh-local-llm-optin`). Embedding-only local models (nomic-embed etc.) are skipped.
- **Commands**: pages declare actions via `(window.JH_COMMANDS = window.JH_COMMANDS || []).push({...})`
  (index: feed/logic/scare; design: clear walls/fish, labels, feed, spawn). Nav + section-jump
  commands are synthesized from each page's `.nav-right` TOC. Typing a matching query surfaces
  action cards; Enter/click runs them. Services/contact/schedule queries get gold intent cards.
- **Tool-use**: with an LMStudio/Custom engine active, the registry is handed to the model as
  OpenAI tools; a tool call renders as a confirm chip — never auto-run.
- **BYOM**: Custom endpoint input with OpenAI-compatible API probing
- **Chunks**: `Assets/search-chunks.json` — flat factual text, field-boosted, each with a
  verified `url` (titles render as links) and a precomputed `vec`
- **The Postcard (6a)**: results render as ONE microdense surface whose density adapts to
  query specificity — LOD ladder (mention → one-liner → tldr sentence → dossier with prose
  pretext-wrapped BOTH sides of its media), allocated by pretext line-arithmetic. Chunks
  carry dev-authored `micro`/`tldr` fields (data, not runtime generation). Hover = shared
  tooltip; compact/comfortable density toggle; empty state shows page-aware suggestion
  chips. **There is no second level** — nothing expands on click. The ladder IS the whole
  surface: the lead arrives at dossier depth, the next at tldr, then one-liners, then the
  tail, all deduped and fitted to the viewport.
- **Production coherence (Phase 9)**: renders MORPH instead of rebuilding (same-query
  interactions swap only changed modules — keyed by `data-id`; new query = full render +
  scroll-to-top); the input + tier strip live in a never-scrolling command frame
  (`.so-command-frame` in the overlay, sticky `.search-wrap` on search.html); list-like
  chunks carry dev-authored `facts` arrays rendered as dossier ROWS (density toggle then
  reaches inside the dossier); one grammar — page badge = the nav link (`design ↗`),
  module bodies are INERT (click-to-pin and its breadcrumb are gone), ↑↓/Enter and a
  3-rung Esc on the keyboard; ⤢ workspace mode
  (≥768px, persisted) splits the overlay into list + a pretext META-PARAGRAPH pane
  (strata of chunks, media as both-sides wrap obstacles, empty state seeds the page's
  own story). **The panel NEVER scrolls** (9e doctrine): the line budget is fitted to
  the viewport by measure→shrink proportional to line-units spent, the tail caps at
  "+N more", and live media (model-viewer/video/img) is GRAFTED across re-renders so
  frames never blink. Spec + build records: SEARCH_COMMAND_BAR.md Phase 9.
- **Scene language (6b)**: on index + design, utterances like "add 3 small fish and 2
  coral" or "draw a circle and put two fish inside" parse (deterministic grammar, never
  bluffs) into a PLAN CARD → confirm → materialize through the real recognizer (design:
  synthetic pointer strokes; providers in each page's inline script close over sealed
  state) with cap-aware receipts and physics-verified "N/N enclosed". "how many fish/what
  shapes" → census bylined "read from the canvas". Providers: `window.JH_SCENE`.
- **Escalation seam (6c)**: the model APPENDS below the postcard ("elaboration" eyebrow),
  an artifact rail pins the grounding chunks deterministically, the census line grounds
  local-model context, and the `scene_execute` tool has the model EMIT scene language
  that the same parser gates into the same plan card.
- **Phase 10 — truth, memory, pieces**: chunks are audited claims (`CHUNK_AUDIT.md` —
  new/edited chunks land with their audit section); the session survives as the
  **residue sentence** (a standing 26px line docked at the bottom of every page:
  question → answer clause, click = reopen restored, ✕ = dismiss for the session, any
  new search resurrects it); **pieces** (`pieces` on chunks — John-owned frameable
  hosts wake LIVE under a one-iframe budget, others render **departure cards** with
  captured posters; every chunk `url` is same-origin, Enter never exits); the
  **wording ladder** (micro → tldr → brief → full — density picks the wording inside
  a constant LOD via `textFor`, stamped `data-txt` for morphs); **media dedupe** (one
  src per render pass, pane wins). Spec + records: SEARCH_COMMAND_BAR.md Phase 10.
- **Engine color coding**: WebGPU=blue, LMStudio=purple, Ollama=orange, Custom=green
- AI toggle: users can disable LLM even when engine detected

### Playground — the site Review Canvas (playground.html)
Rebuilt on the OpenProse review-canvas engine, which replaced the old hand-built
board wholesale. Wears `<jh-nav current="play">`; **no footer** — it is a
full-viewport canvas app, so the site footer and the tool's own were both
removed along with their CSS and the vestigial `?footer=` config.

- Three view modes: canvas (pan/zoom), grid, focus. `?mode=`, `?items=`,
  `?budget=`, `?zoom=`, `?cols=`, `?sort=` all URL-editable
- Manifest: `scripts/playground-items.js` — 34 items, the whole site plus the
  demo collection carried over from the old board
- **Budgeted LRU lifecycle, not naive lazy-load.** `maxLive` iframes (8 by
  default), an IntersectionObserver at 400px, nearest-first wake, eviction with
  600px hysteresis, a 3s idle sweep, and `sleepCell` doing a real
  `iframe.remove()` so documents and WebGL contexts are actually released
- **`nested: true` in the manifest is a recursion guard.** `openprose.html`
  embeds six copies of this same canvas; waking it live would nest the tool
  inside itself. Enforced at BOTH wake paths (`wakeCell` and `openFocus`),
  because focus sets `fFrame.src` directly and bypasses the first one
- `weight: 'heavy'` is recorded per item but not yet acted on — the staged
  perf plan spends optimisation before it spends clicks
- **Type filters are derived, not declared.** The chip vocabulary is whatever
  `cat` values the manifest uses, collected at boot; a new type appears by
  tagging an item. Click selects one, shift-click accumulates, `all` clears.
  State lives in `?cat=a,b` so a filtered view is shareable
- `external: true` marks an off-origin URL — never framed (X-Frame-Options
  would paint a blank), card shows the hostname, opens in a new tab. Shares the
  `neverWake()` predicate with `nested`
- **Focus mode is `z-index: 1100`, above the site nav's 1000.** It is an
  `aria-modal` dialog; at the tool's native z-50 the `← back` button landed
  inside the fixed nav's 40px band and `elementFromPoint` returned a nav icon,
  so it was unclickable — fully-zoomed genuinely had no way out
- Leaving for a real tab appends `?from=playground`, and `jh-chrome.js` renders
  a `← back to playground` chip on any page carrying it — one place, every page
- Plan of record: `Agent Reference/PLAYGROUND_CANVAS_PLAN.md`

### Writing (writing.html + writing/)
- Client-side markdown reader with its own chrome (light/dark theme, breadcrumbs, prev/next)
- Content manifest: `writing/eduos-*.md` (sovereign AI in education) and `writing/metamedium-*.md` (drawing-as-programming lineage)
- Requires an HTTP server locally (fetch()es the .md files)

## Shared Resources

```
styles/shared.css         — design system (typography, cards, hero, grids, responsive).
                            Does NOT @import jh-chrome.css any more (that made the chrome a
                            sequential round-trip). **Every page must link jh-chrome.css
                            itself, BEFORE shared.css** — miss it and the page loses all
                            design tokens and #nav falls back to position:static, growing
                            to thousands of px of stacked shape SVGs that push the content
                            below the fold. This bit onagents.html on 2026-08-27.
styles/jh-chrome.css      — the chrome alone: design tokens + #nav + shape nav + body > footer.
                            Split out so a page with its OWN visual language can still wear the site
                            header/footer (openprose.html loads only this). Two rules keep it portable:
                            no bare element selectors (#nav, body > footer — never nav/footer), and
                            tokens a host may also define (gold, spacing) are read as --jh-* so a host
                            palette cannot reach in. Chrome also resets font-size-adjust, which
                            openprose's body sets and which otherwise revives the font-size:0 the
                            compact <900px nav title relies on.
scripts/jh-chrome.js      — <jh-nav> + <jh-footer> components; JH_SITE identity + THE site version.
                            Also the site-wide AUTOPLAY GATE: under prefers-reduced-motion or on a
                            coarse pointer, every <video autoplay> is stripped of autoplay, keeps its
                            poster, and gets a corner play/pause control (.video-gate in shared.css).
                            It lives here, not shared.js, because index.html and design.html do not
                            load shared.js but every page with a <video> loads this. design.html's own
                            2-loop videos restate the same media query inline (its block runs before
                            this deferred file).
scripts/shared.js         — nav scroll-visibility, cursor spotlight, lightbox, responsive nav
scripts/search-core.js    — THE search/command-bar pipeline (knowledge + behavior, no DOM);
                            both search surfaces are shells over it
scripts/search-overlay.js — ⌘K overlay shell (lazy-loads search-core on first open)
scripts/search-overlay.css— overlay styles + command-bar card styles (search.html links it too)
scripts/build-chunk-vectors.mjs — dev-time: embeds chunks into search-chunks.json (run after
                            editing chunk text; run `npm install` once — package.json holds the dev deps)
Assets/resume.json         — THE single career source (v2.07): lanes, evidence-backed highlights,
                            awards, talks, publications, projects. Edit this, never the outputs.
scripts/build-resume.mjs   — compiles resume.json: designed one-page PDF (fish-tank margin),
                            ATS twin, 3-page CV, markdown, LinkedIn blocks; `--apply` also writes
                            the served PDF (no phone — the application PDF stays in .local/out/),
                            chunks 4/21/23/26/27/50, john-hanacek.json and about.html resume blocks
                            between `<!-- resume:* -->` markers. `--lane=` picks emphasis. Run
                            build-chunk-vectors.mjs after. Serves itself via serve-verified.mjs.
scripts/serve-verified.mjs — shared by both render rigs: probe a genuinely free port, then PROVE
                            the server is ours (sentinel round-trip) before rendering anything.
                            Exists because a stale server once rendered its 404 into the live
                            resume PDF (2026-09-10).
scripts/playground-items.js — manifest for playground.html (34 items). `nested: true` marks a
                            page that embeds the canvas itself (recursion guard); `weight: 'heavy'`
                            records cost for the staged perf work.
scripts/pretext-wrap.js   — flows running prose around obstacles on BOTH sides, which no CSS
                            shape can do (`shape-outside` excludes on one edge only; `shape-inside`
                            never shipped). Wraps the vendored pretext line-breaker, whose
                            `layoutNextLine(prepared, cursor, maxWidth)` is incremental — so each
                            row is carved into slots and asked for a line per slot. ESM, dynamically
                            imported, so pages that don't wrap pay nothing. Extracted from
                            direction-lambda-inkwell-concept.html and generalised (any shape, DOM as
                            source of truth, aria-hidden line layer over a retained prose copy,
                            re-layout on document.fonts.ready + ResizeObserver).
                            Demo/test: Assets/DemosPlayground/pretext-wrap-test.html
scripts/pretext/          — vendored copy of the pretext text-measurement + line-breaking engine
                            (see VENDORED.md). Also usable measurement-only: prepare() + layout()
                            answer "how many lines at width W" arithmetically with no DOM read,
                            which is the right way to use it for fit/truncate decisions.
scripts/sync-version.mjs  — dev-time version stamper (reads version from jh-chrome.js)
john-hanacek.json         — structured data for AI/Search (Schema.org Person)
robots.txt                — allows AI crawlers explicitly; points to sitemap
sitemap.xml               — the 9 public pages (www host); secrets stay out
llms.txt                  — AI-readable site summary
CNAME                     — www.johnhanacek.com (GitHub Pages)
Assets/
  search-chunks.json      — search index
  media-kit.json          — the media pack's copy (13 boards); media-kit.html only draws it
  favicon-jhsigfrmpaper.png
  JHsig.svg               — signature used in nav + footer + hero (vector; white fill baked in)
  footer-JHsig.png        — superseded raster signature; still referenced by the frozen Archive/ snapshots, so it stays
  socialgraph-jhcom.webp  — OG image
  FISH_*.md               — fish system design/technical docs
  DemosPlayground/        — interactive demos loaded by playground.html + test-llm/test-vision PoCs
  3d-sync-demo/           — Three.js synchronized viewports demo
```

## Footer Pattern

Rendered by `<jh-footer>` (scripts/jh-chrome.js) on all standard pages — edit there, not per-page:
signature image → copyright "© 2026 John Hanacek · JHDesign LLC" → GitHub link → version badge.

## Contact & Social

- Email: hi@johnhanacek.com (the ONLY email; jhanacek.net is the retired old domain)
- LinkedIn: linkedin.com/in/johnhanacek
- Bluesky: johnhanacek.bsky.social
- X/Twitter: x.com/johnhanacek
- GitHub: github.com/jjh111/johnhanacek

## Development Notes

**File Structure:**
Each page is a standalone HTML file with:
- shared.css + jh-chrome.js (components) + Google Fonts + inline CSS/JS
- Inline `<style>` and `<script>` blocks for page-specific behavior
- Open Graph + Twitter Card meta tags, self-canonical (public pages only)
- JSON-LD structured data
- WCAG AA accessibility

**Performance Optimizations Applied:**
- Voronoi background removed (was 40-50% CPU)
- CSS shimmer simplified (removed hue-rotate)
- Canvas animation pauses when idle (30-40% savings)
- Playground: visibility-based iframe loading/unloading
- Videos compressed to web bitrates (1280w, H.264 CRF 27, muted-autoplay embeds have no audio track)

**Local dev:** `python3 -m http.server 1337` from the repo root (writing.html and search need HTTP, not file://).

**Running the test suites** (`Agent Reference/maze-tests/`, `search-tests/`):
from the repo root, `npm install`, then `npm run browsers` — the installer
PINNED to the version `package.json` pins (1.62.1 → chromium-1234). The suites
resolve the browser as `CHROMIUM_PATH || chromium.executablePath()`:
playwright-core's own answer, so no suite spells a cache path by hand and
nothing needs exporting. `CHROMIUM_PATH` remains the override.

**Never run a bare `npx playwright install`.** It fetches the LATEST playwright's
browsers and *deletes* the build the installed `playwright-core` needs, so every
suite breaks at launch with "Executable doesn't exist". That happened on
2026-09-10: it removed a working 1217, installed 1243, matched neither, and
killed two gate runs mid-sweep. Recovery without any download:
`CHROMIUM_PATH=<path to a Chrome for Testing binary>` overrides the lookup, and
every suite honours it.

**After a push, prove the deploy** — there is no CI: `node scripts/check-live.mjs`
fetches every page in the sitemap and asserts each `?v=` ref matches `SITE.version`,
then validates the resume PDF by magic bytes (the 404-page-as-resume incident) and
that both JSON artifacts parse. `--base http://127.0.0.1:1337` runs the same checks
against a local server. Exits non-zero on any disagreement.
