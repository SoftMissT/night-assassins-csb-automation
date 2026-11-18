import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../macros/na-criar-arma.js', import.meta.url), 'utf8');
const moduleSource = `export async function run({ game, canvas, ui, foundry, Item, document, FormData }) {
${source}
}`;
const { run } = await import(`data:text/javascript;base64,${Buffer.from(moduleSource).toString('base64')}`);

test('cria a arma com as escolhas dos dropdowns mesmo sem esses campos em FormData', async () => {
    const inputs = {
        nome: 'Arma de teste', dado: '1d6', fixo: '0', critico: '20', golpes: '1',
        acerto: 'FOR', destino: 'mundo', tipo: 'Corpo a corpo', municao: '4',
    };
    const pickers = {
        'multi-select[name="propriedades"]': { value: ['Leve', 'Nichirin', 'Municiada', 'inválida'] },
        'multi-select[name="tipos"]': { value: ['cortante', 'trovejante', 'invalido'] },
    };
    const template = { id: 'NAWeaponTpl00001', name: 'NA Arma - Slayer', type: '_equippableItemTemplate' };
    const items = { get: (id) => id === template.id ? template : undefined, some: (predicate) => predicate(template) };
    let props;
    await run({
        game: { user: { isGM: true }, system: { id: 'custom-system-builder' }, items },
        canvas: null,
        ui: { notifications: { warn: assert.fail } },
        document: { createElement: () => ({}) },
        FormData: class { get(name) { return inputs[name]; } },
        foundry: { applications: { api: { DialogV2: {
            wait: ({ buttons, content }) => {
                assert.match(content.innerHTML, /<multi-select name="propriedades"/);
                const form = { querySelector: (selector) => pickers[selector] };
                return buttons.find(({ action }) => action === 'criar').callback(null, { form });
            },
        } } } },
        Item: { implementation: { createDocuments: async ([data]) => {
            props = data.system.props;
            return [{ templateSystem: { reloadTemplate: async () => {} }, sheet: { render() {} } }];
        } } },
    });

    assert.equal(props.arma_propriedades, 'Leve / Nichirin / Municiada');
    assert.deepEqual(JSON.parse(props.arma_tipos_dano_json), ['cortante', 'trovejante']);
    assert.equal(props.arma_municao_atual, 4);
    assert.equal(props.arma_municao_capacidade, 4);
});

test('aceita template importado pelo compêndio com _id e uniqueId novos e usa esse id na arma', async () => {
    const template = {
        id: 'qvPmuD6QPzwTpNY0', name: 'NA Arma - Slayer', type: '_equippableItemTemplate',
        system: { uniqueId: 'qvPmuD6QPzwTpNY0' },
    };
    const items = {
        get: () => undefined, find: () => template, some: () => false,
        importFromCompendium: assert.fail,
    };
    const inputs = {
        nome: 'Arma importada', dado: '1d6', fixo: '0', critico: '20', golpes: '1',
        acerto: 'FOR', destino: 'mundo', tipo: 'Corpo a corpo',
    };
    let data, reloaded;
    await run({
        game: { user: { isGM: true }, system: { id: 'custom-system-builder' }, items, packs: { get: assert.fail } },
        canvas: null,
        ui: { notifications: { warn: assert.fail } },
        document: { createElement: () => ({}) },
        FormData: class { get(name) { return inputs[name]; } },
        foundry: { applications: { api: { DialogV2: {
            wait: ({ buttons }) => {
                const form = {
                    querySelector: (selector) => ({
                        value: selector.includes('tipos') ? ['cortante'] : [],
                    }),
                };
                return buttons.find(({ action }) => action === 'criar').callback(null, { form });
            },
        } } } },
        Item: { implementation: { createDocuments: async ([created]) => {
            data = created;
            return [{ templateSystem: { reloadTemplate: async (id) => { reloaded = id; } }, sheet: { render() {} } }];
        } } },
    });

    assert.equal(data.system.template, 'qvPmuD6QPzwTpNY0');
    assert.equal(reloaded, 'qvPmuD6QPzwTpNY0');
});
