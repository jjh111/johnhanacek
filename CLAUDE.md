# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Portfolio website for John Hanacek showcasing work at the intersection of **Creativity, Curiosity, AI & Human Augmentation**.

**Site Structure:**
Each page is a standalone HTML document with embedded CSS and JavaScript. All pages share `styles/shared.css` (47KB design system) and Google Fonts (Cinzel, Raleway, JetBrains Mono).

## Sitemap

### Primary Pages (in main nav)

| Page | Shape | Role |
|------|-------|------|
| `index.html` | Triangle | Homepage — fish minigame hero canvas, portfolio intro |
| `design.html` | Rounded Square | Design — blueprint drawing canvas demo (frozen/preserved) |
| `art.html` | Circle | Art — cosmic canvas, writing/worldbuilding, Earth Star, Influence |
| `about.html` | Diamond | About — bio, experience, education, expertise, awards |
| `services.html` | Star | Services — AI coaching (JH Coaching OS), Claude Code coaching, founding designer |

### Secondary Pages

| Page | Role |
|------|------|
| `nanome2.html` | Nanome 2 Redesign case study (subpage of Design) |
| `playground.html` | Infinite canvas board with iframe demo cards |
| `writing.html` | JH Coaching Dashboard — standalone coaching resource tool (light/dark theme) |
| `search.html` | AI-powered search (integrating from `Assets/demos/test-llm.html`) |
| `404.html` | Custom 404 page with fish canvas overlay |

### Test/Demo Archive

| File | Purpose |
|------|---------|
| `Assets/demos/test-llm.html` | LLM search PoC (Qwen 0.8B WebGPU + LMStudio/Ollama) |
| `Assets/demos/test-vision.html` | Vision model PoC (Qwen 0.8B VLM) |
| `Assets/DemosPlayground/` | Creative code demos, style refs, interactive experiments |

## Navigation System

The site uses a **shape-based navigation** bar with geometric SVG icons:

```
[Triangle/Home] [Square/Design] [Circle/Art]   "John Hanacek"   [Diamond/About] [Star/Services]
```

- Primary shapes (left): Home, Design, Art
- Center: "John Hanacek" text link → index.html
- Secondary shapes (right): About, Services
- `playground.html` adds its own shape-link in its nav only
- Active page gets `class="active"` + `aria-current="page"`
- Mobile: hamburger toggle for right-side section links
- Nav is fixed, appears after scrolling past hero section

**Shape SVGs:**
- Home/Triangle: `<polygon points="20,8 34,32 6,32"/>`
- Design/Rounded-Square: `<rect x="6" y="6" width="28" height="28" rx="6"/>`
- Art/Circle: `<circle cx="20" cy="20" r="14"/>`
- About/Diamond: `<polygon points="20,6 34,20 20,34 6,20"/>`
- Services/Star: `<polygon points="20,6 23,16 34,16 25,22 28,34 20,26 12,34 15,22 6,16 17,16"/>`

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

**Accessibility:**
- WCAG AA compliant color contrast
- Prefers-reduced-motion support
- Skip-link for keyboard navigation
- Semantic HTML with ARIA labels
- Structured JSON-LD data on all pages

## Key Features

### Interactive Hero Canvas (index.html — Fish Minigame)
- Interactive aquatic ecosystem with fish, coral, food, bubbles, jellyfish
- Real-time physics, AI behaviors, and steering systems
- Touch and mouse support for drawing entities
- See `Assets/FISH_SYSTEM_TECHNICAL.md` for full technical reference
- Debug mode: press 'D' key

**Fish Minigame Architecture:**
- **Layered Behavior System**: Priority stack (Edge Avoidance → Heading Commitment → State Behaviors → Collision → Formation → Wander)
- **Three Fish Categories**: Small (<35px), Medium (35-60px), Large (>60px)
- **Small Fish**: Home in coral, flee from predators, behavior locking
- **Medium Fish**: V-formation schooling with stable slot assignments
- **Large Fish**: Solitary, territorial, dominance challenges
- Design doc: `Assets/FISH_MINIGAME_DESIGN.md`

### Blueprint Drawing Canvas (design.html — Frozen)
- Shape recognition (circles, squares, triangles, arrows, lines)
- Morph animations and particle effects
- Smart canvas loop that pauses when idle
- DO NOT modify — preserved version of MetaMedium whitepaper demo

### AI Search System (search.html / Assets/demos/test-llm.html)
- **Tier 1**: BM25 instant search via MiniSearch (always on)
- **Tier 2**: In-browser Qwen3.5-0.8B via WebGPU (Transformers.js v4)
- **Tier 3**: Local LMStudio/Ollama auto-discovered on localhost
- **BYOM**: Custom endpoint input with OpenAI-compatible API probing
- **Chunks**: `Assets/search-chunks.json` — flat factual text, field-boosted
- **Engine color coding**: WebGPU=blue, LMStudio=purple, Ollama=orange, Custom=green
- AI toggle: users can disable LLM even when engine detected

### Playground (playground.html)
- Infinite canvas board with pan/zoom (trackpad + mouse)
- Iframe demo cards loaded on visibility
- Categories: 3D, Code, Design, Style
- Caustic ripple background animation

### Coaching Dashboard (writing.html)
- Standalone page with its own design system (not shared nav)
- Light/dark theme toggle
- Priority-based resource sections
- Not part of main portfolio navigation

## Shared Resources

```
styles/shared.css     — 47KB design system (variables, nav, typography, cards, footer, responsive)
scripts/shared.js     — Shared JS utilities
john-hanacek.json     — Structured data for AI/Search (Schema.org Person)
Assets/
  search-chunks.json  — Search index (32 chunks)
  favicon-jhsigfrmpaper.png
  footer-JHsig.png    — Signature image used in nav + footer
  socialgraph-jhcom.webp — OG image
  demos/              — Test/PoC pages (test-llm.html, test-vision.html)
  DemosPlayground/    — Interactive demos loaded by playground.html
  3d-sync-demo/       — Three.js synchronized viewports demo
```

## Footer Pattern

Standard footer across pages:
```html
<footer>
    <div class="footer-oval">
        <p class="footer-signature"><img src="./Assets/footer-JHsig.png" alt="John Hanacek signature"></p>
        <p class="footer-copyright">© 2026 John Hanacek · JHDesign LLC</p>
        <p class="footer-github"><a href="https://github.com/jjh111/johnhanacek">github.com/jjh111/johnhanacek</a></p>
    </div>
</footer>
```

## Contact & Social

- Email: hi@johnhanacek.com
- LinkedIn: linkedin.com/in/johnhanacek
- Bluesky: johnhanacek.bsky.social
- X/Twitter: x.com/johnhanacek
- GitHub: github.com/jjh111/johnhanacek

## Development Notes

**File Structure:**
Each page is a standalone HTML file with:
- Self-contained structure (shared.css + Google Fonts + inline CSS/JS)
- Inline `<style>` blocks for page-specific styles
- Inline `<script>` blocks for page-specific interactivity
- Open Graph + Twitter Card meta tags
- JSON-LD structured data
- WCAG AA accessibility

**Performance Optimizations Applied:**
- Voronoi background removed (was 40-50% CPU)
- CSS shimmer simplified (removed hue-rotate)
- Canvas animation pauses when idle (30-40% savings)
- Playground: visibility-based iframe loading/unloading
