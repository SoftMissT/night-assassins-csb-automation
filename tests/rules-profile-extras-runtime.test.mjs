import assert from 'node:assert/strict';
import test from 'node:test';
import { setupFoundryMocks } from './fixtures/foundry-mock.mjs';
import { attemptDreamExchange } from '../scripts/dream-passive-service.mjs';
import { foxPassiveBonuses, activateFoxPassive, FOX_PASSIVE_KEY } from '../scripts/fox-passive-service.mjs';
import { metalForgeBonuses, activateMetalForge, METAL_FORGE_KEY } from '../scripts/metal-forge-passive.mjs';
import { windCurrentBonuses, activateWindCurrent, WIND_CURRENT_KEY } from '../scripts/wind-current-passive.mjs';
import { soundPassiveBonuses, SOUND_PASSIVE_KEY } from '../scripts/sound-passive-service.mjs';
import { processFlameEmbers } from '../scripts/flame-breathing-service.mjs';
import { PASSIVE_DAMAGE_KEY, pendingPassiveDamage } from '../scripts/breathing-combat-passives.mjs';
import { resolveSlayerDerivedBonuses } from '../scripts/derived-bonus-service.mjs';
import { applyStonePassiveAfterDamage } from '../scripts/stone-breathing-service.mjs';
import { resolveSnowFreezeGain } from '../scripts/snow-breathing-service.mjs';
import { grantMistPattern, mistPatternCount, normalizeMistBreathingState } from '../scripts/mist-breathing-service.mjs';
import { SETTINGS } from '../scripts/settings.mjs';

function configure(selection) {
    setupFoundryMocks();
    game.user.isGM = true;
    game.settings = { get: (_module, key) => key === SETTINGS.rulesSelection ? JSON.stringify(selection) : undefined };
}

test('extras desligados bloqueiam suas passivas e preservam os estados da ficha', async () => {
    configure({ sonhos: false, troca_equivalente: false, raposa: false, veus: false,
        forja_viva: false, corrente: false, respiracao: 'vanilla', brasas: false,
        olhos_escarlate: false, extras_pedra: false, extras_nevoa: false, extras_neve: false });
    const props = {
        npc_nome: 'NPC', npc_pdv_base: 20, npc_pdv_dano: 30,
        resp_slayer_display: 'resp_slayer_raposa',
        [FOX_PASSIVE_KEY]: JSON.stringify({ combatId: 'c1', veils: 6 }),
        [METAL_FORGE_KEY]: JSON.stringify({ combatId: 'c1', temperature: 6 }),
        [WIND_CURRENT_KEY]: JSON.stringify({ combatId: 'c1', current: 5, mode: 'uncontrolled' }),
        [SOUND_PASSIVE_KEY]: JSON.stringify({ combatId: 'c1', bpm: 200 }),
        [PASSIVE_DAMAGE_KEY]: JSON.stringify([
            { executionId: 'old', source: 'Metal Branco', formula: '1d8' },
            { executionId: 'old', source: 'Partitura Musical', formula: '1d6' },
            { executionId: 'old', source: 'Outro', formula: '1d4' },
        ]),
    };
    const actor = { uuid: 'Actor.extras', isOwner: true, system: { props }, updates: [],
        async update(patch) { this.updates.push(patch); } };

    assert.equal(await attemptDreamExchange(actor), false);
    assert.equal((await activateFoxPassive(actor, 'supreme')).ok, false);
    assert.equal((await activateMetalForge(actor)).ok, false);
    assert.equal((await activateWindCurrent(actor, 'spend', { points: 1, channel: 'acerto' })).ok, false);
    assert.equal(foxPassiveBonuses(props).acerto, 0);
    assert.equal(metalForgeBonuses(props).bloqueio, 0);
    assert.equal(windCurrentBonuses(props).bloqueio, 0);
    assert.equal(soundPassiveBonuses({ ...props, resp_slayer_display: 'resp_slayer_som',
        hab_escolhida: 'hab_escolhida_audicao' }).bloqueio, 0);
    assert.deepEqual(await processFlameEmbers(actor), { applied: false, disabled: true });
    assert.deepEqual(pendingPassiveDamage(props, 'old'), [{ executionId: 'old', source: 'Outro', formula: '1d4' }]);
    const snowState = { freezeByTarget: { 'Actor.foe': 2 } };
    assert.deepEqual(resolveSnowFreezeGain(snowState, 'Actor.foe', 1).state.freezeByTarget, snowState.freezeByTarget);
    const mistState = grantMistPattern({ patterns: { cyclone: { earned: true, benefitAvailable: true, turnsRemaining: 1 } } }, 'stigma');
    assert.equal(mistPatternCount(mistState), 0);
    assert.equal(normalizeMistBreathingState(mistState).patterns.cyclone.earned, true);
    assert.equal(normalizeMistBreathingState(mistState).patterns.stigma.earned, false);
    await applyStonePassiveAfterDamage({ actor: { ...actor, items: [{ system: { props: { respiracao_nome: 'Pedra' } } }] },
        appliedTargets: [{ actor: { uuid: 'Actor.foe' }, amount: 2, concussionDamage: 2 }],
        actionId: 'stone', strength: 5, hasAttackDamage: true });
    assert.equal(resolveSlayerDerivedBonuses({ ...props, resp_slayer_display: 'resp_slayer_raposa' })
        .channels.pdrMaximo.sources.some(source => source.label === 'Olhos Escarlate'), false);
    assert.deepEqual(actor.updates, []);
});
