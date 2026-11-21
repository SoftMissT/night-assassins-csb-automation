import assert from 'node:assert/strict';
import test from 'node:test';

import {
    masterBattleBasicDamage,
    masterBattleBenefits,
    masterBattleCounterattackHits,
    masterBattleCounterattackPlan,
    masterBattleCriticalPlan,
    masterBattleParryPlan,
    masterBattlePressureAttack,
    masterBattlePressureHit,
    resolveMasterBattleParry,
} from '../scripts/slayer/master-battle-rules.mjs';

function master(level, profile = 'homebrew') {
    return masterBattleBenefits({ nvl_pj: `nvl_${level}`,
        [profile === 'vanilla' ? 'na_vanilla_class' : 'classe_escolhida']: 'classe_mb' }, profile);
}

const attack = { isBasic: true, isProficient: true, turnKey: 'combat:1:0', targetUuid: 'Token.target' };
const melee = { roundKey: 'combat:1', isMelee: true, canReact: true };

test('Mestre de Batalha acumula os desbloqueios de C a SS e lê a seleção da variante ativa', () => {
    assert.equal(master(3), null);
    assert.equal(masterBattleBenefits({ classe_escolhida: 'classe_mb', nvl_num: 12 }, 'vanilla'), null);
    assert.equal(masterBattleBenefits({ classe_escolhida: 'classe_kakushi', nvl_num: 12 }, 'homebrew'), null);
    assert.deepEqual([4, 6, 8, 11, 12].map(level => {
        const { rank, basicDamage, pressure, criticalBleed, parry, counterattack } = master(level);
        return [rank, basicDamage, Boolean(pressure), criticalBleed, Boolean(parry), counterattack];
    }), [
        ['C', 2, false, null, false, null],
        ['B', 4, true, null, false, null],
        ['A', 4, true, '1d4', false, null],
        ['S', 4, true, '1d4', true, null],
        ['SS', 4, true, '1d4', true, 17],
    ]);
    assert.deepEqual(master(12, 'vanilla'), {
        profile: 'vanilla', rank: 'SS', basicDamage: 4, pressure: null, criticalBleed: '1d4', parry: null, counterattack: 17,
    });
});

test('Dilacerador vale no básico proficiente e ignora técnica e dano indireto', () => {
    assert.equal(masterBattleBasicDamage(master(4), attack), 2);
    assert.equal(masterBattleBasicDamage(master(12), attack), 4);
    assert.equal(masterBattleBasicDamage(master(12, 'vanilla'), attack), 4);
    assert.equal(masterBattleBasicDamage(master(12), { ...attack, isTechnique: true }), 0);
    assert.equal(masterBattleBasicDamage(master(12), { ...attack, isProficient: false }), 0);
    for (const origin of ['automatic', 'bleeding', 'poison', 'terrain', 'aura', 'replacement-technique']) {
        assert.equal(masterBattleBasicDamage(master(12), { ...attack, origin }), 0, origin);
    }
});

test('Pressão afeta apenas o próximo ataque básico proficiente no mesmo alvo/turno', () => {
    const benefits = master(8);
    const pressure = masterBattlePressureHit(benefits, null, attack);
    assert.deepEqual(pressure, { turnKey: attack.turnKey, targetUuid: attack.targetUuid });
    const consumed = masterBattlePressureAttack(benefits, pressure, attack);
    assert.deepEqual(consumed, { bonus: 1, state: { turnKey: attack.turnKey, targetUuid: null } });
    assert.deepEqual(masterBattlePressureHit(benefits, consumed.state, attack), consumed.state);
    assert.deepEqual(masterBattlePressureAttack(benefits, consumed.state, attack), { ...consumed, bonus: 0 });
    assert.deepEqual(masterBattlePressureAttack(benefits, pressure, { ...attack, turnKey: 'combat:1:1' }), { bonus: 0, state: null });
    assert.deepEqual(masterBattlePressureHit(benefits, pressure, { ...attack, turnKey: 'combat:1:1' }), { ...pressure, turnKey: 'combat:1:1' });
    for (const next of [{ targetUuid: 'Token.other' }, { isTechnique: true }, { isProficient: false }]) {
        assert.deepEqual(masterBattlePressureAttack(benefits, pressure, { ...attack, ...next }), { ...consumed, bonus: 0 });
    }
    assert.equal(masterBattlePressureHit(master(12, 'vanilla'), null, attack), null);
    assert.equal(masterBattlePressureHit(benefits, null, { ...attack, isTechnique: true }), null);
});

test('Crítico Brutal usa o atributo escolhido, arredonda para cima e retorna um Ferimento Tático', () => {
    const critical = { ...attack, isCritical: true, attribute: 'DEX', attributeValue: 5 };
    const benefits = master(12);
    const base = { bleeding: { key: 'sangramento', formula: '1d4', turns: 3, tick: 'turn-start' } };
    assert.deepEqual(masterBattleCriticalPlan(benefits, { ...critical, injury: 'tendon' }), {
        ...base, injury: { id: 'tendon', movementModifier: -1.5, expires: 'target-next-turn-end' }, damageBonus: 0,
    });
    assert.deepEqual(masterBattleCriticalPlan(benefits, { ...critical, injury: 'open-guard' }), {
        ...base, injury: { id: 'open-guard', defenseModifier: -1, expires: 'next-attack-received' }, damageBonus: 0,
    });
    assert.deepEqual(masterBattleCriticalPlan(benefits, { ...critical, injury: 'deep-impact' }), {
        ...base, injury: { id: 'deep-impact', damageBonus: 2 }, damageBonus: 2,
    });
    assert.deepEqual(masterBattleCriticalPlan(master(8, 'vanilla'), { ...critical, injury: 'deep-impact' }), {
        ...base, injury: null, damageBonus: 0,
    });
    assert.equal(masterBattleCriticalPlan(benefits, { ...critical, attribute: 'SAB' }), null);
    assert.equal(masterBattleCriticalPlan(master(6), critical), null);
    assert.equal(masterBattleCriticalPlan(benefits, { ...critical, isProficient: false }), null);
    assert.equal(masterBattleCriticalPlan(benefits, { ...critical, isCritical: false }), null);
    assert.equal(masterBattleCriticalPlan(benefits, { ...critical, attribute: 'FOR', attributeValue: 0 }).bleeding, null);
});

test('Aparar exige dano físico corpo a corpo, capacidade de reagir e uso disponível na rodada', () => {
    const benefits = master(12);
    const incoming = { ...melee, isPhysical: true, damage: 9, attribute: 'FOR', attributeValue: 3 };
    const plan = masterBattleParryPlan(benefits, incoming);
    assert.deepEqual(plan, { formula: '1d6', attributeModifier: 3, roundKey: melee.roundKey });
    assert.deepEqual(resolveMasterBattleParry(plan, 9, 2), { damage: 4, reduction: 5, perfectParry: null });
    assert.deepEqual(resolveMasterBattleParry(plan, 4, 6), { damage: 0, reduction: 4,
        perfectParry: { defenseModifier: -1, expires: 'attacker-next-turn-start' } });
    assert.equal(resolveMasterBattleParry(plan, 4, 7), null);
    for (const blocked of [{ usedRoundKey: melee.roundKey }, { isPhysical: false }, { isMelee: false },
        { isArea: true }, { canReact: false }, { statuses: ['atordoamento'] }, { statuses: ['paralisia'] },
        { origin: 'poison' }, { origin: 'bleeding' }, { origin: 'automatic' }, { damage: 0 }]) {
        assert.equal(masterBattleParryPlan(benefits, { ...incoming, ...blocked }), null, JSON.stringify(blocked));
    }
    assert.equal(masterBattleParryPlan(master(12, 'vanilla'), incoming), null);
    assert.equal(masterBattleParryPlan(master(8), incoming), null);
});

test('Contra-ataque exige erro corpo a corpo ao alcance e seleciona o limiar da variante', () => {
    const incoming = { ...melee, enemyMissed: true, inReach: true, isProficient: true, canAttack: true };
    const benefits = master(12);
    const plan = masterBattleCounterattackPlan(benefits, incoming);
    assert.deepEqual(plan, { roundKey: melee.roundKey, action: 'reacao', threshold: 17, roll: 'natural', allowExtraAttacks: false });
    assert.equal(masterBattleCounterattackHits(plan, { natural: 16, total: 24 }), false);
    assert.equal(masterBattleCounterattackHits(plan, { natural: 17, total: 15 }), true);
    assert.equal(masterBattleCounterattackHits(plan, { natural: 21, total: 24 }), false);
    const vanilla = masterBattleCounterattackPlan(master(12, 'vanilla'), incoming);
    assert.equal(masterBattleCounterattackHits(vanilla, { natural: 16, total: 17 }), true);
    assert.equal(masterBattleCounterattackHits(vanilla, { natural: 17, total: 16 }), false);
    for (const blocked of [{ usedRoundKey: melee.roundKey }, { enemyMissed: false }, { isMelee: false },
        { inReach: false }, { isProficient: false }, { canReact: false }, { canAttack: false },
        { statuses: ['paralisia'] }, { isCounterattack: true }]) {
        assert.equal(masterBattleCounterattackPlan(benefits, { ...incoming, ...blocked }), null, JSON.stringify(blocked));
    }
    assert.equal(masterBattleCounterattackPlan(master(11), incoming), null);
});
