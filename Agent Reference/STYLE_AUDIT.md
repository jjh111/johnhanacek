# Design.html Style Audit

---

## USED vs UNUSED: What's Worth Saving?

### Currently Active Patterns

| Class | Purpose | Quality |
|-------|---------|---------|
| `.content-card` | Base card with glass effect | Good |
| `.content-card.about` | Large italic intro text | Good |
| `.content-card.endorsement` | Quote cards with cite | Good |
| `.card-featured` | Prominent cyan-bordered cards | Good |
| `.card-featured-split` | Two-column project layout | Good |
| `.card-logo-left` | Logo + content side-by-side | Good |
| `.card-standard` | Medium prominence cards | Good |
| `.grid-2`, `.grid-3` | Responsive grids | Good |
| `.video-embed` | YouTube 16:9 responsive | Essential |
| `.video-card` | Video + info below | Good |
| `.image-card` | Image + caption | Basic |
| `.umbrella-header` | Section header with badge | Good |
| `.seed-phrase` | Copyable code block | Good |
| `.year-badge` | Inline year tag | Good |

### Unused But Valuable - CONSIDER PORTING

| Class | What It Does | Why It's Valuable | Recommendation |
|-------|--------------|-------------------|----------------|
| **`.callout`** | Glassmorphic box with hover glow | Nice hover animation with `transform: translateY(-2px)` and cyan glow. Current cards lack this interactivity. | **PORT** hover effect to `.content-card:hover` |
| **`.clickable::after`** | Left accent stripe (4px gradient) | Visual indicator for clickable items. Clean design pattern. | **PORT** as optional `.card-accent` class |
| **`.gallery-item .image:hover`** | Lift + shadow on hover | `transform: translateY(-2px)` with shadow. Better than `.image-card` which has no hover. | **PORT** to `.image-card img:hover` |
| **`.genealogy-item`** | Year-left timeline layout | Clean chronological presentation. Could use for detailed work history. | **KEEP** for future use |
| **`.demo-header`** | Gradient header bar | `background: linear-gradient(135deg, cyan, green)` header pattern. Eye-catching. | **KEEP** as `.section-header-gradient` |

### Unused and Redundant - SAFE TO REMOVE

| Class | Why Remove |
|-------|------------|
| `.figure-pair` | Replaced by `.grid-2` |
| `.card-grid` | Replaced by `.grid-2`, `.grid-3` |
| `.card-link` | Just `text-decoration: none` - use inline |
| `.principles-used` | Never used, overly specific |
| `.video-link` | Never used |
| `.tags`, `.tag` | Defined but never used |
| `.span-2` | Never used |
| `.card-compact` | Never used (have `.compact` modifier instead) |
| `.section-wide`, `.section-standard` | Never applied to any element |

### Unused and Obsolete - REMOVE

| Class | Why |
|-------|-----|
| `.placeholder-figure` | Was for "coming soon" placeholders - not needed |
| `.media-placeholder` (all) | Old placeholder system, never used |
| `.timeline-video`, `.timeline-image` | Replaced by `.video-card` |
| `.demo-*` (entire system) | Demo canvas feature removed |
| `.image-modal` (entire lightbox) | 160 lines, never implemented. Can re-add if needed. |
| `.sketch-figure` | Light mode figure style, doesn't match dark theme |
| `figure`, `figcaption` base styles | Only Sketchfab uses figures - they have own styling |

### Hero Styles - AUDIT

| Class | Status |
|-------|--------|
| `.hero .tagline` | **REMOVE** - commented out in HTML |
| `.hero .subtitle` | **REMOVE** - commented out in HTML |
| `.hero .byline` | **REMOVE** - commented out in HTML |
| `.hero-signature` | **REMOVE** - not in HTML |
| `.hero h1 .meta` (duplicate) | **MERGE** - defined twice |

---

## RECOMMENDED PORTS

### 1. Add hover effect to content-card (from .callout)
```css
.content-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 32px rgba(0, 217, 255, 0.15);
}
```

### 2. Add hover effect to image-card (from .gallery-item)
```css
.image-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
}
```

### 3. Create accent stripe utility (from .clickable)
```css
.card-accent::before {
    content: '';
    position: absolute;
    top: 0; left: 0;
    width: 4px; height: 100%;
    background: linear-gradient(180deg, var(--bio-cyan), var(--bio-green));
    border-radius: 4px 0 0 4px;
}
```

---

## Summary
The stylesheet has grown organically with ~1900 lines of CSS. Many styles are unused legacy code from previous iterations. This audit identifies what to keep, remove, and consolidate.

---

## CSS VARIABLES (Lines 34-79) - KEEP
Current design tokens are well-organized:
- **Colors**: Earth Star palette (void-deep, bio-cyan, bio-purple, bio-green, bio-pink)
- **Legacy aliases**: ink, paper, accent, etc. → Some can be removed
- **Typography**: text-xs through text-3xl
- **Spacing**: space-xs through space-2xl

### Issues:
- `--bio-pink` defined but never used
- `--silk-glow` only used in 2 places
- Legacy variables (--ink, --paper-warm, --highlight) rarely used

---

## UNUSED CSS CLASSES - REMOVE

### Completely Unused (no HTML matches):
| Class | Lines | Notes |
|-------|-------|-------|
| `.hero .tagline` | 273-282 | Commented out in HTML |
| `.hero .subtitle` | 284-294 | Commented out in HTML |
| `.hero .byline`, `.hero .byline .role` | 296-306 | Commented out in HTML |
| `.hero-signature` | 335-346 | Not in HTML |
| `.callout`, `.callout.insight`, `.callout.key` | 989-1020 | Not used |
| `.genealogy-item` | 1022-1041 | Not used |
| `.media-placeholder` (all variants) | 1043-1082 | Not used |
| `.timeline-video`, `.timeline-image` | 1085-1108 | Not used |
| `.gallery`, `.gallery-item` | 1110-1172 | Not used |
| `.card-grid`, `.card-link` | 1174-1191 | Not used |
| `.principles-used` | 1193-1204 | Not used |
| `.video-link` | 1206-1214 | Not used |
| `.demo-wrapper` through `.demo-status` | 1261-1372 | Not used (demo canvas removed) |
| `.image-modal` (entire lightbox system) | 1374-1536 | Not used |
| `.figure-pair` | 850-866 | Not used |
| `.placeholder-figure` | 868-908 | Not used |
| `figure.sketch-figure` | 916-919 | Not used |
| `.demo-container`, `.demo-header` | 959-987 | Not used |
| `.clickable` variant | 717-735 | Not used |
| `.section-wide`, `.section-standard` | 1574-1576 | Defined but not applied |
| `.card-compact` | 1630-1635 | Defined but not used |
| `.tags`, `.tag` | 1777-1791 | Defined but not used |
| `.span-2` | 1606 | Defined but not used |

### Partially Used (keep but simplify):
| Class | Status |
|-------|--------|
| `figure`, `figcaption` | Only Sketchfab embeds use these - simplify |
| `.content-card::before` (data-num watermark) | Only used on 2 education cards |

---

## DUPLICATE/CONFLICTING STYLES

### 1. Figure styles (lines 838-941)
```css
/* Commented-out old figure styles mixed with new */
/*figure { margin: var(--space-lg) 0; } */
figure { margin: 3rem 0; ... }  /* Hard-coded value */
/* Another commented block at 933-941 */
```
**Fix**: Remove all figure styles - only Sketchfab iframes use them

### 2. Double `.hero h1 .meta` definitions (lines 235-243 and 258-260)
```css
.hero h1 .meta { background: linear-gradient... }  /* Line 235 */
.hero h1 .meta { vertical-align: top; }            /* Line 258 */
```
**Fix**: Consolidate into single rule

### 3. Conflicting content-card padding
```css
.content-card { padding: var(--space-md); }        /* Line 710 */
.card-featured { padding: var(--space-lg); }       /* Line 1622 */
```
**Note**: This is intentional hierarchy, but could be clearer

---

## ORGANIZATION ISSUES

### Current structure (messy):
1. Variables
2. Reset/body
3. Hero styles
4. Navigation
5. Main content
6. Content cards
7. Figures (unused)
8. Video embed
9. Demo container (unused)
10. Callouts (unused)
11. Genealogy (unused)
12. Media placeholders (unused)
13. Gallery (unused)
14. Card grid (unused)
15. Footer
16. Demo canvas styles (unused)
17. Image modal (unused)
18. Responsive breakpoints
19. Widescreen layout system (added later)
20. More component styles

### Proposed structure (clean):
```
1. VARIABLES & RESET
2. TYPOGRAPHY (h1-h4, p, a, lists)
3. LAYOUT (main, section, grids)
4. NAVIGATION (nav, shape-nav)
5. HERO (hero, canvas, hints)
6. CARDS (content-card variants, featured, split)
7. COMPONENTS (video-embed, video-card, image-card, endorsements)
8. UTILITIES (seed-phrase, copy-btn, badges)
9. FOOTER
10. RESPONSIVE BREAKPOINTS
```

---

## SPECIFIC FIXES NEEDED

### 1. Remove ~600 lines of unused CSS
All the classes marked "REMOVE" above

### 2. Consolidate card styles
Current mess:
- `.content-card` (base)
- `.content-card.clickable` (unused)
- `.content-card.endorsement`
- `.content-card.about`
- `.card-featured`
- `.card-standard`
- `.card-compact` (unused)
- `.card-logo-left`
- `.card-featured-split`

Keep only:
- `.content-card` (base)
- `.content-card.endorsement`
- `.content-card.about`
- `.card-featured`
- `.card-standard`
- `.card-logo-left`
- `.card-featured-split`
- `.card-featured-split.compact`

### 3. Fix year-badge inconsistency
Defined in two places:
- `.umbrella-header .year-badge` (line 1810)
- Also used directly in HTML on h4 elements

**Fix**: Create single `.year-badge` utility class

### 4. Clean up responsive breakpoints
Currently scattered:
- 480px, 600px, 768px, 900px, 1200px, 1600px

Consolidate to:
- `sm`: 480px (mobile)
- `md`: 768px (tablet)
- `lg`: 1024px (desktop)
- `xl`: 1400px (widescreen)

### 5. Remove inline styles from HTML
Found in HTML:
```html
style="border-radius: 8px;"  <!-- line 2044 -->
style="height: 2em; opacity: 0.7;"  <!-- line 2249 -->
```

---

---

## CONSOLIDATION PLAN: Unified Stylesheet

### Current State (Messy)
```
index.html   → 3165 lines (ALL styles inline - duplicated)
design.html  → 3830 lines (ALL styles inline - duplicated)
art.html     → 552 lines  (uses shared.css + page-specific inline)
shared.css   → 1447 lines (exists but index/design don't use it!)
```

### Target State (Clean)
```
shared.css   → ~800 lines (all shared styles, cleaned up)
index.html   → ~1200 lines (shared.css + index canvas JS)
design.html  → ~1400 lines (shared.css + design canvas JS)
art.html     → ~500 lines (shared.css + art canvas JS)
```

---

## What Goes Where

### SHARED.CSS (All pages use this)

| Category | Classes |
|----------|---------|
| **Variables** | `:root` tokens (colors, spacing, typography) |
| **Reset** | `*`, `html`, `body`, `@media (prefers-reduced-motion)` |
| **Accessibility** | `.skip-link`, `:focus-visible`, `.sr-only` |
| **Navigation** | `nav`, `.nav-inner`, `.nav-title`, `.nav-toggle`, `.nav-tab`, `.nav-page`, `.nav-separator` |
| **Shape Nav** | `.shape-nav`, `.shape-link`, `.shape-label`, `.shape-label-img` |
| **Hero Base** | `.hero`, `.hero::after`, `.hero-content`, `.hero h1`, `.hero h1 .meta`, `.hero h1 .jh-sig`, `.scroll-indicator`, `.hero-hint` |
| **Typography** | `h2`, `h2::before`, `h3`, `h4`, `p`, `a`, `strong`, `em`, `ul`, `ol`, `li` |
| **Main Layout** | `main`, `section` |
| **Cards** | `.content-card`, `.content-card.about`, `.content-card.endorsement`, `.card-featured`, `.card-standard`, `.card-logo-left`, `.card-featured-split`, `.card-featured-split.compact` |
| **Grids** | `.grid-2`, `.grid-3`, `.grid-4`, `.span-full` |
| **Components** | `.video-embed`, `.video-card`, `.image-card`, `.umbrella-header`, `.year-badge`, `.seed-phrase`, `.copy-btn` |
| **Footer** | `footer`, `.footer-title`, `.footer-subtitle`, `.footer-copyright`, `.version` |
| **Responsive** | All `@media` breakpoints |
| **Animations** | `@keyframes shimmer`, `@keyframes bounce`, `@keyframes strokeGlow`, `@keyframes pencil-wiggle` |
| **Keep for later** | `.genealogy-item` |

### INDEX.HTML (Page-specific only)

```css
/* Fish minigame canvas - specific to index */
#heroCanvas { /* index-specific cursor/interaction */ }
/* Any index-specific hero variations */
```

Plus: Fish minigame JavaScript (~800 lines)

### DESIGN.HTML (Page-specific only)

```css
/* Blueprint drawing canvas - specific to design */
#heroCanvas { cursor: crosshair; }
/* Drawing canvas colors/timing constants */
```

Plus: Blueprint drawing JavaScript (~1000 lines)

### ART.HTML (Page-specific only)

```css
/* Cosmic canvas - specific to art */
.forest-overlay { /* art-specific overlay */ }
@keyframes star-pulse { /* art-specific animation */ }
```

Plus: Cosmic canvas JavaScript (~300 lines)

---

## REMOVE ENTIRELY (from all files)

### Dead Code (~500 lines to remove from shared.css)
- `.hero .tagline`, `.hero .subtitle`, `.hero .byline` (commented out)
- `.hero-signature` (not used)
- `.callout` system (not used)
- `.genealogy-item` → KEEP for future
- `.media-placeholder` system (obsolete)
- `.timeline-video`, `.timeline-image` (replaced)
- `.demo-*` styles (demo removed)
- `.image-modal` lightbox (160 lines, not implemented)
- `.gallery`, `.gallery-item` (replaced by `.image-card`)
- `.figure`, `.figcaption`, `.figure-pair`, `.placeholder-figure`, `.sketch-figure` (only Sketchfab uses)
- `.card-grid`, `.card-link`, `.card-compact` (redundant)
- `.principles-used`, `.video-link` (never used)
- `.tags`, `.tag`, `.span-2` (never used)
- `.section-wide`, `.section-standard` (never applied)
- `.clickable` variant (not used)
- Duplicate `.hero h1 .meta` definition

### Unused Variables
- `--bio-pink` (defined but never used)
- Legacy aliases can stay for compatibility

---

## IMPLEMENTATION STEPS

### Phase 1: Clean shared.css
1. Remove all dead code listed above
2. Ensure all shared patterns from design.html are in shared.css
3. Organize into clear sections with comments
4. Result: ~800 lines of clean, documented CSS

### Phase 2: Update index.html
1. Add `<link rel="stylesheet" href="./styles/shared.css">`
2. Remove all CSS that's now in shared.css
3. Keep only: index-specific canvas styles, inline JS
4. Test thoroughly

### Phase 3: Update design.html
1. Add `<link rel="stylesheet" href="./styles/shared.css">`
2. Remove all CSS that's now in shared.css
3. Keep only: design-specific canvas styles, inline JS
4. Test thoroughly

### Phase 4: Verify art.html
1. Confirm it still works with updated shared.css
2. Remove any styles from art.html that are now in shared.css
3. Test

### Phase 5: Final QA
1. Test all 3 pages at different breakpoints
2. Verify no visual regressions
3. Check file sizes improved

---

## CLEANUP PLAN

### Phase 1: Remove Unused (Safe)
1. Delete all unused class definitions listed above
2. Remove commented-out code blocks
3. Remove duplicate/conflicting rules

**Estimated reduction**: ~600 lines

### Phase 2: Consolidate & Organize
1. Reorganize remaining CSS into logical sections
2. Add clear section comments
3. Consolidate card hierarchy
4. Create `.year-badge` utility

### Phase 3: Simplify Variables
1. Remove unused variables (--bio-pink, legacy aliases)
2. Document which variables are used where

### Phase 4: Responsive Cleanup
1. Consolidate breakpoints
2. Ensure consistent mobile behavior

---

## HTML CLEANUP NEEDED

### Remove:
- Commented-out tagline/byline in hero (lines 1953-1956)
- `data-num` attributes if watermark feature not wanted

### Fix:
- Inline styles → move to CSS classes
- Inconsistent use of `.card-standard` vs base `.content-card`

---

## RECOMMENDED APPROACH

**Option A: Conservative** (1-2 hours)
- Remove only clearly unused CSS
- Keep structure as-is
- Minimal risk

**Option B: Full Refactor** (4-6 hours)
- Remove unused CSS
- Reorganize into clean sections
- Consolidate duplicates
- Add documentation comments
- Test all pages thoroughly

I recommend **Option A first**, then **Option B** when you have time to test thoroughly.

---

## FILES AFFECTED
- `design.html` - main cleanup
- `index.html` - verify shared styles work
- `art.html` - verify shared styles work
