# State Management Analysis

## Current Architecture

### Viewport State
- `viewport.state`: 'independent', 'spotlighter', or 'follower'
- `viewport.followTarget`: reference to viewport being followed (or null)

### SyncManager State  
- `syncManager.spotlighter`: reference to spotlighting viewport (or null)
- `syncManager.followers`: Map of viewport -> array of followers

### Two Types of Followers

1. **Spotlight Follower**
   - state = 'follower'
   - followTarget = null
   - Shows "FOLLOWING" (no specific viewport)
   - Follows spotlighter's camera

2. **Specific Follower**
   - state = 'follower'
   - followTarget = targetViewport
   - Shows "FOLLOWING A/B/C" (specific viewport)
   - Follows targetViewport's camera (if targetViewport has followers)

## State Transitions

### Start Spotlight
- spotlighter.viewport.state = 'spotlighter'
- For all other viewports (without followTarget):
  - viewport.state = 'follower'
  - viewport.followTarget = null
  - Camera synced to spotlighter

### Start Specific Follow (via circular button)
- followerViewport.state = 'follower'
- followerViewport.followTarget = targetViewport
- Camera synced to targetViewport
- Target's followers list updated

### Breakout (any method)
- viewport.state = 'independent'
- viewport.followTarget = null
- Removed from target's followers list (if following)
- UI updated

## Expected Behavior

Both button click and grab should:
1. Detect interaction
2. Call breakout(viewport)
3. Set state to 'independent'
4. Set followTarget to null
5. Update UI
6. Clear "FOLLOWING" or "FOLLOWING X" text
7. Show independent state (gray border, no text)

## Potential Issues

### Issue 1: Event Not Fired
If mousedown event doesn't fire, interaction callback won't be called.
Possible causes:
- OrbitControls preventing event propagation
- Canvas not receiving events properly
- Event listener not attached

### Issue 2: State Not Updated
If breakout() is called but state doesn't change:
- setState() method not working
- State property being overwritten elsewhere

### Issue 3: UI Not Updated
If state changes but UI doesn't update:
- notifyStateChange() not working
- stateChangeCallback not set
- updateUI() logic error

### Issue 4: Conditional Logic Error
If updateUI() shows wrong state:
- Condition evaluation error
- State check using wrong property
- Timing issue (UI updated before state change)
