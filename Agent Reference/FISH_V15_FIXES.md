# Fish System V1.5 — Remaining Behavior Fixes
*Status: Planned | Priority: 6 | Independent of search features*

## Context
Three remaining behavior issues in the index.html fish ecosystem after the V1.0 fixes were applied.

## Fix A: Loop Recognition — Handle Fast Drawing

**Problem:** Fast drawing captures fewer points. The intersection check's `step * 4` gap requirement leaves too few valid pairs for short strokes.

**Solution:**
- Lower minimum from 15 to 10 points
- Exhaustive scan (step=1) for strokes under 80 points — cheap O(n²) at 80²=6400 ops
- Fix short tail fallback: if `points.slice(loopEnd)` has <3 points, infer tail from last loop points reversed

**Lines:** 921, 923, ~1200

## Fix B: Large Fish Mutual Challenge Standoff

**Problem:** Both large fish enter `challenging` simultaneously, both see `rivalIsChallengingMe`, both retreat — permanent standoff.

**Solution — dominance-aware retreat:**
```js
const rivalIsTrulyDominant = rivalIsChallengingMe && (rival.dominance || 0) > (f.dominance || 0);
const rivalTiebreakWins = rivalIsChallengingMe && rival.dominance === f.dominance && rival.id > f.id;
if ((rivalIsTrulyDominant || rivalTiebreakWins) && f.state !== 'retreating') { ... }
```
Less-dominant backs down; ties broken by ID. Also: challenge timer expiry → fish goes idle.

**Lines:** 2289-2291, after 2185

## Fix C: Medium Fish + Large Coral Avoidance

**Problem:** `OUTER_BUFFER=80` and `INNER_BUFFER=35` are constants regardless of coral size. Large coral overwhelms the fixed buffer.

**Solution — scale buffers by coral dimensions:**
```js
const coralMaxDim = Math.max(coralW, coralH);
const OUTER_BUFFER = Math.max(80, coralMaxDim * 0.5);
const INNER_BUFFER = Math.max(35, coralMaxDim * 0.25);
```
Also scale school waypoint push and deflect patrol waypoints around large coral.

**Lines:** 3261-3262, ~1597-1609, ~1590

## File to Modify
- `index.html` only

## Verification
1. Quick loop drawing (2-3 sec) → fish spawns reliably
2. Two large fish facing each other → dominant advances, other retreats
3. Equal dominance → tie-break by ID
4. Expired challenge timer → fish goes idle
5. Large coral → medium school orbits around it
6. Coral in patrol path → school deflects target
