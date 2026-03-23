class Cursor3D {
    constructor(viewportId, color) {
        this.viewportId = viewportId;
        this.color = color;
        this.mesh = this.createCursorMesh();
        this.position = new THREE.Vector3(0, 0, 0);
        this.targetPosition = new THREE.Vector3(0, 0, 0);
        this.surfaceNormal = new THREE.Vector3(0, 1, 0);
        this.visible = false;
        this.smoothingFactor = 0.15;
    }
    
    createCursorMesh() {
        const group = new THREE.Group();
        
        // Create arrow
        this.arrowGroup = new THREE.Group();
        
        // Arrow head (cone) - points UP (Y+) by default in Three.js
        const coneGeometry = new THREE.ConeGeometry(0.12, 0.35, 16);
        const material = new THREE.MeshStandardMaterial({
            color: this.color,
            roughness: 0.4,
            metalness: 0.3,
            emissive: this.color,
            emissiveIntensity: 0.2
        });
        const cone = new THREE.Mesh(coneGeometry, material);
        cone.position.y = 0.175;
        this.arrowGroup.add(cone);
        
        // Arrow body (sphere)
        const sphereGeometry = new THREE.SphereGeometry(0.1, 16, 16);
        const sphere = new THREE.Mesh(sphereGeometry, material);
        sphere.position.y = -0.05;
        this.arrowGroup.add(sphere);
        
        group.add(this.arrowGroup);
        
        // Create label - thinner background
        this.labelGroup = new THREE.Group();
        
        // Label background - thinner (0.02 instead of 0.04)
        const labelWidth = 0.7;
        const labelHeight = 0.3;
        const labelDepth = 0.02; // Thinner background
        const labelGeometry = new THREE.BoxGeometry(labelWidth, labelHeight, labelDepth);
        const labelMaterial = new THREE.MeshStandardMaterial({
            color: 0x1a1a2e,
            roughness: 0.8,
            metalness: 0.1,
            transparent: true,
            opacity: 0.9
        });
        const labelBg = new THREE.Mesh(labelGeometry, labelMaterial);
        this.labelGroup.add(labelBg);
        
        // Create text label with JetBrains Mono font
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, 128, 64);
        
        ctx.strokeStyle = '#' + this.color.toString(16).padStart(6, '0');
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.roundRect(2, 2, 124, 60, 8);
        ctx.stroke();
        
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 32px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.viewportId.toUpperCase(), 64, 32);
        
        const texture = new THREE.CanvasTexture(canvas);
        const textGeometry = new THREE.PlaneGeometry(0.6, 0.25);
        const textMaterial = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true
        });
        const textMesh = new THREE.Mesh(textGeometry, textMaterial);
        textMesh.position.z = 0.015; // Adjusted for thinner background
        this.labelGroup.add(textMesh);
        
        this.labelGroup.position.set(0.6, 0.2, 0);
        group.add(this.labelGroup);
        
        // Add glow
        const light = new THREE.PointLight(this.color, 0.5, 2);
        light.position.set(0, 0, 0);
        group.add(light);
        
        return group;
    }
    
    setPosition(x, y, z) {
        this.targetPosition.set(x, y, z);
        if (!this.visible) {
            this.position.copy(this.targetPosition);
            this.mesh.position.copy(this.position);
        }
    }
    
    setSurfaceNormal(normal) {
        this.surfaceNormal.copy(normal).normalize();
    }
    
    setRayDirection(direction) {
        // Stub method - ray direction no longer used for cone orientation
        // Keeping for backwards compatibility
    }
    
    setVisible(visible) {
        this.visible = visible;
        this.mesh.visible = visible;
    }
    
    update(deltaTime) {
        if (!this.visible) return;
        this.position.lerp(this.targetPosition, this.smoothingFactor);
        this.mesh.position.copy(this.position);
    }
    
    updateOrientation(camera) {
        if (!this.visible) return;
        
        // Scale based on distance
        const distance = camera.position.distanceTo(this.mesh.position);
        const baseDistance = 5;
        const scale = distance / baseDistance;
        this.mesh.scale.setScalar(scale);
        
        // Use quaternion to rotate arrow
        // Cone points UP (0, 1, 0) by default
        // We want it to point toward the surface, which is opposite the surface normal
        const up = new THREE.Vector3(0, 1, 0);
        const targetDir = this.surfaceNormal.clone().negate();
        
        const quaternion = new THREE.Quaternion();
        quaternion.setFromUnitVectors(up, targetDir);
        
        this.arrowGroup.quaternion.copy(quaternion);
        
        // Make label face camera
        this.labelGroup.lookAt(camera.position);
    }
    
    updateScale(camera) {
        this.updateOrientation(camera);
    }
    
    lookAtCamera(camera) {
        // Now handled in updateOrientation
    }
    
    addToScene(scene) {
        scene.add(this.mesh);
    }
    
    removeFromScene(scene) {
        scene.remove(this.mesh);
    }
}

export default Cursor3D;