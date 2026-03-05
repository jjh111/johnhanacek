# johnhanacek.com

Portfolio website for John Hanacek — work at the intersection of Creativity, Curiosity, AI & Human Augmentation.

**[www.johnhanacek.com](https://www.johnhanacek.com)** · Portfolio v1.6

---

## About

Founding Designer & Design Engineer building AI-native products, agentic systems, and spatial computing interfaces. I design and code across the full stack — from prompt engineering and agent orchestration to Unity prototypes, XR interaction design, and interactive web experiences.

Through **JH Design LLC** (est. 2014), I've served as founding designer for startups and R&D teams, leading 0→1 product development, design system creation, and technical prototyping.

- MA in Communication, Culture & Technology — Georgetown University (2016). Awarded *"Most Meta"* by peers for thesis on AI-enabled drawing apps.
- Founder Institute SF 2020 graduate (CEO of AvatarMEDIC)
- R&D Innovation Award — Aerospace Medical Association (2022)

Contact: hi@johnhanacek.com · [LinkedIn](https://linkedin.com/in/johnhanacek) · [Bluesky](https://bsky.app/profile/johnhanacek.bsky.social)

---

## Sitemap

### Primary Pages (main nav)

| Page | Shape | Description |
|------|-------|-------------|
| [index.html](index.html) | Triangle | Home — interactive fish minigame canvas |
| [design.html](design.html) | Rounded Square | Design — blueprint drawing demo, case studies, 3D award models |
| [art.html](art.html) | Circle | Art — interactive installations, writing, 3D/photogrammetry, photography |
| [about.html](about.html) | Diamond | About — bio, work history, education, research & publications |
| [services.html](services.html) | Star | Services — AI coaching, Claude Code coaching, founding designer |

### Secondary Pages

| Page | Description |
|------|-------------|
| [search.html](search.html) | AI-powered search — BM25 + in-browser LLM (WebGPU) + local model support |
| [nanome2.html](nanome2.html) | Nanome 2 Redesign — design case study (subpage of Design) |
| [playground.html](playground.html) | Infinite canvas board with iframe demo cards |
| [writing.html](writing.html) | JH Coaching Dashboard — standalone coaching resource tool |
| [404.html](404.html) | Custom 404 page with fish canvas overlay |

---

## Interactive Fish Minigame (index.html)

The homepage hero is a fully custom aquatic ecosystem canvas. Draw shapes to spawn entities and watch them behave with autonomous AI-driven behaviors.

**Drawing guide:**

| Draw | Spawns |
|------|--------|
| Loop (small) | Small fish — homes in coral, flees predators |
| Loop (medium) | Medium fish — schools in V-formation |
| Loop (large) | Large fish — solitary, territorial, challenges rivals |
| Square | Coral — small fish homebase |
| Triangle | Jellyfish — dangerous tentacles, drifts upward |
| Circle | Bubble cluster — floats up, pops on contact |
| Tap / dot | Food pellet — fish compete for it |

Press **D** to toggle debug/logic view — visualizes steering forces, zones, states, and spawn labels.

**Architecture:**

Layered behavior stack evaluated per fish per frame:
1. Edge avoidance — anticipatory (60-frame look-ahead), reactive, emergency
2. Heading commitment — reversal pressure system prevents abrupt 180-degree turns
3. State machine — idle / seeking / fleeing / challenging / retreating / hiding / hunting
4. Collision avoidance — directional push with perpendicular slide
5. Formation / wander — V-formation schooling (medium), cruise patrol (large), home/wander (small)

Three fish tiers by drawn loop size:
- **Small** (bodyWidth < 35px): coral homecoming, contagious flee, curiosity toward new coral
- **Medium** (35-60px): stable V-formation with slot assignments, scatter from large fish
- **Large** (>=60px): solitary patrol/cruise, territorial challenges, dominance hierarchy

Key implementation details:
- `getCoalescedEvents()` on pointer/touch events for high-fidelity fast-stroke capture
- `findSelfIntersectionLoop()` — self-intersection detection for fish recognition; `avgAngleChange` threshold scaled by sample count so small tight loops aren't rejected
- `cleanupFishRefs(id)` called on every `fish.splice()` — prevents stale rivalId / ignoreRivalId / huntTarget pointers
- Animate loop wrapped in `try/catch` — frame errors are logged and skipped, loop never permanently stops
- `hasActiveAnimation()` pauses `requestAnimationFrame` when nothing is moving (significant CPU savings)

---

## AI Search System (search.html)

Three-tier search system with progressive enhancement:

| Tier | Engine | Description |
|------|--------|-------------|
| Tier 1 | MiniSearch BM25 | Instant keyword search — always on, no dependencies |
| Tier 2 | Qwen3.5-0.8B WebGPU | In-browser LLM via Transformers.js v4 — runs entirely client-side |
| Tier 3 | LMStudio / Ollama | Auto-discovered local models on localhost — higher quality answers |
| BYOM | Custom endpoint | User-provided OpenAI-compatible API endpoint |

**Features:**
- Engine color coding: WebGPU (blue), LMStudio (purple), Ollama (orange), Custom (green)
- Search overlay accessible from any page via `⌘K` or `/` key
- AI toggle: users can disable LLM even when an engine is detected
- 32 search chunks in `Assets/search-chunks.json` with field boosting (title 3x, tags 2x, content 1x)

---

## Design Page (design.html)

Blueprint-style interactive drawing canvas — draw on the dark grid, shapes are recognized and animated with particles and ripples. Stroke persistence with smooth opacity decay.

Also includes: MetaMedium whitepaper interactive demo, design case studies, Google `model-viewer` embeds for the Aerospace Award and BlackBox Award 3D trophies (GLB files), services overview.

---

## Art Page (art.html)

- Interactive cosmos starfield canvas (click to expand)
- Interactive installations: Godish (Leap Motion, 2015), God Like (Kinect, 2016), Influence / [jhana.zone](https://jhana.zone) (p5.js, 2016)
- Writing & worldbuilding: [Earth Star](https://earthstar.space), [Fractal Futures](https://fractalfuture.substack.com) sci-fi series (blurbed by David Brin)
- 3D & sculpture: Granite Omnistump photogrammetry via Sketchfab embed
- Photography portfolio and demo reel

---

## About Page (about.html)

Full professional timeline, education, and research publications:

- Atlantic Council — *Internet as Answer Engine* (Parts I & II) — predicted answer engines 10+ years before ChatGPT
- The Technium (Kevin Kelly) — *A Desirable Future: Haiku*
- HuffPost — *Beyond Network Feudalism*
- EduLearn 2015, Barcelona — technology adoption research
- Georgetown thesis — AI-interpreted learning canvas

---

## Playground (playground.html)

Infinite canvas board with pan/zoom (trackpad + mouse). Iframe demo cards loaded on visibility, categorized by 3D, Code, Design, and Style. Features a caustic ripple background animation.

---

## Navigation System

Shape-based navigation with geometric SVG icons:

```
[🔍 Search] | [△ Home] [□ Design] [○ Art]   "John Hanacek"   [◇ About] [☆ Services]
```

- Search icon (magnifying glass) — leftmost, opens search overlay
- Primary shapes (left): Home, Design, Art
- Center: "John Hanacek" text link → index.html
- Secondary shapes (right): About, Services
- Hero shape-nav visible at top of page; fixed nav appears after scrolling past hero
- Mobile: hamburger toggle for right-side section links, closes on outside click
- Active page gets `class="active"` + `aria-current="page"`

---

## Tech Stack

```
HTML / CSS / Vanilla JavaScript     no frameworks, no build step
styles/shared.css                   global design system (Deep Sea Terminal theme)
scripts/shared.js                   nav scroll, cursor spotlight, mobile toggle
scripts/search-overlay.js           search overlay (⌘K / /) + engine popover
scripts/search-overlay.css          search overlay styles
Google Fonts                        Cinzel, Raleway, JetBrains Mono, DM Sans
Transformers.js v4                  in-browser LLM inference (WebGPU)
MiniSearch                          BM25 keyword search engine
@google/model-viewer v3.3           3D GLB rendering (design page)
Sketchfab embed                     photogrammetry viewer (art page)
```

Every page is a standalone HTML file. No build tools, no npm, no framework. Deploy by pushing to GitHub Pages.

---

## Design System — "Deep Sea Terminal"

Colors (CSS custom properties):

| Token | Value | Usage |
|-------|-------|-------|
| `--sea-deep` | `#020a12` | Page background |
| `--sea-mid` | `#051018` | Secondary background |
| `--cyan` | `#7dd8f7` | Headings, accents |
| `--cyan-dim` | `#4dc9f6` | Secondary accent, glow effects |
| `--gold` | `#d4af37` | Hover accent, highlights |
| `--text-primary` | `#8cb8cc` | Body text |
| `--text-bright` | `#b8dced` | Emphasized text |
| `--muted` | `#7a9aaa` | Dimmed text |
| `--border` | `rgba(77, 201, 246, 0.2)` | Borders, dividers |

Typography: Cinzel (headings, decorative) · Raleway (subheadings, 100-600 weight) · JetBrains Mono (body, code) · DM Sans (alternate body)

Accessibility: WCAG AA contrast · `prefers-reduced-motion` support · skip links · semantic HTML with ARIA labels · JSON-LD structured data

---

## File Structure

```
/
├── index.html              Home — fish minigame
├── design.html             Design examples
├── art.html                Art portfolio
├── about.html              Bio and publications
├── services.html           Services & coaching
├── search.html             AI-powered search
├── nanome2.html            Nanome 2 case study
├── playground.html         Infinite canvas board
├── writing.html            Coaching dashboard
├── 404.html                Custom 404
├── CLAUDE.md               AI assistant context (codebase instructions)
├── README.md               This file
├── CNAME                   johnhanacek.com
├── john-hanacek.json       Structured data for AI/search crawlers
├── llms.txt                LLM-readable site summary
├── styles/
│   └── shared.css          Global design system
├── scripts/
│   ├── shared.js           Shared nav and UI behavior
│   ├── search-overlay.js   Search overlay + engine popover
│   └── search-overlay.css  Search overlay styles
└── Assets/
    ├── search-chunks.json  Search index (32 chunks)
    ├── demos/              Test/PoC pages (test-llm.html, test-vision.html)
    ├── DemosPlayground/    Creative code demos for playground.html
    └── ...                 Images, GLB models, fonts
```

---

## Running Locally

Open any `.html` file directly in a browser, or use a static server for proper asset loading:

```bash
npx serve .
# or
python3 -m http.server 8080
```

---

Built with [Claude Code](https://claude.ai/code) & Open Code.
