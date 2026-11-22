import assert from 'node:assert/strict';
import test, { describe } from 'node:test';

import {
    catalogItemChoices,
    catalogItemData,
    createCatalogItem,
    createGenericItem,
    genericItemData,
    GENERIC_ITEM_ICON,
} from '../scripts/item-creator.mjs';

const source = {
    _id: 'weapon-1',
    _key: '!items!weapon-1',
    folder: 'folder-1',
    _stats: { compendiumSource: 'Compendium.na.weapon' },
    name: 'Katana',
    type: 'equippableItem',
    system: { template: 'NAWeaponTpl00001', props: { arma_nome: 'Katana', arma_categoria: 'basica' } },
};

describe('criador de Item do catálogo', () => {
    test('lista somente documentos de Item com arma', () => {
        assert.deepEqual(catalogItemChoices([source, { type: 'Folder', name: 'x' }]), [
            { id: 'weapon-1', name: 'Katana', category: 'basica' },
        ]);
    });

    test('remove metadados do pack e marca a origem', () => {
        const data = catalogItemData(source);
        assert.equal(data._id, undefined);
        assert.equal(data.folder, undefined);
        assert.equal(data.system.template, 'NAWeaponTpl00001');
        assert.equal(data.flags['night-assassins-csb-automation'].createdFromCatalog, true);
    });

    test('preserva template especial quando o catálogo fornece outro template', () => {
        const data = catalogItemData({
            ...source,
            system: { ...source.system, template: 'NASpecialWeaponTpl00001', props: { ...source.system.props, arma_categoria: 'especial' } },
        });
        assert.equal(data.system.template, 'NASpecialWeaponTpl00001');
    });

    test('cria o Item no Actor uma vez', async () => {
        const created = [];
        const actor = { isOwner: true, async createEmbeddedDocuments(type, data, options) {
            created.push({ type, data, options });
            return data.map((entry) => ({ ...entry, id: 'new-item' }));
        } };
        const result = await createCatalogItem(actor, source);
        assert.equal(result.ok, true);
        assert.equal(created[0].type, 'Item');
        assert.equal(created[0].data[0].name, 'Katana');
        assert.equal(created[0].options.naCatalogItem, true);
    });
});

describe('criador de Item genérico', () => {
    test('normaliza categoria, uso, quantidade e espaço', () => {
        const data = genericItemData({
            name: '  Poção de Glicínia  ',
            category: 'veneno',
            usage: 'reacao',
            quantity: '3',
            spaces: '1',
            effect: ' Cura 3d6 PDV ',
            description: 'Teste',
        });
        assert.equal(data.name, 'Poção de Glicínia');
        assert.equal(data.system.props.inventario_categoria, 'item');
        assert.equal(data.system.props.item_categoria, 'veneno');
        assert.equal(data.system.props.item_uso, 'reacao');
        assert.equal(data.system.props.item_quantidade, 3);
        assert.equal(data.system.props.item_espacos, 1);
        assert.equal(data.system.props.item_efeito, 'Cura 3d6 PDV');
        assert.equal(data.img, GENERIC_ITEM_ICON);
    });

    test('rejeita nome vazio e cai em Outro/Ação', () => {
        assert.equal(genericItemData({ name: '  ' }), null);
        const data = genericItemData({
            name: 'Bugiganga',
            category: 'inexistente',
            usage: 'inexistente',
        });
        assert.equal(data.system.props.item_categoria, 'outro');
        assert.equal(data.system.props.item_uso, 'acao');
        assert.equal(data.system.props.item_quantidade, 0);
    });

    test('cria o Item no Actor uma vez com o template resolvido', async () => {
        const created = [];
        const actor = {
            isOwner: true,
            async createEmbeddedDocuments(type, data, options) {
                created.push({ type, data, options });
                return data.map((entry) => ({
                    ...entry,
                    id: 'new-item',
                    templateSystem: { reloadTemplate: async () => {} },
                    sheet: { render: () => {} },
                }));
            },
        };
        const result = await createGenericItem(
            actor,
            { name: 'Poção', category: 'consumivel' },
            { templateId: 'NAGenericItem001' }
        );
        assert.equal(result.ok, true);
        assert.equal(created[0].type, 'Item');
        assert.equal(created[0].data[0].system.template, 'NAGenericItem001');
        assert.equal(created[0].options.naGenericItem, true);
        assert.equal(created[0].data[0].system.props.item_categoria, 'consumivel');
    });
});
