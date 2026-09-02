import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
    awakeningBloodCost,
    awakeningDuration,
    awakeningExpired,
    awakeningRuntime,
} from '../scripts/special-weapon-awakening-core.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Sangue na Bainha preserva 10% do PDV atual arredondado para cima', () => {
    assert.deepEqual(awakeningBloodCost(101), { current: 101, remaining: 11, cost: 90 });
    assert.deepEqual(awakeningBloodCost(10), { current: 10, remaining: 1, cost: 9 });
});

test('duração segue Dualidade, Simbiose, Unificação e Identidade', () => {
    assert.equal(awakeningDuration('Dualidade'), 2);
    assert.equal(awakeningDuration('Simbiose'), 3);
    assert.equal(awakeningDuration('Unificação'), 3);
    assert.equal(awakeningDuration('Identidade'), 4);
});

test('Primeiro Despertar expira automaticamente na rodada correta', () => {
    const runtime = awakeningRuntime({ combatId: 'c1', round: 4, duration: 2, side: 'forseti' });
    assert.equal(awakeningExpired(runtime, { id: 'c1', round: 5 }), false);
    assert.equal(awakeningExpired(runtime, { id: 'c1', round: 6 }), true);
});

test('main e template expõem o manager nativo sem injeção DOM', () => {
    const main = fs.readFileSync(path.join(root, 'scripts', 'main.mjs'), 'utf8');
    const template = fs.readFileSync(path.join(root, 'src', 'templates', 'items', 'special-slayer-weapon-template.json'), 'utf8');
    assert.match(main, /registerSpecialWeaponAwakeningRuntime/);
    assert.match(main, /openSpecialWeaponAwakeningManager/);
    assert.match(template, /GERENCIAR DESPERTAR/);
    assert.match(template, /HABILIDADES DA YAMATO/);
    assert.doesNotMatch(main, /prepend\(/);
});
