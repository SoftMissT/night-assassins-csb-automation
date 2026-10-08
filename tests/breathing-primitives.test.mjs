import assert from 'node:assert/strict';
import test, { describe } from 'node:test';

import {
    aplicarStatusPrimitive,
    attackCount,
    buffPrimitive,
    curaPrimitive,
    filterAreaTargets,
    runLevelPrimitives,
    saveAlvoPrimitive,
} from '../scripts/breathing-primitives.mjs';

function fakeRuntime(overrides = {}) {
    const calls = { status: [], stacking: [], heal: [], clears: [], buffs: [], saves: [] };
    const runtime = {
        calls,
        roll: async (formula) => ({
            total: formula === '3d6' ? 11 : formula === '1d20 + 5' ? 12 : 7,
        }),
        applyStatus: async (target, key, effect) => calls.status.push({ target, key, effect }),
        applyStackingStatus: async (target, key, effect) => calls.stacking.push({ target, key, effect }),
        applyHeal: async (actor, amount, meta) => calls.heal.push({ actor, amount, meta }),
        clearBleeding: async (actor) => calls.clears.push(actor),
        setBuffs: async (actor, buff) => calls.buffs.push({ actor, buff }),
        attrValue: (_target, atributo) => (atributo === 'VIT' ? 5 : 2),
        postSave: async (entry) => calls.saves.push(entry),
        ...overrides,
    };
    return runtime;
}

describe('breathing-primitives — individuais', () => {
    test('CT-003: attackCount usa N declarado e cai para 1', () => {
        assert.equal(attackCount([{ tipo: 'ataques', n: 3 }]), 3);
        assert.equal(attackCount([{ tipo: 'ataques', n: 0 }]), 1);
        assert.equal(attackCount([]), 1);
        assert.equal(attackCount([{ tipo: 'cura', formula: '1d6' }]), 1);
    });

    test('CT-004: aplicaStatus mapeia efeito e escolhe stack', async () => {
        const runtime = fakeRuntime();
        const target = { name: 'Oni' };
        await aplicarStatusPrimitive({
            primitive: { tipo: 'aplicaStatus', status: 'sangramento', formula: '4', turnos: 2, tick: 'start' },
            target,
            runtime,
        });
        assert.equal(runtime.calls.status.length, 1);
        assert.equal(runtime.calls.status[0].key, 'sangramento');
        assert.equal(runtime.calls.status[0].effect.damageFormula, '4');
        assert.equal(runtime.calls.status[0].effect.remainingTurns, 2);

        await aplicarStatusPrimitive({
            primitive: { tipo: 'aplicaStatus', status: 'sangramento', formula: '5', turnos: 2, stack: true },
            target,
            runtime,
        });
        assert.equal(runtime.calls.stacking.length, 1);
        assert.equal(runtime.calls.stacking[0].effect.damageFormula, '5');
    });

    test('CT-005: cura rola fórmula e limpa sangramento quando declarado', async () => {
        const runtime = fakeRuntime();
        const actor = { name: 'Slayer' };
        const result = await curaPrimitive({
            primitive: { tipo: 'cura', formula: '3d6', removeBleeding: true },
            actor,
            runtime,
        });
        assert.equal(result.healed, 11);
        assert.equal(runtime.calls.heal[0].amount, 11);
        assert.equal(runtime.calls.clears.length, 1);
    });

    test('CT-006: buff grava id/label/mods/turnos com defaults', async () => {
        const runtime = fakeRuntime();
        const actor = { name: 'Slayer' };
        await buffPrimitive({
            primitive: { tipo: 'buff', label: 'Neblina', mods: { acerto: 2, dano: 2 }, turnos: 3 },
            actor,
            runtime,
        });
        const buff = runtime.calls.buffs[0].buff;
        assert.equal(buff.id, 'Neblina');
        assert.equal(buff.turns, 3);
        assert.deepEqual(buff.mods, { acerto: 2, dano: 2 });
    });

    test('CT-007: área separa alvos fora do raio', () => {
        const origin = { name: 'origem' };
        const near = { name: 'perto' };
        const far = { name: 'longe' };
        const measure = (_o, token) => ({ distance: token === far ? 12 : 3 });
        const result = filterAreaTargets({
            primitive: { tipo: 'area', metros: 10 },
            origin,
            targets: [near, far],
            measure,
        });
        assert.deepEqual(result.inside, [near]);
        assert.deepEqual(result.outside, [far]);
        const semOrigem = filterAreaTargets({ primitive: { metros: 10 }, targets: [near, far] });
        assert.deepEqual(semOrigem.inside, [near, far]);
    });

    test('CT-008: saveAlvo compara com a CD e registra o resultado', async () => {
        const runtime = fakeRuntime();
        const target = { name: 'Oni' };
        // VIT 5 → rolagem "1d20 + 5" → total 12 no fake.
        const passed = await saveAlvoPrimitive({
            primitive: { tipo: 'saveAlvo', atributo: 'VIT', dcFormula: '12' },
            target,
            dcTotal: 12,
            runtime,
        });
        assert.equal(passed.failed, false, '12 contra CD 12 passa');
        const failed = await saveAlvoPrimitive({
            primitive: { tipo: 'saveAlvo', atributo: 'VIT' },
            target,
            dcTotal: 30,
            runtime,
        });
        assert.equal(failed.failed, true);
        const easy = await saveAlvoPrimitive({
            primitive: { tipo: 'saveAlvo', atributo: 'VIT' },
            target,
            dcTotal: 10,
            runtime,
        });
        assert.equal(easy.failed, false);
        assert.equal(runtime.calls.saves.length, 3);
    });
});

describe('breathing-primitives — orquestrador', () => {
    test('runLevelPrimitives agrega status, curas e buffs (ataques é estrutural)', async () => {
        const runtime = fakeRuntime();
        const actor = { name: 'Slayer' };
        const target = { name: 'Oni' };
        const results = await runLevelPrimitives({
            primitives: [
                { tipo: 'ataques', n: 2 },
                { tipo: 'aplicaStatus', status: 'sangramento', formula: '4', turnos: 2 },
                { tipo: 'cura', formula: '1d6' },
                { tipo: 'buff', label: 'Postura', mods: { bloqueio: 1 }, turnos: 2 },
            ],
            actor,
            targets: [target],
            runtime,
        });
        assert.equal(results.attackCount, 2);
        assert.equal(results.status.length, 1);
        assert.equal(results.heals.length, 1);
        assert.equal(results.buffs.length, 1);
    });
});