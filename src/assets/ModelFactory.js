import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { SETTINGS } from '../settings.js';

const loader = new GLTFLoader();

export class ModelFactory {
    static async loadOptionalEnemyModel(type) {
        const file = SETTINGS.assets.enemyModelNames[type];
        if (!file) return null;
        const path = `${SETTINGS.assets.optionalEnemyModelsPath}/${file}`;
        return new Promise((resolve) => {
            loader.load(
                path,
                (gltf) => resolve(gltf.scene || null),
                undefined,
                () => resolve(null)
            );
        });
    }

    static markCastShadow(root) {
        root.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                if (!child.material) {
                    child.material = new THREE.MeshStandardMaterial({ color: 0x9aa1a7, roughness: 0.75 });
                }
            }
        });
        return root;
    }
}
