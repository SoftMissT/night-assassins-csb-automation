import { parseNumber } from './parsing.mjs';
import { actorKind } from './actor-kind.mjs';
import {
    addStoneBreakForAction,
    parseBreathPassiveState,
    passiveStatePatch,
    registerStoneConfirmedDamage,
} from './breath-passives.mjs';

export const STONE_STATE_KEY = 'resp_pedra_estado';

/** Campos de Forma do estado legado — limpos no tick e no clear (Artigo V). */
const LEGACY_STONE_KEYS = [
    'activeForm',
    'nextHit',
    'pendingDamage',
    'serpentine',
    'bleeding',
    'reflection',
    'resilience',
    'resilienceUsed',
];

export function parseStoneBreathingState(raw) {
    // structuredClone evita que objetos aninhados fiquem compartilhados por
    // referência entre o estado de origem e a cópia retornada aqui (mesmo
    // padrão de anti-aliasing usado em parseSnowBreathingState).
    if (raw && typeof raw === 'object') return { version: 1, ...structuredClone(raw) };
    try {
        const parsed = JSON.parse(String(raw || '{}'));
        return parsed && typeof parsed === 'object' ? { version: 1, ...parsed } : { version: 1 };
    } catch (_) {
        return { version: 1 };
    }
}

/**
 * Patch do estado da Pedra. O resumo é escrito pela passiva (Sangramento
 * legado ativo ou sem efeito); `resp_pedra_resiliencia_turnos` permanece 0
 * por compatibilidade com a ficha.
 */
export function stoneStatePatch(state, overrides = {}) {
    const bleeding = state?.bleeding;
    const turns = Math.max(0, Math.trunc(parseNumber(bleeding?.turns)));
    const resumo =
        bleeding?.amount && turns > 0
            ? `Pedra · Sangramento ${Math.max(0, Math.trunc(parseNumber(bleeding.amount)))} por ${turns} turno(s)`
            : 'Pedra · sem efeito ativo';
    return {
        [`system.props.${STONE_STATE_KEY}`]: JSON.stringify({ version: 1, ...state }),
        'system.props.resp_pedra_resumo': resumo,
        'system.props.resp_pedra_resiliencia_turnos': 0,
        ...overrides,
    };
}

export function tickStoneBreathing(raw) {
    const state = parseStoneBreathingState(raw);
    if (state.bleeding) {
        state.bleeding.turns = Math.max(0, Math.trunc(parseNumber(state.bleeding.turns)) - 1);
        if (state.bleeding.turns <= 0) delete state.bleeding;
    }
    for (const key of LEGACY_STONE_KEYS) {
        if (key === 'bleeding') continue;
        delete state[key];
    }
    return { state, patch: stoneStatePatch(state) };
}

export function clearStoneBreathingState(raw) {
    const state = parseStoneBreathingState(raw);
    for (const key of LEGACY_STONE_KEYS) delete state[key];
    return stoneStatePatch(state);
}

/**
 * Orquestração pós-dano da Pedra (extraída de damage-service):
 *  - registra o dano confirmado por alvo (alimenta o Jamongan Sōkyoku);
 *  - concede no máximo uma Quebra por ação quando a ação causou Concussão
 *    não anulada com arma sincronizada.
 * @param {object} options
 * @param {Actor} options.actor - usuário da Pedra.
 * @param {Array<{actor:object, amount:number, wound:number}>} options.appliedTargets
 * @param {Array<{negated?:boolean, components?:Array<{types?:string[]}>}>} options.damageRequests
 * @param {string} options.actionId
 * @param {number} options.strength - FOR usada no cálculo da Quebra.
 * @param {boolean} options.hasAttackDamage
 */
export async function applyStonePassiveAfterDamage({
    actor,
    appliedTargets = [],
    damageRequests = [],
    actionId = '',
    strength = 0,
    hasAttackDamage = false,
} = {}) {
    const kind = actorKind(actor) ?? 'slayer';
    if (kind !== 'slayer' || !hasAttackDamage) return;
    const knowsStone = [...(actor?.items ?? [])].some((item) =>
        ['Pedra', 'Iwa no Kokyū'].includes(item.system?.props?.respiracao_nome)
    );
    if (!knowsStone) return;

    let nextPassiveState = parseBreathPassiveState(actor.system?.props?.resp_passivas_estado);
    const weaponId = String(nextPassiveState.lastWeapon?.id ?? '');
    for (const target of appliedTargets) {
        if (target.amount + target.wound <= 0) continue;
        nextPassiveState = registerStoneConfirmedDamage(nextPassiveState, {
            targetUuid: target.actor.uuid,
            damage: target.amount + target.wound,
            actionId,
            combatId: globalThis.game?.combat?.uuid ?? '',
            round: globalThis.game?.combat?.round ?? 0,
            turn: globalThis.game?.combat?.turn ?? 0,
            weaponId,
        });
    }
    const quebraApplies = damageRequests.some(
        (request) =>
            request.negated !== true &&
            (request.components ?? []).some((component) => component.types?.includes('concussao'))
    );
    if (quebraApplies && weaponId)
        nextPassiveState = addStoneBreakForAction(nextPassiveState, weaponId, strength, actionId);
    await actor.update(passiveStatePatch(nextPassiveState), {
        naCsbAutomation: true,
        naBreathing: true,
    });
}
