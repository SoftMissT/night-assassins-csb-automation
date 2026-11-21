import { actorKind } from './actor-kind.mjs';
import { breathingPdvInfo, breathingResourceKeys } from './actor-resources.mjs';
import { hasBreathingPassive } from './breathing-passive-rules.mjs';
import { parseNumber } from './parsing.mjs';
import { isHomebrewExtra } from './rules-profile.mjs';

export const WIND_CURRENT_KEY = 'resp_vento_corrente_estado';
const MODES = ['controlled', 'uncontrolled'];
const ROLL_CHANNELS = ['acerto', 'bloqueio', 'esquiva'];
const pendingActors = new Set();
const count = value => Math.max(0, Math.trunc(parseNumber(value)));
const text = value => String(value ?? '');
const formKey = value => text(value).match(/^vento_\d+/)?.[0] ?? '';

export function parseWindCurrent(raw) {
    let saved = raw;
    if (typeof raw === 'string') {
        try { saved = JSON.parse(raw); } catch { saved = {}; }
    }
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) saved = {};
    const list = value => [...new Set(Array.isArray(value) ? value.filter(entry => typeof entry === 'string') : [])];
    return {
        version: 1, combatId: text(saved.combatId),
        round: Number.isInteger(saved.round) ? saved.round : null,
        current: count(saved.current), supportedDamage: count(saved.supportedDamage),
        mode: MODES.includes(saved.mode) ? saved.mode : 'controlled',
        lastFormId: formKey(saved.lastFormId),
        successfulRound: Number.isInteger(saved.successfulRound) ? saved.successfulRound : null,
        recoveredRound: Number.isInteger(saved.recoveredRound) ? saved.recoveredRound : null,
        gainedExecutions: list(saved.gainedExecutions), healedExecutions: list(saved.healedExecutions),
        turnKey: text(saved.turnKey), modeWindowOpen: saved.modeWindowOpen === true,
        modeChosen: saved.modeChosen === true,
        pendingRoll: saved.pendingRoll && typeof saved.pendingRoll === 'object'
            ? { executionId: text(saved.pendingRoll.executionId), formId: formKey(saved.pendingRoll.formId),
                channel: text(saved.pendingRoll.channel), points: count(saved.pendingRoll.points) } : null,
        pendingDamage: saved.pendingDamage && typeof saved.pendingDamage === 'object'
            ? { executionId: text(saved.pendingDamage.executionId), formId: formKey(saved.pendingDamage.formId),
                diceRemaining: count(saved.pendingDamage.diceRemaining), counterAttack: saved.pendingDamage.counterAttack === true } : null,
        recoveryOffer: saved.recoveryOffer && typeof saved.recoveryOffer === 'object'
            ? { executionId: text(saved.recoveryOffer.executionId), formId: formKey(saved.recoveryOffer.formId),
                amount: count(saved.recoveryOffer.amount), round: count(saved.recoveryOffer.round) } : null,
    };
}

function healingPlan(state, amount, props = {}) {
    const resource = breathingPdvInfo(props);
    const temporary = actorKind({ system: { props } }) === 'slayer' ? count(props.pdv_slayer_extra) : 0;
    const normalMaximum = Math.max(0, resource.pdvMax - temporary);
    const normalCurrent = Math.max(0, Math.min(normalMaximum, resource.pdvRaw - temporary));
    const matchedDamage = Math.min(state.supportedDamage, count(amount));
    return { matchedDamage, healAvailable: Math.min(Math.floor(matchedDamage / 2), normalMaximum - normalCurrent) };
}

function matchesExecution(pending, event) {
    return pending && (!pending.executionId || pending.executionId === text(event.executionId)) &&
        (!pending.formId || pending.formId === formKey(event.formId));
}

export function reduceWindCurrent(rawState, rawEvent, context = {}) {
    let state = parseWindCurrent(rawState);
    const event = typeof rawEvent === 'string' ? { type: rawEvent } : (rawEvent ?? {});
    const result = extra => ({ ok: true, state, healAmount: 0, damageDice: 0, bonus: 0, ...extra });
    const denied = reason => result({ ok: false, reason });
    if (event.type === 'combatEnd') {
        state = parseWindCurrent();
        return result();
    }
    if (context.props && !hasBreathingPassive(context.props, 'Vento')) return denied('Requer a Respiração do Vento.');
    const combatId = text(context.combatId ?? state.combatId);
    if (!combatId) return denied('A Corrente funciona durante um combate.');
    if (state.combatId !== combatId) state = { ...parseWindCurrent(), combatId };
    const round = Number.isInteger(context.round) ? context.round : state.round;
    if (state.round !== null && round > state.round) {
        if (round > state.round + 1 || state.successfulRound !== state.round) {
            state.current = 0;
            state.pendingRoll = null;
            state.pendingDamage = null;
        }
        state.recoveryOffer = null;
    }
    state.round = round;
    if (event.type === 'combatStart') return result();
    if (event.type === 'turnStart') {
        const turnKey = text(context.actorTurnKey ?? `${combatId}:${round}:${context.turn ?? ''}`);
        if (turnKey !== state.turnKey) {
            state.turnKey = turnKey;
            state.modeWindowOpen = true;
            state.modeChosen = false;
        }
        return result();
    }
    if (event.type === 'turnEnd') {
        state.modeWindowOpen = false;
        return result();
    }
    if (event.type === 'mode') {
        if (!MODES.includes(event.mode)) return denied('Escolha um dos dois estados do Furacão.');
        if (!state.modeWindowOpen || state.modeChosen ||
            (context.actorTurnKey && state.turnKey !== text(context.actorTurnKey)))
            return denied('O estado é escolhido no início do próprio turno.');
        state.mode = event.mode;
        state.modeChosen = true;
        return result();
    }
    if (event.type === 'spend') {
        if (event.confirmed === false) return denied('Gasto cancelado.');
        const points = Number(event.points);
        if (!Number.isSafeInteger(points) || points < 1 || points > state.current)
            return denied('Declare uma quantidade inteira de Corrente disponível.');
        if (state.pendingRoll || state.pendingDamage) return denied('Resolva primeiro o gasto de Corrente já declarado.');
        const formId = formKey(event.formId);
        if (state.mode === 'controlled') {
            if (!ROLL_CHANNELS.includes(event.channel)) return denied('O Furacão Controlado fortalece Acerto, Bloqueio ou Esquiva.');
            state.pendingRoll = { points, channel: event.channel, executionId: text(event.executionId), formId };
        } else {
            if (!['damage', 'dano'].includes(event.channel) || event.isTechnique !== true || (event.formId && !formId))
                return denied('O Furacão Descontrolado fortalece o dano de uma Forma ofensiva.');
            state.pendingDamage = { executionId: text(event.executionId), formId, diceRemaining: points * 2, counterAttack: false };
        }
        state.modeWindowOpen = false;
        state.current -= points;
        return result({ bonus: state.pendingRoll ? points * 2 : 0, damageDice: state.pendingDamage ? points * 2 : 0 });
    }
    if (event.type === 'consumeDamageBonus') {
        if (!matchesExecution(state.pendingDamage, event)) return denied('Não há dados de Corrente para esta execução.');
        if (!formKey(event.formId) || event.isTechnique !== true || !text(event.executionId))
            return denied('Os dados de Corrente pertencem à execução de uma Forma do Vento.');
        const dice = Number(event.dice);
        if (!Number.isSafeInteger(dice) || dice < 1 || dice > state.pendingDamage.diceRemaining)
            return denied('Distribua somente os dados de Corrente disponíveis.');
        state.pendingDamage.executionId = text(event.executionId);
        state.pendingDamage.formId = formKey(event.formId);
        state.pendingDamage.diceRemaining -= dice;
        if (!state.pendingDamage.diceRemaining) state.pendingDamage = null;
        return result({ damageDice: dice });
    }
    if (event.type === 'damageTaken') {
        if (event.hostile === true && !event.voluntary && !event.selfInflicted && !event.ally)
            state.supportedDamage += count(event.amount);
        return result();
    }
    const channel = event.type === 'defense' ? (event.channel ?? event.actionType) : 'acerto';
    if (['attackRoll', 'hit', 'miss', 'defense'].includes(event.type) &&
        matchesExecution(state.pendingRoll, event) && state.pendingRoll.channel === channel) {
        const points = state.pendingRoll.points;
        state.pendingRoll = null;
        if (event.type === 'defense' && event.success === true && channel === 'bloqueio' && formKey(event.formId) === 'vento_04')
            state.pendingDamage = { executionId: text(event.executionId), formId: 'vento_04',
                diceRemaining: points, counterAttack: true };
    }
    if (['hit', 'miss', 'defense', 'damageDealt'].includes(event.type)) state.modeWindowOpen = false;
    const formId = formKey(event.formId);
    const executionId = text(event.executionId);
    const success = event.type === 'hit' ? event.success !== false :
        event.type === 'defense' ? event.success === true && channel === 'bloqueio' :
        event.type === 'damageDealt' && count(event.amount) > 0 && event.direct === true;
    if (success && event.isTechnique === true && event.hostile === true && formId && executionId &&
        !state.gainedExecutions.includes(executionId)) {
        const gained = 1 + (state.lastFormId && state.lastFormId !== formId ? 1 : 0);
        state.current += gained;
        state.lastFormId = formId;
        state.successfulRound = round;
        state.gainedExecutions.push(executionId);
    }
    if (event.type === 'miss' && event.final !== false && matchesExecution(state.pendingDamage, event))
        state.pendingDamage = null;
    if (event.type !== 'damageDealt') return result();
    // Dano direto é o total já resolvido da execução, somado entre seus golpes e alvos.
    if (!formId || !executionId || event.isTechnique !== true || event.direct !== true || event.hostile !== true ||
        event.periodic || state.recoveredRound === round || state.healedExecutions.includes(executionId)) return result();
    const recovery = healingPlan(state, event.amount, context.props);
    if (recovery.healAvailable < 1) return result(recovery);
    state.recoveryOffer = { executionId, formId, amount: count(event.amount), round };
    if (event.recover !== true) return result(recovery);
    state.supportedDamage -= recovery.matchedDamage;
    state.recoveredRound = round;
    state.healedExecutions.push(executionId);
    state.recoveryOffer = null;
    return result({ ...recovery, healAmount: recovery.healAvailable });
}

export function planWindCurrentSpend(state, options = {}, context = {}) {
    return reduceWindCurrent(state, { ...options, type: 'spend' }, context);
}

export function windCurrentBonuses(props = {}, options = {}) {
    const state = parseWindCurrent(props[WIND_CURRENT_KEY]);
    const bonuses = { acerto: 0, bloqueio: 0, esquiva: 0, damageDice: 0, mode: state.mode };
    if (!isHomebrewExtra('corrente') || !hasBreathingPassive(props, 'Vento') || !state.combatId) return bonuses;
    if (state.mode === 'uncontrolled') bonuses.bloqueio = bonuses.esquiva = -2;
    if (state.pendingRoll && (!options.executionId || matchesExecution(state.pendingRoll, options)) &&
        ROLL_CHANNELS.includes(state.pendingRoll.channel))
        bonuses[state.pendingRoll.channel] += state.pendingRoll.points * 2;
    if (state.pendingDamage && (!options.executionId || matchesExecution(state.pendingDamage, options)))
        bonuses.damageDice = state.pendingDamage.diceRemaining;
    return bonuses;
}

function actorContext(options = {}) {
    const combat = options.combat ?? globalThis.game?.combat;
    return { combatId: combat?.started === false ? '' : (options.combatId ?? combat?.uuid ?? combat?.id ?? ''),
        round: combat?.round ?? options.round, turn: combat?.turn ?? options.turn,
        actorTurnKey: options.actorTurnKey };
}

export async function activateWindCurrent(actor, action, options = {}) {
    if (!isHomebrewExtra('corrente')) return { ok: false, reason: 'Corrente do Vendaval está desativada nas regras da mesa.' };
    if (!actor?.update || (!actor.isOwner && !globalThis.game?.user?.isGM)) return { ok: false, reason: 'Sem permissão para alterar este personagem.' };
    const key = actor.uuid ?? actor;
    if (pendingActors.has(key)) return { ok: false, reason: 'Uma escolha de Corrente já está aberta.' };
    pendingActors.add(key);
    try {
        let context = actorContext(options);
        const read = () => parseWindCurrent(actor.system?.props?.[WIND_CURRENT_KEY]);
        let event;
        if (action === 'recover') {
            const offer = options.executionId ? options : read().recoveryOffer;
            if (!offer) return { ok: false, reason: 'Nenhuma execução oferece Fôlego da Tempestade.' };
            if (offer.round !== undefined && offer.round !== context.round)
                return { ok: false, reason: 'A execução que oferecia recuperação pertence a outra rodada.' };
            event = { ...offer, type: 'damageDealt', isTechnique: true, hostile: true, direct: true, recover: true };
        } else event = { ...options, type: action };
        let outcome = reduceWindCurrent(read(), event, { ...context, props: actor.system?.props });
        if (!outcome.ok || (action === 'recover' && outcome.healAmount < 1)) return outcome;
        if (options.confirmed === false) return { ok: false, cancelled: true };
        if (['spend', 'recover'].includes(action) && options.confirmed !== true) {
            const confirmed = await foundry.applications.api.DialogV2.confirm({
                window: { title: action === 'spend' ? 'Consumir Corrente do Vendaval' : 'Fôlego da Tempestade' },
                content: action === 'spend'
                    ? `<p>Consumir <strong>${Number(options.points)}</strong> Pontos de Corrente antes da rolagem?</p>`
                    : `<p>Recuperar <strong>${outcome.healAmount} PDV</strong> e consumir ${outcome.matchedDamage} de Dano Suportado?</p>`,
                rejectClose: false,
            });
            if (!confirmed) return { ok: false, cancelled: true };
        }
        context = actorContext(options);
        if (action === 'recover' && event.round !== undefined && event.round !== context.round)
            return { ok: false, reason: 'A rodada mudou antes da confirmação da recuperação.' };
        outcome = reduceWindCurrent(read(), event, { ...context, props: actor.system?.props });
        if (!outcome.ok) return outcome;
        const patch = { [`system.props.${WIND_CURRENT_KEY}`]: JSON.stringify(outcome.state) };
        if (outcome.healAmount > 0) {
            const { pdvHealed } = breathingResourceKeys(actor.system?.props);
            patch[`system.props.${pdvHealed}`] = parseNumber(actor.system?.props?.[pdvHealed]) + outcome.healAmount;
        }
        await actor.update(patch, { naCsbAutomation: true, naWindCurrent: true });
        return outcome;
    } finally {
        pendingActors.delete(key);
    }
}

export async function openWindCurrentManager(actor) {
    if (!isHomebrewExtra('corrente')) return { ok: false, reason: 'Corrente do Vendaval está desativada nas regras da mesa.' };
    if (!actor?.update || (!actor.isOwner && !globalThis.game?.user?.isGM)) return { ok: false, reason: 'Sem permissão para este personagem.' };
    const props = actor.system?.props ?? {};
    if (!hasBreathingPassive(props, 'Vento')) return { ok: false, reason: 'Requer a Respiração do Vento.' };
    const state = parseWindCurrent(props[WIND_CURRENT_KEY]);
    const canChoose = state.modeWindowOpen && !state.modeChosen;
    const channels = state.mode === 'controlled'
        ? '<option value="acerto">Acerto</option><option value="bloqueio">Bloqueio</option><option value="esquiva">Esquiva</option>'
        : '<option value="damage">Dano da próxima Forma ofensiva</option>';
    const selected = await foundry.applications.api.DialogV2.wait({
        window: { title: 'Corrente do Vendaval' }, rejectClose: false,
        content: `<p><strong>${state.current}</strong> Pontos de Corrente · <strong>${state.supportedDamage}</strong> Dano Suportado</p>
            <p>Furacão ${state.mode === 'controlled' ? 'Controlado' : 'Descontrolado'}</p>
            <p>${canChoose ? 'Escolha o estado deste turno sem gastar ação ou PDR.' : 'O estado pode ser escolhido no início do próximo turno.'}</p>
            <label>Pontos para consumir <input type="number" name="windPoints" min="1" max="${state.current}" step="1" value="1"></label>
            <label>Rolagem <select name="windChannel">${channels}</select></label>`,
        buttons: [
            { action: 'controlled', label: 'Furacão Controlado', disabled: !canChoose, callback: () => ({ action: 'mode', mode: 'controlled' }) },
            { action: 'uncontrolled', label: 'Furacão Descontrolado', disabled: !canChoose, callback: () => ({ action: 'mode', mode: 'uncontrolled' }) },
            { action: 'spend', label: 'Declarar gasto', disabled: state.current < 1,
                callback: (_event, button) => ({ action: 'spend', points: Number(button.form.elements.windPoints.value),
                    channel: button.form.elements.windChannel.value, isTechnique: state.mode === 'uncontrolled', confirmed: true }) },
            { action: 'recover', label: 'Fôlego da Tempestade', disabled: !state.recoveryOffer, callback: () => ({ action: 'recover' }) },
            { action: 'close', label: 'Fechar', default: true, callback: () => null },
        ],
    });
    if (!selected) return { ok: false, cancelled: true };
    const result = await activateWindCurrent(actor, selected.action,
        selected.action === 'mode' ? { ...selected, actorTurnKey: state.turnKey } : selected);
    if (!result.ok && result.reason) globalThis.ui?.notifications?.warn?.(result.reason);
    return result;
}
