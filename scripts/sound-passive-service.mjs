import { actorKind } from './actor-kind.mjs';
import { consumeSlayerActions, parseActionState } from './action-service.mjs';
import { breathingPdrInfo, breathingResourceKeys } from './actor-resources.mjs';
import { hasBreathingPassive } from './breathing-passive-rules.mjs';
import { normalizeAbilityKey, parseNumber } from './parsing.mjs';
import { resolveSheetAttribute } from './sheet-attributes.mjs';
import { clampExhaustion, formatStatusSummary, parseStatusState } from './status-service.mjs';
import { effectiveRulesAbility, ruleVariant } from './rules-profile.mjs';

export const SOUND_PASSIVE_KEY = 'resp_som_partitura';
const pending = new Set();
const bpmValue = value => Math.min(200, Math.max(0, Math.trunc(parseNumber(value))));
const label = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function hasScore(props) {
    const ability = effectiveRulesAbility(props);
    const hearing = normalizeAbilityKey(ability);
    return hasBreathingPassive(props, 'Som') &&
        (hearing === 'hab_escolhida_audicao' || ['audicao agucada', 'audicao sobrenatural'].includes(label(ability)));
}

export function parseSoundPassive(raw) {
    let source = raw;
    if (typeof source === 'string') {
        try { source = JSON.parse(source); } catch { source = null; }
    }
    if (!source || typeof source !== 'object' || Array.isArray(source)) source = {};
    return {
        version: 1, combatId: String(source.combatId ?? ''), bpm: bpmValue(source.bpm),
        turnKey: String(source.turnKey ?? ''), roundKey: String(source.roundKey ?? ''),
        turnStartKey: String(source.turnStartKey ?? ''), hitTurnKey: String(source.hitTurnKey ?? ''),
        missTurnKey: String(source.missTurnKey ?? ''), criticalRoundKey: String(source.criticalRoundKey ?? ''),
        defenseRoundKey: String(source.defenseRoundKey ?? ''), attackTurnKey: String(source.attackTurnKey ?? ''),
        firstHitTurnKey: String(source.firstHitTurnKey ?? ''), nightcoreTurnKey: String(source.nightcoreTurnKey ?? ''),
        cancelAdvantageRoundKey: String(source.cancelAdvantageRoundKey ?? ''),
        anticipationRoundKey: String(source.anticipationRoundKey ?? ''),
        anticipation: { pending: source.anticipation?.pending === true, targetUuid: String(source.anticipation?.targetUuid ?? '') },
        estrondo: { pending: source.estrondo?.pending === true, targetUuid: String(source.estrondo?.targetUuid ?? '') },
        requiem: { used: source.requiem?.used === true, pending: source.requiem?.pending === true,
            turnKey: String(source.requiem?.turnKey ?? ''), bisTargetUuid: String(source.requiem?.bisTargetUuid ?? ''),
            bisExecutionId: String(source.requiem?.bisExecutionId ?? '') },
        tomorrowland: { used: source.tomorrowland?.used === true, active: source.tomorrowland?.active === true },
    };
}

export function reduceSoundPassive(raw, event = {}, context = {}) {
    let state = parseSoundPassive(raw);
    const result = { state, bonusDamage: null, counterDamage: null, exhaustionGain: 0, maxDamageDice: 0 };
    const combatId = String(context.combatId ?? '');
    if (event.type === 'combatEnd') {
        result.exhaustionGain = state.tomorrowland.active ? 2 : 0;
        return { ...result, state: parseSoundPassive(null) };
    }
    if (!combatId || !hasScore(context.props ?? {})) return result;
    if (state.combatId !== combatId) {
        result.exhaustionGain = state.tomorrowland.active ? 2 : 0;
        state = { ...parseSoundPassive(null), combatId };
        result.state = state;
    }
    const roundKey = `${combatId}:${context.round ?? 0}`;
    const turnKey = String(context.actorTurnKey ?? `${roundKey}:${context.turn ?? 0}`);
    if (state.turnKey && state.turnKey !== turnKey) {
        state.estrondo.pending = false;
        state.anticipation.pending = false;
    }
    state.roundKey = roundKey;
    state.turnKey = turnKey;
    if (event.type === 'combatStart') return result;
    if (state.requiem.pending && state.requiem.turnKey !== turnKey) state.requiem.pending = false;
    if (event.type === 'executionEnd' && event.action === 'tomorrowland' && state.tomorrowland.active) {
        state.bpm = 0;
        state.tomorrowland.active = false;
        result.exhaustionGain += 2;
        return result;
    }
    if (event.type === 'statusApplied' && ['atordoamento', 'atordoado', 'inconsciente', 'inconsciencia'].includes(event.condition)) {
        state.bpm = 0;
        return result;
    }
    if (event.type === 'turnStart') {
        if (event.isActorTurn !== false && state.turnStartKey !== turnKey) {
            state.turnStartKey = turnKey;
            if (!state.tomorrowland.active) state.bpm = bpmValue(state.bpm + 5);
        }
        return result;
    }
    if (event.type === 'attackRoll') {
        state.attackTurnKey = turnKey;
        return result;
    }
    const noGeneration = event.noPassiveGeneration === true || event.isExtraAttack === true;
    const noContact = event.noContactEffects === true || event.isExtraAttack === true;
    if (event.type === 'damageTaken' && Number(event.amount) > 0 && event.directPdv !== false) {
        if (!state.tomorrowland.active) state.bpm = bpmValue(state.bpm - 15);
    }
    const eligibleSingleTarget = event.isArea !== true && (Number(event.targetCount) || 1) === 1 && !state.tomorrowland.active;
    if (event.type === 'miss') {
        state.attackTurnKey = turnKey;
        if (state.missTurnKey !== turnKey) {
            state.missTurnKey = turnKey;
            if (!state.tomorrowland.active && !noGeneration) state.bpm = bpmValue(state.bpm - 30);
        }
        if (eligibleSingleTarget) state.requiem.pending = false;
    }
    if (event.type === 'hit' && event.success !== false) {
        state.attackTurnKey = turnKey;
        if (!state.tomorrowland.active && !noGeneration) {
            if (state.hitTurnKey !== turnKey) {
                state.hitTurnKey = turnKey;
                state.bpm = bpmValue(state.bpm + 10);
            }
            if (event.critical === true && state.criticalRoundKey !== roundKey) {
                state.criticalRoundKey = roundKey;
                state.bpm = bpmValue(state.bpm + 50);
            }
        }
        if (state.firstHitTurnKey !== turnKey) {
            state.firstHitTurnKey = turnKey;
            if (!noContact && (state.tomorrowland.active ? 200 : state.bpm) >= 50)
                result.bonusDamage = { formula: '1d6', types: ['trovejante'], source: 'Partitura Musical',
                    executionId: String(event.executionId ?? event.eventId ?? '') };
        }
        if (eligibleSingleTarget && state.requiem.pending && state.requiem.turnKey === turnKey) {
            state.requiem.pending = false;
            state.requiem.bisTargetUuid = String(event.targetUuid ?? '');
            state.requiem.bisExecutionId = String(event.executionId ?? event.eventId ?? '');
            result.maxDamageDice = 2;
            result.requiem = true;
        }
    }
    if ((event.type === 'targetDefeated' || (event.type === 'damageDealt' && event.defeated === true)) && state.requiem.bisTargetUuid &&
        event.targetUuid === state.requiem.bisTargetUuid &&
        (event.requiem === true || (event.executionId && event.executionId === state.requiem.bisExecutionId))) {
        if (!state.tomorrowland.active) state.bpm = bpmValue(state.bpm + 15);
        state.requiem.bisTargetUuid = '';
        state.requiem.bisExecutionId = '';
    }
    if (event.type === 'defense' && ['bloqueio', 'esquiva'].includes(label(event.defenseType))) {
        const estrondo = state.estrondo.pending && (!state.estrondo.targetUuid || !event.targetUuid || state.estrondo.targetUuid === event.targetUuid);
        if (estrondo) state.estrondo.pending = false;
        if (state.anticipation.pending && (!state.anticipation.targetUuid || !event.targetUuid || state.anticipation.targetUuid === event.targetUuid))
            state.anticipation.pending = false;
        if (event.success === true) {
            if (estrondo) {
                if (!state.tomorrowland.active) state.bpm = bpmValue(state.bpm + 20);
                state.defenseRoundKey = roundKey;
                if (event.targetUuid && (event.attackerWithin3m === true || (Number.isFinite(event.distanceMeters) && event.distanceMeters <= 3)))
                    result.counterDamage = { formula: '1d6', types: ['sonoro'], targetUuid: String(event.targetUuid),
                        saveAttr: 'VIT', saveDc: soundSaveDc(context.props), source: 'Defesa Sonora — Estrondo' };
            } else if (state.defenseRoundKey !== roundKey) {
                state.defenseRoundKey = roundKey;
                if (!state.tomorrowland.active) state.bpm = bpmValue(state.bpm + 15);
            }
        }
    }
    return result;
}

function soundSaveDc(props = {}) {
    const actor = { system: { props } };
    return 10 + (resolveSheetAttribute(actor, 'DEX') ?? 0) + (resolveSheetAttribute(actor, 'FDV') ?? 0);
}

export function soundPassiveBonuses(props = {}) {
    const state = parseSoundPassive(props[SOUND_PASSIVE_KEY]);
    const active = ruleVariant('respiracao') === 'homebrew' && hasScore(props);
    const bpm = state.tomorrowland.active ? 200 : state.bpm;
    const firstAttack = state.attackTurnKey !== state.turnKey || !state.turnKey;
    return {
        eligible: active, bpm: active ? bpm : 0,
        acerto: active && firstAttack && bpm >= 50 ? bpm >= 200 ? 3 : 2 : 0,
        bloqueio: active ? 1 + (state.estrondo.pending ? 3 : 0) + (state.anticipation.pending ? 2 : 0) : 0,
        esquiva: active ? 1 + (state.estrondo.pending ? 3 : 0) + (state.anticipation.pending ? 2 : 0) : 0,
        movement: active && bpm >= 100 ? 3 : 0,
        physicalReduction: active && bpm >= 150 ? 3 : 0,
        firstHitDamageFormula: active && bpm >= 50 && (!state.turnKey || state.firstHitTurnKey !== state.turnKey) ? '1d6' : '',
        nightcoreAvailable: active && bpm >= 100 && (!state.turnKey || state.nightcoreTurnKey !== state.turnKey),
        cancelAdvantageAvailable: active && bpm >= 150 && (!state.roundKey || state.cancelAdvantageRoundKey !== state.roundKey),
        tomorrowlandAvailable: active && bpm >= 200 && !state.tomorrowland.used,
        hearingRange: active ? 9 : 0,
    };
}

function currentContext() {
    const combat = globalThis.game?.combat;
    const combatId = String(combat?.uuid ?? combat?.id ?? '');
    return { active: combat?.started === true && !!combatId, combatId, round: combat?.round ?? 0,
        turn: combat?.turn ?? 0, actorTurnKey: `${combatId}:${combat?.round ?? 0}:${combat?.turn ?? 0}:${combat?.combatant?.id ?? ''}` };
}

const ACTIONS = Object.freeze({
    anticipation: { label: 'Antecipação Cinestésica', actionType: 'reacao', pdr: 2, bpm: 0, execute: true },
    estrondo: { label: 'Defesa Sonora — Estrondo', actionType: 'reacao', pdr: 0, bpm: 15 },
    requiem: { label: 'Requiem — O Grande Final', actionType: 'especial', pdr: 0, bpm: 35 },
    symphony: { label: 'Sinfonia Explosiva', actionType: 'ataque', pdr: 0, bpm: 40, execute: true },
    nightcore: { label: 'Ataque adicional — Nightcore', actionType: '', pdr: 0, bpm: 0, execute: true },
    cancelAdvantage: { label: 'Sinfonia Perfeita — Anular Vantagem', actionType: '', pdr: 0, bpm: 0, execute: true },
    tomorrowland: { label: 'Tomorrowland', actionType: 'completa', pdr: 0, bpm: 200, execute: true },
});

function eligibility(actor, action, options, context) {
    const config = ACTIONS[action];
    if (!actor?.update || (!actor.isOwner && !globalThis.game?.user?.isGM)) return 'Você não tem permissão para alterar esta ficha.';
    if (!config) return 'Técnica da Partitura inválida.';
    const props = actor.system?.props ?? {};
    if (!['npc', 'slayer'].includes(actorKind(actor)) || !hasScore(props))
        return 'Partitura Musical exige Respiração do Som e Audição Aguçada ou Sobrenatural.';
    if (!context.active) return 'Partitura Musical exige um combate em andamento.';
    const state = parseSoundPassive(props[SOUND_PASSIVE_KEY]);
    if (state.combatId !== context.combatId) return 'A Partitura ainda não foi iniciada neste combate.';
    if (state.tomorrowland.active) return 'Tomorrowland já está em resolução.';
    if (state.bpm < config.bpm) return `BPM insuficiente — exige ${config.bpm}.`;
    if (breathingPdrInfo(props).pdrCurrent < config.pdr) return `PDR insuficiente — exige ${config.pdr}.`;
    const roundKey = `${context.combatId}:${context.round}`;
    if (action === 'anticipation' && state.anticipationRoundKey === roundKey) return 'Antecipação já utilizada nesta rodada.';
    if (action === 'anticipation' && (options.perceivesAttacker !== true || !Number.isFinite(options.attackTotal)))
        return 'Antecipação exige perceber o atacante e informar seu Acerto.';
    if (action === 'estrondo' && state.estrondo.pending) return 'Estrondo já está preparado para uma defesa.';
    if (action === 'requiem' && state.requiem.used) return 'Requiem já foi utilizado neste combate.';
    if (action === 'tomorrowland' && state.tomorrowland.used) return 'Tomorrowland já foi utilizado neste combate.';
    if (action === 'nightcore' && (state.bpm < 100 || state.nightcoreTurnKey === context.actorTurnKey)) return 'Nightcore indisponível neste turno.';
    if (action === 'nightcore' && (options.baseActionType !== 'ataque' || parseActionState(props.acoes_slayer_dados).turn.ataque < 1))
        return 'Nightcore exige a Ação de Ataque já utilizada; não funciona com Completa ou Reação.';
    if (action === 'cancelAdvantage' && (state.bpm < 150 || state.cancelAdvantageRoundKey === roundKey))
        return 'Anular Vantagem exige 150 BPM e uma utilização disponível nesta rodada.';
    if (config.execute && typeof options.execute !== 'function') return 'O executor de rolagem desta técnica está indisponível.';
    if (['anticipation', 'estrondo', 'nightcore', 'tomorrowland', 'cancelAdvantage'].includes(action) && !options.targetUuid)
        return 'Marque como alvo o personagem envolvido nesta técnica.';
    return null;
}

function actionPlan(action, props, options) {
    const config = ACTIONS[action];
    const dc = soundSaveDc(props);
    const level = Math.min(4, Math.max(1, Math.trunc(parseNumber(props.nvl_respiracao_num ?? props.nvl_respiracao))));
    const common = { kind: action, action, actionType: config.actionType, label: config.label,
        targetUuid: options.targetUuid ?? '', skipActionConsumption: true };
    if (action === 'anticipation') return { ...common, saveAttr: 'SAB', saveDc: options.attackTotal, successDefenseBonus: 2 };
    if (action === 'estrondo') return { ...common, defenseBonus: 3, counterRangeMeters: 3,
        counterDamage: { dado: '1d6', tiposDano: ['sonoro'], saveAttr: 'VIT', saveDc: dc } };
    if (action === 'requiem') return { ...common, maxDamageDice: 2, singleTarget: true, expiresAtTurnEnd: true };
    if (action === 'nightcore') return { ...common, actionType: 'ataque', rollCount: 1, weaponRequired: true,
        hitBonus: -2, halfDamage: true, noPassiveGeneration: true, noContactEffects: true };
    if (action === 'cancelAdvantage') return { ...common, cancelAdvantage: true };
    if (action === 'symphony') return { ...common, area: 'cone', rangeMeters: 4.5, saveAttr: 'VIT', saveDc: dc,
        failedSaveCondition: 'desequilibrado', damageEntries: [
            { dado: '2d8', tipoAcao: 'ataque', tiposDano: ['concussao'], requiresHit: true },
            { dado: '2d6', tipoAcao: 'ataque', tiposDano: ['sonoro'], requiresHit: false, saveAttr: 'VIT', saveDc: dc, halfOnSave: true },
        ] };
    return { ...common, rollCount: 6, singleTarget: true, noPassiveGeneration: true,
        preserveScoreBenefits: true, damageEntries: [{ dado: ['1d4', '1d6', '1d8', '1d8'][level - 1],
            tipoAcao: 'completa', tiposDano: ['cortante'], requiresHit: true }],
        extraDamage: { dado: ['2d8', '3d8', '4d8', '4d10'][level - 1], tiposDano: ['sonoro'],
            saveAttr: 'VIT', saveDc: dc, halfOnSave: true, afterAttacks: true, always: true }, exhaustionGain: 2 };
}

async function anticipationOptions(options) {
    if (options.perceivesAttacker === true && Number.isFinite(options.attackTotal)) return options;
    const input = await foundry.applications.api.DialogV2.wait({
        window: { title: 'Antecipação Cinestésica' },
        content: '<label>Acerto do agressor <input type="number" name="sound-attack-total" required></label><label><input type="checkbox" name="sound-perceives"> Consigo perceber o atacante marcado como alvo</label>',
        buttons: [
            { action: 'use', label: 'Continuar', callback: (_event, button) => ({
                attackTotal: button.form.elements['sound-attack-total'].value.trim() === '' ? NaN : Number(button.form.elements['sound-attack-total'].value),
                perceivesAttacker: button.form.elements['sound-perceives'].checked === true,
            }) },
            { action: 'cancel', label: 'Cancelar', default: true, callback: () => false },
        ], rejectClose: false,
    });
    return input ? { ...options, ...input } : null;
}

async function finishTomorrowland(actor) {
    const props = actor.system?.props ?? {};
    const state = parseSoundPassive(props[SOUND_PASSIVE_KEY]);
    if (!state.tomorrowland.active) return state;
    state.tomorrowland.active = false;
    state.bpm = 0;
    const status = parseStatusState(props.status_slayer_dados);
    status.exhaustion = clampExhaustion(Math.max(status.exhaustion, parseNumber(props.status_slayer_exaustao)) + 2);
    await actor.update({ [`system.props.${SOUND_PASSIVE_KEY}`]: JSON.stringify(state),
        'system.props.status_slayer_dados': JSON.stringify(status),
        'system.props.status_slayer_resumo': formatStatusSummary(status.active, status.exhaustion),
        'system.props.status_slayer_exaustao': status.exhaustion,
    }, { naCsbAutomation: true, naBreathingPassive: true });
    return state;
}

export async function activateSoundPassive(actor, action, options = {}) {
    if (ruleVariant('respiracao') !== 'homebrew') return { ok: false, reason: 'Partitura Musical está desativada na versão de Respirações da mesa.' };
    const key = actor?.uuid ?? actor;
    if (pending.has(key)) return { ok: false, reason: 'A Partitura já está resolvendo uma técnica.' };
    pending.add(key);
    try {
        if (!actor?.update || (!actor.isOwner && !globalThis.game?.user?.isGM))
            return { ok: false, reason: 'Você não tem permissão para alterar esta ficha.' };
        options = { ...options, targetUuid: options.targetUuid ?? [...(globalThis.game?.user?.targets ?? [])][0]?.actor?.uuid ?? '' };
        if (action === 'anticipation') {
            options = await anticipationOptions(options);
            if (!options) return { ok: false, cancelled: true };
        }
        const before = currentContext();
        let reason = eligibility(actor, action, options, before);
        if (reason) return { ok: false, reason };
        const config = ACTIONS[action];
        if (options.confirm !== false && !await foundry.applications.api.DialogV2.confirm({
            window: { title: config.label },
            content: `<p>Usar ${config.label}? Custo ${config.bpm} BPM, ${config.pdr} PDR${config.actionType ? ` e Ação ${config.actionType}` : ''}.</p>${action === 'tomorrowland' ? '<p>Ao concluir, BPM zerado e +2 Exaustão.</p>' : ''}`,
            rejectClose: false,
        })) return { ok: false, cancelled: true };
        const context = currentContext();
        reason = eligibility(actor, action, options, context);
        if (reason || before.actorTurnKey !== context.actorTurnKey)
            return { ok: false, reason: reason ?? 'O turno mudou durante a confirmação.' };
        const props = actor.system?.props ?? {};
        const state = parseSoundPassive(props[SOUND_PASSIVE_KEY]);
        const actions = await consumeSlayerActions(actor, config.actionType ? [config.actionType] : [], { update: false });
        if (!actions.ok) return actions;
        state.turnKey = context.actorTurnKey;
        state.roundKey = `${context.combatId}:${context.round}`;
        state.bpm -= config.bpm;
        if (action === 'anticipation') state.anticipationRoundKey = state.roundKey;
        if (action === 'estrondo') state.estrondo = { pending: true, targetUuid: options.targetUuid };
        if (action === 'requiem') state.requiem = { used: true, pending: true, turnKey: state.turnKey, bisTargetUuid: '', bisExecutionId: '' };
        if (action === 'nightcore') state.nightcoreTurnKey = state.turnKey;
        if (action === 'cancelAdvantage') state.cancelAdvantageRoundKey = state.roundKey;
        if (action === 'tomorrowland') state.tomorrowland = { active: true, used: true };
        const { pdrSpent } = breathingResourceKeys(props);
        const patch = { ...actions.patch, [`system.props.${SOUND_PASSIVE_KEY}`]: JSON.stringify(state),
            ...(config.pdr ? { [`system.props.${pdrSpent}`]: parseNumber(props[pdrSpent]) + config.pdr } : {}) };
        const undo = Object.fromEntries(Object.keys(patch).map(path => [path, props[path.replace('system.props.', '')] ??
            (path.endsWith(pdrSpent) ? 0 : path.endsWith(SOUND_PASSIVE_KEY) ? JSON.stringify(parseSoundPassive(null)) : '')]));
        await actor.update(patch, { naCsbAutomation: true, naBreathingPassive: true });
        const plan = actionPlan(action, props, options);
        let execution;
        let refunded = false;
        let response;
        try {
            if (config.execute) execution = await options.execute(plan);
            if (config.execute && (!execution || execution.executed === false ||
                (execution.cancelled === true && execution.started === false))) {
                const unchanged = Object.entries(patch).every(([path, value]) => actor.system?.props?.[path.replace('system.props.', '')] === value);
                if (unchanged) {
                    await actor.update(undo, { naCsbAutomation: true, naBreathingPassive: true });
                    refunded = true;
                    return { ok: false, cancelled: true, refunded: true };
                }
                return { ok: false, cancelled: true, spent: true, reason: 'A ficha mudou durante a execução; os custos não foram revertidos.' };
            }
            if (action === 'anticipation' && execution?.success === true) {
                const current = parseSoundPassive(actor.system?.props?.[SOUND_PASSIVE_KEY]);
                current.anticipation = { pending: true, targetUuid: options.targetUuid };
                await actor.update({ [`system.props.${SOUND_PASSIVE_KEY}`]: JSON.stringify(current) },
                    { naCsbAutomation: true, naBreathingPassive: true });
            }
            response = { ok: true, state: parseSoundPassive(actor.system?.props?.[SOUND_PASSIVE_KEY]), plan, execution };
            return response;
        } finally {
            if (action === 'tomorrowland' && !refunded) {
                const finalState = await finishTomorrowland(actor);
                if (response) response.state = finalState;
            }
        }
    } finally {
        pending.delete(key);
    }
}

export async function openSoundPassiveManager(actor, options = {}) {
    if (ruleVariant('respiracao') !== 'homebrew') return { ok: false, reason: 'Partitura Musical está desativada na versão de Respirações da mesa.' };
    if (!actor?.update || (!actor.isOwner && !globalThis.game?.user?.isGM))
        return { ok: false, reason: 'Você não tem permissão para alterar esta ficha.' };
    const props = actor.system?.props ?? {};
    if (!hasScore(props)) return { ok: false, reason: 'Partitura exige Respiração do Som e Audição Aguçada ou Sobrenatural.' };
    const state = parseSoundPassive(props[SOUND_PASSIVE_KEY]);
    const action = await foundry.applications.api.DialogV2.wait({
        window: { title: 'Partitura Musical' },
        content: `<p><strong>${state.bpm}/200 BPM</strong></p><p>Os benefícios são cumulativos. Nightcore usa apenas a Ação de Ataque e não gera BPM nem efeitos de contato.</p><p>Marque o atacante ou o alvo antes de escolher a técnica. Ouvido Absoluto permite perceber a direção de sons até 9m, sujeito ao teste de SAB e à Furtividade.</p>`,
        buttons: [...Object.entries(ACTIONS).filter(([key]) => key !== 'nightcore' || options.baseActionType === 'ataque').map(([key, config]) => ({ action: key,
            label: `${config.label}${config.bpm ? ` (${config.bpm} BPM)` : config.pdr ? ` (${config.pdr} PDR)` : ''}`,
            callback: () => key })), { action: 'close', label: 'Fechar', default: true, callback: () => false }],
        rejectClose: false,
    });
    if (!action) return { ok: false, cancelled: true };
    const result = await activateSoundPassive(actor, action, { ...options, confirm: false });
    if (!result.ok && result.reason) globalThis.ui?.notifications?.warn?.(result.reason);
    return result;
}
