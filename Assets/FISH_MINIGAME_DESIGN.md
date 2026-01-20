# Fish Minigame Design Document

**Project:** Interactive aquatic canvas minigame for index.html hero section
**Status:** Design phase
**Last Updated:** 2025-12-18

---

## Overview

An interactive canvas experience where users draw to create and interact with an aquatic ecosystem. Different stroke types create different entities with unique physics and behaviors.

---

## Existing Code Foundation (index.html)

**Current shape recognition already implemented:**
- `detectShape()` function with score-based classification
- **Circle detection:** `getCircleScore()` with 0.7+ threshold → **Maps to: BUBBLES**
- **Rectangle detection:** `getRectScore()` with 0.6+ threshold → **Maps to: CORAL**
- **Triangle detection:** `getTriangleScore()` with 0.5+ threshold → **Maps to: CORAL**
- **Line detection:** `getLineScore()` for open strokes → **Maps to: LINES**
- **Arrow detection:** `detectArrowHead()` for directional lines → **Maps to: LINES (ignore arrow)**
- Closed loop detection (start/end proximity check)
- Small shape filter (size < 20px rejected) → **Needs adjustment for FOOD**

**What needs to be added/modified:**
1. **Fish detection:** Closed loops that don't match circle/rectangle/triangle → NEW entity type
2. **Food detection:** Very small strokes (size < 20px, few points) → Lower size threshold
3. **Entity creation:** Convert detected shapes into entity objects with physics/behavior
4. **Remove existing demo features:** Shape morphing, whisper labels, relationship detection

**Advantages:**
- Shape scoring algorithms already tuned
- Geometry helpers (getBounds, distance, etc.) ready
- Canvas infrastructure and animation loop exist
- Just need to adapt classification outputs and add entity behaviors

---

## Shape Recognition & Entity Types

### 1. **Fish** (Closed Loop Strokes)
**Recognition:** Single stroke that loops back on itself (start and end points close together)

**Properties:**
- Visual: Organic fish shape with tail, wiggle animation
- Physics: Swim freely in any direction
- Lifespan: Persistent (until limit reached)

**Behaviors:**
- **Schooling:** Fish of similar size group together and swim in formation
- **Coral Affinity:** Idle/hover near coral structures when not seeking food
- **Food Seeking:** Actively swim toward food when hungry
- **Eating:** "Eat" food points by moving close to them

**Limits & Constraints:**
- **Max fish count:** TBD (suggested: 8-12 fish)
- **When limit reached:** Oldest fish removed (FIFO queue)

**Open Questions:**
- How is fish size determined? (stroke length? bounding box area?)
- What defines "similar size" for schooling? (within 20% of each other?)
- Swimming speed? (constant or variable based on hunger/behavior?)
- Hunger mechanics? (fish always want food, or cycle between states?)

---

### 2. **Coral** (Polygon Strokes)
**Recognition:** Multi-sided polygons (3+ points, angular shapes)

**Properties:**
- Visual: Crystalline/coral-like structures
- Physics: Sink to bottom of canvas (gravity effect)
- Lifespan: Persistent (until limit reached)

**Behaviors:**
- **Float down:** Slowly descend with gentle sway/drift
- **Settle:** Rest at bottom of canvas
- **Fish attraction:** Fish idle near coral

**Limits & Constraints:**
- **Max coral count:** TBD (suggested: 5-8 pieces)
- **When limit reached:** Oldest coral removed (FIFO queue)
- **Bottom collision:** Stop at canvas bottom

**Open Questions:**
- Collision between coral pieces? (stack, overlap, or push apart?)
- Visual style? (angular crystals, organic branching, or both?)
- Drift animation strength/speed?

---

### 3. **Bubbles** (Circle Strokes)
**Recognition:** Roughly circular closed strokes

**Properties:**
- Visual: Translucent bubbles with shine/reflection
- Physics: Rise upward (reverse gravity)
- Lifespan: Rise until pop or intersected

**Behaviors:**
- **Rise:** Float upward with gentle wobble/drift
- **Pop at top:** Disappear when reaching top of canvas
- **Pop on intersection:** Burst when intersected by temporary lines

**Limits & Constraints:**
- **Max bubbles:** Unlimited? Or cap? (suggested: 15-20)
- **Rise speed:** TBD (suggested: slow, varies by size?)
- **Pop animation:** Quick burst effect

**Open Questions:**
- Size variation? (larger bubbles rise slower?)
- Bubble merging? (when they touch, combine into larger bubble?)

---

### 4. **Food** (Point/Dot Strokes)
**Recognition:** Very short strokes or tap gestures (minimal movement)

**Properties:**
- Visual: Small particle/food pellet
- Physics: Float in place or slow drift
- Lifespan: Depletes when eaten or over time

**Behaviors:**
- **Attract fish:** Fish swim toward food
- **Get eaten:** Disappear when fish reaches them
- **Natural depletion:** Slowly fade/shrink over time if not eaten

**Limits & Constraints:**
- **Max food count:** TBD (suggested: 10-15 pieces)
- **Depletion rate:** TBD (suggested: 10-20 seconds if not eaten)
- **Eating distance:** TBD (fish within X pixels consumes food)

**Open Questions:**
- Food drift/movement? (static, gentle float, or random drift?)
- Visual indicator of depletion? (fade, shrink, pulse?)

---

### 5. **Lines** (Temporary Strokes)
**Recognition:** Open-ended strokes (not closed loops, not recognized as other shapes)

**Properties:**
- Visual: Temporary sketchy line
- Physics: Static
- Lifespan: Short-lived (fade quickly)

**Behaviors:**
- **Bubble intersection:** Pop bubbles that cross the line
- **Fade out:** Disappear after brief duration

**Limits & Constraints:**
- **Duration:** TBD (suggested: 1-2 seconds)
- **Max lines:** Multiple can exist simultaneously

**Open Questions:**
- Collision detection method? (line segment intersection with bubble circles?)
- Visual fade style? (opacity fade, sketch fade, dissolve?)
- Should lines block fish movement? (probably not)

---

## Edge Cases & Ambiguities

### **Shape Recognition Edge Cases:**

1. **Ambiguous closed loops:**
   - What if a loop is neither circle/rect/tri nor clearly organic (fish)?
   - **Decision needed:** Default to fish, or require minimum "organicness" score?
   - **Suggestion:** Any closed loop not matching geometric shapes = fish
   nuance: the shape of the fish I want to start with is a stroke that will pass through itself once and the start and end points of the stroke will then be near each other and perhaps even aligned. let's try to get a basic 'fish profile' to detect that is not going to cause false positives with the confidence scores.

2. **Overlapping confidence scores:**
   - What if circleScore = 0.68 and rectScore = 0.65? (both marginal)
   - **Current:** Circle wins if > 0.7, otherwise check rect
   - **Issue:** Could miss both and become fish unintentionally
   - **Suggestion:** Add minimum confidence thresholds or use highest score
   human suggestion if not detected as anything it just fades away in the demo currently so let's continue that.

3. **Very small food vs noise:**
   - How to distinguish intentional dot/tap from drawing start jitter?
   - **Current:** size < 20px rejected entirely
   - **Suggestion:** Allow if points.length < 5 AND size < 15px = food

4. **Arrow vs line distinction:**
   - Arrows currently detected but not used differently
   - **Decision needed:** Treat arrows as lines, or add special behavior?
   - **Suggestion:** Ignore arrow detection, treat all open strokes as lines

5. **Partial/interrupted strokes:**
   - What if user draws fish but lifts finger before closing loop?
   - **Current:** Would be detected as line
   - **Decision needed:** Allow partial loops as fish?
   - **Suggestion:** Keep strict - only closed loops are fish

### **Physics & Collision Edge Cases:**

6. **Canvas boundary behavior:**
   - Fish swim to edge: Wrap around? Bounce? Stop?
   - Bubbles reach top: Pop immediately or float off-screen briefly?
   - Coral reach bottom: Stack, overlap, or push apart?
   - **Decision needed for each entity type**
   - **Suggestion:**
     - Fish: Bounce off edges (turn around)
     - Bubbles: Pop when reaching top edge
     - Coral: Stop at bottom, overlap allowed (no collision)
     - Food: Static, no boundary interaction

7. **Bubble-line intersection precision:**
   - How precise should intersection detection be?
   - Check every point on line vs bubble radius?
   - **Suggestion:** Line segment to circle intersection algorithm (standard)

8. **Fish eating distance:**
   - Fish center within X pixels of food?
   - Fish bounding box overlaps food?
   - **Decision needed:** Distance threshold value
   - **Suggestion:** 25-30px from fish center to food

9. **Multiple fish eating same food:**
   - If 2 fish reach food simultaneously, which eats it?
   - **Suggestion:** First to enter eating distance, or closest wins

10. **Bubble merge on collision:**
    - If enabled, how to handle:
      - Size limit on merged bubbles?
      - Multiple bubbles merging at once?
      - Merged bubble rise speed adjustment?
    - **Decision needed:** Enable merging or not?
    - **Suggestion:** Disable merging for simplicity (Phase 1)

### **Behavior & AI Edge Cases:**

11. **Fish with no coral present:**
    - If no coral exists, what's idle behavior?
    - **Suggestion:** Random drift/wander at slow speed

12. **Fish with no food present:**
    - Always seeking? Only seek if food exists?
    - **Suggestion:** Check for food existence before entering "seeking" state

13. **Schooling priority conflicts:**
    - If fish wants to school AND seek food, which wins?
    - **Suggestion:** State priority: Eating > Seeking Food > Schooling > Idle

14. **School fragmentation:**
    - If one fish in school sees food, do all break away?
    - **Suggestion:** Each fish decides independently

15. **Coral as obstacle:**
    - Do fish swim through coral, or pathfind around?
    - **Suggestion:** Swim through (no collision) for simplicity, 
    Request: Do a collision, use the near to keep fish close they don't want to touch

16. **Fish stuck at edge:**
    - If fish bounces off edge repeatedly while seeking food
    - **Suggestion:** Add randomness to bounce angle

### **Lifecycle & Limit Edge Cases:**

17. **FIFO removal timing:**
    - Remove oldest when NEW entity created, or when limit exceeded?
    - **Suggestion:** Check limit BEFORE creating new entity, remove oldest first

18. **Food depletion during eating:**
    - If fish swimming toward food that's about to deplete?
    - **Suggestion:** Food disappears, fish returns to idle/schooling

19. **Coral removal impact on fish:**
    - If fish idling near coral that gets removed (FIFO)?
    - **Suggestion:** Fish transitions to wander/seeking state

20. **Line fade during bubble intersection:**
    - Line pops bubble at 50% opacity - does it still pop?
    - **Suggestion:** Yes, lines can pop bubbles at any opacity until fully gone

### **User Experience Edge Cases:**

21. **Drawing on top of entities:**
    - Can user draw through fish/bubbles/coral?
    - **Current:** Canvas allows drawing anywhere
    - **Suggestion:** Keep this - entities don't block drawing
    request: lean in, food inside a bubble is invisible to the fish?

22. **Accidental entity creation:**
    - User tries to draw fish, creates bubble (too circular)
    - **Decision needed:** Allow "undo" or entity deletion?
    - **Suggestion:** No undo (Phase 1) - just creates more chaos/fun

23. **Empty canvas state:**
    - Should some entities spawn on page load?
    - **Suggestion:** Start empty, let user populate organically
    Ux request: start with one fish on idle state, invite user to do something through one fish.

24. **Performance with max entities:**
    - With 12 fish + 8 coral + 20 bubbles + 15 food + 5 lines = 60 entities
    - AI calculations + physics + rendering every frame
    - **Suggestion:** Profile performance, reduce limits if needed

### **Visual & Animation Edge Cases:**

25. **Overlapping entities rendering:**
    - Layer order: Back→Front: Coral, Food, Fish, Bubbles, Lines
    - **Confirm:** This order makes sense?

26. **Entity size variation:**
    - Should all fish/bubbles/coral be same size?
    - Or vary based on stroke size?
    - **Decision needed**
    - **Suggestion:** Fish/bubble size = stroke bounding box size (scaled)

27. **Coral orientation:**
    - Rectangle vs triangle coral - different visual styles?
    - Or both rendered as same crystalline form?
    - **Suggestion:** Both become angular coral, slightly different shapes

---

## System Architecture

### **Core Systems:**

1. **Shape Recognition Engine**
   - Analyze stroke geometry on draw completion
   - Classify: Loop → Fish, Polygon → Coral, Circle → Bubble, Point → Food, Other → Line
   - Use existing geometry from drawing demo (getBounds, centroid, etc.)

2. **Entity Manager**
   - Track all active entities by type
   - Enforce limits (FIFO removal when exceeded)
   - Update entity states each frame

3. **Physics Engine**
   - Bubble rising (negative gravity)
   - Coral sinking (positive gravity)
   - Fish swimming (AI-driven movement)
   - Collision detection (fish→food, line→bubble)

4. **Behavior AI**
   - **Fish AI:**
     - State machine: Idle, Schooling, Seeking Food, Eating
     - Flocking/schooling algorithm (alignment, cohesion, separation)
     - Pathfinding toward food
     - Coral affinity (hover near coral when idle)
   - **Schooling:** Group fish by size, apply boids algorithm

5. **Rendering System**
   - Layer order: Coral (back) → Food → Fish → Bubbles → Lines (front)
   - Animations: Fish wiggle, bubble wobble, coral sway
   - Particle effects: Bubble pop, eating sparkle

6. **Lifecycle Management**
   - FIFO queues for fish and coral limits
   - Food depletion timers
   - Bubble pop conditions
   - Line fade timers

---

## Technical Implementation

### **Data Structures:**

```javascript
// Entity arrays
let fish = [];        // { id, points, center, size, velocity, state, target, createdAt }
let coral = [];       // { id, points, center, position, velocity, settled, createdAt }
let bubbles = [];     // { id, center, radius, position, velocity, createdAt }
let food = [];        // { id, position, createdAt, depletionStart }
let tempLines = [];   // { id, points, createdAt, opacity }

// Constants
const MAX_FISH = 10;
const MAX_CORAL = 6;
const MAX_BUBBLES = 20;
const MAX_FOOD = 12;
const FOOD_LIFETIME = 15000; // 15 seconds
const LINE_DURATION = 1500;  // 1.5 seconds
```

### **Animation Loop:**

```javascript
function animate() {
    // Update physics
    updateBubbles();    // Rise and wobble
    updateCoral();      // Sink to bottom
    updateFish();       // AI behaviors
    updateFood();       // Depletion
    updateLines();      // Fade out

    // Check interactions
    checkFishEating();       // Fish + Food collision
    checkBubblePopping();    // Line + Bubble intersection

    // Render layers
    drawCoral();
    drawFood();
    drawFish();
    drawBubbles();
    drawLines();

    // Continue if active
    if (hasActiveEntities()) {
        requestAnimationFrame(animate);
    }
}
```

### **Shape Recognition:**

```javascript
function classifyStroke(stroke) {
    const bounds = getBounds(stroke.points);
    const area = (bounds.maxX - bounds.minX) * (bounds.maxY - bounds.minY);
    const perimeter = calculatePerimeter(stroke.points);

    // Point/Dot (very small)
    if (area < 25 && stroke.points.length < 5) return 'food';

    // Closed loop
    const isClosed = distance(stroke.points[0], stroke.points[stroke.points.length-1]) < 30;

    if (isClosed) {
        const circularity = (4 * Math.PI * area) / (perimeter * perimeter);

        // Circle (high circularity)
        if (circularity > 0.7) return 'bubble';

        // Polygon (angular, low circularity)
        if (isAngular(stroke.points)) return 'coral';

        // Loop (organic shape)
        return 'fish';
    }

    // Open stroke
    return 'line';
}
```

---

## Visual Design

### **Color Palette (Aquatic Theme):**
- Fish: Gradient blend of bio-cyan (#00d9ff) → bio-purple (#c77dff)
- Coral: Crystalline pink/purple tones (#ff6ec7, #c77dff)
- Bubbles: Translucent cyan with white highlights
- Food: Bio-green pellets (#7ae582)
- Lines: Faint cyan sketch (#00d9ff, 0.3 opacity)

### **Animations:**
- Fish: Tail wiggle (sine wave), body undulation
- Bubbles: Wobble (subtle horizontal drift), shine rotation
- Coral: Gentle sway when sinking, subtle pulse when settled
- Food: Gentle float/bob
- Lines: Opacity fade 1.0 → 0.0

---

## Open Questions & Parameters to Define

1. **Fish:**
   - Max count? (suggested: 8-12)
   - Swimming speed? (suggested: 1-3 px/frame)
   - Size calculation? (stroke length vs area)
   - Schooling size threshold? (within 20% size?)
   - Hunger cycle? (always hungry, or timed states?)

2. **Coral:**
   - Max count? (suggested: 5-8)
   - Sink speed? (suggested: 0.5-1 px/frame)
   - Collision behavior? (stack, overlap, push apart?)

3. **Bubbles:**
   - Max count? (suggested: 15-20)
   - Rise speed? (suggested: 1-2 px/frame)
   - Size affects speed? (larger = slower?)
   - Merging enabled?

4. **Food:**
   - Max count? (suggested: 10-15)
   - Lifetime? (suggested: 15 seconds)
   - Eating distance? (suggested: 20-30 px)
   - Drift enabled?

5. **Lines:**
   - Duration? (suggested: 1.5 seconds)
   - Fade curve? (linear, ease-out?)

6. **General:**
   - Canvas bounds behavior? (wrap around, bounce, or stop at edges?)
   - Initial state? (spawn a few entities on load?)

---

## Implementation Phases (Revised)

### **Phase 0: Cleanup & Adaptation** (Foundation)
- Remove existing demo features from index.html:
  - Shape morphing animations
  - Whisper labels
  - Relationship detection
  - Recognition particle bursts (save for later)
- Adapt `detectShape()` to output fish minigame entity types:
  - Circle → Bubble
  - Rectangle/Triangle → Coral
  - Closed loop (not geometric) → Fish
  - Very small stroke → Food
  - Open stroke → Line
- Create entity arrays and data structures
- Test classification outputs

**Estimated effort:** 1-2 hours

---

### **Phase 1: Entity Creation & Basic Rendering** (Get things on screen)
- Convert detected shapes into entity objects:
  - Fish: Store original points, calculate size, set initial position
  - Coral: Store shape points, set position
  - Bubbles: Store center/radius, set position
  - Food: Store position
  - Lines: Store points, set opacity timer
- Basic rendering for each entity type:
  - Fish: Draw stroke outline with color
  - Coral: Angular crystalline shape
  - Bubbles: Circle with gradient
  - Food: Small dot
  - Lines: Fading stroke
- Test creating entities by drawing

**Estimated effort:** 2-3 hours

---

### **Phase 2: Basic Physics** (Make things move)
- Implement simple movement:
  - Bubbles: Rise upward at constant speed
  - Coral: Sink downward at constant speed
  - Food: Static (no movement)
  - Lines: Static, fade opacity over time
  - Fish: Random drift (placeholder for AI)
- Canvas boundary handling:
  - Bubbles: Pop at the top
  - Coral: Stop at bottom
  - Fish: Bounce at edges
- Update animation loop to move entities
- Test physics for all entity types

**Estimated effort:** 2-3 hours

---

### **Phase 3: Fish AI - Basic** (Smart fish)
- Implement simple fish behaviors:
  - Random swimming when no food present
  - Detect food in range
  - Pathfind toward nearest food (simple straight-line movement)
  - Eating collision detection (distance threshold)
  - Remove food when eaten
- Fish movement parameters:
  - Swimming speed
  - Detection range for food
  - Eating distance
- Test fish finding and eating food

**Estimated effort:** 3-4 hours

---

### **Phase 4: Interactions & Lifecycle** (Game mechanics)
- Line-bubble intersection:
  - Line segment to circle collision detection
  - Pop bubble with effect
- Food depletion:
  - Timer-based fading if not eaten
  - Visual indicator (shrink/fade)
- FIFO limits:
  - Enforce max counts for fish, coral, bubbles, food
  - Remove oldest when exceeded
  - Test limit enforcement
- Test all interactions

**Estimated effort:** 2-3 hours

---

### **Phase 5: Fish AI - Advanced** (Schooling & behaviors)
- Implement fish state machine:
  - States: Idle, Seeking Food, Eating, Schooling
  - State transitions and priorities
- Schooling behavior:
  - Group fish by similar size
  - Boids algorithm (separation, alignment, cohesion)
  - School movement coordination
- Coral affinity:
  - Idle behavior near coral
  - Wander if no coral present
- Test schooling and idle behaviors

**Estimated effort:** 4-5 hours

---

### **Phase 6: Visual Polish** (Make it beautiful)
- Entity animations:
  - Fish: Tail wiggle, body undulation
  - Bubbles: Wobble, shine rotation
  - Coral: Gentle sway/pulse
  - Food: Float/bob
- Particle effects:
  - Bubble pop burst
  - Eating sparkle/flash
  - Coral settle impact
- Visual refinements:
  - Color gradients
  - Shadows/glows
  - Layer rendering optimization
- Performance testing and optimization

**Estimated effort:** 3-4 hours

---

### **Total Estimated Time: 17-24 hours**
- Can be built incrementally
- Each phase is independently testable
- Early phases deliver playable prototype

---

## Next Steps

1. **Review & Refine:** User feedback on this design doc
2. **Define Parameters:** Lock in all TBD values (limits, speeds, durations)
3. **Begin Implementation:** Start with Phase 1 (shape recognition)
4. **Iterate:** Build incrementally, test each phase

---

**Ready for your feedback!** What would you like to adjust or clarify?
