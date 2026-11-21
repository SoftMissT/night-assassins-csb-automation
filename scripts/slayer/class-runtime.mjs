import {
    classRankAtLevel,
    masterBattleLevelElevenPlan,
    selectedSlayerClassKey,
    slayerClassContract,
} from './class-contracts.mjs';
import { parseLevel } from '../parsing.mjs';
import { ruleVariant, vanillaRuleCatalog } from '../rules-profile.mjs';

const RANK_ORDER = ['C', 'B', 'A', 'S', 'SS'];

function integer(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.trunc(number) : fallback;
}

export function resolveClassRank(classKey, level, profile = ruleVariant('classes')) {
    if (!classKey) return null;
    if (profile === 'vanilla' && !vanillaRuleCatalog('class')[classKey]?.ranks) return null;
    return classRankAtLevel(level, profile);
}

export function classAbilityAtLevel(classKey, level, profile = ruleVariant('classes')) {
    const rank = resolveClassRank(classKey, level, profile);
    if (!rank) return { rank: null, ability: null };
    return { rank, ability: slayerClassContract(classKey, profile).ranks[rank] };
}

export function dualBreathingRankPlan(rank, profile = ruleVariant('classes')) {
    const normalized = String(rank ?? '').toUpperCase();
    if (!RANK_ORDER.includes(normalized) || profile === 'vanilla') return null;
    return slayerClassContract('classe_usuario_de_duas_resp', profile).ranks[normalized];
}

export function dualBreathingSecondaryPlan(level, compatible, profile = ruleVariant('classes')) {
    const definition = slayerClassContract('classe_usuario_de_duas_resp', profile);
    const levels = definition.secondaryLevels ?? Object.values(definition.secondaryBreathingLevels);
    const cost = definition.secondaryCost ?? definition.surcharges;
    return {
        level: levels.filter(requiredLevel => requiredLevel <= parseLevel(level)).length,
        cost: cost[compatible === true ? 'compatible' : 'incompatible'],
    };
}

export function dualBreathingCompositeCost(primaryCost, secondaryCost, compatibility, pdr = 2) {
    const primary = Math.max(0, integer(primaryCost));
    const secondary = Math.max(0, integer(secondaryCost));
    const bond = Math.max(0, integer(compatibility));
    const extra = Math.max(0, integer(pdr));
    return Math.max(primary, secondary) + bond + extra;
}

export function companionOniRankPlan(rank, profile = ruleVariant('classes')) {
    const normalized = String(rank ?? '').toUpperCase();
    if (!RANK_ORDER.includes(normalized)) return null;
    return slayerClassContract('classe_companheiro_oni', profile).ranks[normalized];
}

export function companionOniSocialBonus(rank, profile = ruleVariant('classes')) {
    if (!['S', 'SS'].includes(rank)) return 0;
    const benefit = companionOniRankPlan('S', profile);
    return benefit?.companionCarOutsideCombat ?? benefit?.bonusCar ?? 0;
}

export function classStateKey(classKey, suffix) {
    const short = String(classKey ?? '').replace(/^classe_/, '');
    return suffix ? `slayer_class_${short}_${suffix}` : `slayer_class_${short}`;
}

export function mbDamageBonus(rank, profile = ruleVariant('classes')) {
    if (!RANK_ORDER.includes(rank)) return 0;
    const bonusRank = rank === 'C' ? 'C' : 'B';
    const bonus = slayerClassContract('classe_mb', profile).ranks[bonusRank];
    return bonus.basicDamage ?? bonus.damageBonus;
}

export function mbShouldApplyPermanentPdv(props = {}) {
    const plan = masterBattleLevelElevenPlan(props);
    return plan.eligible && plan.permanentPdv !== null;
}

export function mbPermanentPdvPatch(rolledTotal, alreadyApplied = 0) {
    const gain = Math.max(0, integer(rolledTotal));
    const applied = Math.max(0, integer(alreadyApplied));
    return Object.freeze({
        [`system.props.${classStateKey('classe_mb', 'corpo_guerra_applied')}`]: integer(
            applied + gain
        ),
    });
}

export async function applyMasterBattleLevelEleven(actor, level = null) {
    const props = actor?.system?.props ?? {};
    const normalizedLevel = Math.max(0, parseLevel(level ?? props.nvl_num ?? props.npc_nivel ?? props.nvl_pj));
    const plan = masterBattleLevelElevenPlan({ ...props, nvl_num: normalizedLevel });
    if (!actor?.update || !plan.eligible || !plan.permanentPdv) return false;

    const roll = await Roll.create(plan.permanentPdv.formula).evaluate();
    const total = Math.max(0, integer(roll.total));
    await roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor }),
        flavor: `${actor.name} Corpo de Guerra: +${total} PDV máximo permanente`,
    });
    await actor.update(mbPermanentPdvPatch(total), {
        naCsbAutomation: true,
        naMasterBattleLevelEleven: true,
    });
    ui.notifications?.info?.(`Corpo de Guerra concedeu +${total} PDV máximo a ${actor.name}.`);
    return true;
}

export function mbParryAvailable(props = {}, profile = ruleVariant('classes')) {
    const used = props[classStateKey('classe_mb', 'parry_used_round')];
    return profile !== 'vanilla' && integer(used) === 0;
}

export function mbParryConsume() {
    return Object.freeze({ [`system.props.${classStateKey('classe_mb', 'parry_used_round')}`]: 1 });
}

export function mbParryReduction(rank, defenseAttribute, profile = ruleVariant('classes')) {
    if (profile === 'vanilla' || (rank !== 'S' && rank !== 'SS')) return 0;
    return Math.max(0, integer(defenseAttribute));
}

export function poisonApply(targetProps = {}, attackerCarisma = 0, rank = 'C') {
    const car = Math.max(0, integer(attackerCarisma));
    const damage = rank === 'B' || rank === 'A' ? car + 2 : car;
    const rounds = rank === 'B' || rank === 'A' || rank === 'S' || rank === 'SS' ? 3 : 2;
    const maxStacks = rank === 'S' || rank === 'SS' ? 3 : 1;
    return Object.freeze({
        'system.props.slayer_veneno_dano': damage,
        'system.props.slayer_veneno_rodadas': rounds,
        'system.props.slayer_veneno_stacks': Math.min(
            maxStacks,
            integer(targetProps.slayer_veneno_stacks) + 1
        ),
        'system.props.slayer_veneno_fonte': 'classe_usuario_de_veneno',
    });
}

export function poisonTick(props = {}) {
    const stacks = Math.max(0, integer(props.slayer_veneno_stacks));
    if (stacks === 0) return { damage: 0, patch: {} };
    const perStack = Math.max(0, integer(props.slayer_veneno_dano));
    const totalDamage = perStack * stacks;
    const remaining = Math.max(0, integer(props.slayer_veneno_rodadas) - 1);
    if (remaining <= 0) {
        return {
            damage: totalDamage,
            patch: Object.freeze({
                'system.props.slayer_veneno_rodadas': 0,
                'system.props.slayer_veneno_stacks': 0,
                'system.props.slayer_veneno_dano': 0,
            }),
        };
    }
    return {
        damage: totalDamage,
        patch: Object.freeze({ 'system.props.slayer_veneno_rodadas': remaining }),
    };
}

export function cortaCuraMultiplier(props = {}) {
    const stacks = Math.max(0, integer(props.slayer_veneno_stacks));
    if (stacks === 0) return 1;
    return 0.5;
}

export function kakushiAmpararHeal(rank, intOrSab = 0) {
    const attr = Math.max(0, integer(intOrSab));
    if (rank === 'C') return attr;
    if (rank === 'B' || rank === 'A' || rank === 'S' || rank === 'SS') return 3 + attr;
    return 0;
}

export function kakushiAmpararAvailable(props = {}) {
    const used = props[classStateKey('classe_kakushi', 'amparar_used_round')];
    return integer(used) === 0;
}

export function kakushiAmpararConsume() {
    return Object.freeze({
        [`system.props.${classStateKey('classe_kakushi', 'amparar_used_round')}`]: 1,
    });
}

export function kakushiTatakaaeeeRoll(carisma = 0) {
    const car = Math.max(0, integer(carisma));
    const threshold = 15;
    const bonus = car * 2;
    return Object.freeze({ threshold, bonus, car });
}

export function resetClassTurnState(classKey, props = {}) {
    const patches = {};
    const base = classStateKey(classKey, '');
    for (const key of Object.keys(props)) {
        if (key.startsWith(base) && key.endsWith('_turn')) {
            patches[`system.props.${key}`] = 0;
        }
    }
    return Object.freeze(patches);
}

export function resetClassRoundState(classKey, props = {}) {
    const patches = {};
    const base = classStateKey(classKey, '');
    for (const key of Object.keys(props)) {
        if (key.startsWith(base) && key.endsWith('_round')) {
            patches[`system.props.${key}`] = 0;
        }
    }
    return Object.freeze(patches);
}

export function classEventContext({ classKey, level, event, props = {}, profile = ruleVariant('classes') }) {
    const selectedClass = classKey ?? selectedSlayerClassKey(props, profile);
    const rank = resolveClassRank(selectedClass, level, profile);
    if (!rank) return { rank: null, applicable: false };
    const events = {
        'basic-hit': profile === 'vanilla' ? RANK_ORDER : ['C', 'B'],
        'basic-critical': profile === 'vanilla' ? ['A', 'S', 'SS'] : ['A'],
        'physical-melee-damage': profile === 'vanilla' ? [] : ['S'],
        'enemy-misses-melee': ['SS'],
        'turn-start': ['C', 'B', 'A', 'S', 'SS'],
        'round-start': ['C', 'B', 'A', 'S', 'SS'],
    };
    const generalEvent = event === 'turn-start' || event === 'round-start';
    const applicableRanks = generalEvent || selectedClass === 'classe_mb' ? events[event] ?? [] : [];
    return Object.freeze({
        rank,
        applicable: applicableRanks.includes(rank),
        event,
    });
}
