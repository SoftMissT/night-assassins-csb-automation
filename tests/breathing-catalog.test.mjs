import { setupFoundryMocks } from './fixtures/foundry-mock.mjs';
setupFoundryMocks();

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    breathingFormsFromCatalog,
    importBreathingForms,
    loadBreathingCatalog,
    resolveBreathTemplateId,
} from '../scripts/breathing-catalog.mjs';

function form(id, breathing, formaId, ordem) {
    return {
        _id: id,
        _key: `!items!${id}`,
        name: `${breathing} ${formaId}`,
        type: 'equippableItem',
        folder: 'pasta',
        system: {
            template: 'NABreathTpl00001',
            props: { respiracao_nome: breathing, forma_id: formaId, forma_ordem: ordem },
        },
    };
}

const documents = [
    form('b', 'Chamas', 'chamas_02', 2),
    form('a', 'Chamas', 'chamas_01', 1),
    form('h', 'Chamas', 'hub_chamas', 0),
    form('p', 'Pedra', 'pedra_01', 1),
    { _id: 'pasta', type: 'Item', name: 'Pasta' },
];

function owner({ isOwner = true } = {}) {
    const created = [];
    return {
        created,
        isOwner,
        items: [],
        async createEmbeddedDocuments(type, data) {
            created.push({ type, data });
            return data;
        },
    };
}

describe('Formas de Respiração e espelho interno', () => {
    it('o catálogo interno distribuído traz as Formas das 11 Respirações publicadas', async () => {
        const catalog = await loadBreathingCatalog();
        const names = new Set(
            catalog
                .filter((document) => document.type === 'equippableItem')
                .map((document) => document.system.props.respiracao_nome)
        );
        assert.deepEqual([...names].sort(), [
            'Água', 'Chamas', 'Eclipse', 'Metal', 'Neve', 'Névoa', 'Pedra', 'Raposa', 'Som', 'Sonhos', 'Vento',
        ].sort());
    });

    it('seleciona as Formas da Respiração pedida, sem o hub, na ordem', () => {
        const forms = breathingFormsFromCatalog(documents, 'chamas');
        assert.deepEqual(
            forms.map((entry) => entry.system.props.forma_id),
            ['chamas_01', 'chamas_02']
        );
    });

    it('importa uma vez para a ficha, sem _id/_key/pasta e com o template do mundo', async () => {
        const actor = owner();
        const result = await importBreathingForms(actor, 'Chamas', {
            documents,
            templateId: 'tplDoMundo',
        });
        assert.equal(result.ok, true);
        assert.equal(actor.created.length, 1);
        const [{ type, data }] = actor.created;
        assert.equal(type, 'Item');
        assert.equal(data.length, 2);
        for (const entry of data) {
            assert.equal('_id' in entry, false);
            assert.equal('_key' in entry, false);
            assert.equal('folder' in entry, false);
            assert.equal(entry.system.template, 'tplDoMundo');
            assert.equal(entry.flags['night-assassins-csb-automation'].breathingImported, true);
        }
    });

    it('quem não é dono da ficha não escreve nada', async () => {
        const actor = owner({ isOwner: false });
        const result = await importBreathingForms(actor, 'Chamas', {
            documents,
            templateId: 'tplDoMundo',
        });
        assert.equal(result.ok, false);
        assert.equal(actor.created.length, 0);
    });

    it('adiciona só a Batida de Martelo que falta em uma ficha Metal antiga', async () => {
        const actor = owner();
        const catalog = await loadBreathingCatalog();
        const owned = breathingFormsFromCatalog(catalog, 'Metal')
            .filter(form => form.system.props.forma_id !== 'metal_07');
        actor.items.push(...owned);
        const result = await importBreathingForms(actor, 'Metal', {
            documents: catalog, templateId: 'tplDoMundo',
        });
        assert.equal(result.ok, true);
        assert.deepEqual(actor.created[0].data.map(item => item.system.props.forma_id), ['metal_07']);
        assert.equal(actor.items.length, owned.length);
    });

    it('sem template de Forma no mundo, não cria Item órfão', async () => {
        const actor = owner();
        const result = await importBreathingForms(actor, 'Chamas', { documents, templateId: '' });
        assert.equal(result.ok, false);
        assert.match(result.reason, /template/iu);
        assert.equal(actor.created.length, 0);
    });

    it('ignora referência órfã e encontra template importado com outro ID', async () => {
        const previous = game.items;
        const imported = {
            id: 'novaIdNoMundo0001',
            type: '_equippableItemTemplate',
            system: { uniqueId: 'NABreathTpl00001' },
        };
        const actor = owner();
        actor.items.push({
            system: { template: 'idAusente', props: { inventario_categoria: 'respiracao' } },
        });
        game.items = {
            get: (id) => id === imported.id ? imported : undefined,
            find: (predicate) => predicate(imported) ? imported : undefined,
        };
        try {
            assert.equal(await resolveBreathTemplateId(actor), imported.id);
        } finally {
            game.items = previous;
        }
    });
});
