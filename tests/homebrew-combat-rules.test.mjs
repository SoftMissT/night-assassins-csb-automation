import assert from 'node:assert/strict';
import test from 'node:test';
import {
    consumeCriticalDefenseBonus,
    fumbleDefenseExtraDice,
    fumbleDefenseExtraFormula,
    grantCriticalDefenseBonus,
    isCriticalFailure,
    opportunityAttackHits,
} from '../scripts/homebrew-combat-rules.mjs';

test('falha crítica é natural 1', () => {
    assert.equal(isCriticalFailure(1), true);
    assert.equal(isCriticalFailure(2), false);
    assert.equal(isCriticalFailure(20), false);
});

test('ataque de oportunidade é Acerto contra Esquiva/Bloqueio, sem CD; empate favorece a defesa', () => {
    assert.equal(opportunityAttackHits({ attackTotal: 15, defenseTotal: 12 }), true);
    assert.equal(opportunityAttackHits({ attackTotal: 12, defenseTotal: 12 }), false);
    assert.equal(opportunityAttackHits({ attackTotal: 9, defenseTotal: 14 }), false);
});

test('crítico na defesa guarda +2 só contra aquele inimigo e some no próximo ataque contra ele', () => {
    const afterGrant = grantCriticalDefenseBonus({}, 'Actor.orc');
    assert.deepEqual(afterGrant, { 'Actor.orc': 2 });
    const first = consumeCriticalDefenseBonus(afterGrant, 'Actor.orc');
    assert.equal(first.bonus, 2);
    assert.deepEqual(first.bonuses, {});
    const second = consumeCriticalDefenseBonus(first.bonuses, 'Actor.orc');
    assert.equal(second.bonus, 0);
});

test('bônus de um inimigo não afeta o ataque contra outro', () => {
    const map = grantCriticalDefenseBonus({}, 'Actor.a');
    const other = consumeCriticalDefenseBonus(map, 'Actor.b');
    assert.equal(other.bonus, 0);
    assert.deepEqual(other.bonuses, { 'Actor.a': 2 });
});

test('falha crítica na defesa: 1d4 por dezena, com mínimo de 1d4 para 1 a 19 de dano (livro oficial)', () => {
    assert.equal(fumbleDefenseExtraDice(0), 0);
    assert.equal(fumbleDefenseExtraDice(5), 1);
    assert.equal(fumbleDefenseExtraDice(10), 1);
    assert.equal(fumbleDefenseExtraDice(19), 1);
    assert.equal(fumbleDefenseExtraDice(20), 2);
    assert.equal(fumbleDefenseExtraDice(30), 3);
    assert.equal(fumbleDefenseExtraDice(-5), 0);
    assert.equal(fumbleDefenseExtraFormula(0), '');
    assert.equal(fumbleDefenseExtraFormula(9), '1d4');
    assert.equal(fumbleDefenseExtraFormula(27), '2d4');
});
