/** @fileoverview Bulletproof custom physics engine with continuous collision detection */

import * as THREE from 'three';

export class PhysicsBody {
    constructor(position, radius, mass = 1, type = 'dynamic') {
        this.position = position.clone();
        this.previousPosition = position.clone();
        this.velocity = new THREE.Vector3(0, 0, 0);
        this.acceleration = new THREE.Vector3(0, 0, 0);
        this.radius = radius;
        this.mass = mass;
        this.type = type; // 'dynamic', 'static', 'kinematic'
        this.restitution = 0.3;
        this.friction = 0.8;
        this.gravityScale = 1;
        this.onGround = false;
        this.id = Math.random().toString(36).substr(2, 9);
        this.isSleeping = false;
        this.sleepThreshold = 0.01;
        this.userData = {};
    }
    
    getBounds() {
        return new THREE.Box3(
            new THREE.Vector3(
                this.position.x - this.radius,
                this.position.y - this.radius,
                this.position.z - this.radius
            ),
            new THREE.Vector3(
                this.position.x + this.radius,
                this.position.y + this.radius,
                this.position.z + this.radius
            )
        );
    }
    
    applyForce(force) {
        if (this.type !== 'dynamic') return;
        this.acceleration.add(force.clone().divideScalar(this.mass));
    }
    
    applyImpulse(impulse) {
        if (this.type !== 'dynamic') return;
        this.velocity.add(impulse.clone().divideScalar(this.mass));
        this.isSleeping = false;
    }
}

export class PhysicsWorld {
    constructor() {
        this.bodies = [];
        this.staticColliders = []; // Walls, ground
        this.gravity = new THREE.Vector3(0, -20, 0);
        this.subSteps = 8; // High substeps for stability
        this.timeScale = 1;
        this.maxVelocity = 260;
        this.debugInfo = {
            collisions: 0,
            clips: 0,
            floaters: 0,
            stepTime: 0
        };
        this.groundY = 0;
    }
    
    addBody(body) {
        this.bodies.push(body);
        return body;
    }
    
    removeBody(body) {
        const idx = this.bodies.indexOf(body);
        if (idx > -1) this.bodies.splice(idx, 1);
    }
    
    addStaticCollider(min, max) {
        this.staticColliders.push({ min: min.clone(), max: max.clone() });
    }
    
    clear() {
        this.bodies = [];
        this.staticColliders = [];
    }
    
    /** Continuous collision detection using swept sphere vs AABB */
    sweptSphereVsAABB(sphereStart, sphereEnd, radius, aabbMin, aabbMax) {
        // Expand AABB by sphere radius
        const expandedMin = aabbMin.clone().sub(new THREE.Vector3(radius, radius, radius));
        const expandedMax = aabbMax.clone().add(new THREE.Vector3(radius, radius, radius));
        
        const rayDir = sphereEnd.clone().sub(sphereStart);
        const rayLen = rayDir.length();
        if (rayLen < 1e-6) {
            // Stationary check
            const inside = sphereStart.x >= expandedMin.x && sphereStart.x <= expandedMax.x &&
                          sphereStart.y >= expandedMin.y && sphereStart.y <= expandedMax.y &&
                          sphereStart.z >= expandedMin.z && sphereStart.z <= expandedMax.z;
            return inside ? { t: 0, normal: new THREE.Vector3(0, 1, 0) } : null;
        }
        rayDir.normalize();
        
        let tmin = 0;
        let tmax = rayLen;
        let normal = new THREE.Vector3();
        
        for (let i = 0; i < 3; i++) {
            const axis = ['x', 'y', 'z'][i];
            if (Math.abs(rayDir[axis]) < 1e-6) {
                if (sphereStart[axis] < expandedMin[axis] || sphereStart[axis] > expandedMax[axis]) {
                    return null;
                }
            } else {
                const ood = 1 / rayDir[axis];
                let t1 = (expandedMin[axis] - sphereStart[axis]) * ood;
                let t2 = (expandedMax[axis] - sphereStart[axis]) * ood;
                
                let n = -1;
                if (t1 > t2) {
                    [t1, t2] = [t2, t1];
                    n = 1;
                }
                
                if (t1 > tmin) {
                    tmin = t1;
                    normal.set(0, 0, 0);
                    normal[axis] = n;
                }
                tmax = Math.min(tmax, t2);
                if (tmin > tmax) return null;
            }
        }
        
        if (tmin <= rayLen && tmin >= 0) {
            return { t: tmin, normal: normal.normalize() };
        }
        return null;
    }
    
    /** Resolve sphere vs AABB collision with proper slide response */
    resolveSphereAABB(body, aabbMin, aabbMax, dt) {
        const result = this.sweptSphereVsAABB(
            body.previousPosition,
            body.position,
            body.radius,
            aabbMin,
            aabbMax
        );
        
        if (!result) return false;
        
        // Push sphere out along normal
        const hitPoint = body.previousPosition.clone().add(
            body.velocity.clone().normalize().multiplyScalar(result.t)
        );
        
        // Calculate penetration depth
        const center = body.position.clone();
        const closest = new THREE.Vector3(
            Math.max(aabbMin.x, Math.min(center.x, aabbMax.x)),
            Math.max(aabbMin.y, Math.min(center.y, aabbMax.y)),
            Math.max(aabbMin.z, Math.min(center.z, aabbMax.z))
        );
        
        const diff = center.clone().sub(closest);
        const dist = diff.length();
        
        if (dist > 0 && dist < body.radius) {
            const pushDir = diff.normalize();
            const pushDist = body.radius - dist + 0.01; // Small epsilon
            body.position.add(pushDir.multiplyScalar(pushDist));
            
            // Reflect velocity
            const vDotN = body.velocity.dot(pushDir);
            if (vDotN < 0) {
                const reflection = pushDir.multiplyScalar(-vDotN * (1 + body.restitution));
                body.velocity.add(reflection);
                
                // Friction
                const tangent = body.velocity.clone().sub(pushDir.multiplyScalar(body.velocity.dot(pushDir)));
                tangent.multiplyScalar(Math.max(0, 1 - body.friction * dt * 10));
                body.velocity.sub(tangent);
            }
            
            // Mark ground contact
            if (pushDir.y > 0.7) {
                body.onGround = true;
            }
            
            return true;
        }
        
        return false;
    }
    
    /** Sphere vs sphere collision */
    resolveSphereSphere(a, b, dt) {
        const diff = b.position.clone().sub(a.position);
        const dist = diff.length();
        const minDist = a.radius + b.radius;
        
        if (dist >= minDist || dist < 1e-6) return false;
        
        const normal = diff.normalize();
        const penetration = minDist - dist;
        
        // Separate bodies
        const totalMass = a.mass + b.mass;
        const aRatio = b.mass / totalMass;
        const bRatio = a.mass / totalMass;
        
        if (a.type === 'dynamic') {
            a.position.sub(normal.clone().multiplyScalar(penetration * aRatio));
        }
        if (b.type === 'dynamic') {
            b.position.add(normal.clone().multiplyScalar(penetration * bRatio));
        }
        
        // Exchange impulse
        const relativeVel = b.velocity.clone().sub(a.velocity);
        const velAlongNormal = relativeVel.dot(normal);
        
        if (velAlongNormal > 0) return true;
        
        const restitution = Math.min(a.restitution, b.restitution);
        const impulse = -(1 + restitution) * velAlongNormal / (1/a.mass + 1/b.mass);
        
        const impulseVec = normal.multiplyScalar(impulse);
        if (a.type === 'dynamic') a.applyImpulse(impulseVec.clone().negate());
        if (b.type === 'dynamic') b.applyImpulse(impulseVec);
        
        return true;
    }
    
    /** Ground collision - raycast down from body center */
    resolveGround(body) {
        const groundY = this.groundY + body.radius;
        
        if (body.position.y < groundY) {
            body.position.y = groundY;
            if (body.velocity.y < 0) {
                body.velocity.y *= -body.restitution;
                // Apply friction on ground
                body.velocity.x *= (1 - body.friction * 0.1);
                body.velocity.z *= (1 - body.friction * 0.1);
            }
            body.onGround = true;
            return true;
        }
        
        body.onGround = false;
        return false;
    }
    
    /** Check if body is clipping through walls */
    checkWallClipping(body) {
        for (const wall of this.staticColliders) {
            if (body.position.x > wall.min.x && body.position.x < wall.max.x &&
                body.position.y > wall.min.y && body.position.y < wall.max.y &&
                body.position.z > wall.min.z && body.position.z < wall.max.z) {
                // Body center is inside wall - this is a clip!
                // Push out to nearest face
                const toMin = body.position.clone().sub(wall.min);
                const toMax = wall.max.clone().sub(body.position);
                
                const minDist = Math.min(toMin.x, toMin.y, toMin.z, toMax.x, toMax.y, toMax.z);
                let push = new THREE.Vector3();
                
                if (minDist === toMin.x) push.set(-1, 0, 0);
                else if (minDist === toMin.y) push.set(0, -1, 0);
                else if (minDist === toMin.z) push.set(0, 0, -1);
                else if (minDist === toMax.x) push.set(1, 0, 0);
                else if (minDist === toMax.y) push.set(0, 1, 0);
                else push.set(0, 0, 1);
                
                body.position.add(push.multiplyScalar(minDist + body.radius + 0.1));
                body.velocity.reflect(push.normalize()).multiplyScalar(0.5);
                this.debugInfo.clips++;
                return true;
            }
        }
        return false;
    }
    
    /** Check if body is floating (too high above ground with no upward velocity) */
    checkFloating(body) {
        const heightAboveGround = body.position.y - this.groundY - body.radius;
        if (heightAboveGround > 0.5 && Math.abs(body.velocity.y) < 0.1 && body.gravityScale > 0) {
            // Should be falling but isn't - apply extra gravity
            body.velocity.y -= 0.5;
            this.debugInfo.floaters++;
            return true;
        }
        return false;
    }
    
    step(dt) {
        const startTime = performance.now();
        const subDt = dt / this.subSteps;
        
        this.debugInfo.collisions = 0;
        
        for (let step = 0; step < this.subSteps; step++) {
            // Integrate forces
            for (const body of this.bodies) {
                if (body.type !== 'dynamic') continue;
                
                body.previousPosition.copy(body.position);
                
                // Apply gravity
                if (!body.onGround || body.velocity.y > 0) {
                    body.acceleration.add(this.gravity.clone().multiplyScalar(body.gravityScale));
                }
                
                // Integrate velocity
                body.velocity.add(body.acceleration.clone().multiplyScalar(subDt));
                
                // Clamp max velocity
                if (body.velocity.length() > this.maxVelocity) {
                    body.velocity.normalize().multiplyScalar(this.maxVelocity);
                }
                
                // Integrate position
                body.position.add(body.velocity.clone().multiplyScalar(subDt));
                
                // Reset acceleration
                body.acceleration.set(0, 0, 0);
                
                // Ground collision
                if (this.resolveGround(body)) {
                    this.debugInfo.collisions++;
                }
                
                // Wall collisions
                for (const wall of this.staticColliders) {
                    if (this.resolveSphereAABB(body, wall.min, wall.max, subDt)) {
                        this.debugInfo.collisions++;
                    }
                }
                
                // Check clipping (emergency fix)
                this.checkWallClipping(body);
                
                // Check floating
                this.checkFloating(body);
                
                // NaN check
                if (isNaN(body.position.x) || isNaN(body.position.y) || isNaN(body.position.z)) {
                    console.warn('NaN position detected, resetting body');
                    body.position.copy(body.previousPosition);
                    body.velocity.set(0, 0, 0);
                }
                
                // Sleep check
                if (body.velocity.length() < body.sleepThreshold && body.onGround) {
                    body.isSleeping = true;
                } else {
                    body.isSleeping = false;
                }
            }
            
            // Body-body collisions
            for (let i = 0; i < this.bodies.length; i++) {
                for (let j = i + 1; j < this.bodies.length; j++) {
                    if (this.resolveSphereSphere(this.bodies[i], this.bodies[j], subDt)) {
                        this.debugInfo.collisions++;
                    }
                }
            }
        }
        
        this.debugInfo.stepTime = performance.now() - startTime;
    }
}

export const Physics = {
    World: PhysicsWorld,
    Body: PhysicsBody
};
