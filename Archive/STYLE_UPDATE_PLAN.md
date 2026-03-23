# Style Update Plan: design.html
## Widescreen Layout & Legibility

---

## Summary

Expand content area on desktop, use multi-column layouts, improve text legibility.

**Max-width change**: 760px → 1100px (desktop)

---

## Proposed Layouts

### Current (Mobile/Narrow)
```
┌─────────────────────────┐
│         INTRO           │
├─────────────────────────┤
│      MetaMedium         │
├─────────────────────────┤
│      EarthStar          │
├─────────────────────────┤
│    [YouTube Video]      │
├─────────────────────────┤
│      Nanome 2           │
├─────────────────────────┤
│     AvatarMEDIC         │
├─────────────────────────┤
│        A1R              │
├─────────────────────────┤
│     HoloTRIAGE          │
├─────────────────────────┤
│    Robot Twin           │
├─────────────────────────┤
│   Education: MA         │
├─────────────────────────┤
│   Education: BA         │
├─────────────────────────┤
│   Award: Most Meta      │
├─────────────────────────┤
│   Award: Founder Inst   │
├─────────────────────────┤
│   Award: R&D            │
├─────────────────────────┤
│   Endorsement 1         │
├─────────────────────────┤
│   Endorsement 2         │
├─────────────────────────┤
│   Endorsement 3         │
├─────────────────────────┤
│   Endorsement 4         │
├─────────────────────────┤
│   Endorsement 5         │
├─────────────────────────┤
│      Services           │
├─────────────────────────┤
│        More             │
└─────────────────────────┘
```

### Desktop 1200px+ (Proposed)
```
┌─────────────────────────────────────────────────┐
│                     INTRO                       │
│           Tagline · Expertise · Tools           │
├────────────────────────┬────────────────────────┤
│      MetaMedium        │       EarthStar        │
│      [html diagram]       │       [logo & copy paste seed phrase]           │
├────────────────────────┴────────────────────────┤
│              [YouTube Video - full]             │
├───────────────┬───────────────┬─────────────────┤
│   Nanome 2     nanome 2 interactive graphic 
├───────────────┬───────────────┬─────────────────┤
│ AvatarMEDIC  │      A1R        │
├───────────────┼───────────────┼─────────────────┤
│  HoloTRIAGE   │  Robot Twin   │                 │
├───────────────┴───────────────┴─────────────────┤
│                                                 │
│  ┌─ EDUCATION ──────┐  ┌─ AWARDS ────────────┐  │
│  │ Georgetown MA    │  │ Most Meta [3D]      │  │
│  │ UCSD BA          │  │ Founder Institute   │  │
│  │                  │  │ R&D Innovation [3D] │  │
│  └──────────────────┘  └─────────────────────┘  │
│                                                 │
├────────────────────────┬────────────────────────┤
│   Endorsement 1        │   Endorsement 2        │
│   (Sheila - long)      │   (Inga - short)       │
├────────────────────────┼────────────────────────┤
│   Endorsement 3        │   Endorsement 4        │
│   (Tommy)              │   (Dr. Hurriyet)       │
├────────────────────────┴────────────────────────┤
│              Endorsement 5 (Kevin Kelly)        │
├─────────────────────────────────────────────────┤
│  Services: hi@johnhanacek.com    [Sub] [LinkedIn]│
└─────────────────────────────────────────────────┘
```

---

## Changes by Section

| Section | Current | Proposed (1200px+) |
|---------|---------|-------------------|
| Intro | 1 col | 1 col (centered, wider) |
| Featured Projects | 1 col stacked | **2 columns** |
| Past Work | 1 col stacked | **3 columns** (video spans full) |
| Education | 1 col, 2 cards | **Left column** |
| Awards | 1 col, 3 cards | **Right column** (beside Education) |
| Endorsements | 1 col, 5 cards | **2 columns** (last one full) |
| Services + More | 2 sections | **1 row combined** |

---

## Legibility Fixes

| Issue | Current | Proposed |
|-------|---------|----------|
| Card blur | `blur(16px)` | `blur(8px)` |
| Card background | `rgba(199,125,255,0.05)` | `rgba(15,15,30,0.85)` |
| Body text | `rgba(255,255,255,0.92)` | `rgba(255,255,255,0.95)` |
| Heading glow | 40px blur shadow | Remove glow, keep drop shadow |

---

## CSS Classes to Add

```css
/* Two-column grid */
.grid-2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-md);
}

/* Three-column grid */
.grid-3 {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-md);
}

/* Full-width span in grid */
.span-full {
    grid-column: 1 / -1;
}

/* Collapse to single column on mobile */
@media (max-width: 900px) {
    .grid-2, .grid-3 {
        grid-template-columns: 1fr;
    }
}
```

---

## HTML Structure Changes

```html
<!-- Featured Projects -->
<section id="projects">
    <h2>Featured Projects</h2>
    <div class="grid-2">
        <div class="content-card">MetaMedium...</div>
        <div class="content-card">EarthStar...</div>
    </div>
</section>

<!-- Past Work -->
<section id="pastwork">
    <h2>Past Work</h2>
    <div class="video-embed span-full">...</div>
    <div class="grid-3">
        <div class="content-card">Nanome 2...</div>
        <div class="content-card">AvatarMEDIC...</div>
        <div class="content-card">A1R...</div>
        <div class="content-card">HoloTRIAGE...</div>
        <div class="content-card">Robot Twin...</div>
    </div>
</section>

<!-- Education + Awards side by side -->
<div class="grid-2">
    <section id="education">
        <h2>Education</h2>
        <div class="content-card">MA...</div>
        <div class="content-card">BA...</div>
    </section>
    <section id="awards">
        <h2>Awards</h2>
        <div class="content-card">Most Meta...</div>
        <div class="content-card">Founder Inst...</div>
        <div class="content-card">R&D...</div>
    </section>
</div>

<!-- Endorsements -->
<section id="endorsements">
    <h2>What People Say</h2>
    <div class="grid-2">
        <div class="content-card endorsement">Sheila...</div>
        <div class="content-card endorsement">Inga...</div>
        <div class="content-card endorsement">Tommy...</div>
        <div class="content-card endorsement">Dr. Hurriyet...</div>
        <div class="content-card endorsement span-full">Kevin Kelly...</div>
    </div>
</section>
```

---

## Implementation Order

1. **Add CSS**: Grid classes + widescreen breakpoint + legibility fixes
2. **Wrap sections**: Add grid containers to HTML
3. **Test**: Verify mobile still works (collapses to 1 col)
4. **Refine**: Adjust spacing/gaps as needed

---

## Confirm?

- [ ] Max-width 1100px on desktop OK?
- [ ] 2-column Featured Projects OK?
- [ ] 3-column Past Work OK?
- [ ] Education + Awards side-by-side OK?
- [ ] 2-column Endorsements OK?
- [ ] Reduce blur/increase contrast OK?

**Reply with any changes or "proceed" to implement.**
