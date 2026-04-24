export const SETTINGS = {
    ai: {
        enabled: false,
        minGoldToAct: 100,
        decisionIntervalMs: 2500,
        maxCandidateSpots: 80,
        blockSameTypeConsecutively: true,
        minDistanceFromLastPlacement: 12,
        model: 'kimi-k2p6',
        endpoint: 'http://localhost:8787/api/ai/decide',
        requestTimeoutMs: 5000,
        /** Local combat lookahead (no LLM). mode: assist = enrich LLM context; auto = pick best without API */
        lookahead: {
            enabled: true,
            mode: 'assist',
            horizonSec: 14,
            stepSec: 0.1,
            maxCandidatesToScore: 56,
            topKForContext: 6,
            leakPenalty: 3200,
            costWeight: 0.06,
            minScoreToAct: 8,
            minScoreWhenQuiet: 45
        }
    },
    economy: {
        startingGold: 500,
        startingLives: 20,
        towerSellRefundRatio: 0.65,
        waveBonusBase: 100,
        waveBonusPerWave: 10
    },
    world: {
        globalScale: 3,
        previewOpacity: 0.45
    },
    performance: {
        maxParticles: 5000,
        maxProjectiles: 300,
        lowFpsThreshold: 45
    },
    enemies: {
        basic: { hp: 100, speed: 7.5, radius: 0.7, reward: 10, size: 1.0 },
        fast: { hp: 60, speed: 12.5, radius: 0.5, reward: 15, size: 0.85 },
        tank: { hp: 300, speed: 3.75, radius: 1.0, reward: 25, size: 1.2 },
        boss: { hp: 1000, speed: 2.5, radius: 1.5, reward: 100, size: 1.6 }
    },
    waves: {
        hpMultiplierPerWave: 0.15,
        speedMultiplierPerWave: 0.02
    },
    towers: {
        levelMin: 1,
        levelMax: 10,
        levelDamageMultiplier: 0.22,
        levelRangeMultiplier: 0.08,
        levelCostMultiplier: 0.2,
        levelCooldownMultiplier: 0.04,
        levelScaleMultiplier: 0.2,
        types: {
            blaster: {
                label: 'Archer',
                baseRange: 18,
                baseDamage: 25,
                baseCooldown: 0.4,
                projectileSpeed: 35,
                baseCost: 50
            },
            cannon: {
                label: 'Cannon',
                baseRange: 24,
                baseDamage: 80,
                baseCooldown: 1.3,
                projectileSpeed: 66,
                baseCost: 120,
                arc: true
            },
            mortar: {
                label: 'Mortar',
                baseRange: 32,
                baseDamage: 120,
                baseCooldown: 4.2,
                projectileSpeed: 42,
                baseCost: 170,
                arc: true,
                aoeRadius: 4.4
            },
            sniper: {
                label: 'Mage',
                baseRange: 42,
                baseDamage: 42,
                baseCooldown: 2.0,
                projectileSpeed: 40,
                baseCost: 200,
                flameDuration: 2.0,
                flameTickInterval: 0.2,
                flameAoeRadius: 5.2
            }
        }
    },
    projectiles: {
        blaster: { radius: 0.25, gravityScale: 0.1 },
        cannon: { radius: 0.3, gravityScale: 0.8, impactShake: 0.45 },
        mortar: { radius: 0.48, gravityScale: 1.4, impactShake: 0.9, aoeRadius: 5.5 },
        sniper: { radius: 0.35, gravityScale: 0.06 }
    },
    effects: {
        impact: {
            small: 'small',
            medium: 'medium',
            large: 'large',
            massive: 'massive'
        }
    },
    audio: {
        masterVolume: 0.8,
        optionalFilesPath: 'assets/audio',
        files: {
            cannon: 'cannon_shot.ogg',
            mortar: 'mortar_shot.ogg',
            mageFire: 'mage_fire.ogg',
            bossDeath: 'boss_death.ogg',
            heavyImpact: 'impact_heavy.ogg'
        }
    },
    assets: {
        optionalEnemyModelsPath: 'assets/models/enemies',
        enemyModelNames: {
            basic: 'basic.glb',
            fast: 'fast.glb',
            tank: 'tank.glb',
            boss: 'boss.glb'
        }
    }
};

export function clampTowerLevel(level) {
    return Math.max(SETTINGS.towers.levelMin, Math.min(SETTINGS.towers.levelMax, level | 0));
}

export function getTowerStats(type, level = 1) {
    const tower = SETTINGS.towers.types[type] || SETTINGS.towers.types.blaster;
    const lv = clampTowerLevel(level);
    const delta = lv - 1;
    const cost = Math.round(tower.baseCost * (1 + SETTINGS.towers.levelCostMultiplier * delta));
    const damage = tower.baseDamage * (1 + SETTINGS.towers.levelDamageMultiplier * delta);
    const range = tower.baseRange * (1 + SETTINGS.towers.levelRangeMultiplier * delta);
    const cooldown = Math.max(0.15, tower.baseCooldown * (1 - SETTINGS.towers.levelCooldownMultiplier * delta));
    const scale = SETTINGS.world.globalScale * (1 + SETTINGS.towers.levelScaleMultiplier * delta);
    return { ...tower, cost, damage, range, cooldown, scale, level: lv, type };
}
