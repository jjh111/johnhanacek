# Investigation: Breakout Behavior Inconsistency

## User's Complaint
- "the grabbed molecule breakout needs to be the exact same as if the user pressed the breakout button"
- "some of the text can show following 'string' but some does not"

## Current Behavior

### Button Click Breakout
1. User clicks "Breakout" button
2. Event listener calls `this.syncManager.breakout(viewport)`
3. Then explicitly calls `this.updateUI()`

### Grab Molecule Breakout
1. User grabs molecule (mousedown on canvas)
2. `handleInteractionStart()` is called
3. Interaction callback is invoked
4. `handleViewportInteraction()` checks if state === 'follower'
5. If yes, calls `this.syncManager.breakout(viewport)`
6. `breakout()` calls `notifyStateChange()`
7. `notifyStateChange()` calls stateChangeCallback (which is `updateUI`)

### Expected Result
Both should produce identical behavior because both call the same `breakout()` method.

## Potential Issues

### Issue 1: Follow State Not Cleared
When `setState('independent')` is called, it sets `followTarget = null`.
But what if `followTarget` needs to be cleared differently?

### Issue 2: Conditional Logic in updateUI
Line 125-129 in main.js:
```javascript
} else if (spotlighter && viewport.state === 'follower') {
    wrapper.classList.add('follower');
    overlay.textContent = 'FOLLOWING';
    overlay.classList.add('show');
}
```

This shows "FOLLOWING" text when:
- There IS a spotlighter
- AND viewport.state === 'follower'

If state is not being set to 'independent' properly, this condition remains true.

### Issue 3: Timing
Button click: breakout() -> updateUI()
Grab: breakout() -> notifyStateChange() -> callback -> updateUI()

Is there a timing issue where the UI updates before state is changed?

## Hypothesis

The issue might be that when grabbing the molecule, the state is not being 
set to 'independent' before the UI is updated. Or the interaction is
being detected but the breakout is not being called.

## Next Steps

Add console logging to trace:
1. Is interaction being detected?
2. Is breakout being called?
3. Is state being set?
4. Is UI being updated?
5. What is the actual state when UI is updated?

## Code Coherence Check

The code has two different "FOLLOWING" states:
1. "FOLLOWING A" (when following a specific viewport via circular button)
2. "FOLLOWING" (when following the spotlighter)

Both should clear properly on breakout.
