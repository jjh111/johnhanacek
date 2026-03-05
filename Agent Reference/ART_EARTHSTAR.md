# Art Page — Add EarthStar Painting
*Status: Planned | Priority: 8 | Independent of search features*

## Context
The art page has a Writing & Worldbuilding section with an Earth Star subsection. `Assets/EarthStarPaintingJH2025 Large.jpeg` exists but isn't displayed on the site. Add it inline within the existing Earth Star content-card.

## Change

**File:** `art.html`
**Section:** Writing & Worldbuilding → Earth Star content-card (~lines 349-372)

The Earth Star card uses a `card-featured-split` layout:
- Left: `.project-info` — logo, title, description
- Right: `.project-interactive` — seed phrase code block

Add a `<figure>` below the split, inside the same `.content-card`:

```html
<figure class="earthstar-painting" style="margin: var(--space-md) 0 0; text-align: center;">
    <img src="./Assets/EarthStarPaintingJH2025 Large.jpeg"
         alt="Earth Star — original painting by John Hanacek, 2025"
         loading="lazy"
         style="width: 100%; max-height: 600px; object-fit: cover; border-radius: 8px; border: 1px solid rgba(77,201,246,0.15);">
    <figcaption style="margin-top: 0.5rem; font-size: var(--text-xs); color: var(--muted); font-style: italic;">
        Earth Star — original painting, 2025
    </figcaption>
</figure>
```

## File to Modify
- `art.html` — one insertion

## Verification
1. Scroll to Writing & Worldbuilding → Earth Star painting visible
2. Image loads (check DevTools Network)
3. Caption readable, styling consistent
4. Mobile: image fits within card (object-fit: cover)
