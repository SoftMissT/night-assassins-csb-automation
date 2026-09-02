export const YAMATO_AWAKENING_STATE = Object.freeze({
    sealed: 'Selada',
    first: 'Primeiro Despertar',
});

export function normalizeIntegrationStage(value = '') {
    const text = String(value ?? '')
        .trim()
        .toLocaleLowerCase('pt-BR')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/gu, '');
    if (text.includes('identidade')) return 'identidade';
    if (text.includes('unificacao')) return 'unificacao';
    if (text.includes('simbiose')) return 'simbiose';
    return 'dualidade';
}

export function awakeningDuration(stage = '') {
    return { dualidade: 2, simbiose: 3, unificacao: 3, identidade: 4 }[
        normalizeIntegrationStage(stage)
    ];
}

export function awakeningBloodCost(currentPdv = 0) {
    const current = Math.max(0, Math.trunc(Number(currentPdv) || 0));
    const remaining = Math.max(1, Math.ceil(current * 0.1));
    return { current, remaining: Math.min(current, remaining), cost: Math.max(0, current - remaining) };
}

export function awakeningRuntime({ combatId = null, round = 0, duration = 2, side = '' } = {}) {
    const startRound = Math.max(0, Math.trunc(Number(round) || 0));
    const rounds = Math.max(1, Math.trunc(Number(duration) || 1));
    return {
        version: 1,
        state: YAMATO_AWAKENING_STATE.first,
        side,
        combatId,
        startRound,
        expiresRound: startRound + rounds,
        duration: rounds,
    };
}

export function awakeningExpired(runtime, combat = {}) {
    if (!runtime || runtime.state !== YAMATO_AWAKENING_STATE.first) return false;
    if (runtime.combatId && runtime.combatId !== (combat.id ?? null)) return true;
    return Number(combat.round ?? 0) >= Number(runtime.expiresRound ?? Infinity);
}
