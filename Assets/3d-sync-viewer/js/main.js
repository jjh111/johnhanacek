import Viewport from './viewport.js';
import SyncManager from './sync-manager.js';
import ModelLoader from './model-loader.js';

const VIEWPORT_IDS = ['a', 'b', 'c'];

class Application {
    constructor() {
        this.viewports = [];
        this.syncManager = null;
        this.init();
        
        window.app = this;
    }
    
    async init() {
        await this.loadModel();
        this.createViewports();
        this.setupSyncManager();
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
        console.log(`updateUI called, spotlighter: ${spotlighter ? spotlighter.id : 'none'}`);
        
        VIEWPORT_IDS.forEach(id => {
            const viewport = this.getViewportById(id);
            const wrapper = document.getElementById(`viewport-${id}-wrapper`);
            const overlay = document.getElementById(`overlay-${id}`);
            
            const spotlightBtn = document.querySelector(`.btn-spotlight[data-viewport="${id}"]`);
            const followBtns = document.querySelectorAll(`.btn-follow-circle[data-viewport="${id}"]`);
            const breakoutBtn = document.querySelector(`.btn-breakout[data-viewport="${id}"]`);
            
            wrapper.classList.remove('spotlighter', 'follower', 'independent');
            overlay.classList.remove('show');
            overlay.textContent = '';
            
            spotlightBtn.disabled = false;
            followBtns.forEach(btn => btn.disabled = false);
            breakoutBtn.disabled = false;
            
            console.log(`Viewport ${id}: state=${viewport.state}, followTarget=${viewport.followTarget ? viewport.followTarget.id : 'none'}`);
            
            if (spotlighter === viewport) {
                wrapper.classList.add('spotlighter');
                overlay.textContent = 'SPOTLIGHTING';
                overlay.classList.add('show');
            } else {
                const followTarget = this.syncManager.getFollowTarget(viewport);
                
                if (followTarget) {
                    wrapper.classList.add('follower');
                    overlay.textContent = `FOLLOWING ${followTarget.id.toUpperCase()}`;
                    overlay.classList.add('show');
                    followBtns.forEach(btn => {
                        if (btn.dataset.target === followTarget.id) {
                            btn.disabled = true;
                        }
                    });
                } else if (spotlighter && viewport.state === 'follower') {
                    wrapper.classList.add('follower');
                    overlay.textContent = 'FOLLOWING';
                    overlay.classList.add('show');
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