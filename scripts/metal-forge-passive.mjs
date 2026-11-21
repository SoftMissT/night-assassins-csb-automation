import { actorKind } from './actor-kind.mjs';
import { consumeSlayerActions } from './action-service.mjs';
import { hasBreathingPassive } from './breathing-passive-rules.mjs';
import { parseNumber } from './parsing.mjs';
import { resolveSheetAttribute } from './sheet-attributes.mjs';
import { isHomebrewExtra } from './rules-profile.mjs';

export const METAL_FORGE_KEY = 'resp_metal_forja_passiva';
const activating = new Set();
const number = (value, maximum) => Math.min(maximum, Math.max(0, Math.trunc(parseNumber(value))));

export function parseMetalForge(raw) {
    let source = raw;
    if (typeof source === 'string') {
        try { source = JSON.parse(source); } catch { source = null; }
    }
    if (!source || typeof source !== 'object' || Array.isArray(source)) source = {};
    const whiteTurns = number(source.whiteTurns, 3);
    return {
        version: 1,
        combatId: String(source.combatId ?? ''),
        temperature: whiteTurns ? 0 : number(source.temperature, 6),
        roundKey: String(source.roundKey ?? ''),
        gained: {
            block: source.gained?.block === true,
            save: source.gained?.save === true,
            damage: source.gained?.damage === true,
        },
        whiteTurns,
        whiteUsed: source.whiteUsed === true || whiteTurns > 0,
        whiteLastTurnKey: String(source.whiteLastTurnKey ?? ''),
        whiteFirstHitKey: String(source.whiteFirstHitKey ?? ''),
        whiteReflectionRoundKey: String(source.whiteReflectionRoundKey ?? ''),
    };
}

export function reduceMetalForge(raw, event = {}, context = {}) {
    let state = parseMetalForge(raw);
    const effects = { exhaustionGain: 0, bonusDamage: null, reflectionDamage: 0, reflectionTargetUuid: '' };
    const combatId = String(context.combatId ?? '');
    if (event.type === 'combatEnd') {
        effects.exhaustionGain = state.whiteTurns > 0 ? 1 : 0;
        return { state: parseMetalForge(null), ...effects };
    }
    if (!combatId) return { state, ...effects };
    if (state.combatId !== combatId) {
        effects.exhaustionGain = state.whiteTurns > 0 ? 1 : 0;
        state = { ...parseMetalForge(null), combatId };
    }
    const roundKey = `${combatId}:${context.round ?? 0}`;
    const turnKey = String(context.actorTurnKey ?? `${roundKey}:${context.turn ?? 0}`);
    if (state.roundKey !== roundKey) {
        state.roundKey = roundKey;
        state.gained = { block: false, save: false, damage: false };
    }
    if (event.type === 'combatStart') return { state, ...effects };
    if (event.type === 'turnStart' && state.whiteTurns > 0 && state.whiteLastTurnKey !== turnKey) {
        state.whiteLastTurnKey = turnKey;
        state.whiteTurns -= 1;
        if (state.whiteTurns === 0) effects.exhaustionGain += 1;
    }
    const unconscious = event.conscious === false ||
        (event.type === 'statusApplied' && ['inconsciente', 'inconsciencia'].includes(event.condition));
    if (unconscious) state.temperature = 0;
    const block = event.type === 'defense' && event.success === true &&
        String(event.defenseType ?? '').toLowerCase() === 'bloqueio';
    if (state.whiteTurns > 0) {
        if (event.type === 'hit' && event.success !== false && state.whiteFirstHitKey !== turnKey) {
            state.whiteFirstHitKey = turnKey;
            effects.bonusDamage = { formula: '1d8', types: ['concussao'], source: 'Metal Branco' };
        }
        if (block && event.melee === true && event.targetUuid && state.whiteReflectionRoundKey !== roundKey) {
            state.whiteReflectionRoundKey = roundKey;
            effects.reflectionDamage = Math.max(0, resolveSheetAttribute({ system: { props: context.props ?? {} } }, 'VIT') ?? 0);
            effects.reflectionTargetUuid = String(event.targetUuid);
        }
        return { state, ...effects };
    }
    const trigger = block ? 'block' :
        event.type === 'physicalSave' && event.success === true ? 'save' :
        event.type === 'damageTaken' && Number(event.amount) > 0 && event.conscious === true ? 'damage' : null;
    if (!unconscious && trigger && !state.gained[trigger]) {
        state.gained[trigger] = true;
        state.temperature = Math.min(6, state.temperature + 1);
    }
    return { state, ...effects };
}

export function metalForgeBonuses(props = {}) {
    const state = parseMetalForge(props[METAL_FORGE_KEY]);
    const active = isHomebrewExtra('forja_viva') && hasBreathingPassive(props, 'Metal');
    const white = active && state.whiteTurns > 0;
    return {
        bloqueio: !active ? 0 : white ? 3 : Math.floor(state.temperature / 2),
        concussionResistance: white,
        physicalImmunities: white ? ['derrubado', 'restricao_movimentos'] : [],
        physicalSaveAdvantage: white ? ['fratura', 'atordoamento'] : [],
        firstHitDamageFormula: white ? '1d8' : '',
        reflectionDamage: white ? Math.max(0, resolveSheetAttribute({ system: { props } }, 'VIT') ?? 0) : 0,
    };
}

function currentContext() {
    const combat = globalThis.game?.combat;
    const combatId = String(combat?.uuid ?? combat?.id ?? '');
    return {
        active: combat?.started === true && !!combatId,
        combatId,
        round: combat?.round ?? 0,
        turn: combat?.turn ?? 0,
        actorTurnKey: `${combatId}:${combat?.round ?? 0}:${combat?.turn ?? 0}`,
    };
}

function activationReason(actor, context, state) {
    if (!actor?.update || (!actor.isOwner && !globalThis.game?.user?.isGM))
        return 'Você não tem permissão para alterar esta ficha.';
    if (!['slayer', 'npc'].includes(actorKind(actor)) || !hasBreathingPassive(actor.system?.props, 'Metal'))
        return 'Metal Branco exige a Respiração do Metal.';
    if (!context.active) return 'Metal Branco exige um combate em andamento.';
    if (state.combatId !== context.combatId || state.temperature < 6)
        return 'Metal Branco exige 6 pontos de Temperatura deste combate.';
    if (state.whiteUsed || state.whiteTurns > 0) return 'Metal Branco já foi utilizado neste combate.';
    return null;
}

export async function activateMetalForge(actor, { confirm = true } = {}) {
    if (!isHomebrewExtra('forja_viva')) return { ok: false, reason: 'Forja Viva está desativada nas regras da mesa.' };
    const key = actor?.uuid ?? actor;
    if (activating.has(key)) return { ok: false, reason: 'A ativação de Metal Branco já está em andamento.' };
    activating.add(key);
    try {
        const before = currentContext();
        let state = parseMetalForge(actor?.system?.props?.[METAL_FORGE_KEY]);
        let reason = activationReason(actor, before, state);
        if (reason) return { ok: false, reason };
        if (confirm && !await foundry.applications.api.DialogV2.confirm({
            window: { title: 'Metal Branco' },
            content: '<p>Consumir <strong>6 Temperatura</strong> e uma <strong>Ação Única</strong> para ativar Metal Branco?</p><p>Dura 3 turnos, incluindo o da ativação. Ao terminar, recebe 1 Exaustão. Uma vez por combate. Sem custo de PDR.</p>',
            rejectClose: false,
        })) return { ok: false, cancelled: true };
        const context = currentContext();
        state = parseMetalForge(actor.system?.props?.[METAL_FORGE_KEY]);
        reason = activationReason(actor, context, state);
        if (reason || context.combatId !== before.combatId)
            return { ok: false, reason: reason ?? 'O combate mudou durante a confirmação.' };
        const action = await consumeSlayerActions(actor, ['unica'], { update: false });
        if (!action.ok) return action;
        state = {
            ...state, temperature: 0, whiteTurns: 3, whiteUsed: true,
            whiteLastTurnKey: context.actorTurnKey,
            whiteFirstHitKey: '', whiteReflectionRoundKey: '',
        };
        await actor.update({
            ...action.patch,
            [`system.props.${METAL_FORGE_KEY}`]: JSON.stringify(state),
        }, { naCsbAutomation: true, naBreathingPassive: true });
        return { ok: true, state };
    } finally {
        activating.delete(key);
    }
}

export async function openMetalForgeManager(actor) {
    if (!isHomebrewExtra('forja_viva')) return { ok: false, reason: 'Forja Viva está desativada nas regras da mesa.' };
    const state = parseMetalForge(actor?.system?.props?.[METAL_FORGE_KEY]);
    const reason = activationReason(actor, currentContext(), state);
    if (!actor?.update || (!actor.isOwner && !globalThis.game?.user?.isGM))
        return { ok: false, reason };
    const action = await foundry.applications.api.DialogV2.wait({
        window: { title: 'Forja Viva — Metal Branco' },
        content: `<p><strong>Temperatura ${state.temperature}/6</strong></p><p>Metal Branco ${state.whiteTurns > 0 ? `ativo por ${state.whiteTurns} turno(s), incluindo o atual` : state.whiteUsed ? 'já utilizado neste combate' : 'disponível ao atingir 6 Temperatura'}.</p><p>Ativação — Ação Única, 6 Temperatura, sem PDR. Duração de 3 turnos. Ao término, +1 Exaustão.</p>`,
        buttons: [
            ...(!reason ? [{ action: 'activate', label: 'Ativar Metal Branco', callback: () => 'activate' }] : []),
            { action: 'close', label: 'Fechar', default: true, callback: () => false },
        ],
        rejectClose: false,
    });
    if (action !== 'activate') return { ok: false, cancelled: true };
    const result = await activateMetalForge(actor, { confirm: false });
    if (!result.ok && result.reason) globalThis.ui?.notifications?.warn?.(result.reason);
    return result;
}
