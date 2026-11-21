import { actorKind } from './actor-kind.mjs';
import { parseNumber, slayerMaxPdv } from './parsing.mjs';
import { npcResourceMaximums, resolveSlayerDerivedBonuses } from './derived-bonus-service.mjs';

export function breathingResourceKeys(props = {}) {
    return actorKind({ system: { props } }) === 'npc'
        ? { pdrSpent: 'npc_pdr_gasto_valor', pdrRecovered: 'npc_pdr_recuperado', pdvHealed: 'npc_pdv_curado' }
        : { pdrSpent: 'pdr_slayer_gasto_valor', pdrRecovered: 'pdr_slayer_curado', pdvHealed: 'pdv_slayer_curado' };
}

export function breathingPdrInfo(props = {}) {
    const npc = actorKind({ system: { props } }) === 'npc';
    const storedTotal = Number(String(props.pdr_slayer_total ?? '').trim() || NaN);
    const derived = resolveSlayerDerivedBonuses(props).channels.pdrMaximo.total;
    const pdrMax = npc
        ? npcResourceMaximums(props).pdrMax
        : Math.max(0, (Number.isFinite(storedTotal)
            ? storedTotal
            : parseNumber(props.pdr_slayer_total_conta) + derived) + parseNumber(props.pdr_slayer_extra));
    const { pdrSpent, pdrRecovered } = breathingResourceKeys(props);
    const pdrCurrent = Math.max(0, Math.min(pdrMax,
        pdrMax + parseNumber(props[pdrRecovered]) - parseNumber(props[pdrSpent])));
    return { pdrMax, pdrCurrent };
}

export function breathingPdvInfo(props = {}) {
    const kind = actorKind({ system: { props } });
    if (kind === 'oni_minion') {
        const pdvMax = Math.max(0, parseNumber(props.oni_minion_pdv_base));
        const pdvRaw = pdvMax + parseNumber(props.oni_minion_pdv_curado) - parseNumber(props.oni_minion_pdv_dano);
        return { pdvMax, pdvCurrent: Math.max(0, Math.min(pdvMax, pdvRaw)), pdvRaw };
    }
    if (kind === 'oni') {
        const pdvMax = Math.max(0, parseNumber(props.pdv_oni_total_conta) -
            parseNumber(props.pdv_oni_dano_ferida) + parseNumber(props.pdv_oni_extra));
        const pdvRaw = pdvMax + parseNumber(props.pdv_oni_curado) - parseNumber(props.pdv_oni_dano_tomado);
        return { pdvMax, pdvCurrent: Math.max(0, Math.min(pdvMax, pdvRaw)), pdvRaw };
    }
    const npc = kind === 'npc';
    const pdvMax = npc ? npcResourceMaximums(props).pdvMax : slayerMaxPdv(props);
    const { pdvHealed } = breathingResourceKeys(props);
    const damageKey = npc ? 'npc_pdv_dano' : 'pdv_slayer_dano_tomado';
    const pdvRaw = pdvMax + parseNumber(props[pdvHealed]) - parseNumber(props[damageKey]);
    return { pdvMax, pdvCurrent: Math.max(0, Math.min(pdvMax, pdvRaw)), pdvRaw };
}
