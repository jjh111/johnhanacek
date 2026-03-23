# Playground — Card Culling + Canvas Polish
*Status: Planned | Priority: 7 | Independent of search features*

## Context
The playground.html infinite canvas board needs two types of cleanup: (1) remove broken/stub demo cards, and (2) fix canvas UX issues.

## Part 1: Cull Broken/Stub Cards

**Remove 5 cards** (empty body / stubs / user-requested removal):
- `card-neobrush` — user explicitly asked to remove
- `card-curvedraw` — empty body stub
- `card-hypercube2` — empty body stub (hypercube translation)
- `card-mediastars` — empty body stub
- `card-torus` — empty body stub

**Keep 11 cards** across 3 rows:
- Row 1: CYBERBIRD, SOCIAL NETWORK VIZ, 3D SYNC DEMO, BLACK HOLE GOTHIC
- Row 2: TRANSCENDENCE GOLD, GOTHIC MANUSCRIPT, ANCIENT MATRIX LAB, TYPOGRAPHY EXPERIMENTS
- Row 3: HYPERCUBE PROJECTION, STAR TRAILS, DYNABOARD V1

**Reposition Row 3** — 3 cards at size-sm (475px), gap 60px:
- HYPERCUBE: x=60, STAR TRAILS: x=595, DYNABOARD V1: x=1130

## Part 2: Canvas Polish (6 fixes)

### Fix 1: Caustic Left-Edge Clipping
Remove negative X translates from `pgCausticDrift` keyframes. Reduce blob opacity to ~half for subtle shimmer.

### Fix 2: Zoom Range
Change from MIN=0.12/MAX=2.5 to MIN=0.20/MAX=1.50.

### Fix 3: MacBook Trackpad Support
Split wheel handler: `e.ctrlKey` = pinch-zoom, else = two-finger pan (with heuristic to distinguish trackpad scroll from mouse wheel).

### Fix 4: 3D Sync Splash Fix
In `Assets/3d-sync-demo/js/main.js`: replace `{ once: true }` listener with a guard variable to prevent accidental consumption.

### Fix 5: Intelligent Unloading
- Filter hides card → unload iframe (`removeAttribute('src')`)
- Card scrolled >1200px out of viewport → auto-unload
- Use `loadMargin=400` / `unloadMargin=1200` to avoid thrashing

## Files to Modify
- `playground.html` — card removal, repositioning, all 5 inline fixes
- `Assets/3d-sync-demo/js/main.js` — splash listener fix

## Verification
1. Board loads with 11 cards, no stubs
2. fitAllCards() works with 11 cards
3. Caustic: no left-edge clip, subtle shimmer
4. Zoom stops at 20%/150%
5. Trackpad: two-finger swipe pans, pinch zooms
6. 3D Sync: click splash → Three.js initializes
7. Filter out card → iframe unloads
8. Scroll far away → iframe unloads; come back → reloads
