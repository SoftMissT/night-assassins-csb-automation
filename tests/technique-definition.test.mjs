import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    normalizeTechniqueDefinition,
    splitDamageTotal,
    validateTechniqueDefinition,
} from '../scripts/core/technique-definition.mjs';
import {
    normalizeBreathingTechnique,
    normalizeWeaponTechnique,
} from '../scripts/items/item-technique-normalizers.mjs';

describe('TechniqueDefinition', () => {
    it('normaliza custos, alvo, acerto, dano, status e ciclo', () => {
        const result = validateTechniqueDefinition({
            id: 'test:technique',
            name: 'Técnica',
            sourceFamily: 'kekkijutsu',
            ownerKind: 'oni',
            costs: {
                actions: ['especial'],
                resources: [{ resource: 'pdk', amount: 3, refund: 'cancel' }],
            },
            targeting: { mode: 'area', count: 3, range: 12, area: { shape: 'cone', meters: 6 } },
            attack: { attribute: 'car', count: 2 },
            damage: [{ formula: '2d8', types: ['fogo'], split: { group: 'elemental', weight: 2 } }],
            statuses: [{ id: 'em-chamas', lifecycle: { scope: 'turn', duration: 2, tick: 'end' } }],
            lifecycle: { scope: 'combat' },
        });
        assert.equal(result.ok, true);
        assert.equal(result.definition.costs.actions[0].type, 'especial');
        assert.equal(result.definition.costs.resources[0].resource, 'pdk');
        assert.equal(result.definition.attack.attribute, 'CAR');
        assert.equal(result.definition.attack.sequential, true);
        assert.equal(result.definition.statuses[0].lifecycle.duration, 2);
    });

    it('rejeita status temporal sem duração e parcela vazia', () => {
        const result = validateTechniqueDefinition({
            id: 'invalid',
            sourceFamily: 'breathing',
            ownerKind: 'slayer',
            damage: [{}],
            statuses: [{ id: 'sangramento', lifecycle: { scope: 'turn' } }],
        });
        assert.equal(result.ok, false);
        assert.match(result.errors.join(' '), /fonte de dano/iu);
        assert.match(result.errors.join(' '), /exige duration/iu);
    });

    it('divide dano por peso conservando exatamente o total', () => {
        const result = splitDamageTotal(11, [
            {
                id: 'corte',
                types: ['cortante'],
                split: { group: 'hit', weight: 1, rounding: 'floor' },
            },
            { id: 'fogo', types: ['fogo'], split: { group: 'hit', weight: 1, rounding: 'floor' } },
        ]);
        assert.deepEqual(
            result.map((entry) => entry.amount),
            [5, 6]
        );
        assert.equal(
            result.reduce((sum, entry) => sum + entry.amount, 0),
            11
        );
    });

    it('preserva políticas distintas por parcela', () => {
        const definition = normalizeTechniqueDefinition({
            id: 'split',
            sourceFamily: 'weapon',
            ownerKind: 'slayer',
            damage: [
                { formula: '1d8', types: ['cortante'], resistancePolicy: 'normal' },
                {
                    fixed: 3,
                    types: ['ferida'],
                    criticalPolicy: 'none',
                    resistancePolicy: 'ignore',
                    woundPolicy: 'always',
                },
            ],
        });
        assert.equal(definition.damage[1].criticalPolicy, 'none');
        assert.equal(definition.damage[1].resistancePolicy, 'ignore');
        assert.equal(definition.damage[1].woundPolicy, 'always');
    });
});

describe('normalizadores de Item', () => {
    it('transforma perfil de arma em definição executável', () => {
        const result = normalizeWeaponTechnique({
            uuid: 'Item.weapon',
            system: {
                props: {
                    arma_nome: 'Katana',
                    arma_critico: 19,
                    arma_alcance: '1,5m',
                    arma_propriedades: 'Acuidade / Morote',
                    arma_perfis_ataque: [
                        {
                            nome: 'Corte',
                            dano_fixo: 4,
                            dano_dados: '1d8',
                            atributos: [{ key: 'DEX', multiplicador: 0.5 }],
                            tipos_dano: ['cortante'],
                        },
                    ],
                },
            },
        });
        assert.equal(result.ok, true);
        assert.equal(result.definition.sourceItemUuid, 'Item.weapon');
        assert.equal(result.definition.attack.critical.threshold, 19);
        assert.equal(result.definition.damage[0].attributeTerms[0].multiplier, 0.5);
        assert.equal(result.definition.costs.actions[0].type, 'ataque');
    });

    it('transforma nível de Respiração sem fingir duração ausente', () => {
        const result = normalizeBreathingTechnique(
            {
                uuid: 'Item.breath',
                system: {
                    props: {
                        forma_id: 'neve_01',
                        respiracao_nome: 'Neve',
                        nome_forma: 'Nevasca',
                        tipo_manobra: 'Ação Especial',
                        nivel_req: 1,
                        nvl2_custo: 3,
                        nvl2_dano: '2d6 + @dex',
                        nvl2_tipos_dano: 'congelante',
                        nvl2_status: 'Congelar',
                    },
                },
            },
            { level: 2 }
        );
        assert.equal(result.ok, true);
        assert.equal(result.definition.costs.resources[0].amount, 3);
        assert.equal(result.definition.costs.actions[0].type, 'especial');
        assert.equal(result.definition.statuses[0].lifecycle.scope, 'manual');
        assert.equal(result.definition.metadata.level, 2);
    });

    it('passiva não reserva ação nem cria acerto', () => {
        const result = normalizeBreathingTechnique({
            system: {
                props: {
                    forma_id: 'metal_05',
                    respiracao_nome: 'Metal',
                    nome_forma: 'Martelo',
                    tipo_manobra: 'Passiva',
                    forma_passiva: 1,
                    nvl1_custo: 0,
                },
            },
        });
        assert.equal(result.ok, true);
        assert.deepEqual(result.definition.costs.actions, []);
        assert.equal(result.definition.attack, null);
        assert.equal(result.definition.metadata.passive, true);
    });
});
