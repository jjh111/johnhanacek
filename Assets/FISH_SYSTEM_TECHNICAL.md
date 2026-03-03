# Fish Minigame Technical Reference

**Project:** Interactive aquatic canvas minigame for index.html hero section
**Status:** Implemented - Tuning Phase
**Last Updated:** 2026-02-10

---

## System Architecture Overview

The fish minigame uses a **layered behavior system** where multiple steering forces combine to determine fish movement. Understanding how these systems interact is crucial for tuning.

### Behavior Priority Stack (High to Low)

1. **Emergency Edge Avoidance** - Instant heading override at hard boundaries
2. **Anticipatory Edge Avoidance** - Predictive steering before hitting edges
3. **Reactive Edge Avoidance** - Steering when in buffer zones
4. **Heading Commitment** - Resistance to rapid direction reversals
5. **State Behaviors** - Fleeing, hunting, challenging, seeking food
6. **Collision Avoidance** - Directional push to prevent overlap
7. **Formation/Schooling** - Position-based steering for medium fish
8. **Wander/Cruise** - Idle movement patterns

---

## Fish Size Categories

```javascript
const SMALL_THRESHOLD = 35;   // bodyWidth < 35 = small
const MEDIUM_THRESHOLD = 60;  // 35 <= bodyWidth < 60 = medium
// bodyWidth >= 60 = large
```

### Small Fish Behavior
- **Home:** Coral structures (stay deep in stalks)
- **Wander:** 75% deep coral, 20% edge/top, 5% explore other coral
- **Flee:** Run to nearest coral when predator detected
- **Behavior Lock:** 2.5-6 seconds to prevent oscillation

### Medium Fish Behavior
- **Schooling:** V-formation with stable slots
- **Formation Slots:** Leader, left wing, right wing, back positions
- **Shared Target:** All steer toward school target
- **Speed Adjustment:** Faster when catching up, slower in position

### Large Fish Behavior
- **Solitary:** No schooling, territorial
- **Cruise:** Straight-line swimming, direction changes every 8-12 seconds
- **Territorial:** Challenge rivals, retreat from dominant fish
- **Hunting:** Pursue small fish when detected

---

## Steering Systems

### 1. Anticipatory Edge Avoidance

Predicts future position and starts turning before hitting edges.

```javascript
// Key Parameters
const LOOKAHEAD_FRAMES = 60;   // How far ahead to predict
const ANTICIPATE_ZONE = 180;   // Start anticipating this far from edge
const BUFFER_ZONE = 100;       // Reactive steering zone
const HARD_EDGE = 30;          // Emergency zone - instant turn
const EMERGENCY_EDGE = 15;     // Physical boundary - teleport back
```

**Tuning Notes:**
- Increase `LOOKAHEAD_FRAMES` for earlier, gentler turns
- Decrease `ANTICIPATE_ZONE` if fish avoid edges too aggressively
- `HARD_EDGE` should trigger instant heading override

### 2. Heading Commitment System

Prevents rapid 180-degree flips by requiring sustained pressure.

```javascript
// Key Parameters
const REVERSAL_THRESHOLD = Math.PI * 0.5;  // 90 degrees
const PRESSURE_BUILD_RATE = 0.02;          // Per frame
const PRESSURE_RELEASE_RATE = 0.05;        // Per frame when not reversing
const FLIP_THRESHOLD = 0.5;                // ~0.5 seconds to flip
```

**How it works:**
1. If target heading differs by >90 degrees, build reversal pressure
2. When pressure exceeds threshold, allow the flip
3. Otherwise, steer perpendicular (curve around)

**Tuning Notes:**
- Higher `FLIP_THRESHOLD` = more resistance to turns
- Lower = more responsive but potentially jerky

### 3. Collision System

Directional push that slides fish past each other.

```javascript
// Key Parameters
const COLLISION_BUFFER = 1.3;     // 30% larger than visual body
const COMFORT_ZONE = 1.6;         // Start steering away
const PUSH_STRENGTH = 0.15-0.3;   // Based on overlap
const SLIDE_RATIO = 0.7;          // Perpendicular vs direct push
```

**How it works:**
1. Calculate perpendicular direction to fish heading
2. Determine which side other fish is on
3. Push mostly perpendicular (slide past) + some direct push
4. This reduces spinning compared to direct separation

### 4. Formation System (Medium Fish)

V-shape formation with stable slot assignments.

```javascript
const formationOffsets = [
    { x: 0, y: 0 },       // Leader (slot 0)
    { x: -30, y: 25 },    // Left wing 1
    { x: -30, y: -25 },   // Right wing 1
    { x: -55, y: 45 },    // Left wing 2
    { x: -55, y: -45 },   // Right wing 2
    { x: -80, y: 20 },    // Back left
    { x: -80, y: -20 },   // Back right
    { x: -100, y: 0 },    // Tail
];
```

**Tuning Notes:**
- Offsets rotate with school heading
- Fish speed varies: 0.8x when in position, 1.2x when catching up
- Reduce offset distances for tighter formation

### 5. Behavior Locking (Small Fish)

Prevents oscillation by committing to behaviors.

```javascript
// Lock Durations (milliseconds)
const CORAL_DEEP_LOCK = 3000-5000;
const CORAL_EDGE_LOCK = 2500-4000;
const EXPLORING_LOCK = 5000-8000;
const RETURNING_LOCK = 4000-6000;
```

**Key Rule:** If fish is OUTSIDE coral zone, it MUST return (no exploring option).

---

## State Machine

### Fish States
- `idle` - Default wandering/cruising
- `seeking` - Moving toward food
- `fleeing` - Escaping predator
- `retreating` - Large fish yielding to dominant rival
- `hunting` - Large fish pursuing prey
- `challenging` - Large fish advancing on rival

### State Transitions
```
idle -> seeking (food detected)
idle -> fleeing (predator detected, small/medium fish)
idle -> hunting (prey detected, large fish)
idle -> challenging (rival detected, dominant large fish)
idle -> retreating (rival detected, submissive large fish)

seeking -> idle (food eaten or gone)
fleeing -> idle (timer expires)
hunting -> idle (prey eaten or lost)
challenging -> idle (timer expires or rival retreats)
retreating -> idle (timer expires)
```

---

## Speed Parameters

```javascript
const IDLE_SPEED = 0.6;
const SEEK_SPEED = 1.2;
const FLEE_SPEED = 2.0;

// State-based multipliers
fleeing/retreating: FLEE_SPEED
hunting: SEEK_SPEED * 1.3
challenging: SEEK_SPEED * 1.5
seeking: SEEK_SPEED
large cruising: IDLE_SPEED * 1.8
medium in formation: IDLE_SPEED * 0.8-1.2
```

---

## Turn Rate Parameters

```javascript
const TURN_RATE = 0.08;           // How fast heading approaches target
const MAX_TURN_PER_FRAME = 0.08;  // Cap on turn speed per frame
```

**Tuning for smoother turns:**
- Lower `TURN_RATE` = slower, smoother turns
- Lower `MAX_TURN_PER_FRAME` = prevents jerky motion
- Both should be similar values for consistent behavior

---

## Debug Visualization Legend

When debug mode is enabled:

| Visual | Meaning |
|--------|---------|
| Yellow dotted line | Predicted future position (look-ahead) |
| Red arrow | Emergency edge avoidance active |
| Orange arrow | Anticipating edge collision |
| Red-orange arrow | Reactive edge avoidance |
| Orange bar | Reversal pressure meter |
| Cyan numbered circles | Formation slot positions |
| Green label | Small fish in coral (coral_deep) |
| Yellow label | Small fish at edge (coral_edge) |
| Purple label | Small fish exploring |
| Red label | Small fish returning |
| Pink lines | Active collision with overlap amount |
| Green dashed arrow | Committed heading |
| Yellow rectangle | Anticipation zone (180px) |
| Orange rectangle | Buffer zone (100px) |
| Red rectangle | Hard edge (30px) |
| Cyan crosshair | School target for medium fish |

---

## Common Issues & Fixes

### Fish Spinning in Place
**Cause:** Competing steering forces causing oscillation
**Fixes:**
1. Increase heading commitment threshold
2. Reduce separation force strength
3. Check for conflicting wander/edge steering

### Fish Stuck at Edges
**Cause:** Cruise angle pointing at edge, fighting avoidance
**Fixes:**
1. Ensure anticipatory steering triggers before buffer zone
2. Reset cruise angle when edge avoidance activates
3. Check HARD_EDGE instant turn is working

### School Fish Bumping
**Cause:** Formation offsets too close, collision forces too strong
**Fixes:**
1. Increase formation slot spacing
2. Reduce collision push strength for same-size fish
3. Increase comfort zone for schooling fish

### Small Fish Oscillating
**Cause:** Behavior switching too fast
**Fixes:**
1. Increase behavior lock timers
2. Check position-aware behavior selection
3. Ensure "returning" behavior locks until actually in coral

### Abrupt 180 Turns
**Cause:** Target heading flipping rapidly
**Fixes:**
1. Increase reversal pressure threshold
2. Lower pressure build rate
3. Check for conflicting steering sources

---

## Parameter Tuning Guidelines

### Current Production Values (Balanced)
```javascript
TURN_RATE = 0.06;              // Moderate turning speed
MAX_TURN_PER_FRAME = 0.06;     // Smooth motion cap
REVERSAL_THRESHOLD = 0.5;      // ~0.5s to allow 180° flip
PUSH_STRENGTH = 0.1-0.25;      // School=0.1, others=0.25
```

### For Calmer Behavior
```javascript
TURN_RATE = 0.04;              // Slower turns
MAX_TURN_PER_FRAME = 0.04;     // Smoother motion
REVERSAL_THRESHOLD = 0.8;      // More turn resistance
PUSH_STRENGTH = 0.08-0.15;     // Gentler collisions
```

### For More Active Behavior
```javascript
TURN_RATE = 0.08;
MAX_TURN_PER_FRAME = 0.08;
REVERSAL_THRESHOLD = 0.3;
PUSH_STRENGTH = 0.2-0.35;
```

### Formation Slot Distances (Current)
```javascript
formationOffsets = [
    { x: 0, y: 0 },           // Leader
    { x: -45, y: 35 },        // Left wing 1
    { x: -45, y: -35 },       // Right wing 1
    { x: -85, y: 60 },        // Left wing 2
    { x: -85, y: -60 },       // Right wing 2
    { x: -120, y: 30 },       // Back left
    { x: -120, y: -30 },      // Back right
    { x: -150, y: 0 },        // Tail
];
```

---

## Hardening & Edge Case Handling

### Spawn Validation
- Fish spawn positions are clamped to safe zone (80px from edges)
- Large fish are pushed to upper area on spawn
- Initial heading is adjusted to point away from nearest edge

### Stuck Detection & Recovery
- Fish spinning for >1.2 seconds get nudged:
  - Small fish: toward nearest coral
  - Medium/Large: toward center
- Heading commitment and reversal pressure are reset on nudge

### Returning Timeout
- Small fish stuck returning to coral for >10 seconds get teleported
- Teleport destination: just above home coral
- `isReturningToCoral` flag cleared on arrival

### Bottom Edge Exception
- Small fish with `isReturningToCoral = true` get reduced bottom edge avoidance
- Multiplier: 0.3x (70% weaker push) at bottom
- Hard edge zone becomes soft for returning fish

### School Collision Gentling
- Medium fish in same school use 40% weaker collision push
- Heading nudge reduced from 0.05 to 0.02 for school fish
- Wider formation slots (50% larger spacing)

---

## File Locations

- **Main Code:** `/index.html` lines ~1000-2200 (fish behavior)
- **Debug Viz:** `/index.html` lines ~3065-3450
- **Design Doc:** `/Assets/FISH_MINIGAME_DESIGN.md`
- **Technical Ref:** `/Assets/FISH_SYSTEM_TECHNICAL.md` (this file)
