class Viewport {
    constructor(id, canvas, model) {
        this.id = id;
        this.canvas = canvas;
        this.model = model;
        this.state = 'independent';
        this.followTarget = null;
        this.debounceTimer = null;
        this.interactionCallback = null;
        
        this.initScene();
        this.initCamera();
        this.initRenderer();
        this.initControls();
        this.addModel();
        this.addLights();
        this.animate();
        
        this.setupResize();
        this.setupInteractionDetection();
    }
    
    initScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0d1117);
        
        const gridHelper = new THREE.GridHelper(20, 20, 0x2d3748, 0x1a1f2e);
        gridHelper.position.y = -5;
        this.scene.add(gridHelper);
    }
    
    initCamera() {
        const aspect = this.canvas.clientWidth / this.canvas.clientHeight;
        this.camera = new THREE.PerspectiveCamera(
            60,
            aspect,
            0.1,
            1000
        );
        this.camera.position.set(5, 5, 5);
        this.camera.lookAt(0, 0, 0);
    }
    
    initRenderer() {
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true
        });
        this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
    }
    
    initControls() {
        this.controls = new THREE.OrbitControls(this.camera, this.canvas);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.enableZoom = true;
        this.controls.enablePan = true;
        this.controls.enableRotate = true;
        this.controls.minDistance = 2;
        this.controls.maxDistance = 20;
    }
    
    addModel() {
        const modelClone = this.model.clone();
        this.scene.add(modelClone);
        this.sceneModel = modelClone;
    }
    
    addLights() {
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);
        
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(10, 10, 10);
        this.scene.add(directionalLight);
        
        const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.4);
        directionalLight2.position.set(-10, -10, -10);
        this.scene.add(directionalLight2);
    }
    
    setupResize() {
        const resizeObserver = new ResizeObserver(() => {
            const width = this.canvas.clientWidth;
            const height = this.canvas.clientHeight;
            
            this.camera.aspect = width / height;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(width, height);
        });
        
        resizeObserver.observe(this.canvas);
    }
    
    setupInteractionDetection() {
        // Use OrbitControls' start event instead of mousedown
        // This ensures we catch the interaction regardless of event propagation
        this.controls.addEventListener('start', () => {
            this.handleInteractionStart();
        });
    }
    
    handleInteractionStart() {
        // Only trigger breakout if we're currently following
        if (this.state === 'follower' && this.interactionCallback) {
            this.interactionCallback();
        }
    }
    
    setInteractionCallback(callback) {
        this.interactionCallback = callback;
    }
    
    animate() {
        requestAnimationFrame(() => this.animate());
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }
    
    getCameraState() {
        return {
            position: this.camera.position.clone(),
            quaternion: this.camera.quaternion.clone(),
            zoom: this.camera.zoom
        };
    }
    
    setCameraState(state) {
        this.camera.position.copy(state.position);
        this.camera.quaternion.copy(state.quaternion);
        this.camera.zoom = state.zoom;
        this.camera.updateProjectionMatrix();
        this.controls.target.set(0, 0, 0);
    }
    
    enableControls(enabled) {
        this.controls.enabled = enabled;
    }
    
    setState(newState, target = null) {
        this.state = newState;
        this.followTarget = target;
    }
    
    resetCamera() {
        this.camera.position.set(5, 5, 5);
        this.camera.lookAt(0, 0, 0);
        this.controls.target.set(0, 0, 0);
    }
}

export default Viewport;