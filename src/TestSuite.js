/** @fileoverview Self-testing suite with autonomous physics debugging */

import * as THREE from 'three';
import { PhysicsBody } from './Physics.js';
import { Enemy } from './Enemy.js';
import { Tower } from './Tower.js';
import { SETTINGS } from './settings.js';

export class TestSuite {
    constructor(game) {
        this.game = game;
        this.results = [];
        this.allPassed = false;
        this.autofixAttempts = 0;
        this.maxAutofixAttempts = 5;
    }
    
    log(message, type = 'info') {
        const resultsDiv = document.getElementById('test-results');
        const row = document.createElement('div');
        row.className = 'test-row';
        
        const status = type === 'pass' ? '✓ PASS' : type === 'fail' ? '✗ FAIL' : type === 'fix' ? '🔧 FIX' : 'ℹ INFO';
        const className = type === 'pass' ? 'test-pass' : type === 'fail' ? 'test-fail' : type === 'fix' ? 'test-fixing' : '';
        
        row.innerHTML = `<span>${message}</span><span class="${className}">${status}</span>`;
        resultsDiv.appendChild(row);
        
        this.results.push({ message, type, time: performance.now() });
    }
    
    async runAllTests() {
        this.log('Starting self-test suite...', 'info');
        
        const tests = [
            () => this.testPhysicsEngine(),
            () => this.testEnemyMovement(),
            () => this.testWallCollision(),
            () => this.testProjectilePhysics(),
            () => this.testParticleSystem(),
            () => this.testPerformance()
        ];
        
        let allPassed = true;
        
        for (const test of tests) {
            try {
                const passed = await test();
                if (!passed) allPassed = false;
            } catch (e) {
                this.log(`Test error: ${e.message}`, 'fail');
                allPassed = false;
            }
        }
        
        this.allPassed = allPassed;
        
        if (allPassed) {
            this.log('All tests passed! Physics engine is stable.', 'pass');
        } else {
            this.log('Some tests failed. Initiating autonomous debug...', 'fail');
            await this.autonomousDebug();
        }
        
        return allPassed;
    }
    
    async testPhysicsEngine() {
        this.log('Testing physics engine...', 'info');
        
        const physics = this.game.physics;
        const initialBodyCount = physics.bodies.length;
        
        // Test 1: Body creation and integration
        const body = new PhysicsBody(new THREE.Vector3(0, 10, 0), 1, 1, 'dynamic');
        physics.addBody(body);
        
        // Simulate 60 frames at 60fps
        for (let i = 0; i < 60; i++) {
            physics.step(1/60);
        }
        
        // Body should have fallen to ground
        const onGround = body.position.y <= body.radius + 0.5;
        const notNaN = !isNaN(body.position.x) && !isNaN(body.position.y) && !isNaN(body.position.z);
        
        physics.removeBody(body);
        
        if (onGround && notNaN) {
            this.log('Physics integration: OK', 'pass');
            return true;
        } else {
            this.log(`Physics integration failed: ground=${onGround}, nan=${!notNaN}`, 'fail');
            return false;
        }
    }
    
    async testEnemyMovement() {
        this.log('Testing enemy path following...', 'info');
        
        const testEnemy = new Enemy(this.game.scene, this.game.physics, this.game.path, 'basic');
        const startPos = testEnemy.mesh.position.clone();
        
        // Simulate 120 frames
        for (let i = 0; i < 120; i++) {
            testEnemy.update(1/60, i * 1/60);
        }
        
        const moved = testEnemy.mesh.position.distanceTo(startPos) > 1;
        // Grounded height depends on enemy radius, and radius now scales with world scale.
        const expectedGroundY = testEnemy.body.radius;
        const notFloating = Math.abs(testEnemy.mesh.position.y - expectedGroundY) < 0.55;
        const notClipped = testEnemy.mesh.position.y >= expectedGroundY - 0.2;
        
        testEnemy.destroy();
        
        if (moved && notFloating && notClipped) {
            this.log('Enemy movement: OK', 'pass');
            return true;
        } else {
            this.log(`Enemy movement failed: moved=${moved}, floating=${!notFloating}, clipped=${!notClipped}`, 'fail');
            return false;
        }
    }
    
    async testWallCollision() {
        this.log('Testing wall collision (no clipping)...', 'info');
        
        const physics = this.game.physics;
        let clipsDetected = 0;
        
        // Spawn bodies at walls and push them through
        for (let i = 0; i < 20; i++) {
            const angle = (i / 20) * Math.PI * 2;
            const x = Math.cos(angle) * 22;
            const z = Math.sin(angle) * 22;
            
            const body = new PhysicsBody(new THREE.Vector3(x, 1, z), 0.5, 1, 'dynamic');
            body.velocity.set(-Math.cos(angle) * 10, 0, -Math.sin(angle) * 10);
            physics.addBody(body);
            
            // Simulate 30 frames
            for (let f = 0; f < 30; f++) {
                physics.step(1/60);
            }
            
            // Check if body clipped through wall
            const distFromCenter = Math.sqrt(body.position.x ** 2 + body.position.z ** 2);
            if (distFromCenter > 24) {
                clipsDetected++;
            }
            
            physics.removeBody(body);
        }
        
        if (clipsDetected === 0) {
            this.log('Wall collision: OK (0 clips)', 'pass');
            return true;
        } else {
            this.log(`Wall collision failed: ${clipsDetected} clips detected`, 'fail');
            return false;
        }
    }
    
    async testProjectilePhysics() {
        this.log('Testing projectile physics...', 'info');
        
        const startPos = new THREE.Vector3(0, 5, 0);
        const direction = new THREE.Vector3(1, 0.5, 0).normalize();
        
        const proj = this.game.projectileManager.spawn(
            startPos, direction, 20, 10, 'blaster'
        );
        
        // Simulate 60 frames
        for (let i = 0; i < 60; i++) {
            this.game.projectileManager.update(1/60);
            this.game.physics.step(1/60);
        }
        
        const moved = proj.mesh.position.distanceTo(startPos) > 1;
        const notNaN = !isNaN(proj.mesh.position.x);
        
        if (moved && notNaN) {
            this.log('Projectile physics: OK', 'pass');
            return true;
        } else {
            this.log('Projectile physics failed', 'fail');
            return false;
        }
    }
    
    async testParticleSystem() {
        this.log('Testing particle system...', 'info');
        
        const startCount = this.game.particleSystem.particles.length;
        
        // Create explosion
        this.game.particleSystem.createExplosion(new THREE.Vector3(0, 2, 0), 'large');
        
        const afterSpawn = this.game.particleSystem.particles.length;
        
        // Simulate 2 seconds
        for (let i = 0; i < 120; i++) {
            this.game.particleSystem.update(1/60, this.game.camera);
        }
        
        const afterUpdate = this.game.particleSystem.particles.length;
        
        if (afterSpawn > startCount && afterUpdate < afterSpawn) {
            this.log('Particle system: OK', 'pass');
            return true;
        } else {
            this.log('Particle system failed', 'fail');
            return false;
        }
    }
    
    async testPerformance() {
        this.log('Testing performance with scalability guard...', 'info');
        
        // Spawn many enemies and projectiles
        for (let i = 0; i < 20; i++) {
            this.game.enemies.push(new Enemy(
                this.game.scene, this.game.physics, this.game.path, 'basic'
            ));
        }
        
        const startTime = performance.now();
        
        // Simulate 60 frames
        for (let i = 0; i < 60; i++) {
            this.game.physics.step(1/60);
            for (const enemy of this.game.enemies) {
                enemy.update(1/60, i * 1/60);
            }
        }
        
        const elapsed = performance.now() - startTime;
        const avgFrameTime = elapsed / 60;
        const fps = 1000 / avgFrameTime;
        
        // Cleanup test enemies
        for (const enemy of this.game.enemies) {
            enemy.destroy();
        }
        this.game.enemies = [];
        
        const threshold = SETTINGS.performance.lowFpsThreshold;
        if (fps >= threshold) {
            this.log(`Performance: ${fps.toFixed(1)} FPS - OK`, 'pass');
            return true;
        } else {
            this.log(`Performance: ${fps.toFixed(1)} FPS - Below target (${threshold})`, 'fail');
            return false;
        }
    }
    
    async autonomousDebug() {
        if (this.autofixAttempts >= this.maxAutofixAttempts) {
            this.log('Max autofix attempts reached. Manual intervention required.', 'fail');
            return;
        }
        
        this.autofixAttempts++;
        this.log(`Autonomous debug attempt ${this.autofixAttempts}...`, 'fix');
        
        const physics = this.game.physics;
        let fixesApplied = false;
        
        // Fix 1: Increase physics substeps if clipping detected
        if (physics.debugInfo.clips > 0) {
            physics.subSteps = Math.min(physics.subSteps + 2, 16);
            this.log(`Increased physics substeps to ${physics.subSteps}`, 'fix');
            fixesApplied = true;
        }
        
        // Fix 2: Reduce max velocity if tunneling
        if (physics.debugInfo.clips > 5) {
            physics.maxVelocity = Math.max(physics.maxVelocity * 0.8, 20);
            this.log(`Reduced max velocity to ${physics.maxVelocity}`, 'fix');
            fixesApplied = true;
        }
        
        // Fix 3: Increase gravity if floating
        if (physics.debugInfo.floaters > 0) {
            physics.gravity.y = Math.min(physics.gravity.y - 5, -40);
            this.log(`Increased gravity to ${physics.gravity.y}`, 'fix');
            fixesApplied = true;
        }
        
        // Fix 4: Reset physics debug counters
        physics.debugInfo.clips = 0;
        physics.debugInfo.floaters = 0;
        
        if (fixesApplied) {
            // Re-run tests
            this.log('Re-running tests after fixes...', 'info');
            await new Promise(r => setTimeout(r, 500));
            
            const passed = await this.runAllTests();
            if (!passed && this.autofixAttempts < this.maxAutofixAttempts) {
                await this.autonomousDebug();
            }
        } else {
            this.log('No fixes to apply. Tests may need manual review.', 'fail');
        }
    }
    
    // Continuous monitoring during gameplay
    monitor() {
        const state = this.game.getState();
        
        // Check for physics issues
        if (state.physicsClips > 10) {
            this.log(`Warning: ${state.physicsClips} wall clips detected!`, 'fail');
            this.game.physics.subSteps = Math.min(this.game.physics.subSteps + 1, 16);
        }
        
        if (state.physicsFloaters > 10) {
            this.log(`Warning: ${state.physicsFloaters} floating entities!`, 'fail');
            this.game.physics.gravity.y -= 2;
        }
        
        // Check FPS
        if (state.fps < 30) {
            this.log(`Warning: Low FPS (${state.fps})`, 'fail');
            // Reduce particle count
            if (this.game.particleSystem.particles.length > 1000) {
                this.game.particleSystem.particles = this.game.particleSystem.particles.slice(0, 1000);
            }
        }
    }
}
