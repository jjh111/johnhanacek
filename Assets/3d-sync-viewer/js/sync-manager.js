class SyncManager {
    constructor(viewports) {
        this.viewports = viewports;
        this.spotlighter = null;
        this.followers = new Map();
        this.stateChangeCallback = null;
        
        this.setupFollowers();
        this.setupInteractionListeners();
    }
    
    setStateChangeCallback(callback) {
        this.stateChangeCallback = callback;
    }
    
    notifyStateChange() {
        if (this.stateChangeCallback) {
            this.stateChangeCallback();
        }
    }
    
    setupFollowers() {
        this.viewports.forEach(viewport => {
            viewport.controls.addEventListener('change', () => {
                this.handleViewportChange(viewport);
            });
        });
    }
    
    setupInteractionListeners() {
        this.viewports.forEach(viewport => {
            viewport.setInteractionCallback(() => {
                this.handleViewportInteraction(viewport);
            });
        });
    }
    
    handleViewportInteraction(viewport) {
        console.log(`Interaction detected on viewport ${viewport.id}, state: ${viewport.state}`);
        if (viewport.state === 'follower') {
            console.log(`Calling breakout on viewport ${viewport.id}`);
            this.breakout(viewport);
        }
    }
    
    handleViewportChange(viewport) {
        if (this.spotlighter && viewport === this.spotlighter) {
            this.broadcastToFollowers();
        }
        
        if (this.followers.has(viewport)) {
            this.broadcastToFollowersOf(viewport);
        }
    }
    
    broadcastToFollowers() {
        if (!this.spotlighter) return;
        
        const state = this.spotlighter.getCameraState();
        
        this.viewports.forEach(viewport => {
            if (viewport !== this.spotlighter && 
                viewport.state === 'follower' &&
                !viewport.followTarget) {
                viewport.setCameraState(state);
            }
        });
    }
    
    broadcastToFollowersOf(sourceViewport) {
        const followers = this.followers.get(sourceViewport) || [];
        const state = sourceViewport.getCameraState();
        
        followers.forEach(viewport => {
            viewport.setCameraState(state);
        });
    }
    
    setSpotlighter(viewport) {
        this.spotlighter = viewport;
        
        this.viewports.forEach(vp => {
            if (vp === viewport) {
                vp.setState('spotlighter');
            } else {
                if (!vp.followTarget) {
                    vp.setState('follower');
                    const state = viewport.getCameraState();
                    vp.setCameraState(state);
                }
            }
        });
        
        this.notifyStateChange();
    }
    
    startFollow(viewport, targetViewport) {
        if (viewport === targetViewport) {
            console.warn('Cannot follow yourself');
            return;
        }
        
        if (viewport === this.spotlighter) {
            this.clearSpotlight();
        }
        
        this.followers.set(targetViewport, 
            (this.followers.get(targetViewport) || []).filter(vp => vp !== viewport)
        );
        
        viewport.setState('follower', targetViewport);
        
        const state = targetViewport.getCameraState();
        viewport.setCameraState(state);
        
        this.followers.set(targetViewport, 
            [...(this.followers.get(targetViewport) || []), viewport]
        );
        
        this.notifyStateChange();
    }
    
    breakout(viewport) {
        console.log(`Breakout called on viewport ${viewport.id}, state: ${viewport.state}, followTarget: ${viewport.followTarget ? viewport.followTarget.id : 'none'}`);
        
        if (viewport === this.spotlighter) {
            console.log('Clearing spotlight');
            this.clearSpotlight();
            return;
        }
        
        console.log(`Before breakout - state: ${viewport.state}, followTarget: ${viewport.followTarget ? viewport.followTarget.id : 'none'}`);
        
        if (viewport.followTarget) {
            const targetViewport = viewport.followTarget;
            const followers = this.followers.get(targetViewport) || [];
            this.followers.set(targetViewport, followers.filter(vp => vp !== viewport));
            console.log(`Removed ${viewport.id} from ${targetViewport.id}'s followers`);
        }
        
        viewport.setState('independent');
        console.log(`After breakout - state: ${viewport.state}, followTarget: ${viewport.followTarget ? viewport.followTarget.id : 'none'}`);
        
        this.notifyStateChange();
    }
    
    clearSpotlight() {
        this.viewports.forEach(vp => {
            if (vp !== this.spotlighter) {
                vp.setState('independent');
            }
        });
        this.spotlighter = null;
        this.notifyStateChange();
    }
    
    getSpotlighter() {
        return this.spotlighter;
    }
    
    getFollowTarget(viewport) {
        return viewport.followTarget;
    }
    
    resetAll() {
        this.clearSpotlight();
        this.followers.clear();
        this.viewports.forEach(vp => {
            vp.setState('independent');
            vp.resetCamera();
        });
    }
}

export default SyncManager;