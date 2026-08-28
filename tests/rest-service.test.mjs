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
