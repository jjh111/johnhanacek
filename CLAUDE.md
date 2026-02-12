# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Portfolio website for John Hanacek showcasing work at the intersection of **Creativity, Curiosity, AI & Human Augmentation**.

**Current state:**
- `index.html` - Portfolio homepage with interactive fish minigame canvas (in development)
- `design.html` - Design examples page with blueprint drawing canvas demo (frozen/preserved)
- `JHportfolio2026.md` - Content source for portfolio
- Performance optimizations completed: Voronoi background removed, shimmer animation simplified, canvas loop optimized

**Site Structure:**
Each page is a standalone HTML document with embedded CSS and JavaScript for a complete interactive web experience.

## Sitemap

The portfolio consists of 5 main pages:

1. **index.html** - Homepage
   - Hero with interactive fish minigame canvas (fish, coral, food, bubbles)
   - Portfolio introduction with name pronunciation guide
   - Tagline: "INNOVATOR · DESIGNER · CREATOR"
   - Key achievements and education highlights

2. **design.html** - Design Examples
   - Preserves the blueprint drawing canvas demo (draw → recognize shapes → animations)
   - Showcase of design work and interactive demos
   - Frozen version of original MetaMedium whitepaper interactive canvas

3. **art.html** - Art Portfolio
   - Visual art and creative work showcase
   - (To be developed)

4. **services.html** - Services & Consulting
   - Professional services offered
   - Media services, design consulting
   - (To be developed)

5. **about.html** - About & Contact
   - Full bio and background
   - Education: MA in Communication, Culture & Technology from Georgetown (2016)
   - Contact information: hello@jhanacek.net
   - Social links: Bluesky, X/Twitter, LinkedIn
   - (To be developed)

## Architecture

The HTML file contains three main sections in order:

1. **Styles** (lines ~24-2500): Complete CSS design system including:
   - Design tokens using CSS custom properties (`:root` variables)
   - Responsive layout with mobile breakpoints
   - Component styles for hero, navigation, figures, galleries, callouts, principles, etc.
   - Modal/lightbox system for image viewing
   - Animation keyframes

2. **Content/Markup** (lines ~2500-4200): Semantic HTML structure with:
   - Interactive hero section with drawing canvas
   - Fixed navigation that appears on scroll
   - Main content sections (abstract, genealogy, principles, use cases)
   - Image galleries with modal functionality
   - Timeline items with embedded media
   - Footer

3. **Scripts** (lines ~4200-5347): JavaScript functionality including:
   - Hero canvas drawing interaction with sketch persistence
   - Smooth scrolling and navigation behavior
   - Demo canvas with fish animation (draw fish, draw food, drag-to-animate)
   - Image gallery modal/lightbox with keyboard navigation
   - Mobile navigation toggle

## Design System

**Color Palette:**
- `--ink`: #1a1a2e (primary text)
- `--paper`: #f8f6f1 (background)
- `--accent`: #e63946 (links, highlights)
- Sketch colors: blue (#3b82f6), green (#22c55e), purple (#8b5cf6)

**Typography:**
- Headings: 'Space Grotesk'
- Body: 'DM Sans'
- Monospace: 'JetBrains Mono'
- Loaded from Google Fonts

**Accessibility:**
- WCAG AA compliant color contrast
- Prefers-reduced-motion support
- Skip-link for keyboard navigation
- Semantic HTML with ARIA labels

## Key Features

**Interactive Hero Canvas (index.html - Fish Minigame):**
- Interactive aquatic ecosystem with fish, coral, food, and bubbles
- Real-time physics, AI behaviors, and steering systems
- Touch and mouse support for drawing entities
- Dark oceanic background (#0a1628)
- See `Assets/FISH_SYSTEM_TECHNICAL.md` for full technical reference

**Fish Minigame Architecture:**
- **Layered Behavior System**: Priority stack (Edge Avoidance → Heading Commitment → State Behaviors → Collision → Formation → Wander)
- **Three Fish Categories**: Small (<35px), Medium (35-60px), Large (>60px)
- **Small Fish**: Home in coral, flee from predators, behavior locking to prevent oscillation
- **Medium Fish**: V-formation schooling with stable slot assignments
- **Large Fish**: Solitary, territorial, cruise/patrol patterns, dominance challenges
- **Edge Avoidance**: Anticipatory (60-frame look-ahead), reactive (buffer zones), emergency (instant turn)
- **Heading Commitment**: Reversal pressure system prevents abrupt 180° turns
- **Collision System**: Directional push with perpendicular slide (70%) + direct push (30%)
- **Debug Mode**: Press 'D' to toggle visualization of steering forces, zones, and states

**Key Fish Code Locations (index.html):**
- Fish behavior logic: lines ~1000-2200
- Debug visualization: lines ~3065-3450
- Design doc: `Assets/FISH_MINIGAME_DESIGN.md`
- Technical ref: `Assets/FISH_SYSTEM_TECHNICAL.md`

**Interactive Hero Canvas (design.html - Drawing Demo):**
- Blueprint drawing functionality with mouse/touch support
- Shape recognition (circles, squares, triangles)
- Stores strokes and fades them over time
- Particle effects and ripple animations
- Dark blueprint-style background (#0a1628)
- Smart canvas loop that pauses when idle for performance

**Image Gallery:**
- Grid layout (2 columns, responsive)
- Click-to-open modal lightbox
- Keyboard navigation (arrow keys, Escape)
- Image counter display

**Navigation:**
- Fixed nav bar appears after scrolling past hero
- Mobile hamburger menu
- Smooth scroll to sections

## Portfolio Content (JHportfolio2026.md)

Portfolio highlights John Hanacek's work at the intersection of **Creativity, Curiosity, AI & Human Augmentation**.

**Key content (index.html):**
- **Hero**: Interactive fish minigame canvas with name pronunciation guide
- **Tagline**: "INNOVATOR · DESIGNER · CREATOR"
- **Education**: MA in Communication, Culture & Technology from Georgetown (2016)
  - Awarded "Most Meta" by peers
  - Thesis on AI-enabled drawing app for education
  - Published research on technology adoption
- **Achievements**:
  - Founder Institute SF 2020 graduate (CEO of AvatarMEDIC)
  - R&D Innovation Award from Aerospace Medical Association (2022)
- **Endorsements**: Quotes from CEOs, researchers, and product managers
- **Social/Contact**: Bluesky, X/Twitter, LinkedIn, email (hello@jhanacek.net)

## Development Notes

**File Structure:**
Each page is a standalone HTML file with:
- Self-contained structure (no external dependencies except Google Fonts)
- Inline CSS in `<style>` blocks (starting ~line 24)
- HTML content/markup (~line 1500-2500)
- JavaScript in `<script>` blocks (~line 1700+)
- Accessibility features (WCAG AA, semantic HTML, ARIA labels)
- Mobile responsiveness
- Cross-browser compatibility

**Current Development Focus:**
- `index.html` - Implementing fish minigame interactive canvas
- `design.html` - Frozen copy preserving blueprint drawing demo
- Future pages (art.html, services.html, about.html) - To be developed

**Performance Optimizations Applied:**
- Voronoi background animation removed (was 40-50% CPU usage)
- CSS shimmer animation simplified (removed expensive hue-rotate filter)
- Canvas animation loop now pauses when idle (30-40% CPU savings)
- Total performance improvement: ~70-80% CPU reduction

**Navigation:**
- Update nav links to include all 5 pages when they're created
- Current nav structure uses anchor links for single-page sections
- Will need to adapt for multi-page navigation
