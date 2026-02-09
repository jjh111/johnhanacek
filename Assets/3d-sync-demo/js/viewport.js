import Cursor3D from './cursor-3d.js';

class Viewport {
    constructor(id, canvas, model) {
        this.id = id;
        this.canvas = canvas;
        this.model = model;
        this.state = 'independent';
        this.followTarget = null;
        this.debounceTimer = null;
        this.interactionCallback = null;
        
        // Cursor colors for each viewport
        this.cursorColors = {
            'a': 0xff4444, // Red
            'b': 0x4444ff, // Blue  
            'c': 0x44ff44  // Green
        };
        
        // Store cursors from other viewports
        this.otherCursors = new Map();
        
        // Raycaster for mouse tracking
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.rayDirection = new THREE.Vector3(0, -1, 0);
        this.isHovering = false;
        this.isInteracting = false;
        this.isZooming = false;
        this.lastMousePosition = new THREE.Vector2();
        this.mouseVelocity = new THREE.Vector2();
        
        // Cursor position callback
        this.cursorPositionCallback = null;
        this.cursorVisibilityCallback = null;
        this.cursorDirectionCallback = null;
        this.cursorNormalCallback = null;
        
        this.initScene();
        this.initCamera();
        this.initRenderer();
        this.initControls();
        this.addModel();
        this.addLights();
        this.setupCursors();
        this.setupMouseTracking();
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
        
        // Track zoom/scale events
        this.controls.addEventListener('change', () => {
            if (this.isZooming && this.isHovering) {
                this.updateCursorFromMouse();
            }
        });
        
        // Detect zoom specifically
        this.canvas.addEventListener('wheel', () => {
            this.isZooming = true;
            if (this.isHovering) {
                this.showOwnCursor();
                this.updateCursorFromMouse();
            }
        }, { passive: true });
        
        this.canvas.addEventListener('wheel', () => {
            setTimeout(() => {
                this.isZooming = false;
            }, 100);
        }, { passive: true });
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
    
    setupCursors() {
        // Create cursors for other viewports
        const otherIds = ['a', 'b', 'c'].filter(id => id !== this.id);
        otherIds.forEach(otherId => {
            const cursor = new Cursor3D(otherId, this.cursorColors[otherId]);
            cursor.addToScene(this.scene);
            cursor.setVisible(false);
            this.otherCursors.set(otherId, cursor);
        });
    }
    
    setupMouseTracking() {
        // Mouse move - track position on molecule
        this.canvas.addEventListener('mousemove', (e) => {
            this.handleMouseMove(e);
        });
        
        // Mouse enter/leave - show/hide cursor
        this.canvas.addEventListener('mouseenter', () => {
            this.isHovering = true;
            this.showOwnCursor();
        });
        
        this.canvas.addEventListener('mouseleave', () => {
            this.isHovering = false;
            this.hideOwnCursor();
        });
        
        // Touch events for mobile
        this.canvas.addEventListener('touchstart', (e) => {
            this.isInteracting = true;
            this.showOwnCursor();
            this.handleTouch(e);
        }, { passive: false });
        
        this.canvas.addEventListener('touchmove', (e) => {
            this.handleTouch(e);
        }, { passive: false });
        
        this.canvas.addEventListener('touchend', () => {
            this.isInteracting = false;
            // Delay hiding to allow for tap gestures
            setTimeout(() => {
                if (!this.isInteracting && !this.isHovering) {
                    this.hideOwnCursor();
                }
            }, 100);
        });
        
        // Mouse down/up for click interaction
        this.canvas.addEventListener('mousedown', () => {
            this.isInteracting = true;
            this.showOwnCursor();
        });
        
        this.canvas.addEventListener('mouseup', () => {
            this.isInteracting = false;
            if (!this.isHovering) {
                this.hideOwnCursor();
            }
        });
    }
    
    handleMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        
        // Calculate mouse velocity for better tracking
        const currentPos = new THREE.Vector2(e.clientX, e.clientY);
        this.mouseVelocity.subVectors(currentPos, this.lastMousePosition);
        this.lastMousePosition.copy(currentPos);
        
        this.updateCursorFromMouse();
    }
    
    handleTouch(e) {
        e.preventDefault();
        const rect = this.canvas.getBoundingClientRect();
        const touch = e.touches[0];
        this.mouse.x = ((touch.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((touch.clientY - rect.top) / rect.height) * 2 + 1;
        
        this.updateCursorFromMouse();
    }
    
    updateCursorFromMouse() {
        // Raycast from camera to find intersection with molecule
        this.raycaster.setFromCamera(this.mouse, this.camera);
        
        // Store ray direction
        this.rayDirection.copy(this.raycaster.ray.direction);
        
        // Check intersection with the model
        const intersects = this.raycaster.intersectObject(this.sceneModel, true);
        
        if (intersects.length > 0) {
            const point = intersects[0].point;
            const normal = intersects[0].face.normal.clone();
            normal.transformDirection(intersects[0].object.matrixWorld);
            
            // The cone tip should be at the surface point
            // Cone length is 0.4 (from -0.1 to 0.3 in Y), tip is at 0.3 in local space
            // We want the cone to point TOWARD the surface, so the tip touches the surface
            // Position = surface point + normal * (cone_length + margin)
            const coneLength = 0.4;
            const margin = 0.05;
            const offsetDistance = coneLength + margin;
            
            // Offset from surface along the normal (away from surface)
            const offset = normal.clone().multiplyScalar(offsetDistance);
            const cursorPos = point.clone().add(offset);
            
            // Broadcast cursor position, direction, and surface normal to other viewports
            if (this.cursorPositionCallback) {
                this.cursorPositionCallback(this.id, cursorPos);
            }
            if (this.cursorDirectionCallback) {
                this.cursorDirectionCallback(this.id, this.rayDirection);
            }
            if (this.cursorNormalCallback) {
                this.cursorNormalCallback(this.id, normal.clone());
            }
        }
    }
    
    showOwnCursor() {
        if (this.cursorVisibilityCallback) {
            this.cursorVisibilityCallback(this.id, true);
        }
    }
    
    hideOwnCursor() {
        if (this.cursorVisibilityCallback) {
            this.cursorVisibilityCallback(this.id, false);
        }
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
    
    // Callbacks for cursor sharing
    setCursorPositionCallback(callback) {
        this.cursorPositionCallback = callback;
    }

    setCursorVisibilityCallback(callback) {
        this.cursorVisibilityCallback = callback;
    }

    setCursorDirectionCallback(callback) {
        this.cursorDirectionCallback = callback;
    }

    setCursorNormalCallback(callback) {
        this.cursorNormalCallback = callback;
    }
    
    // Show/hide cursor from another viewport
    setCursorVisible(viewportId, visible) {
        const cursor = this.otherCursors.get(viewportId);
        if (cursor) {
            cursor.setVisible(visible);
        }
    }
    
    // Update cursor position from another viewport
    updateCursorPosition(viewportId, position) {
        const cursor = this.otherCursors.get(viewportId);
        if (cursor) {
            cursor.setPosition(position.x, position.y, position.z);
        }
    }
    
    // Update cursor ray direction from another viewport
    updateCursorDirection(viewportId, direction) {
        const cursor = this.otherCursors.get(viewportId);
        if (cursor) {
            cursor.setRayDirection(direction);
        }
    }

    // Update cursor surface normal from another viewport
    updateCursorNormal(viewportId, normal) {
        const cursor = this.otherCursors.get(viewportId);
        if (cursor) {
            cursor.setSurfaceNormal(normal);
        }
    }
    
    animate() {
        requestAnimationFrame(() => this.animate());
        this.controls.update();
        
        // Update all cursors with smoothing and orientation
        this.otherCursors.forEach(cursor => {
            if (cursor.visible) {
                cursor.update();
                cursor.updateOrientation(this.camera);
            }
        });
        
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