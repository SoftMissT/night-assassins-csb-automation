import assert from 'node:assert/strict';
import test from 'node:test';
import {
    applyUserPoison,
    parseUserPoisonState,
    tickUserPoison,
    userPoisonHealingAmount,
} from '../scripts/slayer/poison-user-service.mjs';

test('Coração soma dano apenas quando o veneno é aplicado por contato', () => {
    const options = { sourceActorUuid: 'Actor.Coracao', carisma: 4, contactDamageBonus: 1, actionId: 'A1' };
    const hit = applyUserPoison('', { ...options, rank: 'C', profile: 'vanilla' });
    assert.equal(hit.state.instances[0].damage, 5);
    assert.equal(applyUserPoison(hit.state, options).applied, false);
    assert.equal(applyUserPoison('', { ...options, rank: 'S' }).state.instances[0].damage, 6);
});

test('rank C aplica CAR por 2 turnos e respeita contato 1x por ação', () => {
    const first = applyUserPoison('', { sourceActorUuid: 'Actor.A', rank: 'C', carisma: 4, actionId: 'X' });
    assert.equal(first.applied, true);
    assert.deepEqual(first.state.instances[0], { sourceActorUuid: 'Actor.A', damage: 4, remainingTurns: 2, rank: 'C' });
    assert.equal(applyUserPoison(first.state, { sourceActorUuid: 'Actor.A', rank: 'C', carisma: 4, actionId: 'X' }).reason, 'contact-already-applied');
});

test('o limite ampliado permite dois contatos distintos sem reaplicar o mesmo golpe', () => {
    const options = { sourceActorUuid: 'Actor.A', rank: 'C', carisma: 4, actionId: 'X', contactLimit: 2 };
    const first = applyUserPoison('', { ...options, attackIndex: 0 });
    assert.equal(first.applied, true);
    assert.equal(applyUserPoison(first.state, { ...options, attackIndex: 0 }).applied, false);
    const second = applyUserPoison(first.state, { ...options, attackIndex: 1 });
    assert.equal(second.applied, true);
    assert.equal(second.state.instances.length, 1, 'a renovação Homebrew ainda respeita o próprio limite de acúmulo');
    assert.equal(applyUserPoison(second.state, { ...options, attackIndex: 2 }).applied, false);
    const legacy = { ...first.state, lastContactActionBySource: { 'Actor.A': 'X' } };
    assert.equal(applyUserPoison(legacy, { ...options, attackIndex: 0 }).applied, false);
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

test('veneno vanilla usa o turno seguinte e respeita contato antes de Rank S', () => {
    const options = { sourceActorUuid: 'Actor.A', rank: 'A', carisma: 4, actionId: 'X', profile: 'vanilla' };
    const first = applyUserPoison('', options);
    assert.equal(first.state.resistancePenalty, 0);
    assert.equal(applyUserPoison(first.state, options).reason, 'contact-already-applied');
    const second = applyUserPoison(first.state, { ...options, actionId: 'Y' });
    const tick = tickUserPoison(JSON.stringify(second.state));
    assert.equal(tick.damage, 12);
    assert.equal(tick.state.instances.length, 0);
    assert.equal(tickUserPoison(tick.state).damage, 0);
});

test('Rank SS vanilla remove limite artificial de contato e não aplica Ferida Tóxica', () => {
    let state = '';
    const options = { sourceActorUuid: 'Actor.A', rank: 'SS', carisma: 3, actionId: 'X', profile: 'vanilla' };
    for (let count = 0; count < 4; count++) state = applyUserPoison(state, options).state;
    const tick = tickUserPoison(state);
    assert.equal(tick.damage, 20);
    assert.equal(tick.state.toxicWound, false);
    assert.equal(userPoisonHealingAmount(tick.state, 9), 5);
    assert.equal(userPoisonHealingAmount(tickUserPoison(tick.state).state, 9), 9);
});

test('mudar de perfil não reescreve doses aplicadas antes da troca', () => {
    const options = { sourceActorUuid: 'Actor.A', rank: 'B', carisma: 5 };
    const first = applyUserPoison('', { ...options, actionId: 'X', profile: 'vanilla' });
    const second = applyUserPoison(first.state, { ...options, actionId: 'Y', profile: 'homebrew' });
    assert.equal(second.state.instances.length, 2);
    const tick = tickUserPoison(second.state);
    assert.equal(tick.damage, 14);
    assert.equal(tick.state.instances[0].remainingTurns, 2);
});
