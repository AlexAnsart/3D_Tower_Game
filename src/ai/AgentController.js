import { SETTINGS, clampTowerLevel, getTowerStats } from '../settings.js';
import { evaluatePlacementLookahead } from './placementLookahead.js';

const VALID_TOWER_TYPES = new Set(['blaster', 'cannon', 'mortar', 'sniper']);

export class AgentController {
    constructor(game) {
        this.game = game;
        this.elapsedMs = 0;
        this.inFlight = false;
    }

    update(deltaSeconds) {
        if (!SETTINGS.ai.enabled) return;
        if (this.game.gameState !== 'playing') return;
        if (this.inFlight) return;
        if (this.game.energy < SETTINGS.ai.minGoldToAct) return;

        this.elapsedMs += deltaSeconds * 1000;
        if (this.elapsedMs < SETTINGS.ai.decisionIntervalMs) return;
        this.elapsedMs = 0;
        this.requestDecision();
    }

    async requestDecision() {
        this.inFlight = true;
        try {
            const context = this.buildDecisionContext();
            if (!context.candidateSpots || context.candidateSpots.length === 0) return;

            const lk = SETTINGS.ai.lookahead;
            let lookResult = null;
            if (lk?.enabled) {
                lookResult = evaluatePlacementLookahead(this.game, context);
                if (lookResult?.contextBlock) context.lookahead = lookResult.contextBlock;
            }

            if (lk?.enabled && lk.mode === 'auto') {
                if (lookResult?.recommended) this.applyDecision(lookResult.recommended, context);
                return;
            }

            const controller = new AbortController();
            const timeout = window.setTimeout(() => controller.abort(), SETTINGS.ai.requestTimeoutMs);
            try {
                const response = await fetch(SETTINGS.ai.endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ context }),
                    signal: controller.signal
                });
                if (!response.ok) return;
                const result = await response.json();
                this.applyDecision(result, context);
            } finally {
                clearTimeout(timeout);
            }
        } catch (error) {
            // Keep gameplay resilient when AI endpoint is unavailable.
            console.warn('AI decision request failed:', error);
        } finally {
            this.inFlight = false;
        }
    }

    applyDecision(decision, context) {
        if (!decision || decision.action !== 'place_tower') return;
        if (!VALID_TOWER_TYPES.has(decision.towerType)) return;
        if (context.aiConstraints?.forbiddenTowerTypes?.includes(decision.towerType)) return;

        const level = clampTowerLevel(decision.level);
        const spot = context.candidateSpots.find((candidate) => candidate.id === decision.spotId);
        if (!spot) return;

        const stats = getTowerStats(decision.towerType, level);
        if (this.game.energy < stats.cost) return;
        this.game.placeTowerAtSpot(decision.towerType, level, spot);
    }

    buildDecisionContext() {
        const context = this.game.buildAiContext();
        const lastTower = this.game.towers[this.game.towers.length - 1];
        const hasLastTower = Boolean(lastTower);
        const minDistance = Math.max(0, Number(SETTINGS.ai.minDistanceFromLastPlacement || 0));
        const enforceTypeDiversity = Boolean(SETTINGS.ai.blockSameTypeConsecutively && hasLastTower);
        const forbiddenTowerTypes = enforceTypeDiversity ? [lastTower.type] : [];

        const filteredTowerOptions = context.availableTowerOptions.filter((option) => !forbiddenTowerTypes.includes(option.type));
        const distanceFilteredSpots = hasLastTower
            ? context.candidateSpots.filter((spot) => {
                const dx = spot.x - lastTower.position.x;
                const dz = spot.z - lastTower.position.z;
                return Math.hypot(dx, dz) >= minDistance;
            })
            : context.candidateSpots;

        context.availableTowerOptions = filteredTowerOptions;
        context.candidateSpots = distanceFilteredSpots;
        context.aiConstraints = {
            mustVaryFromLastPlacement: hasLastTower,
            forbiddenTowerTypes,
            minDistanceFromLastPlacement: minDistance,
            previousPlacement: hasLastTower
                ? {
                    towerType: lastTower.type,
                    level: lastTower.level,
                    x: Number(lastTower.position.x.toFixed(2)),
                    z: Number(lastTower.position.z.toFixed(2))
                }
                : null
        };
        return context;
    }
}
