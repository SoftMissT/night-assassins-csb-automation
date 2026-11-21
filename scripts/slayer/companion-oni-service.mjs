import { consumeOniActions } from '../action-service.mjs';
import { actorKind } from '../actor-kind.mjs';
import { MODULE_ID, STATUS_SLAYER, TIPOS_DANO } from '../constants.mjs';
import { resolveActorReference } from '../core/combat-context.mjs';
import { parseNumber } from '../parsing.mjs';
import { ruleVariant } from '../rules-profile.mjs';
import { getDamageStatusEffects, getRollStatusEffects, isReactionBlocked } from '../status-effects.mjs';
import { parseStatusState, statusKeysForProps } from '../status-service.mjs';
import { classRankAtLevel, selectedSlayerClassKey } from './class-contracts.mjs';
import { companionOniRankPlan, companionOniSocialBonus } from './class-runtime.mjs';

const LINK = 'companionOni';
const GUARD = 'companionOniGuard';
const GUARD_USED = 'companionOniGuardUsed';
const LAST_HIT = 'companionOniHit';
const COORDINATED = 'companionOniCoordinated';
const COORDINATED_USED = 'companionOniCoordinatedUsed';
const RANKS = ['C', 'B', 'A', 'S', 'SS'];
const ongoing = new Set();
const escapeHtml = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;');

function readClass(actor) {
    if (!['slayer', 'npc'].includes(actorKind(actor))) return null;
    const props = actor.system.props;
    const profile = ruleVariant('classes');
    if (selectedSlayerClassKey(props, profile) !== 'classe_companheiro_oni') return null;
    const rank = classRankAtLevel(props.nvl_num ?? props.npc_nivel ?? props.nvl_pj, profile);
    return rank ? { rank, profile } : null;
}

function tokenFor(actor, tokens = globalThis.canvas?.tokens?.placeables ?? []) {
    if (!actor?.uuid) return null;
    return [...tokens].find(token => token.actor?.uuid === actor?.uuid);
}

function activeCombat() {
    const combat = globalThis.game?.combat;
    return combat?.started ? combat : null;
}

function sceneHasCombat() {
    const scene = globalThis.canvas?.scene ?? globalThis.game?.scenes?.active;
    return activeCombat() || [...(globalThis.game?.combats ?? [])].some(combat =>
        combat.started && scene?.id && (combat.scene?.id ?? combat.scene) === scene.id);
}

function useContext(combat) {
    return { combatId: combat.uuid ?? combat.id, round: combat.round, turn: combat.turn };
}

function baseActor(actor) {
    return actor?.isToken ? actor.token?.baseActor ?? globalThis.game?.actors?.get?.(actor.id) ?? actor : actor;
}

function currentSceneActor(base) {
    if (!base) return null;
    const entries = activeCombat()?.combatants ?? globalThis.canvas?.tokens?.placeables ?? [];
    const candidates = new Map([...entries].map(entry => entry.actor)
        .filter(actor => baseActor(actor)?.uuid === base.uuid)
        .map(actor => [actor.uuid, actor]));
    if (candidates.size > 1) return null;
    return candidates.values().next().value ?? base;
}

function linkedOni(actor) {
    const uuid = baseActor(actor)?.getFlag?.(MODULE_ID, LINK)?.oniUuid;
    const oni = [...(globalThis.game?.actors ?? [])].find(oni => oni.uuid === uuid && actorKind(oni) === 'oni');
    return currentSceneActor(oni);
}

function linkedSlayer(oni) {
    const uuid = baseActor(oni)?.uuid;
    if (!uuid) return null;
    const slayer = [...(globalThis.game?.actors ?? [])].find(slayer =>
        slayer.getFlag?.(MODULE_ID, LINK)?.oniUuid === uuid);
    return currentSceneActor(slayer);
}

function identifyDefender(actor, combat) {
    return combat?.combatants && [...combat.combatants].find(entry => entry.actor?.uuid === actor?.uuid);
}

export async function openCompanionOniManager({ actor, actorUuid } = {}) {
    if (!globalThis.game?.user?.isGM)
        return ui.notifications?.warn?.('O GM configura o vínculo do Companheiro de Oni.');
    actor = await resolveActorReference(actor ?? actorUuid) ?? globalThis.canvas?.tokens?.controlled?.[0]?.actor;
    if (!readClass(actor)) return ui.notifications?.warn?.('A ficha precisa ter Companheiro de Oni e Rank C.');
    const configActor = baseActor(actor);
    const current = configActor.getFlag?.(MODULE_ID, LINK) ?? {};
    const oniActors = [...(game.actors ?? [])].filter(oni => actorKind(oni) === 'oni' &&
        ![...(game.actors ?? [])].some(other => other.uuid !== configActor.uuid &&
            other.getFlag?.(MODULE_ID, LINK)?.oniUuid === oni.uuid));
    const oniOptions = oniActors.map(oni => '<option value="' + escapeHtml(oni.uuid) + '"' +
        (oni.uuid === current.oniUuid ? ' selected' : '') + '>' + escapeHtml(oni.name) + '</option>').join('');
    const resistanceOptions = TIPOS_DANO.map(type => '<option value="' + escapeHtml(type.key) + '"' +
        (type.key === current.resistance ? ' selected' : '') + '>' + escapeHtml(type.label) + '</option>').join('');
    const combat = activeCombat();
    const oni = linkedOni(actor);
    const attackers = combat && oni ? [...combat.combatants].map(entry => entry.actor)
        .filter(other => other && other.uuid !== actor.uuid && other.uuid !== oni.uuid) : [];
    const defenseFields = attackers.length ? '<label>Atacante <select name="attacker">' +
        '<option value="">Escolha</option>' + attackers.map(other => '<option value="' + escapeHtml(other.uuid) +
            '">' + escapeHtml(other.name) + '</option>').join('') +
        '</select></label><label>Total do Acerto contra a defesa falha <input name="dc" type="number" min="1"></label>' : '';
    const selection = await foundry.applications.api.DialogV2.wait({
        window: { title: 'Companheiro de Oni' },
        content: '<label>Oni <select name="oni"><option value="">Sem vínculo</option>' + oniOptions +
            '</select></label><label>Resistência a partir do Rank A <select name="resistance">' +
            '<option value="">Nenhuma</option>' + resistanceOptions + '</select></label>' + defenseFields,
        rejectClose: false,
        buttons: [
            { action: 'save', label: 'Salvar', callback: (_event, { form }) => ({
                oniUuid: form.elements.oni.value,
                resistance: form.elements.resistance.value,
            }) },
            ...(attackers.length ? [{ action: 'intercept', label: 'Interceptar após falha',
                callback: (_event, { form }) => ({ attackerUuid: form.elements.attacker.value,
                    dc: Number(form.elements.dc.value) }),
            }] : []),
            { action: 'close', label: 'Cancelar', callback: () => null },
        ],
    });
    if (!selection || !game.user.isGM || !readClass(actor)) return null;
    if ('attackerUuid' in selection) {
        if (!selection.attackerUuid || !(selection.dc > 0))
            return ui.notifications?.warn?.('Escolha o atacante e informe o total de Acerto.');
        return offerCompanionInterception(actor, selection);
    }
    if (!selection.oniUuid) return configActor.unsetFlag(MODULE_ID, LINK);
    if (!oniActors.some(oni => oni.uuid === selection.oniUuid) ||
        [...game.actors].some(other => other.uuid !== configActor.uuid &&
            other.getFlag?.(MODULE_ID, LINK)?.oniUuid === selection.oniUuid))
        return ui.notifications?.warn?.('O Oni escolhido não está disponível para vínculo.');
    if (selection.resistance && !TIPOS_DANO.some(type => type.key === selection.resistance)) return null;
    return configActor.setFlag(MODULE_ID, LINK, selection);
}

export function companionSocialBonus(actor) {
    const selected = readClass(actor);
    if (!selected || sceneHasCombat()) return 0;
    const oni = linkedOni(actor);
    if (!oni || !tokenFor(oni) || !tokenFor(actor) || getDamageStatusEffects(oni.system.props).blocked) return 0;
    return companionOniSocialBonus(selected.rank, selected.profile);
}

export function companionResistance(oni) {
    const slayer = linkedSlayer(oni);
    const selected = readClass(slayer);
    const resistance = baseActor(slayer)?.getFlag?.(MODULE_ID, LINK)?.resistance;
    return RANKS.indexOf(selected?.rank) >= 2 && TIPOS_DANO.some(type => type.key === resistance)
        ? resistance : '';
}

async function interceptionPlan(slayer, attackerUuid) {
    const selected = readClass(slayer);
    const oni = linkedOni(slayer);
    const combat = activeCombat();
    const slayerEntry = identifyDefender(slayer, combat);
    const oniEntry = identifyDefender(oni, combat);
    const enemy = [...(combat?.combatants ?? [])].find(entry => entry.actor?.uuid === attackerUuid);
    if (!selected || !slayerEntry || !oniEntry || !enemy || enemy === slayerEntry || enemy === oniEntry) return null;
    if (!game.user.isGM && (!slayer.isOwner || !oni.isOwner)) return null;
    const ownToken = slayerEntry.token?.object ?? tokenFor(slayer);
    const oniToken = oniEntry.token?.object ?? tokenFor(oni);
    const grid = globalThis.canvas?.grid;
    if (!ownToken?.center || !oniToken?.center || typeof grid?.measurePath !== 'function') return null;
    const distance = grid.measurePath([oniToken.center, ownToken.center]).distance;
    const movementCollision = oniToken.checkCollision?.(ownToken.center, { type: 'move', mode: 'any' });
    if (!Number.isFinite(distance) || distance > 3 || movementCollision) return null;
    const props = oni.system.props;
    const paralyzed = getRollStatusEffects(props, { attr: 'DEX', kind: 'test' }).autoFail;
    if (isReactionBlocked(props) || paralyzed || getDamageStatusEffects(props).blocked) return null;
    const scope = useContext(combat);
    const last = oni.getFlag?.(MODULE_ID, GUARD);
    if (last?.combatId === scope.combatId && last.round === scope.round) return null;
    const c = companionOniRankPlan('C', selected.profile);
    const b = companionOniRankPlan('B', selected.profile);
    const cost = c.reactionPdk ?? c.cost.pdk;
    const modifier = selected.rank === 'C' ? c.defenseModifier ?? c.defensePenalty :
        b.defenseModifier ?? b.defensePenalty;
    const spent = parseNumber(props.pdk_oni_gasto_valor);
    const current = props.pdk_oni_total_conta === undefined
        ? parseNumber(props.pdk_oni_atual_num)
        : parseNumber(props.pdk_oni_total_conta) + parseNumber(props.pdk_oni_curado) +
            parseNumber(props.pdk_oni_extra) - spent;
    if (current < cost) return null;
    const action = await consumeOniActions(oni, 'reacao', { update: false });
    if (!action.ok) return null;
    const enemyTurn = combat.turns?.findIndex(entry => entry.id === enemy.id) ?? -1;
    return { oni, scope, selected, modifier, enemyTurn, patch: {
        ...action.patch, 'system.props.pdk_oni_gasto_valor': spent + cost,
    } };
}

export async function offerCompanionInterception(slayer, { attackerUuid, dc, rollDefense }) {
    if (!attackerUuid || !Number.isFinite(dc) || dc <= 0 || !readClass(slayer)) return null;
    const preview = await interceptionPlan(slayer, attackerUuid);
    if (!preview || ongoing.has(preview.oni.uuid)) return null;
    ongoing.add(preview.oni.uuid);
    try {
        const defense = await foundry.applications.api.DialogV2.wait({
            window: { title: 'Cercar & Proteger' },
            content: '<p>' + escapeHtml(preview.oni.name) + ' pode tentar interceptar um acerto, gastando ' +
                '1 Reação e 2 PDK. Confirme que o ataque pode ser interceptado fisicamente.</p>',
            rejectClose: false,
            buttons: [
                { action: 'block', label: 'Bloqueio', callback: () => 'Bloqueio' },
                { action: 'dodge', label: 'Esquiva', callback: () => 'Esquiva' },
                { action: 'skip', label: 'Recusar', callback: () => null },
            ],
        });
        if (!defense) return null;
        const plan = await interceptionPlan(slayer, attackerUuid);
        if (!plan || plan.oni !== preview.oni || plan.scope.combatId !== preview.scope.combatId ||
            plan.scope.round !== preview.scope.round || plan.scope.turn !== preview.scope.turn) return null;
        let defended;
        if (rollDefense) defended = await rollDefense(plan.oni, defense, dc, plan.modifier);
        else {
            const { rollTest } = await import('../roll-service.mjs');
            defended = await rollTest({
                actor: plan.oni,
                test: defense,
                attr: defense === 'Bloqueio' ? 'for' : 'dex',
                forceDc: dc,
                attackerUuid,
                companionDefense: true,
                companionDefenseModifier: plan.modifier,
            });
        }
        if (!defended) return null;
        const fresh = await interceptionPlan(slayer, attackerUuid);
        if (!fresh || fresh.oni !== plan.oni || fresh.selected.profile !== plan.selected.profile ||
            fresh.selected.rank !== plan.selected.rank || fresh.scope.combatId !== plan.scope.combatId ||
            fresh.scope.round !== plan.scope.round || fresh.scope.turn !== plan.scope.turn) return null;
        const success = defended.success === true;
        const { round, turn } = fresh.scope;
        const enemyTurn = fresh.enemyTurn;
        const guard = success && fresh.selected.profile === 'homebrew' &&
            fresh.selected.rank !== 'C' && enemyTurn >= 0 ? {
                round: round + (enemyTurn > turn ? 0 : 1), turn: enemyTurn,
            } : null;
        await fresh.oni.update({
            ...fresh.patch,
            ['flags.' + MODULE_ID + '.' + GUARD]: {
                ...fresh.scope, slayerUuid: slayer.uuid, attackerUuid, pending: success,
                profile: fresh.selected.profile, guard, dc,
            },
        }, { naCsbAutomation: true, naCompanionOni: true });
        if (fresh.selected.profile !== 'vanilla' && fresh.selected.rank !== 'C')
            ui.notifications?.info?.('Reposicionamento Protetor: o Oni pode mover até 1,5m conforme a regra.');
        return { success, oni: fresh.oni };
    } finally {
        ongoing.delete(preview.oni.uuid);
    }
}

export function companionGuardKey(attacker, slayer) {
    const combat = activeCombat();
    const selected = readClass(slayer);
    if (!combat || selected?.profile !== 'homebrew' || selected.rank === 'C') return '';
    const state = linkedOni(slayer)?.getFlag?.(MODULE_ID, GUARD);
    const { combatId, round, turn } = useContext(combat);
    if (state?.pending !== false || !state.guard || state.combatId !== combatId ||
        state.profile !== selected.profile || state.slayerUuid !== slayer.uuid ||
        state.attackerUuid !== attacker.uuid ||
        round > state.guard.round || (round === state.guard.round && turn >= state.guard.turn)) return '';
    const key = [combatId, state.round, state.turn, slayer.uuid].join(':');
    return attacker.getFlag?.(MODULE_ID, GUARD_USED)?.[slayer.uuid] === key ? '' : key;
}

export async function consumeCompanionGuard(attacker, slayer, key) {
    if ((!attacker.isOwner && !game.user?.isGM) || companionGuardKey(attacker, slayer) !== key) return;
    await attacker.setFlag(MODULE_ID, GUARD_USED, {
        ...attacker.getFlag?.(MODULE_ID, GUARD_USED), [slayer.uuid]: key,
    });
}

function oniTurnCycle(oni, combat) {
    const ownTurn = combat.turns?.findIndex(entry => entry.actor?.uuid === oni.uuid) ?? -1;
    return ownTurn < 0 ? -1 : combat.round - Number(combat.turn < ownTurn);
}

function pairCanCoordinate(slayer, oni, target, combat) {
    const pair = [slayer, oni];
    if (pair.some(actor => !actor || actor.uuid === target.uuid) ||
        ![...pair, target].every(actor => identifyDefender(actor, combat) && tokenFor(actor)))
        return false;
    return pair.every(actor => !getDamageStatusEffects(actor.system.props).blocked);
}

function continuousEffects(target) {
    const dataKey = statusKeysForProps(target.system.props).data;
    const state = parseStatusState(target.system.props[dataKey]);
    const choices = state.active.filter(key => state.effects[key]?.remainingTurns > 0 &&
        state.effects[key].damageFormula && !state.effects[key].companionExtended);
    return { dataKey, state, choices };
}

export async function registerCoordinatedHit(actor, target, { breathing = false } = {}) {
    const combat = activeCombat();
    if (!combat || !target || (!actor.isOwner && !game.user.isGM)) return;
    const oniHit = actorKind(actor) === 'oni';
    if (!oniHit && !breathing) return;
    const slayer = oniHit ? linkedSlayer(actor) : actor;
    const selected = readClass(slayer);
    if (selected?.profile !== 'homebrew' || selected.rank !== 'SS') return;
    const oni = oniHit ? actor : linkedOni(slayer);
    if (!pairCanCoordinate(slayer, oni, target, combat)) return;
    const scope = useContext(combat);
    const cycle = oniTurnCycle(oni, combat);
    if (cycle < 0) return;
    if (oniHit) {
        const hits = oni.getFlag?.(MODULE_ID, LAST_HIT);
        const targets = hits?.combatId === scope.combatId && hits.cycle === cycle ? hits.targets : [];
        return oni.setFlag(MODULE_ID, LAST_HIT, {
            combatId: scope.combatId, cycle, targets: [...new Set([...targets, target.uuid])],
        });
    }
    const hits = oni.getFlag?.(MODULE_ID, LAST_HIT);
    const previous = slayer.getFlag?.(MODULE_ID, COORDINATED);
    if (hits?.combatId !== scope.combatId || hits.cycle !== cycle || !hits.targets?.includes(target.uuid) ||
        (previous?.combatId === scope.combatId && previous.round === scope.round) ||
        ongoing.has(slayer.uuid)) return;
    ongoing.add(slayer.uuid);
    try {
        const effects = (target.isOwner || game.user.isGM) ? continuousEffects(target) : null;
        const options = effects?.choices.map(key => '<option value="' + escapeHtml(key) + '">' +
            escapeHtml(STATUS_SLAYER.find(status => status.key === key)?.label) + '</option>').join('') ?? '';
        const decision = await foundry.applications.api.DialogV2.wait({
            window: { title: 'Ataque Coordenado' },
            content: '<p>Confirme que os dois percebem o alvo e que o Oni ainda está aliado e pode agir por vontade própria.</p>' +
                (options ? '<label>Efeito para Rastro de Sangue <select name="effect">' + options + '</select></label>' : ''),
            rejectClose: false,
            buttons: [
                { action: 'pressure', label: 'Pressão Conjunta (−1 na Defesa)', callback: () => ({ mode: 'pressure' }) },
                ...(options ? [{ action: 'trail', label: 'Rastro de Sangue (+1 rodada)',
                    callback: (_event, { form }) => ({ mode: 'trail', effect: form.elements.effect.value }) }] : []),
                { action: 'opening', label: 'Abertura Demoníaca (+1 no Acerto)', callback: () => ({ mode: 'opening' }) },
                { action: 'skip', label: 'Recusar', callback: () => null },
            ],
        });
        const current = activeCombat();
        const currentClass = readClass(slayer);
        if (!['pressure', 'trail', 'opening'].includes(decision?.mode) || current !== combat ||
            current.round !== scope.round || current.turn !== scope.turn || currentClass?.rank !== 'SS' ||
            currentClass.profile !== 'homebrew' || linkedOni(slayer)?.uuid !== oni.uuid ||
            !pairCanCoordinate(slayer, oni, target, current)) return;
        if (decision.mode === 'trail') {
            if (!target.isOwner && !game.user.isGM) return;
            const effect = continuousEffects(target);
            if (!effect.choices.includes(decision.effect)) return;
            effect.state.effects[decision.effect].remainingTurns += 1;
            effect.state.effects[decision.effect].companionExtended = true;
            await target.update({
                ['system.props.' + effect.dataKey]: JSON.stringify(effect.state),
            }, { naCsbAutomation: true, naCompanionOni: true });
        }
        await slayer.setFlag(MODULE_ID, COORDINATED, {
            ...scope, mode: decision.mode, slayerUuid: slayer.uuid, oniUuid: oni.uuid, targetUuid: target.uuid,
        });
        ui.notifications?.info?.('Ataque Coordenado aplicado em ' + target.name + '.');
    } finally {
        ongoing.delete(slayer.uuid);
    }
}

export function pendingCompanionCoordination(mode, actor, otherUuid) {
    const combat = activeCombat();
    if (!combat || ruleVariant('classes') !== 'homebrew' || !otherUuid) return '';
    const combatId = combat.uuid ?? combat.id;
    const candidates = mode === 'opening' ? [linkedSlayer(actor)] :
        [...(game.actors ?? [])].map(currentSceneActor);
    for (const slayer of candidates) {
        const entry = slayer?.getFlag?.(MODULE_ID, COORDINATED);
        if (entry?.mode !== mode || entry.combatId !== combatId || readClass(slayer)?.rank !== 'SS' ||
            linkedOni(slayer)?.uuid !== entry.oniUuid) continue;
        const validOpponent = mode === 'opening'
            ? entry.oniUuid === actor.uuid && entry.targetUuid === otherUuid
            : entry.targetUuid === actor.uuid && [entry.slayerUuid, entry.oniUuid].includes(otherUuid);
        if (!validOpponent) continue;
        const key = [combatId, entry.round, entry.turn, slayer.uuid].join(':');
        if (actor.getFlag?.(MODULE_ID, COORDINATED_USED)?.[slayer.uuid] !== key)
            return { key, slayerUuid: slayer.uuid };
    }
    return '';
}

export async function consumeCompanionCoordination(actor, entry) {
    if (!entry || (!actor.isOwner && !game.user?.isGM)) return;
    await actor.setFlag(MODULE_ID, COORDINATED_USED, {
        ...actor.getFlag?.(MODULE_ID, COORDINATED_USED), [entry.slayerUuid]: entry.key,
    });
}

export function pendingCompanionInterception(slayer, context = {}) {
    const combat = activeCombat();
    const selected = readClass(slayer);
    if (!combat || !selected || context.isAttack !== true || context.hostile !== true ||
        !context.sourceActorUuid) return null;
    const oni = linkedOni(slayer);
    const state = oni?.getFlag?.(MODULE_ID, GUARD);
    if (state?.pending !== true || state.slayerUuid !== slayer.uuid || state.profile !== selected.profile ||
        state.attackerUuid !== context.sourceActorUuid) return null;
    if (Number.isFinite(context.attackTotal) && context.attackTotal !== state.dc) return null;
    const scope = useContext(combat);
    return state.combatId === scope.combatId && state.round === scope.round && state.turn === scope.turn
        ? { oni, state, key: 'flags.' + MODULE_ID + '.' + GUARD } : null;
}
