# Aquarium Game — Master Plan
*Last updated: Feb 2026*

This document covers the full roadmap: fish behavior fixes (continuing from FISH_BEHAVIOR_IMPROVEMENT_PLAN.md), stroke recognition improvements, onboarding flow design, site styling/nav improvements, and push readiness.

---

## TRACK A — Fish Physics & Behavior (Ongoing)

### A1. Pivot / Center Point Coherence (Next up)

**Root problem**: `f.x / f.y` is the geometric center of the fish body. But all "presence" logic — challenging, territory, fleeing, wake avoidance — uses raw center-to-center distances. This means:
- Large fish "challenge" begins when centers overlap, but visually the nose and tail have already passed
- Flee triggers based on center distance, not the threatening mouth/nose
- Territory radius is measured from body center, not nose tip

**Fix**: Define a canonical `presencePoint` per fish — the nose position — and use that for all social/behavioral distance checks (not just food). Mouth = `noseOffset * 0.78` ahead of center. Use it for:
- `challenging` trigger: distance from nose of challenger to body center of challenged
- `fleeing` trigger: distance from predator nose to prey body center
- Wake avoidance threat origin: predator nose, not center
- Territory radius origin: large fish nose

Implementation: add a small helper `getFishNose(f)` returning `{ x: f.x + Math.cos(f.heading) * f.noseOffset, y: f.y + Math.sin(f.heading) * f.noseOffset }` and replace key distance checks.

---

### A2. Force Priority System (Phase 2 from behavior plan)

All forces currently additively modify `targetHeading` with no priority. Result: collision force and food-seek cancel each other, edge emergency fights fleeing.

**Proposed**: 5-tier priority. When a higher-priority force fires, lower-priority forces are scaled down or skipped.

| Priority | Force | Strength |
|----------|-------|----------|
| 1 — Emergency | Hard edge hit, severe collision overlap | Full heading override |
| 2 — Reactive | Edge buffer, collision buffer, flee/hide | 0.08–0.12 |
| 3 — Anticipatory | Edge anticipate, wake avoidance, coral zone | 0.03–0.06 |
| 4 — Behavioral | Wander, formation slot, school heading | 0.01–0.03 |
| 5 — Ambient | Alignment, cohesion | 0.005–0.015 |

Track `activePriority` per frame. Forces below active priority are scaled to 20%.

---

### A3. Large Fish Cruise Stabilization (Phase 3)

Large fish in `largeFishSimpleMode` still wobble because separation forces still apply.

- Give large fish a dedicated `'cruising'` state (currently they use `'idle'`)
- During cruising: skip ALL separation/boids forces, skip leader logic, only apply edge + coral + cruise steering
- Requires full state transition audit before rename: hunt, challenge, retreat must all still gate correctly
- Add cruise angle hysteresis: only change cruise angle after being near edge for 30+ consecutive frames

---

### A4. Heading Commitment Hardening (Phase 5)

Reversal pressure system currently fights emergency behaviors.

- Make commitment state-aware: `fleeing/retreating/hiding` → `reversalPressure = 0` (allow instant turns)
- `cruising/seeking/hunting/challenging` → high commitment strength (resist reversals)
- `idle` → moderate commitment

---

## TRACK B — Stroke Recognition

### B1. Current Recognition System

`classifyStroke()` in index.html (~line 916):
- Tiny tap (<8 points, <25px) → food
- Closed shape → score bubble/coral/jellyfish (circle/rect/triangle scores)
- Open self-intersecting loop → fish (size determines small/medium/large)
- Open non-loop → line (bubble popper)

**Problems**:
1. Circle score threshold (0.7) misclassifies rough circles as coral or nothing
2. No vertical/horizontal bias in rectangle detection → tall thin strokes become coral
3. Fish loop detection: `loopSize > 25` is too permissive — stray scribbles become fish
4. No confidence gap check: if circle=0.72 and rect=0.70 it picks circle, but should require a clearer margin
5. Jellyfish triangle threshold (0.5) is very loose — almost anything triangular qualifies
6. No stroke speed/time data used — a quick slash vs. a deliberate circle should score differently
7. No minimum aspect ratio guard: a 20×20 closed scribble gets scored as bubble

### B2. Recognition Improvements

**B2a. Require confidence gaps**
```javascript
const CIRCLE_MIN = 0.72;
const CIRCLE_MARGIN = 0.08;   // Must beat next best by this much
const RECT_MIN = 0.65;
const RECT_MARGIN = 0.10;
const TRI_MIN = 0.60;
const TRI_MARGIN = 0.08;

if (circleScore > CIRCLE_MIN && circleScore - Math.max(rectScore, triScore) > CIRCLE_MARGIN) → bubble
if (rectScore > RECT_MIN && rectScore - triScore > RECT_MARGIN) → coral
if (triScore > TRI_MIN && triScore - rectScore > TRI_MARGIN) → jellyfish
```

**B2b. Aspect ratio guard for rect/coral**
Coral should be roughly squarish or wide, not a tall thin spike. Add:
```javascript
const aspectRatio = width / height;
if (rectScore > RECT_MIN && aspectRatio > 0.4 && aspectRatio < 2.5) → coral
```

**B2c. Stricter fish loop: require minimum tail**
Fish stroke = loop + tail extension. Require that after the loop, there are enough remaining points to suggest a tail (at least 20% of total points beyond loop endpoint). Without a tail it's likely just a messy circle attempt.

**B2d. Point density / stroke deliberateness**
Fast slashes produce few points per pixel. Deliberate shapes produce more. Add a "deliberateness score": `points.length / size`. Very low density → likely not intentional shape.

**B2e. Stroke size ranges per entity**
Lock entity type to sensible size ranges:
- Bubble: 20–180px diameter
- Coral: 30–200px
- Jellyfish: 25–120px
- Fish small: loopSize 25–45
- Fish medium: loopSize 45–75
- Fish large: loopSize 75+
- Food: <25px tap

**B2f. Closed shape fallback**
Instead of returning `null` for unrecognized closed shapes, offer a gentle visual hint (brief flash + icon) showing what was closest to being recognized. Useful for onboarding.

---

## TRACK C — Onboarding Mini Flow

### C1. Flow Overview

A lightweight guided introduction triggered on first visit (or via a "?" button). Uses the existing draw mechanic — each step teaches one gesture, then the player does it. Steps:

```
Step 1: Draw a bubble       → "Draw a circle"
Step 2: Draw coral          → "Draw a rectangle"
Step 3: Draw a jellyfish    → "Draw a triangle"
Step 4: Draw a small fish   → "Draw a small loop with a tail"
Step 5: Draw a medium fish  → "Draw a bigger loop with a tail"
Step 6: Draw a large fish   → "Draw a big loop with a long tail"
Step 7: Feed them           → "Tap to drop food"
Step 8: Complete            → Dismiss, canvas is yours
```

### C2. Onboarding State Machine

```javascript
const ONBOARDING_STEPS = [
  { id: 'bubble',    instruction: 'Draw a circle to make a bubble',    target: 'bubble',    hint: '○' },
  { id: 'coral',     instruction: 'Draw a rectangle to grow coral',     target: 'coral',     hint: '□' },
  { id: 'jellyfish', instruction: 'Draw a triangle for a jellyfish',    target: 'jellyfish', hint: '△' },
  { id: 'fish_s',   instruction: 'Small loop + tail = small fish',     target: 'fish',      sizeRange: [25, 45], hint: '∫' },
  { id: 'fish_m',   instruction: 'Bigger loop = medium fish',          target: 'fish',      sizeRange: [45, 75], hint: '∫' },
  { id: 'fish_l',   instruction: 'Big loop = large fish',              target: 'fish',      sizeRange: [75, 999], hint: '∫' },
  { id: 'feed',     instruction: 'Tap anywhere to drop food',          target: 'food',      hint: '·' },
];

let onboardingStep = 0;
let onboardingActive = localStorage.getItem('onboarded') !== 'true';
```

### C3. UI Components

- **Instruction overlay**: Semi-transparent panel in lower-left, shows step text + shape hint glyph
- **Step counter**: "3 / 7" small text
- **Ghost stroke**: Animated dashed-line demo stroke that plays once when step starts, showing the shape to draw
- **Success flash**: When the correct entity is spawned during onboarding, brief green glow + "✓ [entity name]!" feedback
- **Skip button**: Small "skip intro" link — stores `onboarded=true` in localStorage
- **Completion**: "You've got it — the aquarium is yours." panel that auto-dismisses after 3s

### C4. Ghost Stroke Animation

Each shape has a pre-recorded point path. On step entry, animate drawing this ghost in 800ms:
- Dashed light-cyan line
- Fades out after 1s
- Does NOT spawn an entity (ghost mode)

Shape ghost paths (normalized 0–1, scaled to 120px centered in canvas):
- Bubble: unit circle approximation (16 points)
- Coral: rectangle corners + intermediate points
- Jellyfish: triangle path
- Fish: oval loop + extending line

### C5. Recognition Tolerance During Onboarding

During onboarding, temporarily relax recognition thresholds for the target shape to improve first-time success rate. Example: if step target is `coral`, lower rect threshold to 0.5 (vs 0.65 normal). This prevents frustration while teaching.

---

## TRACK D — Site Styling & Nav (Push-Ready)

### D1. Nav Bar Issues

Current nav (`<nav id="nav">`) is anchor-link-only (scrolls within index.html). When on design.html, these links break.

**Fixes**:
1. Convert nav links to page-aware: when on index.html use `#anchor`, when on other pages use `index.html#anchor`
2. Add active page indicator to shape-nav icons (already done for index: `class="shape-link active"`)
3. Nav should have consistent page links: Home, Design, Art, (About coming soon), Contact

**Nav structure target**:
```
[△ JH] [□ DESIGN] [○ ART]     ← shape nav (hero, top of each page)
[scroll nav: About · Believe · Highlights · Endorsements · Explore · Contact]  ← index.html only
```

### D2. Content Improvements for Push

**index.html sections to update**:

- **About**: Expand slightly. Current is thin. Add 1–2 sentences about current work / open to opportunities.
- **Highlights**: Third card (Aerospace Medical Association) has no link — add AsMA.org or the award article.
- **Endorsements**: Add 1 more endorsement if available. Kevin Kelly one is strong.
- **Explore**: Links to art.html, about.html, services.html — these pages may be stubs. Either add stub pages or remove/gray-out the links with "coming soon" labels.
- **Contact**: Add GitHub link. Currently has email, Substack blogs, Bluesky, X, LinkedIn.
- **Footer**: Update version string to v1.2, current date.

### D3. Visual Polish

- **Hero canvas draw hint**: Currently "✎ draw" — could be more inviting. Consider "draw something ↗" or small shape glyphs as hint.
- **Scroll indicator**: The double-chevron scroll indicator could be more prominent or animated.
- **Section spacing**: Review on mobile — sections may be too tightly packed.
- **Nav transition**: Ensure nav slide-in animation feels smooth, not jarring.

### D4. Stub Pages

For push: art.html, about.html, services.html should exist as minimal stubs (not 404):
- Same hero canvas (or static background)
- Same nav
- "Coming soon" content card with brief description
- Link back to index.html

---

## PUSH CHECKLIST (v1.2)

### Before push:
- [ ] Fish behavior batch (school cohesion, flee, edge) verified working visually
- [ ] Stroke recognition improvements (B2a–B2e) tested — no regression on existing shapes
- [ ] Nav links verified from design.html (don't 404)
- [ ] Stub pages exist for art.html, about.html, services.html
- [ ] About section content updated
- [ ] Footer version/date updated
- [ ] No console errors on index.html or design.html
- [ ] Mobile layout checked (canvas, nav, content cards)
- [ ] OG / Twitter card image current

### Nice to have before push:
- [ ] Onboarding step 1–3 (bubble/coral/jellyfish) implemented (fish steps can come later)
- [ ] Draw hint glyph improved
- [ ] Endorsements section: 3rd entry

---

## WORK ORDER (Recommended Sequence)

**Right now — finish fish batch first:**
1. A1: Pivot/nose point fix for challenging + wake avoidance (quick, targeted)
2. Run through A2 force priority (larger but high impact)

**Then site push prep:**
3. D1: Nav bar page-awareness fix
4. D2: Content tweaks (about, footer, explore stubs)
5. D3: Visual polish (hint, scroll indicator)
6. D4: Stub pages for missing pages
7. Git commit + push → v1.2

**Post-push — game mechanics:**
8. B2: Stroke recognition improvements (a–e)
9. C1–C5: Onboarding flow
10. A3: Large fish cruise stabilization
11. A4: Heading commitment hardening

---

## Open Questions

- Should onboarding auto-trigger or be opt-in (press "?" button)?
- What's the right canvas size for ghost stroke demos? (120px centered, or full-canvas centered?)
- Should stub pages share the fish canvas or use a simpler background?
- Is `design.html` frozen — i.e. should nav improvements be applied there too?
- Does fish challenging need the nose fix before push, or is it low enough priority to defer?
