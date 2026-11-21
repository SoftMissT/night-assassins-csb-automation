import assert from 'node:assert/strict';
import test from 'node:test';
import { SETTINGS } from '../scripts/settings.mjs';

import {
    allSlayerClassKeys,
    classUnlocksAtLevel,
    masterBattleLevelElevenPlan,
    selectedSlayerClassKey,
    validateClassContract,
} from '../scripts/slayer/class-contracts.mjs';
import {
    classAbilityAtLevel,
    classEventContext,
    companionOniSocialBonus,
    dualBreathingRankPlan,
    dualBreathingSecondaryPlan,
    mbDamageBonus,
    mbParryReduction,
} from '../scripts/slayer/class-runtime.mjs';

test('seleção vanilla não reutiliza escolha homebrew nem aceita classe Oni', () => {
    const props = { classe_escolhida: 'classe_kakushi' };
    assert.equal(selectedSlayerClassKey(props, 'homebrew'), 'classe_kakushi');
    assert.equal(selectedSlayerClassKey(props, 'vanilla'), null);
    props.na_vanilla_class = 'oni_especializacao_titan';
    assert.equal(selectedSlayerClassKey(props, 'vanilla'), null);
    props.na_vanilla_class = 'classe_mb';
    assert.equal(selectedSlayerClassKey(props, 'vanilla'), 'classe_mb');
    assert.equal(selectedSlayerClassKey(props, 'homebrew'), 'classe_kakushi');
    assert.equal(allSlayerClassKeys('vanilla').length, 5);
});

test('classe vanilla continua independente das variantes de habilidade e metal', () => {
    const previous = globalThis.game;
    try {
        const selection = JSON.stringify({ classes: 'vanilla', habilidades: 'homebrew', metal: 'homebrew' });
        globalThis.game = { settings: { get: (_module, key) => key === SETTINGS.rulesSelection ? selection : undefined } };
        assert.equal(selectedSlayerClassKey({
            na_vanilla_class: 'classe_mb', classe_escolhida: 'classe_kakushi',
        }), 'classe_mb');
    } finally { globalThis.game = previous; }
});

test('Mestre de Batalha vanilla mantém progressão cumulativa sem a Reação Aparar', () => {
    const props = { nvl_pj: 'nvl_11', na_vanilla_class: 'classe_mb' };
    assert.deepEqual(masterBattleLevelElevenPlan(props, 'vanilla'), {
        eligible: true,
        permanentPdv: { formula: '2d6', once: true, stateKey: 'slayer_class_mb_corpo_guerra_applied' },
        parry: undefined,
    });
    assert.equal(masterBattleLevelElevenPlan(
        { ...props, slayer_class_mb_corpo_guerra_applied: 8 }, 'vanilla',
    ).permanentPdv, null);
    assert.equal(classAbilityAtLevel('classe_mb', 12, 'vanilla').ability.counterattackThreshold, 17);
    assert.equal(classEventContext({ props, level: 12, event: 'basic-critical', profile: 'vanilla' }).applicable, true);
    assert.equal(classEventContext({ props, level: 11, event: 'physical-melee-damage', profile: 'vanilla' }).applicable, false);
    assert.equal(mbParryReduction('S', 5, 'vanilla'), 0);
    assert.equal(mbDamageBonus('SS', 'vanilla'), 4);
});

test('Beginning Hour preserva progressão própria da segunda Respiração e Companheiro de Oni', () => {
    const key = 'classe_usuario_de_duas_resp';
    assert.deepEqual(validateClassContract(key, 'vanilla'), { valid: true, ranks: [] });
    assert.deepEqual(classUnlocksAtLevel(key, 14, 'vanilla'), []);
    assert.equal(dualBreathingRankPlan('SS', 'vanilla'), null);
    assert.deepEqual([1, 2, 5, 6, 9, 10, 13, 14].map(level => dualBreathingSecondaryPlan(level, true, 'vanilla').level),
        [0, 1, 1, 2, 2, 3, 3, 4]);
    assert.deepEqual(dualBreathingSecondaryPlan(10, false, 'vanilla').cost, { pdr: 2, pdv: 2 });
    assert.equal(companionOniSocialBonus('SS', 'vanilla'), 2);
});
