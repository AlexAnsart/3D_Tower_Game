const FIREWORKS_API_URL = 'https://api.fireworks.ai/inference/v1/chat/completions';
const debug = (process.env.AI_PROXY_DEBUG || 'true').toLowerCase() !== 'false';

function log(message, data) {
    if (!debug) return;
    if (typeof data === 'undefined') {
        console.log(`[AI_MODEL] ${message}`);
        return;
    }
    console.log(`[AI_MODEL] ${message}`, data);
}

function extractJsonObject(text) {
    if (!text || typeof text !== 'string') return null;
    const startIndexes = [];
    for (let i = 0; i < text.length; i++) {
        if (text[i] === '{') startIndexes.push(i);
    }
    for (const start of startIndexes) {
        for (let end = text.length - 1; end > start; end--) {
            if (text[end] !== '}') continue;
            const candidate = text.slice(start, end + 1);
            try {
                return JSON.parse(candidate);
            } catch {
                // Keep scanning until a valid JSON object is found.
            }
        }
    }
    return null;
}

function buildSystemPrompt() {
    return [
        'You are a tower-defense decision engine.',
        'Reply with JSON only. Do not output any analysis text.',
        'Your first character MUST be "{", and your last character MUST be "}".',
        'Valid output schema:',
        '{"action":"place_tower"|"noop","towerType":"blaster|cannon|mortar|sniper","level":1-10,"spotId":number,"rationale":"short"}',
        'Never output invalid towerType or level.',
        'If uncertain, output {"action":"noop","rationale":"uncertain"}'
    ].join('\n');
}

function buildUserPrompt(context, strictMode) {
    const constraints = context?.aiConstraints || {};
    const hasVariationRule = Boolean(constraints.mustVaryFromLastPlacement);
    const forbiddenTypes = Array.isArray(constraints.forbiddenTowerTypes) ? constraints.forbiddenTowerTypes : [];
    const minDistance = Number(constraints.minDistanceFromLastPlacement || 0);
    const previous = constraints.previousPlacement || null;

    const rules = [
        'Decision rules:',
        '- Use only tower types listed in availableTowerOptions.',
        '- Use only spotId values listed in candidateSpots.',
        '- If no valid placement exists, return {"action":"noop","rationale":"no_valid_option"}.'
    ];

    if (hasVariationRule) {
        rules.push('- You MUST vary from the previous placement.');
        if (forbiddenTypes.length > 0) {
            rules.push(`- Forbidden tower types this turn: ${forbiddenTypes.join(', ')}.`);
        }
        if (minDistance > 0 && previous) {
            rules.push(`- Chosen spot must be at least ${minDistance} units away from previous position (${previous.x}, ${previous.z}).`);
        }
    }

    const lookaheadHint = (() => {
        const la = context?.lookahead;
        if (!la || !la.topK || la.topK.length === 0) return '';
        const lines = [
            'Lookahead simulation (prefer matching a top-scoring candidate unless you have a strong reason not to):',
            `- Baseline (no new tower) over ${la.horizonSec}s: damage≈${la.baseline?.damage}, leaks=${la.baseline?.leaks}`,
            ...la.topK.slice(0, 6).map(
                (c, i) =>
                    `  ${i + 1}. score=${c.score} ${c.towerType} L${c.level} spotId=${c.spotId} (Δdmg=${c.deltaDamage} Δleaks=${c.deltaLeaks} cost=${c.cost})`
            )
        ];
        if (la.recommended) {
            lines.push(
                `Suggested: ${la.recommended.towerType} L${la.recommended.level} spotId=${la.recommended.spotId} (score=${la.recommended.score}).`
            );
        }
        return `${lines.join('\n')}\n`;
    })();

    const prefix = strictMode ? 'Return one JSON object only. No prose.' : 'Return JSON only.';
    return `${prefix}\n${lookaheadHint}${rules.join('\n')}\nContext:\n${JSON.stringify(context)}`;
}

async function callFireworks({ apiKey, model, context, timeoutMs, strictMode = false }) {
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        log('outgoing request', {
            model,
            timeoutMs,
            hasApiKey: Boolean(apiKey),
            candidateSpots: context?.candidateSpots?.length || 0,
            wave: context?.wave,
            gold: context?.gold
        });
        const response = await fetch(FIREWORKS_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model,
                temperature: 0.2,
                max_tokens: 320,
                response_format: { type: 'json_object' },
                messages: [
                    { role: 'system', content: buildSystemPrompt() },
                    {
                        role: 'user',
                        content: buildUserPrompt(context, strictMode)
                    }
                ]
            }),
            signal: controller.signal
        });

        if (!response.ok) {
            const errorText = await response.text();
            log('provider non-200 response', {
                status: response.status,
                statusText: response.statusText,
                errorPreview: errorText.slice(0, 250)
            });
            throw new Error(`Model request failed (${response.status}): ${errorText.slice(0, 400)}`);
        }

        const payload = await response.json();
        const content = payload?.choices?.[0]?.message?.content ?? '';
        log('provider response metadata', {
            strictMode,
            elapsedMs: Date.now() - startedAt,
            choices: Array.isArray(payload?.choices) ? payload.choices.length : 0,
            usage: payload?.usage || null,
            contentPreview: content.slice(0, 220)
        });
        return { parsed: extractJsonObject(content), rawContent: content };
    } finally {
        clearTimeout(timeout);
    }
}

export async function requestAiDecision({ apiKey, model, context, timeoutMs = 10000 }) {
    const first = await callFireworks({ apiKey, model, context, timeoutMs, strictMode: false });
    log('parsed model decision (attempt 1)', first.parsed);
    if (first.parsed) return first.parsed;

    log('attempt 1 returned non-JSON content; retrying with stricter user prompt');
    const second = await callFireworks({ apiKey, model, context, timeoutMs, strictMode: true });
    log('parsed model decision (attempt 2)', second.parsed);
    return second.parsed;
}
