# Fish Ecosystem in design.html + Maze Walls + Erase Gesture
*Status: Planned | Priority: 5 | Independent of search features*

## Context
The design.html blueprint drawing canvas has shape recognition and morph animations but no living entities. Merge the fish ecosystem from index.html: fish swim in the blueprint canvas, dots spawn food, recognized shapes become physical maze walls fish avoid, and a squiggle gesture erases shapes. Also extract shared shape-detection functions into a shared module.

## Deliverables

### A. Create `scripts/shape-detection.js`
Extract identical functions from both files into a `ShapeDetect` global namespace:
- `getBounds()`, `distance()`, `getCircleScore()`, `getRectScore()`, `getTriangleScore()` (use index.html version — more sophisticated), `getLineScore()`, `detectArrowHead()`
- `detectShape()` stays in-page (diverges between files)
- Both pages destructure at top of script: `const { getBounds, distance, ... } = ShapeDetect;`

### B. Fish System in design.html
Copy fish system code from index.html into a new `<script>` block:
- All physics constants, entity arrays (rename `coral` → `fishCoral`)
- Fish helpers, shape generators, entity draw functions
- `classifyStroke()` for fish/food/coral/jellyfish/bubble spawning
- `spawnLaunchFish()` IIFE — seeds one fish at startup

### C. Shape Obstacles Sync
```js
let shapeObstacles = [];
function syncShapeObstacles() {
    shapeObstacles = recognizedShapes.filter(s => s.type !== 'dot').map(s => ({
        x: s.center.x, y: s.center.y, settled: true,
        shape: { width: w, height: h }
    }));
}
```
Fish avoidance loops use `fishCoral.concat(shapeObstacles)`.

### D. endDraw() Routing Priority
1. Squiggle → erase nearby shapes → return
2. classifyStroke() → fish entity → return
3. Dot → food (if fish exist) or blueprint dot → return
4. detectShape() → original morph animation
5. Fallback → push to strokes[], fade

### E. Squiggle Erase Detection
Detects rapid back-and-forth gestures (≥3 direction reversals). Amber particle burst on erase. Safe from false-triggering on circles/triangles (0-2 reversals).

### F. maxShapes increase to 50
Current 20 is too restrictive for maze-building.

## Files to Create/Modify
- `scripts/shape-detection.js` — CREATE shared module
- `design.html` — fish system integration, endDraw routing, squiggle detection
- `index.html` — add `<script src>`, destructure, remove duplicated functions

## Key Line References (index.html)
- Fish behavior: ~lines 1000-2200
- Entity draw functions: varies
- classifyStroke: ~line 5820-5897

## Verification
1. Page loads → one small fish swimming in blueprint canvas
2. Draw fish loop → fish spawns
3. Tap with fish → green ripple, food appears, fish seeks
4. Draw circle → shape persists, fish steer around it
5. Multiple shapes → fish navigate maze walls
6. Squiggle over shape → amber burst, shape removed
7. Corner glyph click → shapes clear, fish remain
8. Both pages share `scripts/shape-detection.js` with no duplication
