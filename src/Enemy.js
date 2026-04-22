/** @fileoverview Detailed 3D enemy models with body parts */

import * as THREE from 'three';
import { PhysicsBody } from './Physics.js';

export class Enemy {
    constructor(scene, physics, path, type = 'basic', options = {}) {
        this.scene = scene;
        this.physics = physics;
        this.path = path;
        this.type = type;
        this.pathProgress = 0;
        this.alive = true;
        this.frozen = false;
        this.reachedEnd = false;

        const statsMap = {
            basic: { hp: 100, speed: 7.5, radius: 0.7, reward: 10 },
            fast: { hp: 60, speed: 12.5, radius: 0.5, reward: 15 },
            tank: { hp: 300, speed: 3.75, radius: 1.0, reward: 25 },
            boss: { hp: 1000, speed: 2.5, radius: 1.5, reward: 100 }
        };
        const stats = statsMap[type] || statsMap.basic;
        const hpMultiplier = Math.max(1, options.hpMultiplier ?? 1);
        const scaledHp = Math.round(stats.hp * hpMultiplier);

        this.maxHp = scaledHp;
        this.hp = scaledHp;
        this.speed = stats.speed;
        this.reward = stats.reward;

        this.mesh = this.createModel(type);
        this.scene.add(this.mesh);

        this.createHealthBar();

        const startPos = path.getPositionAt(0);
        this.body = new PhysicsBody(startPos, stats.radius, 1, 'kinematic');
        this.body.gravityScale = 0;
        this.body.userData = { enemy: this };
        this.physics.addBody(this.body);

        this.animTime = Math.random() * 100;
        this.walkCycle = 0;
    }

    createModel(type) {
        const group = new THREE.Group();
        switch (type) {
            case 'basic': return this.createGoblin(group);
            case 'fast': return this.createWolf(group);
            case 'tank': return this.createKnight(group);
            case 'boss': return this.createDragon(group);
            default: return this.createGoblin(group);
        }
    }

    createGoblin(group) {
        const skinMat = new THREE.MeshStandardMaterial({ color: 0x5a8a4a, roughness: 0.7 });
        const clothesMat = new THREE.MeshStandardMaterial({ color: 0x6a3a2a, roughness: 0.8 });
        const darkMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.9 });

        const bodyGeo = new THREE.CylinderGeometry(0.25, 0.3, 0.6, 8);
        const body = new THREE.Mesh(bodyGeo, clothesMat);
        body.position.y = 0.9;
        body.castShadow = true;
        group.add(body);

        const headGeo = new THREE.SphereGeometry(0.22, 8, 8);
        const head = new THREE.Mesh(headGeo, skinMat);
        head.position.y = 1.4;
        head.castShadow = true;
        group.add(head);

        const eyeGeo = new THREE.SphereGeometry(0.05, 6, 6);
        const eyeMat = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0x330000 });
        const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
        leftEye.position.set(-0.08, 1.45, 0.18);
        group.add(leftEye);
        const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
        rightEye.position.set(0.08, 1.45, 0.18);
        group.add(rightEye);

        const earGeo = new THREE.ConeGeometry(0.06, 0.2, 4);
        const leftEar = new THREE.Mesh(earGeo, skinMat);
        leftEar.position.set(-0.15, 1.55, 0);
        leftEar.rotation.z = 0.3;
        group.add(leftEar);
        const rightEar = new THREE.Mesh(earGeo, skinMat);
        rightEar.position.set(0.15, 1.55, 0);
        rightEar.rotation.z = -0.3;
        group.add(rightEar);

        const armGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.4, 6);
        this.leftArm = new THREE.Mesh(armGeo, skinMat);
        this.leftArm.position.set(-0.35, 1.0, 0);
        this.leftArm.rotation.z = 0.3;
        this.leftArm.castShadow = true;
        group.add(this.leftArm);

        this.rightArm = new THREE.Mesh(armGeo, skinMat);
        this.rightArm.position.set(0.35, 1.0, 0);
        this.rightArm.rotation.z = -0.3;
        this.rightArm.castShadow = true;
        group.add(this.rightArm);

        const clubHandleGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.5, 6);
        const clubHandle = new THREE.Mesh(clubHandleGeo, darkMat);
        clubHandle.position.set(0, -0.2, 0.15);
        clubHandle.rotation.x = Math.PI / 2;
        this.rightArm.add(clubHandle);

        const clubHeadGeo = new THREE.SphereGeometry(0.1, 6, 6);
        const clubHead = new THREE.Mesh(clubHeadGeo, darkMat);
        clubHead.position.set(0, -0.45, 0.15);
        this.rightArm.add(clubHead);

        const legGeo = new THREE.CylinderGeometry(0.07, 0.06, 0.5, 6);
        this.leftLeg = new THREE.Mesh(legGeo, darkMat);
        this.leftLeg.position.set(-0.15, 0.35, 0);
        this.leftLeg.castShadow = true;
        group.add(this.leftLeg);

        this.rightLeg = new THREE.Mesh(legGeo, darkMat);
        this.rightLeg.position.set(0.15, 0.35, 0);
        this.rightLeg.castShadow = true;
        group.add(this.rightLeg);

        group.userData.type = 'goblin';
        return group;
    }

    createWolf(group) {
        const furMat = new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 0.8 });
        const darkFurMat = new THREE.MeshStandardMaterial({ color: 0x5a4a2a, roughness: 0.8 });
        const eyeMat = new THREE.MeshStandardMaterial({ color: 0xffcc00, emissive: 0x332200 });

        const bodyGeo = new THREE.CapsuleGeometry(0.25, 0.6, 4, 8);
        const body = new THREE.Mesh(bodyGeo, furMat);
        body.rotation.z = Math.PI / 2;
        body.position.y = 0.7;
        body.castShadow = true;
        group.add(body);

        const headGeo = new THREE.ConeGeometry(0.2, 0.5, 6);
        const head = new THREE.Mesh(headGeo, furMat);
        head.rotation.x = -Math.PI / 2;
        head.position.set(0.5, 0.85, 0);
        head.castShadow = true;
        group.add(head);

        const eyeGeo = new THREE.SphereGeometry(0.04, 6, 6);
        const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
        leftEye.position.set(0.55, 0.9, 0.1);
        group.add(leftEye);
        const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
        rightEye.position.set(0.55, 0.9, -0.1);
        group.add(rightEye);

        const earGeo = new THREE.ConeGeometry(0.06, 0.15, 4);
        const leftEar = new THREE.Mesh(earGeo, darkFurMat);
        leftEar.position.set(0.4, 1.05, 0.1);
        group.add(leftEar);
        const rightEar = new THREE.Mesh(earGeo, darkFurMat);
        rightEar.position.set(0.4, 1.05, -0.1);
        group.add(rightEar);

        const legGeo = new THREE.CylinderGeometry(0.05, 0.04, 0.4, 6);
        this.legs = [];
        const legPositions = [[0.3, 0.2, 0.15], [0.3, 0.2, -0.15], [-0.3, 0.2, 0.15], [-0.3, 0.2, -0.15]];
        for (const pos of legPositions) {
            const leg = new THREE.Mesh(legGeo, darkFurMat);
            leg.position.set(...pos);
            leg.castShadow = true;
            group.add(leg);
            this.legs.push(leg);
        }

        const tailGeo = new THREE.ConeGeometry(0.06, 0.4, 6);
        this.tail = new THREE.Mesh(tailGeo, darkFurMat);
        this.tail.rotation.z = Math.PI / 3;
        this.tail.position.set(-0.5, 0.7, 0);
        group.add(this.tail);

        group.userData.type = 'wolf';
        return group;
    }

    createKnight(group) {
        const armorMat = new THREE.MeshStandardMaterial({ color: 0x6a6a7a, roughness: 0.3, metalness: 0.8 });
        const darkArmorMat = new THREE.MeshStandardMaterial({ color: 0x4a4a5a, roughness: 0.3, metalness: 0.8 });
        const clothMat = new THREE.MeshStandardMaterial({ color: 0x8a2a2a, roughness: 0.8 });

        const bodyGeo = new THREE.CylinderGeometry(0.35, 0.4, 0.8, 8);
        const body = new THREE.Mesh(bodyGeo, armorMat);
        body.position.y = 1.1;
        body.castShadow = true;
        group.add(body);

        const chestGeo = new THREE.BoxGeometry(0.5, 0.4, 0.15);
        const chest = new THREE.Mesh(chestGeo, darkArmorMat);
        chest.position.set(0, 1.2, 0.25);
        group.add(chest);

        const helmetGeo = new THREE.SphereGeometry(0.28, 8, 8);
        const helmet = new THREE.Mesh(helmetGeo, armorMat);
        helmet.position.y = 1.75;
        helmet.castShadow = true;
        group.add(helmet);

        const visorGeo = new THREE.BoxGeometry(0.3, 0.08, 0.15);
        const visor = new THREE.Mesh(visorGeo, darkArmorMat);
        visor.position.set(0, 1.72, 0.2);
        group.add(visor);

        const plumeGeo = new THREE.ConeGeometry(0.08, 0.3, 6);
        const plume = new THREE.Mesh(plumeGeo, clothMat);
        plume.position.set(0, 2.05, -0.1);
        plume.rotation.x = -0.3;
        group.add(plume);

        const shoulderGeo = new THREE.SphereGeometry(0.18, 8, 8);
        const leftShoulder = new THREE.Mesh(shoulderGeo, darkArmorMat);
        leftShoulder.position.set(-0.45, 1.4, 0);
        group.add(leftShoulder);
        const rightShoulder = new THREE.Mesh(shoulderGeo, darkArmorMat);
        rightShoulder.position.set(0.45, 1.4, 0);
        group.add(rightShoulder);

        const armGeo = new THREE.CylinderGeometry(0.1, 0.09, 0.5, 6);
        this.leftArm = new THREE.Mesh(armGeo, armorMat);
        this.leftArm.position.set(-0.5, 1.0, 0);
        this.leftArm.castShadow = true;
        group.add(this.leftArm);

        this.rightArm = new THREE.Mesh(armGeo, armorMat);
        this.rightArm.position.set(0.5, 1.0, 0);
        this.rightArm.castShadow = true;
        group.add(this.rightArm);

        const shieldGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.05, 8);
        const shield = new THREE.Mesh(shieldGeo, clothMat);
        shield.rotation.x = Math.PI / 2;
        shield.position.set(-0.15, -0.1, 0.15);
        this.leftArm.add(shield);

        const rimGeo = new THREE.TorusGeometry(0.35, 0.03, 6, 8);
        const rim = new THREE.Mesh(rimGeo, armorMat);
        rim.position.set(-0.15, -0.1, 0.18);
        this.leftArm.add(rim);

        const swordHandleGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.2, 6);
        const swordHandle = new THREE.Mesh(swordHandleGeo, darkArmorMat);
        swordHandle.position.set(0.15, -0.2, 0.15);
        this.rightArm.add(swordHandle);

        const swordBladeGeo = new THREE.BoxGeometry(0.08, 0.6, 0.02);
        const swordBlade = new THREE.Mesh(swordBladeGeo, armorMat);
        swordBlade.position.set(0.15, -0.55, 0.15);
        this.rightArm.add(swordBlade);

        const legGeo = new THREE.CylinderGeometry(0.13, 0.11, 0.7, 6);
        this.leftLeg = new THREE.Mesh(legGeo, armorMat);
        this.leftLeg.position.set(-0.2, 0.35, 0);
        this.leftLeg.castShadow = true;
        group.add(this.leftLeg);

        this.rightLeg = new THREE.Mesh(legGeo, armorMat);
        this.rightLeg.position.set(0.2, 0.35, 0);
        this.rightLeg.castShadow = true;
        group.add(this.rightLeg);

        group.userData.type = 'knight';
        return group;
    }

    createDragon(group) {
        const scaleMat = new THREE.MeshStandardMaterial({ color: 0x2a4a2a, roughness: 0.6 });
        const bellyMat = new THREE.MeshStandardMaterial({ color: 0x4a6a3a, roughness: 0.7 });
        const darkMat = new THREE.MeshStandardMaterial({ color: 0x1a2a1a, roughness: 0.8 });
        const eyeMat = new THREE.MeshStandardMaterial({ color: 0xff4400, emissive: 0x441100 });

        const bodyGeo = new THREE.CapsuleGeometry(0.5, 1.2, 4, 8);
        const body = new THREE.Mesh(bodyGeo, scaleMat);
        body.rotation.z = Math.PI / 2;
        body.position.y = 1.5;
        body.castShadow = true;
        group.add(body);

        const bellyGeo = new THREE.CapsuleGeometry(0.35, 1.0, 4, 8);
        const belly = new THREE.Mesh(bellyGeo, bellyMat);
        belly.rotation.z = Math.PI / 2;
        belly.position.set(0, 1.35, 0);
        group.add(belly);

        const headGeo = new THREE.ConeGeometry(0.35, 0.8, 6);
        const head = new THREE.Mesh(headGeo, scaleMat);
        head.rotation.x = -Math.PI / 2;
        head.position.set(0.9, 1.7, 0);
        head.castShadow = true;
        group.add(head);

        const eyeGeo = new THREE.SphereGeometry(0.08, 6, 6);
        const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
        leftEye.position.set(1.0, 1.8, 0.15);
        group.add(leftEye);
        const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
        rightEye.position.set(1.0, 1.8, -0.15);
        group.add(rightEye);

        const hornGeo = new THREE.ConeGeometry(0.06, 0.3, 6);
        const leftHorn = new THREE.Mesh(hornGeo, darkMat);
        leftHorn.position.set(0.7, 2.1, 0.15);
        leftHorn.rotation.z = -0.4;
        group.add(leftHorn);
        const rightHorn = new THREE.Mesh(hornGeo, darkMat);
        rightHorn.position.set(0.7, 2.1, -0.15);
        rightHorn.rotation.z = -0.4;
        group.add(rightHorn);

        const wingGeo = new THREE.BoxGeometry(0.8, 0.05, 0.5);
        this.leftWing = new THREE.Mesh(wingGeo, darkMat);
        this.leftWing.position.set(0, 1.8, 0.5);
        this.leftWing.rotation.z = 0.3;
        this.leftWing.rotation.y = 0.3;
        group.add(this.leftWing);

        this.rightWing = new THREE.Mesh(wingGeo, darkMat);
        this.rightWing.position.set(0, 1.8, -0.5);
        this.rightWing.rotation.z = 0.3;
        this.rightWing.rotation.y = -0.3;
        group.add(this.rightWing);

        const membraneGeo = new THREE.PlaneGeometry(0.7, 0.4);
        const membraneMat = new THREE.MeshStandardMaterial({ color: 0x3a5a3a, roughness: 0.8, side: THREE.DoubleSide });
        const leftMembrane = new THREE.Mesh(membraneGeo, membraneMat);
        leftMembrane.position.set(0.1, 0, 0.05);
        this.leftWing.add(leftMembrane);
        const rightMembrane = new THREE.Mesh(membraneGeo, membraneMat);
        rightMembrane.position.set(0.1, 0, -0.05);
        this.rightWing.add(rightMembrane);

        const legGeo = new THREE.CylinderGeometry(0.12, 0.1, 0.6, 6);
        this.legs = [];
        const legPositions = [[0.3, 0.3, 0.25], [0.3, 0.3, -0.25], [-0.3, 0.3, 0.25], [-0.3, 0.3, -0.25]];
        for (const pos of legPositions) {
            const leg = new THREE.Mesh(legGeo, scaleMat);
            leg.position.set(...pos);
            leg.castShadow = true;
            group.add(leg);
            this.legs.push(leg);
        }

        const tailGeo = new THREE.ConeGeometry(0.15, 1.0, 6);
        this.tail = new THREE.Mesh(tailGeo, darkMat);
        this.tail.rotation.z = Math.PI / 2.5;
        this.tail.position.set(-1.0, 1.2, 0);
        group.add(this.tail);

        for (let i = 0; i < 4; i++) {
            const spikeGeo = new THREE.ConeGeometry(0.04, 0.15, 4);
            const spike = new THREE.Mesh(spikeGeo, darkMat);
            spike.position.set(-0.8 - i * 0.2, 1.3 + i * 0.05, 0);
            spike.rotation.z = -0.5;
            group.add(spike);
        }

        group.userData.type = 'dragon';
        return group;
    }

    createHealthBar() {
        const barWidth = 1.0;
        const barHeight = 0.12;
        const bgGeo = new THREE.PlaneGeometry(barWidth, barHeight);
        const bgMat = new THREE.MeshBasicMaterial({ color: 0x330000, side: THREE.DoubleSide });
        this.healthBg = new THREE.Mesh(bgGeo, bgMat);
        this.scene.add(this.healthBg);
        const barGeo = new THREE.PlaneGeometry(barWidth, barHeight);
        const barMat = new THREE.MeshBasicMaterial({ color: 0x22cc22, side: THREE.DoubleSide });
        this.healthBar = new THREE.Mesh(barGeo, barMat);
        this.scene.add(this.healthBar);
    }

    update(delta, time) {
        if (!this.alive || this.frozen) return;
        this.animTime += delta;
        this.walkCycle += delta * this.speed * 3;
        const pathSpeed = this.speed / this.path.getTotalLength();
        this.pathProgress += pathSpeed * delta;
        if (this.pathProgress >= 1) {
            this.reachedEnd = true;
            this.alive = false;
            return;
        }
        const targetPos = this.path.getPositionAt(this.pathProgress);
        const tangent = this.path.getTangentAt(this.pathProgress);
        this.body.position.copy(targetPos);
        this.body.position.y = this.body.radius;
        this.mesh.position.copy(this.body.position);
        const targetAngle = Math.atan2(tangent.x, tangent.z);
        let angleDiff = targetAngle - this.mesh.rotation.y;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        this.mesh.rotation.y += angleDiff * 5 * delta;
        this.animate(delta);
        const hpRatio = Math.max(0, this.hp / this.maxHp);
        this.healthBar.scale.x = hpRatio;
        this.healthBar.position.copy(this.mesh.position);
        this.healthBar.position.y += this.body.radius + 0.8;
        this.healthBar.lookAt(this.scene.userData.camera?.position || new THREE.Vector3(0, 20, 30));
        this.healthBg.position.copy(this.healthBar.position);
        this.healthBg.position.z -= 0.01;
        this.healthBg.lookAt(this.scene.userData.camera?.position || new THREE.Vector3(0, 20, 30));
    }

    animate(delta) {
        const walk = this.walkCycle;
        const type = this.mesh.userData.type;
        if (type === 'goblin') {
            if (this.leftArm) this.leftArm.rotation.x = Math.sin(walk) * 0.5;
            if (this.rightArm) this.rightArm.rotation.x = Math.sin(walk + Math.PI) * 0.5;
            if (this.leftLeg) this.leftLeg.rotation.x = Math.sin(walk + Math.PI) * 0.4;
            if (this.rightLeg) this.rightLeg.rotation.x = Math.sin(walk) * 0.4;
            this.mesh.position.y += Math.sin(walk * 2) * 0.02;
        } else if (type === 'wolf') {
            if (this.legs) {
                this.legs[0].rotation.x = Math.sin(walk) * 0.4;
                this.legs[1].rotation.x = Math.sin(walk + Math.PI) * 0.4;
                this.legs[2].rotation.x = Math.sin(walk + Math.PI * 0.5) * 0.4;
                this.legs[3].rotation.x = Math.sin(walk + Math.PI * 1.5) * 0.4;
            }
            if (this.tail) this.tail.rotation.y = Math.sin(walk * 2) * 0.3;
            this.mesh.position.y += Math.sin(walk * 2) * 0.03;
        } else if (type === 'knight') {
            if (this.leftLeg) this.leftLeg.rotation.x = Math.sin(walk) * 0.25;
            if (this.rightLeg) this.rightLeg.rotation.x = Math.sin(walk + Math.PI) * 0.25;
            if (this.leftArm) this.leftArm.rotation.x = Math.sin(walk + Math.PI) * 0.2;
            if (this.rightArm) this.rightArm.rotation.x = Math.sin(walk) * 0.2;
            this.mesh.position.y += Math.sin(walk * 2) * 0.01;
        } else if (type === 'dragon') {
            if (this.leftWing) this.leftWing.rotation.z = 0.3 + Math.sin(walk * 0.5) * 0.2;
            if (this.rightWing) this.rightWing.rotation.z = 0.3 + Math.sin(walk * 0.5) * 0.2;
            if (this.legs) {
                this.legs[0].rotation.x = Math.sin(walk) * 0.3;
                this.legs[1].rotation.x = Math.sin(walk + Math.PI) * 0.3;
                this.legs[2].rotation.x = Math.sin(walk + Math.PI * 0.5) * 0.3;
                this.legs[3].rotation.x = Math.sin(walk + Math.PI * 1.5) * 0.3;
            }
            if (this.tail) this.tail.rotation.y = Math.sin(walk * 0.5) * 0.2;
            this.mesh.position.y += Math.sin(walk) * 0.04;
        }
    }

    takeDamage(amount) {
        this.hp = Math.max(0, this.hp - amount);
        this.mesh.traverse((child) => {
            if (child.isMesh && child.material) {
                if (!child.userData.originalColor) child.userData.originalColor = child.material.color.clone();
                child.material.color.setHex(0xffffff);
            }
        });
        setTimeout(() => {
            if (!this.mesh) return;
            this.mesh.traverse((child) => {
                if (child.isMesh && child.material && child.userData.originalColor) {
                    child.material.color.copy(child.userData.originalColor);
                }
            });
        }, 100);
        if (this.hp <= 0.001) {
            this.hp = 0;
            this.alive = false;
        }
        return !this.alive;
    }

    destroy() {
        this.alive = false;
        this.physics.removeBody(this.body);
        this.scene.remove(this.mesh);
        this.scene.remove(this.healthBar);
        this.scene.remove(this.healthBg);
    }
}