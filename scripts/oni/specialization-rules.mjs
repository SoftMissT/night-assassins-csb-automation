import { actorKind } from '../actor-kind.mjs';
import { parseNumber } from '../parsing.mjs';
import { ruleVariant, vanillaClassRank, vanillaRuleSelection } from '../rules-profile.mjs';

export const TITAN = 'oni_especializacao_titan';
export const TOXIC = 'oni_especializacao_toxico';
export const RECOVERY_MASTER = 'oni_especializacao_mestre_recuperacao';
export const TITAN_CHARGE = 'oni_vanilla_titan_charge';
export const ONI_TOXIC_PENDING = 'oniToxicPoisonPending';

export function oniSpecializationAbility(props, key, rank) {
    if (ruleVariant('classes') !== 'vanilla' || actorKind({ system: { props } }) !== 'oni') return null;
    const specialization = vanillaRuleSelection(props, 'class', 'oni');
    if (specialization?.key !== key) return null;
    const current = vanillaClassRank(props.nvl_oni ?? props.nvl_num ?? props.nvl_pj, 'oni');
    return ['C', 'B', 'A'].indexOf(current) >= ['C', 'B', 'A'].indexOf(rank)
        ? specialization.ranks[rank]
        : null;
}

export function oniPdkInfo(props) {
    const maximum = Math.max(0, parseNumber(props.pdk_oni_total_conta) + parseNumber(props.pdk_oni_extra));
    const spent = Math.max(0, parseNumber(props.pdk_oni_gasto_valor));
    const recovered = Math.max(0, parseNumber(props.pdk_oni_curado));
    return { maximum, current: Math.max(0, Math.min(maximum, maximum + recovered - spent)), spent, recovered };
}

export function hasToxicResistance(props) {
    return oniSpecializationAbility(props, TOXIC, 'B')?.resistance === 'venenoso';
}

export function mitigateOniPoisonDamage(props, damage, context) {
    if (context.ignoreResistance || context.approvalResisted || !hasToxicResistance(props)) return damage;
    const types = context.approvedTypes ?? context.damageTypes ?? [];
    if (!types.includes('venenoso')) return damage;
    const normal = (context.components ?? []).filter(part => !part.types.includes('ferida'));
    if (normal.length === 0) return types.length === 1 ? Math.floor(damage / 2) : damage;
    const poison = normal.filter(part => part.types.includes('venenoso')).reduce((sum, part) => sum + part.subtotal, 0);
    const total = normal.reduce((sum, part) => sum + part.subtotal, 0);
    const poisonShare = total > 0 ? Math.floor(damage * poison / total) : 0;
    return damage - Math.ceil(poisonShare / 2);
}
