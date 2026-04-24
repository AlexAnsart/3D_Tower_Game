import * as THREE from 'three';
import { SETTINGS, getTowerStats } from './settings.js';

export class Tower {
    constructor(scene, physics, x, z, type = 'blaster', y = 0, level = 1) {
        this.scene = scene;
        this.physics = physics;
        this.type = type;
        this.level = level;
        this.stats = getTowerStats(type, level);
        this.position = new THREE.Vector3(x, y, z);
        this.target = null;
        this.cooldown = 0;
        this.range = this.stats.range;
        this.damage = this.stats.damage;
        this.rotationSpeed = 8;
        this.costPaid = this.stats.cost;
        this.flameTimer = 0;
        this.flameDurationLeft = 0;
        this.flameLastHitTime = 0;
        this.isFlamethrower = type === 'sniper';

        this.config = {
            cooldown: this.stats.cooldown,
            projectileSpeed: this.stats.projectileSpeed,
            arc: !!this.stats.arc
        };

        this.mesh = this.createModel(type);
        this.mesh.scale.setScalar(this.stats.scale);
        this.scene.add(this.mesh);
        this.deleteMarked = false;
        this.initPlacementAnimation();
        this.createRangeIndicator();
    }

    createModel(type) {
        const group = new THREE.Group();
        group.position.copy(this.position);

        switch (type) {
            case 'blaster': return this.createArcherTower(group);
            case 'cannon': return this.createCannonTower(group);
            case 'mortar': return this.createMortarTower(group);
            case 'sniper': return this.createMageTower(group);
            default: return this.createArcherTower(group);
        }
    }

    createArcherTower(group) {
        const stoneMat = new THREE.MeshStandardMaterial({ color: 0x8a8a7a, roughness: 0.85 });
        const woodMat = new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 0.9 });
        const roofMat = new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 0.9 });
        const darkWoodMat = new THREE.MeshStandardMaterial({ color: 0x4a2a1a, roughness: 0.9 });

        // Stone base
        const baseGeo = new THREE.CylinderGeometry(0.9, 1.0, 1.2, 10);
        const base = new THREE.Mesh(baseGeo, stoneMat);
        base.position.y = 0.6;
        base.castShadow = true;
        base.receiveShadow = true;
        group.add(base);

        // Wood pillar
        const pillarGeo = new THREE.CylinderGeometry(0.6, 0.7, 1.5, 8);
        const pillar = new THREE.Mesh(pillarGeo, woodMat);
        pillar.position.y = 1.95;
        pillar.castShadow = true;
        group.add(pillar);

        // Support beams
        for (let i = 0; i < 4; i++) {
            const angle = (i / 4) * Math.PI * 2;
            const beamGeo = new THREE.BoxGeometry(0.12, 1.0, 0.12);
            const beam = new THREE.Mesh(beamGeo, darkWoodMat);
            beam.position.set(Math.cos(angle) * 0.5, 1.5, Math.sin(angle) * 0.5);
            beam.rotation.z = Math.cos(angle) * 0.2;
            beam.rotation.x = Math.sin(angle) * 0.2;
            group.add(beam);
        }

        // Upper platform
        const platformGeo = new THREE.CylinderGeometry(1.1, 0.9, 0.2, 10);
        const platform = new THREE.Mesh(platformGeo, stoneMat);
        platform.position.y = 2.8;
        platform.castShadow = true;
        group.add(platform);

        // Roof
        const roofGeo = new THREE.ConeGeometry(1.2, 1.0, 8);
        const roof = new THREE.Mesh(roofGeo, roofMat);
        roof.position.y = 3.4;
        roof.castShadow = true;
        group.add(roof);

        // === TURRET GROUP - this rotates to aim ===
        this.turret = new THREE.Group();
        this.turret.position.set(0, 2.8, 0);
        group.add(this.turret);

        // Bow mount
        const mountGeo = new THREE.BoxGeometry(0.3, 0.3, 0.3);
        const mount = new THREE.Mesh(mountGeo, darkWoodMat);
        mount.position.y = 0.2;
        this.turret.add(mount);

        // Bow (curved)
        const bowGeo = new THREE.TorusGeometry(0.3, 0.03, 6, 12, Math.PI);
        const bow = new THREE.Mesh(bowGeo, darkWoodMat);
        bow.rotation.y = Math.PI / 2;
        bow.position.set(0, 0.2, 0.3);
        this.turret.add(bow);

        // Bow string
        const stringGeo = new THREE.CylinderGeometry(0.005, 0.005, 0.6, 4);
        const stringMat = new THREE.MeshStandardMaterial({ color: 0xddddaa });
        const string = new THREE.Mesh(stringGeo, stringMat);
        string.rotation.x = Math.PI / 2;
        string.position.set(0, 0.2, 0.3);
        this.turret.add(string);

        // Arrow
        const arrowShaftGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.5, 4);
        const arrowShaft = new THREE.Mesh(arrowShaftGeo, woodMat);
        arrowShaft.rotation.x = Math.PI / 2;
        arrowShaft.position.set(0, 0.2, 0.3);
        this.turret.add(arrowShaft);

        const arrowHeadGeo = new THREE.ConeGeometry(0.04, 0.1, 4);
        const arrowHeadMat = new THREE.MeshStandardMaterial({ color: 0x666666, metalness: 0.8 });
        const arrowHead = new THREE.Mesh(arrowHeadGeo, arrowHeadMat);
        arrowHead.rotation.x = -Math.PI / 2;
        arrowHead.position.set(0, 0.2, 0.6);
        this.turret.add(arrowHead);

        // Muzzle point (where projectile spawns) - LOCAL to turret
        this.muzzlePoint = new THREE.Vector3(0, 0.2, 0.7);

        // Flag
        const flagPoleGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.8, 4);
        const flagPole = new THREE.Mesh(flagPoleGeo, darkWoodMat);
        flagPole.position.set(0, 3.8, 0);
        group.add(flagPole);

        const flagGeo = new THREE.BoxGeometry(0.4, 0.25, 0.02);
        const flagMat = new THREE.MeshStandardMaterial({ color: 0x2a5a2a });
        const flag = new THREE.Mesh(flagGeo, flagMat);
        flag.position.set(0.2, 4.1, 0);
        group.add(flag);

        return group;
    }

    createCannonTower(group) {
        const stoneMat = new THREE.MeshStandardMaterial({ color: 0x7a7a6a, roughness: 0.9 });
        const darkStoneMat = new THREE.MeshStandardMaterial({ color: 0x5a5a4a, roughness: 0.9 });
        const metalMat = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.4, metalness: 0.9 });
        const woodMat = new THREE.MeshStandardMaterial({ color: 0x5a3a1a, roughness: 0.9 });

        // Thick stone base
        const baseGeo = new THREE.CylinderGeometry(1.1, 1.2, 1.5, 10);
        const base = new THREE.Mesh(baseGeo, stoneMat);
        base.position.y = 0.75;
        base.castShadow = true;
        base.receiveShadow = true;
        group.add(base);

        // Stone blocks
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            const blockGeo = new THREE.BoxGeometry(0.25, 0.4, 0.1);
            const block = new THREE.Mesh(blockGeo, darkStoneMat);
            block.position.set(Math.cos(angle) * 1.05, 0.5, Math.sin(angle) * 1.05);
            block.rotation.y = -angle;
            group.add(block);
        }

        // Upper cylinder
        const upperGeo = new THREE.CylinderGeometry(0.9, 1.0, 1.0, 10);
        const upper = new THREE.Mesh(upperGeo, stoneMat);
        upper.position.y = 2.0;
        upper.castShadow = true;
        group.add(upper);

        // Battlements
        for (let i = 0; i < 6; i++) {
            const angle = (i / 6) * Math.PI * 2;
            const battlementGeo = new THREE.BoxGeometry(0.3, 0.3, 0.15);
            const battlement = new THREE.Mesh(battlementGeo, darkStoneMat);
            battlement.position.set(Math.cos(angle) * 0.85, 2.6, Math.sin(angle) * 0.85);
            battlement.rotation.y = -angle;
            group.add(battlement);
        }

        // === TURRET GROUP ===
        this.turret = new THREE.Group();
        this.turret.position.set(0, 2.28, 0);
        group.add(this.turret);

        // Cannon base
        const swivelGeo = new THREE.CylinderGeometry(0.3, 0.35, 0.3, 8);
        const swivel = new THREE.Mesh(swivelGeo, metalMat);
        swivel.position.y = 0.42;
        this.turret.add(swivel);

        // Cannon barrel
        const barrelGeo = new THREE.CylinderGeometry(0.12, 0.15, 1.2, 8);
        const barrel = new THREE.Mesh(barrelGeo, metalMat);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.64, 0.5);
        barrel.castShadow = true;
        this.turret.add(barrel);

        // Muzzle ring
        const muzzleGeo = new THREE.TorusGeometry(0.15, 0.03, 6, 8);
        const muzzle = new THREE.Mesh(muzzleGeo, metalMat);
        muzzle.rotation.x = Math.PI / 2;
        muzzle.position.set(0, 0.64, 1.1);
        this.turret.add(muzzle);

        // Wheels
        const wheelGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.08, 8);
        const wheelMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1a });
        const leftWheel = new THREE.Mesh(wheelGeo, wheelMat);
        leftWheel.rotation.z = Math.PI / 2;
        leftWheel.position.set(-0.35, 0.1, 0);
        this.turret.add(leftWheel);
        const rightWheel = new THREE.Mesh(wheelGeo, wheelMat);
        rightWheel.rotation.z = Math.PI / 2;
        rightWheel.position.set(0.35, 0.1, 0);
        this.turret.add(rightWheel);

        // Muzzle point
        this.muzzlePoint = new THREE.Vector3(0, 0.64, 1.2);

        // Flag
        const flagPoleGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.6, 4);
        const flagPole = new THREE.Mesh(flagPoleGeo, woodMat);
        flagPole.position.set(0, 3.0, 0);
        group.add(flagPole);

        const flagGeo = new THREE.BoxGeometry(0.35, 0.22, 0.02);
        const flagMat = new THREE.MeshStandardMaterial({ color: 0x8a2a2a });
        const flag = new THREE.Mesh(flagGeo, flagMat);
        flag.position.set(0.17, 3.25, 0);
        group.add(flag);

        return group;
    }

    createMageTower(group) {
        const stoneMat = new THREE.MeshStandardMaterial({ color: 0x7a7a8a, roughness: 0.8 });
        const crystalMat = new THREE.MeshStandardMaterial({ color: 0x4a6aaa, roughness: 0.2, metalness: 0.3, transparent: true, opacity: 0.9 });
        const goldMat = new THREE.MeshStandardMaterial({ color: 0xaa8833, roughness: 0.3, metalness: 0.9 });
        const woodMat = new THREE.MeshStandardMaterial({ color: 0x4a2a1a, roughness: 0.9 });

        // Elegant tall base
        const baseGeo = new THREE.CylinderGeometry(0.7, 0.9, 2.0, 8);
        const base = new THREE.Mesh(baseGeo, stoneMat);
        base.position.y = 1.0;
        base.castShadow = true;
        base.receiveShadow = true;
        group.add(base);

        // Gold bands
        const bandGeo = new THREE.TorusGeometry(0.75, 0.04, 6, 16);
        const band1 = new THREE.Mesh(bandGeo, goldMat);
        band1.rotation.x = Math.PI / 2;
        band1.position.y = 0.5;
        group.add(band1);
        const band2 = new THREE.Mesh(bandGeo, goldMat);
        band2.rotation.x = Math.PI / 2;
        band2.position.y = 1.5;
        group.add(band2);

        // Crystal holder
        const holderGeo = new THREE.CylinderGeometry(0.5, 0.7, 0.5, 8);
        const holder = new THREE.Mesh(holderGeo, stoneMat);
        holder.position.y = 2.25;
        group.add(holder);

        // === TURRET GROUP ===
        this.turret = new THREE.Group();
        this.turret.position.set(0, 2.5, 0);
        group.add(this.turret);

        // Crystal orb
        const orbGeo = new THREE.IcosahedronGeometry(0.25, 2);
        const orb = new THREE.Mesh(orbGeo, crystalMat);
        orb.position.y = 0.2;
        this.turret.add(orb);
        this.orb = orb;

        // Ring
        const ringGeo = new THREE.TorusGeometry(0.3, 0.03, 6, 12);
        const ring = new THREE.Mesh(ringGeo, goldMat);
        ring.rotation.x = Math.PI / 2;
        ring.position.y = 0.05;
        this.turret.add(ring);

        // Staff
        const staffGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.0, 6);
        const staff = new THREE.Mesh(staffGeo, woodMat);
        staff.rotation.x = Math.PI / 2;
        staff.position.set(0, 0.2, 0.4);
        this.turret.add(staff);

        // Staff tip
        const tipGeo = new THREE.OctahedronGeometry(0.08, 0);
        const tip = new THREE.Mesh(tipGeo, crystalMat);
        tip.position.set(0, 0.2, 0.9);
        this.turret.add(tip);

        // Muzzle point
        this.muzzlePoint = new THREE.Vector3(0, 0.2, 1.0);

        // Floating crystals
        for (let i = 0; i < 3; i++) {
            const floatGeo = new THREE.OctahedronGeometry(0.08, 0);
            const floatCrystal = new THREE.Mesh(floatGeo, crystalMat);
            const angle = (i / 3) * Math.PI * 2;
            floatCrystal.position.set(Math.cos(angle) * 0.6, 1.5 + i * 0.3, Math.sin(angle) * 0.6);
            floatCrystal.userData = { baseY: 1.5 + i * 0.3, phase: i * 2 };
            group.add(floatCrystal);
        }

        // Tall spire
        const spireGeo = new THREE.ConeGeometry(0.3, 1.2, 6);
        const spire = new THREE.Mesh(spireGeo, stoneMat);
        spire.position.y = 3.3;
        spire.castShadow = true;
        group.add(spire);

        // Spire tip
        const spireTipGeo = new THREE.OctahedronGeometry(0.1, 0);
        const spireTip = new THREE.Mesh(spireTipGeo, crystalMat);
        spireTip.position.y = 3.9;
        group.add(spireTip);

        // Flag
        const flagPoleGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.5, 4);
        const flagPole = new THREE.Mesh(flagPoleGeo, woodMat);
        flagPole.position.set(0, 4.1, 0);
        group.add(flagPole);

        const flagGeo = new THREE.BoxGeometry(0.3, 0.2, 0.02);
        const flagMat = new THREE.MeshStandardMaterial({ color: 0x2a2a6a });
        const flag = new THREE.Mesh(flagGeo, flagMat);
        flag.position.set(0.15, 4.3, 0);
        group.add(flag);

        return group;
    }

    createMortarTower(group) {
        const stoneMat = new THREE.MeshStandardMaterial({ color: 0x82776a, roughness: 0.9 });
        const metalMat = new THREE.MeshStandardMaterial({ color: 0x3e3e3e, roughness: 0.35, metalness: 0.9 });
        const base = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.8, 1.8, 10), stoneMat);
        base.position.y = 0.9;
        base.castShadow = true;
        group.add(base);
        this.turret = new THREE.Group();
        this.turret.position.set(0, 2.0, 0);
        group.add(this.turret);
        const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 1.8, 12), metalMat);
        bowl.rotation.x = Math.PI / 2.7;
        bowl.position.set(0, 0.2, 0.6);
        bowl.castShadow = true;
        this.turret.add(bowl);
        this.muzzlePoint = new THREE.Vector3(0, 0.9, 1.3);
        return group;
    }

    createRangeIndicator() {
        const geometry = new THREE.RingGeometry(this.range - 0.2, this.range, 64);
        const material = new THREE.MeshBasicMaterial({
            color: 0xccbb88,
            transparent: true,
            opacity: 0.15,
            side: THREE.DoubleSide
        });
        this.rangeIndicator = new THREE.Mesh(geometry, material);
        this.rangeIndicator.rotation.x = -Math.PI / 2;
        this.rangeIndicator.position.copy(this.position);
        this.rangeIndicator.position.y = this.position.y + 0.05;
        this.rangeIndicator.visible = false;
        this.scene.add(this.rangeIndicator);
    }

    findTarget(enemies) {
        let bestTarget = null;
        let bestDist = Infinity;
        for (const enemy of enemies) {
            if (!enemy.alive) continue;
            const dist = this.position.distanceTo(enemy.mesh.position);
            if (dist <= this.range && dist < bestDist) {
                bestDist = dist;
                bestTarget = enemy;
            }
        }
        this.target = bestTarget;
        return bestTarget;
    }

    update(delta, enemies, projectileManager, time, audio) {
        this.updatePlacementAnimation(delta);
        this.cooldown -= delta;
        const target = this.findTarget(enemies);

        if (target) {
            // Predict future position based on projectile speed
            // Use 2 iterations for high accuracy
            let dist = this.position.distanceTo(target.mesh.position);
            let timeToHit = dist / this.config.projectileSpeed;
            
            let predictedProgress = target.pathProgress + (target.speed / target.path.getTotalLength()) * timeToHit;
            predictedProgress = Math.min(1.0, predictedProgress);
            let targetPos = target.path.getPositionAt(predictedProgress);
            
            // Second iteration for better accuracy
            dist = this.position.distanceTo(targetPos);
            timeToHit = dist / this.config.projectileSpeed;
            predictedProgress = target.pathProgress + (target.speed / target.path.getTotalLength()) * timeToHit;
            predictedProgress = Math.min(1.0, predictedProgress);
            targetPos = target.path.getPositionAt(predictedProgress);

            // Add target's center height offset
            targetPos.y += target.body.radius || 0.5;

            const dx = targetPos.x - this.position.x;
            const dz = targetPos.z - this.position.z;
            const targetAngle = Math.atan2(dx, dz);

            // Smoothly rotate the ENTIRE TOWER toward target
            let angleDiff = targetAngle - this.mesh.rotation.y;
            while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
            while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
            this.mesh.rotation.y += angleDiff * this.rotationSpeed * delta;

            // Also rotate turret if it exists (for visual variety)
            if (this.turret) {
                this.turret.rotation.y = 0; // turret faces same direction as tower
            }

            if (this.cooldown <= 0) {
                this.mesh.rotation.y = targetAngle;
                this.fire(projectileManager, target, targetPos, audio);
                this.cooldown = this.config.cooldown;
            }
        }

        if (this.isFlamethrower && this.flameDurationLeft > 0) {
            this.flameDurationLeft -= delta;
            this.applyFlameDamage(enemies, time);
        }

        if (this.orb) {
            this.orb.rotation.y += delta * 2;
            this.orb.rotation.x += delta;
        }
    }

    fire(projectileManager, target, predictedPos, audio) {
        const towerRotation = this.mesh.rotation.y;
        const towerScale = this.mesh.scale.x || 1;

        const localMuzzle = this.muzzlePoint ? this.muzzlePoint.clone() : new THREE.Vector3(0, 2.5, 1.0);
        if (this.turret) {
            localMuzzle.add(this.turret.position);
        }
        // The model is uniformly scaled, so local muzzle coordinates must be scaled too.
        localMuzzle.multiplyScalar(towerScale);

        const worldMuzzle = localMuzzle.clone();
        worldMuzzle.applyAxisAngle(new THREE.Vector3(0, 1, 0), towerRotation);
        // Use live mesh position (includes placement animation), not static base position.
        worldMuzzle.add(this.mesh.position);

        // Calculate exact direction from muzzle to target
        const direction = new THREE.Vector3().subVectors(predictedPos, worldMuzzle);
        
        const distXZ = Math.sqrt(direction.x * direction.x + direction.z * direction.z);
        const dy = direction.y;
        const flatDir = direction.clone();
        flatDir.y = 0;
        if (flatDir.lengthSq() < 0.000001) flatDir.set(0, 0, 1);
        flatDir.normalize();

        if (this.type === 'mortar') {
            // Intentionally very high ballistic arc: shoot upward first, then crash down.
            const g = 28;
            const maxLevel = SETTINGS.towers.levelMax || 10;
            const levelRatio = THREE.MathUtils.clamp((this.level - 1) / Math.max(1, maxLevel - 1), 0, 1);
            const apexBoost = THREE.MathUtils.lerp(1.0, 2.0, levelRatio);
            const desiredApexY = Math.max(worldMuzzle.y, predictedPos.y) + (Math.max(16, distXZ * 0.7) * apexBoost);
            const upHeight = Math.max(1, desiredApexY - worldMuzzle.y);
            const downHeight = Math.max(1, desiredApexY - predictedPos.y);
            const vy = Math.sqrt(2 * g * upHeight);
            const flightTime = (vy / g) + Math.sqrt((2 * downHeight) / g);
            const horizontalSpeed = distXZ / Math.max(0.12, flightTime);
            direction.copy(flatDir.multiplyScalar(horizontalSpeed));
            direction.y = vy;
        } else {
            // Physics gravity compensation for normal ballistic aim.
            const g = this.config.arc ? 16 : 2;
            const t = distXZ / Math.max(0.1, this.config.projectileSpeed);
            const vy = (dy + 0.5 * g * t * t) / Math.max(0.05, t);
            direction.copy(flatDir.multiplyScalar(this.config.projectileSpeed));
            direction.y = vy;
        }
        
        const newSpeed = direction.length();
        direction.normalize();

        if (this.type === 'sniper') {
            audio?.play('mageFire');
            this.flameDurationLeft = this.stats.flameDuration;
            projectileManager.spawn(worldMuzzle, direction, newSpeed, this.damage, 'sniper', target, {
                flame: true,
                sizeMultiplier: towerScale
            });
            return;
        }
        if (this.type === 'cannon') audio?.play('cannonShot');
        if (this.type === 'mortar') audio?.play('mortarShot');
        projectileManager.spawn(worldMuzzle, direction, newSpeed, this.damage, this.type, target, {
            sizeMultiplier: towerScale
        });

        // Recoil animation
        if (this.turret) {
            this.turret.position.z -= 0.08;
            setTimeout(() => { if (this.turret) this.turret.position.z += 0.08; }, 80);
        }
    }

    applyFlameDamage(enemies, time) {
        if (time - this.flameLastHitTime < this.stats.flameTickInterval) return;
        this.flameLastHitTime = time;
        for (const enemy of enemies) {
            if (!enemy.alive) continue;
            if (enemy.mesh.position.distanceTo(this.position) <= this.stats.flameAoeRadius) {
                enemy.takeDamage(this.damage * this.stats.flameTickInterval * 0.7);
            }
        }
    }

    initPlacementAnimation() {
        const bbox = new THREE.Box3().setFromObject(this.mesh);
        const towerHeight = Math.max(0.6, bbox.max.y - bbox.min.y);
        this.placementDuration = 1.0;
        this.placementElapsed = 0;
        this.basePlacementY = this.mesh.position.y;
        this.startPlacementY = this.basePlacementY + towerHeight * 0.5;
        this.mesh.position.y = this.startPlacementY;
        this.isPlacing = true;
    }

    updatePlacementAnimation(delta) {
        if (!this.isPlacing) return;
        this.placementElapsed += delta;
        const t = Math.min(1, this.placementElapsed / this.placementDuration);
        const eased = 1 - Math.pow(1 - t, 3);
        this.mesh.position.y = THREE.MathUtils.lerp(this.startPlacementY, this.basePlacementY, eased);
        if (t >= 1) {
            this.mesh.position.y = this.basePlacementY;
            this.isPlacing = false;
        }
    }

    showRange(show) {
        this.rangeIndicator.visible = show;
    }

    setDeleteMarked(marked) {
        if (this.deleteMarked === marked) return;
        this.deleteMarked = marked;
        this.mesh.traverse((child) => {
            if (!child.isMesh || !child.material) return;
            const mat = child.material;
            if (!mat.userData.originalColor && mat.color) {
                mat.userData.originalColor = mat.color.clone();
            }
            if (!mat.userData.originalEmissive && mat.emissive) {
                mat.userData.originalEmissive = mat.emissive.clone();
            }
            if (marked) {
                if (mat.color) mat.color.setHex(0xbf2f2f);
                if (mat.emissive) {
                    mat.emissive.setHex(0x5a1111);
                    mat.emissiveIntensity = 0.65;
                }
            } else {
                if (mat.color && mat.userData.originalColor) mat.color.copy(mat.userData.originalColor);
                if (mat.emissive && mat.userData.originalEmissive) {
                    mat.emissive.copy(mat.userData.originalEmissive);
                    mat.emissiveIntensity = 0.0;
                }
            }
        });
    }

    destroy() {
        this.setDeleteMarked(false);
        this.scene.remove(this.mesh);
        this.scene.remove(this.rangeIndicator);
    }
}