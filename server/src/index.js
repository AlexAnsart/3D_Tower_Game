import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { requestAiDecision } from './fireworksClient.js';

const app = express();
const port = Number(process.env.PORT || 8787);
const modelApiKey = process.env.KIMI_API_KEY || process.env.FIREWORKS_API_KEY || '';
const rawModelName = process.env.KIMI_MODEL || process.env.FIREWORKS_MODEL || 'kimi-k2p6';
const debug = (process.env.AI_PROXY_DEBUG || 'true').toLowerCase() !== 'false';
let requestCounter = 0;

function log(message, data) {
    if (!debug) return;
    if (typeof data === 'undefined') {
        console.log(`[AI_PROXY] ${message}`);
        return;
    }
    console.log(`[AI_PROXY] ${message}`, data);
}

app.use(cors());
app.use(express.json({ limit: '256kb' }));
app.use((req, _res, next) => {
    req.requestId = ++requestCounter;
    log(`#${req.requestId} INCOMING ${req.method} ${req.path}`, {
        origin: req.headers.origin || 'n/a',
        userAgent: req.headers['user-agent'] || 'n/a'
    });
    next();
});

function toNoop(reason = 'invalid_response') {
    return { action: 'noop', rationale: reason };
}

function resolveModelName(name) {
    if (!name) return 'accounts/fireworks/models/kimi-k2p6';
    if (name.includes('/')) return name;
    if (name === 'kimi-k2p6') return 'accounts/fireworks/models/kimi-k2p6';
    if (name === 'kimi-k2-instruct') return 'accounts/fireworks/models/kimi-k2-instruct';
    return name;
}

function toDisplayModelName(name) {
    if (!name) return 'kimi-k2p6';
    return name.replace(/^accounts\/fireworks\/models\//, '');
}

const providerModelName = resolveModelName(rawModelName);
const displayModelName = toDisplayModelName(providerModelName);

function sanitizeDecision(rawDecision, context) {
    log('sanitizeDecision() raw decision', rawDecision);
    if (!rawDecision || rawDecision.action !== 'place_tower') return toNoop(rawDecision?.rationale || 'noop');
    const validTowerTypes = new Set(['blaster', 'cannon', 'mortar', 'sniper']);
    if (!validTowerTypes.has(rawDecision.towerType)) return toNoop('invalid_tower_type');

    const level = Number.parseInt(rawDecision.level, 10);
    if (!Number.isFinite(level) || level < 1 || level > 10) return toNoop('invalid_level');

    const spotId = Number(rawDecision.spotId);
    const spot = context?.candidateSpots?.find((candidate) => candidate.id === spotId);
    if (!spot) return toNoop('invalid_spot');

    const constraints = context?.aiConstraints || {};
    const forbiddenTowerTypes = Array.isArray(constraints.forbiddenTowerTypes) ? constraints.forbiddenTowerTypes : [];
    if (forbiddenTowerTypes.includes(rawDecision.towerType)) return toNoop('forbidden_tower_type');

    const previous = constraints.previousPlacement;
    const minDistance = Number(constraints.minDistanceFromLastPlacement || 0);
    if (previous && minDistance > 0) {
        const dx = Number(spot.x) - Number(previous.x);
        const dz = Number(spot.z) - Number(previous.z);
        if (Math.hypot(dx, dz) < minDistance) return toNoop('spot_too_close_to_previous');
    }

    return {
        action: 'place_tower',
        towerType: rawDecision.towerType,
        level,
        spotId,
        rationale: typeof rawDecision.rationale === 'string' ? rawDecision.rationale.slice(0, 160) : 'ok'
    };
}

app.get('/health', (_req, res) => {
    log('/health called', {
        modelConfigured: Boolean(modelApiKey),
        model: displayModelName
    });
    res.json({
        ok: true,
        modelConfigured: Boolean(modelApiKey),
        model: displayModelName
    });
});

app.post('/api/ai/decide', async (req, res) => {
    try {
        log(`#${req.requestId} /api/ai/decide start`);
        if (!modelApiKey) {
            log(`#${req.requestId} missing KIMI_API_KEY`);
            return res.status(500).json(toNoop('missing_model_api_key'));
        }
        const context = req.body?.context;
        if (!context || typeof context !== 'object') {
            log(`#${req.requestId} invalid context payload`, req.body);
            return res.status(400).json(toNoop('missing_context'));
        }
        if (!Array.isArray(context.candidateSpots) || context.candidateSpots.length === 0) {
            log(`#${req.requestId} no candidate spots`, {
                wave: context.wave,
                gold: context.gold
            });
            return res.json(toNoop('no_candidate_spots'));
        }
        log(`#${req.requestId} context summary`, {
            wave: context.wave,
            gold: context.gold,
            lives: context.lives,
            enemiesAlive: context.enemiesAlive,
            enemiesRemainingToSpawn: context.enemiesRemainingToSpawn,
            towersPlaced: context.towersPlaced,
            candidateSpots: context.candidateSpots.length
        });

        const rawDecision = await requestAiDecision({
            apiKey: modelApiKey,
            model: providerModelName,
            context,
            timeoutMs: 12000
        });
        const sanitized = sanitizeDecision(rawDecision, context);
        log(`#${req.requestId} final decision`, sanitized);
        return res.json(sanitized);
    } catch (error) {
        console.error(`[AI_PROXY] #${req.requestId} AI decision error:`, error instanceof Error ? error.message : error);
        return res.status(200).json(toNoop('service_error'));
    }
});

app.listen(port, () => {
    console.log(`AI proxy listening on http://localhost:${port}`);
    log('startup config', {
        port,
        modelConfigured: Boolean(modelApiKey),
        model: displayModelName,
        debug
    });
});
