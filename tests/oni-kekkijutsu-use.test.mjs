import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { useKekkijutsuItem } from '../scripts/oni/kekkijutsu-use-service.mjs';

function fakeItem(props) {
    return { name: props.kekki_nome, system: { props } };
}

function fakeActor(props) {
    const patches = [];
    return {
        name: 'Oni Teste',
        uuid: 'Actor.oni',
        system: { props },
        update: async (patch) => {
            patches.push(patch);
            for (const [k, v] of Object.entries(patch))
                props[k.replace(/^system\.props\./, '')] = v;
        },
        patches,
    };
}

describe('useKekkijutsuItem — fluxo USAR na ficha Oni', () => {
    beforeEach(() => {
        globalThis.Roll = {
            create: (formula) => ({ evaluate: async () => ({ formula, total: 7 }) }),
        };
        globalThis.ChatMessage = { getSpeaker: () => ({}), create: async () => {} };
        globalThis.game = { user: { id: 'u1' } };
    });
    afterEach(() => {
        delete globalThis.Roll;
        delete globalThis.ChatMessage;
        delete globalThis.game;
        delete globalThis.foundry;
    });

    it('bloqueia por PDK insuficiente sem consumir nada', async () => {
        const item = fakeItem({
            kekki_id: '',
            kekki_nome: 'Sangue das Sombras',
            kekki_pdk_custo: 10,
            kekki_nivel_desbloqueio: 1,
            kekki_acao: 'especial',
        });
        const actor = fakeActor({ nvl_num: 5, pdk_oni_atual_num: 2, pdk_oni_gasto_valor: 0 });
        const result = await useKekkijutsuItem({ item, actor });
        assert.equal(result.ok, false);
        assert.match(result.errors.join(' '), /PDK insuficiente/);
        assert.equal(actor.patches.length, 0);
    });

    it('bloqueia por nível insuficiente', async () => {
        const item = fakeItem({
            kekki_nome: 'Técnica Avançada',
            kekki_pdk_custo: 1,
            kekki_nivel_desbloqueio: 10,
            kekki_acao: 'especial',
        });
        const actor = fakeActor({ nvl_num: 3, pdk_oni_atual_num: 5, pdk_oni_gasto_valor: 0 });
        const result = await useKekkijutsuItem({ item, actor });
        assert.equal(result.ok, false);
        assert.match(result.errors.join(' '), /Nível insuficiente/);
    });

    it('uso válido consome PDK, marca o uso do turno e rola dano', async () => {
        const item = fakeItem({
            kekki_nome: 'Garras Sombrias',
            kekki_pdk_custo: 3,
            kekki_nivel_desbloqueio: 1,
            kekki_acao: 'ataque',
            kekki_dmg_dice: '2d6',
            kekki_dmg_type: 'cortante',
        });
        const actor = fakeActor({ nvl_num: 5, pdk_oni_atual_num: 10, pdk_oni_gasto_valor: 2 });
        const result = await useKekkijutsuItem({ item, actor });
        assert.equal(result.ok, true);
        assert.equal(actor.system.props.pdk_oni_gasto_valor, 5, '2 (já gasto) + 3 (custo) = 5');
        assert.equal(actor.system.props[`kekki_uso_${result.technique.id}_turno`], true);
        assert.equal(result.rolls.length, 1, 'rola o dano configurado no Item');
    });
});
