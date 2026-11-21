import assert from 'node:assert/strict';
import test from 'node:test';

import {
    planDualBreathingComposite,
    planDualBreathingPosture,
    planDualBreathingUse,
} from '../scripts/slayer/dual-breathing-hybrid-rules.mjs';

const combat = { profile: 'homebrew', rank: 'SS', combatKey: 'combat', pdrAvailable: 10, pdvAvailable: 10 };
const first = { ...combat, turnKey: 'combat:1:0' };
const next = { ...first, turnKey: 'combat:2:0' };
const base = { kind: 'technique', action: 'ataque', pdrCost: 2 };
const variation = { ...base, kind: 'variation', side: 'primary' };

function posture(mode, state = null, options = {}) {
    return planDualBreathingPosture(state, { ...combat, mode, ...options });
}

function use(state, options = {}, turn = first) {
    return planDualBreathingUse(state, { ...turn, ...variation, ...options });
}

test('Sequência acompanha técnicas padrão de ambos os lados no combate e pode ativar após o segundo uso', () => {
    const primary = use(null, { ...base, side: 'primary' });
    assert.equal(primary.state.usedPrimary, true);
    const armed = posture('sequence', primary.state);
    assert.equal(armed.ok, true);
    assert.equal(armed.state.active, false);
    assert.equal(armed.state.waitingForSequence, true);
    const secondary = use(armed.state, { ...base, side: 'secondary' }, next);
    assert.equal(secondary.state.active, true);
    assert.equal(secondary.state.usedSecondary, true);
    assert.equal(armed.state.active, false);
    assert.equal(posture('sequence', secondary.state, { combatKey: 'another-combat' }).state.active, false);
    const completedWithoutPosture = use(primary.state, { ...base, side: 'secondary' }, next);
    assert.equal(posture('sequence', completedWithoutPosture.state).state.active, true);
});

test('O limite compartilhado só admite dois usos se forem Variações com ações diferentes sob a postura', () => {
    const one = use(null, { ...base, side: 'secondary' });
    assert.equal(use(one.state, { action: 'especial' }).ok, false);
    const active = posture('overload').state;
    const firstVariation = use(active);
    assert.equal(firstVariation.ok, true);
    assert.equal(use(firstVariation.state, { side: 'secondary' }).ok, false);
    assert.equal(use(firstVariation.state, { ...base, action: 'especial', side: 'secondary' }).ok, false);
    assert.equal(use(active, { action: 'completa' }).ok, false);
    assert.equal(use(active, { grantsExtraAttack: true }).ok, false);
    const secondVariation = use(firstVariation.state, { action: 'especial' });
    assert.equal(secondVariation.ok, true);
    assert.equal(use(secondVariation.state, { action: 'movimento' }).ok, false);
    assert.equal(use(secondVariation.state, { action: 'movimento' }, next).ok, true);
    assert.equal(use(secondVariation.state, { action: 'movimento' }, { ...next, combatKey: null, turnKey: null }).state, null);
});

test('Alternância encerra no uso confirmado que repete o lado e não altera o estado em uso bloqueado', () => {
    const active = posture('alternation').state;
    const primary = use(active);
    assert.equal(primary.state.active, true);
    assert.equal(primary.state.lastSide, 'primary');
    const repeatedDenied = use(primary.state, { action: 'especial' });
    assert.equal(repeatedDenied.ok, false);
    assert.equal(repeatedDenied.state, primary.state);
    const alternated = use(primary.state, { action: 'especial', side: 'secondary' });
    assert.equal(alternated.state.active, true);
    const repeatedNextTurn = use(alternated.state, { side: 'secondary' }, next);
    assert.equal(repeatedNextTurn.ok, true);
    assert.equal(repeatedNextTurn.state.active, false);
});

test('Sobrecarga cobra um PDV por Variação e Postura Fixa devolve a perda escolhida para aplicação manual', () => {
    const overload = posture('overload').state;
    assert.equal(use(overload, { pdvCost: 2, pdvAvailable: 2 }).ok, false);
    assert.equal(use(overload, { pdvCost: 2, pdvAvailable: 3 }).extraPdv, 1);
    assert.equal(use(overload, base).extraPdv, 0);
    assert.equal(posture('fixed-stance').ok, false);
    const active = posture('fixed-stance', null, { fixedLoss: 'reach' }).state;
    assert.equal(use(active).manualLoss, 'reach');
    assert.equal(use(active, base).manualLoss, null);
    assert.equal(posture('fixed-stance', null, { fixedLoss: 'vision' }).ok, false);
});

test('Forma Intermediária requer Homebrew S e termina por incapacidade ou PDR insuficiente', () => {
    assert.equal(posture('overload', null, { rank: 'A' }).ok, false);
    assert.equal(posture('overload', null, { profile: 'vanilla' }).ok, false);
    assert.equal(posture('overload', null, { combatKey: null }).ok, false);
    const active = posture('overload').state;
    assert.equal(use(active, {}, { ...first, pdrAvailable: 1 }).state.active, false);
    assert.equal(use(active, { incapacitated: true }).postureEnded, true);
    assert.equal(use(active, {}, { ...first, pdrAvailable: 2 }).state.active, false);
    assert.equal(active.active, true);
});

const sources = {
    primary: { itemId: 'primary', side: 'primary', level: 4, pdrCost: 7 },
    secondary: { itemId: 'secondary', side: 'secondary', level: 3, pdrCost: 4 },
    secondaryLevel: 3, mixType: 'form', compatibility: 'compatible',
};

function compose(state, price, options = {}) {
    return planDualBreathingComposite(state, { ...first, ...sources, price, ...options });
}

test('Forma Composta exige duas fontes de lados distintos, nível, mistura, preço e Rank SS', () => {
    const price = { type: 'once-per-combat' };
    assert.equal(compose(null).ok, false);
    assert.equal(compose(null, { type: 'more-power' }).ok, false);
    assert.equal(compose(null, price, { rank: 'S' }).ok, false);
    assert.equal(compose(null, price, { profile: 'vanilla' }).ok, false);
    assert.equal(compose(null, price, { mixType: 'element' }).ok, false);
    assert.equal(compose(null, price, { secondaryLevel: 2 }).ok, false);
    assert.equal(compose(null, price, { secondary: sources.primary }).ok, false);
    assert.equal(compose(null, price, { secondary: { ...sources.secondary, itemId: sources.primary.itemId } }).ok, false);
    assert.equal(compose(null, price, { pdrAvailable: 9 }).ok, false);
    assert.equal(compose(null, { type: 'target-condition', condition: 'sangramento' }).ok, false);
    assert.equal(compose(null, { type: 'target-condition', condition: 'sangramento' }, { targetMeetsCondition: true }).ok, true);
});

test('Forma Composta consome o maior custo e cobra compatibilidade e preço uma vez por combate', () => {
    const special = compose(null, { type: 'once-per-combat' });
    assert.deepEqual(special.cost, { pdr: 10, pdv: 0 });
    assert.equal(special.action, 'especial');
    assert.equal(compose(special.state, { type: 'full-action' }).ok, false);
    const otherCombat = compose(special.state, { type: 'full-action' }, { combatKey: 'other', turnKey: 'other:1:0' });
    assert.equal(otherCombat.action, 'completa');
    const incompatible = compose(null, { type: 'internal-damage' }, { compatibility: 'incompatible', pdrAvailable: 11, pdvAvailable: 4 });
    assert.deepEqual(incompatible.cost, { pdr: 11, pdv: 4 });
    assert.equal(compose(null, { type: 'internal-damage' }, { compatibility: 'incompatible', pdrAvailable: 11, pdvAvailable: 3 }).ok, false);
});

test('Forma Composta aplica preço de postura/trava no estado e declara os efeitos manuais', () => {
    assert.equal(compose(null, { type: 'end-posture' }).ok, false);
    const active = posture('overload').state;
    const ended = compose(active, { type: 'end-posture' }, { pdrAvailable: 11 });
    assert.equal(ended.state.active, false);
    assert.equal(active.active, true);
    const locked = compose(active, { type: 'lock-secondary' }, { pdrAvailable: 11 });
    assert.equal(use(locked.state, variation).ok, false);
    assert.equal(use(locked.state, { ...base, side: 'secondary' }).ok, false);
    assert.equal(use(locked.state, { ...base, side: 'primary' }).ok, true);
    assert.equal(use(locked.state, variation, next).ok, true);
    assert.equal(compose(null, { type: 'next-defense-disadvantage' }).manualPrice, 'next-defense-disadvantage');
    assert.equal(compose(null, { type: 'exhaustion-on-fail' }).manualPrice, 'exhaustion-on-fail');
});
