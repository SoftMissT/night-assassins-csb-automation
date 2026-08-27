import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildMetalBreathingPlan } from '../scripts/metal-breathing-service.mjs';
import {
    actorMetalHammerSynergy,
    buildInabalavelOpportunityDamage,
    metalHammerSynergyAllies,
    slayerPdrAvailable,
    spendMetalHammerSynergyPdr,
} from '../scripts/metal-runtime.mjs';

function actor(uuid, breathing, props = {}) {
    return {
        uuid,
        name: uuid,
        items: breathing ? [{ system: { props: { respiracao_nome: breathing } } }] : [],
        system: { props: { pdr_slayer_total_conta: 10, pdr_slayer_gasto_valor: 0, ...props } },
    };
}

describe('Runtime da Respiração do Metal', () => {
    it('reconhece as três sinergias do Martelo sem depender de acentos ou caixa', () => {
        assert.equal(actorMetalHammerSynergy(actor('a', 'Chamas')), 'chamas');
        assert.equal(actorMetalHammerSynergy(actor('b', 'PEDRA')), 'pedra');
        assert.equal(actorMetalHammerSynergy(actor('c', 'Magma')), 'magma');
        assert.equal(actorMetalHammerSynergy(actor('d', 'Água')), '');
    });

    it('lista apenas aliado sinérgico presente com PDR disponível', () => {
        const attacker = actor('attacker', 'Metal');
        const eligible = actor('eligible', 'Pedra', { pdr_slayer_gasto_valor: 9 });
        const empty = actor('empty', 'Chamas', { pdr_slayer_gasto_valor: 10 });
        const wrong = actor('wrong', 'Água');
        const enemy = actor('enemy', 'Pedra');
        const listed = metalHammerSynergyAllies(
            attacker,
            [attacker, eligible, empty, wrong, enemy],
            { isAlly: (candidate) => candidate.uuid !== 'enemy' }
        );
        assert.deepEqual(
            listed.map(({ uuid }) => uuid),
            ['eligible']
        );
        assert.equal(listed[0].pdrAvailable, 1);
    });

    it('calcula e cobra 1 PDR na chave canônica do aliado', () => {
        const ally = actor('ally', 'Magma', { pdr_slayer_gasto_valor: 3, pdr_slayer_curado: 1 });
        assert.equal(slayerPdrAvailable(ally.system.props), 8);
        assert.deepEqual(spendMetalHammerSynergyPdr(ally).patch, {
            'system.props.pdr_slayer_gasto_valor': 4,
        });
        assert.equal(
            spendMetalHammerSynergyPdr(actor('empty', 'Pedra', { pdr_slayer_gasto_valor: 10 })).ok,
            false
        );
    });

    it('gera dano de oportunidade somente no 1 natural seguido de acerto', () => {
        const state = buildMetalBreathingPlan('metal_02', 4, {}).state;
        assert.equal(
            buildInabalavelOpportunityDamage(state, { enemyNatural: 2, opportunityHit: true })
                .entries.length,
            0
        );
        assert.equal(
            buildInabalavelOpportunityDamage(state, { enemyNatural: 1, opportunityHit: false })
                .entries.length,
            0
        );
        assert.deepEqual(
            buildInabalavelOpportunityDamage(state, { enemyNatural: 1, opportunityHit: true })
                .entries,
            [{ tipoAcao: 'reacao', dado: '4d4', fixo: 0, attrs: [], tiposDano: ['concussao'] }]
        );
    });
});
