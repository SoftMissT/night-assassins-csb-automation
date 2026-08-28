import assert from 'node:assert/strict';
import test from 'node:test';

import {
    getDamageStatusEffects,
    getRollStatusEffects,
    getStatusCapabilities,
    isReactionBlocked,
    mergeRollMode,
} from '../scripts/status-effects.mjs';

function props(active = [], exhaustion = 0) {
    return {
        status_slayer_dados: JSON.stringify({ version: 1, active, exhaustion }),
        status_slayer_exaustao: exhaustion,
    };
}

test('Vantagem e Desvantagem opostas se anulam', () => {
    assert.equal(mergeRollMode('advantage', 'disadvantage'), 'normal');
    assert.equal(mergeRollMode('normal', 'advantage'), 'advantage');
});

test('Fadiga Mental dá Desvantagem em SAB', () => {
    const result = getRollStatusEffects(props(['fadiga_mental']), {
        test: 'Percepção',
        attr: 'SAB',
    });
    assert.equal(result.mode, 'disadvantage');
    assert.equal(
        getRollStatusEffects(props(['fadiga_mental']), { test: 'Iniciativa', attr: 'DEX' }).mode,
        'disadvantage'
    );
});

test('Cegueira Parcial penaliza Acerto e Defesa', () => {
    assert.equal(
        getRollStatusEffects(props(['cegueira_parcial']), {
            test: 'Acerto',
            attr: 'FOR',
            kind: 'attack',
        }).modifier,
        -2
    );
    assert.equal(
        getRollStatusEffects(props(['cegueira_parcial']), {
            test: 'Esquiva',
            attr: 'DEX',
            kind: 'defense',
        }).modifier,
        -2
    );
});

test('Fadiga Espiritual afeta FDV e aumenta o custo de PDR', () => {
    assert.equal(
        getRollStatusEffects(props(['fadiga_espiritual']), { test: 'Resistência', attr: 'FDV' })
            .modifier,
        -2
    );
    assert.equal(
        getRollStatusEffects(props(['fadiga_espiritual']), { test: 'Concentração', attr: 'FDV' })
            .modifier,
        0
    );
    assert.equal(getDamageStatusEffects(props(['fadiga_espiritual'])).pdrSurcharge, 1);
});

test('Fadiga Corporal impede crítico e Exaustão reduz ataque e dano', () => {
    const current = props(['fadiga_corporal'], 4);
    const attack = getRollStatusEffects(current, { test: 'Acerto', attr: 'DEX', kind: 'attack' });
    const damage = getDamageStatusEffects(current);
    assert.equal(attack.mode, 'disadvantage');
    assert.equal(attack.modifier, -3);
    assert.equal(damage.criticalAllowed, false);
    assert.equal(damage.modifier, -1);
});

test('Ofuscamento ignora efeitos mecânicos da Exaustão sem apagar o valor salvo', () => {
    const current = props([], 7);
    current.resp_nevoa_estado = JSON.stringify({ dazzle: { turns: 3, exhaustionImmune: true } });
    const attack = getRollStatusEffects(current, { test: 'Acerto', attr: 'DEX', kind: 'attack' });
    assert.equal(attack.blocked, false);
    assert.equal(attack.modifier, 0);
    assert.equal(getDamageStatusEffects(current).modifier, 0);
    assert.equal(getStatusCapabilities(current).deadFromExhaustion, false);
    assert.equal(current.status_slayer_exaustao, 7);
});

test('Ofuscamento expirado não concede imunidade à Exaustão', () => {
    const current = props([], 7);
    current.resp_nevoa_estado = JSON.stringify({ dazzle: { turns: 0, exhaustionImmune: true } });
    assert.equal(
        getRollStatusEffects(current, { test: 'Acerto', attr: 'DEX', kind: 'attack' }).blocked,
        true
    );
});

test('Atordoamento bloqueia ações e Frenesi bloqueia Reações', () => {
    assert.equal(
        getRollStatusEffects(props(['atordoamento']), { test: 'Acerto', kind: 'attack' }).blocked,
        true
    );
    assert.equal(
        getRollStatusEffects(props(['atordoamento']), { test: 'Bloqueio', kind: 'defense' })
            .blocked,
        false
    );
    assert.equal(isReactionBlocked(props(['frenesi'])), true);
});

test('Sem Reação bloqueia Reações mas não ações', () => {
    assert.equal(isReactionBlocked(props(['sem_reacao'])), true);
    assert.equal(
        getRollStatusEffects(props(['sem_reacao']), { test: 'Acerto', kind: 'attack' }).blocked,
        false
    );
    assert.equal(
        getRollStatusEffects(props(['sem_reacao']), { test: 'Bloqueio', kind: 'defense' }).blocked,
        false
    );
    assert.equal(getStatusCapabilities(props(['sem_reacao'])).reactionsAllowed, false);
});

test('Paralisia falha FOR/DEX fora da Defesa', () => {
    assert.equal(
        getRollStatusEffects(props(['paralisia']), { test: 'Atletismo', attr: 'FOR' }).autoFail,
        true
    );
    assert.equal(
        getRollStatusEffects(props(['paralisia']), {
            test: 'Esquiva',
            attr: 'DEX',
            kind: 'defense',
        }).autoFail,
        false
    );
});

test('Corrupção drena FDV por pilha', () => {
    const current = {
        status_slayer_dados: JSON.stringify({
            version: 2,
            active: ['corrupcao'],
            exhaustion: 0,
            effects: { corrupcao: { stacks: 3 } },
        }),
    };
    assert.equal(getRollStatusEffects(current, { test: 'Resistência', attr: 'FDV' }).modifier, -3);
});

test('capacidades refletem movimento, silêncio, cura e hipotermia', () => {
    const current = {
        status_slayer_dados: JSON.stringify({
            version: 2,
            active: ['fratura', 'hipotermia', 'silenciado', 'regeneracao_suprimida'],
            exhaustion: 3,
            effects: { hipotermia: { stacks: 2 } },
        }),
    };
    assert.deepEqual(getStatusCapabilities(current), {
        targetable: true,
        movementAllowed: false,
        movementMultiplier: 0.5,
        movementPenaltyMeters: 4.5,
        spiritualActionsAllowed: false,
        sprintAllowed: true,
        healingMultiplier: 0.5,
        incomingDemonicDamageBonus: 0,
        reactionsAllowed: true,
        ignoresFear: false,
        ignoresConfusion: false,
        deadFromExhaustion: false,
    });
});

test('À Beira da Morte bloqueia ataque, defesa, dano, movimento e reação', () => {
    const props = {
        status_slayer_dados: JSON.stringify({ version: 2, active: [], exhaustion: 0, effects: {} }),
        vida_morte_slayer_dados: JSON.stringify({ version: 1, dying: true, dead: false }),
    };
    assert.equal(
        getRollStatusEffects(props, { test: 'Acerto', attr: 'DEX', kind: 'attack' }).blocked,
        true
    );
    assert.equal(
        getRollStatusEffects(props, { test: 'Esquiva', attr: 'DEX', kind: 'defense' }).blocked,
        true
    );
    assert.equal(getDamageStatusEffects(props).blocked, true);
    assert.equal(isReactionBlocked(props), true);
    const capabilities = getStatusCapabilities(props);
    assert.equal(capabilities.movementAllowed, false);
    assert.equal(capabilities.spiritualActionsAllowed, false);
    assert.equal(capabilities.reactionsAllowed, false);
});
