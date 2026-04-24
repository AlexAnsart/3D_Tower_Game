/**
 * Lightweight combat lookahead: scores hypothetical tower placements without Three.js / physics.
 * Uses the same path spline, spawn queue, and approximate tower rules as the live game.
 */

import { SETTINGS, clampTowerLevel, getTowerStats } from '../settings.js';

function dist3(ax, ay, az, bx, by, bz) {
    return Math.hypot(ax - bx, ay - by, az - bz);
}

function enemyWorldPos(path, e) {
    const p = path.getPositionAt(Math.min(1, Math.max(0, e.pathProgress)));
    const y = e.radius;
    return { x: p.x, y, z: p.z };
}

function spawnEnemyInSim(type, hpMult, speedMult) {
    const stats = SETTINGS.enemies[type] || SETTINGS.enemies.basic;
    const g = SETTINGS.world.globalScale;
    return {
        type,
        pathProgress: 0,
        hp: Math.round(stats.hp * hpMult),
        maxHp: Math.round(stats.hp * hpMult),
        speed: stats.speed * speedMult,
        radius: stats.radius * g,
        alive: true
    };
}

function applyMortarAoeAt(path, center, enemies, primaryDamage, deal) {
    const radius = SETTINGS.projectiles.mortar.aoeRadius;
    for (const e of enemies) {
        if (!e.alive) continue;
        const pos = enemyWorldPos(path, e);
        const d = dist3(center.x, center.y, center.z, pos.x, pos.y, pos.z);
        if (d > radius) continue;
        if (e.type === 'basic' || e.type === 'fast') {
            deal(e, e.hp + 1);
        } else {
            const falloff = 1 - d / radius;
            deal(e, primaryDamage * Math.max(0.2, falloff));
        }
    }
}

function findNearestTarget(path, tower, enemies) {
    let best = null;
    let bestD = Infinity;
    const tx = tower.x;
    const ty = tower.y;
    const tz = tower.z;
    for (const e of enemies) {
        if (!e.alive) continue;
        const pos = enemyWorldPos(path, e);
        const d = dist3(tx, ty, tz, pos.x, pos.y, pos.z);
        if (d <= tower.range && d < bestD) {
            bestD = d;
            best = e;
        }
    }
    return best;
}

function predictLeadPosition(path, pathLen, target, tower, projectileSpeed) {
    const ty = target.radius;
    const pos0 = enemyWorldPos(path, target);
    let dist = dist3(tower.x, tower.y, tower.z, pos0.x, pos0.y, pos0.z);
    let timeToHit = dist / Math.max(1e-3, projectileSpeed);
    let predictedProgress = target.pathProgress + (target.speed / pathLen) * timeToHit;
    predictedProgress = Math.min(1, predictedProgress);
    let tp = path.getPositionAt(predictedProgress);
    dist = dist3(tower.x, tower.y, tower.z, tp.x, ty, tp.z);
    timeToHit = dist / Math.max(1e-3, projectileSpeed);
    predictedProgress = Math.min(1, target.pathProgress + (target.speed / pathLen) * timeToHit);
    tp = path.getPositionAt(predictedProgress);
    return { x: tp.x, y: ty, z: tp.z };
}

function expandTowerForSim(t) {
    const lv = clampTowerLevel(t.level);
    const stats = getTowerStats(t.type, lv);
    return {
        x: t.x,
        y: t.y,
        z: t.z,
        type: t.type,
        level: lv,
        range: stats.range,
        damage: stats.damage,
        cooldown: stats.cooldown,
        cooldownLeft: Math.max(0, t.cooldownLeft ?? 0),
        projectileSpeed: stats.projectileSpeed,
        arc: !!stats.arc,
        flameDuration: stats.flameDuration ?? 0,
        flameTickInterval: stats.flameTickInterval ?? 0.2,
        flameAoeRadius: stats.flameAoeRadius ?? 0,
        flameTickAccum: 0,
        flameZoneLeft: 0
    };
}

function tryTowerFire(path, pathLen, tower, enemies, deal) {
    const target = findNearestTarget(path, tower, enemies);
    if (!target || tower.cooldownLeft > 0) return;

    const aim = predictLeadPosition(path, pathLen, target, tower, tower.projectileSpeed);

    if (tower.type === 'mortar') {
        deal(target, tower.damage);
        applyMortarAoeAt(path, aim, enemies, tower.damage, deal);
    } else if (tower.type === 'sniper') {
        deal(target, tower.damage);
        tower.flameZoneLeft = Math.max(tower.flameZoneLeft, tower.flameDuration);
        tower.flameTickAccum = 0;
    } else {
        deal(target, tower.damage);
    }
    tower.cooldownLeft = tower.cooldown;
}

function applySniperFlameTicks(path, tower, enemies, dt, deal) {
    if (tower.flameZoneLeft <= 0) return;
    tower.flameZoneLeft -= dt;
    tower.flameZoneLeft = Math.max(0, tower.flameZoneLeft);
    tower.flameTickAccum += dt;
    const interval = Math.max(0.05, tower.flameTickInterval);
    const tickDmg = tower.damage * interval * 0.7;
    while (tower.flameTickAccum >= interval) {
        tower.flameTickAccum -= interval;
        for (const e of enemies) {
            if (!e.alive) continue;
            const pos = enemyWorldPos(path, e);
            const d = dist3(tower.x, tower.y, tower.z, pos.x, pos.y, pos.z);
            if (d <= tower.flameAoeRadius) deal(e, tickDmg);
        }
    }
}

export function captureCombatSnapshot(game) {
    const path = game.path;
    const pathLen = path.getTotalLength();
    const enemies = game.enemies
        .filter((e) => e.alive)
        .map((e) => ({
            type: e.type,
            pathProgress: e.pathProgress,
            hp: e.hp,
            maxHp: e.maxHp,
            speed: e.speed,
            radius: e.body.radius,
            alive: true
        }));

    const towers = game.towers.map((t) => ({
        x: t.position.x,
        y: t.position.y,
        z: t.position.z,
        type: t.type,
        level: t.level,
        cooldownLeft: Math.max(0, t.cooldown)
    }));

    let acc = game.spawnTimer;
    const pendingSpawns = [];
    for (const item of game.enemiesToSpawn) {
        pendingSpawns.push({ type: item.type, at: acc });
        acc += item.delay;
    }

    return {
        path,
        pathLen,
        waveHpMultiplier: game.waveHpMultiplier,
        waveSpeedMultiplier: game.waveSpeedMultiplier,
        enemies,
        towers,
        pendingSpawns,
        waveInProgress: game.waveInProgress
    };
}

function cloneEnemies(list) {
    return list.map((e) => ({ ...e }));
}

function clonePending(list) {
    return list.map((p) => ({ ...p }));
}

function cloneTowers(list) {
    return list.map((t) => ({ ...t }));
}

/**
 * @param {object} snapshot - from captureCombatSnapshot
 * @param {object|null} extraTower - { x, y, z, type, level, cooldownLeft? }
 */
export function simulateCombatHorizon(snapshot, extraTower, options) {
    const horizonSec = options.horizonSec;
    const stepSec = options.stepSec;
    const path = snapshot.path;
    const pathLen = snapshot.pathLen;
    const hpMult = Math.max(1, snapshot.waveHpMultiplier ?? 1);
    const spMult = Math.max(1, snapshot.waveSpeedMultiplier ?? 1);

    let enemies = cloneEnemies(snapshot.enemies);
    let pending = clonePending(snapshot.pendingSpawns);
    let towers = cloneTowers(snapshot.towers);
    if (extraTower) towers.push({ ...extraTower, cooldownLeft: extraTower.cooldownLeft ?? 0 });
    towers = towers.map(expandTowerForSim);

    let simTime = 0;
    let totalDamage = 0;
    let leaks = 0;
    let kills = 0;
    const initialAlive = enemies.filter((e) => e.alive).length;

    const deal = (e, amount) => {
        if (!e.alive || amount <= 0) return;
        const dealt = Math.min(e.hp, amount);
        e.hp -= dealt;
        totalDamage += dealt;
        if (e.hp <= 0.001) {
            e.hp = 0;
            e.alive = false;
            if (e.pathProgress < 1) kills++;
        }
    };

    while (simTime < horizonSec) {
        simTime += stepSec;

        if (snapshot.waveInProgress) {
            while (pending.length > 0 && pending[0].at <= simTime) {
                const next = pending.shift();
                enemies.push(spawnEnemyInSim(next.type, hpMult, spMult));
            }
        }

        for (const e of enemies) {
            if (!e.alive) continue;
            const pathSpeed = e.speed / pathLen;
            e.pathProgress += pathSpeed * stepSec;
            if (e.pathProgress >= 1) {
                e.pathProgress = 1;
                e.alive = false;
                leaks++;
            }
        }

        for (const tower of towers) {
            tower.cooldownLeft -= stepSec;
            tryTowerFire(path, pathLen, tower, enemies, deal);
            if (tower.type === 'sniper') applySniperFlameTicks(path, tower, enemies, stepSec, deal);
        }
    }

    return {
        totalDamage,
        leaks,
        kills,
        survivingEnemies: enemies.filter((e) => e.alive).length,
        initialAlive
    };
}

export function buildLookaheadCandidates(game, context, maxCandidates) {
    const options = context.availableTowerOptions || [];
    const gold = context.gold;
    const out = [];
    for (const spot of context.candidateSpots || []) {
        const p = game.board.tryTowerPlacementAt(spot.x, spot.z, game.towers);
        if (!p) continue;
        for (const opt of options) {
            const lv = clampTowerLevel(opt.level);
            const stats = getTowerStats(opt.type, lv);
            if (gold < stats.cost) continue;
            out.push({
                towerType: opt.type,
                level: lv,
                spotId: spot.id,
                spot,
                placement: { x: p.x, y: p.y, z: p.z },
                cost: stats.cost
            });
            if (out.length >= maxCandidates) return out;
        }
    }
    return out;
}

function snapshotHasThreat(snapshot) {
    if (snapshot.enemies.length > 0) return true;
    if (snapshot.waveInProgress && snapshot.pendingSpawns.length > 0) return true;
    return false;
}

/**
 * Runs baseline + candidate sims; returns data for AgentController and optional LLM context.
 */
export function evaluatePlacementLookahead(game, context) {
    const lk = SETTINGS.ai.lookahead;
    if (!lk?.enabled) return null;

    const horizonSec = Math.max(2, lk.horizonSec ?? 14);
    const stepSec = Math.min(0.25, Math.max(0.04, lk.stepSec ?? 0.1));
    const maxCand = Math.max(8, lk.maxCandidatesToScore ?? 56);
    const topK = Math.max(1, lk.topKForContext ?? 6);
    const leakPenalty = Math.max(0, lk.leakPenalty ?? 3200);
    const costWeight = Math.max(0, lk.costWeight ?? 0.06);
    const minScore = lk.minScoreToAct ?? 8;

    const snapshot = captureCombatSnapshot(game);
    const simOpts = { horizonSec, stepSec };
    const baseline = simulateCombatHorizon(snapshot, null, simOpts);
    const hasThreat = snapshotHasThreat(snapshot);

    const candidates = buildLookaheadCandidates(game, context, maxCand);
    const scored = [];

    for (const c of candidates) {
        const extra = {
            x: c.placement.x,
            y: c.placement.y,
            z: c.placement.z,
            type: c.towerType,
            level: c.level,
            cooldownLeft: 0
        };
        const m = simulateCombatHorizon(snapshot, extra, simOpts);
        const deltaDamage = m.totalDamage - baseline.totalDamage;
        const deltaLeaks = m.leaks - baseline.leaks;
        const score = deltaDamage - deltaLeaks * leakPenalty - c.cost * costWeight;
        scored.push({
            towerType: c.towerType,
            level: c.level,
            spotId: c.spotId,
            score: Number(score.toFixed(2)),
            deltaDamage: Number(deltaDamage.toFixed(2)),
            deltaLeaks,
            cost: c.cost,
            metricsWith: {
                damage: Number(m.totalDamage.toFixed(1)),
                leaks: m.leaks,
                kills: m.kills
            }
        });
    }

    scored.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (a.cost !== b.cost) return a.cost - b.cost;
        return a.spotId - b.spotId;
    });

    const best = scored[0];
    let recommended = null;
    if (best && best.score >= minScore) {
        if (hasThreat || best.score >= (lk.minScoreWhenQuiet ?? 45)) {
            recommended = {
                action: 'place_tower',
                towerType: best.towerType,
                level: best.level,
                spotId: best.spotId,
                rationale: 'lookahead'
            };
        }
    }

    const contextBlock = {
        horizonSec,
        stepSec,
        baseline: {
            damage: Number(baseline.totalDamage.toFixed(1)),
            leaks: baseline.leaks,
            kills: baseline.kills
        },
        topK: scored.slice(0, topK),
        recommended: recommended
            ? {
                towerType: recommended.towerType,
                level: recommended.level,
                spotId: recommended.spotId,
                score: best.score
            }
            : null
    };

    return { contextBlock, recommended, baseline, scored };
}
