/** @fileoverview Natural particle effects with visible explosions */

import * as THREE from 'three';
import { SETTINGS } from './settings.js';

class Particle {
    constructor(position, velocity, life, color, size, type = 'dust') {
        this.position = position.clone();
        this.velocity = velocity.clone();
        this.life = life;
        this.maxLife = life;
        this.color = color.clone();
        this.size = size;
        this.initialSize = size;
        this.type = type;
        this.drag = type === 'smoke' ? 2 : type === 'spark' ? 0.5 : 1;
        this.gravity = type === 'smoke' ? -1 : type === 'ember' ? -3 : -12;
        this.groundY = 0.1;
    }

    update(delta) {
        this.life -= delta;
        if (this.life <= 0) return false;
        this.velocity.y += this.gravity * delta;
        this.velocity.multiplyScalar(1 - this.drag * delta);
        this.position.add(this.velocity.clone().multiplyScalar(delta));
        const lifeRatio = this.life / this.maxLife;
        this.size = this.initialSize * (this.type === 'smoke' ? lifeRatio : Math.sqrt(lifeRatio));
        return true;
    }
}

export class ParticleSystem {
    constructor(scene, maxParticles = SETTINGS.performance.maxParticles) {
        this.scene = scene;
        this.maxParticles = maxParticles;
        this.particles = [];
        this.shockwaves = [];

        const geometry = new THREE.PlaneGeometry(1, 1);
        const material = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 1,
            blending: THREE.NormalBlending,
            depthWrite: false,
            side: THREE.DoubleSide
        });

        this.instancedMesh = new THREE.InstancedMesh(geometry, material, maxParticles);
        this.instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        // Particles move all over the map; avoid incorrect culling of distant effects.
        this.instancedMesh.frustumCulled = false;
        this.scene.add(this.instancedMesh);

        this.dummy = new THREE.Object3D();
        this.activeCount = 0;
        this.shakeIntensity = 0;
        this.shakeDuration = 0;
    }

    createExplosion(position, type = 'medium') {
        const configs = {
            small: { count: 40, spread: 4, life: 0.5, colors: [0x8a6a4a, 0x7a5a3a, 0x9a7a5a] },
            medium: { count: 100, spread: 8, life: 0.8, colors: [0x8a6a4a, 0x7a5a3a, 0xaaaaaa, 0xcc8844] },
            large: { count: 200, spread: 12, life: 1.2, colors: [0x5a3a1a, 0x8a6a4a, 0xaaaaaa, 0xdd9944, 0xffaa55] },
            massive: { count: 340, spread: 18, life: 1.6, colors: [0x2f1a12, 0x6f4f2e, 0xaa7a4a, 0xe5a15a] }
        };

        const config = configs[type] || configs.medium;

        // Core burst particles
        for (let i = 0; i < config.count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const elevation = (Math.random() - 0.5) * Math.PI * 0.6;
            const speed = Math.random() * config.spread + 1.5;
            const velocity = new THREE.Vector3(
                Math.cos(angle) * Math.cos(elevation) * speed,
                Math.sin(elevation) * speed + Math.random() * 4,
                Math.sin(angle) * Math.cos(elevation) * speed
            );
            const colorHex = config.colors[Math.floor(Math.random() * config.colors.length)];
            const color = new THREE.Color(colorHex);
            const particleType = Math.random() > 0.5 ? 'dust' : 'spark';
            const life = config.life * (0.5 + Math.random() * 0.5);
            const size = particleType === 'dust' ? 0.2 + Math.random() * 0.15 : 0.1 + Math.random() * 0.08;
            this.particles.push(new Particle(position, velocity, life, color, size, particleType));
        }

        // Smoke
        for (let i = 0; i < config.count / 3; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 2 + 0.5;
            const velocity = new THREE.Vector3(Math.cos(angle) * speed, Math.random() * 3 + 1, Math.sin(angle) * speed);
            const color = new THREE.Color(0x555555);
            const life = config.life * 1.5;
            this.particles.push(new Particle(position, velocity, life, color, 0.4, 'smoke'));
        }

        // Bright flash particles for visibility
        for (let i = 0; i < 10; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 6 + 2;
            const velocity = new THREE.Vector3(
                Math.cos(angle) * speed,
                Math.random() * 5 + 2,
                Math.sin(angle) * speed
            );
            const flashColor = new THREE.Color(0xffdd88);
            this.particles.push(new Particle(position, velocity, 0.3, flashColor, 0.25, 'spark'));
        }

        // Map shake is reserved for mortar impacts only.
        if (type === 'massive') {
            this.shakeIntensity = 0.85;
            this.shakeDuration = 0.38;
        }
    }

    createImpact(position, projectileType) {
        const colors = {
            blaster: [0x6a4a2a, 0x8a6a4a],
            cannon: [0x555555, 0x777777],
            sniper: [0x4a6aaa, 0x6a9aff]
        }[projectileType] || [0x8a6a4a];

        for (let i = 0; i < 20; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 6 + 2;
            const velocity = new THREE.Vector3(Math.cos(angle) * speed, Math.random() * 4, Math.sin(angle) * speed);
            const colorHex = colors[Math.floor(Math.random() * colors.length)];
            const color = new THREE.Color(colorHex);
            const life = 0.3 + Math.random() * 0.3;
            this.particles.push(new Particle(position, velocity, life, color, 0.12, 'dust'));
        }
    }

    applyScreenShake(camera, delta) {
        if (this.shakeDuration > 0) {
            this.shakeDuration -= delta;
            const intensity = this.shakeIntensity * (this.shakeDuration / 0.25);
            camera.position.x += (Math.random() - 0.5) * intensity;
            camera.position.y += (Math.random() - 0.5) * intensity;
            camera.position.z += (Math.random() - 0.5) * intensity;
        }
    }

    update(delta, camera) {
        let activeIndex = 0;
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const particle = this.particles[i];
            const alive = particle.update(delta);
            if (!alive) { this.particles.splice(i, 1); continue; }
            if (activeIndex < this.maxParticles) {
                this.dummy.position.copy(particle.position);
                this.dummy.scale.setScalar(particle.size);
                this.dummy.lookAt(camera.position);
                this.dummy.updateMatrix();
                this.instancedMesh.setMatrixAt(activeIndex, this.dummy.matrix);
                this.instancedMesh.setColorAt(activeIndex, particle.color);
                activeIndex++;
            }
        }

        this.instancedMesh.count = activeIndex;
        this.instancedMesh.instanceMatrix.needsUpdate = true;
        if (this.instancedMesh.instanceColor) this.instancedMesh.instanceColor.needsUpdate = true;

        this.applyScreenShake(camera, delta);
    }

    clear() {
        this.particles = [];
        this.instancedMesh.count = 0;
    }
}
