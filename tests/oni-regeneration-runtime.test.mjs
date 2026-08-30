import { setupFoundryMocks } from './fixtures/foundry-mock.mjs';
setupFoundryMocks();

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { makeActor } from './fixtures/actor.mjs';
import { registerOniRegenerationEngine, useOniRegeneration } from '../scripts/oni/regeneration-runtime.mjs';

describe('oni regeneration runtime', () => {
    it('N2 testa VIT CD 12, consome Ação Especial e aplica 1d4+VIT', async () => {
        const actor = makeActor({
            props: {
                nome_oni: 'Oni',
                nvl_num: 2,
                vit_display: 5,
                pdv_oni_curado: 3,
                acoes_oni_dados: '',
                acoes_oni_especial_max: 1,
            },
        });
        actor.isOwner = true;
        globalThis.fromUuid = async () => actor;
        game.user.isGM = false;
        game.dice3d = { showForRoll: async () => true };
        const totals = [15, 9];
        Roll.create = (formula) => ({
            formula,
            evaluate: async () => ({
                total: totals.shift(),
                dice: [{ faces: formula.includes('d20') ? 20 : 4 }],
                toMessage: async () => ({}),
            }),
        });
        let patch;
        actor.update = async (changes) => (patch = changes);

        const result = await useOniRegeneration({ actorUuid: actor.uuid });

        assert.equal(result.success, true);
        assert.equal(result.healing, 9);
        assert.equal(patch['system.props.pdv_oni_curado'], 12);
        assert.equal(patch['system.props.oni_regeneracao_usada_turno'], true);
        assert.match(patch['system.props.acoes_oni_dados'], /"especial":1/);
    });

    it('N13 regenera VIT automaticamente no início do próprio turno', async () => {
        let updateCombat;
        globalThis.Hooks = { on: (name, callback) => name === 'updateCombat' && (updateCombat = callback) };
        const actor = makeActor({
            props: { nome_oni: 'Lua', nvl_num: 13, vit_display: 6, pdv_oni_curado: 2 },
        });
        let patch;
        actor.update = async (changes) => (patch = changes);
        game.user = { id: 'gm', isGM: true };
        game.users = [{ id: 'gm', isGM: true, active: true }];
        ChatMessage.create = async () => ({});
        registerOniRegenerationEngine();

        updateCombat({ started: true, combatant: { actor } }, { turn: 1 });
        await new Promise((resolve) => setTimeout(resolve, 0));

        assert.equal(patch['system.props.pdv_oni_curado'], 8);
        assert.equal(patch['system.props.oni_regeneracao_usada_turno'], false);
    });
});
