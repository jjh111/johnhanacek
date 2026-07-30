# Search Overlay — Embed on Every Page
*Status: ACTIVE | Priority: 1*

## Context
`search.html` works as a standalone page with full three-tier AI search (BM25 instant → WebGPU Qwen 0.8B → LMStudio/Ollama). But navigating away from the current page to search and back is friction. This feature transforms search from a standalone page into a **Spotlight/⌘K-style command palette overlay** available on every page, plus a dedicated search input in the fish hero area on index.html.

## Architecture: Command Palette Overlay

### Why This Pattern
- Stays centered and readable regardless of page content width
- Consistent experience on every page (same position, same behavior)
- Doesn't compete with nav layout (nav is already dense with shape icons)
- Natural keyboard shortcut (`/` or `⌘K`) that power users expect
- Works on mobile as full-screen overlay
- Can hold the full search UI: input + engine bar + AI answer + results

### Trigger Points

**1. Nav magnifying glass icon** (all 7 nav pages)
- Already exists on every page as `<a href="search.html" class="shape-link secondary">`
- Change to progressive-enhancement trigger: `<a href="search.html" data-search-trigger>`
- JS intercepts click → `e.preventDefault(); openSearch()`
- No JS → falls back to search.html link

**2. Keyboard shortcut** (all pages)
- `/` when not focused in an input → opens overlay
- `⌘K` (Mac) / `Ctrl+K` (Windows) → opens overlay
- `Escape` → closes overlay

**3. Hero search input** (index.html only)
- A compact search input inside the hero-oval, below the tagline
- On focus → immediately opens overlay with typed text
- Hidden in collapsed hero-oval state (alongside tagline/byline)

---

## New Files to Create

### `scripts/search-overlay.js` (~600 lines, ES module)

All search logic extracted from search.html's inline `<script>`. Structured as:

```js
// scripts/search-overlay.js
// Self-initializing ES module — creates overlay DOM, manages state

// 1. Inject overlay HTML into page
// 2. Load MiniSearch dynamically (CDN, lazy on first open)
// 3. Fetch Assets/search-chunks.json (lazy on first open)
// 4. Engine discovery (local model probe, WebGPU check, custom endpoint)
// 5. Open/close state management + keyboard shortcuts
// 6. BM25 search + rendering
// 7. AI generation (browser/local/custom engines)
// 8. Export openSearch(query?) and closeSearch() on window
```

**Lazy loading strategy** — zero overhead until first trigger:
- MiniSearch CDN loaded dynamically when overlay first opens
- search-chunks.json fetched on first open
- Transformers.js imported only when user clicks "Load Qwen"
- Local model probing happens on first open
- Alternative eager path via `requestIdleCallback`

**What stays in search.html**: search.html keeps its own inline code (unchanged). It serves as:
- Deep-link landing page (`search.html?q=nanome`)
- Fallback for no-JS browsers
- SEO (JSON-LD SearchAction schema)

### `scripts/search-overlay.css` (~250 lines)

All search-specific styles extracted from search.html's inline `<style>`:
- Overlay backdrop (full-screen dim + blur)
- Overlay panel (centered, max-width 660px, max-height 75vh, scrollable)
- Engine bar, popover, input, AI answer, results
- Open/close animations (fade + translateY)
- Mobile: overlay becomes full-screen at ≤600px
- CSS custom properties for engine colors

---

## Overlay HTML Structure

Injected by JS into each page's `<body>`:

```html
<div id="searchOverlay" class="search-overlay" aria-hidden="true" role="dialog" aria-label="Search">
    <div class="search-overlay-backdrop"></div>
    <div class="search-overlay-panel">
        <div class="engine-bar">
            <span id="aiDot" class="status-dot off"></span>
            <span id="engineModelLabel" class="engine-model-label"></span>
            <span id="engineSourceBadge" class="engine-source-badge none"></span>
            <button class="engine-info-btn" id="engineInfoBtn">...</button>
            <div class="engine-popover" id="enginePopover">...</div>
        </div>
        <div class="search-input-wrap">
            <input id="searchInput" type="text"
                   placeholder="Search portfolio or ask a question..."
                   autocomplete="off" />
            <button class="clear-btn" id="clearBtn">×</button>
        </div>
        <div class="ai-answer-wrap">
            <div id="aiAnswer"></div>
            <div id="aiActions" class="ai-actions">...</div>
        </div>
        <div id="sourcesSection">
            <div class="section-label">Sources ...</div>
            <div id="searchResults"></div>
        </div>
    </div>
</div>
```

---

## Key CSS

```css
.search-overlay {
    position: fixed;
    inset: 0;
    z-index: 2000;            /* above nav (1000) */
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: min(15vh, 120px);
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.2s ease;
}
.search-overlay.open {
    opacity: 1;
    pointer-events: auto;
}
.search-overlay-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(2, 10, 18, 0.85);
    backdrop-filter: blur(12px);
}
.search-overlay-panel {
    position: relative;
    width: 100%;
    max-width: 660px;
    max-height: 75vh;
    overflow-y: auto;
    padding: 1.2rem 1.5rem 1.5rem;
    background: rgba(10, 22, 40, 0.95);
    border: 1px solid rgba(77, 201, 246, 0.15);
    border-radius: 12px;
    box-shadow: 0 24px 80px rgba(0, 0, 0, 0.6);
    transform: translateY(-8px);
    transition: transform 0.2s ease;
}
.search-overlay.open .search-overlay-panel {
    transform: translateY(0);
}

@media (max-width: 600px) {
    .search-overlay { padding-top: 0; align-items: stretch; }
    .search-overlay-panel {
        max-width: 100%; max-height: 100%;
        border-radius: 0; border: none;
    }
}
```

---

## Hero Integration (index.html)

### Input inside hero-oval

Add between `.hero-content` and `.oval-scroll-btn`:

```html
<div class="hero-search-trigger" role="search">
    <input type="text"
           class="hero-search-input"
           placeholder="Ask about my work..."
           aria-label="Search portfolio"
           data-search-trigger>
</div>
```

```css
.hero-search-trigger {
    margin: 0.8rem 0 0.2rem;
    width: 100%;
}
.hero-search-input {
    width: 100%;
    padding: 0.55rem 1rem;
    font-family: 'Raleway', sans-serif;
    font-size: 0.88rem;
    font-weight: 300;
    background: rgba(0, 20, 40, 0.35);
    color: var(--text-bright);
    border: 1px solid rgba(77, 201, 246, 0.12);
    border-radius: 20px;
    outline: none;
    transition: border-color 0.2s, background 0.2s;
    text-align: center;
}
.hero-search-input::placeholder {
    color: rgba(125, 216, 247, 0.4);
    font-style: italic;
}
.hero-search-input:focus {
    border-color: rgba(77, 201, 246, 0.3);
    background: rgba(0, 20, 40, 0.5);
}
```

**Behavior:**
- On focus → immediately open overlay, transfer text to overlay input
- Hero input is just a trigger (doorway) — real search UI is always the overlay
- On overlay close → hero input clears and blurs
- Hidden in collapsed hero-oval state (display:none with tagline/byline)

---

## Interaction Model

### Opening
1. Nav magnifying glass click → `openSearch()`
2. `/` or `⌘K` keyboard → `openSearch()`
3. Hero input focus → `openSearch(heroInput.value)`
4. URL `?q=term` on page load → auto-open overlay

### While Open
- Typing searches instantly (200ms BM25 debounce, 500-800ms AI debounce)
- Results scroll within panel (max-height: 75vh, overflow-y: auto)
- Engine bar + popover work exactly as on search.html
- `Escape` or backdrop click → close
- `body { overflow: hidden }` while open (prevents background scroll)

### Closing
- `closeSearch()` → fade out, restore focus, re-enable body scroll
- URL `?q=` param removed on close

---

## Files to Modify

| File | Change |
|------|--------|
| `scripts/search-overlay.js` | CREATE — extracted search logic |
| `scripts/search-overlay.css` | CREATE — extracted search styles |
| `index.html` | Add CSS/JS links, hero search input, change nav search link |
| `design.html` | Add CSS/JS links, change nav search link |
| `art.html` | Add CSS/JS links, change nav search link |
| `about.html` | Add CSS/JS links, change nav search link |
| `services.html` | Add CSS/JS links, change nav search link |
| `nanome2.html` | Add CSS/JS links, change nav search link |
| `playground.html` | Add CSS/JS links, change nav search link |
| `search.html` | KEEP as-is — standalone fallback |

---

## Source Code Reference

**Current search implementation:** `search.html` lines 546-1082 (inline `<script type="module">`)
**Current search styles:** `search.html` lines 50-405 (inline `<style>`)
**Nav structure:** `styles/shared.css` lines 460-580 (nav + shape-link system)
**Hero-oval:** `styles/shared.css` lines 157-330 (oval positioning + collapsed state)
**Hero markup:** `index.html` lines 254-314 (hero section with canvas, shape-nav, oval)

---

## Implementation Phases

**Phase 1: Extract + Overlay Shell**
- Extract CSS → `scripts/search-overlay.css`
- Extract JS → `scripts/search-overlay.js` (ES module)
- Wire: `openSearch()` / `closeSearch()` / keyboard shortcuts
- Add CSS + JS links to all 7 nav pages
- Change nav search link to progressive-enhancement trigger
- Test: overlay opens/closes, BM25 search works, AI generation works

**Phase 2: Hero Integration**
- Add search input to hero-oval on index.html
- Wire focus → open overlay with text transfer
- Test: hero input opens overlay, typing works, close restores

**Phase 3: Polish**
- Open/close animations (fade + translateY)
- Scroll lock while overlay open
- Focus trapping (Tab stays inside overlay panel)
- Remember last search (reopen shows previous results)
- URL param sync (`?q=` updates while overlay open)

---

## Verification
1. Any page → click magnifying glass → overlay opens centered, input focused
2. Any page → press `/` → overlay opens (unless already in an input)
3. Any page → `⌘K` → overlay opens
4. Type query → BM25 results appear instantly in overlay
5. AI engine detected → AI answer streams in overlay
6. Engine popover works inside overlay
7. `Escape` → overlay closes, focus returns
8. Backdrop click → overlay closes
9. index.html → hero-oval shows "Ask about my work..." input
10. Click/type in hero input → overlay opens with text pre-populated
11. Mobile → overlay is full-screen, scrollable
12. No JS → magnifying glass navigates to search.html
13. `search.html?q=nanome` → still works standalone
14. Zero performance impact on page load (lazy init)
15. Hero-oval collapsed → search input hidden
