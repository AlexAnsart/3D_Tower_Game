/** @fileoverview Natural projectiles - arrows, cannonballs, magic bolts */

import * as THREE from 'three';
import { PhysicsBody } from './Physics.js';
import { SETTINGS } from './settings.js';

export class Projectile {
    constructor(scene, physics, position, direction, speed, damage, type, target = null, options = {}) {
        this.scene = scene;
        this.physics = physics;
        this.damage = damage;
        this.type = type;
        this.target = target;
        this.alive = true;
        this.lifetime = 3;
        this.age = 0;
        this.piercing = type === 'sniper';
        this.hitEnemies = new Set();
        this.enemyHitExplosionDone = false;
        this.options = options;
        this.sizeMultiplier = Math.max(0.35, options.sizeMultiplier ?? 1);

        this.mesh = this.createMesh(type);
        this.mesh.scale.setScalar(this.sizeMultiplier);
        this.mesh.position.copy(position);
        this.scene.add(this.mesh);

        const cfg = SETTINGS.projectiles[type] || SETTINGS.projectiles.blaster;
        this.body = new PhysicsBody(position, cfg.radius * this.sizeMultiplier, 0.1, 'dynamic');
        this.body.velocity.copy(direction.multiplyScalar(speed));
        this.body.restitution = 0.2;
        this.body.gravityScale = cfg.gravityScale;
        this.body.userData = { projectile: this };
        this.physics.addBody(this.body);

        this.createTrail(type);
    }

    createMesh(type) {
        const group = new THREE.Group();

        if (type === 'blaster') {
            // Arrow - made thicker for visibility
            const shaftGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.8, 6);
            const shaftMat = new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.5 });
            const shaft = new THREE.Mesh(shaftGeo, shaftMat);
            shaft.rotation.x = Math.PI / 2;
            group.add(shaft);

            const headGeo = new THREE.ConeGeometry(0.12, 0.25, 6);
            const headMat = new THREE.MeshStandardMaterial({ 
                color: 0x999999, 
                metalness: 0.9, 
                roughness: 0.2,
                emissive: 0x333333 
            });
            const head = new THREE.Mesh(headGeo, headMat);
            head.rotation.x = -Math.PI / 2;
            head.position.z = 0.5;
            group.add(head);

            const fletchingGeo = new THREE.BoxGeometry(0.2, 0.02, 0.15);
            const fletchingMat = new THREE.MeshStandardMaterial({ color: 0xcc3333 });
            const fletching = new THREE.Mesh(fletchingGeo, fletchingMat);
            fletching.position.z = -0.4;
            group.add(fletching);
        } else if (type === 'cannon') {
            // Cannonball - larger and more metallic
            const ballGeo = new THREE.SphereGeometry(0.35, 12, 12);
            const ballMat = new THREE.MeshStandardMaterial({ 
                color: 0x222222, 
                roughness: 0.3, 
                metalness: 1.0,
                emissive: 0x111111 
            });
            const ball = new THREE.Mesh(ballGeo, ballMat);
            ball.castShadow = true;
            group.add(ball);
        } else if (type === 'mortar') {
            const ballGeo = new THREE.SphereGeometry(0.58, 14, 14);
            const ballMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4, metalness: 0.95 });
            group.add(new THREE.Mesh(ballGeo, ballMat));
        } else if (type === 'sniper') {
            // Magic bolt - bigger and brighter
            const boltGeo = new THREE.CylinderGeometry(0.08, 0.12, 0.8, 8);
            const boltMat = new THREE.MeshStandardMaterial({
                color: 0x00ffff,
                emissive: 0x00ffff,
                emissiveIntensity: 2.0,
                transparent: true,
                opacity: 0.9
            });
            const bolt = new THREE.Mesh(boltGeo, boltMat);
            bolt.rotation.x = Math.PI / 2;
            group.add(bolt);

            // Inner glow core
            const coreGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.9, 8);
            const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
            const core = new THREE.Mesh(coreGeo, coreMat);
            core.rotation.x = Math.PI / 2;
            group.add(core);

            // Glow sphere
            const glowGeo = new THREE.SphereGeometry(0.25, 8, 8);
            const glowMat = new THREE.MeshBasicMaterial({
                color: 0x00ffff,
                transparent: true,
                opacity: 0.5
            });
            const glow = new THREE.Mesh(glowGeo, glowMat);
            group.add(glow);
        }

        return group;
    }

    createTrail(type) {
        const maxPoints = 20;
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(maxPoints * 3);
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        const colors = { blaster: 0x6a4a2a, cannon: 0x333333, mortar: 0x111111, sniper: 0x4a6aaa };
        const material = new THREE.LineBasicMaterial({
            color: colors[type] || 0x6a4a2a,
            transparent: true,
            opacity: 0.4
        });

        this.trail = new THREE.Line(geometry, material);
        this.trail.frustumCulled = false;
        this.scene.add(this.trail);
        this.trailPositions = [];
        this.trailMaxPoints = maxPoints;
    }

    updateTrail() {
        this.trailPositions.push(this.mesh.position.clone());
        if (this.trailPositions.length > this.trailMaxPoints) this.trailPositions.shift();

        const positions = this.trail.geometry.attributes.position.array;
        for (let i = 0; i < this.trailPositions.length; i++) {
            positions[i * 3] = this.trailPositions[i].x;
            positions[i * 3 + 1] = this.trailPositions[i].y;
            positions[i * 3 + 2] = this.trailPositions[i].z;
        }
        this.trail.geometry.attributes.position.needsUpdate = true;
        this.trail.geometry.setDrawRange(0, this.trailPositions.length);
    }

    update(delta) {
        if (!this.alive) return;
        this.age += delta;
        if (this.age >= this.lifetime) { this.alive = false; return; }

        this.mesh.position.copy(this.body.position);
        if (this.body.velocity.length() > 0.1) {
            const lookTarget = this.body.position.clone().add(this.body.velocity);
            this.mesh.lookAt(lookTarget);
        }

        if (this.type === 'sniper' && !this.options.flame && this.target && this.target.alive && !this.hitEnemies.has(this.target)) {
            const targetPos = this.target.mesh.position.clone();
            targetPos.y += this.target.body ? this.target.body.radius : 0.5;
            const toTarget = targetPos.sub(this.body.position);
            toTarget.normalize();
            const currentDir = this.body.velocity.clone().normalize();
            const steer = toTarget.sub(currentDir).multiplyScalar(delta * 8);
            const currentSpeed = this.body.velocity.length();
            this.body.velocity.add(steer);
            this.body.velocity.normalize().multiplyScalar(currentSpeed);
        }

        this.updateTrail();
        const groundContactY = this.body.radius + 0.02;
        if (this.type === 'blaster') {
            // Archer arrows should vanish instantly on first ground contact.
            if (this.body.position.y <= groundContactY) this.alive = false;
        } else if (this.body.position.y <= 0.2) {
            this.alive = false;
        }
    }

    hit(enemy) {
        if (this.hitEnemies.has(enemy)) return false;
        this.hitEnemies.add(enemy);
        if (this.type === 'cannon') this.enemyHitExplosionDone = true;
        enemy.takeDamage(this.damage);
        if (!this.piercing) this.alive = false;
        return true;
    }

    destroy() {
        this.alive = false;
        this.physics.removeBody(this.body);
        this.scene.remove(this.mesh);
        this.scene.remove(this.trail);
    }
}

export class ProjectileManager {
    constructor(scene, physics, particleSystem) {
        this.scene = scene;
        this.physics = physics;
        this.particleSystem = particleSystem;
        this.projectiles = [];
    }

    spawn(position, direction, speed, damage, type, target, options) {
        if (this.projectiles.length >= SETTINGS.performance.maxProjectiles) return null;
        const proj = new Projectile(this.scene, this.physics, position, direction, speed, damage, type, target, options);
        this.projectiles.push(proj);
        return proj;
    }

    update(delta) {
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const proj = this.projectiles[i];
            proj.update(delta);
            if (!proj.alive) {
                const isCannonEnemyHit = (proj.type === 'cannon' || proj.type === 'mortar') && proj.enemyHitExplosionDone;
                if (!isCannonEnemyHit) {
                    this.particleSystem.createExplosion(
                        proj.mesh.position.clone(),
                        proj.type === 'mortar' ? 'massive' : proj.type === 'cannon' ? 'large' : 'small'
                    );
                }
                proj.destroy();
                this.projectiles.splice(i, 1);
            }
        }
    }

    checkCollisions(enemies) {
        for (const proj of this.projectiles) {
            if (!proj.alive) continue;
            for (const enemy of enemies) {
                if (!enemy.alive) continue;
                const dist = proj.body.position.distanceTo(enemy.body.position);
                if (dist <= proj.body.radius + enemy.body.radius) {
                    const hadHit = proj.hit(enemy);
                    if (hadHit && (proj.type === 'cannon' || proj.type === 'mortar') && this.particleSystem) {
                        const burst = enemy.mesh.position.clone();
                        burst.y += 0.65;
                        this.particleSystem.createExplosion(burst, proj.type === 'mortar' ? 'massive' : 'large');
                        if (proj.type === 'mortar') {
                            this.applyMortarAoe(enemy, enemies, proj.damage);
                        }
                    }
                    if (!proj.alive) break;
                }
            }
        }
    }

    applyMortarAoe(mainEnemy, enemies, damage) {
        const center = mainEnemy.body.position.clone();
        const radius = SETTINGS.projectiles.mortar.aoeRadius;
        for (const enemy of enemies) {
            if (!enemy.alive) continue;
            const d = enemy.body.position.distanceTo(center);
            if (d > radius) continue;
            if (enemy.type === 'basic' || enemy.type === 'fast') {
                enemy.takeDamage(enemy.hp + 1);
                const dir = enemy.body.position.clone().sub(center).normalize();
                enemy.body.position.add(dir.multiplyScalar(2.3));
            } else {
                const falloff = 1 - d / radius;
                enemy.takeDamage(damage * Math.max(0.2, falloff));
            }
        }
    }

    clear() {
        for (const proj of this.projectiles) proj.destroy();
        this.projectiles = [];
    }
}
