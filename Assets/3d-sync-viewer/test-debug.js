// Debug helper to trace state changes
window.DEBUG = {
    logViewportState(message) {
        console.log(`=== ${message} ===`);
        if (window.app && window.app.viewports) {
            window.app.viewports.forEach(vp => {
                console.log(`Viewport ${vp.id}: state=${vp.state}, followTarget=${vp.followTarget ? vp.followTarget.id : 'none'}`);
            });
        }
        console.log('===================');
    },
    
    checkConsistency() {
        console.log('Checking state consistency...');
        if (window.app && window.app.syncManager) {
            const spotlighter = window.app.syncManager.getSpotlighter();
            console.log(`Spotlighter: ${spotlighter ? spotlighter.id : 'none'}`);
            
            window.app.viewports.forEach(vp => {
                const followTarget = window.app.syncManager.getFollowTarget(vp);
                const expectedFollowTarget = vp.followTarget;
                
                if (followTarget !== expectedFollowTarget) {
                    console.error(`INCONSISTENCY: Viewport ${vp.id} - getFollowTarget() returns ${followTarget ? followTarget.id : 'none'} but followTarget is ${expectedFollowTarget ? expectedFollowTarget.id : 'none'}`);
                } else {
                    console.log(`Viewport ${vp.id}: Consistent - followTarget is ${expectedFollowTarget ? expectedFollowTarget.id : 'none'}`);
                }
            });
        }
    }
};

// Expose app for debugging
window.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        if (window.app) {
            console.log('Debug helpers loaded. Use window.DEBUG.logViewportState("message") and window.DEBUG.checkConsistency()');
        }
    }, 1000);
});
