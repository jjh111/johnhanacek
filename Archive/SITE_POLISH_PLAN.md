# Site Polish Plan — v1.2 Push
*Last updated: Feb 2026*

Full plan for site-wide polish pass before pushing. Covers the hero oval UI redesign, glass-material content scroll, all-pages nav/content fixes, and the relationship between these and the fish game.

---

## 1. INDEX HERO — Unified Oval HUD

### Concept
Replace the current separate `shape-nav` pill + `hero-content` text stack with a single unified **oval glass capsule** centered in the upper quarter of the hero canvas. Everything identity-related lives inside: name, signature, shapes, and the two control buttons. Below that, the canvas is wide open for fish.

### Layout of the Oval

```
┌────────────────────────────────────────────────────────────────────┐
│  [↓ content]   [△][□][○] [◇][★]   sig+name   [info ⓘ]            │
└────────────────────────────────────────────────────────────────────┘
```

Left to right inside the oval:
1. **"↓ content" button** — replaces scroll indicator, smooth-scrolls to `#about`. Icon: double-chevron or ↓. Style: ghost/text button, same mono font.
2. **Shape nav** (existing 5 shapes: △□○◇★) — same functionality, compact size
3. **Signature + name** — `footer-JHsig.png` inline before or after "John Hanacek" in Raleway 200. Smaller than current hero H1, meant to be a compact identity mark, not a big headline. Roughly: sig image 1.4rem tall, name ~1.1rem Raleway 200.
4. **"ⓘ info" button** — right side, reveals/hides the hero content text panel (name/tagline/byline as currently). This replaces the debug toggle positioning-wise; debug moves elsewhere or is a secondary thing.

> **Note on Debug toggle**: Move it to be a very small secondary element inside the ⓘ panel, or keep it at bottom-left fixed as it currently is. It should NOT be part of the oval identity UI.

### Oval Glass Style
Matches the existing nav glass style but slightly more opaque for contrast against the dark ocean:
```css
background: rgba(2, 10, 18, 0.55);
backdrop-filter: blur(20px) saturate(1.2);
border: 1px solid rgba(77, 201, 246, 0.18);
border-radius: 2.5rem;        /* pill shape */
box-shadow: 0 4px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(77,201,246,0.08);
```

### Info Panel (shown/hidden)
When ⓘ is toggled ON, a second glass pill appears **below** the oval (or expands downward from it), showing:
- Tagline: "DESIGN ENGINEER · PRODUCT DESIGNER · ARTIST"
- Byline: "Sounds like · (Hana-check)"
- Draw hint: "✎ draw something"

This panel auto-hides after 8s on first load (shows once to orient the user), and can be recalled via ⓘ. State: `localStorage.getItem('infoSeen')`.

### Position
- Oval: `position: absolute; top: 1.5rem; left: 50%; transform: translateX(-50%);` — same as current shape-nav
- The hero canvas fills 100vh below it, fish swim freely
- Remove the large hero H1/tagline/byline from the always-visible center — those move into the info panel

### Existing elements to remove/relocate
| Element | Current location | New location |
|---------|-----------------|--------------|
| `.hero h1` (John Hanacek) | Center of hero, always visible | Inside oval (compact) |
| `.hero .tagline` | Below h1 | Info panel |
| `.hero .byline` | Below tagline | Info panel |
| `.hero-sig-inline` (7rem tall) | Below byline | Inside oval (1.4rem) |
| `.shape-nav` pill | `top: 1.5rem` centered | Absorbed into oval |
| `.scroll-indicator` | `bottom: 11rem` | Becomes "↓ content" button in oval left |
| `.hero-hint` ("✎ draw") | `bottom: 15rem` | Moves into info panel |
| `.canvas-controls` (debug toggle) | `bottom: 1rem left: 1rem` fixed | Stays as-is (fine where it is) |

### Mobile behavior
At <600px the oval scales down: shapes shrink further, name abbreviated or hidden, sig only. Info panel stacks below on narrow.

---

## 2. CONTENT SCROLL — Glass Material Behind Sections

### Concept
Currently when scrolling past the hero, the content sections sit on `var(--sea-deep)` solid background — completely opaque, hiding the canvas. The proposal: hero canvas remains **fixed in place as a persistent background**, and the content sections scroll over it with a **glass/frosted material**.

### Implementation approach

**Step 1 — Fix the canvas**
```css
#heroCanvas {
    position: fixed;   /* was: absolute */
    top: 0; left: 0;
    width: 100%; height: 100%;
    z-index: 0;
}
.hero {
    position: relative;
    min-height: 100vh;
    background: transparent; /* remove solid bg */
}
```
The fish continue animating even as the user scrolls. Canvas stays at z-index 0 behind everything.

**Step 2 — Glass content sections**
`<main>` and each `<section>` get glass treatment:
```css
main {
    position: relative;
    z-index: 10;
    background: transparent;
}
section {
    background: rgba(2, 10, 18, 0.72);
    backdrop-filter: blur(24px) saturate(1.1);
    border-top: 1px solid rgba(77, 201, 246, 0.10);
    /* existing padding preserved */
}
```
The glass is dark enough to maintain text contrast (WCAG AA still passes) but translucent enough to see fish silhouettes through it as ambient motion.

**Step 3 — Fade-in transition zone**
At the top of `<main>`, a gradient fade from transparent to the glass:
```css
main::before {
    content: '';
    position: sticky;
    top: 0;
    height: 60px;
    background: linear-gradient(to bottom, transparent, rgba(2,10,18,0.72));
    display: block;
    pointer-events: none;
}
```

**Step 4 — Content cards stay as-is**
Content cards (`.content-card`) already have their own layered glass treatment (`rgba(0, 20, 40, 0.08)` + border). They'll sit on top of the section glass — this stacking works fine.

### Performance note
Fish canvas continues running while scrolled. Since canvas already has a smart-pause system (`hasActiveAnimation()`), and fish keep moving, this is a feature not a bug — fish are visible through the glass content. If performance is a concern, could reduce fish count when scrolled > 1 viewport, but likely unnecessary.

### `body` background
With canvas fixed, `body` background needs to remain dark for non-canvas areas:
```css
body { background: var(--sea-deep); } /* already set */
```

---

## 3. ALL-PAGES NAV — Polish & Consistency

### Current issues
1. `nav-right` anchor links (`#about`, `#believe` etc.) are index.html-only and break from other pages
2. No active page state on some shape links across pages
3. Mobile: nav-right wraps awkwardly at some widths
4. design.html and art.html have hero sections with no canvas or minimal canvas — those don't need the same fixed-canvas treatment

### Fixes

**3a. Page-aware nav links**
For pages other than index.html, nav-right should either:
- Be omitted (cleaner) and replaced with page-specific section anchors, OR
- Link back to index.html sections: `href="index.html#about"` etc.

Recommended: each page has its own `nav-right` with its own section anchors, only index.html has the full section list. design.html has: Work · Past Work · Awards · Endorsements · Services. art.html has: Visual Art · Installations · Writing. about.html has: Bio · Experience · Education · Expertise. services.html has: Services · Testimonials · Contact.

**3b. Active shape state**
All pages already set `.shape-link.active` correctly. Confirm:
- index.html: triangle active ✓
- design.html: rounded-square active (check)
- art.html: circle active (check)
- about.html: diamond active (check)
- services.html: star active (check)

**3c. Nav consistency**
All 5 pages should have identical nav-left shape structure. Currently design.html may differ. Audit and align.

---

## 4. PAGE-BY-PAGE CONTENT FIXES

### index.html
- **About section**: Expand by 1–2 sentences. Current ends abruptly. Add something about being open to collaboration / interesting projects.
- **Highlights**: Third card (Aerospace Medical Assoc) has no link. Add `href="https://www.asma.org"` or the award announcement.
- **Endorsements**: Consider adding a 3rd entry to avoid the 2-column feeling lopsided.
- **Explore section**: All 4 pages now exist — no stubs needed. Just confirm links work.
- **Contact**: Add GitHub link (`https://github.com/johnhanacek` or similar).
- **Footer**: Bump to v1.2, update date.

### design.html
- **TODO comment** (line 462): Remove or resolve.
- **Hero**: Currently has no canvas — it shows a blank dark area. Consider: either add the shared cosmos/stars canvas OR just use the dark bg (current) but ensure the hero header layout looks intentional.
- **Case study videos**: Confirm embeds still load (YouTube/Vimeo iframes).
- **Services CTA**: Has a "get in touch" CTA — confirm email/link is current.

### art.html
- **TODO comment** (line 253): Hero tagline/byline is commented out. Either finalize and uncomment, or remove the comment entirely.
- **Cosmos canvas**: Already has interactive particle canvas — nice. Ensure it doesn't conflict with the fixed-canvas approach on index.html (it won't — each page is standalone).
- **Photography section**: Appears to have Earth Star logo but may need an actual photo grid. Review visually.
- **Slideshow**: Jhana meditation photographs slideshow — confirm images load (jhana-1 through jhana-5.jpg exist in Assets ✓).

### about.html
- **No hero canvas** — page header layout. Fine as-is.
- **Work Experience**: 8 positions listed — verify dates/companies are current and accurate.
- **Research section**: Appears to be a stub. Either flesh out or remove/retitle.
- **Contact CTA**: Ensure email is current (`hi@johnhanacek.com`).

### services.html
- **Google Calendar embed**: Verify it still loads. These iframes break when calendar settings change.
- **Endorsements**: 6 entries — good, most complete of any page.
- **Get in Touch email**: Confirm matches index.html contact email.

---

## 5. VISUAL POLISH (shared.css)

### 5a. Glass material token
Add a reusable glass token to `:root` in shared.css so glass style is consistent everywhere:
```css
--glass-bg: rgba(2, 10, 18, 0.60);
--glass-border: rgba(77, 201, 246, 0.15);
--glass-blur: blur(20px) saturate(1.1);
--glass-shadow: 0 4px 24px rgba(0,0,0,0.35);
```
Use these everywhere: oval, nav, content sections, cards.

### 5b. Content card glass upgrade
`.content-card` currently has `rgba(0, 20, 40, 0.08)` which is nearly invisible. With the glass content sections behind them, cards can be slightly more defined:
```css
.content-card {
    background: rgba(0, 20, 40, 0.45);  /* was 0.08 */
    backdrop-filter: blur(8px);
    border: 1px solid rgba(77, 201, 246, 0.12);  /* was 0.1 */
}
```

### 5c. Section headings
`h2` in sections currently plain cyan. Add a subtle bottom border or gradient underline:
```css
section h2::after {
    content: '';
    display: block;
    width: 2rem;
    height: 1px;
    background: linear-gradient(to right, var(--cyan), transparent);
    margin-top: 0.5rem;
}
```

### 5d. Scroll indicator → oval button
Current scroll indicator at `bottom: 11rem` is separate. It moves into the oval. The separate `.scroll-indicator` can be removed from the hero markup on index.html.

### 5e. Hero draw hint
`.hero-hint` currently says "✎ draw" — moves into info panel. Rephrase: "draw a shape to spawn something" or keep short: "✎ draw something".

### 5f. Typography: hero name compact
Inside oval, name should be compact Raleway 200. Sig image same height as the text cap-height:
```css
.oval-name { font-family: 'Raleway'; font-size: 1.05rem; font-weight: 200; letter-spacing: 0.12em; }
.oval-sig  { height: 1.1em; width: auto; vertical-align: middle; margin-right: 0.4em; opacity: 0.85; }
```

---

## 6. HTML STRUCTURE — New Hero Oval Markup

Replace current hero content + shape-nav with:

```html
<header class="hero" id="top">
    <!-- Fish canvas — persistent, full bleed -->
    <canvas id="heroCanvas"></canvas>

    <!-- Unified identity oval -->
    <div class="hero-oval" role="banner">
        <!-- Left action -->
        <a href="#about" class="oval-btn oval-btn-content" aria-label="Go to content">
            <svg><!-- double chevron down --></svg>
            <span>content</span>
        </a>

        <!-- Shape nav (primary + secondary) -->
        <nav class="shape-nav" aria-label="Page navigation">
            <a href="index.html" class="shape-link active">△ <span class="shape-label">JH</span></a>
            <a href="design.html" class="shape-link">□ <span class="shape-label">DESIGN</span></a>
            <a href="art.html"   class="shape-link">○ <span class="shape-label">ART</span></a>
            <a href="about.html"    class="shape-link secondary">◇ <span class="shape-label">ABOUT</span></a>
            <a href="services.html" class="shape-link secondary">★ <span class="shape-label">SERVICES</span></a>
        </nav>

        <!-- Identity: sig + name -->
        <div class="oval-identity" aria-label="John Hanacek">
            <img class="oval-sig" src="./Assets/footer-JHsig.png" alt="">
            <span class="oval-name">John Hanacek</span>
        </div>

        <!-- Right action: info toggle -->
        <button class="oval-btn oval-btn-info" aria-label="Show site info" aria-expanded="false" id="infoToggle">
            <span class="oval-info-icon">ⓘ</span>
        </button>
    </div>

    <!-- Info panel (hidden by default, shown on first visit + toggle) -->
    <div class="hero-info-panel" id="heroInfoPanel" hidden>
        <p class="tagline">DESIGN ENGINEER · PRODUCT DESIGNER · ARTIST</p>
        <p class="byline">Sounds like · <span class="role">(Hana-check)</span></p>
        <p class="draw-hint">✎ draw something</p>
    </div>

    <!-- Debug Controls (stays bottom-left, not in oval) -->
    <div class="canvas-controls"> ... </div>
</header>
```

### CSS for oval:
```css
.hero-oval {
    position: absolute;
    top: 1.5rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: 5;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.45rem 1rem;
    border-radius: 2.5rem;
    background: var(--glass-bg);
    backdrop-filter: var(--glass-blur);
    border: 1px solid var(--glass-border);
    box-shadow: var(--glass-shadow);
    white-space: nowrap;
}

.hero-info-panel {
    position: absolute;
    top: calc(1.5rem + 3rem + 0.5rem); /* below oval */
    left: 50%;
    transform: translateX(-50%);
    z-index: 5;
    padding: 0.6rem 1.4rem;
    border-radius: 1.5rem;
    background: var(--glass-bg);
    backdrop-filter: var(--glass-blur);
    border: 1px solid var(--glass-border);
    text-align: center;
    animation: fadeInDown 0.25s ease;
}
```

---

## 7. RELATIONSHIP TO FISH GAME

This plan is **additive and non-destructive** to the fish game:

| Fish game component | Impact from this plan |
|--------------------|-----------------------|
| `heroCanvas` element | No change — same element, just `position: fixed` |
| Canvas JS / animation loop | No change — untouched |
| Debug toggle | Moves to bottom-left fixed (already there) |
| Drawing interaction | No change — canvas still full-viewport |
| Fish entities, coral, food | No change |

The fixed-canvas approach means fish continue swimming **behind the glass content** as users scroll. This is an enhancement, not a conflict.

When the onboarding flow (Track C in AQUARIUM_GAME_MASTER_PLAN.md) is built, it will attach to the canvas and can use the info panel slot for onboarding instructions, keeping the oval as the persistent chrome.

---

## 8. IMPLEMENTATION ORDER

**Phase 1 — Structural (index.html hero)**
1. Add glass token variables to shared.css
2. Rewrite `.hero-oval` CSS
3. Update index.html hero markup (oval structure, info panel)
4. Move JS: info toggle logic, auto-show on first visit, localStorage check
5. Make `#heroCanvas` `position: fixed`

**Phase 2 — Content glass scroll**
6. Make `<main>` + sections glass
7. Add fade-in gradient at top of main
8. Test text contrast at various scroll positions

**Phase 3 — All-pages nav/content**
9. Audit and align nav-left across all 5 pages
10. Set correct `.active` shape on each page
11. Update nav-right per-page section anchors
12. Fix content issues per page (TODOs, links, About expansion)

**Phase 4 — Visual polish**
13. Content card glass upgrade
14. Section h2 underline
15. Typography tightening
16. Footer version bump (v1.2)

**Phase 5 — QA**
17. Test all pages: nav links, embeds, canvas interactions
18. Test mobile at 375px, 768px, 1024px, 1440px
19. Verify WCAG contrast on glass sections
20. Push

---

## 9. OPEN QUESTIONS FOR YOU

1. **Info panel auto-show**: Show once on first visit (localStorage) then hide? Or always visible until dismissed?
2. **Name in oval**: "John Hanacek" in Raleway 200 compact, OR just the signature image without text?
3. **Signature image placement**: Directly left of "John Hanacek" text, or a standalone block between shapes and name?
4. **Content scroll glass opacity**: How dark should sections be? `0.72` is legible but you can still see fish silhouettes. `0.85` is safer for contrast but less transparent. Recommend testing at 0.72.
5. **design.html and art.html**: Do they also get the fixed-canvas + glass scroll treatment? art.html has a cosmos canvas already. design.html has no canvas. Recommend: art.html keeps its cosmos canvas fixed same way; design.html stays solid bg (no canvas to show through).
6. **`↓ content` button label**: "content", "explore", "↓", or just the chevron icon?
