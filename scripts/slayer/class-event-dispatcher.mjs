import {
    classEventContext,
    classStateKey,
    mbPressaoCombate,
    mbCriticoBrutalBleeding,
    mbCriticoBrutalFerimento,
    mbContraataqueEligible,
    mbContraataqueConsume,
    mbParryAvailable,
    mbParryConsume,
    mbParryApply,
    poisonApply,
    oniCercarProtegerAvailable,
    oniCercarProtegerConsume,
    oniResistenciaElementalCheck,
    oniEscudoInstintivoAvailable,
    oniEscudoInstintivoConsume,
    resetClassTurnState,
    resetClassRoundState,
} from './class-runtime.mjs';

function integer(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

/**
 * Dispatch a class event and return patches + notifications.
 * @param {Actor} actor - The actor to process
 * @param {string} event - Event name
 * @param {object} context - Event-specific context
 * @returns {{ patches: object, notifications: string[] }}
 */
export function dispatchClassEvent(actor, event, context = {}) {
    const props = actor?.system?.props ?? {};
    const classKey = props.classe_escolhida;
    const level = integer(props.nivel);
    if (!classKey) return { patches: {}, notifications: [] };

    const eventCtx = classEventContext({ classKey, level, event, props });
    if (!eventCtx.applicable) return { patches: {}, notifications: [] };

    const rank = eventCtx.rank;
    const patches = {};
    const notifications = [];

    switch (event) {
        case 'basic-hit':
            dispatchBasicHit(classKey, rank, props, context, patches, notifications);
            break;
        case 'basic-critical':
            dispatchBasicCritical(classKey, rank, props, context, patches, notifications);
            break;
        case 'physical-melee-damage':
            dispatchPhysicalMeleeDamage(classKey, rank, props, context, patches, notifications);
            break;
        case 'enemy-misses-melee':
            dispatchEnemyMissesMelee(classKey, rank, props, context, patches, notifications);
            break;
        case 'turn-start':
            dispatchTurnStart(classKey, props, patches);
            break;
        case 'round-start':
            dispatchRoundStart(classKey, props, patches);
            break;
    }

    return { patches, notifications };
}

// ─── basic-hit ──────────────────────────────────────────────────────
function dispatchBasicHit(classKey, rank, props, context, patches, notifications) {
    // MB: Pressão de Combate (rank B) — verifica e aplica internamente
    if (classKey === 'classe_mb' && rank === 'B') {
        const targetId = context.targetId ?? '';
        const result = mbPressaoCombate(props, targetId);
        if (result.apply) {
            Object.assign(patches, result.patch);
            notifications.push('Pressão de Combate aplicada: -1d4 no próximo ataque do alvo.');
        }
    }

    // UV: Aplicar veneno (rank C+) — precisa do CAR do atacante
    if (classKey === 'classe_usuario_de_veneno') {
        const attackerCAR = integer(context.attackerCAR ?? props.atr_car_valor_config);
        const result = poisonApply(props, attackerCAR, rank);
        if (result) Object.assign(patches, result);
    }
}

// ─── basic-critical ─────────────────────────────────────────────────
function dispatchBasicCritical(classKey, rank, props, context, patches, notifications) {
    // MB: Crítico Brutal (rank A)
    if (classKey === 'classe_mb' && rank === 'A') {
        const attackerFOR = integer(props.atr_for_valor_config);
        const attackerDEX = integer(props.atr_dex_valor_config);

        if (context.bleedingChoice === 'bleeding') {
            const bleedingDamage = mbCriticoBrutalBleeding(attackerFOR, attackerDEX, context.attrChoice);
            if (bleedingDamage > 0) {
                notifications.push(`Crítico Brutal: ${bleedingDamage} de sangramento.`);
            }
        } else if (context.ferimentoChoice) {
            const result = mbCriticoBrutalFerimento(context.ferimentoChoice);
            if (result) {
                notifications.push(`Crítico Brutal: ${result.label} aplicado.`);
            }
        }
    }
}

// ─── physical-melee-damage ──────────────────────────────────────────
function dispatchPhysicalMeleeDamage(classKey, rank, props, context, patches, notifications) {
    // Oni: Resistência Elemental (rank S) — retorna boolean, precisa calcular redução
    if (classKey === 'classe_companheiro_oni' && rank === 'S') {
        const damageType = context.damageType ?? '';
        if (oniResistenciaElementalCheck(props, damageType)) {
            const amount = integer(context.amount);
            const reduction = Math.floor(amount * 0.5);
            if (reduction > 0) {
                patches['system.props._oni_resistance_reduction'] = reduction;
                notifications.push(`Resistência Elemental: -${reduction} dano (${damageType}).`);
            }
        }
    }

    // Oni: Escudo Instintivo (rank A)
    if (classKey === 'classe_companheiro_oni' && rank === 'A') {
        if (oniEscudoInstintivoAvailable(props)) {
            const result = oniEscudoInstintivoConsume();
            Object.assign(patches, result);
            const shield = integer(props.oni_minion_pdr_atual);
            const amount = integer(context.amount);
            if (shield > 0 && amount > 0) {
                const absorbed = Math.min(shield, amount);
                patches['system.props._oni_shield_absorbed'] = absorbed;
                notifications.push(`Escudo Instintivo: absorveu ${absorbed} de dano.`);
            }
        }
    }
}

// ─── enemy-misses-melee ─────────────────────────────────────────────
function dispatchEnemyMissesMelee(classKey, rank, props, context, patches, notifications) {
    // MB: Contraataque (rank SS)
    if (classKey === 'classe_mb' && rank === 'SS') {
        if (mbContraataqueEligible(props)) {
            const result = mbContraataqueConsume();
            Object.assign(patches, result);
            notifications.push('Contraataque disponível! Ataque grátis.');
        }
    }

    // MB: Parry (rank S)
    if (classKey === 'classe_mb' && rank === 'S') {
        if (mbParryAvailable(props)) {
            const defenseAttr = integer(props.atr_dex_valor_config);
            const incomingDamage = integer(context.damageAmount);
            const parryResult = mbParryApply(rank, incomingDamage, defenseAttr);
            if (parryResult.reduced > 0) {
                const consumeResult = mbParryConsume();
                Object.assign(patches, consumeResult);
                patches['system.props._parry_reduction'] = parryResult.reduced;
                notifications.push(`Parry: -${parryResult.reduced} de dano.`);
            }
        }
    }

    // Oni: Cercar e Proteger (rank B+) — assume defesa quando Slayer falha
    if (classKey === 'classe_companheiro_oni') {
        if (oniCercarProtegerAvailable(props)) {
            const result = oniCercarProtegerConsume();
            Object.assign(patches, result);
            notifications.push('Cercar e Proteger: Oni assume defesa.');
        }
    }
}

// ─── turn-start ─────────────────────────────────────────────────────
function dispatchTurnStart(classKey, props, patches) {
    const resetPatches = resetClassTurnState(classKey, props);
    Object.assign(patches, resetPatches);
}

// ─── round-start ────────────────────────────────────────────────────
function dispatchRoundStart(classKey, props, patches) {
    const resetPatches = resetClassRoundState(classKey, props);
    Object.assign(patches, resetPatches);
}
