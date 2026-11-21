/** Respiração da Recuperação — Kaifuku no Kokyu. */
import { consumeSlayerActions } from './action-service.mjs';
import { actorKind } from './actor-kind.mjs';
import { MASTER_BATTLE_BLEEDING } from './constants.mjs';
import { parseNumber } from './parsing.mjs';
import { resolveSheetAttribute } from './sheet-attributes.mjs';
import { getDamageStatusEffects } from './status-effects.mjs';
import { formatStatusSummary, parseStatusState } from './status-service.mjs';
import { breathingPdvInfo, breathingPdrInfo } from './actor-resources.mjs';
export const RECOVERY_STATE_KEY = 'resp_recuperacao_estado';
const NORMAL_RECOVERY_RATIO = 0.75;
const normalRecoveryInProgress = new Set();
const RECOVERY_CHOICE_LABELS = Object.freeze({
    pdv: 'Só PDV',
    pdr: 'Só PDR',
    both: 'PDV e PDR',
});
const LEVELS = Object.freeze([
    { maxLevel: 3, pdv: '2d8', pdr: '1d6', dc: 16 },
    { maxLevel: 7, pdv: '3d8', pdr: '2d6', dc: 17 },
    { maxLevel: 11, pdv: '4d8', pdr: '3d6', dc: 18 },
    { maxLevel: 14, pdv: '5d8', pdr: '4d6', dc: 19 },
]);
const n = (value) => Math.max(0, Math.trunc(parseNumber(value)));
const isNpcProps = (props = {}) => actorKind({ system: { props } }) === 'npc';
// Nível do personagem (1–14): Slayer em `nvl_num`, NPC em `npc_nivel`.
const levelOf = (props = {}) =>
    Math.min(14, Math.max(1, n(isNpcProps(props) ? props.npc_nivel : props.nvl_num) || 1));
const healKeys = (props = {}) =>
    isNpcProps(props)
        ? { pdv: 'system.props.npc_pdv_curado', pdr: 'system.props.npc_pdr_recuperado' }
        : { pdv: 'system.props.pdv_slayer_curado', pdr: 'system.props.pdr_slayer_curado' };
const attr = (props, key) => n(resolveSheetAttribute({ system: { props } }, key) ?? props[key]);
export const RECOVERY_FORMS = Object.freeze({
    recuperacao: {
        formId: 'recuperacao',
        label: 'Respiração da Recuperação',
        action: 'especial',
        test: true,
        cost: 0,
    },
});
export function recoveryBreathingLevel(props = {}) {
    return levelOf(props);
}
export function hasRecoveryBreathing(actor) {
    const props = actor?.system?.props ?? {};
    return isNpcProps(props) || actor?.type === 'slayer' || props.nvl_num !== undefined;
}
export function recoveryFormDefinition(formId = 'recuperacao', level) {
    const normalized = formId === 'coagulação' || formId === 'coagulacao' ? 'recuperacao' : formId;
    if (normalized !== 'recuperacao') return null;
    const current = Math.min(14, Math.max(1, n(level) || 1));
    const { pdv, pdr, dc } = LEVELS.find(({ maxLevel }) => current <= maxLevel);
    return {
        ...RECOVERY_FORMS.recuperacao,
        level: current,
        pdv,
        pdr,
        dc,
        available: true,
    };
}

function activeCombatId() {
    return globalThis.game?.combat?.id ?? 'fora-combate';
}
export function parseRecoveryState(value, currentCombatId = activeCombatId()) {
    const fallback = {
        version: 1,
        combatId: currentCombatId,
        attempted: false,
        succeeded: false,
        lastChanceUsed: false,
    };
    if (!value) return fallback;
    try {
        const parsed = typeof value === 'string' ? JSON.parse(value) : value;
        if (!parsed || parsed.combatId !== currentCombatId) return fallback;
        return {
            ...fallback,
            attempted: parsed.attempted === true,
            succeeded: parsed.succeeded === true,
            lastChanceUsed: parsed.lastChanceUsed === true,
        };
    } catch {
        return fallback;
    }
}

function statePatch(state) {
    return {
        [`system.props.${RECOVERY_STATE_KEY}`]: JSON.stringify(state),
    };
}
export function currentRecoveryResources(props = {}) {
    const { pdvMax, pdvRaw, pdvCurrent: pdv } = breathingPdvInfo(props);
    const { pdrMax, pdrCurrent: pdr } = breathingPdrInfo(props);
    return {
        pdvMax,
        pdvRaw,
        pdv,
        pdrMax,
        pdr,
    };
}
export function recoveryOutcome({
    props = {},
    success,
    pdvRoll = 0,
    pdrRoll = 0,
    naturalTwenty = false,
    recoveryState,
    currentCombatId = activeCombatId(),
    lastChance = false,
}) {
    const level = levelOf(props);
    const def = recoveryFormDefinition('recuperacao', level);
    const resources = currentRecoveryResources(props);
    const status = parseStatusState(props.status_slayer_dados);
    const previous = parseRecoveryState(
        recoveryState ?? props[RECOVERY_STATE_KEY],
        currentCombatId
    );
    const state = {
        ...previous,
        combatId: currentCombatId,
        attempted: true,
        succeeded: success === true || previous.succeeded,
        lastChanceUsed: lastChance || previous.lastChanceUsed,
    };
    const patch = currentCombatId === null ? {} : statePatch(state);
    const summary = [];
    if (!success) {
        if (lastChance) summary.push('falhou: a Reação foi gasta');
        else if (currentCombatId !== null)
            summary.push('falhou: a Ação Especial foi gasta e pode tentar novamente');
        else summary.push('falhou: pode tentar novamente enquanto cumprir as condições');
        return {
            patch,
            summary,
            def,
            state,
        };
    }
    const ratio = lastChance ? 1 : NORMAL_RECOVERY_RATIO;
    const pdvGain = Math.floor(n(pdvRoll) * ratio);
    const pdrGain = Math.floor((n(pdrRoll) + (naturalTwenty ? 2 * level : 0)) * ratio);
    const pdvApplied = Math.min(Math.max(0, resources.pdvMax - resources.pdv), pdvGain);
    const pdrApplied = Math.min(Math.max(0, resources.pdrMax - resources.pdr), pdrGain);
    const keys = healKeys(props);
    const healed = (path) => n(props[path.replace('system.props.', '')]);
    if (pdvApplied > 0) {
        patch[keys.pdv] = healed(keys.pdv) + pdvApplied;
        summary.push(`+${pdvApplied} PDV`);
    }
    if (pdrApplied > 0) {
        patch[keys.pdr] = healed(keys.pdr) + pdrApplied;
        summary.push(`+${pdrApplied} PDR`);
    }
    const active = [...status.active];
    const effects = {
        ...status.effects,
    };
    if (level >= 4)
        for (const key of ['sangramento', MASTER_BATTLE_BLEEDING, 'hemorragia']) {
            const index = active.indexOf(key);
            if (index >= 0) {
                active.splice(index, 1);
                delete effects[key];
                summary.push(`${key} removido`);
            }
        }
    if (level >= 8 && active.includes('envenenamento')) {
        patch['system.props.resp_recuperacao_veneno_ignorar'] = 1;
        summary.push('ignora o próximo dano periódico de Envenenamento');
    }
    if (level >= 12 && currentCombatId !== null && currentCombatId !== 'fora-combate') {
        const fatigue = ['fadiga_corporal', 'fadiga_mental'].find((key) =>
            active.includes(key)
        );
        if (fatigue) {
            patch['system.props.resp_recuperacao_fadiga_suspensa'] = fatigue;
            summary.push(`${fatigue} suspensa até o início do próximo turno`);
        }
    }
    patch['system.props.status_slayer_dados'] = JSON.stringify({
        ...status,
        active,
        effects,
    });
    patch['system.props.status_slayer_resumo'] = formatStatusSummary(active, status.exhaustion);
    if (naturalTwenty) summary.push(`crítico: +${2 * level} PDR no cálculo da recuperação`);
    return {
        patch,
        summary,
        def,
        state,
    };
}
async function rollFormula(formula, actor, flavor) {
    const roll = await new Roll(formula).evaluate();
    await roll.toMessage({
        speaker: ChatMessage.getSpeaker({
            actor,
        }),
        flavor,
    });
    return n(roll.total);
}
async function resolveActor(actorUuid) {
    const document = actorUuid ? await fromUuid(actorUuid) : null;
    return (
        document?.actor ??
        document ??
        (globalThis.canvas?.ready ? globalThis.canvas.tokens.controlled[0]?.actor : null) ??
        globalThis.game?.user?.character ??
        null
    );
}
export async function attemptLastChance(actor, { combatId = activeCombatId() } = {}) {
    if (!actor?.update)
        return {
            ok: false,
            reason: 'Actor inválido.',
        };
    const props = actor.system?.props ?? {};
    const state = parseRecoveryState(props[RECOVERY_STATE_KEY], combatId);
    if (state.attempted || state.lastChanceUsed)
        return {
            ok: false,
            reason: 'A Recuperação já foi tentada neste combate.',
        };
    if (parseStatusState(props.status_slayer_dados).active.includes('ofegante'))
        return {
            ok: false,
            reason: 'Ofegante impede ativar Respirações.',
        };
    if (!actor.isOwner && !globalThis.game?.user?.isGM)
        return {
            ok: false,
            reason: 'Você não pode usar esta Reação.',
        };
    if (foundry.applications.api.DialogV2.confirm) {
        const confirmed = await foundry.applications.api.DialogV2.confirm({
            window: {
                title: 'Última Chance',
            },
            content:
                '<p>O ataque reduziria este personagem a 0 PDV. Tentar Respiração da Recuperação como Reação?</p>',
            rejectClose: false,
        });
        if (!confirmed)
            return {
                ok: false,
                reason: 'Última Chance cancelada.',
            };
    }
    const action = await consumeSlayerActions(actor, ['reacao']);
    if (!action.ok)
        return {
            ok: false,
            reason: action.reason,
        };
    const roll = await Roll.create(`1d20 + ${attr(props, 'fdv')}`).evaluate();
    const naturalTwenty = (roll.dice?.[0]?.results?.[0]?.result ?? 0) === 20;
    const success = n(roll.total) >= 15 || naturalTwenty;
    await roll.toMessage({
        speaker: ChatMessage.getSpeaker({
            actor,
        }),
        flavor: `Última Chance — Respiração da Recuperação (CD 15): ${success ? 'Sucesso' : 'Falha'}`,
    });
    const def = recoveryFormDefinition('recuperacao', levelOf(props));
    const pdvRoll = success
        ? await rollFormula(`${def.pdv} + ${attr(props, 'vit')}`, actor, 'Última Chance — PDV')
        : 0;
    const pdrRoll = success
        ? await rollFormula(`${def.pdr} + ${attr(props, 'fdv')}`, actor, 'Última Chance — PDR')
        : 0;
    const outcome = recoveryOutcome({
        props,
        success,
        pdvRoll,
        pdrRoll,
        naturalTwenty,
        recoveryState: state,
        currentCombatId: combatId,
        lastChance: true,
    });
    await actor.update(outcome.patch, {
        naCsbAutomation: true,
        naBreathing: true,
    });
    return {
        ok: true,
        success,
        patch: outcome.patch,
        summary: outcome.summary,
    };
}
function normalRecoveryBlockReason(props, resources) {
    const status = parseStatusState(props.status_slayer_dados);
    if (status.active.includes('ofegante'))
        return 'Ofegante impede ativar Respirações.';
    if (status.active.includes('a_beira_da_morte'))
        return 'À Beira da Morte impede a ativação normal.';
    if (resources.pdv <= 0)
        return 'A Recuperação normal exige pelo menos 1 PDV.';
    if (getDamageStatusEffects(props).blocked)
        return 'Este personagem está incapacitado e não pode usar a Recuperação.';
    return null;
}

function normalRecoveryOptions({ pdv, pdvMax, pdr, pdrMax }) {
    const canRecoverPdv = pdv < pdvMax;
    const canRecoverPdr = pdrMax > 0 && pdrMax - pdr >= Math.ceil(pdrMax / 2);
    return { pdv: canRecoverPdv, pdr: canRecoverPdr, both: canRecoverPdv && canRecoverPdr };
}

export async function openRecoveryManager({ actorUuid, mode = 'normal' } = {}) {
    const actor = await resolveActor(actorUuid);
    if (!actor) return globalThis.ui?.notifications?.warn?.('Nenhum personagem ativo.');
    if (!actor.isOwner && !globalThis.game?.user?.isGM)
        return globalThis.ui?.notifications?.error?.('Você não pode usar esta Respiração.');
    if (mode === 'lastChance') return attemptLastChance(actor);
    const key = actor.uuid ?? actor;
    if (normalRecoveryInProgress.has(key)) return null;
    normalRecoveryInProgress.add(key);
    try {
        return await useNormalRecovery(actor);
    } finally {
        normalRecoveryInProgress.delete(key);
    }
}

async function useNormalRecovery(actor) {
    const propsBefore = actor.system?.props ?? {};
    const resources = currentRecoveryResources(propsBefore);
    const blocked = normalRecoveryBlockReason(propsBefore, resources);
    if (blocked) return globalThis.ui?.notifications?.warn?.(blocked);
    const preview = recoveryFormDefinition('recuperacao', levelOf(propsBefore));
    const choices = normalRecoveryOptions(resources);
    const preferred = choices.both ? 'both' : choices.pdv ? 'pdv' : choices.pdr ? 'pdr' : 'cancel';
    const pdrRequirement = resources.pdrMax > 0
        ? `Gasto atual: ${resources.pdrMax - resources.pdr} de ${Math.ceil(resources.pdrMax / 2)} exigidos.`
        : 'Esta ficha precisa de um PDR máximo maior que zero.';
    const result = await foundry.applications.api.DialogV2.wait({
        window: {
            title: 'Respiração da Recuperação',
        },
        modal: true,
        rejectClose: false,
        content: `<p>Nível ${preview.level}. Teste de FDV, CD ${preview.dc}. Custo: 0 PDR.</p>
            <ul>
                <li><strong>PDV ${resources.pdv}/${resources.pdvMax}.</strong> Perder pelo menos 1 PDV libera a rolagem de ${preview.pdv} + VIT.</li>
                <li><strong>PDR ${resources.pdr}/${resources.pdrMax}.</strong> Gastar pelo menos metade do máximo libera a rolagem de ${preview.pdr} + FDV. ${pdrRequirement}</li>
                <li><strong>PDV e PDR.</strong> Disponível quando você cumpre as duas condições.</li>
            </ul>
            <p>Em sucesso, recupera 75% do resultado de cada recurso escolhido, arredondado para baixo. Em combate, gasta Ação Especial.</p>`,
        buttons: [
            ...Object.entries(RECOVERY_CHOICE_LABELS).map(([action, label]) => ({
                action,
                label,
                disabled: !choices[action],
                default: action === preferred,
                callback: () => action,
            })),
            {
                action: 'cancel',
                label: 'Cancelar',
                default: preferred === 'cancel',
                callback: () => null,
            },
        ],
    });
    if (typeof result !== 'string' || !Object.hasOwn(RECOVERY_CHOICE_LABELS, result)) return null;
    const props = actor.system?.props ?? {};
    const currentResources = currentRecoveryResources(props);
    const nowBlocked = normalRecoveryBlockReason(props, currentResources);
    if (nowBlocked) return globalThis.ui?.notifications?.warn?.(nowBlocked);
    if (!normalRecoveryOptions(currentResources)[result])
        return globalThis.ui?.notifications?.warn?.('A ficha não cumpre as condições da opção escolhida.');
    const recoverPdv = result !== 'pdr';
    const recoverPdr = result !== 'pdv';
    const def = recoveryFormDefinition('recuperacao', levelOf(props));
    const combat = globalThis.game?.combat;
    const participates =
        combat?.started &&
        [...(combat.combatants ?? [])].some(
            ({ actor: participant }) => participant === actor || (actor.uuid && participant?.uuid === actor.uuid)
        );
    const combatId = participates ? combat.id : null;
    if (participates) {
        const action = await consumeSlayerActions(actor, ['especial']);
        if (!action.ok) return globalThis.ui?.notifications?.warn?.(action.reason);
    }
    const roll = await new Roll(`1d20 + ${attr(props, 'fdv')}`).evaluate();
    const naturalTwenty = (roll.dice?.[0]?.results?.[0]?.result ?? 0) === 20;
    const success = n(roll.total) >= def.dc || naturalTwenty;
    await roll.toMessage({
        speaker: ChatMessage.getSpeaker({
            actor,
        }),
        flavor: `${def.label} — ${RECOVERY_CHOICE_LABELS[result]} · FDV CD ${def.dc}: ${success ? 'Sucesso' : 'Falha'}`,
    });
    const pdvRoll = success && recoverPdv
        ? await rollFormula(`${def.pdv} + ${attr(props, 'vit')}`, actor, 'Recuperação — PDV')
        : 0;
    const pdrRoll = success && recoverPdr
        ? await rollFormula(`${def.pdr} + ${attr(props, 'fdv')}`, actor, 'Recuperação — PDR')
        : 0;
    const outcome = recoveryOutcome({
        props,
        success,
        pdvRoll,
        pdrRoll,
        naturalTwenty: naturalTwenty && recoverPdr,
        currentCombatId: combatId,
    });
    if (Object.keys(outcome.patch).length)
        await actor.update(outcome.patch, { naCsbAutomation: true, naBreathing: true });
    const summary = outcome.summary.length ? outcome.summary : ['a rolagem recuperou 0 pontos'];
    await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({
            actor,
        }),
        content: `<p><strong>${def.label}</strong>: ${summary.join('; ')}.</p>`,
    });
    return {
        ok: true,
        success,
        patch: outcome.patch,
        summary,
    };
}
export function registerRecoveryBreathingEngine() {
    const reset = async (combat) => {
        if (!globalThis.game?.user?.isGM || combat?.started === false) return;
        for (const combatant of combat?.combatants ?? []) {
            const actor = combatant.actor;
            if (!actor?.update || !(actor.type === 'slayer' || ['slayer', 'npc'].includes(actorKind(actor)))) continue;
            await actor.update(
                statePatch({
                    version: 1,
                    combatId: combat.id,
                    attempted: false,
                    succeeded: false,
                    lastChanceUsed: false,
                }),
                {
                    naCsbAutomation: true,
                    naBreathing: true,
                }
            );
        }
    };
    Hooks.on('combatStart', (combat) => void reset(combat));
    Hooks.on(
        'combatEnd',
        (combat) =>
            void reset({
                ...combat,
                id: `${combat.id}:ended`,
            })
    );
}
