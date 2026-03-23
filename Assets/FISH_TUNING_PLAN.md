# Fish Minigame Tuning Plan

**Created:** 2026-02-11
**Status:** All Phases Implemented - Testing Phase
**Goal:** Eliminate jitter, teleporting, conflicts, and stuck loops. Create calm, coherent, soothing fish behavior.

---

## Problem Summary (Updated)

Based on observation and testing:

1. ✅ **Small fish snap directions** - Fixed: Edge multipliers for coral at edges
2. 🔄 **Medium fish spin independently** - Partially fixed: Need intelligent waypoint
3. ✅ **Food causes chaos** - Fixed: Smooth blend toward food
4. 🔄 **Large fish deadlock** - Partially fixed: Asymmetry logic added, but fish still congregate
5. ✅ **Fleeing is "dumb"** - Fixed: Goal completion added (reach coral/distance)
6. ✅ **Too much randomness** - Fixed: Removed runtime randomness
7. ✅ **Collision causes teleporting** - Fixed: Steering only, position cap added
8. ✅ **Behaviors lack completion** - Fixed: Goal-based completion

### New Issues Observed

9. **Large fish snap turns** - Fixed 2026-02-11: Cruise angle was resetting mid-turn
10. **School lacks intelligence** - Waypoint doesn't respond to environment (threats, food)
11. **Fish congregate in middle** - No zone preferences, no separation force
12. **Challenge triggers constantly** - Large fish re-trigger each other in close proximity

---

## Implementation Status

### ✅ Phase 1: Remove Runtime Randomness (COMPLETE)
- Removed random offsets from flee, seek, wander headings
- Kept randomness only for spawn and timers

### ✅ Phase 2: Challenge Asymmetry (COMPLETE)
- Added dominance comparison
- Rival already challenging → I must retreat
- Cooldown between challenges

### ✅ Phase 3: Collision as Steering (COMPLETE)
- Removed direct position modification
- Added heading-based avoidance
- Added position change cap (3px/frame)

### ✅ Phase 4: Coral/Edge Conflict (COMPLETE)
- Edge multipliers disable avoidance when coral is at edge
- Small fish can reach coral at screen boundaries

### 🔄 Phase 5: School Coordination (NEEDS IMPROVEMENT)
- Unified schoolHeading implemented
- **Missing:** Intelligent waypoint that responds to threats/food

### ✅ Phase 6: Food Seeking Smoothness (COMPLETE)
- Blend toward food instead of snap
- Unreachable food detection (behind mouth)
- Slowdown when close

### ✅ Phase 7: Behavior Completion (COMPLETE)
- Fleeing ends when reaching coral (small) or safe distance (medium)
- Hiding state added for small fish
- Retreating ends when distance achieved

### ✅ Phase 8: Global Smoothing (COMPLETE)
- Velocity smoothing (92% old + 8% new)
- Heading change cap
- Position change cap

### ✅ Phase 9: Snap Turn Fix (COMPLETE - 2026-02-11)
**Problem:** Large fish cruise angle reset mid-turn, causing instant direction snap.

**Fix Applied:**
```javascript
// Only pick new direction when turn is COMPLETE (prevents snap)
const turnComplete = Math.abs(angleDiff(f.cruiseAngle, f.heading)) < Math.PI / 6;

if ((f.cruiseTimer <= 0 && turnComplete) || edgeEmergency) {
    // Pick new cruise angle
    // In middle: continue similar direction instead of fish ID alternation
    const currentDir = Math.cos(f.heading) > 0 ? 0 : Math.PI;
    baseAngle = currentDir;
}
```

---

## Phase 10: Intelligent School Waypoint (TODO)

**Problem:** School waypoint is a fixed patrol pattern. It should respond to:
1. **Priority 1:** Flee from large fish (threats)
2. **Priority 2:** Move toward nearest food cluster
3. **Priority 3:** Patrol smoothly when idle

**Changes:**

```javascript
// In school waypoint calculation:
function updateSchoolTarget() {
    const w = canvas.width, h = canvas.height;
    const schoolCenter = getSchoolCenter();  // Average position of medium fish

    // Priority 1: Check for nearby large fish (threats)
    let threat = null;
    let threatDist = Infinity;
    const THREAT_RANGE = 300;

    fish.forEach(f => {
        const bw = f.bodyWidth || 20;
        if (bw < MEDIUM_THRESHOLD) return;  // Only large fish are threats
        if (bw < 60) return;  // Must be actually large

        const dx = f.x - schoolCenter.x;
        const dy = f.y - schoolCenter.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < THREAT_RANGE && d < threatDist) {
            threat = f;
            threatDist = d;
        }
    });

    if (threat) {
        // Flee AWAY from threat
        const fleeAngle = Math.atan2(schoolCenter.y - threat.y, schoolCenter.x - threat.x);
        const fleeDist = 200;  // How far to flee
        this.schoolTarget = {
            x: schoolCenter.x + Math.cos(fleeAngle) * fleeDist,
            y: schoolCenter.y + Math.sin(fleeAngle) * fleeDist
        };
        // Clamp to safe zones
        this.schoolTarget.x = Math.max(100, Math.min(w - 100, this.schoolTarget.x));
        this.schoolTarget.y = Math.max(100, Math.min(h * 0.6, this.schoolTarget.y));
        return;
    }

    // Priority 2: Check for nearby food cluster
    if (food.length > 0) {
        // Find food cluster center (average of up to 3 nearest foods)
        const sortedFood = food.slice().sort((a, b) => {
            const da = Math.sqrt((a.x - schoolCenter.x)**2 + (a.y - schoolCenter.y)**2);
            const db = Math.sqrt((b.x - schoolCenter.x)**2 + (b.y - schoolCenter.y)**2);
            return da - db;
        });

        const nearestFoods = sortedFood.slice(0, 3);
        const foodClusterX = nearestFoods.reduce((sum, f) => sum + f.x, 0) / nearestFoods.length;
        const foodClusterY = nearestFoods.reduce((sum, f) => sum + f.y, 0) / nearestFoods.length;

        const foodDist = Math.sqrt((foodClusterX - schoolCenter.x)**2 + (foodClusterY - schoolCenter.y)**2);
        if (foodDist < 400) {  // Food is reasonably close
            this.schoolTarget = { x: foodClusterX, y: foodClusterY };
            return;
        }
    }

    // Priority 3: Smooth patrol in middle zone
    this.schoolPatrolTimer = (this.schoolPatrolTimer || 0) - 16;
    if (this.schoolPatrolTimer <= 0) {
        this.schoolPatrolTimer = 6000;  // Change every 6 seconds
        this.schoolPatrolIndex = ((this.schoolPatrolIndex || 0) + 1) % 4;
    }

    const patrolPoints = [
        { x: w * 0.3, y: h * 0.35 },
        { x: w * 0.7, y: h * 0.35 },
        { x: w * 0.7, y: h * 0.5 },
        { x: w * 0.3, y: h * 0.5 },
    ];
    this.schoolTarget = patrolPoints[this.schoolPatrolIndex];
}
```

**Result:** School moves intelligently - flees threats, seeks food, patrols calmly otherwise.

---

## Phase 11: Zone Preferences + Gentle Separation (TODO)

**Problem:** All fish congregate in center, constantly triggering collisions and state changes.

**Solution:** Give each fish type a preferred zone + add gentle separation force.

```javascript
// Zone preferences
const ZONES = {
    small: { minY: 0.5, maxY: 1.0 },   // Bottom half (near coral)
    medium: { minY: 0.25, maxY: 0.65 }, // Middle band
    large: { minY: 0.1, maxY: 0.5 }     // Upper half
};

// In fish update, add gentle zone bias
const zone = ZONES[size];
const preferredY = h * (zone.minY + zone.maxY) / 2;
const zoneOffset = (preferredY - f.y) * 0.001;  // Very gentle

// Add to targetHeading calculation
if (f.state === 'idle') {
    const zoneAngle = zoneOffset > 0 ? Math.PI / 2 : -Math.PI / 2;
    f.targetHeading += zoneAngle * Math.abs(zoneOffset) * 0.02;
}

// Gentle center repulsion (prevents pile-up)
const centerX = w / 2, centerY = h / 2;
const toCenterX = centerX - f.x;
const toCenterY = centerY - f.y;
const centerDist = Math.sqrt(toCenterX * toCenterX + toCenterY * toCenterY);

// If very close to center, gently push out
if (centerDist < 150 && f.state === 'idle') {
    const pushAngle = Math.atan2(-toCenterY, -toCenterX);  // Away from center
    f.targetHeading += angleDiff(pushAngle, f.heading) * 0.01;
}
```

**Result:** Fish spread out across tank, reduced collision frequency.

---

## Phase 12: Challenge Stabilization (TODO)

**Problem:** Large fish keep re-triggering challenges because they stay near each other.

**Solution:** After challenge/retreat, add "ignore" period and push away.

```javascript
// After retreat completes, add ignore period
if (f.state === 'retreating' && rivalDist > 300) {
    f.state = 'idle';
    f.ignoreRivalId = f.rivalId;
    f.ignoreRivalUntil = now + 10000;  // Ignore for 10 seconds
    f.rivalId = null;
}

// In rival detection, skip ignored fish
if (rival.id === f.ignoreRivalId && now < f.ignoreRivalUntil) {
    continue;  // Skip this rival
}

// Increase territorial range to trigger earlier (gives more time to separate)
const TERRITORY_RANGE = 250;  // Was probably 200

// After challenge resolution, both fish get gentle push AWAY from each other
if (f.state === 'idle' && f.lastChallengeTime && now - f.lastChallengeTime < 3000) {
    // Bias movement away from last rival location
    if (f.lastRivalPos) {
        const awayAngle = Math.atan2(f.y - f.lastRivalPos.y, f.x - f.lastRivalPos.x);
        f.targetHeading += angleDiff(awayAngle, f.heading) * 0.02;
    }
}
```

**Result:** Large fish encounter, resolve, then separate and don't immediately re-engage.

---

## Canvas Considerations (from screenshot)

Based on the screenshot showing the tank:

1. **Coral variety:** Coral can be thin/wide, short/tall, at any edge
2. **Drawing area:** Complex shapes create irregular boundaries
3. **Limits:** May need to cap fish counts to prevent overcrowding
   - Suggested: Max 2 large, max 6 medium, max 8 small
4. **Edge cases:** Coral at corners creates compound edge conflicts

---

## Implementation Order (Updated)

1. ✅ Phases 1, 8 - Foundation (done)
2. ✅ Phase 3 - Collision steering (done)
3. ✅ Phase 2 - Challenge asymmetry (done)
4. ✅ Phases 4, 6, 7 - Small fish, food, completion (done)
5. ✅ Phase 9 - Snap turn fix (done)
6. ✅ Phase 10 - Intelligent school waypoint (done 2026-02-11)
7. ✅ Phase 11 - Zone preferences + separation (done 2026-02-11)
8. ✅ Phase 12 - Challenge stabilization (done 2026-02-11)
9. ✅ Phase 13 - Ultra-smooth turns fix (done 2026-02-11)

**All phases implemented!** Testing needed to verify behavior.

---

## Phase 13: Ultra-Smooth Turns Fix (2026-02-11)

**Problem:** Fish still exhibiting snap turns and oscillation despite earlier fixes.

**Root Causes Identified:**
1. State change oscillation: Fish rapidly toggling idle→fleeing→idle with no cooldown
2. Direct targetHeading assignments instead of blending
3. Turn rates still too high for truly smooth movement
4. Velocity changes too abrupt

**Fixes Applied:**

1. **State Change Cooldowns for All Fish:**
   - Small fish entering flee: 2000ms cooldown
   - Medium fish scattering: 1500ms cooldown
   - Transitioning OUT of fleeing/retreating: 1500ms cooldown
   - Prevents rapid state toggling that caused snap direction changes

2. **Blending Instead of Direct Assignment:**
   - Medium fish coral exit: blend toward exit angle (0.15 strength)
   - Hunting state pursuit: blend toward prey (0.06 strength)
   - Prevents instant heading changes at state transitions

3. **Reduced Turn Rates:**
   - TURN_RATE: 0.06 → 0.04 (~2.3° per frame instead of 3.4°)
   - MAX_TURN_PER_FRAME: 0.06 → 0.04
   - MAX_TARGET_CHANGE: 0.15 → 0.10 (~5.7° instead of 8.5°)

4. **Increased Velocity Smoothing:**
   - Velocity blend: 92%/8% → 95%/5% (ultra-smooth movement)

5. **Removed Duplicate Code:**
   - Removed duplicate `largeFishSimpleMode` definition

**Result:** Fish should turn much more smoothly, with no rapid direction changes.

---

## Phase 14-21: Enhanced Boids System (2026-02-12)

**Goal:** More natural, emergent schooling behavior using improved boids algorithms.

### Phase 14: Size-Based Perception Ranges
- Fish perceive the world proportional to their body size
- `getPerceptionRanges(bodyWidth)` returns separation, alignment, cohesion ranges
- Small(25px): sep=62, align=125, coh=175
- Medium(45px): sep=112, align=225, coh=315
- Large(80px): sep=200, align=400, coh=560

### Phase 15: Cross-Size Awareness
- Smaller fish detect larger fish (predators) from farther away
- `SIZE_AWARENESS.small_sees_large = 2.5` (150% farther)
- `SIZE_AWARENESS.medium_sees_large = 1.8` (80% farther)
- `getAwarenessMultiplier(mySize, otherSize)` helper function

### Phase 16: Large Fish Gentle Collision
- Large fish in "simple mode" now respond to collisions gently (0.005 strength)
- Prevents them from completely ignoring other fish
- Maintains smooth cruising while avoiding overlap

### Phase 17: Soft Boids for Medium Fish
- Medium fish now use gentle alignment/cohesion ON TOP of formation slots
- `medium_soft_align: 0.008` - match school velocity
- `medium_soft_cohesion: 0.006` - drift toward school center when scattered
- Makes school move more fluidly as a group

### Phase 18: School Re-Cohesion System
- Tracks `maxSchoolSpread` (max distance between any two medium fish)
- `SCHOOL_SCATTER_THRESHOLD = 200` - school is "scattered" above this
- When scattered, `schoolTargetReason = 'regrouping'` forces convergence
- Faster blend rate (0.04) when regrouping

### Phase 19: Predator Wake Avoidance
- Fish avoid the predicted PATH of large fish, not just position
- `WAKE_LOOKAHEAD = 80` - project predator path 80px ahead
- `WAKE_WIDTH = 60` - width of avoidance corridor
- Creates natural "parting" effect as predators approach

### Phase 20: Dynamic Leadership (Optional)
- Leader role shifts based on position and heading alignment
- `leadershipScore = distScore * facingScore * 100`
- Non-leaders blend toward leader's heading (0.015 strength)
- Smoother, more organic school movement

### Phase 21: Centralized Force Weights
- `FORCE_WEIGHTS` object for easy tuning of all boid forces
- Includes: alignment, cohesion, separation, collision, wake avoidance
- Single location to adjust behavior intensity

---

## Success Criteria

After implementation, the tank should exhibit:

- [x] Fish turn smoothly, no snapping or jittering
- [x] No teleporting or jumping positions
- [ ] Large fish cruise separately, brief encounters resolve with one retreating
- [ ] Medium fish school moves as cohesive unit, responding to threats/food
- [x] Small fish stay calmly in coral, flee INTO coral when threatened
- [x] Food seeking is smooth approach, no spinning
- [ ] Tank can sit idle for 60+ seconds without chaos erupting
- [x] Spawning new fish doesn't cause existing fish to freak out

---

## Files to Modify

- `/index.html` - Main fish behavior code (lines ~1050-2200)
- `/Assets/FISH_SYSTEM_TECHNICAL.md` - Update after implementation
- `/Assets/FISH_TUNING_PLAN.md` - This file

---

## Reference

- Design doc: `/Assets/FISH_MINIGAME_DESIGN.md`
- Technical ref: `/Assets/FISH_SYSTEM_TECHNICAL.md`
- This plan: `/Assets/FISH_TUNING_PLAN.md`
