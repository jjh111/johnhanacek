# Testing Instructions

## How to Test

1. Open http://localhost:8080 in your browser
2. Open browser console (F12 or Cmd+Option+I)
3. Run the following tests:

### Test 1: Spotlight Breakout via Button
1. Click "Spotlight" on Viewport A
2. Observe that B and C show "FOLLOWING"
3. Click "Breakout" on Viewport B
4. Check console logs and observe that B no longer shows "FOLLOWING"
5. Expected: B should show independent state (gray border, no text)

### Test 2: Spotlight Breakout via Grab
1. Click "Spotlight" on Viewport A (if not already set)
2. Observe that B and C show "FOLLOWING"
3. Grab the molecule in Viewport B (click and drag)
4. Check console logs and observe what happens
5. Expected: B should breakout and show independent state (gray border, no text)
6. BUG IF: B still shows "FOLLOWING" after grabbing

### Test 3: Specific Follow Breakout via Button
1. If spotlight is on, click "Breakout" on spotlighter to clear
2. Click circular button "A" on Viewport B
3. Observe that B shows "FOLLOWING A"
4. Click "Breakout" on Viewport B
5. Check console logs
6. Expected: B should show independent state (gray border, no text)

### Test 4: Specific Follow Breakout via Grab
1. Click circular button "A" on Viewport B
2. Observe that B shows "FOLLOWING A"
3. Grab the molecule in Viewport B
4. Check console logs
5. Expected: B should breakout and show independent state (gray border, no text)
6. BUG IF: B still shows "FOLLOWING A" after grabbing

## Debug Commands

In browser console, run:

```javascript
// Check all viewport states
DEBUG.logViewportState("Current state");

// Check consistency between internal state and getter methods
DEBUG.checkConsistency();
```

## What to Look For

If you see "FOLLOWING" text still showing after a breakout, check:
1. Is the breakout() method being called? (console logs)
2. Is the state being set to 'independent'? (console logs)
3. Is the followTarget being set to null? (console logs)
4. Is the updateUI() being called? (console logs)
5. What is the actual state when updateUI() runs? (console logs)

## Expected Console Output

When grabbing a follower viewport:

```
Interaction detected on viewport b, state: follower
Calling breakout on viewport b
Breakout called on viewport b, state: follower, followTarget: none
Before breakout - state: follower, followTarget: none
Viewport b: setState(independent, null) - was follower, none
After breakout - state: independent, followTarget: none
updateUI called, spotlighter: a
Viewport a: state=spotlighter, followTarget=none
Viewport b: state=independent, followTarget=none
Viewport c: state=follower, followTarget=none
```

## Common Issues

- If "Interaction detected" doesn't appear, the event listener isn't working
- If "Breakout called" doesn't appear, the state check is failing
- If state doesn't change to 'independent', setState() isn't working
- If UI doesn't update, notifyStateChange() isn't working
