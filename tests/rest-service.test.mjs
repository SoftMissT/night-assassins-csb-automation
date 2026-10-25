import assert from 'node:assert/strict';
import test from 'node:test';

import { setupFoundryMocks } from './fixtures/foundry-mock.mjs';
setupFoundryMocks();

import { buildRestPatch, resolveRestTier, restEligibleStatuses } from '../scripts/rest-service.mjs';

function baseProps(overrides = {}) {
    return {
        pdv_slayer_total_conta: 20,
        pdv_slayer_dano_ferida: 2,
        pdv_slayer_extra: 0,
        pdv_slayer_dano_tomado: 10,
        pdv_slayer_curado: 2,
        pdr_slayer_total_conta: 12,
        metal_slayer_pdr_bonus: 4,
        pdr_slayer_extra: 0,
        pdr_slayer_gasto_valor: 10,
        pdr_slayer_curado: 2,
        folego_slayer_maximo: 6,
        folego_slayer_atual: 1,
        status_slayer_dados: JSON.stringify({
            version: 2,
            active: ['amedrontado', 'fadiga_corporal', 'fratura'],
            exhaustion: 5,
            effects: { amedrontado: { remainingTurns: 2 }, fratura: { remainingTurns: null } },
            exhaustionMilestones: [5],
        }),
        ...overrides,
    };
}

test('interrupção rebaixa o descanso para o benefício realmente alcançado', () => {
    assert.equal(resolveRestTier('field', 1.5), null);
    assert.equal(resolveRestTier('complete', 5), 'field');
    assert.equal(resolveRestTier('deep', 10), 'complete');
    assert.equal(resolveRestTier('deep', 24), 'deep');
});

test('Descanso de Campo recupera PDV rolado, metade do PDR máximo e Fôlego', () => {
    const result = buildRestPatch(baseProps(), {
        tier: 'field',
        fieldPdvRoll: 7,
        removeStatuses: ['amedrontado', 'fadiga_corporal'],
        record: { tier: 'field' },
    });
    assert.equal(result.pdvRecovered, 7);
    assert.equal(result.pdrRecovered, 8);
    assert.equal(result.patch['system.props.pdv_slayer_curado'], 9);
    assert.equal(result.patch['system.props.pdr_slayer_curado'], 10);
    assert.equal(result.patch['system.props.folego_slayer_atual'], 6);
    assert.deepEqual(result.removed, ['amedrontado']);
    assert.equal(result.exhaustion, 5);
});

test('Descanso Completo restaura recursos, reduz Exaustão 2 e remove Fadigas autorizadas', () => {
    const result = buildRestPatch(baseProps(), {
        tier: 'complete',
        removeStatuses: ['fadiga_corporal', 'fratura'],
        record: { tier: 'complete' },
    });
    assert.equal(result.patch['system.props.pdv_slayer_dano_tomado'], 0);
    assert.equal(result.patch['system.props.pdr_slayer_gasto_valor'], 0);
    assert.equal(result.patch['system.props.folego_slayer_atual'], 6);
    assert.equal(result.exhaustion, 3);
    assert.deepEqual(result.removed, ['fadiga_corporal']);
    assert.ok(
        JSON.parse(result.patch['system.props.status_slayer_dados']).active.includes('fratura')
    );
});

test('Recuperação Profunda pode zerar Exaustão sem apagar Fratura automaticamente', () => {
    const result = buildRestPatch(baseProps(), {
        tier: 'deep',
        deepExhaustion: 'clear',
        removeStatuses: ['fadiga_corporal'],
        record: { tier: 'deep' },
    });
    assert.equal(result.exhaustion, 0);
    assert.deepEqual(result.removed, ['fadiga_corporal']);
    assert.ok(
        JSON.parse(result.patch['system.props.status_slayer_dados']).active.includes('fratura')
    );
});

test('Recuperação Profunda aplica tratamento de Fratura e Ferida somente quando autorizado', () => {
    const result = buildRestPatch(baseProps(), {
        tier: 'deep',
        deepExhaustion: 'reduce4',
        removeStatuses: ['fratura'],
        woundHealing: 1,
        record: { tier: 'deep' },
    });
    assert.equal(result.patch['system.props.pdv_slayer_dano_ferida'], 1);
    assert.equal(result.woundHealing, 1);
    assert.ok(
        !JSON.parse(result.patch['system.props.status_slayer_dados']).active.includes('fratura')
    );
});

test('Respiração da Recuperação: Fadigas exigem descanso completo e Ofegante nunca é removido', () => {
    assert.equal(restEligibleStatuses('field').includes('fadiga_espiritual'), false);
    assert.equal(restEligibleStatuses('complete').includes('fadiga_espiritual'), true);
    assert.equal(restEligibleStatuses('complete').includes('fadiga_mental'), true);
    assert.equal(restEligibleStatuses('deep').includes('ofegante'), false);
});

test('PDV temporário (extra) acaba no Descanso Completo e na Profunda, mas fica no de Campo', () => {
    const props = baseProps({ pdv_slayer_extra: 7 });
    const field = buildRestPatch(props, { tier: 'field', fieldPdvRoll: 4, record: {} });
    assert.equal(field.patch['system.props.pdv_slayer_extra'], undefined);
    for (const tier of ['complete', 'deep']) {
        const rest = buildRestPatch(props, { tier, record: {} });
        assert.equal(rest.patch['system.props.pdv_slayer_extra'], 0, tier);
        assert.equal(rest.temporaryCleared, true);
        // O PDV real volta ao máximo sem o temporário: 20 - 2 de Ferida.
        assert.equal(rest.resources.pdvMaximum, 18, tier);
    }
});

function oniProps(overrides = {}) {
    return {
        vit_display: 3,
        pdv_oni_total_conta: 40,
        pdv_oni_dano_ferida: 0,
        pdv_oni_extra: 0,
        pdv_oni_dano_tomado: 25,
        pdv_oni_curado: 0,
        pdk_oni_total_conta: 10,
        pdk_oni_extra: 0,
        pdk_oni_gasto_valor: 8,
        pdk_oni_curado: 0,
        status_oni_dados: JSON.stringify({ version: 2, active: [], exhaustion: 3, effects: {} }),
        ...overrides,
    };
}

test('Oni: Descanso Completo enche PDV e PDK, reduz Exaustão e guarda o registro na flag', () => {
    const rest = buildRestPatch(oniProps(), { tier: 'complete', record: { tier: 'complete' } });
    assert.equal(rest.kind, 'oni');
    assert.equal(rest.energyLabel, 'PDK');
    assert.equal(rest.pdvRecovered, 25);
    assert.equal(rest.pdrRecovered, 8);
    assert.equal(rest.patch['system.props.pdv_oni_dano_tomado'], 0);
    assert.equal(rest.patch['system.props.pdk_oni_gasto_valor'], 0);
    assert.equal(rest.patch['system.props.status_oni_exaustao'], 1);
    assert.deepEqual(rest.patch['flags.night-assassins-csb-automation.restRecord'], { tier: 'complete' });
    assert.equal(rest.patch['system.props.folego_slayer_atual'], undefined, 'Oni não tem Fôlego');
    assert.ok(!Object.keys(rest.patch).some((key) => key.includes('slayer')), 'nada de campo de Slayer');
});

test('Oni: Campo dá metade do PDK e 1d4 × VIT de PDV', () => {
    const rest = buildRestPatch(oniProps(), { tier: 'field', fieldPdvRoll: 9, record: {} });
    assert.equal(rest.pdvRecovered, 9);
    assert.equal(rest.pdrRecovered, 5);
    assert.equal(rest.patch['system.props.pdk_oni_curado'], 5);
});

test('Oni com Regeneração Suprimida recupera PDK, mas não PDV', () => {
    const props = oniProps({
        status_oni_dados: JSON.stringify({ version: 2, active: ['regeneracao_suprimida'], exhaustion: 0, effects: {} }),
    });
    for (const tier of ['field', 'complete']) {
        const rest = buildRestPatch(props, { tier, fieldPdvRoll: 9, record: {} });
        assert.equal(rest.pdvBlocked, true, tier);
        assert.equal(rest.pdvRecovered, 0, tier);
        assert.equal(rest.patch['system.props.pdv_oni_dano_tomado'], undefined, tier);
        assert.ok(rest.pdrRecovered > 0, tier);
    }
});
