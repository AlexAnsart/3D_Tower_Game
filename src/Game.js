/** @fileoverview Main game controller with standard keyboard/mouse navigation */

import * as THREE from 'three';
import { Board } from './Board.js';
import { Path } from './Path.js';
import { Tower } from './Tower.js';
import { Enemy } from './Enemy.js';
import { ProjectileManager } from './Projectile.js';
import { ParticleSystem } from './ParticleSystem.js';
import { Physics } from './Physics.js';
import { SETTINGS, getTowerStats, clampTowerLevel } from './settings.js';
import { AudioManager } from './audio/AudioManager.js';
import { AgentController } from './ai/AgentController.js';

export class Game {
    constructor(scene, camera, controls, renderer) {
        this.scene = scene;
        this.camera = camera;
        this.controls = controls;
        this.renderer = renderer;
        scene.userData.camera = camera;

        this.physics = new Physics.World();
        this.physics.groundY = 0;

        this.path = new Path(scene);
        this.board = new Board(scene, this.physics, this.path);
        this.particleSystem = new ParticleSystem(scene);
        this.projectileManager = new ProjectileManager(scene, this.physics, this.particleSystem);
        this.audio = new AudioManager();
        this.agentController = new AgentController(this);

        this.towers = [];
        this.enemies = [];

        this.energy = SETTINGS.economy.startingGold;
        this.lives = SETTINGS.economy.startingLives;
        this.score = 0;
        this.wave = 1;
        this.selectedTowerType = 'blaster';
        this.selectedTowerLevel = 1;
        this.armedDeleteTower = null;
        this.armedDeleteExpireAt = 0;
        this.gameState = 'playing';

        this.waveInProgress = false;
        this.enemiesToSpawn = [];
        this.spawnTimer = 0;
        this.waveEnemyCount = 0;
        this.waveEnemiesKilled = 0;
        this.waveHpMultiplier = 1;
        this.waveInfoTimeout = null;

        this.time = 0;
        this.gameTime = 0;

        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.hoverSpot = null;
        this.previewTower = null;

        // Spectator camera state (Minecraft-like free flight)
        this.keys = {};
        this.cameraSpeed = 52;
        this.cameraPitch = 0;
        this.cameraYaw = 0;
        this.mouseLookSensitivity = 0.0025;
        this.isLookDragging = false;
        this.lookDragButton = -1;
        this.lastMouseX = 0;
        this.lastMouseY = 0;
        this.lookDragStartX = 0;
        this.lookDragStartY = 0;
        this.lookDragMoved = false;

        this.setupLights();
        this.setupInput();
        this.startWave();
    }

    setupLights() {
        const ambient = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambient);

        const sunLight = new THREE.DirectionalLight(0xfff5e0, 1.2);
        sunLight.position.set(70, 90, 45);
        sunLight.castShadow = true;
        sunLight.shadow.mapSize.width = 2048;
        sunLight.shadow.mapSize.height = 2048;
        sunLight.shadow.camera.near = 0.5;
        sunLight.shadow.camera.far = 520;
        sunLight.shadow.camera.left = -220;
        sunLight.shadow.camera.right = 220;
        sunLight.shadow.camera.top = 220;
        sunLight.shadow.camera.bottom = -220;
        sunLight.shadow.bias = -0.0005;
        this.scene.add(sunLight);

        const fillLight = new THREE.DirectionalLight(0xcce0ff, 0.3);
        fillLight.position.set(-60, 50, -55);
        this.scene.add(fillLight);

        const hemiLight = new THREE.HemisphereLight(0x87CEEB, 0x5a8a3a, 0.4);
        this.scene.add(hemiLight);
    }

    setupInput() {
        const canvas = this.controls.domElement;
        this.syncCameraAnglesFromCurrentView();
        canvas.addEventListener('contextmenu', (e) => e.preventDefault());
        canvas.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
        canvas.addEventListener('mousedown', (e) => {
            if (e.button !== 0 && e.button !== 2) return;
            this.isLookDragging = true;
            this.lookDragButton = e.button;
            this.lastMouseX = e.clientX;
            this.lastMouseY = e.clientY;
            this.lookDragStartX = e.clientX;
            this.lookDragStartY = e.clientY;
            this.lookDragMoved = false;
            e.preventDefault();
        });
        window.addEventListener('mouseup', (e) => {
            const isEndingCurrentDrag = this.isLookDragging && e.button === this.lookDragButton;
            if (!isEndingCurrentDrag) return;
            this.isLookDragging = false;
            const shouldPlaceTower = e.button === 0 && !this.lookDragMoved;
            this.lookDragButton = -1;
            if (shouldPlaceTower) this.handleClick();
        });
        canvas.addEventListener('mouseleave', () => {
            this.isLookDragging = false;
            this.lookDragButton = -1;
        });

        canvas.addEventListener('mousemove', (e) => {
            this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
            this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
            this.updatePreview();

            if (this.isLookDragging) {
                const dx = e.clientX - this.lastMouseX;
                const dy = e.clientY - this.lastMouseY;
                const dragDistance = Math.hypot(e.clientX - this.lookDragStartX, e.clientY - this.lookDragStartY);
                if (dragDistance > 3) this.lookDragMoved = true;
                this.lastMouseX = e.clientX;
                this.lastMouseY = e.clientY;
                this.applyFPSLook(dx, dy);
            }
        });

        // Spectator controls: WASD + ZQSD + Space/C/Ctrl
        window.addEventListener('keydown', (e) => {
            this.keys[e.key.toLowerCase()] = true;
            this.keys[e.code] = true;
            if (e.key === 'F3') {
                document.getElementById('debug-panel').classList.toggle('active');
            }
            if (e.code === 'Enter' && !this.waveInProgress) {
                this.startWave();
            }
        });

        window.addEventListener('keyup', (e) => {
            this.keys[e.key.toLowerCase()] = false;
            this.keys[e.code] = false;
        });
    }

    syncCameraAnglesFromCurrentView() {
        const viewDir = new THREE.Vector3();
        this.camera.getWorldDirection(viewDir);
        this.cameraYaw = Math.atan2(viewDir.x, viewDir.z);
        this.cameraPitch = Math.asin(THREE.MathUtils.clamp(viewDir.y, -0.999, 0.999));
        this.applyCameraRotation();
    }

    applyCameraRotation() {
        this.camera.rotation.order = 'YXZ';
        this.camera.rotation.y = this.cameraYaw;
        this.camera.rotation.x = this.cameraPitch;
        this.camera.rotation.z = 0;
    }

    updateCameraMovement(delta) {
        const forward = this.keys['z'] || this.keys['w'] || this.keys.KeyW;
        const backward = this.keys['s'] || this.keys.KeyS;
        const left = this.keys['q'] || this.keys['a'] || this.keys.KeyA;
        const right = this.keys['d'] || this.keys.KeyD;
        const goUp = this.keys['space'] || this.keys[' '];
        const goDown = this.keys['c'] || this.keys['control'] || this.keys.ControlLeft || this.keys.ControlRight;

        const speedBoost = this.keys['shift'] ? 1.8 : 1;
        const moveSpeed = this.cameraSpeed * speedBoost * delta;

        const horizontalForward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.cameraYaw);
        horizontalForward.y = 0;
        horizontalForward.normalize();
        const horizontalRight = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), horizontalForward).normalize();

        if (forward) this.camera.position.addScaledVector(horizontalForward, moveSpeed);
        if (backward) this.camera.position.addScaledVector(horizontalForward, -moveSpeed);
        if (left) this.camera.position.addScaledVector(horizontalRight, moveSpeed);
        if (right) this.camera.position.addScaledVector(horizontalRight, -moveSpeed);
        if (goUp) this.camera.position.y += moveSpeed;
        if (goDown) this.camera.position.y -= moveSpeed;
    }

    applyFPSLook(movementX, movementY) {
        this.cameraYaw -= movementX * this.mouseLookSensitivity;
        this.cameraPitch -= movementY * this.mouseLookSensitivity;
        this.cameraPitch = THREE.MathUtils.clamp(this.cameraPitch, -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01);
        this.applyCameraRotation();
    }

    updatePreview() {
        if (!this.selectedTowerType) {
            if (this.previewTower) {
                this.scene.remove(this.previewTower);
                this.previewTower = null;
            }
            this.hoverSpot = null;
            return;
        }

        this.raycaster.setFromCamera(this.mouse, this.camera);
        const terrain = this.board.terrainMesh;
        const hits = terrain ? this.raycaster.intersectObject(terrain, false) : [];
        const groundIntersect = hits.length > 0 ? hits[0].point : null;

        if (groundIntersect) {
            const spot = this.board.tryTowerPlacementAt(groundIntersect.x, groundIntersect.z, this.towers);
            if (spot) {
                if (!this.previewTower) {
                    const geo = new THREE.CylinderGeometry(1.0, 1.2, 0.25, 12);
                    const mat = new THREE.MeshStandardMaterial({
                        color: 0xddcc88,
                        emissive: 0x887744,
                        emissiveIntensity: 0.15,
                        transparent: true,
                        opacity: 0.5
                    });
                    this.previewTower = new THREE.Mesh(geo, mat);
                    const r0 = this.getTowerRange(this.selectedTowerType);
                    this.previewTower.userData.lastRange = r0;
                    this.previewTower.userData.rangeMesh = new THREE.Mesh(
                        new THREE.RingGeometry(r0 - 0.2, r0, 64),
                        new THREE.MeshBasicMaterial({
                            color: 0xccbb88,
                            transparent: true,
                            opacity: 0.15,
                            side: THREE.DoubleSide
                        })
                    );
                    this.previewTower.userData.rangeMesh.rotation.x = -Math.PI / 2;
                    this.previewTower.userData.rangeMesh.position.set(0, 0.02, 0);
                    this.previewTower.add(this.previewTower.userData.rangeMesh);
                    this.scene.add(this.previewTower);
                }
                this.previewTower.position.set(spot.x, spot.y + 0.12, spot.z);
                const r = this.getTowerRange(this.selectedTowerType);
                if (this.previewTower.userData.lastRange !== r) {
                    this.previewTower.userData.lastRange = r;
                    this.previewTower.userData.rangeMesh.geometry.dispose();
                    this.previewTower.userData.rangeMesh.geometry = new THREE.RingGeometry(r - 0.2, r, 64);
                }
                this.hoverSpot = spot;
            } else {
                if (this.previewTower) {
                    this.scene.remove(this.previewTower);
                    this.previewTower = null;
                }
                this.hoverSpot = null;
            }
        } else {
            if (this.previewTower) {
                this.scene.remove(this.previewTower);
                this.previewTower = null;
            }
            this.hoverSpot = null;
        }
    }

    getTowerRange(type) {
        return getTowerStats(type, this.selectedTowerLevel).range;
    }

    placeTowerAtSpot(type, level, spot) {
        if (!spot || typeof spot.x !== 'number' || typeof spot.z !== 'number') return false;
        const p = this.board.tryTowerPlacementAt(spot.x, spot.z, this.towers);
        if (!p) return false;
        const lv = clampTowerLevel(level);
        const stats = getTowerStats(type, lv);
        const cost = stats.cost;
        if (typeof cost !== 'number' || this.energy < cost) return false;

        this.energy -= cost;
        const tower = new Tower(this.scene, this.physics, p.x, p.z, type, p.y, lv);
        this.towers.push(tower);
        this.particleSystem.createExplosion(new THREE.Vector3(p.x, p.y + 1, p.z), 'small');
        if (tower.type === 'cannon') this.audio.play('cannonShot');
        if (tower.type === 'mortar') this.audio.play('mortarShot');
        this.updateUI();
        if (this.previewTower) { this.scene.remove(this.previewTower); this.previewTower = null; }
        return true;
    }

    getPathDataForAI() {
        return this.path.waypoints.map((point) => ({
            x: Number(point.x.toFixed(2)),
            z: Number(point.z.toFixed(2))
        }));
    }

    computeCandidateBuildSpots() {
        const spots = [];
        const extent = this.board.mapExtent;
        const step = 6;
        let idx = 0;
        for (let x = -extent + 3; x <= extent - 3; x += step) {
            for (let z = -extent + 3; z <= extent - 3; z += step) {
                if (!this.board.canPlaceTowerAt(x, z, this.towers)) continue;
                spots.push({
                    id: idx++,
                    x: Number(x.toFixed(2)),
                    z: Number(z.toFixed(2)),
                    distanceToPath: Number(this.board.distanceToPath(x, z).toFixed(2))
                });
            }
        }
        spots.sort((a, b) => a.distanceToPath - b.distanceToPath);
        return spots.slice(0, SETTINGS.ai.maxCandidateSpots);
    }

    buildAiContext() {
        const towersByType = this.towers.reduce((acc, tower) => {
            acc[tower.type] = (acc[tower.type] || 0) + 1;
            return acc;
        }, {});
        const availableTowerOptions = Object.keys(SETTINGS.towers.types).map((type) => {
            const level = this.selectedTowerType === type ? this.selectedTowerLevel : 1;
            const stats = getTowerStats(type, level);
            return {
                type,
                level,
                cost: stats.cost,
                range: Number(stats.range.toFixed(2)),
                damage: Number(stats.damage.toFixed(2)),
                cooldown: Number(stats.cooldown.toFixed(3))
            };
        });
        return {
            wave: this.wave,
            waveInProgress: this.waveInProgress,
            lives: this.lives,
            score: this.score,
            gold: this.energy,
            enemiesAlive: this.enemies.length,
            enemiesRemainingToSpawn: this.enemiesToSpawn.length,
            waveEnemiesKilled: this.waveEnemiesKilled,
            waveEnemyCount: this.waveEnemyCount,
            towersPlaced: this.towers.length,
            towersByType,
            path: this.getPathDataForAI(),
            candidateSpots: this.computeCandidateBuildSpots(),
            availableTowerOptions
        };
    }

    handleClick() {
        this.audio.unlock();
        const selectedTower = this.pickExistingTower();
        if (selectedTower) {
            this.handleTowerDeleteClick(selectedTower);
            return;
        }

        if (!this.selectedTowerType) return;
        if (!this.hoverSpot) return;
        this.placeTowerAtSpot(this.selectedTowerType, this.selectedTowerLevel, this.hoverSpot);
    }

    pickExistingTower() {
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const meshes = this.towers.map((tower) => tower.mesh);
        const hit = this.raycaster.intersectObjects(meshes, true)[0];
        if (!hit) return null;
        return this.towers.find((tower) => tower.mesh === hit.object || tower.mesh.children.includes(hit.object)) || null;
    }

    handleTowerDeleteClick(tower) {
        const now = this.gameTime;
        if (this.armedDeleteTower === tower && now <= this.armedDeleteExpireAt) {
            this.deleteTower(tower);
            return;
        }
        this.armTowerForDeletion(tower, now);
    }

    armTowerForDeletion(tower, now) {
        if (this.armedDeleteTower && this.armedDeleteTower !== tower) {
            this.armedDeleteTower.setDeleteMarked(false);
        }
        this.armedDeleteTower = tower;
        this.armedDeleteExpireAt = now + 1.0;
        tower.setDeleteMarked(true);
    }

    clearArmedTowerDeletion() {
        if (this.armedDeleteTower) {
            this.armedDeleteTower.setDeleteMarked(false);
        }
        this.armedDeleteTower = null;
        this.armedDeleteExpireAt = 0;
    }

    deleteTower(tower) {
        if (!tower) return false;
        const idx = this.towers.indexOf(tower);
        if (idx < 0) return false;
        const refund = Math.round(tower.costPaid * SETTINGS.economy.towerSellRefundRatio);
        this.energy += refund;
        tower.destroy();
        this.towers.splice(idx, 1);
        this.clearArmedTowerDeletion();
        this.updateUI();
        return true;
    }

    startWave() {
        if (this.waveInProgress) return;
        this.waveInProgress = true;
        this.waveEnemyCount = 0;
        this.waveEnemiesKilled = 0;
        this.waveHpMultiplier = 1 + (this.wave - 1) * SETTINGS.waves.hpMultiplierPerWave;
        this.waveSpeedMultiplier = 1 + (this.wave - 1) * SETTINGS.waves.speedMultiplierPerWave;

        const baseCount = 6 + this.wave * 4 + Math.floor((this.wave - 1) / 3) * 2;
        this.enemiesToSpawn = this.buildWaveSpawnPlan(baseCount);

        this.spawnTimer = 0;

        const waveInfo = document.getElementById('wave-info');
        waveInfo.textContent = `Wave ${this.wave}`;
        waveInfo.classList.remove('danger');
        waveInfo.classList.add('show');
        if (this.waveInfoTimeout) clearTimeout(this.waveInfoTimeout);
        this.waveInfoTimeout = setTimeout(() => {
            waveInfo.classList.remove('show');
        }, 2000);
        this.updateUI();
    }

    buildWaveSpawnPlan(baseCount) {
        const spawnPlan = [];
        for (let i = 0; i < baseCount; i++) {
            const progress = baseCount > 1 ? i / (baseCount - 1) : 1;
            const type = this.pickEnemyType(progress);
            const delay = this.getSpawnDelayForType(type, progress);
            spawnPlan.push({ type, delay });
        }
        return spawnPlan;
    }

    pickEnemyType(progress) {
        const weights = {
            basic: 0.8 - progress * 0.35,
            fast: this.wave >= 2 ? 0.15 + progress * 0.2 : 0,
            tank: this.wave >= 4 ? progress * 0.18 : 0,
            boss: this.wave >= 8 ? Math.max(0, progress - 0.72) * 0.5 : 0
        };

        const entries = Object.entries(weights)
            .map(([type, weight]) => ({ type, weight: Math.max(0, weight) }))
            .filter((entry) => entry.weight > 0);
        const totalWeight = entries.reduce((sum, entry) => sum + entry.weight, 0);
        if (totalWeight <= 0.0001) return 'basic';

        let randomPick = Math.random() * totalWeight;
        for (const entry of entries) {
            randomPick -= entry.weight;
            if (randomPick <= 0) return entry.type;
        }
        return entries[entries.length - 1].type;
    }

    getSpawnDelayForType(type, progress) {
        const spacing = {
            basic: { min: 0.38, max: 0.66 },
            fast: { min: 0.26, max: 0.52 },
            tank: { min: 0.95, max: 1.45 },
            boss: { min: 1.7, max: 2.6 }
        };
        const range = spacing[type] || spacing.basic;
        const wavePaceFactor = Math.max(0.6, 1 - this.wave * 0.02);
        const dynamicFactor = 1 - progress * 0.15;
        const minDelay = range.min * wavePaceFactor * dynamicFactor;
        const maxDelay = range.max * wavePaceFactor * dynamicFactor;
        return THREE.MathUtils.lerp(minDelay, maxDelay, Math.random());
    }

    spawnEnemy(type) {
        const enemy = new Enemy(this.scene, this.physics, this.path, type, {
            hpMultiplier: this.waveHpMultiplier
            , speedMultiplier: this.waveSpeedMultiplier
        });
        this.enemies.push(enemy);
        this.waveEnemyCount++;
    }

    update(delta) {
        this.time += delta;
        this.gameTime += delta;
        if (this.armedDeleteTower && this.gameTime > this.armedDeleteExpireAt) {
            this.clearArmedTowerDeletion();
        }

        this.updateCameraMovement(delta);

        this.physics.step(delta);
        this.board.update(this.time);

        if (this.waveInProgress && this.enemiesToSpawn.length > 0) {
            this.spawnTimer -= delta;
            if (this.spawnTimer <= 0) {
                const nextSpawn = this.enemiesToSpawn.shift();
                this.spawnEnemy(nextSpawn.type);
                this.spawnTimer = nextSpawn.delay;
            }
        }

        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const enemy = this.enemies[i];
            enemy.update(delta, this.time);
            if (enemy.reachedEnd) {
                this.lives--;
                enemy.destroy();
                this.enemies.splice(i, 1);
                this.updateUI();
                if (this.lives <= 0) this.gameOver();
            } else if (!enemy.alive) {
                this.score += enemy.reward;
                this.energy += enemy.reward;
                this.waveEnemiesKilled++;
                // BIGGER explosion on death
                const explosionPos = enemy.mesh.position.clone();
                explosionPos.y += 0.5;
                this.particleSystem.createExplosion(explosionPos, enemy.type === 'boss' ? 'large' : enemy.type === 'tank' ? 'medium' : 'small');
                if (enemy.type === 'boss' || enemy.type === 'tank') this.audio.play('bossDeath');
                // Second smaller explosion for effect
                setTimeout(() => {
                    this.particleSystem.createExplosion(explosionPos, 'small');
                }, 100);
                enemy.destroy();
                this.enemies.splice(i, 1);
                this.updateUI();
            }
        }

        for (const tower of this.towers) tower.update(delta, this.enemies, this.projectileManager, this.time, this.audio);
        this.projectileManager.checkCollisions(this.enemies);
        this.projectileManager.update(delta);
        this.particleSystem.update(delta, this.camera);
        this.agentController.update(delta);

        if (this.waveInProgress && this.enemiesToSpawn.length === 0 && this.enemies.length === 0) {
            this.waveInProgress = false;
            this.wave++;
            this.energy += SETTINGS.economy.waveBonusBase + this.wave * SETTINGS.economy.waveBonusPerWave;
            this.updateUI();
            setTimeout(() => this.startWave(), 3000);
        }

        this.updateDebugInfo();
    }

    updateUI() {
        document.getElementById('energy').textContent = this.energy;
        document.getElementById('wave').textContent = this.wave;
        document.getElementById('lives').textContent = this.lives;
        document.getElementById('score').textContent = this.score;

        const livesValue = document.getElementById('lives');
        livesValue.classList.toggle('low', this.lives <= 5);

        for (const btn of document.querySelectorAll('.tower-btn')) {
            const type = btn.dataset.type;
            const levelInput = btn.querySelector('.tower-level-hidden');
            const level = clampTowerLevel(parseInt(levelInput?.value || '1', 10));
            const towerStats = getTowerStats(type, level);
            const cost = towerStats.cost;
            const costNode = btn.querySelector('.cost');
            if (costNode) costNode.textContent = `${cost}`;
            btn.classList.toggle('insufficient', this.energy < cost);
        }

        const waveStage = document.getElementById('wave-stage');
        const waveProgressFill = document.getElementById('wave-progress-fill');
        const waveProgressText = document.getElementById('wave-progress-text');
        if (!waveStage || !waveProgressFill || !waveProgressText) return;

        if (!this.waveInProgress) {
            waveStage.textContent = `Wave ${this.wave}`;
            waveProgressFill.style.width = '0%';
            waveProgressText.textContent = 'Preparing next assault...';
            return;
        }

        const spawned = this.waveEnemyCount;
        const total = this.waveEnemyCount + this.enemiesToSpawn.length;
        const defeated = this.waveEnemiesKilled;
        const progress = total > 0 ? Math.min((defeated / total) * 100, 100) : 0;

        waveStage.textContent = `Wave ${this.wave} Active`;
        waveProgressFill.style.width = `${progress.toFixed(1)}%`;
        waveProgressText.textContent = `${defeated}/${total} defeated • ${this.enemies.length} alive • ${Math.max(spawned - defeated, 0)} engaged`;
    }

    updateDebugInfo() {
        document.getElementById('phys-step').textContent = `${this.physics.debugInfo.stepTime.toFixed(2)}ms`;
        document.getElementById('entities').textContent = this.enemies.length + this.towers.length + this.projectileManager.projectiles.length;
        document.getElementById('collisions').textContent = this.physics.debugInfo.collisions;
        const clips = document.getElementById('clips');
        clips.textContent = this.physics.debugInfo.clips;
        clips.className = 'debug-value ' + (this.physics.debugInfo.clips > 0 ? 'bad' : 'good');
        const floaters = document.getElementById('floaters');
        floaters.textContent = this.physics.debugInfo.floaters;
        floaters.className = 'debug-value ' + (this.physics.debugInfo.floaters > 0 ? 'bad' : 'good');
    }

    gameOver() {
        this.gameState = 'gameOver';
        const waveInfo = document.getElementById('wave-info');
        waveInfo.textContent = 'GAME OVER';
        waveInfo.classList.add('danger', 'show');
        if (this.waveInfoTimeout) clearTimeout(this.waveInfoTimeout);
    }

    getState() {
        return {
            wave: this.wave, score: this.score, lives: this.lives, energy: this.energy,
            enemyCount: this.enemies.length, towerCount: this.towers.length,
            projectileCount: this.projectileManager.projectiles.length,
            particleCount: this.particleSystem.particles.length,
            physicsClips: this.physics.debugInfo.clips,
            physicsFloaters: this.physics.debugInfo.floaters,
            fps: parseInt(document.getElementById('fps').textContent) || 60
        };
    }
}
