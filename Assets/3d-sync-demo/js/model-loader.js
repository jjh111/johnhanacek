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
        
        // Carbon ring with tail - atoms only, no hydrogens
        const carbonPositions = [];
        
        // Create carbon ring (6 carbons in hexagon)
        const ringRadius = 2;
        const numRingAtoms = 6;
        for (let i = 0; i < numRingAtoms; i++) {
            const angle = (i / numRingAtoms) * Math.PI * 2;
            carbonPositions.push({
                x: Math.cos(angle) * ringRadius,
                y: 0,
                z: Math.sin(angle) * ringRadius,
                size: 0.5
            });
        }
        
        // Add tail atoms (2 carbons extending from one ring position)
        const tailStart = carbonPositions[0];
        carbonPositions.push({
            x: tailStart.x + 1.8,
            y: 0.5,
            z: tailStart.z + 0.6,
            size: 0.5
        });
        
        carbonPositions.push({
            x: tailStart.x + 3.2,
            y: 0,
            z: tailStart.z + 1.0,
            size: 0.5
        });
        
        // Create spheres for carbon atoms - light grey with roughness for diffuse reflection
        const sphereGeometry = new THREE.SphereGeometry(1, 32, 32);
        const carbonMaterial = new THREE.MeshStandardMaterial({
            color: 0xa0a0a0, // Light grey
            roughness: 0.7,  // High roughness for diffuse reflection
            metalness: 0.1   // Low metalness
        });
        
        carbonPositions.forEach((atom) => {
            const sphere = new THREE.Mesh(sphereGeometry, carbonMaterial);
            sphere.position.set(atom.x, atom.y, atom.z);
            sphere.scale.setScalar(atom.size);
            group.add(sphere);
        });
        
        // Create bonds between atoms - thicker
        const bondMaterial = new THREE.MeshStandardMaterial({
            color: 0x707070, // Darker grey for bonds
            roughness: 0.8,
            metalness: 0.1
        });
        const bondRadius = 0.15; // Increased from 0.08 for thicker lines
        
        // Bonds for ring (connect consecutive atoms)
        for (let i = 0; i < numRingAtoms; i++) {
            const start = carbonPositions[i];
            const end = carbonPositions[(i + 1) % numRingAtoms];
            this.createBond(start, end, bondMaterial, group, bondRadius);
        }
        
        // Bonds for tail
        this.createBond(carbonPositions[0], carbonPositions[numRingAtoms], bondMaterial, group, bondRadius);
        this.createBond(carbonPositions[numRingAtoms], carbonPositions[numRingAtoms + 1], bondMaterial, group, bondRadius);
        
        // Center the molecule on the ring atoms only (not the tail)
        // Calculate center of just the 6 ring atoms
        const ringCenter = new THREE.Vector3();
        for (let i = 0; i < numRingAtoms; i++) {
            ringCenter.x += carbonPositions[i].x;
            ringCenter.y += carbonPositions[i].y;
            ringCenter.z += carbonPositions[i].z;
        }
        ringCenter.divideScalar(numRingAtoms);
        
        // Move group so ring center is at origin
        group.position.sub(ringCenter);
        
        return group;
    }
    
    static createBond(start, end, material, group, radius = 0.15) {
        const startVec = new THREE.Vector3(start.x, start.y, start.z);
        const endVec = new THREE.Vector3(end.x, end.y, end.z);
        
        const distance = startVec.distanceTo(endVec);
        const bondGeometry = new THREE.CylinderGeometry(radius, radius, distance, 16);
        const bond = new THREE.Mesh(bondGeometry, material);
        
        const midPoint = new THREE.Vector3().addVectors(startVec, endVec).multiplyScalar(0.5);
        bond.position.copy(midPoint);
        bond.lookAt(endVec);
        bond.rotateX(Math.PI / 2);
        
        group.add(bond);
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