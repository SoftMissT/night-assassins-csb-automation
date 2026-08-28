import { oniRegenerationProfile, normalizeOniLevel } from './progression-service.mjs';

const BLOCKING_STATUSES = Object.freeze(
    new Set(['solar', 'glicinia', 'nichirin', 'regeneracao_suprimida'])
);
const BLOCKING_DAMAGE_TYPES = Object.freeze(new Set(['solar']));
const SOLAR_BLOCK_TURNS = 2;

function integer(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.trunc(number) : fallback;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

export function parseBlockingFlags(props = {}) {
    const blockedBy = new Set();
    for (const status of BLOCKING_STATUSES) {
        if (
            props[`oni_status_${status}`] !== undefined &&
            props[`oni_status_${status}`] !== false &&
            props[`oni_status_${status}`] !== 'false'
        ) {
            blockedBy.add(status);
        }
    }
    if (props.oni_solar_block_turns !== undefined && integer(props.oni_solar_block_turns) > 0) {
        blockedBy.add('solar');
    }
    return Object.freeze({ blockedBy: [...blockedBy] });
}

export function registerBlockingDamage(props = {}, damageTypes = []) {
    const types = Array.isArray(damageTypes) ? damageTypes : [damageTypes];
    const patch = {};
    for (const type of types) {
        const normalized = String(type ?? '')
            .trim()
            .toLocaleLowerCase('pt-BR');
        if (normalized === 'solar') {
            patch['system.props.oni_solar_block_turns'] = SOLAR_BLOCK_TURNS;
            patch['system.props.oni_status_solar'] = true;
        }
        if (BLOCKING_STATUSES.has(normalized)) {
            patch[`system.props.oni_status_${normalized}`] = true;
        }
    }
    return Object.freeze(patch);
}

export function tickBlockingFlags(props = {}) {
    const solarTurns = integer(props.oni_solar_block_turns);
    if (solarTurns <= 0) return null;
    const remaining = solarTurns - 1;
    if (remaining <= 0) {
        return Object.freeze({
            'system.props.oni_solar_block_turns': 0,
            'system.props.oni_status_solar': false,
        });
    }
    return Object.freeze({ 'system.props.oni_solar_block_turns': remaining });
}

const ACTION_MAP = Object.freeze({ special: 'especial', unique: 'unica' });
const TURN_ACTIONS = Object.freeze(new Set(['movimento', 'ataque', 'especial']));
const ROUND_ACTIONS = Object.freeze(new Set(['unica', 'reacao', 'lendaria']));

export function canActiveRegenerate(level, props = {}, actionState = null) {
    const profile = oniRegenerationProfile(level);
    if (!profile.available) return { ok: false, reason: 'nível insuficiente para regeneração.' };
    const { blockedBy } = parseBlockingFlags(props);
    if (blockedBy.length > 0)
        return { ok: false, reason: `regeneração bloqueada por: ${blockedBy.join(', ')}.` };
    if (
        props.oni_regeneracao_usada_turno === true ||
        props.oni_regeneracao_usada_turno === 'true'
    ) {
        return { ok: false, reason: 'regeneração já usada neste turno.' };
    }
    if (actionState) {
        const allowed = (profile.allowedActions ?? ['special']).map((a) => ACTION_MAP[a] ?? a);
        const turnConsumed = actionState?.turn ?? {};
        const roundConsumed = actionState?.round ?? {};
        for (const action of allowed) {
            const consumed = TURN_ACTIONS.has(action)
                ? turnConsumed
                : ROUND_ACTIONS.has(action)
                  ? roundConsumed
                  : turnConsumed;
            if ((consumed[action] ?? 0) === 0) return { ok: true, action, profile };
        }
        return { ok: false, reason: `requer ${allowed.join(' ou ')} disponível.` };
    }
    return { ok: true, action: profile.allowedActions?.[0] ?? 'special', profile };
}

export function rollActiveRegeneration(profile, vitality = 0) {
    if (!profile?.available) return { healing: 0, formula: '' };
    const vit = Math.max(0, integer(vitality));
    return {
        healing: 0,
        formula: profile.activeFormula?.replace(/VIT/g, String(vit)) ?? '',
        vitality: vit,
        isReady: true,
    };
}

export function buildActiveRegenerationPatch(healing, currentCured) {
    const add = Math.max(0, integer(healing));
    const accumulated = Math.max(0, integer(currentCured));
    return Object.freeze({
        'system.props.pdv_oni_curado': accumulated + add,
        'system.props.oni_regeneracao_usada_turno': true,
    });
}

export function canAutomaticRegenerate(level, props = {}) {
    const profile = oniRegenerationProfile(level);
    if (!profile.automaticStartTurnFormula)
        return { ok: false, reason: 'sem regeneração automática neste nível.' };
    const { blockedBy } = parseBlockingFlags(props);
    if (blockedBy.length > 0)
        return {
            ok: false,
            reason: `regeneração automática bloqueada por: ${blockedBy.join(', ')}.`,
        };
    return { ok: true, profile };
}

export function automaticRegenerationAmount(level, vitality = 0) {
    const profile = oniRegenerationProfile(level);
    if (!profile.automaticStartTurnFormula) return 0;
    return Math.max(0, integer(vitality));
}

export function buildAutomaticRegenerationPatch(level, vitality, currentCured) {
    const amount = automaticRegenerationAmount(level, vitality);
    const accumulated = Math.max(0, integer(currentCured));
    return Object.freeze({
        'system.props.pdv_oni_curado': accumulated + amount,
    });
}

export function bitePdkRecovery(currentPdk, currentRecovered) {
    const accumulated = Math.max(0, integer(currentRecovered));
    return Object.freeze({
        'system.props.pdk_oni_recuperado': accumulated + 1,
    });
}

export function spendPdkForAccuracy(currentPdkGasto, amount = 1) {
    const spend = clamp(integer(amount, 1), 0, 2);
    if (spend === 0) return { ok: false, bonus: 0, patch: {} };
    const accumulated = Math.max(0, integer(currentPdkGasto));
    return {
        ok: true,
        bonus: spend,
        patch: Object.freeze({ 'system.props.pdk_oni_gasto_valor': accumulated + spend }),
    };
}

export function resetTurnRegeneration() {
    return Object.freeze({ 'system.props.oni_regeneracao_usada_turno': false });
}
