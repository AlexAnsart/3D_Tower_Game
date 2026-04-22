/** @fileoverview Main game controller with ZQSD navigation and fixed aiming */

import * as THREE from 'three';
import { Board } from './Board.js';
import { Path } from './Path.js';
import { Tower } from './Tower.js';
import { Enemy } from './Enemy.js';
import { ProjectileManager } from './Projectile.js';
import { ParticleSystem } from './ParticleSystem.js';
import { Physics } from './Physics.js';

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

        this.towers = [];
        this.enemies = [];

        this.energy = 500;
        this.lives = 20;
        this.score = 0;
        this.wave = 1;
        this.selectedTowerType = 'blaster';
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

        // Keyboard movement state
        this.keys = {};
        this.cameraSpeed = 36;
        this.cameraHeightSpeed = 10;

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

        canvas.addEventListener('mousemove', (e) => {
            this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
            this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
            this.updatePreview();
        });

        canvas.addEventListener('click', (e) => {
            if (e.target.closest('.tower-panel') || e.target.closest('.stat-box') || e.target.closest('.wave-card')) return;
            this.handleClick();
        });

        // ZQSD + Arrow key camera controls
        window.addEventListener('keydown', (e) => {
            this.keys[e.key.toLowerCase()] = true;
            this.keys[e.code] = true;
            if (e.key === 'F3') {
                document.getElementById('debug-panel').classList.toggle('active');
            }
            if (e.code === 'Space' && !this.waveInProgress) {
                this.startWave();
            }
        });

        window.addEventListener('keyup', (e) => {
            this.keys[e.key.toLowerCase()] = false;
            this.keys[e.code] = false;
        });
    }

    updateCameraMovement(delta) {
        // ZQSD movement (French WASD) for ground plane movement
        const forward = this.keys['z'];
        const backward = this.keys['s'];
        const left = this.keys['q'];
        const right = this.keys['d'];

        // Up/Down arrows for camera height
        const goUp = this.keys['arrowup'] || this.keys[' '];
        const goDown = this.keys['arrowdown'] || this.keys['c'];

        // Get camera forward direction (flattened to XZ plane)
        const forwardDir = new THREE.Vector3();
        this.camera.getWorldDirection(forwardDir);
        forwardDir.y = 0;
        forwardDir.normalize();

        const rightDir = new THREE.Vector3();
        rightDir.crossVectors(forwardDir, new THREE.Vector3(0, 1, 0)).normalize();

        const moveSpeed = this.cameraSpeed * delta;

        if (forward) {
            this.camera.position.addScaledVector(forwardDir, moveSpeed);
            this.controls.target.addScaledVector(forwardDir, moveSpeed);
        }
        if (backward) {
            this.camera.position.addScaledVector(forwardDir, -moveSpeed);
            this.controls.target.addScaledVector(forwardDir, -moveSpeed);
        }
        if (left) {
            this.camera.position.addScaledVector(rightDir, -moveSpeed);
            this.controls.target.addScaledVector(rightDir, -moveSpeed);
        }
        if (right) {
            this.camera.position.addScaledVector(rightDir, moveSpeed);
            this.controls.target.addScaledVector(rightDir, moveSpeed);
        }

        // Height control with Up/Down arrows (when not combined with shift for other things)
        // Use plain Up/Down for height, disable orbit controls auto-rotate
        const heightSpeed = this.cameraHeightSpeed * delta;
        if (goUp && !this.keys['shift']) {
            this.camera.position.y += heightSpeed;
        }
        if (goDown && !this.keys['shift']) {
            this.camera.position.y = Math.max(5, this.camera.position.y - heightSpeed);
        }
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
        const ranges = { blaster: 18, cannon: 24, sniper: 42 };
        return ranges[type] || 18;
    }

    handleClick() {
        if (!this.selectedTowerType) return;
        if (!this.hoverSpot) return;
        const p = this.board.tryTowerPlacementAt(this.hoverSpot.x, this.hoverSpot.z, this.towers);
        if (!p) return;
        const costs = { blaster: 50, cannon: 120, sniper: 200 };
        const cost = costs[this.selectedTowerType];
        if (typeof cost !== 'number') return;

        if (this.energy >= cost) {
            this.energy -= cost;
            const tower = new Tower(this.scene, this.physics, p.x, p.z, this.selectedTowerType, p.y);
            this.towers.push(tower);
            this.particleSystem.createExplosion(new THREE.Vector3(p.x, p.y + 1, p.z), 'small');
            this.updateUI();
            if (this.previewTower) { this.scene.remove(this.previewTower); this.previewTower = null; }
        }
    }

    startWave() {
        if (this.waveInProgress) return;
        this.waveInProgress = true;
        this.waveEnemyCount = 0;
        this.waveEnemiesKilled = 0;
        this.waveHpMultiplier = 1 + (this.wave - 1) * 0.15;

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
        });
        this.enemies.push(enemy);
        this.waveEnemyCount++;
    }

    update(delta) {
        this.time += delta;
        this.gameTime += delta;

        // Camera keyboard movement
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
                // Second smaller explosion for effect
                setTimeout(() => {
                    this.particleSystem.createExplosion(explosionPos, 'small');
                }, 100);
                enemy.destroy();
                this.enemies.splice(i, 1);
                this.updateUI();
            }
        }

        for (const tower of this.towers) tower.update(delta, this.enemies, this.projectileManager, this.time);
        this.projectileManager.checkCollisions(this.enemies);
        this.projectileManager.update(delta);
        this.particleSystem.update(delta, this.camera);

        if (this.waveInProgress && this.enemiesToSpawn.length === 0 && this.enemies.length === 0) {
            this.waveInProgress = false;
            this.wave++;
            this.energy += 100 + this.wave * 10;
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

        const costs = { blaster: 50, cannon: 120, sniper: 200 };
        for (const btn of document.querySelectorAll('.tower-btn')) {
            const type = btn.dataset.type;
            const cost = costs[type] || 9999;
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
