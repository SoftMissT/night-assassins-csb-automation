import { setupFoundryMocks } from './fixtures/foundry-mock.mjs';
setupFoundryMocks();

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { applyHealTo, healActor, healKeysFor, registerHealRelay } from '../scripts/heal-relay.mjs';
import { makeActor } from './fixtures/actor.mjs';

function makeSlayerActor(overrides = {}) {
    return {
        id: 'slayer',
        name: 'Slayer',
        uuid: 'Actor.slayer',
        documentName: 'Actor',
        isOwner: true,
        system: {
            props: { nome_slayer: 'Slayer', pdv_slayer_total_valor: 20, pdv_slayer_curado: 0 },
        },
        update: async () => {},
        ...overrides,
    };
}

function makeOniActor(overrides = {}) {
    return {
        id: 'oni',
        name: 'Oni',
        uuid: 'Actor.oni',
        documentName: 'Actor',
        isOwner: true,
        system: { props: { nome_oni: 'Oni', pdv_oni_curado: 0 } },
        update: async () => {},
        ...overrides,
    };
}

function makeOniMinionActor(overrides = {}) {
    return {
        id: 'minion',
        name: 'Oni Minion',
        uuid: 'Actor.minion',
        documentName: 'Actor',
        isOwner: true,
        system: { props: { oni_minion_nome: 'Minion', oni_minion_pdv_curado: 0 } },
        update: async () => {},
        ...overrides,
    };
}

function makeNpcActor(overrides = {}) {
    return {
        id: 'npc',
        name: 'NPC',
        uuid: 'Actor.npc',
        documentName: 'Actor',
        isOwner: true,
        system: { props: { npc_nome: 'NPC', npc_pdv_curado: 0 } },
        update: async () => {},
        ...overrides,
    };
}

describe('heal-relay', () => {
    describe('healKeysFor', () => {
        it('resolve pdv_slayer_curado para Slayer', () => {
            assert.deepStrictEqual(healKeysFor(makeSlayerActor()), { heal: 'pdv_slayer_curado' });
        });

        it('resolve pdv_oni_curado para Oni completo', () => {
            assert.deepStrictEqual(healKeysFor(makeOniActor()), { heal: 'pdv_oni_curado' });
        });

        it('resolve oni_minion_pdv_curado para Oni Minion', () => {
            assert.deepStrictEqual(healKeysFor(makeOniMinionActor()), {
                heal: 'oni_minion_pdv_curado',
            });
        });

        it('resolve npc_pdv_curado para NPC', () => {
            assert.deepStrictEqual(healKeysFor(makeNpcActor()), { heal: 'npc_pdv_curado' });
        });
    });

    describe('applyHealTo', () => {
        it('aplica direto quando o ator que chama é dono do alvo', async () => {
            game.user.isGM = false;
            let patch = null;
            let options = null;
            const actor = makeSlayerActor({
                isOwner: true,
                update: async (p, o) => {
                    patch = p;
                    options = o;
                },
            });

            const result = await applyHealTo(actor, 6);
            assert.deepStrictEqual(patch, { 'system.props.pdv_slayer_curado': 6 });
            assert.strictEqual(options.naCsbAutomation, true);
            assert.strictEqual(result.ok, true);
            assert.strictEqual(result.total, 6);
            assert.strictEqual(result.appliedHeal, 6);
        });

        it('aplica direto quando quem chama é GM, somando ao valor já curado', async () => {
            game.user.isGM = true;
            let patch = null;
            const actor = makeOniActor({
                isOwner: false,
                system: { props: { nome_oni: 'Oni', pdv_oni_curado: 4 } },
                update: async (p) => {
                    patch = p;
                },
            });

            const result = await applyHealTo(actor, 3);
            assert.deepStrictEqual(patch, { 'system.props.pdv_oni_curado': 7 });
            assert.strictEqual(result.total, 7);
        });

        it('Corta-Cura reduz 50% e arredonda a cura para cima', async () => {
            game.user.isGM = true;
            let patch = null;
            const actor = makeSlayerActor({
                system: {
                    props: {
                        nome_slayer: 'Alvo',
                        pdv_slayer_curado: 0,
                        slayer_veneno_usuario_estado: JSON.stringify({
                            healingSuppressed: true,
                            instances: [],
                        }),
                    },
                },
                update: async (next) => {
                    patch = next;
                },
            });
            const result = await applyHealTo(actor, 9);
            assert.equal(result.appliedHeal, 5);
            assert.equal(patch['system.props.pdv_slayer_curado'], 5);
        });

        it('rejeita cura zero, negativa ou não numérica', async () => {
            const actor = makeSlayerActor();
            await assert.rejects(() => applyHealTo(actor, 0), /valor de cura inválido/i);
            await assert.rejects(() => applyHealTo(actor, -5), /valor de cura inválido/i);
            await assert.rejects(() => applyHealTo(actor, Number.NaN), /valor de cura inválido/i);
        });

        it('rejeita quando não há actor alvo', async () => {
            await assert.rejects(() => applyHealTo(null, 5), /valor de cura inválido/i);
        });

        it('dispara pedido via socket quando quem chama não é dono nem GM', async () => {
            game.user.isGM = false;
            game.user.id = 'player_002';
            foundry.utils = { randomID: () => 'req-heal-1' };

            const gmUser = { id: 'gm_001', isGM: true, active: true };
            game.users = {
                filter: (predicate) => [gmUser].filter(predicate),
                get: (id) => (id === game.user.id ? { id, active: true } : null),
            };

            let emitted = null;
            let handler = null;
            game.socket = {
                emit: (name, message) => {
                    emitted = { name, message };
                },
                on: (name, cb) => {
                    handler = cb;
                },
            };
            registerHealRelay();

            const actor = makeSlayerActor({
                isOwner: false,
                update: async () => {
                    throw new Error('não deveria atualizar direto');
                },
            });
            const promise = applyHealTo(actor, 5);

            assert.strictEqual(emitted.message.type, 'applyHeal');
            assert.strictEqual(emitted.message.gmId, 'gm_001');
            assert.strictEqual(emitted.message.amount, 5);
            assert.strictEqual(emitted.message.actorUuid, actor.uuid);

            // Simula a resposta do GM chegando pelo mesmo canal de socket.
            handler({
                type: 'applyHealResult',
                recipientId: 'player_002',
                requestId: emitted.message.requestId,
                ok: true,
                total: 5,
                appliedHeal: 5,
                actorName: actor.name,
            });

            const result = await promise;
            assert.strictEqual(result.ok, true);
            assert.strictEqual(result.total, 5);
        });

        it('rejeita a Promise quando nenhum GM está ativo', async () => {
            game.user.isGM = false;
            game.users = { filter: () => [] };
            const actor = makeSlayerActor({ isOwner: false });
            await assert.rejects(() => applyHealTo(actor, 5), /nenhum gm ativo/i);
        });
    });

    describe('healActor (API pública usada pelo diálogo Dano ou Cura)', () => {
        it('delega para applyHealTo com o mesmo valor calculado como dano', async () => {
            game.user.isGM = true;
            let patch = null;
            const actor = makeSlayerActor({
                update: async (p) => {
                    patch = p;
                },
            });
            const result = await healActor(actor, 12, { attackName: 'Golpe' });
            assert.deepStrictEqual(patch, { 'system.props.pdv_slayer_curado': 12 });
            assert.strictEqual(result.appliedHeal, 12);
        });
    });

    describe('roteamento do modal Dano ou Cura dentro de rollDamage', () => {
        it('promptHealOrDamage:true + escolha Cura desvia para healActor em vez do dano', async () => {
            const { rollDamage } = await import('../scripts/damage-service.mjs');

            game.user.isGM = true;
            let dialogOpened = false;
            foundry.applications.api.DialogV2.wait = async (config) => {
                if (config?.window?.title === 'Dano ou Cura?') {
                    dialogOpened = true;
                    return 'cura';
                }
                // openDamageDialog (rollagem em si): confirma com uma entrada simples.
                return {
                    nome: 'Golpe',
                    pdrGasto: 0,
                    entradas: [
                        {
                            dado: '1d8',
                            fixo: 0,
                            selAttrs: [],
                            selTiposDano: ['cortante'],
                            tipoAcao: 'ataque',
                        },
                    ],
                };
            };
            globalThis.Roll.create = (_formula) => ({
                evaluate: async () => ({ total: 8, toMessage: async () => {}, dice: [] }),
            });
            ChatMessage.create = async (data) => data;

            const attacker = makeActor({
                id: 'atk-heal',
                uuid: 'Actor.atk-heal',
                props: { nome_slayer: 'Atacante', pdv_slayer_total_valor: 20 },
            });
            const target = makeActor({
                id: 'tgt-heal',
                uuid: 'Actor.tgt-heal',
                props: {
                    nome_slayer: 'Alvo',
                    pdv_slayer_total_conta: 20,
                    pdv_slayer_dano_tomado: 0,
                    pdv_slayer_curado: 0,
                },
            });

            let damageApplied = false;
            let healPatch = null;
            target.update = async (patch) => {
                if (patch['system.props.pdv_slayer_dano_tomado'] !== undefined)
                    damageApplied = true;
                if (patch['system.props.pdv_slayer_curado'] !== undefined) healPatch = patch;
            };
            game.user.targets = new Set([{ actor: target }]);

            await rollDamage({ actor: attacker, promptHealOrDamage: true });

            assert.strictEqual(dialogOpened, true, 'o diálogo Dano ou Cura deveria ter aberto');
            assert.strictEqual(
                damageApplied,
                false,
                'não deveria aplicar dano quando Cura foi escolhida'
            );
            assert.deepStrictEqual(healPatch, { 'system.props.pdv_slayer_curado': 8 });
        });

        it('promptHealOrDamage ausente (fallback padrão) nunca abre o modal comportamento de Dano inalterado', async () => {
            const { rollDamage } = await import('../scripts/damage-service.mjs');

            game.user.isGM = true;
            let dialogOpened = false;
            foundry.applications.api.DialogV2.wait = async (config) => {
                if (config?.window?.title === 'Dano ou Cura?') dialogOpened = true;
                return {
                    nome: 'Golpe',
                    pdrGasto: 0,
                    entradas: [
                        {
                            dado: '1d8',
                            fixo: 0,
                            selAttrs: [],
                            selTiposDano: ['cortante'],
                            tipoAcao: 'ataque',
                        },
                    ],
                };
            };
            globalThis.Roll.create = (_formula) => ({
                evaluate: async () => ({ total: 8, toMessage: async () => {}, dice: [] }),
            });
            ChatMessage.create = async (data) => data;

            const attacker = makeActor({
                id: 'atk-nohealprompt',
                uuid: 'Actor.atk-nohealprompt',
                props: { nome_slayer: 'Atacante', pdv_slayer_total_valor: 20 },
            });
            const target = makeActor({
                id: 'tgt-nohealprompt',
                uuid: 'Actor.tgt-nohealprompt',
                props: {
                    nome_slayer: 'Alvo',
                    pdv_slayer_total_conta: 20,
                    pdv_slayer_dano_tomado: 0,
                },
            });

            let damageApplied = false;
            target.update = async (patch) => {
                if (patch['system.props.pdv_slayer_dano_tomado'] !== undefined)
                    damageApplied = true;
            };
            game.user.targets = new Set([{ actor: target }]);

            // Fluxo automático/encadeado padrão: sem promptHealOrDamage explícito.
            await rollDamage({ actor: attacker });

            assert.strictEqual(
                dialogOpened,
                false,
                'sem promptHealOrDamage:true o modal nunca deve abrir (fallback seguro = Dano)'
            );
            assert.strictEqual(damageApplied, true, 'o dano deve seguir aplicado normalmente');
        });
    });
});
