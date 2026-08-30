import assert from 'node:assert/strict';
import test from 'node:test';
import {
    applyUserPoison,
    parseUserPoisonState,
    tickUserPoison,
    userPoisonHealingAmount,
} from '../scripts/slayer/poison-user-service.mjs';

test('rank C aplica CAR por 2 turnos e respeita contato 1x por ação', () => {
    const first = applyUserPoison('', { sourceActorUuid: 'Actor.A', rank: 'C', carisma: 4, actionId: 'X' });
    assert.equal(first.applied, true);
    assert.deepEqual(first.state.instances[0], { sourceActorUuid: 'Actor.A', damage: 4, remainingTurns: 2, rank: 'C' });
    assert.equal(applyUserPoison(first.state, { sourceActorUuid: 'Actor.A', rank: 'C', carisma: 4, actionId: 'X' }).reason, 'contact-already-applied');
});

test('rank B renova uma dose, causa CAR+2 por 3 turnos e aplica -1 não acumulável', () => {
    const first = applyUserPoison('', { sourceActorUuid: 'Actor.A', rank: 'B', carisma: 5, actionId: 'A1' });
    const renewed = applyUserPoison(first.state, { sourceActorUuid: 'Actor.A', rank: 'B', carisma: 5, actionId: 'A2' });
    assert.equal(renewed.state.instances.length, 1);
    assert.equal(renewed.state.instances[0].damage, 7);
    assert.equal(renewed.state.instances[0].remainingTurns, 3);
    assert.equal(renewed.state.resistancePenalty, -1);
});

test('rank S permite 3 instâncias independentes e substitui a de menor duração', () => {
    let state = '';
    for (let i = 0; i < 3; i += 1)
        state = applyUserPoison(state, { sourceActorUuid: 'Actor.A', rank: 'S', carisma: 3, actionId: 'X' }).state;
    assert.equal(state.instances.length, 3);
    state.instances[0].remainingTurns = 1;
    const fourth = applyUserPoison(state, { sourceActorUuid: 'Actor.A', rank: 'S', carisma: 4, actionId: 'X' });
    assert.equal(fourth.state.instances.length, 3);
    assert.equal(fourth.state.instances.some((entry) => entry.damage === 6 && entry.remainingTurns === 3), true);
});

test('tick soma todas as doses, mantém durações separadas e ativa Corta-Cura/Ferida Tóxica', () => {
    const state = parseUserPoisonState({ instances: [
        { sourceActorUuid: 'Actor.A', damage: 5, remainingTurns: 1, rank: 'SS' },
        { sourceActorUuid: 'Actor.A', damage: 5, remainingTurns: 2, rank: 'SS' },
        { sourceActorUuid: 'Actor.A', damage: 5, remainingTurns: 3, rank: 'SS' },
    ] });
    const tick = tickUserPoison(state);
    assert.equal(tick.damage, 15);
    assert.equal(tick.state.instances.length, 2);
    assert.equal(tick.state.healingSuppressed, true);
    assert.equal(tick.state.toxicWound, true);
    assert.equal(userPoisonHealingAmount(tick.state, 9), 5);
});

test('imunidade impede aplicação', () => {
    assert.equal(applyUserPoison('', { sourceActorUuid: 'Actor.A', rank: 'SS', carisma: 9, immune: true }).applied, false);
});
