import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { formCreatorBreathings, normalizeFormInput, buildFormProps, openFormCreator } from '../scripts/form-creator.mjs';

const catalog = JSON.parse(readFileSync(new URL('../catalogs/breathing-items.json', import.meta.url)));
const manifest = JSON.parse(readFileSync(new URL('../module.json', import.meta.url)));

const completeInput = () => ({
    nome: 'Forma Nova', nomeJp: 'Shin no Kata', respiracao: 'Chamas',
    tipoManobra: 'Ação Especial', nivelReq: 2, descricao: 'Teste',
    nvl1: { ativo: true, custo: 1, dano: '1d6', efeito: 'Efeito 1', status: '', tiposDano: 'cortante' },
    nvl2: { ativo: true, custo: 2, dano: '2d6', efeito: 'Efeito 2', status: 'em_chamas', tiposDano: 'fogo' },
    nvl3: { ativo: false, custo: 0, dano: '', efeito: '', status: '', tiposDano: '' },
    nvl4: { ativo: false, custo: 0, dano: '', efeito: '', status: '', tiposDano: '' },
});

describe('criador de Forma — contrato de 4 níveis', () => {
    it('oferece só respirações publicadas com Formas jogáveis', () => {
        const names = formCreatorBreathings(catalog.documents);
        assert.deepEqual(names, [
            'Água', 'Chamas', 'Eclipse', 'Metal', 'Neve',
            'Névoa', 'Pedra', 'Raposa', 'Som', 'Sonhos', 'Vento',
        ]);
    });

    it('valida nome, respiração e ao menos um nível com dano ou efeito', () => {
        assert.match(normalizeFormInput({}).reason, /nome/i);
        assert.match(normalizeFormInput({ nome: 'X' }).reason, /Respiração/);
        assert.match(normalizeFormInput({ ...completeInput(), nvl1: { ativo: false }, nvl2: { ativo: false } }).reason,
            /4 níveis/);
        assert.equal(normalizeFormInput(completeInput()).reason, undefined);
        assert.match(normalizeFormInput({ ...completeInput(), nivelReq: 3 }).reason, /nível requerido/);
        assert.match(normalizeFormInput({ ...completeInput(), nvl1: { ativo: true, custo: -1 } }).reason,
            /custo inválido/);
        assert.match(normalizeFormInput({ ...completeInput(), nvl1: { ativo: true, dano: '1d6 + @misterio' } }).reason,
            /fórmula de dano inválida/);
        assert.match(normalizeFormInput({ ...completeInput(), nvl1: { ativo: true, dano: '1d6', tiposDano: 'ignorado' } }).reason,
            /tipo de dano desconhecido/);
    });

    it('grava os 4 níveis no contrato do template, incluindo os desativados', () => {
        const props = buildFormProps(normalizeFormInput(completeInput()), 'custom_chamas_1');
        for (const level of [1, 2, 3, 4]) {
            assert.ok(props[`tem_nvl${level}`] !== undefined, `tem_nvl${level}`);
            assert.ok(props[`nvl${level}_custo`] !== undefined, `nvl${level}_custo`);
            assert.ok(Array.isArray(props[`nvl${level}_tipos_dano`]), `nvl${level}_tipos_dano`);
        }
        assert.equal(props.tem_nvl1, 1);
        assert.equal(props.tem_nvl3, 0);
        assert.deepEqual(props.nvl2_tipos_dano, ['fogo']);
        assert.equal(props.inventario_categoria, 'respiracao');
        assert.equal(props.forma_id, 'custom_chamas_1');
    });

    it('recusa jogador comum', async () => {
        const previous = { game: globalThis.game, ui: globalThis.ui };
        const warns = [];
        globalThis.game = { user: { isGM: false } };
        globalThis.ui = { notifications: { warn: (m) => warns.push(m) } };
        const result = await openFormCreator({});
        assert.equal(result, null);
        assert.match(warns[0], /exclusivo do GM/);
        Object.assign(globalThis, previous);
    });

    it('abre o Criador para o NPC escolhido mesmo sem token selecionado', async () => {
        const previous = Object.fromEntries(
            ['game', 'ui', 'canvas', 'foundry'].map((key) => [key, globalThis[key]])
        );
        const actor = {
            id: 'npc-destino', name: 'NPC Destino', type: 'character', isOwner: true,
            system: { props: { npc_nome: 'NPC Destino' } },
            createEmbeddedDocuments: () => assert.fail('formulário foi cancelado'),
        };
        globalThis.game = { user: { isGM: true }, actors: { contents: [
            actor, { ...actor, id: 'template', name: 'Template NPC', type: '_template' },
        ] } };
        globalThis.canvas = { tokens: { controlled: [] } };
        globalThis.ui = { notifications: { warn: (message) => assert.fail(message) } };
        let dialogs = 0;
        globalThis.foundry = { applications: { api: { DialogV2: { wait: async (dialog) => {
            dialogs++;
            if (dialogs === 1) {
                assert.match(dialog.content, /Ficha de destino/);
                assert.match(dialog.content, /value="npc-destino">NPC Destino/);
                assert.doesNotMatch(dialog.content, /Template NPC/);
                const form = { elements: { recipient: { value: actor.id } } };
                return dialog.buttons[0].callback(null, { form });
            }
            assert.match(dialog.content, /Destino: <strong>NPC Destino<\/strong>/);
            return dialog.buttons.find(({ action }) => action === 'cancelar').callback();
        } } } } };
        try {
            assert.equal(await openFormCreator({ actorUuid: null }), null);
            assert.equal(dialogs, 2);
        } finally {
            Object.assign(globalThis, previous);
        }
    });

    it('envia os quatro níveis do diálogo ao ator indicado pela API da ferramenta GM', async () => {
        const previous = Object.fromEntries(
            ['game', 'ui', 'canvas', 'foundry', 'fromUuid'].map((key) => [key, globalThis[key]])
        );
        const calls = [];
        const returned = {
            templateSystem: { reloadTemplate: async (id) => calls.push(['template', id]) },
            sheet: { render: (options) => calls.push(['render', options]) },
        };
        const actor = {
            name: 'Destinatário',
            documentName: 'Actor',
            isOwner: true,
            system: { props: { resp_slayer_display: 'resp_slayer_chamas' } },
            async createEmbeddedDocuments(type, data) {
                calls.push([type, data]);
                return [returned];
            },
        };
        const controls = new Map([
            ['nome', { value: 'Forma Nova' }], ['respiracao', { value: 'Chamas' }],
            ['nivelReq', { value: '1' }], ['tipoManobra', { value: 'Ação Única' }],
            ['nvl1.ativo', { checked: true }], ['nvl1.custo', { value: '2' }],
            ['nvl1.dano', { value: '1d6 + @for' }],
            ['nvl1.tiposDano', { value: 'Cortante, fogo, cortante' }],
            ['nvl4.ativo', { checked: true }], ['nvl4.efeito', { value: 'Efeito N4' }],
        ]);
        const imported = { id: 'tpl-importado', type: '_equippableItemTemplate', name: 'NA Respiração - Forma' };
        globalThis.game = { user: { isGM: true }, items: [imported] };
        globalThis.canvas = { tokens: { controlled: [{ actor: {} }] } };
        globalThis.fromUuid = async (uuid) => uuid === 'Actor.destino' ? actor : null;
        const warnings = [];
        globalThis.ui = { notifications: { warn: (message) => warnings.push(message) } };
        globalThis.foundry = { applications: { api: { DialogV2: { wait: async (dialog) => {
            assert.deepEqual(dialog.window.contentClasses, ['na-form-creator-window']);
            const stylesheet = readFileSync(new URL(`../${manifest.styles[0]}`, import.meta.url), 'utf8');
            assert.match(stylesheet, /\.na-form-creator\s*\{[^}]*grid-template-columns:/);
            assert.match(stylesheet, /\.na-form-creator-window \.dialog-content\s*\{[^}]*overflow: auto/);
            assert.match(dialog.content, /<option value="Chamas">Chamas<\/option>/);
            assert.doesNotMatch(dialog.content, /<option value="Água">/);
            const form = { querySelector: (selector) => controls.get(selector.slice(7, -2)) };
            return dialog.buttons.find(({ action }) => action === 'criar').callback(null, { form });
        } } } } };
        try {
            assert.equal(await openFormCreator({ actorUuid: 'Actor.destino' }), returned);
            assert.deepEqual(warnings, []);
            const [[type, [item]], ...after] = calls;
            assert.equal(type, 'Item');
            assert.equal(item.system.template, imported.id);
            assert.equal(item.system.props.tipo_manobra, 'Ação Única');
            assert.equal(item.system.props.tem_nvl1, 1);
            assert.equal(item.system.props.tem_nvl2, 0);
            assert.equal(item.system.props.tem_nvl3, 0);
            assert.equal(item.system.props.tem_nvl4, 1);
            assert.equal(item.system.props.nvl1_custo, 2);
            assert.equal(item.system.props.nvl1_dano, '1d6 + @for');
            assert.deepEqual(item.system.props.nvl1_tipos_dano, ['cortante', 'fogo']);
            assert.equal(item.system.props.nvl4_efeito, 'Efeito N4');
            assert.deepEqual(after, [['template', imported.id], ['render', { force: true }]]);
        } finally {
            Object.assign(globalThis, previous);
        }
    });

    it('oferece a Secundária escolhida ao GM que registra uma Forma', async () => {
        const previous = Object.fromEntries(['game', 'ui', 'foundry'].map(key => [key, globalThis[key]]));
        const target = {
            name: 'Usuário de Duas Respirações', isOwner: true,
            system: { props: {
                nome_slayer: 'Usuário de Duas Respirações', classe_escolhida: 'classe_usuario_de_duas_resp',
                resp_slayer_display: 'resp_slayer_agua', resp_slayer_display_2: 'resp_slayer_neve',
            } },
            createEmbeddedDocuments: assert.fail,
        };
        globalThis.game = { user: { isGM: true } };
        globalThis.ui = { notifications: { warn: assert.fail } };
        globalThis.foundry = { applications: { api: { DialogV2: { wait: async ({ content }) => {
            assert.match(content, /<option value="Água">Água<\/option>/u);
            assert.match(content, /<option value="Neve">Neve<\/option>/u);
            assert.doesNotMatch(content, /<option value="Chamas">/u);
            return null;
        } } } } };
        try {
            assert.equal(await openFormCreator({ actor: target }), null);
        } finally {
            Object.assign(globalThis, previous);
        }
    });
});
