import { actorKind } from '../actor-kind.mjs';
import { breathingPdrInfo, breathingPdvInfo, breathingResourceKeys } from '../actor-resources.mjs';
import { consumeSlayerActions } from '../action-service.mjs';
import { MODULE_ID } from '../constants.mjs';
import { resolveActorReference } from '../core/combat-context.mjs';
import { parseLifeDeathState, formatLifeDeathSummary } from '../life-death-service.mjs';
import { parseNumber } from '../parsing.mjs';
import { ruleVariant } from '../rules-profile.mjs';
import { resolveSheetAttribute } from '../sheet-attributes.mjs';
import { formatStatusSummary, parseStatusState, statusKeysForProps } from '../status-service.mjs';
import { classRankAtLevel, selectedSlayerClassKey } from './class-contracts.mjs';
import { kakushiAmpararHeal, kakushiTatakaaeeeRoll } from './class-runtime.mjs';
import { USER_POISON_STATE_KEY, userPoisonHealingAmount } from './poison-user-service.mjs';

const STATE = 'kakushiUses';
const EFFECT = 'kakushiEffect';
const ranks = ['C', 'B', 'A', 'S', 'SS'];
const actions = { amparar: ['Amparar', 'C'], retirada: ['Desengajar', 'A'], adrenalina: ['Injeção de Adrenalina', 'S'] };
const pulses = { corpo: 'Firmar o Corpo', mente: 'Clarear a Mente', levantar: 'Levantar Agora' };
const incapacitating = ['atordoamento', 'paralisia', 'inconsciente', 'inconsciencia'];
const working = new Set();
const warning = (reason) => ({ ok: false, reason });
const canEdit = (actor) => Boolean(actor?.update && (actor.isOwner || globalThis.game?.user?.isGM));
const statuses = (props) => parseStatusState(props[statusKeysForProps(props).data]);
const escapeHtml = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

function kakushiRank(actor) {
    const props = actor?.system?.props ?? {};
    if (!['slayer', 'npc'].includes(actorKind(actor)) || selectedSlayerClassKey(props) !== 'classe_kakushi') return null;
    return classRankAtLevel(props.nvl_num ?? props.npc_nivel ?? props.nvl_pj);
}

function tokenFor(actor) {
    return actor.token?.object ?? actor.getActiveTokens?.()[0] ?? null;
}

function touchAllowed(actor, target, override) {
    if (actor.uuid === target.uuid) return true;
    if (override && globalThis.game?.user?.isGM) return true;
    const sourceToken = tokenFor(actor);
    const targetToken = tokenFor(target);
    if (!sourceToken?.center || !targetToken?.center || sourceToken.document?.parent !== targetToken.document?.parent) return false;
    if (sourceToken.document?.disposition !== targetToken.document?.disposition) return false;
    const distance = globalThis.canvas?.grid?.measurePath?.([sourceToken.center, targetToken.center])?.distance;
    return Number.isFinite(distance) && distance <= 1.5 &&
        !sourceToken.checkCollision?.(targetToken.center, { type: 'move', mode: 'any' });
}

function expiryFor(actor, combat) {
    const turn = combat?.turns?.findIndex(combatant => combatant.actor?.uuid === actor.uuid) ?? -1;
    if (turn < 0 || !Number.isInteger(combat.turn)) return null;
    return { combatId: combat.id, turn, round: combat.round + Number(turn <= combat.turn) };
}

function activeEffect(actor) {
    const effect = actor?.getFlag?.(MODULE_ID, EFFECT);
    const combat = globalThis.game?.combat;
    if (ruleVariant('classes') !== 'homebrew' || !effect || effect.combatId !== combat?.id) return null;
    const turn = combat.turns?.findIndex(combatant => combatant.actor?.uuid === actor.uuid) ?? -1;
    if (turn < 0 || combat.round > effect.round || (combat.round === effect.round && combat.turn >= turn)) return null;
    return effect;
}

export function kakushiRollEffect(actor, { testType, physicalSave, condition } = {}) {
    const effect = activeEffect(actor);
    const type = String(testType ?? '').toLowerCase();
    const defense = ['bloqueio', 'esquiva'].includes(type);
    const mental = ['medo', 'amedrontado', 'confusao', 'confusão', 'controle_mental'].includes(condition);
    return {
        bonus: Number(
            (defense && effect?.defense) ||
            (physicalSave && effect?.pulse === 'corpo') ||
            (mental && effect?.pulse === 'mente')
        ) || 0,
        advantage: effect?.advantage === true,
        pulse: effect?.pulse,
    };
}

export async function consumeKakushiAdvantage(actor) {
    const effect = activeEffect(actor);
    if (effect?.advantage && canEdit(actor)) await actor.setFlag(MODULE_ID, EFFECT, { ...effect, advantage: false });
}

function healthPatch(props, targetKind, amount, stabilize) {
    const { pdvMax, pdvRaw } = breathingPdvInfo(props);
    const key = breathingResourceKeys(props).pdvHealed;
    const heal = pdvMax > 0 ? Math.max(0, Math.min(pdvMax - pdvRaw, amount)) : 0;
    const patch = heal ? { [`system.props.${key}`]: parseNumber(props[key]) + heal } : {};
    const life = parseLifeDeathState(props.vida_morte_slayer_dados);
    if (stabilize && targetKind === 'slayer' && life.dying && pdvRaw <= 0 && pdvMax > 0) {
        life.stabilized = true;
        patch['system.props.vida_morte_slayer_dados'] = JSON.stringify(life);
        patch['system.props.vida_morte_slayer_resumo'] = formatLifeDeathSummary(life);
    }
    return { patch, heal };
}

export async function useKakushi({ actor, target = actor, action, attribute, pulse, tataka, override, assisted } = {}) {
    const rank = kakushiRank(actor);
    if (!canEdit(actor) || !rank || !Object.hasOwn(actions, action) || ranks.indexOf(rank) < ranks.indexOf(actions[action][1]))
        return warning('Habilidade indisponível nesta ficha ou rank.');
    const combat = globalThis.game?.combat;
    if (!combat?.started || !combat.id || combat.combatant?.actor?.uuid !== actor.uuid)
        return warning('Use a habilidade durante o turno do Kakushi.');
    if (working.has(actor.uuid)) return warning('Já existe uma habilidade Kakushi em andamento.');
    working.add(actor.uuid);
    try {
        const props = actor.system.props;
        const homebrew = ruleVariant('classes') === 'homebrew';
        const previous = actor.getFlag?.(MODULE_ID, STATE) ?? {};
        const state = previous.combatId === combat.id ? { ...previous } : { combatId: combat.id };
        const round = combat.round;
        if (statuses(props).active.some(key => incapacitating.includes(key)))
            return warning('O Kakushi não consegue agir neste estado.');
        if (action === 'amparar' && state.amparar === round) return warning('Amparar já foi usado nesta rodada.');
        if (action === 'adrenalina' && state.adrenalina) return warning('Adrenalina já foi usada neste combate.');
        const targetKind = actorKind(target);
        const targetProps = target?.system?.props ?? {};
        if (action === 'retirada' && !assisted) target = actor;
        if (action === 'retirada' && assisted) {
            if (!homebrew || target.uuid === actor.uuid || !['slayer', 'npc'].includes(targetKind) ||
                !touchAllowed(actor, target, override) || statuses(targetProps).active.some(key => incapacitating.includes(key)) ||
                parseLifeDeathState(targetProps.vida_morte_slayer_dados).dead)
                return warning('Retirada Assistida exige um aliado adjacente capaz de se mover.');
            const { pdvMax, pdvCurrent } = breathingPdvInfo(targetProps);
            if (pdvMax > 0 && pdvCurrent <= pdvMax / 2) {
                state.priorityTarget = target.uuid;
                state.priorityRound = round + 1;
            }
        }
        if (action !== 'retirada') {
            if (!canEdit(target)) return warning('Peça ao GM para aplicar a habilidade neste aliado.');
            if (!['slayer', 'npc'].includes(targetKind) || parseLifeDeathState(targetProps.vida_morte_slayer_dados).dead)
                return warning('Este alvo não pode receber a habilidade.');
            if (!['INT', 'SAB'].includes(attribute) || !touchAllowed(actor, target, override))
                return warning('Escolha INT ou SAB e um aliado ao alcance de toque.');
            const { pdvMax, pdvCurrent } = breathingPdvInfo(targetProps);
            if (action === 'amparar' && pdvCurrent >= pdvMax)
                return warning('O alvo precisa estar com PDV abaixo do máximo.');
            if (action === 'adrenalina' && homebrew && !Object.hasOwn(pulses, pulse))
                return warning('Escolha o Pulso de Sobrevivência.');
        }
        const getAction = () => consumeSlayerActions(actor, [action === 'retirada' ? 'especial' : 'ataque'], { update: false });
        let consumed = await getAction();
        if (!consumed.ok) return consumed;
        let amount = 0;
        let success = false;
        let roll = null;
        if (action !== 'retirada') {
            const attr = resolveSheetAttribute(actor, attribute.toLowerCase());
            amount = action === 'amparar' ? kakushiAmpararHeal(rank, attr) : Math.max(0, attr + resolveSheetAttribute(target, 'vit'));
            if (homebrew && action === 'amparar' && state.priorityTarget === target.uuid && round <= state.priorityRound) {
                amount += 2;
                state.priorityTarget = '';
            }
            if (tataka && rank === 'SS' && actor.uuid !== target.uuid && (!homebrew || state.tataka !== round)) {
                const test = kakushiTatakaaeeeRoll(resolveSheetAttribute(actor, 'car'));
                roll = await new Roll(`1d20 + ${test.car}`).evaluate();
                success = Number(roll.total) >= test.threshold;
                if (success) amount += test.bonus;
                state.tataka = round;
                if (combat.round !== round || combat.combatant?.actor?.uuid !== actor.uuid)
                    return warning('O turno mudou durante a rolagem.');
                consumed = await getAction();
                if (!consumed.ok) return consumed;
            }
        }
        const freshTarget = target.system.props;
        const targetPatch = {};
        if (action === 'amparar') {
            amount = userPoisonHealingAmount(freshTarget[USER_POISON_STATE_KEY], amount);
            const health = healthPatch(freshTarget, targetKind, amount, homebrew);
            Object.assign(targetPatch, health.patch);
            amount = health.heal;
            state.amparar = round;
        } else if (action === 'adrenalina') {
            const { pdrMax, pdrCurrent } = breathingPdrInfo(freshTarget);
            const key = breathingResourceKeys(freshTarget).pdrRecovered;
            const recovered = parseNumber(freshTarget[key]);
            amount = Math.min(pdrMax - pdrCurrent, amount);
            if (amount > 0) targetPatch[`system.props.${key}`] = recovered + amount;
            if (homebrew && pulse === 'levantar' && breathingPdvInfo(freshTarget).pdvCurrent === 0) {
                const { pdvRaw } = breathingPdvInfo(freshTarget);
                Object.assign(targetPatch, healthPatch(freshTarget, targetKind, Math.max(1, 1 - pdvRaw), true).patch);
            }
            state.adrenalina = true;
        }
        const expiry = homebrew && action !== 'retirada' ? expiryFor(target, combat) : null;
        if (expiry) {
            const current = activeEffect(target);
            targetPatch[`flags.${MODULE_ID}.${EFFECT}`] = {
                ...expiry,
                defense: Boolean(current?.defense || (action === 'amparar' && amount > 0 && rank !== 'C' && actor.uuid !== target.uuid)),
                pulse: action === 'adrenalina' ? pulse : current?.pulse ?? '',
                advantage: Boolean(current?.advantage || success),
            };
        }
        const actorPatch = { ...consumed.patch, [`flags.${MODULE_ID}.${STATE}`]: state };
        const options = { naCsbAutomation: true, naActionEconomy: true };
        if (actor.uuid === target.uuid) await actor.update({ ...actorPatch, ...targetPatch }, options);
        else {
            const sourceProps = { ...actor.system.props };
            await actor.update(actorPatch, options);
            try {
                if (Object.keys(targetPatch).length) await target.update(targetPatch, { naCsbAutomation: true });
            } catch (error) {
                await actor.update({
                    ...Object.fromEntries(Object.keys(consumed.patch).map(key => [key, sourceProps[key.slice('system.props.'.length)] ?? ''])),
                    [`flags.${MODULE_ID}.${STATE}`]: previous,
                }, options);
                throw error;
            }
        }
        const title = actions[action][0];
        const effect = action === 'retirada' ? (assisted
            ? 'Ação Especial usada. Mova o aliado até 1,5 m sem Ataque de Oportunidade.'
            : 'Ação Especial usada. Resolva o deslocamento de Desengajar no mapa.') :
            action === 'amparar' ? `${amount} PDV de cura` : `${amount} PDR recuperados${homebrew ? ` · ${pulses[pulse]}` : ''}`;
        const revealed = homebrew && action === 'amparar' && rank !== 'C' && actor.uuid !== target.uuid
            ? escapeHtml(formatStatusSummary(statuses(freshTarget).active, statuses(freshTarget).exhaustion)) : '';
        if (roll) await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: 'Tatakaaaaeee! · CD 15' });
        await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<strong>${title}</strong> · ${escapeHtml(target.name)} · ${effect}` });
        if (revealed) globalThis.ui?.notifications?.info(revealed);
        return { ok: true, amount, success };
    } finally {
        working.delete(actor.uuid);
    }
}

export async function openKakushiManager({ actorUuid, actor } = {}) {
    actor = await resolveActorReference(actor ?? actorUuid);
    const rank = kakushiRank(actor);
    if (!canEdit(actor) || !rank) return globalThis.ui?.notifications?.warn('Escolha uma ficha Kakushi com rank desbloqueado.');
    const targets = [...(globalThis.game.user.targets ?? [])].map(token => token.actor).filter(Boolean);
    const candidates = [...new Map([actor, ...targets].map(entry => [entry.uuid, entry])).values()];
    const options = (entries) => entries.map(([key, label]) => `<option value="${key}">${escapeHtml(label)}</option>`).join('');
    const homebrew = ruleVariant('classes') === 'homebrew';
    const buttons = Object.entries(actions).filter(([, [, required]]) => ranks.indexOf(rank) >= ranks.indexOf(required))
        .map(([action, [label]]) => ({
            action, label, callback: (_event, button) => {
                const form = button.form.elements;
                return { action, target: candidates[Number(form.target.value)], attribute: form.attr.value,
                    pulse: form.pulse?.value, tataka: form.tataka?.checked, override: form.override?.checked, assisted: form.assisted?.checked };
            },
        }));
    const choice = await foundry.applications.api.DialogV2.wait({
        window: { title: 'Kakushi' },
        content: `<label>Alvo <select name="target">${options(candidates.map((entry, index) => [index, entry.name]))}</select></label>
            <label>Atributo <select name="attr"><option>INT</option><option>SAB</option></select></label>
            ${homebrew && ranks.indexOf(rank) >= 3 ? `<label>Pulso de Sobrevivência <select name="pulse">${options(Object.entries(pulses))}</select></label>` : ''}
            ${rank === 'SS' ? '<label><input type="checkbox" name="tataka"> Tatakaaaaeee!</label>' : ''}
            ${homebrew && ranks.indexOf(rank) >= 2 ? '<label><input type="checkbox" name="assisted"> Retirada Assistida com o aliado escolhido</label>' : ''}
            ${game.user.isGM ? '<label><input type="checkbox" name="override"> Autorizar aliado ou alcance excepcional</label>' : ''}`,
        buttons, rejectClose: false,
    });
    if (!choice?.target) return null;
    const result = await useKakushi({ actor, ...choice });
    if (!result.ok) ui.notifications.warn(result.reason);
    return result;
}
