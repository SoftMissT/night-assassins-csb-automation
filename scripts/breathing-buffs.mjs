/**
 * @fileoverview Buffs temporários de Respiração (primitiva `buff`).
 *
 * O buff vive na flag `buffs` do Actor com a rodada de início e a de expiração. Aqui ele vira
 * fonte do agregador de bônus derivados, então entra em Acerto, Bloqueio, Esquiva e Dano fixo
 * pelos mesmos caminhos dos outros bônus. A expiração é por rodada de combate (aproximação do
 * "N turnos" da regra) no combate em que foi aplicado.
 */
import { MODULE_ID } from './constants.mjs';

export const BUFFS_FLAG = 'buffs';

// mod da primitiva -> canal do agregador (`DERIVED_BONUS_CHANNELS`)
const CHANNEL_BY_MOD = Object.freeze({
    acerto: 'acerto',
    bloqueio: 'bloqueio',
    esquiva: 'esquiva',
    dano: 'danoFixo',
    iniciativa: 'iniciativa',
});

/** Buffs ainda vigentes na rodada `round` (null = fora de combate). */
export function activeBuffs(list, round = null) {
    if (!Array.isArray(list)) return [];
    return list.filter((entry) => {
        if (!entry || typeof entry !== 'object' || !entry.mods) return false;
        const expires = entry.expiresRound;
        if (expires === null || expires === undefined || round === null || round === undefined)
            return true;
        return Number(round) < Number(expires);
    });
}

/** Fontes para `resolveSlayerDerivedBonuses(props, { runtimeSources })`. */
export function buffRuntimeSources(list, round = null) {
    const sources = [];
    for (const buff of activeBuffs(list, round)) {
        for (const [mod, raw] of Object.entries(buff.mods ?? {})) {
            const channel = CHANNEL_BY_MOD[mod];
            const value = typeof raw === 'number' ? Math.trunc(raw) : Number.NaN;
            if (!channel || !Number.isFinite(value) || value === 0) continue;
            sources.push({
                channel,
                value,
                label: String(buff.label ?? 'Buff'),
                origin: 'Respiração',
            });
        }
    }
    return sources;
}

export function activeCombatBuffs(actor) {
    const list = actor?.getFlag?.(MODULE_ID, BUFFS_FLAG);
    if (!Array.isArray(list) || list.length === 0) return [];
    const combat = globalThis.game?.combat;
    const combatId = combat?.uuid ?? combat?.id;
    if (!combat?.started || !combatId) return [];
    return activeBuffs(list.filter(buff => buff?.combatId === combatId), combat.round);
}

/** Fontes de buff de um Actor, na rodada atual do combate (se houver). */
export function actorBuffSources(actor) {
    return buffRuntimeSources(activeCombatBuffs(actor));
}
