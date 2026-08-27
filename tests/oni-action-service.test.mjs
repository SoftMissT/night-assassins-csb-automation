import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { consumeOniActions, parseOniActionState } from '../scripts/oni-action-service.mjs';
import { makeActor } from './fixtures/actor.mjs';

describe('oni-action-service', () => {
    it('consome ataque somente nas keys Oni', async () => {
        const actor = makeActor({ props: { nome_oni: 'Akuma', acoes_oni_dados: '' } });
        const result = await consumeOniActions(actor, ['ataque'], { update: false });
        assert.equal(result.ok, true);
        assert.equal(
            parseOniActionState(result.patch['system.props.acoes_oni_dados']).turn.ataque,
            1
        );
        assert.equal(result.patch['system.props.acoes_slayer_dados'], undefined);
    });

    it('bloqueia uma segunda acao de ataque sem bonus', async () => {
        const state = {
            version: 1,
            turn: { movimento: 0, ataque: 1, especial: 0 },
            round: { unica: 0, reacao: 0, lendaria: 0 },
        };
        const actor = makeActor({
            props: { nome_oni: 'Akuma', acoes_oni_dados: JSON.stringify(state) },
        });
        const result = await consumeOniActions(actor, ['ataque'], { update: false });
        assert.equal(result.ok, false);
    });
});
