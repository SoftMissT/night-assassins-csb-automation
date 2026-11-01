/** Runtime das Manobras de Combate. Manobras consomem Fôlego, nunca ações. */
import { MODULE_ID } from './constants.mjs';
import { parseNumber } from './parsing.mjs';
import { slayerFolegoMaximum } from './action-service.mjs';
import { COMBAT_MANEUVERS } from './combat-maneuvers-data.mjs';
import { formatStatusSummary, parseStatusState } from './status-service.mjs';
export const MANEUVER_STATE_KEY = 'manobras_slayer_estado';
const defaultState = (combatId = globalThis.game?.combat?.id ?? 'fora-combate') => ({
    version: 1,
    combatId,
    usedContexts: [],
    markers: {},
    pending: [],
    effects: {},
});
export function parseCombatManeuverState(
    value,
    combatId = globalThis.game?.combat?.id ?? 'fora-combate'
) {
    const fallback = defaultState(combatId);
    if (!value) return fallback;
    try {
        const raw = typeof value === 'string' ? JSON.parse(value) : value;
        if (!raw || raw.combatId !== combatId) return fallback;
        return {
            ...fallback,
            usedContexts: Array.isArray(raw.usedContexts)
                ? [...new Set(raw.usedContexts.map(String))]
                : [],
            markers:
                raw.markers && typeof raw.markers === 'object'
                    ? {
                          ...raw.markers,
                      }
                    : {},
            pending: Array.isArray(raw.pending)
                ? raw.pending.filter((entry) => entry && typeof entry === 'object')
                : [],
            effects:
                raw.effects && typeof raw.effects === 'object'
                    ? {
                          ...raw.effects,
                      }
                    : {},
        };
    } catch {
        return fallback;
    }
}

function patchState(state) {
    return {
        [`system.props.${MANEUVER_STATE_KEY}`]: JSON.stringify(state),
    };
}

function actorIsSlayer(actor) {
    const props = actor?.system?.props ?? {};
    return (
        actor?.type === 'slayer' ||
        props.nome_slayer !== undefined ||
        props.pdv_slayer_total_conta !== undefined
    );
}

function currentFolego(props) {
    const maximum = slayerFolegoMaximum(props);
    const value =
        props.folego_slayer_atual === undefined
            ? maximum
            : Math.max(0, Math.trunc(parseNumber(props.folego_slayer_atual)));
    return {
        current: Math.min(maximum, value),
        maximum,
    };
}

function contextKey(context, targetUuid) {
    return `${String(context || 'situation')}:${String(targetUuid || '')}`;
}
export function maneuverById(id) {
    return COMBAT_MANEUVERS.find((entry) => entry.id === id) ?? null;
}
export function resolveCombatManeuverBonuses(actor, { targetUuid = '', channel = '' } = {}) {
    const state = parseCombatManeuverState(actor?.system?.props?.[MANEUVER_STATE_KEY]);
    const relevant = state.pending.filter(
        (entry) => !entry.targetUuid || !targetUuid || entry.targetUuid === targetUuid
    );
    return relevant.reduce(
        (result, entry) => {
            if (entry.attackBonus && channel === 'acerto')
                result.attackBonus += Number(entry.attackBonus) || 0;
            if (entry.damageBonus && channel === 'dano')
                result.damageBonus += Number(entry.damageBonus) || 0;
            if (entry.defenseBonus && ['bloqueio', 'esquiva'].includes(channel))
                result.defenseBonus += Number(entry.defenseBonus) || 0;
            if (entry.movementBonus && channel === 'movimento')
                result.movementBonus += Number(entry.movementBonus) || 0;
            if (
                entry.advantage &&
                (channel === 'acerto' || ['bloqueio', 'esquiva'].includes(channel))
            )
                result.advantage = true;
            if (entry.maxDamage && channel === 'dano') result.maxDamage = true;
            return result;
        },
        {
            attackBonus: 0,
            damageBonus: 0,
            defenseBonus: 0,
            movementBonus: 0,
            advantage: false,
            maxDamage: false,
        }
    );
}

function pendingFor(maneuver, props, targetUuid, options = {}) {
    const strength = Math.max(0, Math.trunc(parseNumber(props.for_display ?? props.for)));
    switch (maneuver.id) {
        case 'ataque_imprudente':
            return {
                attackBonus: 0,
                damageBonus: strength,
                advantage: true,
                targetUuid,
                effect: 'vulneravel',
            };
        case 'carregar_ataque':
            return {
                maxDamage: true,
                targetUuid,
                effect: 'carregado',
            };
        case 'finta':
            return {
                advantage: true,
                targetUuid,
            };
        case 'disparada':
            return {
                attackBonus: 1,
                movementBonus: 3,
                targetUuid,
            };
        case 'fio_abertura':
            return {
                attackBonus: Number(options.markers) >= 4 ? 2 : 2,
                damageBonus:
                    Number(options.markers) >= 5 ? 12 : Number(options.markers) >= 3 ? 6 : 0,
                advantage: Number(options.markers) >= 4,
                targetUuid,
            };
        case 'leitura_padrao':
            return {
                defenseBonus: 2,
                targetUuid,
            };
        case 'uso_cenario':
            return {
                advantage: true,
                targetUuid,
            };
        case 'postura_contra_golpe':
            return {
                effect: 'postura_contra_golpe',
                targetUuid,
            };
        default:
            return {
                targetUuid,
            };
    }
}
export async function useCombatManeuver({
    actor,
    maneuverId,
    targetUuid = '',
    context = 'situation',
    markers,
    options = {},
} = {}) {
    if (!actor?.update || !actorIsSlayer(actor))
        return {
            ok: false,
            reason: 'A manobra exige uma ficha Slayer.',
        };
    const maneuver = maneuverById(maneuverId);
    if (!maneuver)
        return {
            ok: false,
            reason: 'Manobra desconhecida.',
        };
    const props = actor.system?.props ?? {};
    const combatId = globalThis.game?.combat?.id ?? 'fora-combate';
    const state = parseCombatManeuverState(props[MANEUVER_STATE_KEY], combatId);
    const key = contextKey(context, targetUuid);
    if (state.usedContexts.includes(key))
        return {
            ok: false,
            reason: 'Já existe uma manobra aplicada nesta situação.',
        };
    const folego = currentFolego(props);
    if (folego.current < maneuver.cost)
        return {
            ok: false,
            reason: `Fôlego insuficiente: ${folego.current}/${maneuver.cost}.`,
        };
    if (maneuver.id === 'leitura_padrao' && state.effects[`leitura:${targetUuid}`])
        return {
            ok: false,
            reason: 'Leitura de Padrão já usada contra este alvo.',
        };
    if (maneuver.id === 'fio_abertura') {
        const available = Math.max(0, Math.trunc(Number(state.markers[targetUuid] ?? 0)));
        const spend = Math.min(5, Math.max(2, Math.trunc(Number(markers ?? available))));
        if (available < spend)
            return {
                ok: false,
                reason: 'Fio da Abertura exige pelo menos 2 Marcadores de Leitura.',
            };
        state.markers[targetUuid] = available - spend;
        options = {
            ...options,
            markers: spend,
        };
    }
    const pending = pendingFor(maneuver, props, targetUuid, options);
    const maneuverStatusPatch = {};
    if (pending.effect === 'vulneravel') {
        const status = parseStatusState(props.status_slayer_dados);
        if (!status.active.includes('vulneravel')) status.active.push('vulneravel');
        status.effects.vulneravel = {
            damageFormula: '',
            remainingTurns: 1,
            sourceName: 'Ataque Imprudente',
            saveAttr: '',
            saveDc: 0,
            stacks: 1,
            tick: 'start',
        };
        maneuverStatusPatch['system.props.status_slayer_dados'] = JSON.stringify(status);
        maneuverStatusPatch['system.props.status_slayer_resumo'] = formatStatusSummary(
            status.active,
            status.exhaustion
        );
        pending.effect = '';
    }
    state.usedContexts.push(key);
    state.pending.push({
        ...pending,
        maneuverId,
        context,
        targetUuid,
        createdAt: Date.now(),
    });
    if (maneuver.id === 'leitura_padrao') {
        state.markers[targetUuid] = Math.min(
            5,
            Math.max(0, Number(state.markers[targetUuid] ?? 0)) + 2
        );
        state.effects[`leitura:${targetUuid}`] = true;
    }
    if (maneuver.id === 'finta')
        state.markers[targetUuid] = Math.min(
            5,
            Math.max(0, Number(state.markers[targetUuid] ?? 0)) + 1
        );
    const patch = {
        [`system.props.folego_slayer_atual`]: folego.current - maneuver.cost,
        ...patchState(state),
        ...maneuverStatusPatch,
    };
    await actor.update(patch, {
        naCsbAutomation: true,
        naCombatManeuver: true,
    });
    return {
        ok: true,
        maneuver,
        cost: maneuver.cost,
        state,
        patch,
    };
}
export async function consumeCombatManeuverPending(actor, predicate = {}) {
    if (!actor?.update) return null;
    const props = actor.system?.props ?? {};
    const state = parseCombatManeuverState(props[MANEUVER_STATE_KEY]);
    const part = predicate.part === 'damage' ? 'damage' : predicate.part === 'hit' ? 'hit' : '';
    const matches = (entry) => {
        if (
            predicate.targetUuid &&
            entry.targetUuid &&
            entry.targetUuid !== predicate.targetUuid
        )
            return false;
        if (predicate.channel && entry.channel !== predicate.channel) return false;
        if (part === 'hit' && entry.hitConsumed) return false;
        if (part === 'damage' && entry.damageConsumed) return false;
        if (part === 'hit' && !entry.attackBonus && !entry.advantage && !entry.maxDamage)
            return false;
        if (part === 'damage' && !entry.damageBonus && !entry.maxDamage) return false;
        return true;
    };
    const index = state.pending.findIndex(matches);
    if (index < 0) return null;
    const entry = state.pending[index];
    if (part === 'hit') {
        entry.hitConsumed = true;
        entry.attackBonus = 0;
        entry.advantage = false;
        entry.maxDamage = false;
    }
    if (part === 'damage') {
        entry.damageConsumed = true;
        entry.damageBonus = 0;
        entry.maxDamage = false;
    }
    const stillUseful =
        entry.attackBonus ||
        entry.damageBonus ||
        entry.defenseBonus ||
        entry.movementBonus ||
        entry.advantage ||
        entry.maxDamage ||
        entry.effect;
    if (!stillUseful) state.pending.splice(index, 1);
    await actor.update(patchState(state), {
        naCsbAutomation: true,
        naCombatManeuver: true,
    });
    return entry;
}
export async function openCombatManeuverManager({ actorUuid } = {}) {
    const document = actorUuid ? await fromUuid(actorUuid) : null;
    const actor =
        document?.actor ??
        document ??
        globalThis.canvas?.tokens?.controlled?.[0]?.actor ??
        globalThis.game?.user?.character;
    if (!actor) return globalThis.ui?.notifications?.warn?.('Nenhum personagem ativo.');
    if (!actor.isOwner && !globalThis.game?.user?.isGM)
        return globalThis.ui?.notifications?.error?.(
            'Você não pode usar Manobras neste personagem.'
        );
    const folego = currentFolego(actor.system?.props ?? {});
    const options = COMBAT_MANEUVERS.map(
        (entry) => `<option value="${entry.id}">${entry.label} — ${entry.cost} Fôlego</option>`
    ).join('');
    const result = await foundry.applications.api.DialogV2.wait({
        window: {
            title: `Manobras — ${actor.name}`,
        },
        modal: true,
        rejectClose: false,
        content: `<p>Fôlego: ${folego.current}/${folego.maximum}</p><label>Manobra <select name="maneuver">${options}</select></label><label>Contexto <select name="context"><option value="attack">Ataque</option><option value="defense">Defesa</option><option value="movement">Movimento</option><option value="situation">Situação</option></select></label>`,
        buttons: [
            {
                action: 'use',
                label: 'Usar manobra',
                default: true,
                callback: (_event, button) => ({
                    maneuverId: button.form.elements.maneuver.value,
                    context: button.form.elements.context.value,
                }),
            },
            {
                action: 'cancel',
                label: 'Cancelar',
                callback: () => false,
            },
        ],
    });
    if (!result) return null;
    const targetUuid = [...(globalThis.game?.user?.targets ?? [])][0]?.actor?.uuid ?? '';
    const used = await useCombatManeuver({
        actor,
        ...result,
        targetUuid,
    });
    if (!used.ok) globalThis.ui?.notifications?.warn?.(used.reason);
    return used;
}
export function registerCombatManeuverEngine() {
    const reset = async (combat) => {
        if (!globalThis.game?.user?.isGM || combat?.started === false) return;
        for (const combatant of combat?.combatants ?? []) {
            const actor = combatant.actor;
            if (!actor?.update || !actorIsSlayer(actor)) continue;
            await actor.update(patchState(defaultState(combat.id)), {
                naCsbAutomation: true,
                naCombatManeuver: true,
            });
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
