# Search Enrichment — Rich Result Cards + Cross-Page Links
*Status: Next | Priority: 2 | Depends on: SEARCH_OVERLAY*

## Context
Once the search overlay is live on every page, results need to be richer than plain text cards. This feature adds video preview cards, 3D model viewers, headshot images, and clickable title links that navigate to the correct page + section anchor.

## Deliverables

### A. Enriched search-chunks.json Fields
Add optional fields to existing chunks in `Assets/search-chunks.json`:

**Rich media fields:**
| Chunk ID | Field | Value |
|----------|-------|-------|
| 1 (About John) | image | `Assets/jjh-20250323-95 flower headshot Large.jpeg` |
| 5 (Nanome) | video | `Assets/nanome-hero.mp4` |
| 5 (Nanome) | image | `Assets/nanome2casestudy.webp` (poster) |
| 7 (AvatarMEDIC) | video | `Assets/AvatarMEDIC -Clinic-concept.mp4` |
| 8 (HoloTRIAGE) | video | `Assets/Avatarmedic-Holotriageclip-1.mp4` |
| 9 (Robot Digital Twin) | model3d | `Assets/Aerospace Award.glb` |
| 11 (Earth Star) | image | `Assets/EarthStarPaintingJH2025 Large.jpeg` |
| 12 (Influence) | image | `Assets/jhana-1.jpg` |
| 13 (Influence Interactive) | image | `Assets/jhana-3.jpg` |
| 15 (Unique) | image | `Assets/jjh-20250323-95 flower headshot Large.jpeg` |
| 21 (Awards) | model3d | `Assets/Aerospace Award.glb` |

**URL fields (all pages confirmed existing):**
| Chunk ID | url | Target |
|----------|-----|--------|
| 1 | `./about.html` | Bio section |
| 2 | `./about.html#education` | Education |
| 3 | `./design.html` | Design page |
| 5 | `./nanome2.html` | Nanome case study |
| 6 | `https://www.shapesxr.com` | External |
| 7 | `./about.html#experience` | Timeline |
| 8 | `./about.html#experience` | Timeline |
| 9 | `./about.html#awards` | Awards |
| 10 | `./about.html#research` | Research |
| 11 | `./art.html#writing` | Earth Star |
| 12 | `./art.html#installations` | Installations |
| 13 | `https://jhana.zone` | External |
| 14 | `./art.html#writing` | Fractal Futures |
| 15 | `./about.html` | About overview |
| 17 | `./services.html#coaching` | Coaching |
| 18 | `./services.html#design-services` | Design services |
| 20 | `./about.html#research` | Research pubs |
| 21 | `./about.html#awards` | Awards |
| 22 | `./services.html#endorsements` | Endorsements |

### B. Result Card Types

**Video card** — thumbnail with play icon, click plays inline:
```html
<div class="result-video-wrap" onclick="playInline(this, 'Assets/nanome-hero.mp4')">
    <img class="result-thumb" src="Assets/nanome2casestudy.webp" />
    <span class="play-icon">▶</span>
</div>
```

**3D Model card** — interactive `<model-viewer>` web component:
- Lazy-load `<model-viewer>` CDN only when a 3D card appears in results
- `<model-viewer src="Assets/Aerospace Award.glb" auto-rotate camera-controls>`
- 100×100px inline with the result card

**Linked titles** — card title becomes clickable:
```js
const titleHtml = r.url
    ? `<a href="${r.url}" class="result-title result-link" target="${r.url.startsWith('http') ? '_blank' : '_self'}">${r.title}</a>`
    : `<span class="result-title">${r.title}</span>`;
```
External links get `↗` icon via CSS `::after`.

### C. Service-Oriented Chunks
Add 2 new chunks for services/hiring queries:

```json
{ "id": 33, "title": "Hire John — Why Work Together",
  "tags": "hire work together engage consulting freelance designer engineer partner",
  "content": "Available for consulting, design engineering, and AI product work...",
  "page": "services", "url": "./services.html" }

{ "id": 34, "title": "Intro Call & Engagement",
  "tags": "schedule call meeting intro book consultation availability engage start",
  "content": "Book an intro call to discuss your project...",
  "page": "services", "url": "./services.html#coaching" }
```

## Files to Modify
- `Assets/search-chunks.json` — add url, video, model3d, image fields + 2 new chunks
- `scripts/search-overlay.js` (or `search.html`) — updated `renderResultCardInner()` with media logic
- `scripts/search-overlay.css` (or `search.html`) — video card, 3D card, link styles

## Verification
1. Search "nanome" → video thumbnail with ▶, click plays inline; title links to nanome2.html
2. Search "awards" → 3D model viewer rotatable inline
3. Search "about john" → headshot image in card; title links to about.html
4. Search "coaching" → title links to services.html#coaching
5. External links open new tab with ↗ icon
6. No URL → title not clickable
7. model-viewer CDN only loaded when 3D result appears
