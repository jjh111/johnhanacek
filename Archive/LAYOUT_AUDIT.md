# Layout & Style Audit: design.html
## Widescreen Optimization Plan

---

## Current State Analysis

### Layout Constraints
| Element | Current Value | Issue |
|---------|---------------|-------|
| `main` max-width | 760px | Wastes 50%+ of widescreen space |
| Content cards | Full width (of 760px) | Single column only |
| Breakpoints | Only `max-width: 900px, 768px, 480px` | No widescreen optimization |
| Card padding | `var(--space-lg)` = 2rem | Generous but not space-efficient |
| Section margins | `var(--space-xl)` = 3rem | Long vertical scroll |

### Visual Style Issues
| Issue | Location | Problem |
|-------|----------|---------|
| Low contrast | Body text | `rgba(255,255,255,0.92)` on dark bg with blur |
| Glassmorphism | `.content-card` | `backdrop-filter: blur(16px)` reduces sharpness |
| Text shadows | All headings | Adds blur, reduces crispness |
| Transparency layers | Multiple | Stacking transparency hurts legibility |
| Color consistency | Various | Mixing cyan/purple/white creates visual noise |

### Information Density
- **Endorsements**: 5 quotes stacked vertically = long scroll
- **Past Work**: 6 projects in single column
- **Education/Awards**: Could be side-by-side
- **No sidebar**: Navigation only at top

---

## Proposed Layout System

### Breakpoint Strategy
```css
/* Current (keep) */
@media (max-width: 900px) { /* Tablet */ }
@media (max-width: 768px) { /* Mobile landscape */ }
@media (max-width: 480px) { /* Mobile portrait */ }

/* NEW: Widescreen */
@media (min-width: 1200px) { /* Desktop */ }
@media (min-width: 1600px) { /* Large desktop */ }
@media (min-width: 2000px) { /* Ultra-wide */ }
```

### Grid System (12-column)
```css
.layout-grid {
    display: grid;
    grid-template-columns: repeat(12, 1fr);
    gap: var(--space-md);
    max-width: 1400px;
    margin: 0 auto;
}

/* Column spans */
.col-full { grid-column: span 12; }
.col-8 { grid-column: span 8; }
.col-6 { grid-column: span 6; }
.col-4 { grid-column: span 4; }
.col-3 { grid-column: span 3; }

/* Responsive */
@media (max-width: 900px) {
    .col-8, .col-6, .col-4, .col-3 { grid-column: span 12; }
}
```

---

## Section-by-Section Recommendations

### 1. Intro Section
**Current**: Single card, full width
**Proposed**: Keep centered but allow breathing room
```
Desktop (1200px+):
┌────────────────────────────────────────────────┐
│            [Tagline - centered]                │
│     [Expertise] ←─────────→ [Tools]            │
└────────────────────────────────────────────────┘
```

### 2. Featured Projects (2)
**Current**: Stacked vertically
**Proposed**: Side-by-side on widescreen
```
Desktop (1200px+):
┌──────────────────┬──────────────────┐
│   MetaMedium     │    EarthStar     │
│   [thumbnail]    │    [logo]        │
│   description    │    description   │
└──────────────────┴──────────────────┘
```

### 3. Past Work (6 items + video)
**Current**: Video + 6 stacked cards
**Proposed**: 2x3 grid with video spanning
```
Desktop (1200px+):
┌────────────────────────────────────────────────┐
│              [YouTube Video - full]            │
├──────────────────┬──────────────────┬──────────┤
│   Nanome 2       │   AvatarMEDIC    │   A1R    │
├──────────────────┼──────────────────┼──────────┤
│   HoloTRIAGE     │   Robot Twin     │          │
└──────────────────┴──────────────────┴──────────┘
```

### 4. Education + Awards
**Current**: Separate sections, stacked
**Proposed**: Side-by-side columns
```
Desktop (1200px+):
┌──────────────────────┬─────────────────────────┐
│     EDUCATION        │     AWARDS              │
│  ┌────────────────┐  │  ┌───────────────────┐  │
│  │ Georgetown MA  │  │  │ Most Meta [3D]    │  │
│  ├────────────────┤  │  ├───────────────────┤  │
│  │ UCSD BA        │  │  │ Founder Institute │  │
│  └────────────────┘  │  ├───────────────────┤  │
│                      │  │ R&D Award [3D]    │  │
│                      │  └───────────────────┘  │
└──────────────────────┴─────────────────────────┘
```

### 5. Endorsements (5)
**Current**: 5 stacked cards (very long scroll)
**Proposed**: 2-column masonry or 2+2+1 layout
```
Desktop (1200px+):
┌─────────────────────┬─────────────────────┐
│  Sheila (longer)    │  Inga (short)       │
│                     ├─────────────────────┤
│                     │  Tommy (medium)     │
├─────────────────────┼─────────────────────┤
│  Dr. Hurriyet       │  Kevin Kelly        │
└─────────────────────┴─────────────────────┘
```

### 6. Services + More
**Current**: Separate sections, minimal content
**Proposed**: Combined into footer-like area or sidebar
```
Desktop (1200px+):
┌─────────────────────────────────────────────────┐
│  SERVICES                [Substack] [LinkedIn]  │
│  Contact: hi@johnhanacek.com                    │
└─────────────────────────────────────────────────┘
```

---

## Legibility Improvements

### 1. Increase Text Contrast
```css
/* Current */
p { color: rgba(255, 255, 255, 0.92); }

/* Proposed */
p { color: rgba(255, 255, 255, 0.95); }

/* Or use solid colors */
p { color: #f0f0f0; }
```

### 2. Reduce Blur Effects
```css
/* Current */
.content-card {
    backdrop-filter: blur(16px) saturate(1.5);
}

/* Proposed: Less blur, more opacity */
.content-card {
    backdrop-filter: blur(8px);
    background: rgba(20, 20, 40, 0.85); /* More opaque */
}
```

### 3. Simplify Text Shadows
```css
/* Current - too much blur */
h2 {
    text-shadow: 0 0 40px rgba(0, 217, 255, 0.7), 0 2px 8px rgba(0, 0, 0, 0.8);
}

/* Proposed - crisp drop shadow only */
h2 {
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
}
```

### 4. Card Background Hierarchy
```css
/* Define clear visual hierarchy */
.content-card {
    background: rgba(15, 15, 30, 0.9);
}
.content-card.featured {
    background: rgba(25, 20, 45, 0.95);
    border: 1px solid rgba(147, 197, 253, 0.2);
}
.content-card.endorsement {
    background: rgba(10, 10, 20, 0.85);
}
```

---

## Implementation Phases

### Phase 1: Grid Foundation (Quick Wins)
- [ ] Add widescreen breakpoints (`1200px`, `1600px`)
- [ ] Create `.layout-grid` and column classes
- [ ] Increase `main` max-width to 1200px (with padding)
- [ ] Add `container` wrapper class

### Phase 2: Section Layouts
- [ ] Featured Projects: 2-column on desktop
- [ ] Past Work: 3-column grid on desktop
- [ ] Education + Awards: side-by-side
- [ ] Endorsements: 2-column masonry

### Phase 3: Legibility
- [ ] Reduce backdrop-filter blur (16px → 8px)
- [ ] Increase background opacity on cards
- [ ] Simplify text shadows
- [ ] Increase body text color contrast

### Phase 4: Refinements
- [ ] Adjust spacing for denser layouts
- [ ] Add subtle dividers between columns
- [ ] Consider sticky sidebar nav on ultra-wide
- [ ] Test on various screen sizes

---

## CSS Variables to Add

```css
:root {
    /* Layout */
    --content-max: 1200px;
    --content-narrow: 760px;
    --sidebar-width: 280px;
    --grid-gap: var(--space-md);

    /* Widescreen spacing (tighter) */
    --space-md-wide: 1rem;
    --space-lg-wide: 1.5rem;

    /* Legibility-focused colors */
    --text-primary: rgba(255, 255, 255, 0.95);
    --text-secondary: rgba(255, 255, 255, 0.8);
    --card-bg-solid: rgba(15, 15, 30, 0.9);
    --card-bg-featured: rgba(25, 20, 45, 0.95);
}
```

---

## Decision Points

**Before implementing, decide:**

1. **Max content width on widescreen?**
   - 1200px (comfortable reading)
   - 1400px (more content density)
   - Full-width with max-width cards

2. **Sidebar navigation?**
   - Keep top nav only
   - Add sticky sidebar on 1600px+
   - Floating TOC

3. **Card density vs readability?**
   - Keep generous padding (current)
   - Tighten for more density
   - Variable based on content type

4. **Glassmorphism intensity?**
   - Keep current (aesthetic but lower contrast)
   - Reduce blur (better legibility)
   - Remove entirely (solid backgrounds)

---

## Quick Win CSS

Add this for immediate widescreen improvement:

```css
/* Widescreen: expand content area */
@media (min-width: 1200px) {
    main {
        max-width: 1100px;
    }

    /* Two-column layouts */
    .two-col {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--space-md);
    }

    /* Three-column layouts */
    .three-col {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: var(--space-md);
    }

    /* Reduce card margins in grids */
    .two-col .content-card,
    .three-col .content-card {
        margin: 0;
    }
}

@media (min-width: 1600px) {
    main {
        max-width: 1300px;
    }
}
```

Then wrap sections in HTML:
```html
<div class="two-col">
    <div class="content-card">Education 1</div>
    <div class="content-card">Education 2</div>
</div>
```
