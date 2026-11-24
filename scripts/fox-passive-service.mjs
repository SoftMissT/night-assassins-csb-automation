import { actorKind } from './actor-kind.mjs';
import { consumeSlayerActions } from './action-service.mjs';
import { breathingPdrInfo, breathingResourceKeys } from './actor-resources.mjs';
import { hasBreathingPassive } from './breathing-passive-rules.mjs';
import { parseNumber } from './parsing.mjs';
import { resolveSheetAttribute } from './sheet-attributes.mjs';
import { clampExhaustion, formatStatusSummary, parseStatusState, stripTagsUntilStable } from './status-service.mjs';
import { isHomebrewExtra } from './rules-profile.mjs';

export const FOX_PASSIVE_KEY = 'resp_raposa_passiva';
const pending = new Set();
const integer = (value, maximum = Infinity) => Math.max(0, Math.min(maximum, Math.trunc(Number(value) || 0)));

export function parseFoxPassive(raw) {
    try {
        if (typeof raw === 'string') {
            const decoded = stripTagsUntilStable(raw).replaceAll('&quot;', '"').replaceAll('&#34;', '"');
            raw = JSON.parse(decoded.slice(decoded.indexOf('{'), decoded.lastIndexOf('}') + 1));
        }
    } catch { raw = null; }
    const value = raw && typeof raw === 'object' ? raw : {};
    return {
        version: 1,
        combatId: String(value.combatId ?? ''),
        veils: integer(value.veils, 9),
        roundKey: String(value.roundKey ?? ''),
        gainedThisRound: integer(value.gainedThisRound, 2),
        seen: Array.isArray(value.seen) ? [...new Set(value.seen.map(String))].slice(-128) : [],
        distractionRound: String(value.distractionRound ?? ''),
        turnKey: String(value.turnKey ?? ''),
        attackTurnKey: String(value.attackTurnKey ?? ''),
        supreme: {
            active: value.supreme?.active === true && integer(value.supreme?.remaining, 3) > 0,
            remaining: integer(value.supreme?.remaining, 3),
            used: value.supreme?.used === true,
            lastActorTurnKey: String(value.supreme?.lastActorTurnKey ?? ''),
        },
    };
}

/** Eventos de uma mesma ocorrência compartilham eventId, inclusive requisitos diferentes. */
export function reduceFoxPassive(raw, event = {}, context = {}) {
    const state = parseFoxPassive(raw);
    const combatId = String(context.combatId ?? state.combatId);
    const result = { state, gained: 0 };
    if (event.type === 'combatEnd') return { state: parseFoxPassive(), gained: 0 };
    if (event.type === 'combatStart') return { state: parseFoxPassive({ combatId }), gained: 0 };
    if (!combatId || state.combatId !== combatId) return result;
    const roundKey = `${combatId}:${context.round ?? ''}`;
    if (state.roundKey !== roundKey) {
        state.roundKey = roundKey;
        state.gainedThisRound = 0;
        state.seen = [];
    }
    const turnKey = `${roundKey}:${context.turn ?? ''}`;
    state.turnKey = turnKey;
    if (event.type === 'turnStart') {
        const actorTurnKey = String(context.actorTurnKey ?? turnKey);
        if (event.isActorTurn === true && state.supreme.active &&
            state.supreme.lastActorTurnKey !== actorTurnKey) {
            state.supreme.lastActorTurnKey = actorTurnKey;
            state.supreme.remaining = Math.max(0, state.supreme.remaining - 1);
            state.supreme.active = state.supreme.remaining > 0;
        }
        return result;
    }
    if (event.type === 'damageTaken' && Number(event.amount) > 0 &&
        (event.cannotDodge === true || event.ignoresDodge === true)) {
        state.supreme.active = false;
        state.supreme.remaining = 0;
    }
    if (['attackRoll', 'hit'].includes(event.type) && (event.actionType === 'ataque' || event.isTechnique === true))
        state.attackTurnKey = turnKey;
    if (event.type === 'miss' && state.veils >= 4 && event.targetUuid &&
        state.distractionRound !== roundKey) {
        const distraction = { targetUuid: event.targetUuid, condition: 'distraido', untilTargetTurnStart: true };
        if (event.activateDistraction === true) {
            state.distractionRound = roundKey;
            result.applyDistraction = distraction;
        } else result.offerDistraction = distraction;
    }
    if (event.type === 'statusApplied' && event.condition === 'desorientado' && state.veils >= 7)
        result.desorientedTurns = Math.min(2, Number(event.duration) > 0 ? Number(event.duration) : 2);
    const id = String(event.eventId ?? '');
    if (!id || state.seen.includes(id)) return result;
    let gain = 0;
    if (event.success === true) {
        if (event.type === 'defense' && event.perfect === true && event.defenseType === 'esquiva') gain = 2;
        else if (event.type === 'defense' && event.actionType === 'reacao') gain = 1;
        else if (event.type === 'statusApplied' && ['distraido', 'desorientado'].includes(event.condition)) gain = 1;
        else if (['healAlly', 'preventAllyDamage'].includes(event.type) && Number(event.amount) > 0 &&
            event.targetUuid && event.targetUuid !== context.actorUuid && event.isSelf !== true &&
            (event.type !== 'healAlly' || event.isTechnique === true)) gain = 1;
    }
    if (!gain) return result;
    state.seen.push(id);
    state.seen = state.seen.slice(-128);
    if (!state.supreme.active) {
        result.gained = Math.min(gain, 2 - state.gainedThisRound, 9 - state.veils);
        state.veils += result.gained;
        state.gainedThisRound += result.gained;
    }
    return result;
}

export function foxPassiveBonuses(props = {}) {
    const state = parseFoxPassive(props[FOX_PASSIVE_KEY]);
    const enabled = isHomebrewExtra('raposa') && isHomebrewExtra('veus') &&
        hasBreathingPassive(props, 'Raposa') && Boolean(state.combatId);
    return {
        acerto: enabled ? Math.min(3, Math.max(0, state.veils - 3)) : 0,
        esquiva: enabled ? Math.min(3, state.veils) : 0,
        attackAdvantage: enabled && (state.supreme.active ||
            (state.veils >= 7 && Boolean(state.turnKey) && state.attackTurnKey !== state.turnKey)),
        incomingAttackDisadvantage: enabled && state.supreme.active,
        desorientedTurns: enabled && state.veils >= 7 ? 2 : null,
    };
}

function activationContext(actor, options) {
    const combat = options.combat ?? globalThis.game?.combat;
    const combatId = options.combatId ?? combat?.uuid ?? combat?.id ?? '';
    return { props: actor.system?.props ?? {}, actorUuid: actor.uuid,
        combatId, round: options.round ?? combat?.round ?? 0,
        turn: options.turn ?? combat?.turn ?? 0,
        actorTurnKey: options.actorTurnKey ?? `${combatId}:${options.round ?? combat?.round ?? 0}:${options.turn ?? combat?.turn ?? 0}` };
}

export async function activateFoxPassive(actor, action, options = {}) {
    if (!isHomebrewExtra('raposa')) return { ok: false, reason: 'Véus da Raposa estão desativados nas regras da mesa.' };
    if (!actor?.update || (!actor.isOwner && !globalThis.game?.user?.isGM) ||
        !['slayer', 'npc'].includes(actorKind(actor))) return { ok: false, reason: 'Sem permissão para usar a passiva.' };
    const key = actor.uuid ?? actor;
    if (pending.has(key)) return { ok: false, reason: 'Uma ativação da Raposa já está em andamento.' };
    pending.add(key);
    try {
        const validate = () => {
            const context = activationContext(actor, options);
            const state = parseFoxPassive(context.props[FOX_PASSIVE_KEY]);
            if (!hasBreathingPassive(context.props, 'Raposa') || !context.combatId || state.combatId !== context.combatId)
                return { ok: false, reason: 'A passiva exige Raposa e um combate ativo.' };
            if (parseNumber(context.props.nvl_respiracao_num ?? context.props.nvl_respiracao) < 4)
                return { ok: false, reason: 'Nona Cauda exige Nível 4 de Respiração.' };
            const fdv = Math.max(0, Math.trunc(resolveSheetAttribute(actor, 'FDV') ?? 0));
            if (action === 'supreme' && (state.veils !== 9 || state.supreme.used || state.supreme.active || fdv < 1))
                return { ok: false, reason: 'A ativação exige 9 Véus e só pode ocorrer uma vez por combate.' };
            if (action === 'finisher' && (!state.supreme.active || breathingPdrInfo(context.props).pdrCurrent < 6))
                return { ok: false, reason: 'A finalização exige Nona Cauda ativa e 6 PDR.' };
            if (!['supreme', 'finisher'].includes(action)) return { ok: false, reason: 'Ativação desconhecida.' };
            return { ok: true, context, state, fdv };
        };
        let validated = validate();
        if (!validated.ok) return validated;
        if (action === 'finisher' && typeof options.execute !== 'function')
            return { ok: false, reason: 'O executor da finalização não está disponível.' };
        if (options.confirmed !== true) {
            const accepted = await foundry.applications.api.DialogV2.confirm({
                window: { title: action === 'supreme' ? 'Nona Cauda' : 'A Última Mentira é a Verdade' },
                content: action === 'supreme'
                    ? `<p>Consumir 9 Véus para ativar Nona Cauda por ${Math.min(3, validated.fdv)} turnos?</p>`
                    : '<p>Usar uma Ação de Ataque e 6 PDR? Após executar, Nona Cauda termina e você recebe 1 Exaustão.</p>',
                rejectClose: false,
            });
            if (!accepted) return { ok: false, cancelled: true };
        }
        validated = validate();
        if (!validated.ok) return validated;
        const { state, context, fdv } = validated;
        if (action === 'supreme') {
            state.veils = 0;
            state.supreme = { active: true, remaining: Math.min(3, fdv), used: true,
                lastActorTurnKey: String(context.actorTurnKey) };
            await actor.update({ [`system.props.${FOX_PASSIVE_KEY}`]: JSON.stringify(state) },
                { naCsbAutomation: true, naFoxPassive: true });
            return { ok: true, state };
        }
        const actions = await consumeSlayerActions(actor, ['ataque'], { update: false });
        if (!actions.ok) return actions;
        const { pdrSpent } = breathingResourceKeys(context.props);
        const reservation = { ...actions.patch, [`system.props.${pdrSpent}`]: parseNumber(context.props[pdrSpent]) + 6 };
        const previous = Object.fromEntries(Object.keys(reservation).map(path => [path, context.props[path.slice('system.props.'.length)] ?? '']));
        const plan = { advantage: true, maximizeWeaponDice: true, extraDamage: `6d10 + ${fdv}`,
            blockDefensiveReactionsWhen: ['distraido', 'desorientado'], skipActionConsumption: true,
            skipResourceConsumption: true, fdv, pdrCost: 6 };
        await actor.update(reservation, { naCsbAutomation: true, naFoxPassive: true });
        const rollback = async () => {
            const patch = Object.fromEntries(Object.entries(previous).filter(([path]) =>
                actor.system?.props?.[path.slice('system.props.'.length)] === reservation[path]));
            if (Object.keys(patch).length) await actor.update(patch, { naCsbAutomation: true, naFoxPassive: true });
            if (Object.keys(patch).length !== Object.keys(previous).length)
                throw new Error('Os recursos mudaram durante a finalização. O Mestre deve conferir o reembolso.');
        };
        let execution;
        try { execution = await options.execute(plan); }
        catch (error) { await rollback(); throw error; }
        if (!execution || execution.cancelled || execution.executed === false || execution.ok === false) {
            await rollback();
            return { ok: false, cancelled: true };
        }
        const latest = parseFoxPassive(actor.system?.props?.[FOX_PASSIVE_KEY]);
        latest.supreme.active = false;
        latest.supreme.remaining = 0;
        const status = parseStatusState(actor.system?.props?.status_slayer_dados);
        status.exhaustion = clampExhaustion(Math.max(status.exhaustion,
            parseNumber(actor.system?.props?.status_slayer_exaustao)) + 1);
        await actor.update({
            [`system.props.${FOX_PASSIVE_KEY}`]: JSON.stringify(latest),
            'system.props.status_slayer_dados': JSON.stringify(status),
            'system.props.status_slayer_resumo': formatStatusSummary(status.active, status.exhaustion),
            'system.props.status_slayer_exaustao': status.exhaustion,
        }, { naCsbAutomation: true, naFoxPassive: true });
        return { ok: true, state: latest, plan, execution };
    } finally { pending.delete(key); }
}

export async function openFoxPassiveManager(actor, options = {}) {
    if (!isHomebrewExtra('raposa')) return { ok: false, reason: 'Véus da Raposa estão desativados nas regras da mesa.' };
    if (!actor?.update || (!actor.isOwner && !globalThis.game?.user?.isGM))
        return { ok: false, reason: 'Sem permissão para gerenciar Raposa.' };
    const props = actor.system?.props ?? {};
    const state = parseFoxPassive(props[FOX_PASSIVE_KEY]);
    const bonus = foxPassiveBonuses(props);
    const action = await foundry.applications.api.DialogV2.wait({
        window: { title: 'Véus da Raposa' },
        content: `<p><strong>${state.veils}/9 Véus</strong> · Ganho nesta rodada ${state.gainedThisRound}/2</p><p>Esquiva +${bonus.esquiva} · Acerto +${bonus.acerto}</p><p>Nona Cauda ${state.supreme.active ? `ativa por ${state.supreme.remaining} turnos` : state.supreme.used ? 'já usada neste combate' : 'disponível com 9 Véus no nível 4'}.</p>`,
        buttons: [
            ...(state.veils === 9 && !state.supreme.used ? [{ action: 'supreme', label: 'Ativar Nona Cauda', callback: () => 'supreme' }] : []),
            ...(state.supreme.active ? [{ action: 'finisher', label: 'A Última Mentira é a Verdade · 6 PDR', callback: () => 'finisher' }] : []),
            { action: 'close', label: 'Fechar', default: true, callback: () => false },
        ], rejectClose: false,
    });
    return action ? activateFoxPassive(actor, action, options) : { ok: false, cancelled: true };
}
