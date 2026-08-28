import { parseNumber } from './parsing.mjs';
import { METAL_HAMMER_PASSIVE, METAL_STAGES, metalFormById } from './metal-breathing-data.mjs';

export const METAL_STATE_KEY = 'resp_metal_estado';

export function parseMetalBreathingState(raw) {
    if (raw && typeof raw === 'object') return { version: 1, ...raw };
    try {
        const parsed = JSON.parse(String(raw || '{}'));
        return parsed && typeof parsed === 'object' ? { version: 1, ...parsed } : { version: 1 };
    } catch (_) {
        return { version: 1 };
    }
}

function metalSummary(state) {
    const active = [];
    if (state.metalized?.turns > 0)
        active.push(
            `Metalizado: Bloqueio +${state.metalized.blockBonus} (${state.metalized.turns}t)`
        );
    if (state.unshakable?.turns > 0)
        active.push(`Inabalável: resistência Cortante/Perfurante (${state.unshakable.turns}t)`);
    if (state.chainReaction?.turns > 0)
        active.push(
            `Reação em Cadeia: +${state.chainReaction.damageBonus} (${state.chainReaction.turns}t)`
        );
    if (state.battleForged?.turns > 0)
        active.push(
            `Forjado: ${state.battleForged.stageName || 'sem acerto'} (${state.battleForged.turns}t)`
        );
    if (state.steelDefense) active.push('Duro como Aço preparado');
    return active.join(' · ') || 'Metal · sem efeito ativo';
}

export function metalStatePatch(state, overrides = {}) {
    const normalized = { version: 1, ...state };
    return {
        [`system.props.${METAL_STATE_KEY}`]: JSON.stringify(normalized),
        'system.props.resp_metal_resumo': metalSummary(normalized),
        'system.props.resp_metal_bloqueio_bonus': Math.max(
            0,
            Math.trunc(parseNumber(normalized.metalized?.blockBonus))
        ),
        'system.props.resp_metal_for_temp': Math.max(
            0,
            Math.trunc(parseNumber(normalized.battleForged?.forBonus))
        ),
        'system.props.resp_metal_fdv_temp': Math.max(
            0,
            Math.trunc(parseNumber(normalized.battleForged?.fdvBonus))
        ),
        ...overrides,
    };
}

export function buildMetalBreathingPlan(formId, level, props = {}, choices = {}) {
    const form = metalFormById(formId);
    const selected = form?.levels?.[level - 1] ?? null;
    if (!form) return { ok: false, noCost: true, reason: 'Forma do Metal desconhecida.' };
    if (!selected)
        return {
            ok: false,
            noCost: true,
            reason: `Esta forma não pode ser usada no Nível de Respiração ${level}.`,
        };
    const state = parseMetalBreathingState(props[METAL_STATE_KEY]);
    const next = { ...state, activeForm: { id: form.id, level } };
    const vit = Math.max(0, parseNumber(props.vit_display));
    const fdv = Math.max(0, Math.trunc(parseNumber(props.fdv_display)));

    if (form.id === 'metal_01') {
        if (state.metalized?.turns > 0)
            return { ok: false, noCost: true, reason: 'Metalizado já está ativo.' };
        next.metalized = {
            turns: selected.turns,
            blockBonus: selected.blockScale === 'vit' ? vit : Math.ceil(vit / 2),
        };
    } else if (form.id === 'metal_02') {
        if (state.unshakable?.turns > 0)
            return { ok: false, noCost: true, reason: 'Inabalável já está ativo.' };
        next.unshakable = {
            turns: selected.turns,
            resistances: ['cortante', 'perfurante'],
            multiplier: 0.5,
            enemyCriticalFailureOpportunity: {
                damage: `${level}d4`,
                type: 'concussao',
                requiresHit: true,
            },
        };
    } else if (form.id === 'metal_03') {
        if (state.chainReaction?.turns > 0)
            return { ok: false, noCost: true, reason: 'Reação em Cadeia já está ativa.' };
        next.chainReaction = {
            turns: fdv,
            damageBonus: selected.damageBonus,
            damageTypesRequired: ['cortante', 'perfurante'],
            applicationsPerAction: 1,
            rerollBelowTotal: 10,
            exhaustionOnFailedReroll: 1,
            appliedActionIds: [],
        };
    } else if (form.id === 'metal_04') {
        next.steelDefense = {
            defenseAdvantage: selected.defenseAdvantage === true,
            negateAttack: selected.negateAttack === true,
            counterAttack: selected.counterAttack === true,
            uses: 1,
        };
    } else if (form.id === 'metal_06') {
        // Magnetismo é passiva PERMANENTE da Respiração (decisão do Operador,
        // 2026-08-23): elegível por VIT/FOR efetivas, sem depender do Forjado.
        const magnetism = resolveMetalMagnetism(props);
        next.magnetism = { targetUuid: magnetism.eligible ? String(choices.targetUuid ?? '') : '' };
        next.battleForged = {
            turns: selected.turns,
            hits: 0,
            stage: 0,
            stageName: '',
            forBonus: 0,
            fdvBonus: 0,
        };
    }

    return {
        ok: true,
        form,
        selected,
        action: form.action,
        actions: [form.action],
        cost: selected.cost,
        state: next,
        patch: metalStatePatch(next),
    };
}

export function registerMetalBattleHit(raw) {
    const state = parseMetalBreathingState(raw);
    if (!state.battleForged?.turns) return { changed: false, state, patch: metalStatePatch(state) };
    const hits = Math.min(4, Math.max(0, Math.trunc(parseNumber(state.battleForged.hits))) + 1);
    const stage = METAL_STAGES[hits];
    state.battleForged = {
        ...state.battleForged,
        hits,
        stage: hits,
        stageName: stage.name,
        forBonus: stage.forBonus,
        fdvBonus: stage.fdvBonus,
    };
    return { changed: true, state, patch: metalStatePatch(state) };
}

export function buildMetalHammerFollowUp({
    breathingLevel = 0,
    originalDamage = 0,
    synergyBreathing = '',
    allySpendsPdr = false,
} = {}) {
    const level = Math.max(0, Math.trunc(parseNumber(breathingLevel)));
    if (level < METAL_HAMMER_PASSIVE.minimumLevel)
        return { ok: false, reason: 'Martelo do Julgamento requer Nível de Respiração 1.' };
    const synergy =
        METAL_HAMMER_PASSIVE.synergyBreathings.includes(
            String(synergyBreathing).trim().toLowerCase()
        ) && allySpendsPdr;
    const multiplier = synergy
        ? METAL_HAMMER_PASSIVE.synergyDamageMultiplier
        : METAL_HAMMER_PASSIVE.damageMultiplier;
    return {
        ok: true,
        requiresStandardAttackRoll: true,
        damage: Math.ceil(Math.max(0, parseNumber(originalDamage)) * multiplier),
        damageMultiplier: multiplier,
        ignoresResistance: true,
        allyPdrCost: synergy ? METAL_HAMMER_PASSIVE.synergyPdrCost : 0,
    };
}

/**
 * Consome exatamente uma liberação do Martelo e produz o plano do ataque
 * adicional. O chamador continua responsável pela rolagem de Acerto, pelo
 * dano no alvo e, quando houver sinergia, pela cobrança do PDR do aliado.
 */
export function consumeMetalHammerPending(passiveState = {}, options = {}) {
    const state = passiveState && typeof passiveState === 'object' ? { ...passiveState } : {};
    const metal = { ...(state.metal ?? {}) };
    if (metal.hammerPending !== true)
        return {
            ok: false,
            consumed: false,
            state,
            reason: 'Martelo do Julgamento não está liberado.',
        };

    const followUp = buildMetalHammerFollowUp(options);
    if (!followUp.ok) return { ...followUp, consumed: false, state };

    delete metal.hammerPending;
    metal.lastHammer = {
        originalDamage: Math.max(0, Math.trunc(parseNumber(options.originalDamage))),
        resolvedDamage: followUp.damage,
    };
    state.metal = metal;
    return { ...followUp, consumed: true, state };
}

/** Retorna o bônus de oportunidade do Inabalável somente após os dois gatilhos. */
export function resolveMetalCriticalFailureOpportunity(
    raw,
    { enemyCriticalFailure = false, opportunityHit = false } = {}
) {
    const state = parseMetalBreathingState(raw);
    const opportunity =
        state.unshakable?.turns > 0 ? state.unshakable.enemyCriticalFailureOpportunity : null;
    if (!opportunity || enemyCriticalFailure !== true)
        return { eligible: false, applyDamage: false, formula: '', type: '' };
    return {
        eligible: true,
        applyDamage: opportunityHit === true,
        formula: opportunityHit === true ? String(opportunity.damage ?? '') : '',
        type: opportunityHit === true ? String(opportunity.type ?? 'concussao') : '',
    };
}

/**
 * A aplicação de Reação em Cadeia é limitada por ação, não por turno.
 * actionId deve identificar a Ação de Ataque/Especial/Completa que originou o dano.
 */
export function canApplyMetalChain(raw, actionId) {
    const state = parseMetalBreathingState(raw);
    const id = String(actionId ?? '').trim();
    if (!id || !(parseNumber(state.chainReaction?.turns) > 0)) return false;
    return !(state.chainReaction.appliedActionIds ?? []).includes(id);
}

export function registerMetalChainApplication(raw, actionId) {
    const state = parseMetalBreathingState(raw);
    const id = String(actionId ?? '').trim();
    if (!canApplyMetalChain(state, id))
        return { changed: false, state, patch: metalStatePatch(state) };
    const previous = Array.isArray(state.chainReaction.appliedActionIds)
        ? state.chainReaction.appliedActionIds
        : [];
    state.chainReaction = {
        ...state.chainReaction,
        appliedActionIds: [...previous, id].slice(-20),
    };
    delete state.chainReaction.appliedThisTurn;
    return { changed: true, state, patch: metalStatePatch(state) };
}

/** Verifica se o alvo obrigatório de Magnetismo foi respeitado.
 * Magnetismo é passiva permanente (decisão do Operador): elegível por
 * VIT/FOR efetivas ≥ 6 — incluindo bônus temporários do Forjado — e não
 * depende da 5ª Forma estar ativa.
 * Compatibilidade: estados legados com battleForged.magnetismEligible
 * continuam validando pelo formato antigo.
 */
export function validateMetalMagnetismTarget(raw, targetUuids = [], props = null) {
    const state = parseMetalBreathingState(raw);
    const selected = new Set(
        (Array.isArray(targetUuids) ? targetUuids : [targetUuids]).map(String)
    );

    // Legado: elegibilidade congelada dentro do Forjado (mundos existentes)
    if (state.battleForged?.magnetismEligible === true) {
        const requiredTargetUuid = String(state.battleForged.magnetismTargetUuid ?? '');
        if (!requiredTargetUuid) return { active: false, valid: true, requiredTargetUuid: '' };
        return { active: true, valid: selected.has(requiredTargetUuid), requiredTargetUuid };
    }

    // Formato novo: passiva permanente, elegibilidade recalculada ao vivo
    const requiredTargetUuid = String(state.magnetism?.targetUuid ?? '');
    if (!requiredTargetUuid) return { active: false, valid: true, requiredTargetUuid: '' };
    const active = props ? resolveMetalMagnetism(props, state).eligible : true;
    if (!active) return { active: false, valid: true, requiredTargetUuid: '' };
    return { active: true, valid: selected.has(requiredTargetUuid), requiredTargetUuid };
}

/**
 * Elegibilidade do Magnetismo a partir das ATRIBUTOS EFETIVAS atuais:
 * display + bônus temporário do Forjado quando ativo (o estágio pode elevar
 * FOR até o limiar 6; expirar Forjado pode desligar a passiva).
 */
export function resolveMetalMagnetism(props = {}, rawState = null) {
    const state = rawState ? parseMetalBreathingState(rawState) : null;
    const forged = state?.battleForged?.turns > 0 ? state.battleForged : null;
    const effectiveVit = parseNumber(props.vit_display);
    const effectiveFor =
        parseNumber(props.for_display) + Math.max(0, Math.trunc(parseNumber(forged?.forBonus)));
    return { eligible: effectiveVit >= 6 || effectiveFor >= 6, effectiveVit, effectiveFor };
}

/**
 * Único ponto autorizado a consumir Duro como Aço: resolução confirmada do
 * próximo ataque inimigo. Rolagens defensivas isoladas devem apenas consultá-lo.
 */
export function resolveMetalIncomingAttackDefense(raw) {
    const state = parseMetalBreathingState(raw);
    const effect = state.steelDefense ?? null;
    if (!effect) return { consumed: false, effect: null, state, patch: metalStatePatch(state) };
    delete state.steelDefense;
    return { consumed: true, effect, state, patch: metalStatePatch(state) };
}

export function resolveMetalChainReroll(raw, { originalTotal = 0, rerollHit = false } = {}) {
    const state = parseMetalBreathingState(raw);
    const active = state.chainReaction?.turns > 0;
    const allowed = active && parseNumber(originalTotal) < state.chainReaction.rerollBelowTotal;
    return {
        allowed,
        exhaustion: allowed && !rerollHit ? state.chainReaction.exhaustionOnFailedReroll : 0,
    };
}

export function consumeMetalSteelDefense(raw) {
    const state = parseMetalBreathingState(raw);
    const effect = state.steelDefense ?? null;
    if (effect) delete state.steelDefense;
    return { effect, state, patch: metalStatePatch(state) };
}

export function tickMetalBreathing(raw) {
    const state = parseMetalBreathingState(raw);
    for (const key of ['metalized', 'unshakable', 'chainReaction', 'battleForged']) {
        if (!state[key] || !Number.isFinite(Number(state[key].turns))) continue;
        // Substitui o objeto em vez de mutar: estados antigos compartilhados por
        // referência (shallow copy do parser) não podem ser alterados retroativamente.
        const nextTurns = Math.max(0, Math.trunc(parseNumber(state[key].turns)) - 1);
        state[key] = { ...state[key], turns: nextTurns };
        if (nextTurns === 0) delete state[key];
    }
    if (state.chainReaction?.appliedThisTurn !== undefined) {
        state.chainReaction = { ...state.chainReaction };
        delete state.chainReaction.appliedThisTurn;
    }
    delete state.activeForm;
    return { state, patch: metalStatePatch(state) };
}

export function clearMetalBreathingState(raw) {
    const state = parseMetalBreathingState(raw);
    for (const key of [
        'activeForm',
        'metalized',
        'unshakable',
        'chainReaction',
        'steelDefense',
        'battleForged',
        'magnetism',
    ])
        delete state[key];
    return metalStatePatch(state);
}
