class ModelLoader {
    static async loadGLTF(url) {
        const loader = new THREE.GLTFLoader();
        
        return new Promise((resolve, reject) => {
            loader.load(
                url,
                (gltf) => {
                    resolve(gltf.scene);
                },
                (progress) => {
                    console.log('Loading progress:', (progress.loaded / progress.total * 100) + '%');
                },
                (error) => {
                    console.error('Error loading model:', error);
                    reject(error);
                }
            );
        });
    }
    
    static createFallbackModel() {
        const group = new THREE.Group();
        
        const atomMaterial = new THREE.MeshPhongMaterial({
            color: 0x4facfe,
            shininess: 100
        });
        
        const bondMaterial = new THREE.MeshPhongMaterial({
            color: 0x6b7280,
            shininess: 50
        });
        
        const atomGeometry = new THREE.SphereGeometry(0.5, 32, 32);
        
        const atomPositions = [
            { x: 0, y: 0, z: 0, color: 0x4facfe, size: 0.6 },
            { x: 2, y: 1, z: 0, color: 0xf59e0b, size: 0.5 },
            { x: -1, y: -1, z: 1, color: 0x10b981, size: 0.5 },
            { x: 1, y: -1, z: -1, color: 0xef4444, size: 0.5 },
            { x: 0, y: 2, z: 0, color: 0x8b5cf6, size: 0.4 },
        ];
        
        const bonds = [
            [0, 1],
            [0, 2],
            [0, 3],
            [1, 4],
        ];
        
        atomPositions.forEach((atom) => {
            const material = new THREE.MeshPhongMaterial({
                color: atom.color,
                shininess: 100
            });
            const sphere = new THREE.Mesh(atomGeometry, material);
            sphere.position.set(atom.x, atom.y, atom.z);
            sphere.scale.setScalar(atom.size / 0.5);
            group.add(sphere);
        });
        
        bonds.forEach(([start, end]) => {
            const startPos = atomPositions[start];
            const endPos = atomPositions[end];
            
            const startVec = new THREE.Vector3(startPos.x, startPos.y, startPos.z);
            const endVec = new THREE.Vector3(endPos.x, endPos.y, endPos.z);
            
            const distance = startVec.distanceTo(endVec);
            const bondGeometry = new THREE.CylinderGeometry(0.1, 0.1, distance, 16);
            const bond = new THREE.Mesh(bondGeometry, bondMaterial);
            
            const midPoint = new THREE.Vector3().addVectors(startVec, endVec).multiplyScalar(0.5);
            bond.position.copy(midPoint);
            
            bond.lookAt(endVec);
            bond.rotateX(Math.PI / 2);
            
            group.add(bond);
        });
        
        group.scale.setScalar(1.5);
        
        return group;
    }
    
    static async loadModel(url) {
        try {
            const model = await this.loadGLTF(url);
            const box = new THREE.Box3().setFromObject(model);
            const center = box.getCenter(new THREE.Vector3());
            model.position.sub(center);
            return model;
        } catch (error) {
            console.warn('Failed to load GLTF model, using fallback:', error);
            return this.createFallbackModel();
        }
    }
}

export default ModelLoader;