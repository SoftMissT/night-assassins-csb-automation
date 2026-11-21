import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { activeBuffs, buffRuntimeSources } from '../scripts/breathing-buffs.mjs';
import { buffPrimitive, curaPrimitive } from '../scripts/breathing-primitives.mjs';

/**
 * A primitiva `buff` gravava a flag `buffs` e nada a lia: o bônus nunca entrava em rolagem
 * nenhuma e nunca expirava. Agora o buff carrega a rodada de início, expira por rodada e
 * entra pelo agregador de bônus derivados (canais acerto, bloqueio, esquiva, dano fixo...).
 */

const buff = (extra = {}) => ({
    id: 'silencio',
    label: 'Silêncio',
    mods: { acerto: 2, esquiva: 2, bloqueio: 2 },
    turns: 3,
    startRound: 2,
    expiresRound: 5,
    ...extra,
});

describe('buffs de Respiração: expiração', () => {
    it('vale da rodada de início até a anterior à de expiração', () => {
        assert.equal(activeBuffs([buff()], 2).length, 1);
        assert.equal(activeBuffs([buff()], 4).length, 1);
        assert.equal(activeBuffs([buff()], 5).length, 0);
        assert.equal(activeBuffs([buff()], 9).length, 0);
    });

    it('sem rodada de combate (ou buff sem expiração) o buff segue valendo', () => {
        assert.equal(activeBuffs([buff()], null).length, 1);
        assert.equal(activeBuffs([buff({ startRound: null, expiresRound: null })], 99).length, 1);
    });

    it('ignora entradas inválidas', () => {
        assert.deepEqual(activeBuffs([null, 'x', {}], 1), []);
        assert.deepEqual(activeBuffs(undefined, 1), []);
    });
});

describe('buffs de Respiração: fontes do agregador de bônus', () => {
    it('cada mod vira uma fonte no canal certo, com origem Respiração', () => {
        const sources = buffRuntimeSources([buff({ mods: { acerto: 2, bloqueio: 1, esquiva: 3, dano: 4 } })], 3);
        assert.deepEqual(
            sources.map(({ channel, value }) => [channel, value]).sort(),
            [['acerto', 2], ['bloqueio', 1], ['danoFixo', 4], ['esquiva', 3]]
        );
        assert.ok(sources.every((source) => source.origin === 'Respiração' && source.label === 'Silêncio'));
    });

    it('ignora mod zerado, desconhecido ou não numérico e buff expirado', () => {
        assert.deepEqual(buffRuntimeSources([buff({ mods: { acerto: 0, voo: 5, esquiva: 'x' } })], 3), []);
        assert.deepEqual(buffRuntimeSources([buff()], 7), []);
    });
});

describe('primitiva buff', () => {
    const actor = { id: 'a' };

    it('grava rodada de início e de expiração quando há combate', async () => {
        let stored = null;
        const runtime = { setBuffs: async (_actor, value) => (stored = value), getRound: () => 4 };
        await buffPrimitive({ primitive: { id: 'x', label: 'X', mods: { acerto: 1 }, turnos: 2 }, actor, runtime });
        assert.equal(stored.startRound, 4);
        assert.equal(stored.expiresRound, 6);
    });

    it('fora de combate não inventa rodada', async () => {
        let stored = null;
        const runtime = { setBuffs: async (_actor, value) => (stored = value), getRound: () => null };
        await buffPrimitive({ primitive: { id: 'x', mods: { acerto: 1 }, turnos: 2 }, actor, runtime });
        assert.equal(stored.startRound, null);
        assert.equal(stored.expiresRound, null);
    });

    it('resolve bônus por atributo: "@sab + @car" soma os dois atributos do usuário', async () => {
        let stored = null;
        const attrs = { sab: 3, car: 2 };
        const runtime = {
            setBuffs: async (_actor, value) => (stored = value),
            attrValue: (_actor, key) => attrs[key],
        };
        await buffPrimitive({
            primitive: { id: 'mar', mods: { acerto: '@sab + @car', esquiva: '@sab', bloqueio: 2 }, turnos: 2 },
            actor,
            runtime,
        });
        assert.deepEqual(stored.mods, { acerto: 5, esquiva: 3, bloqueio: 2 });
    });
});

describe('primitiva cura com atributo', () => {
    it('resolve @fdv antes de rolar', async () => {
        const rolled = [];
        const runtime = {
            roll: async (formula) => (rolled.push(formula), { total: 6 }),
            applyHeal: async () => {},
            resolveFormula: (_actor, formula) => formula.replace('@fdv', '3'),
        };
        const result = await curaPrimitive({ primitive: { formula: '1d4 + @fdv + 2' }, actor: { id: 'a' }, runtime });
        assert.deepEqual(rolled, ['1d4 + 3 + 2']);
        assert.equal(result.healed, 6);
    });
});

describe('actorBuffSources (lido em Acerto, Defesa e Dano)', () => {
    const withGame = async (game, fn) => {
        const previous = globalThis.game;
        globalThis.game = game;
        try {
            return await fn();
        } finally {
            globalThis.game = previous;
        }
    };

    it('Actor sem a flag, sem getFlag ou nulo não muda nada (lista vazia)', async () => {
        const { actorBuffSources } = await import('../scripts/breathing-buffs.mjs');
        assert.deepEqual(actorBuffSources(null), []);
        assert.deepEqual(actorBuffSources({}), []);
        assert.deepEqual(actorBuffSources({ getFlag: () => undefined }), []);
        assert.deepEqual(actorBuffSources({ getFlag: () => [] }), []);
    });

    it('lê a flag do módulo e respeita a rodada do combate em andamento', async () => {
        const { actorBuffSources } = await import('../scripts/breathing-buffs.mjs');
        const actor = { getFlag: (scope, key) => scope === 'night-assassins-csb-automation' && key === 'buffs'
                ? [{ ...buff(), combatId: 'fight' }] : undefined };
        await withGame({ combat: { id: 'fight', started: true, round: 3 } }, () => assert.equal(actorBuffSources(actor).length, 3));
        await withGame({ combat: { id: 'fight', started: true, round: 6 } }, () => assert.equal(actorBuffSources(actor).length, 0));
        await withGame({ combat: { id: 'another', started: true, round: 3 } }, () => assert.equal(actorBuffSources(actor).length, 0));
        await withGame({ combat: null }, () => assert.equal(actorBuffSources(actor).length, 0));
    });
});
