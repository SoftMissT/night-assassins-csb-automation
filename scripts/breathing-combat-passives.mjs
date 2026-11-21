import { MODULE_ID } from './constants.mjs';
import { hasBreathingPassive } from './breathing-passive-rules.mjs';
import { parseNumber } from './parsing.mjs';
import { breathingPdvInfo, breathingResourceKeys } from './actor-resources.mjs';
import { parseStatusState, formatStatusSummary } from './status-service.mjs';
import { FOX_PASSIVE_KEY, parseFoxPassive, reduceFoxPassive, foxPassiveBonuses, openFoxPassiveManager } from './fox-passive-service.mjs';
import { METAL_FORGE_KEY, parseMetalForge, reduceMetalForge, metalForgeBonuses, openMetalForgeManager } from './metal-forge-passive.mjs';
import { WIND_CURRENT_KEY, parseWindCurrent, reduceWindCurrent, windCurrentBonuses, openWindCurrentManager } from './wind-current-passive.mjs';
import { SOUND_PASSIVE_KEY, parseSoundPassive, reduceSoundPassive, soundPassiveBonuses, openSoundPassiveManager } from './sound-passive-service.mjs';
import { isHomebrewExtra, ruleVariant } from './rules-profile.mjs';

const locks = new Map();
const descriptors = [
    ['Raposa', FOX_PASSIVE_KEY, parseFoxPassive, reduceFoxPassive, 'raposa'],
    ['Metal', METAL_FORGE_KEY, parseMetalForge, reduceMetalForge, 'forja_viva'],
    ['Vento', WIND_CURRENT_KEY, parseWindCurrent, reduceWindCurrent, 'corrente'],
    ['Som', SOUND_PASSIVE_KEY, parseSoundPassive, reduceSoundPassive, 'respiracao'],
];
let sequence = 0;
export const PASSIVE_DAMAGE_KEY = 'resp_passivas_dano_pendente';

export function passiveExecutionId(actor) {
    return `${actor.uuid ?? actor.id}:${Date.now()}:${++sequence}`;
}

export function breathingPassiveContext(actor, combat = globalThis.game?.combat) {
    const combatId = combat?.started === false ? '' : String(combat?.uuid ?? combat?.id ?? '');
    return { props: actor.system?.props ?? {}, actorUuid: actor.uuid, combatId,
        round: combat?.round ?? 0, turn: combat?.turn ?? 0,
        actorTurnKey: `${combatId}:${combat?.round ?? 0}:${combat?.turn ?? 0}:${combat?.combatant?.id ?? ''}` };
}

export function combatPassiveBonuses(props = {}, options = {}) {
    return { fox: foxPassiveBonuses(props), metal: metalForgeBonuses(props),
        wind: windCurrentBonuses(props, options), sound: soundPassiveBonuses(props) };
}

export function pendingPassiveDamage(props = {}, executionId = '') {
    let entries;
    try { entries = JSON.parse(props[PASSIVE_DAMAGE_KEY] || '[]'); } catch { entries = []; }
    return Array.isArray(entries) ? entries.filter(entry => entry && entry.executionId === executionId &&
        (entry.source === 'Metal Branco' ? isHomebrewExtra('forja_viva') :
            ['Partitura Musical', 'Requiem'].includes(entry.source) ? ruleVariant('respiracao') === 'homebrew' : true)) : [];
}

export async function recordBreathingPassiveEvent(actor, event = {}, overrides = {}) {
    if (!actor?.update) return {};
    if (!actor.isOwner && !globalThis.game?.user?.isGM) {
        if (event.sourceActorUuid && globalThis.game?.socket)
            game.socket.emit(`module.${MODULE_ID}`, { type: 'breathingPassiveEvent', actorUuid: actor.uuid,
                requesterId: game.user.id, event });
        return {};
    }
    const key = actor.uuid ?? actor;
    const previous = locks.get(key) ?? Promise.resolve();
    const task = previous.catch(() => {}).then(async () => {
        const context = { ...breathingPassiveContext(actor), ...overrides, props: actor.system?.props ?? {} };
        const extraEnabled = extra => extra === 'respiracao'
            ? ruleVariant('respiracao') === 'homebrew' : isHomebrewExtra(extra);
        const patch = {};
        const effects = [];
        for (const [breathing, property, parse, reduce, extra] of descriptors) {
            if (!extraEnabled(extra)) continue;
            if (!hasBreathingPassive(context.props, breathing) && !context.props[property]) continue;
            if (!hasBreathingPassive(context.props, breathing) && !['turnStart', 'combatEnd'].includes(event.type)) continue;
            if (event.type === 'turnStart' && event.isActorTurn === false && ['Metal', 'Vento'].includes(breathing)) continue;
            if (event.type === 'miss' && ((breathing === 'Raposa' && !event.incoming) || (breathing === 'Som' && event.incoming))) continue;
            let state = parse(context.props[property]);
            let initialExhaustion = 0;
            if (context.combatId && state.combatId !== context.combatId && event.type !== 'combatEnd') {
                const initial = reduce(state, { type: 'combatStart' }, context);
                state = initial.state;
                initialExhaustion = Number(initial.exhaustionGain) || 0;
            }
            const result = reduce(state, event, context);
            if (initialExhaustion) result.exhaustionGain = (Number(result.exhaustionGain) || 0) + initialExhaustion;
            if (JSON.stringify(result.state) !== JSON.stringify(parse(context.props[property])))
                patch[`system.props.${property}`] = JSON.stringify(result.state);
            effects.push(result);
        }
        const exhaustionGain = effects.reduce((sum, effect) => sum + (Number(effect.exhaustionGain) || 0), 0);
        if (exhaustionGain > 0) {
            const status = parseStatusState(context.props.status_slayer_dados);
            status.exhaustion = Math.min(8, Math.max(status.exhaustion, parseNumber(context.props.status_slayer_exaustao)) + exhaustionGain);
            Object.assign(patch, { 'system.props.status_slayer_dados': JSON.stringify(status),
                'system.props.status_slayer_exaustao': status.exhaustion,
                'system.props.status_slayer_resumo': formatStatusSummary(status.active, status.exhaustion) });
        }
        const bonusDamage = effects.flatMap(effect => effect.bonusDamage ? [effect.bonusDamage] : []);
        for (const effect of effects) if (effect.maxDamageDice > 0)
            bonusDamage.push({ maxDamageDice: effect.maxDamageDice, requiem: effect.requiem === true, source: 'Requiem' });
        if (bonusDamage.length && event.executionId) {
            const pending = pendingPassiveDamage(context.props, event.executionId);
            patch[`system.props.${PASSIVE_DAMAGE_KEY}`] = JSON.stringify([...pending, ...bonusDamage.map(entry => ({
                ...entry, executionId: event.executionId,
            }))]);
        }
        if (context.props[PASSIVE_DAMAGE_KEY] && ['combatEnd', 'turnStart'].includes(event.type) && (event.isActorTurn || event.type === 'combatEnd'))
            patch[`system.props.${PASSIVE_DAMAGE_KEY}`] = '';
        if (context.props.resp_passivas_defesa_forma && ['combatEnd', 'turnStart'].includes(event.type) && (event.isActorTurn || event.type === 'combatEnd'))
            patch['system.props.resp_passivas_defesa_forma'] = '';
        const healing = effects.reduce((sum, effect) => sum + Math.max(0, Number(effect.healAmount) || 0), 0);
        if (healing) {
            const life = breathingPdvInfo(context.props);
            const { pdvHealed } = breathingResourceKeys(context.props);
            patch[`system.props.${pdvHealed}`] = parseNumber(context.props[pdvHealed]) +
                Math.min(healing, Math.max(0, life.pdvMax - life.pdvCurrent));
        }
        if (Object.keys(patch).length) await actor.update(patch, { naCsbAutomation: true, naCombatPassives: true });
        return { effects, bonusDamage, healing };
    });
    locks.set(key, task);
    let result;
    try { result = await task; } finally { if (locks.get(key) === task) locks.delete(key); }
    for (const effect of result.effects ?? []) {
        if (effect.counterDamage?.targetUuid) {
            const { executePassiveDamage } = await import('./combat-passive-execution.mjs');
            await executePassiveDamage(actor, effect.counterDamage);
        }
        if (effect.reflectionDamage > 0 && effect.reflectionTargetUuid) {
            const document = await fromUuid(effect.reflectionTargetUuid);
            const target = document?.actor ?? document;
            if (target) {
                const { applyOniDamage, applySlayerDamageAuto } = await import('./damage-relay.mjs');
                const { isSlayerActor } = await import('./actor-kind.mjs');
                await (isSlayerActor(target) ? applySlayerDamageAuto : applyOniDamage)(target, effect.reflectionDamage,
                    { isAttack: false, attackName: 'Reflexo de Metal Branco', damageTypes: ['concussao'],
                        components: [{ types: ['concussao'], subtotal: effect.reflectionDamage }] });
            }
        }
        const distraction = effect.applyDistraction ?? effect.offerDistraction;
        if (distraction && (effect.applyDistraction || await foundry.applications.api.DialogV2.confirm({
            window: { title: 'Caudas Enganadoras' }, content: '<p>Aplicar Distraído ao inimigo que errou o ataque?</p>', rejectClose: false,
        }))) {
            if (effect.offerDistraction)
                await recordBreathingPassiveEvent(actor, { ...event, activateDistraction: true }, overrides);
            else {
                const document = await fromUuid(distraction.targetUuid);
                const target = document?.actor ?? document;
                const { applyBreathingStatus } = await import('./breath-service.mjs');
                if (target) await applyBreathingStatus(target, 'distraido', { remainingTurns: 1, tick: 'start', sourceName: 'Caudas Enganadoras' },
                    { source: actor, eventId: event.eventId });
            }
        }
    }
    return result;
}

export function registerCombatPassiveEngine() {
    if (!descriptors.some(([, , , , extra]) => extra === 'respiracao'
        ? ruleVariant('respiracao') === 'homebrew' : isHomebrewExtra(extra))) return;
    const primary = () => globalThis.game?.user?.isGM && [...(game.users ?? [])]
        .filter(user => user.isGM && user.active).sort((a, b) => String(a.id).localeCompare(String(b.id)))[0]?.id === game.user.id;
    const processing = new Map();
    const process = async combat => {
        if (!primary()) return;
        const turnKey = `${combat.id}:${combat.round}:${combat.turn}:${combat.started}`;
        if (combat.getFlag?.(MODULE_ID, 'passiveTurn') === turnKey) return;
        const actors = [...new Map([...(combat.combatants ?? [])].filter(c => c.actor).map(c => [c.actor.uuid, c.actor])).values()];
        const previous = combat.getFlag?.(MODULE_ID, 'passiveActor');
        if (previous) {
            const actor = actors.find(candidate => candidate.uuid === previous);
            if (actor) await recordBreathingPassiveEvent(actor, { type: 'turnEnd' }, breathingPassiveContext(actor, combat));
        }
        for (const actor of actors)
            await recordBreathingPassiveEvent(actor, { type: combat.started ? 'turnStart' : 'combatEnd',
                isActorTurn: actor.uuid === combat.combatant?.actor?.uuid }, breathingPassiveContext(actor, combat));
        await combat.setFlag(MODULE_ID, 'passiveTurn', turnKey);
        await combat.setFlag(MODULE_ID, 'passiveActor', combat.combatant?.actor?.uuid ?? '');
    };
    const processTurn = combat => {
        const key = combat.uuid ?? combat.id;
        const task = (processing.get(key) ?? Promise.resolve()).then(() => process(combat));
        processing.set(key, task);
        void task.catch(error => ui.notifications.error(error.message)).finally(() => {
            if (processing.get(key) === task) processing.delete(key);
        });
    };
    Hooks.on('updateCombat', (combat, changes) => {
        if (['turn', 'round', 'started', 'active'].some(key => Object.hasOwn(changes, key))) processTurn(combat);
    });
    const endCombat = async combat => {
        if (!primary()) return;
        await Promise.allSettled([...(combat.combatants ?? [])].filter(c => c.actor).map(c =>
            recordBreathingPassiveEvent(c.actor, { type: 'combatEnd' }, breathingPassiveContext(c.actor, combat))));
    };
    Hooks.on('combatEnd', endCombat);
    Hooks.on('deleteCombat', endCombat);
    game.socket?.on?.(`module.${MODULE_ID}`, async message => {
        if (!primary() || message?.type !== 'breathingPassiveEvent' || message.event?.type !== 'miss') return;
        const requester = game.users.get?.(message.requesterId);
        const sourceDoc = await fromUuid(String(message.event.sourceActorUuid ?? ''));
        const source = sourceDoc?.actor ?? sourceDoc;
        if (!requester || !source?.testUserPermission?.(requester, 'OWNER')) return;
        const targetDoc = await fromUuid(String(message.actorUuid ?? ''));
        const target = targetDoc?.actor ?? targetDoc;
        const combat = game.combat;
        const actors = new Set([...(combat?.combatants ?? [])].map(c => c.actor?.uuid));
        if (combat?.started && target?.uuid !== source.uuid && actors.has(source.uuid) && actors.has(target?.uuid))
            await recordBreathingPassiveEvent(target, { type: 'miss', targetUuid: source.uuid,
            incoming: true, sourceActorUuid: source.uuid, eventId: String(message.event.eventId ?? '').slice(0, 160) });
    });
}

export async function openBreathingPassiveManager({ actor, actorUuid } = {}) {
    if (!actor && actorUuid) { const doc = await fromUuid(actorUuid); actor = doc?.actor ?? doc; }
    actor ??= globalThis.canvas?.tokens?.controlled?.[0]?.actor ?? game.user?.character;
    if (!actor?.update || (!actor.isOwner && !game.user?.isGM)) return ui.notifications.warn('Escolha uma ficha que você possa controlar.');
    const choices = [
        ['Raposa', openFoxPassiveManager], ['Metal', openMetalForgeManager],
        ['Vento', openWindCurrentManager], ['Som', openSoundPassiveManager],
    ].filter(([name]) => hasBreathingPassive(actor.system?.props, name) &&
        (name === 'Raposa' ? isHomebrewExtra('raposa') : name === 'Metal' ? isHomebrewExtra('forja_viva') :
            name === 'Vento' ? isHomebrewExtra('corrente') : ruleVariant('respiracao') === 'homebrew'));
    if (!choices.length) return ui.notifications.info('Esta Respiração não possui um recurso adicional de combate.');
    let selected = choices[0];
    if (choices.length > 1) {
        const choice = await foundry.applications.api.DialogV2.wait({ window: { title: 'Passivas da Respiração' },
            buttons: choices.map(([name]) => ({ action: name, label: name, callback: () => name })), rejectClose: false });
        selected = choices.find(([name]) => name === choice);
    }
    if (!selected) return;
    const { executeCombatPassive } = await import('./combat-passive-execution.mjs');
    return selected[1](actor, { ...breathingPassiveContext(actor), execute: plan => executeCombatPassive(actor, plan) });
}
