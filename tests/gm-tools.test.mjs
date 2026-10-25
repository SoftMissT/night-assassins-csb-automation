import { setupFoundryMocks } from './fixtures/foundry-mock.mjs';
setupFoundryMocks();

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { GM_TOOLS, gmToolsMarkup, runGmTool } from '../scripts/gm-tools.mjs';
import {
    diagnoseDuplicateWeapons,
    duplicateWeaponGroups,
} from '../scripts/weapon-duplicates-tool.mjs';

const MODULE_ID = 'night-assassins-csb-automation';

function setup({ isGM = true, controlled = [], character = null, api = {} } = {}) {
    const notices = { warn: [], error: [], info: [] };
    globalThis.game = {
        user: { isGM, character },
        modules: new Map([[MODULE_ID, { active: true, api }]]),
    };
    globalThis.canvas = { ready: true, tokens: { controlled } };
    globalThis.ui = {
        notifications: {
            warn: (m) => notices.warn.push(m),
            error: (m) => notices.error.push(m),
            info: (m) => notices.info.push(m),
        },
    };
    globalThis.ChatMessage = { create: async () => {}, getSpeaker: () => ({}) };
    return notices;
}
const token = (uuid, system = { template: 'naslayertpl00001' }) => ({
    actor: { uuid, name: uuid, system },
});

describe('gm-tools: registro', () => {
    it('cobre todas as ferramentas que eram macros soltas, sem chave repetida', () => {
        const keys = GM_TOOLS.map((tool) => tool.key);
        assert.equal(new Set(keys).size, keys.length);
        for (const key of [
            'rest', 'status', 'actions', 'resistances', 'life-death', 'recovery', 'advanced-states',
            'interlude', 'oni-regen', 'attribute-snapshot',
            'ceremony', 'resistance-awakening', 'consequence', 'awaken',
            'diagnostic', 'repair-weapons', 'repair-breathings', 'duplicate-weapons',
        ])
            assert.ok(keys.includes(key), key);
    });

    it('o menu renderiza um botão por ferramenta, agrupado e escapado', () => {
        const html = gmToolsMarkup();
        for (const tool of GM_TOOLS) assert.match(html, new RegExp(`data-gm-tool="${tool.key}"`));
        assert.doesNotMatch(html, /<script|onclick=/iu);
    });
});

describe('gm-tools: execução', () => {
    beforeEach(() => setup());

    it('só o GM roda ferramentas', async () => {
        const notices = setup({ isGM: false, api: { openRestManager: () => assert.fail('não deve rodar') } });
        assert.equal(await runGmTool('rest'), false);
        assert.match(notices.warn[0], /GM/u);
    });

    it('ferramenta de Slayer recusa Oni', async () => {
        const notices = setup({
            controlled: [token('Actor.oni', { template: 'pqr15wsdsqbcn15w' })],
            api: { openResistanceManager: () => assert.fail('não deve rodar') },
        });
        assert.equal(await runGmTool('resistances'), false);
        assert.match(notices.warn[0], /Caçadores/u);
    });

    it('Descanso vale para Oni também', async () => {
        const calls = [];
        setup({
            controlled: [token('Actor.oni', { template: 'pqr15wsdsqbcn15w' })],
            api: { openRestManager: (o) => calls.push(o) },
        });
        assert.equal(await runGmTool('rest'), true);
        assert.deepEqual(calls, [{ actorUuid: 'Actor.oni' }]);
    });

    it('gerenciador usa o token selecionado; sem seleção passa null', async () => {
        const calls = [];
        setup({ controlled: [token('Actor.a')], api: { openRestManager: (o) => calls.push(o) } });
        assert.equal(await runGmTool('rest'), true);
        setup({ api: { openRestManager: (o) => calls.push(o) } });
        assert.equal(await runGmTool('rest'), true);
        assert.deepEqual(calls, [{ actorUuid: 'Actor.a' }, { actorUuid: null }]);
    });

    it('Dupla Alma exige exatamente um personagem e passa actor + actorUuid', async () => {
        const calls = [];
        const api = { openDualSoulCeremony: (o) => calls.push(o) };
        let notices = setup({ api });
        assert.equal(await runGmTool('ceremony'), false);
        assert.match(notices.warn[0], /portador|personagem/iu);
        notices = setup({ api, controlled: [token('Actor.a'), token('Actor.b')] });
        assert.equal(await runGmTool('ceremony'), false);
        assert.match(notices.warn[0], /somente um token/iu);
        setup({ api, controlled: [token('Actor.a')] });
        assert.equal(await runGmTool('ceremony'), true);
        assert.equal(calls.length, 1);
        assert.equal(calls[0].actorUuid, 'Actor.a');
        assert.equal(calls[0].actor.uuid, 'Actor.a');
    });

    it('API ausente avisa para atualizar o módulo, sem lançar', async () => {
        const notices = setup({ api: {} });
        assert.equal(await runGmTool('diagnostic'), false);
        assert.match(notices.error[0], /atualize/iu);
    });

    it('Estados avançados e Regeneração usam a API aninhada', async () => {
        const calls = [];
        setup({
            controlled: [token('Actor.a')],
            api: {
                slayer: { openAdvancedStatesManager: (o) => calls.push(['adv', o]) },
                oni: { regenerate: (o) => calls.push(['oni', o]) },
            },
        });
        assert.equal(await runGmTool('advanced-states'), true);
        assert.equal(await runGmTool('oni-regen'), true);
        assert.deepEqual(calls, [
            ['adv', { actorUuid: 'Actor.a' }],
            ['oni', { actorUuid: 'Actor.a' }],
        ]);
    });

    it('correção de armas resume no chat e na notificação', async () => {
        const chats = [];
        const notices = setup({ api: { repairSlayerWeaponItems: async () => ({ items: 3, actors: 2 }) } });
        globalThis.ChatMessage.create = async (data) => chats.push(data);
        assert.equal(await runGmTool('repair-weapons'), true);
        assert.match(notices.info[0], /3 itens em 2/u);
        assert.match(chats[0].content, /<strong>3<\/strong>/u);
    });

    it('correção sem nada a fazer não polui o chat', async () => {
        const chats = [];
        const notices = setup({ api: { repairBreathingItems: async () => ({ items: 0, actors: 0 }) } });
        globalThis.ChatMessage.create = async (data) => chats.push(data);
        assert.equal(await runGmTool('repair-breathings'), true);
        assert.match(notices.info[0], /Nenhuma respiração/u);
        assert.equal(chats.length, 0);
    });

    it('erro dentro da ferramenta vira aviso, não exceção', async () => {
        const notices = setup({ api: { openRestManager: () => { throw new Error('falhou aqui'); } } });
        assert.equal(await runGmTool('rest'), false);
        assert.match(notices.error[0], /falhou aqui/u);
    });

    it('snapshot de atributos usa o nível da ficha', async () => {
        const calls = [];
        setup({
            api: { runAttributeSnapshot: (actor, level) => calls.push([actor.uuid, level]) },
            controlled: [{ actor: { uuid: 'Actor.a', system: { props: { nvl_pj: 7 } } } }],
        });
        assert.equal(await runGmTool('attribute-snapshot'), true);
        assert.deepEqual(calls, [['Actor.a', 7]]);
    });
});

const weapon = (id, name = 'Cutelos Gêmeos') => ({
    id,
    name,
    uuid: `Actor.test.Item.${id}`,
    _stats: { createdTime: 1 },
    system: {
        template: `template-${id}`,
        props: { inventario_categoria: 'arma', arma_nome: name },
    },
});

describe('gm-tools: armas duplicadas', () => {
    beforeEach(() => {
        setup();
        globalThis.foundry.utils = { escapeHTML: (value) => String(value) };
    });

    it('agrupa somente armas repetidas pelo nome canônico', () => {
        const actor = {
            items: [
                weapon('a'),
                weapon('b'),
                weapon('c', 'Lâmina única'),
                { id: 'erva', name: 'Erva', system: { props: { inventario_categoria: 'item' } } },
            ],
        };
        const groups = duplicateWeaponGroups(actor);
        assert.equal(groups.length, 1);
        assert.equal(groups[0][0], 'Cutelos Gêmeos');
        assert.deepEqual(groups[0][1].map((item) => item.id), ['a', 'b']);
    });

    it('cancelar a revisão não confirma nem exclui Item', async () => {
        const actor = {
            name: 'Teste',
            items: [weapon('a'), weapon('b')],
            deleteEmbeddedDocuments: () => assert.fail('não deve excluir'),
        };
        globalThis.foundry.applications.api.DialogV2 = {
            wait: async () => false,
            confirm: async () => assert.fail('não deve confirmar'),
        };
        assert.deepEqual(await diagnoseDuplicateWeapons(actor), { groups: 1, deleted: 0 });
    });

    it('confirma cada Item e exclui somente o escolhido', async () => {
        const deleted = [];
        const answers = [false, true];
        const actor = {
            name: 'Teste',
            items: [weapon('a'), weapon('b')],
            async deleteEmbeddedDocuments(type, ids) {
                deleted.push([type, ids]);
            },
        };
        globalThis.foundry.applications.api.DialogV2 = {
            wait: async () => true,
            confirm: async () => answers.shift(),
        };
        assert.deepEqual(await diagnoseDuplicateWeapons(actor), { groups: 1, deleted: 1 });
        assert.deepEqual(deleted, [['Item', ['b']]]);
        assert.equal(answers.length, 0);
    });

    it('bloqueia chamada direta de usuário não-GM antes do diálogo', async () => {
        setup({ isGM: false });
        globalThis.foundry.applications.api.DialogV2 = {
            wait: async () => assert.fail('não deve abrir diálogo'),
        };
        await assert.rejects(
            diagnoseDuplicateWeapons({ name: 'Teste', items: [] }),
            /Somente o GM/u
        );
    });
});
