import test from 'node:test';
import assert from 'node:assert/strict';
import {
    progressionEventsBetween,
    resolveSlayerProgression,
    slayerProgressionAtLevel,
} from '../scripts/slayer/progression-service.mjs';

test('progressão Slayer cobre todos os níveis 1 a 14', () => {
    const levels = Array.from({ length: 14 }, (_, index) => slayerProgressionAtLevel(index + 1));
    assert.equal(levels.length, 14);
    assert.equal(levels[0].rank, 'Aspirante a Exterminador');
    assert.equal(levels[13].rank, 'Hashira de Elite');
});

test('ranks de classe são liberados nos níveis 4, 6, 8, 11 e 12', () => {
    assert.deepEqual(resolveSlayerProgression(3).unlockedClassRanks, []);
    assert.deepEqual(resolveSlayerProgression(11).unlockedClassRanks, ['C', 'B', 'A', 'S']);
    assert.deepEqual(resolveSlayerProgression(12).unlockedClassRanks, ['C', 'B', 'A', 'S', 'SS']);
});

test('nível de Respiração progride em 1, 4, 8 e 12', () => {
    assert.equal(resolveSlayerProgression(1).breathingLevel, 1);
    assert.equal(resolveSlayerProgression(4).breathingLevel, 2);
    assert.equal(resolveSlayerProgression(8).breathingLevel, 3);
    assert.equal(resolveSlayerProgression(12).breathingLevel, 4);
});

test('eventos entre níveis não reaplicam marcos anteriores', () => {
    const events = progressionEventsBetween(10, 11);
    assert.deepEqual(events, [
        { level: 11, event: 'class:unlock-S' },
        { level: 11, event: 'altruistic-state:eligible' },
    ]);
});

test('nível inválido é rejeitado', () => {
    assert.throws(() => slayerProgressionAtLevel(0), RangeError);
    assert.throws(() => slayerProgressionAtLevel(15), RangeError);
});
