import { breathingPdrInfo, breathingPdvInfo, breathingResourceKeys } from '../actor-resources.mjs';
import { actorKind } from '../actor-kind.mjs';
import { consumeSlayerActions } from '../action-service.mjs';
import { chosenBreathing } from '../breathing-choice.mjs';
import { canonicalBreathing } from '../breathing-contract.mjs';
import { MODULE_ID } from '../constants.mjs';
import { flameTurnKey } from '../flame-breathing-service.mjs';
import { ruleVariant } from '../rules-profile.mjs';
import { parseNumber } from '../parsing.mjs';
import { getDamageStatusEffects } from '../status-effects.mjs';
import { parseStatusState, statusKeysForProps } from '../status-service.mjs';
import { classRankAtLevel } from './class-contracts.mjs';
import { planDualBreathingComposite, planDualBreathingPosture, planDualBreathingUse } from './dual-breathing-hybrid-rules.mjs';
import { approveDualBreathingComposite, dualBreathingCompositeCatalog } from './dual-breathing-registry.mjs';
import { secondaryBreathingForActor } from './dual-breathing-service.mjs';

const FLAG = 'dualBreathingPosture';
const compositePending = new WeakSet();
const mixes = { form: 'Forma', movement: 'Movimento', condition: 'Condição',
    defense: 'Defesa', 'conditional-execution': 'Execução condicional' };
const prices = { 'once-per-combat': 'Uma vez por combate', 'internal-damage': '+2 PDV de dano interno',
    'end-posture': 'Encerra a Forma Intermediária', 'lock-secondary': 'Trava a Secundária até o próprio turno',
    'full-action': 'Ação Completa', 'target-condition': 'Exige condição no alvo',
    'next-defense-disadvantage': 'Desvantagem na próxima defesa (manual)', 'exhaustion-on-fail': '+1 Exaustão se falhar (manual)' };
const escapeHtml = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;');

function postureContext(actor) {
    const props = actor?.system?.props;
    const profile = ruleVariant('classes');
    const rank = classRankAtLevel(props?.nvl_num ?? props?.npc_nivel ?? props?.nvl_pj, profile);
    const combat = globalThis.game?.combat;
    const turnKey = flameTurnKey(combat);
    if (!turnKey || profile !== 'homebrew' || !['S', 'SS'].includes(rank) || !secondaryBreathingForActor(actor))
        return null;
    return {
        profile, rank, combatKey: combat.uuid ?? combat.id, turnKey,
        incapacitated: getDamageStatusEffects(props).blocked ||
            parseStatusState(props[statusKeysForProps(props).data]).active.includes('paralisia'),
        pdrAvailable: breathingPdrInfo(props).pdrCurrent,
        pdvAvailable: breathingPdvInfo(props).pdvCurrent,
    };
}

export function canManageDualBreathingPosture(actor) {
    return Boolean(postureContext(actor));
}

function getState(actor) {
    return actor.getFlag?.(MODULE_ID, FLAG) ?? actor.flags?.[MODULE_ID]?.[FLAG];
}

export function planPostureTechniqueUse(actor, { breathing, variation, actions, pdrCost, pdvCost, reservedPdr = 0 } = {}) {
    const context = postureContext(actor);
    if (!context) return null;
    const school = canonicalBreathing(breathing);
    const side = school === chosenBreathing(actor.system.props) ? 'primary' :
        school === secondaryBreathingForActor(actor) ? 'secondary' : null;
    if (!side) return null;
    const distinctActions = [...new Set(actions ?? [])];
    const action = distinctActions.length > 1 ? 'completa' : distinctActions[0] ?? 'livre';
    const state = getState(actor);
    const lock = state?.combatKey === context.combatKey ? state.secondaryLockUntil : null;
    const combat = globalThis.game.combat;
    if (lock && (variation || side === 'secondary') &&
        (combat.round < lock.round || (combat.round === lock.round && combat.turn < lock.turn)))
        return { ok: false, reason: 'Respiração Secundária bloqueada até o próximo turno do personagem.' };
    const result = planDualBreathingUse(state, {
        ...context, side, kind: variation ? 'variation' : 'technique', action,
        pdrAvailable: context.pdrAvailable + reservedPdr, pdrCost, pdvCost,
        grantsExtraAttack: variation && variation.grantsExtraAttack === true,
    });
    if (!result.ok) return result;
    return { ...result, patch: { [`flags.${MODULE_ID}.${FLAG}`]: result.state } };
}

export async function openDualBreathingPosture(actor) {
    if (!actor?.isOwner && !globalThis.game?.user?.isGM) return null;
    const context = postureContext(actor);
    if (!context) return globalThis.ui.notifications.warn('Forma Intermediária exige Rank S e combate ativo.');
    const choice = await globalThis.foundry.applications.api.DialogV2.wait({
        window: { title: 'Forma Intermediária' },
        content: `<label>Modo <select name="mode">
            <option value="sequence">Sequência</option>
            <option value="alternation">Alternância</option>
            <option value="overload">Sobrecarga (+1 PDV por Variação)</option>
            <option value="fixed-stance">Postura Fixa</option>
        </select></label><label>Perda da Postura Fixa (aplique na mesa) <select name="loss">
            <option value="">Escolha</option><option value="movement">Movimento</option>
            <option value="defense">Defesa</option><option value="reach">Alcance</option>
        </select></label>`,
        buttons: [
            { action: 'activate', label: 'Ativar', callback: (_event, button) => ({
                mode: button.form.elements.mode.value, fixedLoss: button.form.elements.loss.value,
            }) },
            { action: 'end', label: 'Encerrar', callback: () => ({ mode: null }) },
            { action: 'cancel', label: 'Cancelar', callback: () => null },
        ],
        rejectClose: false,
    });
    if (!choice) return null;
    const live = postureContext(actor);
    if (!live || live.combatKey !== context.combatKey ||
        (!actor.isOwner && !globalThis.game?.user?.isGM)) return null;
    const result = planDualBreathingPosture(getState(actor), { ...live, ...choice });
    if (!result.ok) return globalThis.ui.notifications.warn(result.reason);
    await actor.setFlag(MODULE_ID, FLAG, result.state);
    globalThis.ui.notifications.info(choice.mode === null ? 'Forma Intermediária encerrada.' :
        result.state.waitingForSequence ? 'Sequência preparada. Use uma técnica de cada Respiração.' : 'Forma Intermediária ativa.');
    return result;
}

export function registerDualBreathingPostureEngine() {
    Hooks.on('updateActor', (actor, _changes, _options, userId) => {
        if (userId !== globalThis.game?.user?.id || !actor.isOwner) return;
        const state = getState(actor);
        if (!state?.active && !state?.waitingForSequence) return;
        const context = postureContext(actor);
        if (context && state.combatKey === context.combatKey && !context.incapacitated && context.pdrAvailable > 0) return;
        return actor.setFlag(MODULE_ID, FLAG, { ...state, active: false, waitingForSequence: false, lastSide: null });
    });
}

export async function useDualBreathingComposite(actor, primaryLevel) {
    if ((!actor?.isOwner && !globalThis.game?.user?.isGM) || !actor?.update)
        return { ok: false, reason: 'Você não pode usar esta ficha.' };
    if (compositePending.has(actor)) return { ok: false, reason: 'Forma Composta já em andamento.' };
    const combat = globalThis.game?.combat;
    const context = postureContext(actor);
    const catalog = dualBreathingCompositeCatalog(actor, primaryLevel);
    const record = catalog?.record;
    if (!context || !record || combat?.combatant?.actor?.uuid !== actor.uuid)
        return { ok: false, reason: 'Forma Composta exige registro aprovado e turno próprio em combate.' };
    const sourceFor = (saved, side) => catalog.sources.find(source =>
        source.side === side && source.key === saved?.key && source.formId === saved.formId && source.breathing === saved.breathing);
    const targets = [...(globalThis.game.user.targets ?? [])].map(token => token.actor).filter(Boolean);
    const targetProps = targets.length === 1 ? targets[0].system?.props ?? {} : {};
    const targetMeetsCondition = targets.length === 1 &&
        parseStatusState(targetProps[statusKeysForProps(targetProps).data]).active.includes(record.price.condition);
    const props = actor.system.props;
    const surcharge = getDamageStatusEffects(props).pdrSurcharge ?? 0;
    const plan = planDualBreathingComposite(getState(actor), {
        ...context, pdrAvailable: Math.max(0, context.pdrAvailable - surcharge),
        primary: sourceFor(record.primary, 'primary'), secondary: sourceFor(record.secondary, 'secondary'),
        secondaryLevel: catalog.secondaryLevel, compatibility: catalog.compatibility,
        mixType: record.mixType, price: record.price, targetMeetsCondition,
    });
    if (!plan.ok) return plan;
    compositePending.add(actor);
    try {
        const action = await consumeSlayerActions(actor, [plan.action], { update: false });
        if (!action.ok) return action;
        if (flameTurnKey(globalThis.game.combat) !== context.turnKey)
            return { ok: false, reason: 'O turno mudou. Abra a Forma Composta de novo.' };
        const live = actor.system.props;
        const liveContext = postureContext(actor);
        const liveState = getState(actor);
        const cost = plan.cost.pdr + surcharge;
        if (!liveContext || liveContext.incapacitated || liveContext.pdrAvailable < cost ||
            liveContext.pdvAvailable < plan.cost.pdv ||
            (liveState?.combatKey === context.combatKey && liveState.compositeUsed === true))
            return { ok: false, reason: 'As condições de uso da Forma Composta mudaram.' };
        const spent = breathingResourceKeys(live).pdrSpent;
        const damage = actorKind(actor) === 'npc' ? 'npc_pdv_dano' : 'pdv_slayer_dano_tomado';
        if (record.price.type === 'lock-secondary')
            plan.state.secondaryLockUntil = { round: combat.round + 1, turn: combat.turn };
        await actor.update({
            ...action.patch,
            [`system.props.${spent}`]: parseNumber(live[spent]) + cost,
            ...(plan.cost.pdv ? { [`system.props.${damage}`]: parseNumber(live[damage]) + plan.cost.pdv } : {}),
            [`flags.${MODULE_ID}.${FLAG}`]: plan.state,
        }, { naCsbAutomation: true, naBreathForm: true });
        await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
            content: `<p><strong>${escapeHtml(record.name)}</strong> · ${cost} PDR + ${plan.cost.pdv} PDV · ${escapeHtml(prices[record.price.type])}</p>
                <p>Resolva na mesa: ${escapeHtml(record.target)} · ${escapeHtml(record.effect)}</p>` });
        return plan;
    } finally {
        compositePending.delete(actor);
    }
}

export async function openDualBreathingComposite(actor, getPrimaryLevel) {
    const catalog = dualBreathingCompositeCatalog(actor, getPrimaryLevel());
    if (!catalog || (!actor.isOwner && !game.user?.isGM)) return null;
    const options = entries => entries.map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`).join('');
    const sources = side => options(catalog.sources.filter(source => source.side === side)
        .map(source => [source.key, `${source.label} · Nível ${source.level}`]));
    const record = catalog.record;
    const fields = [['name', 'Nome'], ['target', 'Alvo ou área'], ['effect', 'Efeito combinado a resolver na mesa'],
        ['description', 'Descrição'], ['condition', 'Chave do status (preço por condição)']];
    const result = await foundry.applications.api.DialogV2.wait({
        window: { title: 'Forma Composta' },
        content: `${record ? `<p><strong>${escapeHtml(record.name)}</strong> · ${escapeHtml(prices[record.price.type])}</p><p>${escapeHtml(record.effect)}</p>`
            : '<p>Nenhuma Forma Composta aprovada.</p>'}
            ${game.user.isGM ? `<label>Primária <select name="primary">${sources('primary')}</select></label>
                <label>Secundária <select name="secondary">${sources('secondary')}</select></label>
                <label>Mistura <select name="mixType">${options(Object.entries(mixes))}</select></label>
                <label>Preço <select name="price">${options(Object.entries(prices))}</select></label>
                ${fields.map(([key, label]) => `<label>${label} <input name="${key}" maxlength="1000"></label>`).join('')}` : ''}`,
        rejectClose: false,
        buttons: [
            ...(record ? [{ action: 'use', label: 'Usar Forma Composta', callback: () => 'use' }] : []),
            ...(game.user.isGM ? [{ action: 'save', label: 'Aprovar registro', callback: (_event, button) =>
                Object.fromEntries([...fields.map(([key]) => key), 'primary', 'secondary', 'mixType', 'price']
                    .map(key => [key, button.form.elements[key].value])) }] : []),
            { action: 'cancel', label: 'Fechar', callback: () => null },
        ],
    });
    if (!result) return null;
    const outcome = result === 'use' ? await useDualBreathingComposite(actor, getPrimaryLevel()) :
        await approveDualBreathingComposite(actor, result, getPrimaryLevel());
    if (!outcome.ok) ui.notifications.warn(outcome.reason);
    return outcome;
}
