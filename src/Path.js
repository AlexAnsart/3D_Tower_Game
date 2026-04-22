/** @fileoverview Natural winding dirt road path - clearly visible above ground */

import * as THREE from 'three';

export class Path {
    /** Logical height along the spline (flat arena). */
    static PATH_HEIGHT = 0;
    /**
     * Visual road sits clearly above the terrain mesh. Large value avoids z-fighting
     * (depth buffer precision) when the camera is high and (x,z) are large.
     */
    static ROAD_MESH_LIFT = 0.32;

    constructor(scene) {
        this.scene = scene;
        this.waypoints = [];
        this.generatePath();
    }

    generatePath() {
        const extent = 92;
        const y = Path.PATH_HEIGHT;
        // Long and readable route for a much larger board
        this.waypoints = [
            new THREE.Vector3(-extent, y, -extent),
            new THREE.Vector3(-extent, y, -52),
            new THREE.Vector3(-58, y, -52),
            new THREE.Vector3(-58, y, -16),
            new THREE.Vector3(-24, y, -16),
            new THREE.Vector3(-24, y, 30),
            new THREE.Vector3(12, y, 30),
            new THREE.Vector3(12, y, -42),
            new THREE.Vector3(46, y, -42),
            new THREE.Vector3(46, y, -4),
            new THREE.Vector3(76, y, -4),
            new THREE.Vector3(76, y, 42),
            new THREE.Vector3(extent, y, 42),
            new THREE.Vector3(extent, y, extent)
        ];

        this.createVisualPath();
        this.createPathMarkers();
    }

    createVisualPath() {
        const curve = new THREE.CatmullRomCurve3(this.waypoints);
        const points = curve.getPoints(560);
        // Never use baseY-ε: that put strips inside the ground and caused z-fighting
        const baseY = Path.PATH_HEIGHT + Path.ROAD_MESH_LIFT;
        const roadGroup = new THREE.Group();
        roadGroup.name = 'PathRoad';
        this.scene.add(roadGroup);

        const addRoadMesh = (geo, mat) => {
            const m = new THREE.Mesh(geo, mat);
            m.receiveShadow = true;
            m.renderOrder = 1;
            mat.polygonOffset = true;
            mat.polygonOffsetFactor = -2.5;
            mat.polygonOffsetUnits = -4;
            roadGroup.add(m);
        };

        // Opaque, wide foundation first — reads as a real road surface, not a line
        const shoulderMat = new THREE.MeshStandardMaterial({ color: 0x3d3225, roughness: 0.99, metalness: 0, side: THREE.DoubleSide });
        const packMat = new THREE.MeshStandardMaterial({ color: 0x4f3f28, roughness: 0.96, metalness: 0, side: THREE.DoubleSide });
        const mainMat = new THREE.MeshStandardMaterial({ color: 0x8b6640, roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
        const rutsMat = new THREE.MeshStandardMaterial({ color: 0x2a1f12, roughness: 0.95, metalness: 0, side: THREE.DoubleSide });
        const lightMat = new THREE.MeshStandardMaterial({ color: 0xb8956a, roughness: 0.88, metalness: 0.02, side: THREE.DoubleSide });
        const gravelMat = new THREE.MeshStandardMaterial({ color: 0x4a3f32, roughness: 0.95, metalness: 0, side: THREE.DoubleSide });

        addRoadMesh(this.buildRoadStrip(points, 6.4, baseY + 0.0), shoulderMat);
        addRoadMesh(this.buildRoadStrip(points, 5.2, baseY + 0.01), packMat);
        addRoadMesh(this.buildRoadStrip(points, 4.0, baseY + 0.02), mainMat);
        // Keep only one central groove to avoid coplanar flicker in motion.
        addRoadMesh(this.buildRoadStrip(points, 0.9, baseY + 0.06), rutsMat);
        addRoadMesh(this.buildRoadStrip(points, 1.25, baseY + 0.045), lightMat);
        for (const side of [-1, 1]) {
            const bandMat = gravelMat.clone();
            const c = new THREE.Mesh(
                this.buildRoadBand(points, 3.8, 4.4, side, baseY + 0.05),
                bandMat
            );
            c.castShadow = true;
            c.receiveShadow = true;
            c.renderOrder = 1;
            bandMat.polygonOffset = true;
            bandMat.polygonOffsetFactor = -2.5;
            bandMat.polygonOffsetUnits = -4;
            roadGroup.add(c);
        }
        for (const side of [-1, 1]) {
            const c = new THREE.Mesh(
                this.buildRoadBand(points, 3.1, 3.75, side, baseY + 0.07),
                new THREE.MeshStandardMaterial({ color: 0x3a2e28, roughness: 0.9, side: THREE.DoubleSide })
            );
            c.castShadow = true;
            c.material.polygonOffset = true;
            c.material.polygonOffsetFactor = -2.5;
            c.material.polygonOffsetUnits = -4;
            c.renderOrder = 1;
            roadGroup.add(c);
        }

        // Removed dense micro-dots: they were causing noisy shimmer/aliasing on the center line.

        this.curve = curve;
        this.pathLength = curve.getLength();
    }

    buildRoadStrip(points, halfWidth, y) {
        const left = [];
        const right = [];
        for (let i = 0; i < points.length; i++) {
            const prev = points[Math.max(0, i - 1)];
            const next = points[Math.min(points.length - 1, i + 1)];
            const dir = new THREE.Vector3(next.x - prev.x, 0, next.z - prev.z).normalize();
            const normal = new THREE.Vector3(-dir.z, 0, dir.x);

            left.push(new THREE.Vector3(points[i].x + normal.x * halfWidth, y, points[i].z + normal.z * halfWidth));
            right.push(new THREE.Vector3(points[i].x - normal.x * halfWidth, y, points[i].z - normal.z * halfWidth));
        }

        return this.buildStripGeometry(left, right);
    }

    buildRoadBand(points, innerWidth, outerWidth, side, y) {
        const inner = [];
        const outer = [];
        for (let i = 0; i < points.length; i++) {
            const prev = points[Math.max(0, i - 1)];
            const next = points[Math.min(points.length - 1, i + 1)];
            const dir = new THREE.Vector3(next.x - prev.x, 0, next.z - prev.z).normalize();
            const normal = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(side);

            inner.push(new THREE.Vector3(points[i].x + normal.x * innerWidth, y, points[i].z + normal.z * innerWidth));
            outer.push(new THREE.Vector3(points[i].x + normal.x * outerWidth, y, points[i].z + normal.z * outerWidth));
        }

        return this.buildStripGeometry(inner, outer);
    }

    buildStripGeometry(a, b) {
        const vertices = [];
        for (let i = 0; i < a.length - 1; i++) {
            const a0 = a[i], a1 = a[i + 1], b0 = b[i], b1 = b[i + 1];
            vertices.push(
                a0.x, a0.y, a0.z,
                b0.x, b0.y, b0.z,
                a1.x, a1.y, a1.z,
                a1.x, a1.y, a1.z,
                b0.x, b0.y, b0.z,
                b1.x, b1.y, b1.z
            );
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geometry.computeVertexNormals();
        return geometry;
    }

    createPathMarkers() {
        const startPos = this.waypoints[0].clone().add(new THREE.Vector3(-4.5, 0, 0));
        const endPos = this.waypoints[this.waypoints.length - 1].clone().add(new THREE.Vector3(4.5, 0, 0));

        // Start banner
        this.createBanner(startPos, 0x3a7a3a, 'START');
        // End gate
        this.createGate(endPos);
    }

    createBanner(position, color, text) {
        const group = new THREE.Group();
        group.position.copy(position);

        const poleGeo = new THREE.CylinderGeometry(0.08, 0.08, 3.5, 6);
        const poleMat = new THREE.MeshStandardMaterial({ color: 0x5a3a1a });
        const pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.y = 1.75;
        pole.castShadow = true;
        group.add(pole);

        const flagGeo = new THREE.BoxGeometry(1.4, 0.7, 0.06);
        const flagMat = new THREE.MeshStandardMaterial({ color: color });
        const flag = new THREE.Mesh(flagGeo, flagMat);
        flag.position.set(0.7, 3.0, 0);
        group.add(flag);

        // Flag pole top
        const topGeo = new THREE.SphereGeometry(0.1, 6, 6);
        const top = new THREE.Mesh(topGeo, new THREE.MeshStandardMaterial({ color: 0xaa8833, metalness: 0.8 }));
        top.position.y = 3.5;
        group.add(top);

        this.scene.add(group);
    }

    createGate(position) {
        const group = new THREE.Group();
        group.position.copy(position);

        const pillarGeo = new THREE.BoxGeometry(1.2, 3.5, 1.2);
        const pillarMat = new THREE.MeshStandardMaterial({ color: 0x7a7a7a, roughness: 0.9 });

        const leftPillar = new THREE.Mesh(pillarGeo, pillarMat);
        leftPillar.position.set(-1.8, 1.75, 0);
        leftPillar.castShadow = true;
        group.add(leftPillar);

        const rightPillar = new THREE.Mesh(pillarGeo, pillarMat);
        rightPillar.position.set(1.8, 1.75, 0);
        rightPillar.castShadow = true;
        group.add(rightPillar);

        // Arch
        const archGeo = new THREE.BoxGeometry(4.8, 0.9, 1.4);
        const arch = new THREE.Mesh(archGeo, pillarMat);
        arch.position.set(0, 3.8, 0);
        arch.castShadow = true;
        group.add(arch);

        // Arch detail - keystone
        const keyGeo = new THREE.BoxGeometry(0.8, 0.6, 1.5);
        const keyMat = new THREE.MeshStandardMaterial({ color: 0x5a5a5a, roughness: 0.9 });
        const key = new THREE.Mesh(keyGeo, keyMat);
        key.position.set(0, 4.0, 0);
        group.add(key);

        // Wooden doors
        const doorGeo = new THREE.BoxGeometry(1.0, 3.0, 0.12);
        const doorMat = new THREE.MeshStandardMaterial({ color: 0x5a3a1a, roughness: 0.9 });

        const leftDoor = new THREE.Mesh(doorGeo, doorMat);
        leftDoor.position.set(-0.9, 1.5, 0);
        group.add(leftDoor);

        const rightDoor = new THREE.Mesh(doorGeo, doorMat);
        rightDoor.position.set(0.9, 1.5, 0);
        group.add(rightDoor);

        // Door iron bands
        for (let i = 0; i < 3; i++) {
            const bandGeo = new THREE.BoxGeometry(2.0, 0.08, 0.15);
            const bandMat = new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.8 });
            const band = new THREE.Mesh(bandGeo, bandMat);
            band.position.set(0, 0.8 + i * 1.0, 0.05);
            group.add(band);
        }

        // Torches on pillars
        for (const x of [-1.8, 1.8]) {
            const torchGeo = new THREE.CylinderGeometry(0.06, 0.08, 0.4, 6);
            const torchMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1a });
            const torch = new THREE.Mesh(torchGeo, torchMat);
            torch.position.set(x, 2.8, 0.7);
            group.add(torch);

            const flameGeo = new THREE.SphereGeometry(0.1, 6, 6);
            const flameMat = new THREE.MeshStandardMaterial({
                color: 0xff8844,
                emissive: 0xff4400,
                emissiveIntensity: 0.5
            });
            const flame = new THREE.Mesh(flameGeo, flameMat);
            flame.position.set(x, 3.1, 0.7);
            group.add(flame);
        }

        this.scene.add(group);
    }

    getPositionAt(t) {
        return this.curve.getPointAt(Math.max(0, Math.min(1, t)));
    }

    getTangentAt(t) {
        return this.curve.getTangentAt(Math.max(0, Math.min(1, t)));
    }

    getTotalLength() {
        return this.pathLength;
    }
}
