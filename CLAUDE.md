# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Portfolio website for John Hanacek showcasing work at the intersection of **Creativity, Curiosity, AI & Human Augmentation**.

**Site Structure:**
Each page is a standalone HTML document with embedded CSS and JavaScript. All pages share `styles/shared.css` (design system), the `<jh-nav>`/`<jh-footer>` chrome components (`scripts/jh-chrome.js`), and Google Fonts (Cinzel, Raleway, JetBrains Mono).

**Roadmap:** `Agent Reference/V2_RELEASE_PLAN.md` is the single source of truth for what's planned and decided. Currently: v1.7 "Foundation" ✅ → v1.8 "Unified Canvas Engine" ✅ → v1.9 "Fish Maze" ✅ (flagship, shipped). Next: v2.0 — Search Enrichment + QA/polish/tag.

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
| `playground.html` | — | Infinite canvas board with iframe demo cards (slated for a future rebuild on jh-deng-template) |
| `writing.html` | — | Writing index/reader — fetches and renders the `writing/*.md` essays (EduOS + MetaMedium sets); linked from art.html |
| `search.html` | 🔍 | AI-powered search (3-tier: BM25 / WebGPU / local LLM) |

`404.html` — custom 404 with fish canvas overlay (noindex, has JSON-LD).

### Unlisted pages & internal experiments (registry — do not add to sitemap/nav)

These are intentional. All carry `<meta name="robots" content="noindex, nofollow">` unless noted. Never add `Disallow:` lines for them to robots.txt (that would publish the paths); obscurity = unlisted + noindex.

| File | Status |
|------|--------|
| `onagents.html` | Finished ~37k-word essay "The Problems of Agent Orchestration". **Held for later release** as part of the future jh-deng-template playground rebuild. |
| `tidepool.html` | Internal experiment — bioluminescent tidepool canvas visualizing an AI-agent ecosystem. |
| `beach-beers.html` | Internal experiment — whimsical animated SVG scene. |
| `fish-demo/` | Standalone extraction of the fish minigame (`index.html` + `fish.js`). Testbed / seed for the v1.8 `scripts/fish-engine.js` extraction. |
| `Assets/JH-brand-styleguide.html` | Internal brand/design-token reference ("Deep Sea Terminal" styleguide v1.0). |
| `Assets/DemosPlayground/test-llm.html`, `test-vision.html` | LLM/VLM proof-of-concept pages (Qwen 0.8B WebGPU + LMStudio/Ollama). |
| `Assets/DemosPlayground/pretext-wrap-test.html` | Test rig for `scripts/pretext-wrap.js` — circle and ellipse obstacles with prose flowing both sides. |

**Never commit business/personal documents (invoices, contracts) to this repo — it is public and served.** Resumes in `Assets/` are intentionally public.

## Navigation System

Rendered by the `<jh-nav current="home|design|art|about|services|search">` component from `scripts/jh-chrome.js` — edit the nav in that one file, not per-page:

```
[🔍 Search] [Triangle/Home] [Square/Design] [Circle/Art]   "John Hanacek"   [Diamond/About] [Star/Services]
```

- Search icon leftmost, then primary shapes: Home, Design, Art
- Center: "John Hanacek" text link → index.html
- Secondary shapes (right): About, Services
- `current` attribute sets `class="active"` + `aria-current="page"`
- Each page keeps its own `.nav-toggle` + `.nav-right` (per-page section TOC); mobile hamburger toggles it
- Nav is fixed, appears after scrolling past hero section
- Exceptions: `playground.html` has a bespoke hardcoded nav (left as-is pending its rebuild); `writing.html` has its own standalone chrome

**Shape SVGs:** defined in `scripts/jh-chrome.js` (triangle, rounded-square, circle, diamond, star, search magnifier).

## Design System — "Deep Sea Terminal"

**Color Palette (`:root` in shared.css):**
- `--sea-deep`: #020a12 (page background)
- `--sea-mid`: #051018
- `--cyan`: #7dd8f7 (headings, accents)
- `--cyan-dim`: #4dc9f6 (secondary accent)
- `--gold`: #d4af37 (hover accent, highlights)
- `--text-primary`: #8cb8cc (body text)
- `--text-bright`: #b8dced (emphasized text)
- `--text-heading`: #7dd8f7 (heading color)
- `--muted`: #7a9aaa (dimmed text)
- `--border`: rgba(77, 201, 246, 0.2)

**Typography:**
- Headings: 'Cinzel' (serif, elegant)
- Subheadings/Labels: 'Raleway' (thin weights 100-600)
- Body/Code: 'JetBrains Mono' (monospace, primary body font)
- Loaded from Google Fonts
- Reference: `Assets/JH-brand-styleguide.html`

**Accessibility:**
- WCAG AA compliant color contrast
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
- **Tier 1**: In-browser Qwen3.5-0.8B via WebGPU (Transformers.js v4; LFM2.5 swap researched,
  gated on device QA — SEARCH_MODEL_RESEARCH.md)
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
- **Engine color coding**: WebGPU=blue, LMStudio=purple, Ollama=orange, Custom=green
- AI toggle: users can disable LLM even when engine detected

### Playground (playground.html)
- Infinite canvas board with pan/zoom (trackpad + mouse)
- Iframe demo cards loaded on visibility
- Categories: 3D, Code, Design, Style
- Caustic ripple background animation
- **Planned rebuild** on jh-deng-template (lives on John's local machine, not in this repo); will host `onagents.html`. Don't invest in the current implementation.

### Writing (writing.html + writing/)
- Client-side markdown reader with its own chrome (light/dark theme, breadcrumbs, prev/next)
- Content manifest: `writing/eduos-*.md` (sovereign AI in education) and `writing/metamedium-*.md` (drawing-as-programming lineage)
- Requires an HTTP server locally (fetch()es the .md files)

## Shared Resources

```
styles/shared.css         — design system (typography, cards, hero, grids, responsive); @imports jh-chrome.css
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
                            editing chunk text; needs `npm install --no-save @huggingface/transformers`)
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
