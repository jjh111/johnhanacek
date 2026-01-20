# Content Redistribution Plan
## johnhanacek.com Portfolio Site

### Goal
Redistribute content between index.html and design.html to:
1. Make **index.html** a concise landing page / personal brand intro
2. Make **design.html** the comprehensive professional portfolio (replacing jhanacek.net/design)
3. Keep **art.html** focused on visual/creative work

---

## Status: COMPLETE

All phases implemented January 2026.

---

## Final Structure

### INDEX.HTML (Landing Page)
```
Hero (interactive canvas)
│
├── About (brief)
│   └── "At the intersection of Creativity, Curiosity & Technology for Human Augmentation"
│
├── I Believe (philosophy)
│   └── Imagination is within reality
│   └── Infinite Games > Finite Games
│   └── Technology can augment human intelligence
│   └── Optimism/pessimism are self-fulfilling prophecies
│
├── Highlights (3 cards)
│   ├── Georgetown MA 2016 - "Most Meta"
│   ├── Founder Institute 2020 - AvatarMEDIC CEO
│   └── Aerospace Medical Assn 2022 - R&D Innovation Award
│
├── Featured Endorsements (2 quotes)
│   ├── Kevin Kelly - Wired founder
│   └── Inga Petryaevskaya - CEO ShapesXR
│
├── Explore (navigation cards)
│   ├── Design Portfolio → design.html
│   └── Art & Creative → art.html
│
└── Contact & Social
    └── hi@johnhanacek.com, Bluesky, X, LinkedIn
```

---

### DESIGN.HTML (Professional Portfolio)
```
Hero (blueprint canvas demo)
│
├── Intro
│   └── "Designing human-augmenting experiences at the intersection of AI, spatial computing, creative tools and data visualization"
│
├── Expertise & Tools
│   ├── Expertise: Product Design · XR/VR · UX · Design Systems · AI Tools · Data Viz · Workshops
│   └── Tools: Claude Code · OpenCode · LMStudio · Figma · Adobe · Blender · Unity · ShapesXR · Coda
│
├── Featured Projects (2)
│   ├── 01 MetaMedium: AI Beyond Chat
│   └── 02 EarthStar: AI for Planetary Thriving
│
├── Past Work (6 XR projects + Video)
│   ├── YouTube video embed
│   ├── Nanome 2: XR Product Design Case Study
│   ├── AvatarMEDIC
│   ├── A1R: Augmented First Responder
│   ├── HoloTRIAGE
│   └── Robot Digital Twin Control
│
├── Education
│   ├── MA Georgetown CCT 2016 - Thesis, Research
│   └── BA UCSD 2012 - Political Science, Neuroscience minor
│
├── Awards & Recognition (with 3D Sketchfab embeds)
│   ├── "Most Meta" trophy - Georgetown 2016
│   ├── Founder Institute Graduate 2020
│   └── R&D Innovation Award - Aerospace Medical Assn 2022
│
├── Endorsements (5 quotes)
│   ├── Sheila Zipfel - Nanome
│   ├── Inga Petryaevskaya - ShapesXR
│   ├── Tommy Kronmark - Muse.bio
│   ├── Dr. Hurriyet Ok - GWU
│   └── Kevin Kelly - Wired founder
│
├── Services & Consulting
│   └── Product design, UX strategy, innovation consulting
│   └── Contact: hi@johnhanacek.com
│
└── More
    ├── Substack: Spatial & Immersive Design
    └── Resume / LinkedIn
```

---

### ART.HTML (Creative Portfolio)
```
Hero (cosmos canvas)
│
├── Visual Art
│   └── jhana.zone reference
│
├── Photography & Media
│   └── SmugMug portfolio link
│
└── Explore
    └── Back to Design / Home
```

*(No changes needed - already well-focused)*

---

## Implementation Checklist

### Phase 1: Mobile Hero Fix (all pages)
- [x] Add portrait-mode CSS for hero padding (styles/shared.css)
- [x] Use 100svh for small viewport height

### Phase 2: Design.html Expansion
- [x] Add earthstar.space as Featured Project #2
- [x] Restructure: Featured Projects (2) → Past Work (6 XR projects + video)
- [x] Add Education section
- [x] Add Awards section with Sketchfab embeds
- [x] Add Dr. Hurriyet Ok endorsement
- [x] Add Kevin Kelly endorsement
- [x] Add Services/Consulting section
- [x] Add Resume link
- [x] Update nav to include new sections

### Phase 3: Index.html Simplification
- [x] Remove Overview section
- [x] Remove Education section
- [x] Remove Achievements section (condensed to Highlights cards without embeds)
- [x] Remove YouTube video (moved to design)
- [x] Reduce endorsements to Kevin Kelly + Inga
- [x] Replace Links & Resources with Explore navigation
- [x] Extract "I Believe" as standalone section
- [x] Update nav to match new structure

### Phase 4: Final Cleanup
- [x] Update emails to hi@johnhanacek.com
- [x] Verify all internal navigation works
- [x] Add Services to design.html navigation

---

## Decisions Made

| Question | Decision |
|----------|----------|
| 3D Sketchfab embeds | Moved to design.html (will convert to native later) |
| YouTube video | Moved to design.html as "Past Work" section |
| Featured endorsements on index | Kevin Kelly + Inga Petryaevskaya (2 quotes) |
| "I Believe" philosophy | Keep on index as standalone section |
| Email address | hi@johnhanacek.com (updated across all pages) |

---

## Future Improvements

- [ ] Convert Sketchfab embeds to native 3D (three.js or similar)
- [ ] Add more project thumbnails/images
- [ ] Consider adding a third Explore card for "Contact" on index
- [ ] Test on mobile portrait/landscape modes
