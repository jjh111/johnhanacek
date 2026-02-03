# Coherence Check - Grab vs Button Breakout

## Issue Summary

The user reported that grabbed molecule breakout is not the same as button breakout, and that some text shows "FOLLOWING string" while some doesn't.

## Analysis Performed

1. **Code Review**: Examined all state management logic
2. **Event Flow**: Traced both button click and grab interaction flows
3. **State Transitions**: Verified setState() and breakout() methods
4. **UI Updates**: Checked updateUI() conditional logic

## Key Finding

Both methods call the same `breakout(viewport)` function, so they should behave identically.

### Button Click Path:
- Button event listener → breakout(viewport) → setState('independent') → updateUI()

### Grab Molecule Path:
- Canvas mousedown → handleInteractionStart() → interactionCallback → breakout(viewport) → setState('independent') → notifyStateChange() → updateUI()

## Debug Code Added

1. **Console Logging** in:
   - viewport.js: setState() method
   - sync-manager.js: breakout(), handleViewportInteraction()
   - main.js: updateUI()

2. **Debug Helpers** (window.DEBUG):
   - logViewportState(message): Log all viewport states
   - checkConsistency(): Check state consistency

3. **Global App Access**: window.app now references the application instance

## Two Types of "FOLLOWING" Text

1. **"FOLLOWING A/B/C"** - When following a specific viewport (circular button)
2. **"FOLLOWING"** - When following spotlighter (no specific target)

Both should clear properly on breakout via either button or grab.

## Testing Instructions

**Start server:**
```bash
cd 3d-sync-viewer && python3 -m http.server 8080
```

**Open http://localhost:8080 and open browser console (F12)**

### Test Cases
See INSTRUCTIONS.md for detailed testing steps.

### Debug Commands
```javascript
// Check all viewport states
DEBUG.logViewportState("Current state");

// Check consistency between internal state and getter methods
DEBUG.checkConsistency();
```

## Expected Console Output

When grabbing a follower viewport:
```
Interaction detected on viewport X, state: follower
Calling breakout on viewport X
Breakout called on viewport X, state: follower, followTarget: ...
Viewport X: setState(independent, null) - was follower, ...
After breakout - state: independent, followTarget: none
updateUI called, spotlighter: ...
Viewport X: state=independent, followTarget=none
```

## What to Look For

If "FOLLOWING" text still shows after breakout:
1. Is breakout() method being called?
2. Is state being set to 'independent'?
3. Is followTarget being set to null?
4. Is updateUI() being called?
5. What is the actual state when updateUI() runs?

## Next Steps

Test the application with debugging enabled and report the console output to identify the exact issue.