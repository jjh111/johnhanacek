# Fish Behavior Improvement Plan

## Current Issues Identified

### 1. Small Fish Teleporting
**Location**: Lines 3067-3074

Small fish that get stuck "returning to coral" for >20 seconds teleport directly to coral center:
```javascript
if (f.returningTime > 20000) {
    f.x = homeCoral.x;
    f.y = homeCoral.y - coralH * 0.6;
}
```

**Problem**: Visible, jarring teleport - breaks immersion

### 2. Force Wobble from Conflicting Forces
**Location**: Throughout behavior logic (lines 1500-3300)

Multiple forces independently modify `f.targetHeading`:
- Edge avoidance (anticipatory, reactive, emergency)
- Collision/separation (soft, buffer, emergency)
- Coral attraction/repulsion
- Wake avoidance
- School heading alignment
- Formation slot following
- Wander target steering
- Food seeking

**Problem**: Forces can conflict, causing oscillation and jittery movement. The per-frame cap (0.10 radians) helps but doesn't prevent conflicts from accumulating over frames.

### 3. Large Fish Wobble During Cruise
**Location**: Lines 1862-1920, 2955-2970

Large fish in `largeFishSimpleMode` still experience wobble because:
- Cruise angle changes can conflict with edge avoidance
- Territorial/hunting behaviors interrupt cruise
- Separation forces still apply
- `largeFishSimpleMode` condition is `isLarge && f.state === 'idle'` (line 2389) — renaming to `'cruising'` state requires auditing all state transitions (huntTimer, challengeTimer, cruiseAngle) to ensure correct entry/exit

### 4. Medium Fish School Coordination Issues
**Location**: Lines 2020-2200

Multiple overlapping systems:
- V-formation slot assignment
- Unified school heading
- Leader following
- Soft boids (alignment/cohesion)
- Position correction toward slot

**Problem**: Systems can conflict - fish may turn toward slot that's behind them while trying to follow school heading.

### 5. Heading Commitment Conflicts
**Location**: Lines 2910-2950

The reversal pressure system can fight with:
- Emergency edge avoidance (which sets `f.targetHeading` directly)
- Food seeking bypass
- Fleeing behavior

### 6. Performance: O(n²) Hot Paths (Missed in Original Plan)
**Location**: Lines 1463+, 1114-1167, 1490-1500

Multiple O(n²) and O(n×m) loops run every frame with no caching:

- **Main fish loop** iterates all fish against all other fish (collision, separation, boids)
- **`getWakeAvoidance()`** calls `allFish.forEach()` internally — making it O(n×m) where m = large fish count — and is not throttled
- **Food loop** (line 1490): every fish scans every food item every frame, calling `isFoodInBubble()` which itself iterates all bubbles → O(fish × food × bubbles)

### 7. Per-Frame Allocations Causing GC Pressure (Missed in Original Plan)
**Location**: Lines 2396, 2440

- `getPerceptionRanges(f.bodyWidth)` (line 2396) is called per-fish per-frame inside the hot loop, allocating a new object each time. Since `bodyWidth` never changes after spawn, this can be cached on the fish object at creation.
- `f.debugCollisions = []` (line 2440): the guard only prevents re-creation but the array is pushed to every frame, causing allocations. Should be cleared at frame start instead.

### 8. Hardcoded 16ms Timer Decrements (Missed in Original Plan)
**Location**: Lines 1526, 1534-1536

```javascript
f.stateChangeCooldown = Math.max(0, (f.stateChangeCooldown || 0) - 16);
f.huntTimer = Math.max(0, (f.huntTimer || 0) - 16);
f.fleeTimer = Math.max(0, (f.fleeTimer || 0) - 16);
f.challengeTimer = Math.max(0, (f.challengeTimer || 0) - 16);
```

Assumes exactly 60fps. On slower devices timers run in "fast-forward" relative to real time, causing behaviors to expire too quickly. Should use `deltaTime` from `Date.now()` diff between frames (already available via `const now = Date.now()` at line 1056).

---

## Proposed Improvements

### Phase 1: Eliminate Teleporting (Small Fish)

**Current**: Hard teleport after 20s stuck time

**Proposed**: Gradual "rescue" with strong steering toward coral

```javascript
if (f.returningTime > 15000) { // Earlier trigger
    // Rescue mode: strong pull toward coral
    const rescueX = homeCoral.x;
    const rescueY = homeCoral.y - coralH * 0.5;
    const toCoralAngle = Math.atan2(rescueY - f.y, rescueX - f.x);

    // Override all other forces
    f.targetHeading = toCoralAngle;
    f.committedHeading = toCoralAngle;
    f.heading = toCoralAngle; // Direct heading snap for rescue
    f.reversalPressure = 0;

    // Add strong velocity toward coral
    const rescueSpeed = 2.5;
    f.vx = Math.cos(toCoralAngle) * rescueSpeed;
    f.vy = Math.sin(toCoralAngle) * rescueSpeed;

    // Still check for completion
    if (distToCoral < 30) {
        f.isReturningToCoral = false;
        f.returningTime = 0;
    }
}
```

**Benefits**: No visible teleport, fish smoothly accelerates toward coral

### Phase 2: Force Priority System

**Current**: All forces modify `targetHeading` equally, then cap at 0.10 radians/frame

**Proposed**: Tiered force priority with clear escalation

```
Priority 1 (Emergency): Edge emergency, collision emergency
    → Direct heading assignment allowed, bypasses smoothing

Priority 2 (Reactive): Edge buffer, collision buffer, flee/hide
    → Strong steering force (0.08-0.12)
    → Accumulates into targetHeading

Priority 3 (Anticipatory): Edge anticipate, wake avoidance, coral zone
    → Moderate steering force (0.03-0.06)
    → Accumulates into targetHeading

Priority 4 (Behavioral): Wander, formation, school heading
    → Light steering force (0.01-0.03)
    → Accumulates into targetHeading

Priority 5 (Ambient): Alignment, cohesion
    → Very light steering force (0.005-0.015)
    → Accumulates into targetHeading
```

**Implementation**: Track which priority level is active and scale lower priorities down:

```javascript
let activePriority = 5; // Start at lowest

// During force accumulation:
if (emergencyEdgeTriggered) {
    activePriority = 1;
} else if (collisionEmergency || fleeing) {
    activePriority = 2;
} else if (edgeBuffer || collisionBuffer) {
    activePriority = 3;
} else if (nearCoral || wakeAvoidance) {
    activePriority = 4;
}

// Apply force with priority scaling
function addForce(angle, strength, priority) {
    const scale = priority < activePriority ? 1 : (priority === activePriority ? 0.6 : 0.2);
    forceAccumulator.x += Math.cos(angle) * strength * scale;
    forceAccumulator.y += Math.sin(angle) * strength * scale;
    activePriority = Math.min(activePriority, priority);
}
```

### Phase 3: Large Fish Cruise Stabilization

**Current**: Large fish in simple mode still get separation forces and territorial behaviors

**Proposed**: Cleaner state machine for large fish

```javascript
// Large fish states: 'cruising', 'hunting', 'challenging', 'retreating'
// During 'cruising':
// - Skip ALL separation forces (they're solitary)
// - Skip ALL boids forces
// - Only apply: edge avoidance, coral avoidance, cruise steering
// - Transition to hunting/challenging only on explicit triggers

if (isLarge && f.state === 'cruising') {
    largeFishSimpleMode = true;
}
```

**Additional**: Add cruise angle "hysteresis" to prevent rapid changes:

```javascript
// Only change cruise angle after being near edge for multiple frames
if (nearEdge && !f.edgeHysteresisTimer) {
    f.edgeHysteresisTimer = 30; // Must be near edge for 500ms
}
if (f.edgeHysteresisTimer > 0) {
    f.edgeHysteresisTimer--;
    if (f.edgeHysteresisTimer === 0 && stillNearEdge) {
        // Now change cruise angle
        f.cruiseAngle = calculateNewCruiseAngle();
    }
}
```

**⚠️ Caution**: Renaming `'idle'` → `'cruising'` for large fish requires a full state transition audit:
- Verify `huntTimer`, `challengeTimer`, and `cruiseAngle` all initialize and reset correctly on state entry/exit
- Ensure debug visualization references are updated
- Ensure the `stateChangeCooldown` logic correctly gates transitions into and out of `'cruising'`

### Phase 4: Medium Fish School Simplification

**Current**: Formation slots + school heading + leader following + boids

**Proposed**: Simplified unified system

```javascript
// Primary: Follow school heading (direction school is moving)
// Secondary: Maintain formation slot (position relative to school center)
// Tertiary: Soft separation (prevent bunching)

// REMOVE: Independent alignment/cohesion boids (redundant with school heading)
// REMOVE: Leader following (already covered by school heading)

// Formation slot should be "soft" - fish don't rigidly occupy slots
// Instead, they drift toward their slot while following school heading

const slotAngle = Math.atan2(myTargetY - f.y, myTargetX - f.x);
const slotAngleDiff = Math.abs(angleDiff(slotAngle, schoolHeading));

// If slot is more than 90 degrees from school heading, ignore it this frame
// Fish will naturally loop back around
if (slotAngleDiff < Math.PI * 0.5) {
    f.targetHeading += angleDiff(slotAngle, f.targetHeading) * 0.008; // Very gentle
}

// School heading is primary
f.targetHeading += angleDiff(schoolHeading, f.targetHeading) * 0.03;
```

### Phase 5: Heading Commitment Hardening

**Current**: Reversal pressure builds up but can conflict with emergency behaviors

**Proposed**: Explicit state-aware commitment

```javascript
// Track whether we're in a "committed" state that should resist reversal
const committedStates = ['cruising', 'seeking', 'hunting', 'challenging'];
const emergencyStates = ['fleeing', 'retreating', 'hiding'];

if (emergencyStates.includes(f.state)) {
    // No commitment needed - allow instant turns
    f.reversalPressure = 0;
    f.headingCommitmentStrength = 0;
} else if (committedStates.includes(f.state)) {
    // Strong commitment - resist reversals
    f.headingCommitmentStrength = 0.8;
} else {
    // Idle - moderate commitment
    f.headingCommitmentStrength = 0.4;
}

// Apply commitment with state-aware strength
if (Math.abs(rawTargetDelta) > Math.PI * 0.5 && f.headingCommitmentStrength > 0) {
    // Build reversal pressure scaled by commitment strength
    f.reversalPressure += Math.abs(rawTargetDelta) * 0.02 * f.headingCommitmentStrength;

    // Require more pressure for high-commitment states
    const threshold = 0.5 / f.headingCommitmentStrength;
    if (f.reversalPressure > threshold) {
        f.committedHeading = f.targetHeading;
        f.reversalPressure = 0;
    }
}
```

### Phase 6: Position Smoothing Hardening

**Current**: Velocity smoothing at 95% old / 5% new for idle, 70/30 for fleeing

**Proposed**: Add "intended position" tracking as backup safety

```javascript
// Track intended position (where fish wants to be)
if (f.intendedX === undefined) {
    f.intendedX = f.x;
    f.intendedY = f.y;
}

// Update intended position based on heading
f.intendedX += Math.cos(f.heading) * speed;
f.intendedY += Math.sin(f.heading) * speed;

// Actual position smoothly follows intended
const positionSmoothing = 0.15; // Higher = more lag but smoother
f.x += (f.intendedX - f.x) * positionSmoothing;
f.y += (f.intendedY - f.y) * positionSmoothing;
```

**Note**: Optional - adds overhead but provides another layer of smoothness.

### Phase 7: Quick-Win Performance Optimizations (Low Effort, Do First)

These are independent of behavior changes and can be done at any time without risk of breaking behavior:

1. **Cache `getPerceptionRanges()` on fish at spawn** (line 2396):
   - `bodyWidth` never changes after spawn, so the returned object is constant
   - Store as `f.percRanges` when fish is created, read it in the loop
   - Eliminates one function call + object allocation per fish per frame

2. **Pre-filter large fish array before the main loop**:
   - Build `const largeFish = fish.filter(f => (f.bodyWidth||20) >= MEDIUM_THRESHOLD)` once before `fish.forEach()`
   - Pass to `getWakeAvoidance()` instead of `allFish` — eliminates repeated size checks inside the hot path

3. **Throttle `getWakeAvoidance()` every 3-5 frames**:
   - Wake avoidance doesn't need to update every frame
   - Cache result on each fish: `f.cachedWakeForce`, recompute every N frames
   - Reduces O(n×m) wake calculation to O(n×m / N)

4. **`isFoodInBubble` dirty flag**:
   - Currently called per-fish per-food-item per-frame (O(fish × food × bubbles))
   - Add a boolean `fd.inBubble` on each food item, updated only when bubbles move/spawn
   - Reduces to O(1) per food item in the hot path

5. **Food sort guard**:
   - Skip the distance-sort of food array if `food.length <= 3` (all items will be used anyway)
   - Trivial one-liner guard before the sort

6. **`f.debugCollisions` GC fix** (line 2440):
   - Change `if (!f.debugCollisions) f.debugCollisions = [];` to clear at frame start
   - Or set `f.debugCollisions.length = 0` to reuse the existing array without allocation

### Phase 8: Delta-Time Timer Correctness

**Current**: All state timers decrement by hardcoded `16` per frame (assumes 60fps)

**Proposed**: Use actual elapsed time

```javascript
// At top of drawFishEntities(), compute deltaTime:
const deltaTime = Math.min(now - (lastFrameTime || now), 50); // cap at 50ms
lastFrameTime = now;

// Replace all hardcoded - 16 with - deltaTime:
f.stateChangeCooldown = Math.max(0, (f.stateChangeCooldown || 0) - deltaTime);
f.huntTimer = Math.max(0, (f.huntTimer || 0) - deltaTime);
f.fleeTimer = Math.max(0, (f.fleeTimer || 0) - deltaTime);
f.challengeTimer = Math.max(0, (f.challengeTimer || 0) - deltaTime);
f.returningTime = (f.returningTime || 0) + deltaTime; // line 3062 also
```

**Benefits**: Behaviors expire at correct real-world durations on all devices

### Phase 9: Performance (Future / High Effort)

1. **Spatial Hashing** for collision detection:
   - Divide canvas into 100px grid cells
   - Only check fish in same/adjacent cells
   - Reduces O(n²) to O(n) average case
   - Implement only if fish count grows or FPS drops measurably

2. **Force Caching**:
   - Cache collision/separation forces for 2-3 frames
   - Only recalculate for fish that moved significantly

3. **Adaptive Quality / Frame Budget Monitor**:
   - Measure frame time; if >16ms, automatically: skip wake avoidance for distant fish, increase school spread throttle interval, reduce `MAX_INTERACT_DIST`
   - Gracefully maintains 60fps under load

4. **Lazy Edge Avoidance**:
   - Only calculate anticipatory edge avoidance for fish moving toward edges
   - Skip if heading is away from edge

---

## Implementation Priority

| Phase | Impact | Effort | Priority |
|-------|--------|--------|----------|
| 1: Eliminate Teleporting | High | Low | **Immediate** |
| 7: Quick-Win Perf (cache percRanges, pre-filter large fish, throttle wake) | Medium | Low | **Do alongside Phase 1** |
| 2: Force Priority System | High | Medium | **High** |
| 3: Large Fish Cruise | Medium | Medium | **Medium** (requires state audit) |
| 4: Medium Fish School | Medium | Medium | **Medium** |
| 8: Delta-Time Timers | Medium (correctness) | Low | **Medium** |
| 5: Heading Commitment | Low | Low | Low |
| 6: Position Smoothing | Low | Medium | Low |
| 9: Spatial Hashing / Adaptive Quality | Low-Medium | High | Future |

---

## Specific Code Changes

### Change 1: Replace Teleport with Rescue Mode

**File**: `index.html`
**Lines**: 3067-3074

Replace the hard teleport with rescue mode that gives strong steering toward coral.

### Change 2: Add Force Priority Tracking

**File**: `index.html`
**After line**: ~2760 (after edge avoidance variables)

Add force priority tracking variables and helper function.

### Change 3: Large Fish True Simple Mode

**File**: `index.html`
**Lines**: ~2388-2390

Change large fish simple mode condition to use `'cruising'` state. Audit all large fish state transitions before changing.

### Change 4: Medium Fish Slot Ignore When Behind

**File**: `index.html`
**Lines**: ~2095-2105

Add check to ignore formation slot when it's behind the fish relative to school heading.

### Change 5: Cache Perception Ranges on Fish Spawn

**File**: `index.html`
**Location**: Fish spawn/creation code

Add `f.percRanges = getPerceptionRanges(f.bodyWidth)` at spawn. Replace `getPerceptionRanges(f.bodyWidth || 20)` call at line 2396 with `f.percRanges`.

### Change 6: Pre-Filter Large Fish Before Main Loop

**File**: `index.html`
**Before line**: ~1463 (start of `fish.forEach`)

Add `const largeFishList = fish.filter(f => (f.bodyWidth||20) >= MEDIUM_THRESHOLD);` and pass to `getWakeAvoidance()`.

### Change 7: Throttle Wake Avoidance

**File**: `index.html`
**Location**: `getWakeAvoidance()` call site and function

Cache result as `f.cachedWakeForce`, recompute every 4 frames using a frame counter.

### Change 8: Fix isFoodInBubble Per-Frame Cost

**File**: `index.html`
**Location**: Bubble update loop + food loop (line 1491)

Add `fd.inBubble` dirty flag updated when bubbles change. Read flag in the fish food-scan loop.

### Change 9: Delta-Time Timers

**File**: `index.html`
**Lines**: 1526, 1534-1536, 3062

Replace hardcoded `- 16` / `+ 16` with `- deltaTime` / `+ deltaTime`. Add `deltaTime` calculation at top of `drawFishEntities()`.

---

## Testing Checklist

- [ ] Small fish no longer teleport visibly
- [ ] Small fish successfully return to coral within reasonable time
- [ ] Large fish cruise smoothly without jitter
- [ ] Large fish state transitions (cruising ↔ hunting ↔ challenging ↔ retreating) work correctly
- [ ] Medium fish school moves cohesively without oscillation
- [ ] Edge avoidance works without conflicting with coral homing
- [ ] Fleeing behavior still responsive and fast
- [ ] Food seeking still works without overshooting
- [ ] Collision avoidance prevents fish from overlapping
- [ ] Performance remains at 60fps with typical fish count
- [ ] State timers expire at correct real-world durations (test on throttled CPU)
- [ ] Debug mode (press 'D') still shows correct visualization after changes

---

## Open Questions

1. **Teleport replacement**: Should rescue mode give direct heading snap (fast but visible turn) or use interpolation (smooth but slower)?
   - Recommendation: Direct snap - faster rescue is better than smooth but slow

2. **Force priority scaling**: Should lower-priority forces be reduced to 20%, 30%, or 50% when higher priority is active?
   - Recommendation: Start with 20%, tune if behavior feels too rigid

3. **Large fish states**: Should we explicitly use 'cruising' state, or keep 'idle' with behavior flag?
   - Recommendation: Use 'cruising' state for clarity — but do the state transition audit first

4. **Performance tradeoffs**: Is spatial hashing worth implementing now, or save for later if FPS drops?
   - Recommendation: Save for later - current performance is acceptable. Do Phase 7 quick-wins first.

5. **Delta-time cap**: What's the right max cap for deltaTime to prevent huge jumps after tab switch?
   - Recommendation: 50ms cap (3 missed frames at 60fps) — fish freeze briefly rather than teleporting
