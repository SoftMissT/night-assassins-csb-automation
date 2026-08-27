import { setupFoundryMocks } from './fixtures/foundry-mock.mjs';
setupFoundryMocks();

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    hunterData,
    loadDashboardData,
    oniData,
    openGmDashboard,
} from '../scripts/gm-dashboard.mjs';

describe('gm-dashboard', () => {
    it('lê Oni Minion pelos recursos próprios sem contaminá-lo com Slayer', () => {
        const actor = {
            name: 'Garra',
            system: {
                props: {
                    oni_minion_nome: 'Garra',
                    oni_minion_pdv_total: 10,
                    oni_minion_pdv_atual: 7,
                    oni_minion_pdk_total: 4,
                    oni_minion_pdk_atual: 3,
                },
            },
        };
        assert.deepEqual(oniData(actor)?.pdv, { current: 7, max: 10, percent: 70 });
        assert.deepEqual(oniData(actor)?.pdr, { current: 3, max: 4, percent: 75 });
    });
    it('lê somente nome, PDV e PDR do Caçador', () => {
        const data = hunterData({
            name: 'Actor Tanjiro',
            system: {
                props: {
                    nome_slayer: 'Tanjiro',
                    pdv_slayer_total_valor: 40,
                    pdr_slayer_total_valor: 20,
                    pdv_slayer_atual_valor_display: '<strong>30</strong>',
                    pdr_slayer_atual_valor_display: 10,
                },
            },
        });

        assert.equal(data.name, 'Tanjiro');
        assert.equal(data.kind, 'hunter');
        assert.deepEqual(data.pdv, { current: 30, max: 40, percent: 75 });
        assert.deepEqual(data.pdr, { current: 10, max: 20, percent: 50 });
        assert.deepEqual(Object.keys(data).sort(), [
            'actor',
            'image',
            'kind',
            'name',
            'pdr',
            'pdv',
        ]);
    });

    it('lê Oni somente por keys que contêm oni', () => {
        const data = oniData({
            name: 'Akaza',
            system: {
                props: {
                    nome_oni: 'Akaza',
                    pdv_oni_total_valor: 200,
                    pdv_oni_atual_valor_display: 145,
                    pdr_oni_total_valor: 40,
                    pdr_oni_atual_valor_display: 12,
                },
            },
        });

        assert.equal(data.name, 'Akaza');
        assert.equal(data.kind, 'oni');
        assert.deepEqual(data.pdv, { current: 145, max: 200, percent: 72.5 });
        assert.deepEqual(data.pdr, { current: 12, max: 40, percent: 30 });
    });

    it('calcula PDV/PDR atual do Oni quando os displays ainda não existem', () => {
        const data = oniData({
            name: 'Oni',
            system: {
                props: {
                    pdv_oni_total_valor: 100,
                    pdv_oni_dano_tomado: 35,
                    pdr_oni_total_valor: 20,
                    pdr_oni_gasto_valor: 6,
                },
            },
        });

        assert.equal(data.pdv.current, 65);
        assert.equal(data.pdr.current, 14);
    });

    it('não classifica Caçador como Oni', () => {
        assert.equal(
            oniData({
                name: 'Tanjiro',
                system: { props: { nome_slayer: 'Tanjiro', pdv_oni_dano_tomado: 0 } },
            }),
            null
        );
    });

    it('prioriza identidade ONI mesmo quando o template copiado ainda contém keys Slayer', () => {
        const actor = {
            name: 'Kokushibo',
            system: {
                props: {
                    classe_oni_escolha: 'classe_oni_lua_superior',
                    pdk_oni_total_valor: 80,
                    pdv_oni_total_valor: 300,
                    pdv_slayer_total_valor: 20,
                    pdr_slayer_total_valor: 10,
                },
            },
        };
        assert.equal(hunterData(actor), null);
        assert.equal(oniData(actor).kind, 'oni');
    });

    it('identifica Slayer pelas keys namespaced mesmo sem nome_slayer', () => {
        const data = hunterData({
            name: 'Kwon Baem',
            system: {
                props: {
                    pdv_slayer_total_conta: 14,
                    pdv_slayer_conta_atual: 13,
                    pdr_slayer_total_conta: 9,
                    pdr_slayer_conta_atual: 8,
                },
            },
        });
        assert.equal(data.name, 'Kwon Baem');
        assert.equal(data.pdv.current, 13);
        assert.equal(data.pdr.current, 8);
    });

    it('lista todos e somente os Combatants da luta ativa', () => {
        const slayer = {
            name: 'Tanjiro',
            system: { props: { nome_slayer: 'Tanjiro', pdv_slayer_total_valor: 20 } },
        };
        const unknownHostile = { name: 'Demônio mascarado', system: { props: {} } };
        const outside = { name: 'Fora da luta', system: { props: { nome_slayer: 'Fora' } } };
        game.actors = { contents: [slayer, unknownHostile, outside] };
        const result = loadDashboardData({
            combatants: {
                contents: [
                    { name: 'Tanjiro', actor: slayer, token: { disposition: 1 } },
                    {
                        name: 'Demônio mascarado',
                        actor: unknownHostile,
                        token: { disposition: -1, texture: { src: 'oni.webp' } },
                    },
                ],
            },
        });
        assert.deepEqual(
            result.hunters.map((entry) => entry.name),
            ['Tanjiro']
        );
        assert.deepEqual(
            result.onis.map((entry) => entry.name),
            ['Demônio mascarado']
        );
        assert.equal(
            result.hunters.some((entry) => entry.name === 'Fora'),
            false
        );
    });

    it('abre painel legível, sem retratos, não modal e com fechamento explícito', async () => {
        let config;
        game.user.isGM = true;
        const zenitsu = {
            name: 'Actor Zenitsu',
            uuid: 'Actor.zenitsu',
            system: {
                props: {
                    nome_slayer: 'Zenitsu',
                    pdv_slayer_total_valor: 22,
                    pdr_slayer_total_valor: 12,
                    pdv_slayer_atual_valor_display: 11,
                    pdr_slayer_atual_valor_display: 6,
                },
            },
        };
        const gyutaro = {
            name: 'Gyutaro',
            uuid: 'Actor.gyutaro',
            system: {
                props: {
                    nome_oni: 'Gyutaro',
                    pdv_oni_total_valor: 180,
                    pdv_oni_atual_valor_display: 90,
                    pdr_oni_total_valor: 30,
                    pdr_oni_atual_valor_display: 15,
                },
            },
        };
        game.actors = { contents: [] };
        game.combat = {
            combatants: {
                contents: [
                    { actor: zenitsu, token: { disposition: 1 } },
                    { actor: gyutaro, token: { disposition: -1 } },
                ],
            },
        };
        globalThis.window = { innerWidth: 1280, innerHeight: 900, __NAGmDashboard: null };
        globalThis.Hooks = { once: () => undefined, on: () => 1, off: () => undefined };
        class MockDialogV2 {
            constructor(value) {
                config = value;
            }
            render() {
                this.rendered = true;
            }
            async close() {
                this.closed = true;
            }
            async minimize() {
                this.minimized = true;
            }
        }
        foundry.applications = { api: { DialogV2: MockDialogV2 } };

        const dialog = await openGmDashboard();

        assert.match(config.content, /Controle de Combate/);
        assert.match(config.content, /Caçadores/);
        assert.match(config.content, /Inimigos/);
        assert.match(config.content, /Zenitsu/);
        assert.match(config.content, /Gyutaro/);
        assert.doesNotMatch(config.content, /Classe|Origem|Respiração|Esquiva|Bloqueio/);
        assert.doesNotMatch(config.content, /<img\b/);
        assert.equal(config.position.width, 780);
        assert.equal(config.modal, false);
        assert.equal(config.window.minimizable, true);
        assert.match(config.content, /na-gm-minimize/);
        assert.deepEqual(
            config.buttons.map(({ action }) => action),
            ['close']
        );
        await config.buttons[0].callback();
        assert.equal(dialog.closed, true);
    });
});
