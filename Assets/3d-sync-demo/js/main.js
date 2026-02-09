import Viewport from './viewport.js';
import SyncManager from './sync-manager.js';
import ModelLoader from './model-loader.js';

const VIEWPORT_IDS = ['a', 'b', 'c'];

class Application {
    constructor() {
        this.viewports = [];
        this.syncManager = null;
        this.init();
    }
    
    async init() {
        await this.loadModel();
        this.createViewports();
        this.setupSyncManager();
        this.setupCursorSharing();
        this.setupUI();
    }
    
    async loadModel() {
        console.log('Creating model...');
        this.model = await ModelLoader.loadModel('models/molecule.gltf');
        console.log('Model loaded');
    }
    
    createViewports() {
        VIEWPORT_IDS.forEach(id => {
            const canvas = document.getElementById(`canvas-${id}`);
            const viewport = new Viewport(id, canvas, this.model);
            this.viewports.push(viewport);
        });
    }
    
    setupSyncManager() {
        this.syncManager = new SyncManager(this.viewports);
        this.syncManager.setStateChangeCallback(() => {
            this.updateUI();
        });
    }
    
    setupCursorSharing() {
        // Set up cursor position, direction, normal, and visibility sharing between viewports
        this.viewports.forEach(sourceViewport => {
            // When this viewport's cursor moves, update it in all other viewports
            sourceViewport.setCursorPositionCallback((viewportId, position) => {
                this.viewports.forEach(targetViewport => {
                    if (targetViewport.id !== viewportId) {
                        targetViewport.updateCursorPosition(viewportId, position);
                    }
                });
            });

            // When this viewport's cursor direction changes, update all other viewports
            sourceViewport.setCursorDirectionCallback((viewportId, direction) => {
                this.viewports.forEach(targetViewport => {
                    if (targetViewport.id !== viewportId) {
                        targetViewport.updateCursorDirection(viewportId, direction);
                    }
                });
            });

            // When this viewport's cursor surface normal changes, update all other viewports
            sourceViewport.setCursorNormalCallback((viewportId, normal) => {
                this.viewports.forEach(targetViewport => {
                    if (targetViewport.id !== viewportId) {
                        targetViewport.updateCursorNormal(viewportId, normal);
                    }
                });
            });

            // When this viewport's cursor visibility changes, update all other viewports
            sourceViewport.setCursorVisibilityCallback((viewportId, visible) => {
                this.viewports.forEach(targetViewport => {
                    if (targetViewport.id !== viewportId) {
                        targetViewport.setCursorVisible(viewportId, visible);
                    }
                });
            });
        });
    }
    
    setupUI() {
        this.setupSpotlightButtons();
        this.setupFollowButtons();
        this.setupBreakoutButtons();
        this.updateUI();
    }
    
    setupSpotlightButtons() {
        document.querySelectorAll('.btn-spotlight').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const viewportId = e.target.dataset.viewport;
                const viewport = this.getViewportById(viewportId);
                this.syncManager.setSpotlighter(viewport);
                this.updateUI();
            });
        });
    }
    
    setupFollowButtons() {
        document.querySelectorAll('.btn-follow-circle').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const viewportId = e.target.dataset.viewport;
                const targetId = e.target.dataset.target;
                const viewport = this.getViewportById(viewportId);
                const targetViewport = this.getViewportById(targetId);
                
                this.syncManager.startFollow(viewport, targetViewport);
                this.updateUI();
            });
        });
    }
    
    setupBreakoutButtons() {
        document.querySelectorAll('.btn-breakout').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const viewportId = e.target.dataset.viewport;
                const viewport = this.getViewportById(viewportId);
                this.syncManager.breakout(viewport);
                this.updateUI();
            });
        });
    }
    
    getViewportById(id) {
        return this.viewports.find(vp => vp.id === id);
    }
    
    updateUI() {
        const spotlighter = this.syncManager.getSpotlighter();
        
        // Calculate followers list for spotlight label
        let followersList = '';
        if (spotlighter) {
            const followers = VIEWPORT_IDS.filter(vid => {
                const vp = this.getViewportById(vid);
                return vp !== spotlighter && (vp.state === 'follower' || this.syncManager.getFollowTarget(vp));
            }).map(vid => vid.toUpperCase());
            followersList = followers.length > 0 ? followers.join(', ') : 'none';
        }
        
        VIEWPORT_IDS.forEach(id => {
            const viewport = this.getViewportById(id);
            const wrapper = document.getElementById(`viewport-${id}-wrapper`);
            const overlay = document.getElementById(`overlay-${id}`);
            
            const spotlightBtn = document.querySelector(`.btn-spotlight[data-viewport="${id}"]`);
            const followBtns = document.querySelectorAll(`.btn-follow-circle[data-viewport="${id}"]`);
            const breakoutBtn = document.querySelector(`.btn-breakout[data-viewport="${id}"]`);
            
            // Reset all button states
            spotlightBtn.classList.remove('active');
            followBtns.forEach(btn => btn.classList.remove('active', 'disabled'));
            breakoutBtn.classList.remove('active', 'disabled');
            spotlightBtn.disabled = false;
            followBtns.forEach(btn => btn.disabled = false);
            breakoutBtn.disabled = false;
            
            wrapper.classList.remove('spotlighter', 'follower', 'independent');
            overlay.classList.remove('show');
            overlay.textContent = '';
            
            if (spotlighter === viewport) {
                wrapper.classList.add('spotlighter');
                overlay.textContent = `SPOTLIGHTING - Viewports following: ${followersList}`;
                overlay.classList.add('show');
                spotlightBtn.classList.add('active');
            } else {
                const followTarget = this.syncManager.getFollowTarget(viewport);
                
                if (followTarget) {
                    wrapper.classList.add('follower');
                    overlay.textContent = `FOLLOWING VIEWPORT ${followTarget.id.toUpperCase()}`;
                    overlay.classList.add('show');
                    breakoutBtn.classList.add('active');
                    followBtns.forEach(btn => {
                        if (btn.dataset.target === followTarget.id) {
                            btn.classList.add('active');
                            btn.disabled = true;
                        }
                    });
                } else if (spotlighter && viewport.state === 'follower') {
                    wrapper.classList.add('follower');
                    overlay.textContent = `FOLLOWING VIEWPORT ${spotlighter.id.toUpperCase()}`;
                    overlay.classList.add('show');
                    breakoutBtn.classList.add('active');
                } else {
                    wrapper.classList.add('independent');
                    breakoutBtn.disabled = true;
                }
            }
        });
    }
}

window.addEventListener('DOMContentLoaded', () => {
    new Application();
});