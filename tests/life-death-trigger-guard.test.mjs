import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
    hasLifeDeathTrigger,
    hasStableSlayerLifeInputs,
    shouldRunLifeDeath,
} from '../scripts/life-death-service.mjs';

function actor(total = 20) {
    return {
        id: 'slayer-guard',
        system: {
            props: {
                nome_slayer: 'Rin',
                pdv_slayer_total_conta: total,
                pdv_slayer_dano_tomado: 0,
                pdv_slayer_dano_ferida: 0,
                pdv_slayer_curado: 0,
            },
        },
        update: async () => {},
    };
}

function primaryGm() {
    globalThis.game = {
        user: { id: 'gm', isGM: true },
        users: [{ id: 'gm', isGM: true, active: true }],
    };
}

test('life death does not reconcile on Slayer creation-only update', () => {
    primaryGm();
    const changes = { system: { props: { nome_slayer: 'Rin', nvl_pj: 'nvl_1' } } };
    assert.equal(hasLifeDeathTrigger(changes), false);
    assert.equal(shouldRunLifeDeath(actor(), changes, {}), false);
});

test('life death reconciles when Slayer damage changes', () => {
    primaryGm();
    const changes = { system: { props: { pdv_slayer_dano_tomado: 10 } } };
    assert.equal(hasLifeDeathTrigger(changes), true);
    assert.equal(shouldRunLifeDeath(actor(), changes, {}), true);
});

test('life death does not reconcile when total PDV is ERROR', () => {
    primaryGm();
    assert.equal(hasStableSlayerLifeInputs(actor('ERROR')), false);
    assert.equal(
        shouldRunLifeDeath(actor('ERROR'), { 'system.props.pdv_slayer_dano_tomado': 10 }, {}),
        false
    );
});

test('life death does not reconcile when total PDV is object', () => {
    primaryGm();
    const target = actor({ value: 10 });
    assert.equal(hasStableSlayerLifeInputs(target), false);
    assert.equal(
        shouldRunLifeDeath(target, { 'system.props.pdv_slayer_dano_tomado': 10 }, {}),
        false
    );
});

test('hook updateActor encaminha changes para a guarda', () => {
    const source = fs.readFileSync(
        new URL('../scripts/life-death-service.mjs', import.meta.url),
        'utf8'
    );
    assert.match(source, /Hooks\.on\(['"]updateActor['"],\s*\(actor,\s*changes,\s*options\)/);
    assert.match(source, /shouldRunLifeDeath\(actor,\s*changes,\s*options\)/);
});
