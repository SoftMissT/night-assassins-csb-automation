import { setupFoundryMocks } from './fixtures/foundry-mock.mjs';
setupFoundryMocks();
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { launchBreathForm, resolveBreathItem } from '../scripts/breath-form-launcher.mjs';
const form = (id, props = {}, name = `Forma ${id}`) => ({
    uuid: `Actor.a.Item.${id}`,
    name,
    system: {
        props: {
            inventario_categoria: 'respiracao',
            ...props,
        },
    },
});

function setup({ items = [], isOwner = true, controlled = [], documents = {} } = {}) {
    const notices = {
        warn: [],
        error: [],
    };
    const actor = {
        uuid: 'Actor.a',
        isOwner,
        system: {
            props: {},
        },
        items: {
            find: (fn) => items.find(fn),
            filter: (fn) => items.filter(fn),
        },
    };
    globalThis.fromUuid = async (uuid) =>
        uuid === 'Actor.a'
            ? actor
            : (documents[uuid] ?? items.find((item) => item.uuid === uuid) ?? null);
    globalThis.canvas = {
        tokens: {
            controlled,
        },
    };
    globalThis.game = {
        user: {
            character: null,
        },
    };
    globalThis.ui = {
        notifications: {
            warn: (m) => notices.warn.push(m),
            error: (m) => notices.error.push(m),
        },
    };
    return {
        actor,
        notices,
    };
}
describe('breath-form-launcher: resolução do Item', () => {
    beforeEach(() => setup());
    it('itemUuid vence qualquer outro critério', async () => {
        const { actor } = setup({
            items: [form('1'), form('2')],
        });
        assert.equal(
            (
                await resolveBreathItem(actor, {
                    itemUuid: 'Actor.a.Item.2',
                })
            ).uuid,
            'Actor.a.Item.2'
        );
    });
    it('forma_id e depois nome, quando não há UUID', async () => {
        const { actor } = setup({
            items: [
                form('1', {
                    forma_id: 'agua_1',
                }),
                form('2', {}, 'Dança da Corrente'),
            ],
        });
        assert.equal(
            (
                await resolveBreathItem(actor, {
                    formaId: 'agua_1',
                })
            ).uuid,
            'Actor.a.Item.1'
        );
        assert.equal(
            (
                await resolveBreathItem(actor, {
                    itemName: ' corrente ',
                })
            ).uuid,
            'Actor.a.Item.2'
        );
    });
    it('uma única Respiração é usada sem perguntar; nenhuma devolve null', async () => {
        let { actor } = setup({
            items: [form('1')],
        });
        const never = () => assert.fail('não deve perguntar');
        assert.equal((await resolveBreathItem(actor, {}, never)).uuid, 'Actor.a.Item.1');
        ({ actor } = setup({
            items: [],
        }));
        assert.equal(await resolveBreathItem(actor, {}, never), null);
    });
    it('várias Respirações vão para o seletor, ordenadas por forma_ordem', async () => {
        const { actor } = setup({
            items: [
                form('1', {
                    forma_ordem: 3,
                }),
                form('2', {
                    forma_ordem: 1,
                }),
            ],
        });
        let content = '';
        globalThis.foundry.applications.api.DialogV2.wait = async (config) => {
            content = config.content;
            return 'Actor.a.Item.2';
        };
        const picked = await resolveBreathItem(actor, {});
        assert.equal(picked.uuid, 'Actor.a.Item.2');
        assert.ok(content.indexOf('Actor.a.Item.2') < content.indexOf('Actor.a.Item.1'));
        assert.equal(await resolveBreathItem(actor, {}, async () => null), null);
    });
});
describe('breath-form-launcher: lançamento', () => {
    it('sem personagem ou sem permissão avisa e não usa a Forma', async () => {
        const never = () => assert.fail('não deve usar');
        let { notices } = setup();
        assert.equal(
            await launchBreathForm(
                {},
                {
                    useBreathForm: never,
                }
            ),
            false
        );
        assert.match(notices.warn[0], /Selecione um token/u);
        ({ notices } = setup({
            items: [form('1')],
            isOwner: false,
        }));
        assert.equal(
            await launchBreathForm(
                {
                    actorUuid: 'Actor.a',
                },
                {
                    useBreathForm: never,
                }
            ),
            false
        );
        assert.match(notices.error[0], /não pode usar/u);
    });
    it('usa a Forma encontrada com os UUIDs do ator e do Item', async () => {
        setup({
            items: [form('1')],
        });
        const calls = [];
        const ok = await launchBreathForm(
            {
                actorUuid: 'Actor.a',
            },
            {
                useBreathForm: async (o) => calls.push(o),
            }
        );
        assert.equal(ok, true);
        assert.deepEqual(calls, [
            {
                actorUuid: 'Actor.a',
                itemUuid: 'Actor.a.Item.1',
            },
        ]);
    });
    it('Item atalho hub_* abre o painel da Respiração em vez de usar a Forma', async () => {
        setup({
            items: [
                form('1', {
                    forma_id: 'hub_chamas',
                    respiracao_nome: 'Chamas',
                }),
            ],
        });
        const hub = [];
        const ok = await launchBreathForm(
            {
                actorUuid: 'Actor.a',
            },
            {
                useBreathForm: () => assert.fail('hub não usa Forma'),
                openBreathingManager: async (o) => hub.push(o),
            }
        );
        assert.equal(ok, true);
        assert.deepEqual(hub, [
            {
                actorUuid: 'Actor.a',
                breathingName: 'Chamas',
            },
        ]);
    });
    it('o seletor escapa o rótulo vindo do Item (sem HTML injetado)', async () => {
        setup({
            items: [
                form('1', {
                    respiracao_nome: '<img src=x onerror=alert(1)>',
                    forma_ordem: 1,
                }),
                form('2', {
                    forma_ordem: 2,
                }),
            ],
        });
        let content = '';
        globalThis.foundry.applications.api.DialogV2.wait = async (config) => {
            content = config.content;
            return null;
        };
        await launchBreathForm(
            {
                actorUuid: 'Actor.a',
            },
            {
                useBreathForm: async () => {},
            }
        );
        assert.doesNotMatch(content, /<img/u);
        assert.match(content, /&lt;img/u);
    });
});
describe('macro Usar Forma de Respiração', () => {
    it('é um adaptador fino que delega ao módulo', async () => {
        const macro = await readFile(
            new URL('../macros/na-resp-usar-forma.js', import.meta.url),
            'utf8'
        );
        assert.ok(macro.split('\n').length < 30);
        assert.match(macro, /launchBreathForm/u);
        assert.doesNotMatch(macro, /DialogV2|innerHTML|<option/u);
    });
});
