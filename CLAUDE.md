# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Portfolio website for John Hanacek showcasing work at the intersection of **Creativity, Curiosity, AI & Human Augmentation**.

**Site Structure:**
Each page is a standalone HTML document with embedded CSS and JavaScript. All pages share `styles/shared.css` (design system), the `<jh-nav>`/`<jh-footer>` chrome components (`scripts/jh-chrome.js`), and Google Fonts (Cinzel, Raleway, JetBrains Mono).

**Roadmap:** `Agent Reference/V2_RELEASE_PLAN.md` is the single source of truth for what's planned and decided. Currently: v1.7 "Foundation & Coherence" shipped; next is v1.8 "Unified Canvas Engine" → v1.9 "Fish Maze" (flagship).

## Sitemap

### Public pages (in sitemap.xml, canonical to https://www.johnhanacek.com)

| Page | Shape | Role |
|------|-------|------|
| `index.html` | Triangle | Homepage — fish minigame hero canvas, portfolio intro |
| `design.html` | Rounded Square | Design — blueprint drawing canvas demo (original frozen demo preserved in Archive; see below) |
| `art.html` | Circle | Art — cosmic canvas, writing/worldbuilding, Earth Star, Influence |
| `about.html` | Diamond | About — bio, experience, education, expertise, awards |
| `services.html` | Star | Services — AI coaching (JH Coaching OS), Claude Code coaching, founding designer |
| `nanome2.html` | — | Nanome 2 Redesign case study (subpage of Design) |
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

### Blueprint Drawing Canvas (design.html)
- Shape recognition (circles, squares, triangles, arrows, lines)
- Morph animations and particle effects
- Smart canvas loop that pauses when idle
- **Freeze status: UNFROZEN as of v1.8.** The original MetaMedium whitepaper demo is snapshotted verbatim at `Archive/design-blueprint-frozen.html` (V2 plan decision #1) — never edit that snapshot. design.html itself may now evolve: v1.8 moves it onto `scripts/shape-detection.js`; v1.9 builds the Fish Maze on it.

### Site-wide AI Search (scripts/search-overlay.js + search.html)
- ⌘K overlay on every standard page; search.html is the full standalone page
- **Tier 1**: BM25 instant search via MiniSearch (always on)
- **Tier 2**: In-browser Qwen3.5-0.8B via WebGPU (Transformers.js v4)
- **Tier 3**: Local LMStudio/Ollama auto-discovered on localhost (handles reasoning models)
- **BYOM**: Custom endpoint input with OpenAI-compatible API probing
- **Chunks**: `Assets/search-chunks.json` — flat factual text, field-boosted
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
styles/shared.css         — design system (variables, nav, typography, cards, footer, responsive)
scripts/jh-chrome.js      — <jh-nav> + <jh-footer> components; JH_SITE identity + THE site version
scripts/shared.js         — nav scroll-visibility, cursor spotlight, lightbox, responsive nav
scripts/search-overlay.js — site-wide ⌘K search overlay (3-tier)
scripts/search-overlay.css— overlay styles
scripts/sync-version.mjs  — dev-time version stamper (reads version from jh-chrome.js)
john-hanacek.json         — structured data for AI/Search (Schema.org Person)
robots.txt                — allows AI crawlers explicitly; points to sitemap
sitemap.xml               — the 9 public pages (www host); secrets stay out
llms.txt                  — AI-readable site summary
CNAME                     — www.johnhanacek.com (GitHub Pages)
Assets/
  search-chunks.json      — search index
  favicon-jhsigfrmpaper.png
  footer-JHsig.png        — signature image used in nav + footer
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
