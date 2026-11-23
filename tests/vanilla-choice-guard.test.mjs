import test from 'node:test';
import assert from 'node:assert/strict';
import { guardVanillaChoices, vanillaChoiceViolation } from '../scripts/vanilla-choice-guard.mjs';

test('Metal Preto só com a origem Descendente', () => {
    assert.match(vanillaChoiceViolation('metal_preto', 'origem_aldeao'), /Metal Preto exige a origem Descendente/);
    assert.equal(vanillaChoiceViolation('metal_preto', 'origem_descendente'), null);
    assert.equal(vanillaChoiceViolation('metal_alvorada', ''), null);
});

test('select direto na ficha: escolha inválida é desfeita e o resto da gravação segue', () => {
    const warnings = [];
    globalThis.ui = { notifications: { warn: (message) => warnings.push(message) } };
    const actor = { system: { props: { na_vanilla_origin: 'origem_aldeao', na_vanilla_metal: '' } } };
    const changes = { system: { props: { na_vanilla_metal: 'metal_preto', npc_nivel: 3 } } };
    guardVanillaChoices(actor, changes);
    assert.equal(Object.hasOwn(changes.system.props, 'na_vanilla_metal'), false);
    assert.equal(changes.system.props.npc_nivel, 3);
    assert.equal(warnings.length, 1);
});

test('trocar a origem de Descendente com Metal Preto escolhido é barrado', () => {
    globalThis.ui = { notifications: { warn: () => {} } };
    const actor = { system: { props: { na_vanilla_origin: 'origem_descendente', na_vanilla_metal: 'metal_preto' } } };
    const changes = { system: { props: { na_vanilla_origin: 'origem_isolado' } } };
    guardVanillaChoices(actor, changes);
    assert.equal(Object.hasOwn(changes.system.props, 'na_vanilla_origin'), false);
});

test('combinação válida passa intacta', () => {
    const actor = { system: { props: { na_vanilla_origin: '' } } };
    const changes = { system: { props: { na_vanilla_origin: 'origem_descendente', na_vanilla_metal: 'metal_preto' } } };
    guardVanillaChoices(actor, changes);
    assert.equal(changes.system.props.na_vanilla_metal, 'metal_preto');
    assert.equal(changes.system.props.na_vanilla_origin, 'origem_descendente');
});

test('formulário inteiro da ficha (chaves pontilhadas e valores repetidos) também é barrado', () => {
    globalThis.ui = { notifications: { warn: () => {} } };
    const actor = { system: { props: { na_vanilla_origin: 'origem_descendente', na_vanilla_metal: 'metal_preto' } } };
    const changes = {
        name: 'QA npc',
        'system.props.na_vanilla_origin': 'origem_aldeao',
        'system.props.na_vanilla_metal': 'metal_preto',
        'system.props.npc_nivel': '5',
    };
    guardVanillaChoices(actor, changes);
    assert.equal(Object.hasOwn(changes, 'system.props.na_vanilla_origin'), false, 'origem inválida desfeita');
    assert.equal(changes['system.props.na_vanilla_metal'], 'metal_preto', 'metal igual ao atual não é tocado');
    assert.equal(changes['system.props.npc_nivel'], '5');
});
