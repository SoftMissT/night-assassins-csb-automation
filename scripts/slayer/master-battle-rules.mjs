import { ruleVariant } from '../rules-profile.mjs';
import { classUnlocksAtLevel, selectedSlayerClassKey } from './class-contracts.mjs';

const CLASS_KEY = 'classe_mb';
const INDIRECT_DAMAGE = new Set(['automatic', 'bleeding', 'poison', 'terrain', 'aura', 'replacement-technique']);
const TACTICAL_INJURIES = Object.freeze({
    tendon: Object.freeze({ id: 'tendon', movementModifier: -1.5, expires: 'target-next-turn-end' }),
    'open-guard': Object.freeze({ id: 'open-guard', defenseModifier: -1, expires: 'next-attack-received' }),
    'deep-impact': Object.freeze({ id: 'deep-impact', damageBonus: 2 }),
});

function isProficientBasicAttack(attack) {
    return attack.isBasic === true && attack.isProficient === true && !attack.isTechnique
        && !INDIRECT_DAMAGE.has(attack.origin);
}

function isIncapacitated(statuses = []) {
    const active = new Set(statuses);
    return active.has('atordoamento') || active.has('paralisia');
}

function combatKey(value) {
    return typeof value === 'string' && value.trim() !== '';
}

function attributeModifier(attribute, value) {
    if (attribute !== 'FOR' && attribute !== 'DEX') return null;
    if (!Number.isInteger(value)) return null;
    return value;
}

export function masterBattleBenefits(props = {}, profile = ruleVariant('classes')) {
    if (selectedSlayerClassKey(props, profile) !== CLASS_KEY) return null;
    const level = props.nvl_num ?? props.npc_nivel ?? props.nvl_pj ?? props.level;
    const ranks = classUnlocksAtLevel(CLASS_KEY, level, profile);
    const rank = ranks.at(-1)?.rank;
    if (!rank) return null;

    const [c, b, a, s, ss] = ranks;
    const damageRank = b ?? c;
    return {
        profile,
        rank,
        basicDamage: damageRank.basicDamage ?? damageRank.damageBonus,
        pressure: b?.pressure ?? null,
        criticalBleed: a?.criticalBleed ?? a?.bleeding?.formula ?? null,
        parry: s?.parry ?? null,
        counterattack: ss?.counterattackThreshold ?? ss?.naturalHitThreshold ?? null,
    };
}

export function masterBattleBasicDamage(benefits, attack = {}) {
    return benefits && isProficientBasicAttack(attack) ? benefits.basicDamage : 0;
}

/** Apply the returned state only once the next attack is committed, even if it misses. */
export function masterBattlePressureAttack(benefits, state, attack = {}) {
    const { turnKey, targetUuid } = attack;
    if (!benefits?.pressure || !combatKey(turnKey) || state?.turnKey !== turnKey)
        return { bonus: 0, state: null };
    const bonus = combatKey(targetUuid) && state.targetUuid === targetUuid && isProficientBasicAttack(attack) ? 1 : 0;
    return { bonus, state: { turnKey, targetUuid: null } };
}

/** A confirmed hit opens Pressure at most once per attacker's turn. */
export function masterBattlePressureHit(benefits, state, attack = {}) {
    const { turnKey, targetUuid } = attack;
    if (!benefits?.pressure || !combatKey(turnKey)) return null;
    if (state?.turnKey === turnKey) return state;
    if (!combatKey(targetUuid) || !isProficientBasicAttack(attack)) return null;
    return { turnKey, targetUuid };
}

export function masterBattleCriticalPlan(benefits, attack = {}) {
    if (!benefits?.criticalBleed || attack.isCritical !== true || !isProficientBasicAttack(attack)) return null;
    const value = attributeModifier(attack.attribute, attack.attributeValue);
    if (value === null) return null;
    const turns = Math.max(0, Math.ceil(value / 2));
    const injury = benefits.profile === 'homebrew' && Object.hasOwn(TACTICAL_INJURIES, attack.injury)
        ? TACTICAL_INJURIES[attack.injury] : null;
    return {
        bleeding: turns > 0 ? { key: 'sangramento', formula: benefits.criticalBleed, turns, tick: 'turn-start' } : null,
        injury,
        damageBonus: injury?.damageBonus ?? 0,
    };
}

export function masterBattleParryPlan(benefits, incoming = {}) {
    const { roundKey, usedRoundKey, isPhysical, isMelee, isArea, origin, canReact, statuses, damage } = incoming;
    if (!benefits?.parry || !combatKey(roundKey) || roundKey === usedRoundKey || canReact !== true
        || isPhysical !== true || isMelee !== true || isArea || INDIRECT_DAMAGE.has(origin)
        || isIncapacitated(statuses) || !Number.isFinite(damage) || damage <= 0) return null;
    const modifier = attributeModifier(incoming.attribute, incoming.attributeValue);
    return modifier === null ? null : { formula: '1d6', attributeModifier: modifier, roundKey };
}

export function resolveMasterBattleParry(plan, damage, d6) {
    if (!plan || !Number.isFinite(damage) || damage <= 0 || !Number.isInteger(d6) || d6 < 1 || d6 > 6) return null;
    const reduction = Math.min(damage, Math.max(0, d6 + plan.attributeModifier));
    const remaining = damage - reduction;
    return {
        damage: remaining,
        reduction,
        perfectParry: remaining === 0 ? { defenseModifier: -1, expires: 'attacker-next-turn-start' } : null,
    };
}

export function masterBattleCounterattackPlan(benefits, incoming = {}) {
    const { roundKey, usedRoundKey, enemyMissed, isMelee, inReach, isProficient, canReact, canAttack,
        statuses, isCounterattack } = incoming;
    if (!benefits?.counterattack || !combatKey(roundKey) || roundKey === usedRoundKey || enemyMissed !== true
        || isMelee !== true || inReach !== true || isProficient !== true || canReact !== true
        || canAttack !== true || isIncapacitated(statuses) || isCounterattack) return null;
    return {
        roundKey,
        action: benefits.profile === 'vanilla' ? null : 'reacao',
        threshold: benefits.counterattack,
        roll: benefits.profile === 'vanilla' ? 'total' : 'natural',
        allowExtraAttacks: false,
    };
}

export function masterBattleCounterattackHits(plan, roll = {}) {
    if (!plan) return false;
    const result = roll[plan.roll];
    return Number.isFinite(result) && result >= plan.threshold && (plan.roll !== 'natural' || result <= 20);
}
