import assert from 'node:assert/strict';
import test, { describe } from 'node:test';

import { createSpecialWeapon, specialWeaponData } from '../scripts/item-creator.mjs';

describe('criador de Arma Especial', () => {
    test('normaliza vínculo, estado selado e JSONs do runtime', () => {
        const data = specialWeaponData({
            name: '  Lâmina de Teste  ',
            entity: 'Entidade',
            demon: 'Demônio',
            dominantSide: 'Equilibrado',
            bondIntensity: 'Alta',
            bondValue: '3',
            sealedName: 'Forma Selada',
            firstAwakening: 'Primeiro Despertar',
            ritual: 'Ritual',
            description: 'Linha 1\nLinha 2',
            rules: 'Regra',
        });
        assert.equal(data.name, 'Lâmina de Teste');
        assert.equal(data.system.props.inventario_categoria, 'arma');
        assert.equal(data.system.props.arma_categoria, 'especial');
        assert.equal(data.system.props.arma_especial_estado_atual, 'Selado');
        assert.equal(data.system.props.arma_especial_forma_atual, 'Forma Selada');
        assert.equal(data.system.props.arma_vinculo_valor, 3);
        const vinculo = JSON.parse(data.system.props.dupla_alma_vinculo_json);
        assert.equal(vinculo.entidade, 'Entidade');
        assert.equal(vinculo.demonio, 'Demônio');
        assert.equal(vinculo.valor, 3);
        const estados = JSON.parse(data.system.props.arma_especial_estados_json);
        assert.equal(estados[0].id, 'selado');
        assert.equal(estados[1].id, 'primeiro_despertar');
        assert.equal(estados[1].ritual, 'Ritual');
        assert.equal(data.system.props.descricao, '<p>Linha 1<br>Linha 2</p>');
        assert.equal(data.system.props.dupla_alma_cerimonia_json, '{}');
    });

    test('rejeita nome vazio e usa nomes padrão de estado', () => {
        assert.equal(specialWeaponData({ name: ' ' }), null);
        const data = specialWeaponData({ name: 'Arma' });
        assert.equal(data.system.props.arma_especial_forma_atual, 'Forma Selada');
        const estados = JSON.parse(data.system.props.arma_especial_estados_json);
        assert.equal(estados[1].forma, 'Primeiro Despertar');
    });

    test('cria no Actor uma vez com o template e as flags do criador', async () => {
        const created = [];
        const actor = {
            isOwner: true,
            async createEmbeddedDocuments(type, data, options) {
                created.push({ type, data, options });
                return data.map((entry) => ({
                    ...entry,
                    id: 'new-weapon',
                    templateSystem: { reloadTemplate: async () => {} },
                    sheet: { render: () => {} },
                }));
            },
        };
        const result = await createSpecialWeapon(
            actor,
            { name: 'Lâmina', entity: 'Entidade' },
            { templateId: 'NASpecialWeaponTpl00001' }
        );
        assert.equal(result.ok, true);
        assert.equal(created[0].type, 'Item');
        assert.equal(created[0].data[0].system.template, 'NASpecialWeaponTpl00001');
        assert.equal(created[0].options.naSpecialWeapon, true);
    });

    test('cria nos Itens do mundo quando não há Actor', async () => {
        const previous = globalThis.Item;
        let created;
        globalThis.Item = {
            implementation: {
                createDocuments: async ([data]) => {
                    created = data;
                    return [{
                        ...data,
                        templateSystem: { reloadTemplate: async () => {} },
                        sheet: { render: () => {} },
                    }];
                },
            },
        };
        try {
            const result = await createSpecialWeapon(null, { name: 'Lâmina do Mundo' });
            assert.equal(result.ok, true);
            assert.equal(created.name, 'Lâmina do Mundo');
            assert.equal(created.system.props.arma_nome, 'Lâmina do Mundo');
        } finally {
            globalThis.Item = previous;
        }
    });
});
