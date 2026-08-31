import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { describe, it } from 'node:test';

const catalogUrl = new URL('../catalogs/consumables.json', import.meta.url);

describe('catálogo de consumíveis HonMoon', () => {
    it('publica quatro alimentos, quatro energéticos e uma água sem duplicar Items', async () => {
        const catalog = JSON.parse(await readFile(catalogUrl, 'utf8'));
        const items = catalog.documents.filter((document) => document.type === 'equippableItem');
        assert.equal(items.length, 6);
        assert.equal(new Set(items.map(({ _id }) => _id)).size, 6);
        assert.deepEqual(
            Object.fromEntries(items.map((item) => [item.name, item.system.props.consumivel_quantidade])),
            {
                'Kkoedori de HonMoon': 1,
                'Dalgona Amargo': 1,
                'Choco Pie sem Selo': 1,
                'Kimbap Triangular Vencido': 1,
                'Energético': 4,
                'Água': 1,
            }
        );
        assert.ok(items.every((item) => item.system.template === 'NAConsumableTpl1'));
    });

    it('gera o template e todos os documentos do Compendium', async () => {
        await import(`../tools/build-consumable-sources.mjs?test=${Date.now()}`);
        const files = await readdir(new URL('../build/compendium/consumiveis/', import.meta.url));
        assert.equal(files.filter((file) => file.endsWith('.json')).length, 8);
    });

    it('expõe o inventário de consumíveis na ficha Slayer', async () => {
        const slayer = JSON.parse(
            await readFile(new URL('../src/templates/actors/slayer-template.json', import.meta.url), 'utf8')
        );
        const serialized = JSON.stringify(slayer.system.body);
        assert.match(serialized, /inventario_slayer_consumiveis/);
        assert.match(serialized, /NAConsumableTpl1/);
        assert.match(serialized, /useConsumableItem/);
    });
});
