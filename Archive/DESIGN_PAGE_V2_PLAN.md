# Design Page v2 Planning Document
## johnhanacek.com/design.html

---

## Vision

Transform the design portfolio into a more visually engaging, interactive experience with consistent layout patterns and embedded interactive elements.

---

## New Layout Pattern: Logo + Content

**Structure:**
```
┌──────────────────────────────────────────────────┐
│  ┌─────────┐                                     │
│  │  LOGO   │  Title / Link                       │
│  │  small  │  Description text                   │
│  │         │  [Interactive element / content]    │
│  └─────────┘                                     │
└──────────────────────────────────────────────────┘
```

CSS approach: Flexbox with logo fixed width, content flex-grow.

---

## Featured Projects - Content Specifications

### 01. MetaMedium: AI Beyond Chat

**Current:** Thumbnail image, description, link

**Desired:**
- [ ] Logo/thumbnail on left (small)
- [ ] Description on right
- [ ] Interactive minigraphic below/inline (TBD - user to specify)

**Content to gather:**
- [ ] Minigraphic concept/design
- [ ] Any updated description text

---

### 02. EarthStar: AI for Planetary Thriving

**Current:** Logo centered, description, link

**Desired:**
- [ ] Logo on left (small)
- [ ] Content on right with:
  - Title/link
  - Description
  - **"Seed phrase"** as plaintext (copyable)

**Content to gather:**
- [ ] Seed phrase text (user to provide)
- [ ] Updated description if needed

**Implementation:**
```html
<div class="project-card logo-left">
    <div class="project-logo">
        <img src="./Assets/EarthStar Logo-tt.png" alt="EarthStar">
    </div>
    <div class="project-content">
        <h4><a href="https://earthstar.space">EarthStar: AI for Planetary Thriving</a></h4>
        <p>Description...</p>
        <div class="seed-phrase">
            <code>[ seed phrase text here ]</code>
            <button class="copy-btn" aria-label="Copy to clipboard">Copy</button>
        </div>
    </div>
</div>
```

---

## Past Work - Content Specifications

### Nanome 2: XR Product Design Case Study

**Current:** Description, thumbnail image, link

**Desired:**
- [ ] Logo/thumbnail on left (small)
- [ ] Content on right
- [ ] **Inline 3D interactive widget** showing "spotlight/follow" paradigm

**Content to gather:**
- [ ] 3D model for spotlight/follow demo
- [ ] Interaction specifications (rotate? click hotspots?)
- [ ] Fallback for non-WebGL browsers

**Technical options:**
1. Three.js inline canvas
2. model-viewer web component (Google)
3. Sketchfab embed (current approach for awards)
4. Custom WebGL shader demo

---

### Other Past Work Items

| Project | Current State | Enhancement Ideas |
|---------|---------------|-------------------|
| AvatarMEDIC | Text only | Add logo? Screenshot? |
| A1R: Augmented First Responder | Image (half-size) | Keep as-is or add interaction? |
| HoloTRIAGE | Image (half-size) | Keep as-is or add interaction? |
| Robot Digital Twin | Text only | Add demo video/GIF? |

---

## Existing TODOs (from redistribution plan)

- [ ] Convert Sketchfab embeds to native 3D (three.js or similar)
- [ ] Add more project thumbnails/images
- [ ] Test on mobile portrait/landscape modes

---

## Enhancement Suggestions

### Visual & Layout
- [ ] Consistent logo-left layout for all project cards
- [ ] Hover states that reveal more info or animate logos
- [ ] Dark/light mode toggle (currently dark only)
- [ ] Progress indicators for long scroll

### Interactive Elements
- [ ] Copy-to-clipboard for seed phrases, code snippets
- [ ] Inline 3D viewers (three.js/model-viewer)
- [ ] Mini interactive demos embedded in project cards
- [ ] Expandable project details (accordion pattern)

### Content
- [ ] Add case study links for more projects
- [ ] Video thumbnails that play on hover
- [ ] Before/after comparisons for redesign projects
- [ ] Process documentation (sketches, iterations)

### Performance
- [ ] Lazy-load 3D content (only init when in viewport)
- [ ] Intersection Observer for scroll-triggered animations
- [ ] Optimize images further (AVIF support)

### Accessibility
- [ ] Ensure all interactive elements are keyboard navigable
- [ ] Add ARIA labels for 3D viewers
- [ ] Reduced motion alternatives for animations

---

## CSS Component Needed

```css
/* Logo-left project card layout */
.project-card.logo-left {
    display: flex;
    gap: var(--space-md);
    align-items: flex-start;
}

.project-card .project-logo {
    flex-shrink: 0;
    width: 80px; /* or 100px, adjust as needed */
}

.project-card .project-logo img {
    width: 100%;
    height: auto;
    border-radius: 8px;
}

.project-card .project-content {
    flex-grow: 1;
}

/* Seed phrase / copyable text */
.seed-phrase {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    margin-top: var(--space-sm);
    padding: var(--space-sm);
    background: rgba(255, 255, 255, 0.05);
    border-radius: 4px;
    font-family: 'JetBrains Mono', monospace;
}

.seed-phrase code {
    flex-grow: 1;
    user-select: all;
}

.copy-btn {
    padding: 0.25rem 0.5rem;
    font-size: var(--text-xs);
    cursor: pointer;
}

/* Mobile: stack vertically */
@media (max-width: 480px) {
    .project-card.logo-left {
        flex-direction: column;
        align-items: center;
        text-align: center;
    }

    .project-card .project-logo {
        width: 60px;
    }
}
```

---

## Implementation Phases

### Phase 1: Layout Foundation
- [ ] Add logo-left CSS component
- [ ] Refactor MetaMedium card to new layout
- [ ] Refactor EarthStar card to new layout
- [ ] Add seed phrase with copy functionality

### Phase 2: Nanome 3D Widget
- [ ] Choose 3D approach (three.js vs model-viewer)
- [ ] Create/obtain spotlight-follow 3D model
- [ ] Implement inline viewer
- [ ] Add fallback for unsupported browsers

### Phase 3: Other Enhancements
- [ ] Apply logo-left to other projects as content allows
- [ ] Convert Sketchfab award embeds to native
- [ ] Add any additional interactive elements

---

## Content Gathering Checklist

**User to provide:**
- [ ] EarthStar seed phrase text
- [ ] MetaMedium minigraphic concept/specs
- [ ] Nanome spotlight/follow 3D model or specs
- [ ] Any additional project logos needed
- [ ] Updated descriptions if desired

---

## Hero Canvas Strategy: Index ↔ Design Connection

### Concept

Create a cohesive experience between the two hero canvases:
- **Index**: Playful, beautiful - hints at intelligence without explaining
- **Design**: Technical, revealing - shows the system working

This demonstrates the "smart drawing" concept without committing to full fish game dev time.

### Shared Foundation (Both Pages)

- [ ] Persist drawing strokes (don't fade immediately)
- [ ] Add "Clear" button (subtle, corner placement)
- [ ] Shared stroke data structure for consistency

### Index Hero: "Art That Hints at Complexity"

**Current:** Blueprint-style drawing with shape recognition, strokes fade

**Desired:** More invisible intelligence, beautiful emergent behavior

**Ideas:**
- [ ] Color shifts/gradients around stroke intersections
- [ ] Subtle glow where lines cross or connect
- [ ] Proximity-based color blending between strokes
- [ ] Gentle animations that follow stroke paths
- [ ] "Living" quality without explicit UI showing what's detected

**Visual Language:**
```
Normal stroke:     ───────────
                   (solid color)

Near intersection: ───═══════───
                   (gradient bloom)

Recognized shape:  Subtle fill or
                   ambient glow
                   (no labels)
```

**Technical approach:**
- Track intersection points in real-time
- Apply radial gradients at intersections
- Use stroke proximity for color influence
- Keep shape recognition but hide the labels

### Design Hero: "Showing the System"

**Current:** Blueprint drawing with shape recognition, labels, particles

**Desired:** Full transparency of what's being tracked

**Ideas:**
- [ ] Show all detected features (intersections, angles, curves)
- [ ] Display stroke metadata (velocity, pressure if available)
- [ ] Visualize shape recognition confidence scores
- [ ] Show the "thought process" - what the system sees
- [ ] Debug-style overlays (optional toggle?)

**Visual Language:**
```
┌─────────────────────────────────┐
│  Stroke #3                      │
│  Points: 47                     │
│  Length: 234px                  │
│  ┌──────────┐                   │
│  │ ○ Circle │ 87% confidence    │
│  │ △ Triangle │ 12%             │
│  └──────────┘                   │
│  Intersections: 2               │
│  Connected to: Stroke #1, #2    │
└─────────────────────────────────┘
```

### Implementation Phases

**Phase 0: Quick Wins (do first)**
- [ ] Add "Clear" button to both canvases
- [ ] Make strokes persist longer on index (remove/extend fade)
- [ ] Verify design page still shows shape recognition labels

**Phase 1: Index - Subtle Intelligence**
- [ ] Track intersection points between strokes
- [ ] Add gradient/glow effect at intersections
- [ ] Color influence based on stroke proximity
- [ ] Remove or hide shape labels (keep recognition running)

**Phase 2: Design - Full Visibility**
- [ ] Add stroke metadata display panel
- [ ] Show shape recognition with confidence %
- [ ] Visualize intersection points explicitly
- [ ] Optional: toggle between "art mode" and "debug mode"

**Phase 3: Polish**
- [ ] Smooth transitions and animations
- [ ] Mobile touch optimization
- [ ] Performance profiling

### Bret Victor "No Dead Fish" Philosophy

This approach aligns with the principle: drawings should feel alive and responsive. Even without the full fish game:

- Index: Strokes influence each other, colors blend, intersections glow
- Design: The "aliveness" is explained - you see why it feels smart

Future fish game remains the ultimate expression of this, but this intermediate step:
1. Ships faster
2. Demonstrates the concept
3. Creates page-to-page narrative
4. Builds foundation for fish game later

---

## Notes

_Add notes, ideas, and decisions here as the plan evolves._

