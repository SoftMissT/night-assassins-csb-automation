import assert from 'node:assert/strict';
import test from 'node:test';
import { MODULE_ID } from '../scripts/constants.mjs';
import { SETTINGS } from '../scripts/settings.mjs';
import { kakushiRollEffect, useKakushi } from '../scripts/slayer/kakushi-service.mjs';

function makeActor(id, props) {
    const flags = {};
    return {
        uuid: 'Actor.' + id, name: id, isOwner: true, flags,
        system: { props },
        getFlag: (module, key) => module === MODULE_ID ? flags[key] : undefined,
        async update(patch) {
            for (const [path, value] of Object.entries(patch)) {
                if (path.startsWith('system.props.')) props[path.slice(13)] = value;
                if (path.startsWith('flags.')) flags[path.split('.').at(-1)] = value;
            }
        },
    };
}

function setup(t, profile = 'homebrew', level = 12) {
    const previous = { game: globalThis.game, ChatMessage: globalThis.ChatMessage };
    t.after(() => Object.assign(globalThis, previous));
    const actor = makeActor('kakushi', {
        nome_slayer: 'Kakushi',
        classe_escolhida: 'classe_kakushi',
        na_vanilla_class: 'classe_kakushi',
        nvl_num: level, int_display: 4, sab_display: 5, vit_display: 3,
        pdv_slayer_total_conta: 30, pdv_slayer_dano_tomado: 10,
        pdr_slayer_total: 15, pdr_slayer_gasto_valor: 5,
    });
    const ally = makeActor('ally', {
        npc_nome: 'Aliado', npc_nivel: 4, npc_pdv_base: 20, npc_pdv_dano: 5,
        npc_pdr_base: 10, npc_pdr_gasto_valor: 7, npc_vit_base: 4,
    });
    const turn = { id: 'test', started: true, round: 1, turn: 0, turns: [{ actor }, { actor: ally }] };
    turn.combatant = turn.turns[0];
    globalThis.game = {
        user: { isGM: true }, combat: turn,
        settings: { get: (_module, key) => key === SETTINGS.rulesSelection ? JSON.stringify({ classes: profile }) : undefined },
    };
    globalThis.ChatMessage = { getSpeaker: () => ({}), create: async () => {} };
    return { actor, ally, turn };
}

test('Amparar cura os campos do NPC, limita pela falta de PDV e gasta Ataque uma vez na rodada', async t => {
    const { actor, ally, turn } = setup(t);
    const options = { actor, target: ally, action: 'amparar', attribute: 'INT', override: true };
    assert.equal((await useKakushi(options)).amount, 5);
    assert.equal(ally.system.props.npc_pdv_curado, 5);
    assert.equal(JSON.parse(actor.system.props.acoes_slayer_dados).turn.ataque, 1);
    assert.match((await useKakushi(options)).reason, /rodada/);
    assert.equal(kakushiRollEffect(ally, { testType: 'Bloqueio' }).bonus, 1);
    turn.turn = 1;
    assert.equal(kakushiRollEffect(ally, { testType: 'Bloqueio' }).bonus, 0);
});

test('Adrenalina Vanilla usa PDR do alvo e não aceita segundo uso em outra rodada', async t => {
    const { actor, ally, turn } = setup(t, 'vanilla');
    const options = { actor, target: ally, action: 'adrenalina', attribute: 'SAB', override: true };
    assert.equal((await useKakushi(options)).amount, 7);
    assert.equal(ally.system.props.npc_pdr_recuperado, 7);
    assert.equal(ally.system.props.npc_pdv_curado, undefined);
    turn.round += 1;
    assert.match((await useKakushi(options)).reason, /combate/);
});

test('Kakushi recusa alvo fora do alcance antes de gastar sua ação', async t => {
    const { actor, ally } = setup(t);
    assert.equal((await useKakushi({ actor, target: ally, action: 'amparar', attribute: 'INT' })).ok, false);
    assert.equal(actor.system.props.acoes_slayer_dados, undefined);
});

test('Kakushi NPC pode usar Amparar Vanilla na própria ficha, sem campos de Slayer', async t => {
    const { ally, turn } = setup(t, 'vanilla');
    Object.assign(ally.system.props, { na_vanilla_class: 'classe_kakushi', npc_int_base: 3 });
    turn.combatant = turn.turns[1];
    assert.equal((await useKakushi({ actor: ally, action: 'amparar', attribute: 'INT' })).amount, 3);
    assert.equal(ally.system.props.npc_pdv_curado, 3);
    assert.equal(ally.system.props.pdv_slayer_curado, undefined);
});

test('Retirada Estratégica consome Especial e preserva Ataque e Movimento', async t => {
    const { actor } = setup(t);
    assert.equal((await useKakushi({ actor, action: 'retirada' })).ok, true);
    const { turn } = JSON.parse(actor.system.props.acoes_slayer_dados);
    assert.equal(turn.especial, 1);
    assert.equal(turn.ataque, 0);
    assert.equal(turn.movimento, 0);
});
