/** @fileoverview Large map: flat arena (path + build) and relief only beyond the arena */

import * as THREE from 'three';
import { SETTINGS } from './settings.js';

export class Board {
    static PLAY_GROUND_Y = 0;

    constructor(scene, physics, path) {
        this.scene = scene;
        this.physics = physics;
        this.path = path;
        this.size = 120;
        this.tileSize = 2;
        this.mapExtent = this.size * this.tileSize / 2;
        this.pathNoDecorMargin = 5.4;
        this.pathNoBuildMargin = 8.5;
        this.minTowerSpacing = 2.6;
        this.terrainMesh = null;
        this.clouds = [];
        this.occupiedFeatures = [];
        this.pathSegments = this.buildPathSegments();
        this.decorScale = SETTINGS.world.globalScale;

        this.createGround();
        this.createInfiniteGround();
        this.createBoundaryColliders();
        this.createPlayfieldBiome();
        this.createRivers();
        this.createForests();
        this.createRockFields();
        this.createBushes();
        this.createFlowers();
        this.createRuins();
        this.createMountainRanges();
        this.createClouds();
    }

    buildPathSegments() {
        const segments = [];
        const points = this.path?.waypoints || [];
        for (let i = 0; i < points.length - 1; i++) {
            const a = points[i];
            const b = points[i + 1];
            segments.push({
                ax: a.x,
                az: a.z,
                bx: b.x,
                bz: b.z
            });
        }
        return segments;
    }

    smoothstep(edge0, edge1, value) {
        const t = THREE.MathUtils.clamp((value - edge0) / (edge1 - edge0), 0, 1);
        return t * t * (3 - 2 * t);
    }

    segmentDistanceSquared(px, pz, ax, az, bx, bz) {
        const abx = bx - ax;
        const abz = bz - az;
        const apx = px - ax;
        const apz = pz - az;
        const abLenSq = abx * abx + abz * abz || 1;
        const t = THREE.MathUtils.clamp((apx * abx + apz * abz) / abLenSq, 0, 1);
        const dx = px - (ax + abx * t);
        const dz = pz - (az + abz * t);
        return dx * dx + dz * dz;
    }

    distanceToPath(x, z) {
        let bestSq = Infinity;
        for (const seg of this.pathSegments) {
            const dSq = this.segmentDistanceSquared(x, z, seg.ax, seg.az, seg.bx, seg.bz);
            if (dSq < bestSq) bestSq = dSq;
        }
        return Math.sqrt(bestSq);
    }

    isNearPath(x, z, margin = 0) {
        return this.distanceToPath(x, z) < this.pathNoDecorMargin + margin;
    }

    isInPlayField(x, z) {
        return Math.abs(x) <= this.mapExtent && Math.abs(z) <= this.mapExtent;
    }

    /**
     * Distance to the play rectangle; 0 on or inside, positive outside the arena edge.
     */
    distanceOutsidePlayField(x, z) {
        const e = this.mapExtent;
        const dx = Math.max(0, Math.abs(x) - e);
        const dz = Math.max(0, Math.abs(z) - e);
        return Math.hypot(dx, dz);
    }

    getReliefHeight(x, z) {
        const d = Math.hypot(x, z);
        const broad = Math.sin(x * 0.02) * Math.cos(z * 0.016) * 4.2;
        const medium = Math.sin((x + z) * 0.032) * 1.5 + Math.cos((x - z) * 0.028) * 1.2;
        const detail = Math.sin(x * 0.1 + z * 0.065) * 0.4;
        const farMask = this.smoothstep(120, 380, d);
        const mountainMask = this.smoothstep(40, 220, d) * 0.85;
        const mountains = mountainMask * (
            Math.abs(Math.sin(x * 0.012) * Math.cos(z * 0.01)) * 20 +
            Math.abs(Math.sin((x + z) * 0.008)) * 12
        );
        return broad + medium + detail + farMask * 14 + mountains;
    }

    getTerrainHeight(x, z) {
        if (this.isInPlayField(x, z)) return Board.PLAY_GROUND_Y;
        const dOut = this.distanceOutsidePlayField(x, z);
        if (dOut < 0.0001) return Board.PLAY_GROUND_Y;
        const blend = this.smoothstep(0, 32, dOut);
        return Board.PLAY_GROUND_Y + blend * this.getReliefHeight(x, z);
    }

    getSlopeMagnitude(x, z) {
        const h = 1.0;
        const dhx = this.getTerrainHeight(x + h, z) - this.getTerrainHeight(x - h, z);
        const dhz = this.getTerrainHeight(x, z + h) - this.getTerrainHeight(x, z - h);
        return Math.sqrt(dhx * dhx + dhz * dhz) / (2 * h);
    }

    canPlaceFeature(x, z, radius, options = {}) {
        const {
            avoidPath = true,
            pathMargin = 0,
            maxSlope = Infinity,
            minDistanceToEdge = 0,
            register = false
        } = options;

        if (Math.abs(x) > this.mapExtent * 1.45 - minDistanceToEdge) return false;
        if (Math.abs(z) > this.mapExtent * 1.45 - minDistanceToEdge) return false;
        if (avoidPath && this.isNearPath(x, z, pathMargin + radius)) return false;
        if (this.getSlopeMagnitude(x, z) > maxSlope) return false;

        for (const item of this.occupiedFeatures) {
            const dx = x - item.x;
            const dz = z - item.z;
            if (Math.sqrt(dx * dx + dz * dz) < radius + item.radius + 0.6) {
                return false;
            }
        }

        if (register) this.occupiedFeatures.push({ x, z, radius });
        return true;
    }

    createGround() {
        const worldSize = this.size * this.tileSize * 2;
        const geometry = new THREE.PlaneGeometry(worldSize, worldSize, 220, 220);
        const pos = geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i);
            const z = pos.getY(i);
            pos.setZ(i, this.getTerrainHeight(x, z));
        }
        geometry.computeVertexNormals();

        const groundMat = new THREE.MeshStandardMaterial({
            color: 0x5fa33f,
            roughness: 0.97,
            metalness: 0.0,
            polygonOffset: true,
            polygonOffsetFactor: 1,
            polygonOffsetUnits: 1
        });
        const ground = new THREE.Mesh(geometry, groundMat);
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        ground.name = 'ArenaTerrain';
        ground.userData.isTerrain = true;
        this.terrainMesh = ground;
        this.scene.add(ground);

        for (let i = 0; i < 55; i++) {
            const px = (Math.random() - 0.5) * this.mapExtent * 2.6;
            const pz = (Math.random() - 0.5) * this.mapExtent * 2.6;
            if (this.isInPlayField(px, pz)) continue;
            if (this.isNearPath(px, pz, 8)) continue;
            const patch = new THREE.Mesh(
                new THREE.CircleGeometry(5 + Math.random() * 9, 20),
                new THREE.MeshStandardMaterial({
                    color: i % 2 ? 0x4b852c : 0x6bac4b,
                    roughness: 1,
                    transparent: true,
                    opacity: 0.3
                })
            );
            patch.rotation.x = -Math.PI / 2;
            patch.position.set(px, this.getTerrainHeight(px, pz) + 0.05, pz);
            this.scene.add(patch);
        }
    }

    createInfiniteGround() {
        const farGround = new THREE.Mesh(
            new THREE.CircleGeometry(2600, 64),
            new THREE.MeshStandardMaterial({
                color: 0x426c30,
                roughness: 1,
                metalness: 0
            })
        );
        farGround.rotation.x = -Math.PI / 2;
        farGround.position.y = -4.2;
        farGround.receiveShadow = true;
        this.scene.add(farGround);
    }

    createBoundaryColliders() {
        const extent = this.mapExtent + 16;
        const wallH = 24;
        const wallT = 4;
        const configs = [
            { pos: [0, wallH / 2, -extent], size: [extent * 2, wallH, wallT] },
            { pos: [0, wallH / 2, extent], size: [extent * 2, wallH, wallT] },
            { pos: [-extent, wallH / 2, 0], size: [wallT, wallH, extent * 2] },
            { pos: [extent, wallH / 2, 0], size: [wallT, wallH, extent * 2] }
        ];
        for (const cfg of configs) {
            const half = new THREE.Vector3(cfg.size[0] / 2, cfg.size[1] / 2, cfg.size[2] / 2);
            const center = new THREE.Vector3(...cfg.pos);
            this.physics.addStaticCollider(center.clone().sub(half), center.clone().add(half));
        }
    }

    isClearOfPathForBuild(x, z) {
        return this.distanceToPath(x, z) >= this.pathNoBuildMargin;
    }

    /**
     * @param {Array<{ position: THREE.Vector3 }>} towerInstances
     */
    canPlaceTowerAt(x, z, towerInstances) {
        if (!this.isInPlayField(x, z)) return false;
        if (!this.isClearOfPathForBuild(x, z)) return false;
        for (const t of towerInstances) {
            const p = t.position;
            if (Math.hypot(p.x - x, p.z - z) < this.minTowerSpacing) return false;
        }
        return true;
    }

    tryTowerPlacementAt(x, z, towerInstances) {
        if (!this.canPlaceTowerAt(x, z, towerInstances)) return null;
        return { x, y: Board.PLAY_GROUND_Y, z };
    }

    /**
     * Rich decoration on the flat arena (towers can still be placed anywhere with spacing rules only).
     */
    createPlayfieldBiome() {
        const e = this.mapExtent * 0.94;
        const y = Board.PLAY_GROUND_Y;
        const pick = () => (Math.random() * 2 - 1) * e;
        const spawnPoint = this.path?.waypoints?.[0];
        const endPoint = this.path?.waypoints?.[this.path.waypoints.length - 1];
        const isNearCriticalPathPoint = (x, z, radius) => {
            if (spawnPoint && Math.hypot(x - spawnPoint.x, z - spawnPoint.z) < radius) return true;
            if (endPoint && Math.hypot(x - endPoint.x, z - endPoint.z) < radius) return true;
            return false;
        };

        for (let i = 0; i < 320; i++) {
            const x = pick();
            const z = pick();
            if (!this.isInPlayField(x, z)) continue;
            const patchRadius = 2.2 + Math.random() * 5;
            // Keep decorative grass patches fully away from the road footprint.
            if (this.isNearPath(x, z, patchRadius + 1.2)) continue;
            const g = new THREE.Mesh(
                new THREE.CircleGeometry(patchRadius, 16),
                new THREE.MeshStandardMaterial({
                    color: Math.random() > 0.5 ? 0x5a963c : 0x6bad4e,
                    roughness: 1,
                    transparent: true,
                    opacity: 0.32,
                    depthWrite: false
                })
            );
            g.rotation.x = -Math.PI / 2;
            g.position.set(x, y + 0.03, z);
            this.scene.add(g);
        }

        for (let n = 0; n < 1800; n++) {
            const x = pick();
            const z = pick();
            if (!this.isInPlayField(x, z)) continue;
            const dPath = this.distanceToPath(x, z);
            if (dPath < 2.2) continue;
            if (isNearCriticalPathPoint(x, z, 12)) continue;
            const t = n % 23;
            if (t < 3) {
                if (dPath < 5) continue;
                this.createTree(x, z, 0.3 + Math.random() * 1.9);
            } else if (t < 5) {
                if (dPath < 3) continue;
                this.createRock(x, z, 0.2 + Math.random() * 1.8);
            } else if (t < 6) {
                this.createMushroomCluster(x, z, y);
            } else if (t < 7) {
                this.createStump(x, z, y);
            } else if (t < 8) {
                this.createFallenLog(x, z, y);
            } else if (t < 9) {
                this.createHayBale(x, z, y);
            } else if (t < 10) {
                this.createBarrel(x, z, y);
            } else if (t < 11) {
                this.createCrate(x, z, y);
            } else if (t < 12) {
                this.createCairn(x, z, y);
            } else if (t < 13) {
                this.createFenceChunk(x, z, y);
            } else if (t < 14) {
                this.createCampfire(x, z, y);
            } else if (t < 15) {
                this.createLamppost(x, z, y);
            } else if (t < 16) {
                this.createBoulderPile(x, z, y);
            } else if (t < 18) {
                this.createBushPuff(x, z, y);
            } else if (t < 20) {
                this.createTallGrass(x, z, y);
            } else {
                this.createFloret(x, z, y);
            }
        }
    }

    createMushroomCluster(x, z, y) {
        const clusterScale = 0.6 + Math.random() * 2.2;
        for (let i = 0; i < 2 + (Math.random() * 3 | 0); i++) {
            const a = (i / 4) * Math.PI * 2 + Math.random() * 0.5;
            const m = new THREE.Group();
            m.position.set(x + Math.cos(a) * 0.3 * clusterScale, y, z + Math.sin(a) * 0.3 * clusterScale);
            const cap = new THREE.Mesh(
                new THREE.ConeGeometry(0.16, 0.12, 8),
                new THREE.MeshStandardMaterial({ color: 0xcc2222, roughness: 0.8 })
            );
            cap.position.y = 0.14;
            const st = new THREE.Mesh(
                new THREE.CylinderGeometry(0.05, 0.08, 0.12, 5),
                new THREE.MeshStandardMaterial({ color: 0xf0e0d0, roughness: 0.9 })
            );
            st.position.y = 0.04;
            m.add(cap, st);
            m.rotation.y = Math.random() * Math.PI;
            m.scale.setScalar(clusterScale);
            this.scene.add(m);
        }
    }

    createStump(x, z, y) {
        const s = 0.55 + Math.random() * 2.0;
        const stump = new THREE.Mesh(
            new THREE.CylinderGeometry(0.35 * s, 0.45 * s, 0.35 * s, 8),
            new THREE.MeshStandardMaterial({ color: 0x5a3c22, roughness: 0.9 })
        );
        stump.position.set(x, y + 0.17 * s, z);
        stump.castShadow = true;
        this.scene.add(stump);
    }

    createFallenLog(x, z, y) {
        const s = 0.5 + Math.random() * 2.2;
        const log = new THREE.Mesh(
            new THREE.CylinderGeometry(0.2 * s, 0.22 * s, (1.1 + Math.random() * 1.5) * s, 6),
            new THREE.MeshStandardMaterial({ color: 0x4a2f18, roughness: 0.9 })
        );
        log.position.set(x, y + 0.12 * s, z);
        log.rotation.set(Math.random() * 0.1, Math.random() * Math.PI, Math.PI / 2.1);
        log.castShadow = true;
        this.scene.add(log);
    }

    createHayBale(x, z, y) {
        const s = 0.65 + Math.random() * 1.8;
        const bale = new THREE.Mesh(
            new THREE.CylinderGeometry(0.55 * s, 0.55 * s, 0.75 * s, 8),
            new THREE.MeshStandardMaterial({ color: 0xc9a64a, roughness: 0.95 })
        );
        bale.position.set(x, y + 0.38 * s, z);
        bale.rotation.z = Math.PI / 2;
        bale.castShadow = true;
        this.scene.add(bale);
    }

    createBarrel(x, z, y) {
        const s = 0.6 + Math.random() * 1.6;
        const b = new THREE.Mesh(
            new THREE.CylinderGeometry(0.28 * s, 0.3 * s, 0.65 * s, 10),
            new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 0.85, metalness: 0.05 })
        );
        b.position.set(x, y + 0.32 * s, z);
        b.castShadow = true;
        this.scene.add(b);
    }

    createCrate(x, z, y) {
        const s = 0.55 + Math.random() * 1.7;
        const c = new THREE.Mesh(
            new THREE.BoxGeometry(0.5 * s, 0.5 * s, 0.5 * s),
            new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 0.88 })
        );
        c.position.set(x, y + 0.25 * s, z);
        c.rotation.y = Math.random() * Math.PI;
        c.castShadow = true;
        this.scene.add(c);
    }

    createCairn(x, z, y) {
        const baseScale = 0.7 + Math.random() * 2.0;
        const layers = 3 + ((Math.random() * 4) | 0);
        const m = new THREE.MeshStandardMaterial({ color: 0x8a8a8a, roughness: 0.92 });
        for (let i = 0; i < layers; i++) {
            const s = (0.16 + i * 0.06) * baseScale;
            const rock = new THREE.Mesh(new THREE.SphereGeometry(s, 5, 5), m);
            rock.position.set(x + (Math.random() - 0.5) * 0.15, y + s * 0.5 + i * 0.18, z + (Math.random() - 0.5) * 0.15);
            rock.castShadow = true;
            this.scene.add(rock);
        }
    }

    createFenceChunk(x, z, y) {
        const s = 0.65 + Math.random() * 1.9;
        for (let i = 0; i < 3; i++) {
            const post = new THREE.Mesh(
                new THREE.CylinderGeometry(0.05 * s, 0.06 * s, 0.6 * s, 5),
                new THREE.MeshStandardMaterial({ color: 0x5a3a1a, roughness: 0.9 })
            );
            const ox = (i - 1) * 0.55 * s;
            post.position.set(x + ox, y + 0.3 * s, z);
            post.castShadow = true;
            this.scene.add(post);
            if (i < 2) {
                const rail = new THREE.Mesh(
                    new THREE.BoxGeometry(0.6 * s, 0.06 * s, 0.04 * s),
                    new THREE.MeshStandardMaterial({ color: 0x4a2a0a, roughness: 0.9 })
                );
                rail.position.set(x + ox + 0.28 * s, y + 0.45 * s, z);
                this.scene.add(rail);
            }
        }
    }

    createCampfire(x, z, y) {
        const s = 0.65 + Math.random() * 1.7;
        const base = new THREE.Mesh(
            new THREE.CircleGeometry(0.45 * s, 8),
            new THREE.MeshStandardMaterial({ color: 0x2a1a0a, roughness: 1 })
        );
        base.rotation.x = -Math.PI / 2;
        base.position.set(x, y + 0.01, z);
        this.scene.add(base);
        const n = 6;
        for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2;
            const log = new THREE.Mesh(
                new THREE.ConeGeometry(0.08 * s, 0.4 * s, 4),
                new THREE.MeshStandardMaterial({ color: 0x3a2210, roughness: 0.95 })
            );
            log.position.set(x + Math.cos(a) * 0.15 * s, y + 0.12 * s, z + Math.sin(a) * 0.15 * s);
            log.rotation.set(0, a, 0.6);
            this.scene.add(log);
        }
        const ember = new THREE.Mesh(
            new THREE.SphereGeometry(0.1 * s, 6, 6),
            new THREE.MeshStandardMaterial({ color: 0xff5500, emissive: 0xcc3300, emissiveIntensity: 0.4 })
        );
        ember.position.set(x, y + 0.2 * s, z);
        this.scene.add(ember);
    }

    createLamppost(x, z, y) {
        const s = 0.6 + Math.random() * 2.1;
        const post = new THREE.Mesh(
            new THREE.CylinderGeometry(0.06 * s, 0.1 * s, 2.2 * s, 6),
            new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6, metalness: 0.4 })
        );
        post.position.set(x, y + 1.1 * s, z);
        post.castShadow = true;
        this.scene.add(post);
        const lamp = new THREE.Mesh(
            new THREE.SphereGeometry(0.2 * s, 8, 6),
            new THREE.MeshStandardMaterial({ color: 0xfff5cc, emissive: 0xffe090, emissiveIntensity: 0.35, transparent: true, opacity: 0.9 })
        );
        lamp.position.set(x, y + 2.15 * s, z);
        this.scene.add(lamp);
    }

    createBoulderPile(x, z, y) {
        const pileScale = 0.6 + Math.random() * 2.2;
        const count = 3 + ((Math.random() * 4) | 0);
        for (let i = 0; i < count; i++) {
            const s = (0.22 + Math.random() * 0.55) * pileScale;
            const b = new THREE.Mesh(
                new THREE.DodecahedronGeometry(s, 0),
                new THREE.MeshStandardMaterial({ color: 0x6e6b68, roughness: 0.95 })
            );
            b.position.set(
                x + (Math.random() - 0.5) * 0.3,
                y + s * 0.3 + (i === 0 ? 0 : 0.15) * i,
                z + (Math.random() - 0.5) * 0.3
            );
            b.rotation.set(Math.random(), Math.random(), Math.random());
            b.castShadow = true;
            b.receiveShadow = true;
            this.scene.add(b);
        }
    }

    createBushPuff(x, z, y) {
        const s = 0.5 + Math.random() * 2.1;
        const bush = new THREE.Mesh(
            new THREE.SphereGeometry((0.35 + Math.random() * 0.35) * s, 6, 6),
            new THREE.MeshStandardMaterial({ color: 0x3d8a32, roughness: 0.9 })
        );
        bush.position.set(x, y + 0.22 * s, z);
        bush.scale.set(1, 0.65, 1);
        bush.castShadow = true;
        this.scene.add(bush);
    }

    createTallGrass(x, z, y) {
        const grassScale = 0.6 + Math.random() * 2.0;
        const blades = 4 + ((Math.random() * 6) | 0);
        for (let b = 0; b < blades; b++) {
            const a = b * 0.4;
            const blade = new THREE.Mesh(
                new THREE.PlaneGeometry(0.1 * grassScale, (0.4 + Math.random() * 0.35) * grassScale),
                new THREE.MeshStandardMaterial({ color: 0x3a6a2a, roughness: 0.95, side: THREE.DoubleSide })
            );
            blade.position.set(
                x + (Math.random() - 0.5) * 0.18 * grassScale,
                y + 0.14 * grassScale,
                z + (Math.random() - 0.5) * 0.18 * grassScale
            );
            blade.rotation.set(0, a + Math.random() * 0.35, 0.08 + Math.random() * 0.25);
            this.scene.add(blade);
        }
    }

    createFloret(x, z, y) {
        const sMul = 0.55 + Math.random() * 2.1;
        const col = [0xff5555, 0xffd040, 0x88aaff, 0xffffff, 0xff8c3f][(Math.random() * 5) | 0];
        const s = new THREE.Mesh(
            new THREE.CylinderGeometry(0.008 * sMul, 0.01 * sMul, 0.18 * sMul, 4),
            new THREE.MeshStandardMaterial({ color: 0x1f4a1f, roughness: 1 })
        );
        s.position.set(x, y + 0.08 * sMul, z);
        const f = new THREE.Mesh(
            new THREE.SphereGeometry(0.06 * sMul, 4, 4),
            new THREE.MeshStandardMaterial({ color: col, roughness: 0.5 })
        );
        f.position.set(x, y + 0.2 * sMul, z);
        this.scene.add(s, f);
    }

    createTree(x, z, scale = 1) {
        const y = this.getTerrainHeight(x, z);
        const tree = new THREE.Group();
        tree.position.set(x, y, z);
        tree.scale.setScalar(scale * this.decorScale);

        const trunk = new THREE.Mesh(
            new THREE.CylinderGeometry(0.16, 0.26, 2.2, 7),
            new THREE.MeshStandardMaterial({ color: 0x5c3b1b, roughness: 0.9 })
        );
        trunk.position.y = 1.1;
        trunk.castShadow = true;
        tree.add(trunk);

        const colors = [0x2b7b2b, 0x3f8f3f, 0x1f681f, 0x4ca245];
        const sizes = [1.9, 1.45, 1.06, 0.75];
        const heights = [2.8, 3.5, 4.15, 4.6];
        for (let i = 0; i < sizes.length; i++) {
            const foliage = new THREE.Mesh(
                new THREE.ConeGeometry(sizes[i], 1.24, 8),
                new THREE.MeshStandardMaterial({ color: colors[i], roughness: 0.84 })
            );
            foliage.position.y = heights[i];
            foliage.castShadow = true;
            tree.add(foliage);
        }

        this.scene.add(tree);
    }

    createForests() {
        for (let c = 0; c < 58; c++) {
            const centerX = (Math.random() - 0.5) * this.mapExtent * 2.6;
            const centerZ = (Math.random() - 0.5) * this.mapExtent * 2.6;
            if (this.isInPlayField(centerX, centerZ)) continue;
            if (this.isNearPath(centerX, centerZ, 18)) continue;
            const count = 10 + Math.floor(Math.random() * 18);
            for (let i = 0; i < count; i++) {
                const x = centerX + (Math.random() - 0.5) * 18;
                const z = centerZ + (Math.random() - 0.5) * 18;
                const r = 2.0;
                if (!this.canPlaceFeature(x, z, r, { avoidPath: true, maxSlope: 1.15, register: true })) continue;
                this.createTree(x, z, 0.45 + Math.random() * 1.9);
            }
        }
    }

    createRock(x, z, scale = 1) {
        const y = this.getTerrainHeight(x, z);
        const rock = new THREE.Mesh(
            new THREE.DodecahedronGeometry(0.5 * scale, 0),
            new THREE.MeshStandardMaterial({ color: 0x6f6f6f, roughness: 0.95, metalness: 0.04 })
        );
        rock.position.set(x, y + 0.26 * scale * this.decorScale, z);
        rock.scale.setScalar(this.decorScale);
        rock.rotation.set(Math.random(), Math.random(), Math.random());
        rock.castShadow = true;
        rock.receiveShadow = true;
        this.scene.add(rock);
    }

    createRockFields() {
        for (let i = 0; i < 380; i++) {
            const x = (Math.random() - 0.5) * this.mapExtent * 2.7;
            const z = (Math.random() - 0.5) * this.mapExtent * 2.7;
            if (this.isInPlayField(x, z)) continue;
            const radius = 0.45 + Math.random() * 3.2;
            if (!this.canPlaceFeature(x, z, radius, { avoidPath: true, maxSlope: 1.5, register: true })) continue;
            this.createRock(x, z, radius);
        }
    }

    createBushes() {
        for (let i = 0; i < 640; i++) {
            const x = (Math.random() - 0.5) * this.mapExtent * 2.7;
            const z = (Math.random() - 0.5) * this.mapExtent * 2.7;
            if (this.isInPlayField(x, z)) continue;
            const scale = (0.25 + Math.random() * 2.1) * this.decorScale;
            if (!this.canPlaceFeature(x, z, 0.55 * scale, { avoidPath: true, maxSlope: 1.3, register: true })) continue;

            const y = this.getTerrainHeight(x, z);
            const bush = new THREE.Mesh(
                new THREE.SphereGeometry(0.45 * scale, 7, 7),
                new THREE.MeshStandardMaterial({ color: 0x3a7b2a, roughness: 0.92 })
            );
            bush.position.set(x, y + 0.25 * scale, z);
            bush.scale.y = 0.62;
            bush.castShadow = true;
            this.scene.add(bush);
        }
    }

    createFlowers() {
        const colors = [0xff4d4d, 0xffd94d, 0xff96ff, 0xffffff, 0xff8c3f, 0x95d5ff];
        for (let i = 0; i < 900; i++) {
            const x = (Math.random() - 0.5) * this.mapExtent * 2.8;
            const z = (Math.random() - 0.5) * this.mapExtent * 2.8;
            if (this.isInPlayField(x, z)) {
                if (this.isNearPath(x, z, 4.5)) continue;
            }
            const y = this.getTerrainHeight(x, z);

            const stem = new THREE.Mesh(
                new THREE.CylinderGeometry(0.012, 0.012, 0.24, 4),
                new THREE.MeshStandardMaterial({ color: 0x2a5a2a })
            );
            stem.position.set(x, y + 0.12 * this.decorScale, z);
            stem.scale.setScalar(this.decorScale);
            this.scene.add(stem);

            const petal = new THREE.Mesh(
                new THREE.SphereGeometry(0.05, 5, 5),
                new THREE.MeshStandardMaterial({ color: colors[Math.floor(Math.random() * colors.length)] })
            );
            petal.position.set(x, y + 0.26 * this.decorScale, z);
            petal.scale.setScalar(this.decorScale);
            this.scene.add(petal);
        }
    }

    createRivers() {
        const waterMat = new THREE.MeshStandardMaterial({
            color: 0x4b8db3,
            roughness: 0.15,
            metalness: 0.35,
            transparent: true,
            opacity: 0.86
        });

        const toWaterPoint = (x, z) => {
            const h = this.getTerrainHeight(x, z);
            return new THREE.Vector3(x, h + 0.22, z);
        };

        const rawRivers = [
            [[-260, 180], [-210, 140], [-180, 60], [-200, -40], [-250, -160]],
            [[250, -200], [210, -90], [230, 20], [270, 130], [300, 190]]
        ];

        for (const path of rawRivers) {
            const points = path.map(([x, z]) => toWaterPoint(x, z));
            const curve = new THREE.CatmullRomCurve3(points);
            const geo = new THREE.TubeGeometry(curve, 150, 5.2, 12, false);
            const river = new THREE.Mesh(geo, waterMat);
            river.receiveShadow = true;
            this.scene.add(river);
        }
    }

    createRuins() {
        const stoneMat = new THREE.MeshStandardMaterial({ color: 0x888177, roughness: 0.88, metalness: 0.05 });
        for (let i = 0; i < 12; i++) {
            const x = (Math.random() - 0.5) * this.mapExtent * 2.2;
            const z = (Math.random() - 0.5) * this.mapExtent * 2.2;
            if (this.isInPlayField(x, z)) continue;
            if (!this.canPlaceFeature(x, z, 4.4, { avoidPath: true, maxSlope: 1.0, register: true })) continue;
            const y = this.getTerrainHeight(x, z);

            const group = new THREE.Group();
            group.position.set(x, y, z);
            for (let j = 0; j < 3; j++) {
                const h = 3.5 - j * 0.8;
                const pillar = new THREE.Mesh(new THREE.BoxGeometry(1.0, h, 1.0), stoneMat);
                pillar.position.set(-2.2 + j * 2.2, h / 2, (j % 2 === 0 ? 1 : -1) * 0.6);
                pillar.castShadow = true;
                pillar.receiveShadow = true;
                group.add(pillar);
            }

            const beam = new THREE.Mesh(new THREE.BoxGeometry(5.0, 0.7, 1.2), stoneMat);
            beam.position.set(0, 3.2, 0);
            beam.rotation.z = (Math.random() - 0.5) * 0.34;
            beam.castShadow = true;
            group.add(beam);
            this.scene.add(group);
        }
    }

    createMountainRanges() {
        const nearMat = new THREE.MeshStandardMaterial({ color: 0x5f645a, roughness: 0.94, metalness: 0.02 });
        const farMat = new THREE.MeshStandardMaterial({ color: 0x4a5248, roughness: 0.98, metalness: 0.0 });

        for (let i = 0; i < 80; i++) {
            const angle = (i / 80) * Math.PI * 2;
            const radius = this.mapExtent * 1.15 + Math.random() * 220;
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;
            const baseY = this.getTerrainHeight(x, z) - 2.2;
            const height = 25 + Math.random() * 95;
            const width = 10 + Math.random() * 20;
            const mountain = new THREE.Mesh(new THREE.ConeGeometry(width, height, 6), nearMat);
            mountain.position.set(x, baseY + height / 2, z);
            mountain.rotation.y = Math.random() * Math.PI;
            mountain.castShadow = true;
            mountain.receiveShadow = true;
            this.scene.add(mountain);
        }

        for (let i = 0; i < 60; i++) {
            const angle = (i / 60) * Math.PI * 2 + Math.random() * 0.05;
            const radius = 620 + Math.random() * 980;
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;
            const height = 180 + Math.random() * 360;
            const width = 140 + Math.random() * 280;
            const peak = new THREE.Mesh(new THREE.ConeGeometry(width, height, 5), farMat);
            peak.position.set(x, -15 + height / 2, z);
            peak.rotation.y = Math.random() * Math.PI;
            this.scene.add(peak);
        }
    }

    createClouds() {
        const cloudGeo = new THREE.SphereGeometry(1, 8, 8);
        const cloudMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.86,
            roughness: 1
        });
        for (let i = 0; i < 26; i++) {
            const group = new THREE.Group();
            group.position.set(
                (Math.random() - 0.5) * this.mapExtent * 4.5,
                50 + Math.random() * 30,
                (Math.random() - 0.5) * this.mapExtent * 4.5
            );
            const puffCount = 5 + Math.floor(Math.random() * 4);
            for (let j = 0; j < puffCount; j++) {
                const puff = new THREE.Mesh(cloudGeo, cloudMat);
                puff.position.set(
                    (Math.random() - 0.5) * 6,
                    (Math.random() - 0.5) * 2,
                    (Math.random() - 0.5) * 5
                );
                puff.scale.setScalar(1 + Math.random() * 1.5);
                group.add(puff);
            }
            group.userData = { speed: 0.16 + Math.random() * 0.26 };
            this.scene.add(group);
            this.clouds.push(group);
        }
    }

    update() {
        for (const cloud of this.clouds) {
            cloud.position.x += cloud.userData.speed * 0.02;
            if (cloud.position.x > this.mapExtent * 2.5) {
                cloud.position.x = -this.mapExtent * 2.5;
            }
        }
    }
}
