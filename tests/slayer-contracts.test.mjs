import test from 'node:test';
import assert from 'node:assert/strict';
import {
    allSlayerOriginKeys,
    originUnlocksAtLevel,
    validateOriginContract,
} from '../scripts/slayer/origin-contracts.mjs';
import {
    allSlayerClassKeys,
    classRankAtLevel,
    classUnlocksAtLevel,
    masterBattleLevelElevenPlan,
    validateClassContract,
} from '../scripts/slayer/class-contracts.mjs';

test('as 12 Origens possuem PDV/PDR e habilidades nos níveis 1 e 6', () => {
    const keys = allSlayerOriginKeys();
    assert.equal(keys.length, 12);
    for (const key of keys) assert.equal(validateOriginContract(key).valid, true, key);
});

test('habilidade de Origem nível 6 não aparece antes do nível 6', () => {
    assert.equal(originUnlocksAtLevel('origem_samurai', 5).length, 1);
    assert.deepEqual(
        originUnlocksAtLevel('origem_samurai', 6).map(({ id }) => id),
        ['bushido', 'iaido']
    );
});

test('as cinco Classes possuem contratos C, B, A, S e SS', () => {
    const keys = allSlayerClassKeys();
    assert.equal(keys.length, 5);
    for (const key of keys)
        assert.deepEqual(validateClassContract(key), {
            valid: true,
            ranks: ['C', 'B', 'A', 'S', 'SS'],
        });
});

test('rank de Classe segue 4/6/8/11/12', () => {
    assert.equal(classRankAtLevel(3), null);
    assert.equal(classRankAtLevel(4), 'C');
    assert.equal(classRankAtLevel(6), 'B');
    assert.equal(classRankAtLevel(8), 'A');
    assert.equal(classRankAtLevel(11), 'S');
    assert.equal(classRankAtLevel(12), 'SS');
    assert.equal(classUnlocksAtLevel('classe_mb', 11).at(-1).id, 'corpo_guerra');
});

test('Mestre de Batalha nível 11 planeja Corpo de Guerra uma única vez e Aparar por rodada', () => {
    const first = masterBattleLevelElevenPlan({ nvl_num: 11, classe_escolhida: 'classe_mb' });
    assert.equal(first.eligible, true);
    assert.deepEqual(first.permanentPdv, {
        formula: '2d6',
        once: true,
        stateKey: 'slayer_class_mb_corpo_guerra_applied',
    });
    assert.equal(first.parry.cycle, 'round');
    assert.equal(first.parry.uses, 1);
    assert.equal(first.parry.formula, '1d6 + weaponDefenseAttribute');

    const repeated = masterBattleLevelElevenPlan({
        nvl_num: 11,
        classe_escolhida: 'classe_mb',
        slayer_class_mb_corpo_guerra_applied: 1,
    });
    assert.equal(repeated.permanentPdv, null);
});

test('Mestre de Batalha nível 11 não ativa para outra classe ou nível anterior', () => {
    assert.equal(
        masterBattleLevelElevenPlan({ nvl_num: 10, classe_escolhida: 'classe_mb' }).eligible,
        false
    );
    assert.equal(
        masterBattleLevelElevenPlan({ nvl_num: 11, classe_escolhida: 'classe_kakushi' }).eligible,
        false
    );
});
