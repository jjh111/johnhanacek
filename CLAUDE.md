# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This repository is being used to transform the **MetaMedium_Whitepaper_v4-TOTRANSFORM.html** into a portfolio website for John Hanacek.

**Current state:**
- `MetaMedium_Whitepaper_v4-TOTRANSFORM.html` - A single-file interactive whitepaper (5,347 lines) titled "MetaMedium: AI Beyond Chat"
- `JHportfolio2026.md` - Content source for the portfolio transformation

**Transformation plan:**
- The whitepaper HTML will serve as the template/foundation for the portfolio site
- The interactive demo canvas functionality will be preserved
- New content from `JHportfolio2026.md` will replace the whitepaper content
- The original MetaMedium whitepaper will be embedded as an iframe in the portfolio

The file is a standalone HTML document that includes embedded CSS and JavaScript for a complete interactive web experience.

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

**Interactive Hero Canvas:**
- Drawing functionality with mouse/touch support
- Stores strokes and fades them over time
- Dark blueprint-style background (#0a1628)

**Demo Canvas (Fish Animation):**
- Three-state interaction: draw fish → draw food → drag food
- Real-time physics with wiggle animation
- Touch and mouse support with grab cursor

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

The portfolio will highlight John Hanacek's work at the intersection of **Creativity, Curiosity, AI & Human Augmentation**.

**Key content sections:**
- **Hero**: Same interactive demo canvas, new text with name pronunciation guide
- **Tagline**: "INNOVATOR · DESIGNER · CREATOR"
- **Education**: MA in Communication, Culture & Technology from Georgetown (2016)
  - Awarded "Most Meta" by peers
  - Thesis on AI-enabled drawing app for education
  - Published research on technology adoption
- **Achievements**:
  - Founder Institute SF 2020 graduate (CEO of AvatarMEDIC)
  - R&D Innovation Award from Aerospace Medical Association (2022)
- **Embedded whitepaper**: iframe to https://jjh111.github.io/MetaMedium/MetaMedium_Whitepaper_v4.html
- **Endorsements**: Quotes from CEOs, researchers, and product managers
- **Links**: Consulting, Media Services, Design Examples, Resume, All Links
- **Social/Contact**: Bluesky, X/Twitter, LinkedIn, email (hello@jhanacek.net)

## Development Notes

Since this is a single HTML file, any modifications should preserve:
- The self-contained nature (no external dependencies except Google Fonts)
- Inline CSS and JavaScript structure
- Accessibility features
- Mobile responsiveness
- Cross-browser compatibility

When editing:
- CSS is in the `<style>` block starting at line 24
- HTML content begins around line 2500
- JavaScript is in `<script>` blocks from line 4200 onward
- The file name includes "TOTRANSFORM" indicating it will be converted into the portfolio site

**Transformation workflow:**
1. Keep the design system, interactive canvas, and navigation structure
2. Replace hero text with portfolio hero content from JHportfolio2026.md
3. Replace whitepaper sections with portfolio sections (education, achievements, endorsements)
4. Add iframe embedding the original whitepaper
5. Update footer with social links and contact information
