/** Respiração da Recuperação — Kaifuku no Kokyu. */
import { consumeSlayerActions } from './action-service.mjs';
import { parseNumber } from './parsing.mjs';
import { resolveSlayerDerivedBonuses } from './derived-bonus-service.mjs';
import { formatStatusSummary, parseStatusState } from './status-service.mjs';
export const RECOVERY_STATE_KEY = 'resp_recuperacao_estado';
const LEVELS = Object.freeze({
    1: {
        pdv: '2d8',
        pdr: '1d6',
        dc: 14,
    },
    2: {
        pdv: '3d8',
        pdr: '2d6',
        dc: 14,
    },
    3: {
        pdv: '4d8',
        pdr: '2d6',
        dc: 14,
    },
    4: {
        pdv: '4d10',
        pdr: '3d6',
        dc: 12,
    },
    5: {
        pdv: '5d10',
        pdr: '3d6',
        dc: 12,
    },
    6: {
        pdv: '6d10',
        pdr: '4d6',
        dc: 12,
    },
    7: {
        pdv: '7d10',
        pdr: '4d6',
        dc: 12,
    },
    8: {
        pdv: '7d12',
        pdr: '5d8',
        dc: 10,
    },
    9: {
        pdv: '8d12',
        pdr: '5d8',
        dc: 10,
    },
    10: {
        pdv: '9d12',
        pdr: '6d8',
        dc: 10,
    },
    11: {
        pdv: '10d12',
        pdr: '6d8',
        dc: 10,
    },
    12: {
        pdv: '11d12',
        pdr: '7d8',
        dc: 8,
    },
    13: {
        pdv: '12d12',
        pdr: '8d8',
        dc: 8,
    },
    14: {
        pdv: '14d12',
        pdr: '9d8',
        dc: 8,
    },
});
const n = (value) => Math.max(0, Math.trunc(parseNumber(value)));
const levelOf = (props = {}) => Math.min(14, Math.max(1, n(props.nvl_num) || 1));
const attr = (props, key) => n(props[`${key}_display`] ?? props[key]);
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
    return actor?.type === 'slayer' || actor?.system?.props?.nvl_num !== undefined;
}
export function recoveryFormDefinition(formId = 'recuperacao', level) {
    const normalized = formId === 'coagulação' || formId === 'coagulacao' ? 'recuperacao' : formId;
    if (normalized !== 'recuperacao') return null;
    const current = Math.min(14, Math.max(1, n(level) || 1));
    return {
        ...RECOVERY_FORMS.recuperacao,
        level: current,
        ...LEVELS[current],
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
    const pdvMax = Math.max(
        0,
        n(props.pdv_slayer_total ?? props.pdv_slayer_total_conta) -
            n(props.pdv_slayer_dano_ferida) +
            n(props.pdv_slayer_extra)
    );
    const pdvRaw = pdvMax + n(props.pdv_slayer_curado) - n(props.pdv_slayer_dano_tomado);
    const pdv = Math.min(pdvMax, Math.max(0, pdvRaw));
    const derivedPdr = n(resolveSlayerDerivedBonuses(props).channels.pdrMaximo.total);
    const storedPdrMax = n(props.pdr_slayer_total);
    const pdrMax = Math.max(
        0,
        (storedPdrMax ||
            n(props.pdr_slayer_total_conta) + n(props.metal_slayer_pdr_bonus) + derivedPdr) +
            n(props.pdr_slayer_extra)
    );
    const pdr = Math.min(
        pdrMax,
        Math.max(0, pdrMax + n(props.pdr_slayer_curado) - n(props.pdr_slayer_gasto_valor))
    );
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
        lastChanceUsed: lastChance || previous.lastChanceUsed,
    };
    const patch = {
        ...statePatch(state),
    };
    const summary = [];
    if (!success) {
        summary.push('falhou: a Ação Especial foi gasta e pode tentar novamente');
        return {
            patch,
            summary,
            def,
            state,
        };
    }
    state.succeeded = true;
    patch[`system.props.${RECOVERY_STATE_KEY}`] = JSON.stringify(state);
    const spiritualFatigue = status.active.includes('fadiga_espiritual');
    let pdrGain = n(pdrRoll) + (naturalTwenty ? 2 * level : 0);
    if (spiritualFatigue) pdrGain = Math.floor(pdrGain / 2);
    const pdvApplied = Math.min(Math.max(0, resources.pdvMax - resources.pdv), n(pdvRoll));
    const pdrApplied = Math.min(Math.max(0, resources.pdrMax - resources.pdr), pdrGain);
    if (pdvApplied > 0) {
        patch['system.props.pdv_slayer_curado'] = n(props.pdv_slayer_curado) + pdvApplied;
        summary.push(`+${pdvApplied} PDV`);
    }
    if (pdrApplied > 0) {
        patch['system.props.pdr_slayer_curado'] = n(props.pdr_slayer_curado) + pdrApplied;
        summary.push(`+${pdrApplied} PDR${spiritualFatigue ? ' (metade, Fadiga Espiritual)' : ''}`);
    }
    const active = [...status.active];
    const effects = {
        ...status.effects,
    };
    if (level >= 4)
        for (const key of ['sangramento', 'hemorragia']) {
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
    if (level >= 12) {
        const fatigue = ['fadiga_corporal', 'fadiga_espiritual', 'fadiga_mental'].find((key) =>
            active.includes(key)
        );
        if (fatigue) {
            patch['system.props.resp_recuperacao_fadiga_suspensa'] = 1;
            summary.push(`${fatigue} suspensa até o início do próximo turno`);
        }
    }
    patch['system.props.status_slayer_dados'] = JSON.stringify({
        ...status,
        active,
        effects,
    });
    patch['system.props.status_slayer_resumo'] = formatStatusSummary(active, status.exhaustion);
    if (naturalTwenty) summary.push(`crítico: +${2 * level} PDR antes dos máximos`);
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
export async function openRecoveryManager({ actorUuid, mode = 'normal' } = {}) {
    const actor = await resolveActor(actorUuid);
    if (!actor) return globalThis.ui?.notifications?.warn?.('Nenhum personagem ativo.');
    if (!actor.isOwner && !globalThis.game?.user?.isGM)
        return globalThis.ui?.notifications?.error?.('Você não pode usar esta Respiração.');
    if (mode === 'lastChance') return attemptLastChance(actor);
    const props = actor.system?.props ?? {};
    const status = parseStatusState(props.status_slayer_dados);
    if (status.active.includes('ofegante'))
        return globalThis.ui?.notifications?.warn?.('Ofegante impede ativar Respirações.');
    if (status.active.includes('a_beira_da_morte'))
        return globalThis.ui?.notifications?.warn?.('À Beira da Morte impede a ativação normal.');
    const id = activeCombatId();
    const state = parseRecoveryState(props[RECOVERY_STATE_KEY], id);
    const resources = currentRecoveryResources(props);
    if (state.succeeded)
        return globalThis.ui?.notifications?.warn?.(
            'Respiração da Recuperação já teve sucesso neste combate.'
        );
    if (resources.pdv <= 0)
        return globalThis.ui?.notifications?.warn?.(
            'Use Última Chance antes de entrar À Beira da Morte.'
        );
    const level = levelOf(props);
    const def = recoveryFormDefinition('recuperacao', level);
    const result = await foundry.applications.api.DialogV2.wait({
        window: {
            title: 'Respiração da Recuperação',
        },
        modal: true,
        rejectClose: false,
        content: `<p>Nível de personagem ${level}. Custo: 0 PDR. CD ${def.dc}.</p><p>PDV: ${def.pdv} + VIT · PDR: ${def.pdr} + FDV.</p>`,
        buttons: [
            {
                action: 'use',
                label: 'Usar',
                default: true,
                callback: () => 'use',
            },
            {
                action: 'cancel',
                label: 'Cancelar',
                callback: () => false,
            },
        ],
    });
    if (result !== 'use' && result !== true) return null;
    const action = await consumeSlayerActions(actor, ['especial']);
    if (!action.ok) return globalThis.ui?.notifications?.warn?.(action.reason);
    const roll = await new Roll(`1d20 + ${attr(props, 'fdv')}`).evaluate();
    const naturalTwenty = (roll.dice?.[0]?.results?.[0]?.result ?? 0) === 20;
    const success = n(roll.total) >= def.dc || naturalTwenty;
    await roll.toMessage({
        speaker: ChatMessage.getSpeaker({
            actor,
        }),
        flavor: `${def.label} — FDV CD ${def.dc}: ${success ? 'Sucesso' : 'Falha'}`,
    });
    const pdvRoll = success
        ? await rollFormula(`${def.pdv} + ${attr(props, 'vit')}`, actor, 'Recuperação — PDV')
        : 0;
    const pdrRoll = success
        ? await rollFormula(`${def.pdr} + ${attr(props, 'fdv')}`, actor, 'Recuperação — PDR')
        : 0;
    const outcome = recoveryOutcome({
        props,
        success,
        pdvRoll,
        pdrRoll,
        naturalTwenty,
        recoveryState: state,
        currentCombatId: id,
    });
    await actor.update(outcome.patch, {
        naCsbAutomation: true,
        naBreathing: true,
    });
    await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({
            actor,
        }),
        content: `<p><strong>${def.label}</strong>: ${outcome.summary.join('; ')}.</p>`,
    });
    return {
        ok: true,
        success,
        patch: outcome.patch,
        summary: outcome.summary,
    };
}
export function registerRecoveryBreathingEngine() {
    const reset = async (combat) => {
        if (!globalThis.game?.user?.isGM || combat?.started === false) return;
        for (const combatant of combat?.combatants ?? []) {
            const actor = combatant.actor;
            if (!actor?.update || actor.type !== 'slayer') continue;
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
