import { actorKind, isOniActor, isSlayerActor, isOniMinionActor } from '../actor-kind.mjs';
import { parseNumber } from '../parsing.mjs';
import { oniRegenerationProfile, oniLegendaryActions } from './progression-service.mjs';
import { parseBlockingFlags } from './regeneration-service.mjs';

function integer(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.trunc(number) : fallback;
}

function cleanName(actor) {
    const name = String(actor?.name ?? actor?.prototypeToken?.name ?? '').trim();
    return name || 'Desconhecido';
}

export function classifyCombatant(actor) {
    const kind = actorKind(actor);
    if (kind === 'oni_minion') return 'oni_minion';
    if (kind === 'oni') return 'oni';
    if (kind === 'slayer') return 'slayer';
    return 'npc';
}

export function slayerPanelData(actor) {
    if (!isSlayerActor(actor)) return null;
    const props = actor?.system?.props ?? {};
    return Object.freeze({
        kind: 'slayer',
        name: cleanName(actor),
        uuid: actor?.uuid ?? actor?.id ?? '',
        pdv: {
            current: integer(props.pdv_slayer_atual_num ?? props.pdv_slayer_conta_atual),
            maximum: integer(props.pdv_slayer_maximo_num ?? props.pdv_slayer_total_valor),
            ferida: integer(props.pdv_slayer_dano_ferida),
        },
        pdr: {
            current: integer(
                props.pdr_slayer_atual_num ??
                    integer(props.pdr_slayer_total_valor) - integer(props.pdr_slayer_gasto_valor)
            ),
            maximum: integer(props.pdr_slayer_total_valor),
            gasto: integer(props.pdr_slayer_gasto_valor),
        },
        level: integer(props.nvl_num),
        classKey: props.classe_escolhida ?? null,
        exaustao: integer(props.status_slayer_exaustao),
    });
}

export function oniPanelData(actor) {
    if (!isOniActor(actor)) return null;
    const props = actor?.system?.props ?? {};
    const level = integer(props.nvl_num);
    const regenProfile = oniRegenerationProfile(level);
    const { blockedBy } = parseBlockingFlags(props);
    return Object.freeze({
        kind: 'oni',
        name: cleanName(actor),
        uuid: actor?.uuid ?? actor?.id ?? '',
        pdv: {
            current: integer(props.pdv_oni_atual_num ?? props.pdv_oni_conta_atual),
            maximum: integer(props.pdv_oni_maximo_num ?? props.pdv_oni_total_conta),
            ferida: integer(props.pdv_oni_dano_ferida),
        },
        pdk: {
            current: integer(props.pdk_oni_atual_num ?? props.pdk_oni_conta_atual),
            maximum: integer(props.pdk_oni_maximo_num ?? props.pdk_oni_total_conta),
            gasto: integer(props.pdk_oni_gasto_valor),
        },
        level,
        rank: regenProfile.available
            ? level >= 19
                ? 'SS'
                : level >= 16
                  ? 'S'
                  : level >= 12
                    ? 'A'
                    : level >= 7
                      ? 'B'
                      : level >= 3
                        ? 'C'
                        : 'D'
            : null,
        legendaryActions: oniLegendaryActions(level),
        regenerationBlocked: blockedBy.length > 0,
        regenerationBlockers: blockedBy,
        regenAvailable: regenProfile.available,
        autoRegen: Boolean(regenProfile.automaticStartTurnFormula),
    });
}

export function minionPanelData(actor) {
    if (!isOniMinionActor(actor)) return null;
    const props = actor?.system?.props ?? {};
    return Object.freeze({
        kind: 'oni_minion',
        name: cleanName(actor),
        uuid: actor?.uuid ?? actor?.id ?? '',
        pdv: {
            current:
                integer(props.oni_minion_pdv_base) -
                integer(props.oni_minion_pdv_dano) +
                integer(props.oni_minion_pdv_curado),
            maximum: integer(props.oni_minion_pdv_base),
            dano: integer(props.oni_minion_pdv_dano),
        },
        pdk: {
            current:
                integer(props.oni_minion_pdk_base) -
                integer(props.oni_minion_pdk_gasto) +
                integer(props.oni_minion_pdk_recuperado),
            maximum: integer(props.oni_minion_pdk_base),
            gasto: integer(props.oni_minion_pdk_gasto),
        },
        tipo: props.oni_minion_tipo ?? 'fraco',
        nivel: integer(props.oni_minion_nivel),
        pacote: props.oni_minion_pacote ?? 'bruto',
        traco: props.oni_minion_traco_nome ?? '',
        fraqueza: props.oni_minion_fraqueza ?? '',
    });
}

export function buildGmPanelData(actors = []) {
    const slayers = [];
    const onis = [];
    const minions = [];
    const npcs = [];
    for (const actor of actors) {
        const kind = classifyCombatant(actor);
        if (kind === 'slayer') slayers.push(slayerPanelData(actor));
        else if (kind === 'oni') onis.push(oniPanelData(actor));
        else if (kind === 'oni_minion') minions.push(minionPanelData(actor));
        else
            npcs.push(
                Object.freeze({
                    kind: 'npc',
                    name: cleanName(actor),
                    uuid: actor?.uuid ?? actor?.id ?? '',
                })
            );
    }
    return Object.freeze({
        slayers: Object.freeze(slayers.filter(Boolean)),
        onis: Object.freeze(onis.filter(Boolean)),
        minions: Object.freeze(minions.filter(Boolean)),
        npcs: Object.freeze(npcs),
        totals: Object.freeze({
            slayers: slayers.length,
            onis: onis.length,
            minions: minions.length,
            npcs: npcs.length,
        }),
    });
}
