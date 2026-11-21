import assert from 'node:assert/strict';
import test from 'node:test';
import { MODULE_ID } from '../scripts/constants.mjs';
import { activeMasterBattleParryGuard } from '../scripts/slayer/master-battle-parry.mjs';
import { applySlayerDamage } from '../scripts/status-engine.mjs';
import { setupFoundryMocks } from './fixtures/foundry-mock.mjs';

test('Aparar reduz antes do PDV temporário, não gasta Reação e dura uma vez por rodada', async () => {
    setupFoundryMocks();
    const props = { nome_slayer: 'Mestre', classe_escolhida: 'classe_mb', nvl_num: 11,
        for_display: 4, dex_display: 3, pdv_slayer_total_conta: 20, pdv_slayer_extra: 5 };
    const flags = {};
    const attackerFlags = {};
    const attacker = { uuid: 'Actor.enemy', isOwner: true,
        getFlag: (_module, key) => attackerFlags[key],
        async setFlag(_module, key, value) { attackerFlags[key] = value; } };
    const actor = {
        uuid: 'Actor.mestre', isOwner: true, system: { props },
        getFlag: (_module, key) => flags[key],
        async update(patch) {
            for (const [key, value] of Object.entries(patch)) {
                if (key.startsWith('system.props.')) props[key.slice(13)] = value;
                if (key.startsWith(`flags.${MODULE_ID}.`)) flags[key.split('.').at(-1)] = value;
            }
        },
    };
    game.combat = { id: 'parry', started: true, round: 1, turn: 0, turns: [{ actor: attacker }, { actor }] };
    let prompts = 0;
    foundry.applications.api.DialogV2.wait = async () => { prompts++; return 'FOR'; };
    Roll.create = () => ({ evaluate: async () => ({ total: 2, toMessage: async () => {} }) });
    const context = { isAttack: true, sourceActorUuid: attacker.uuid, damageTypes: ['cortante'] };
    assert.equal((await applySlayerDamage(actor, 6, context)).appliedDamage, 0);
    assert.equal(props.pdv_slayer_extra, 5);
    assert.equal(props.acoes_slayer_dados, undefined);
    assert.equal(activeMasterBattleParryGuard(attacker).expiresAt.round, 2);
    assert.equal((await applySlayerDamage(actor, 6, context)).appliedDamage, 6);
    assert.equal(prompts, 1);
    game.combat.round = 2;
    assert.equal(activeMasterBattleParryGuard(attacker), null);
    assert.equal((await applySlayerDamage(actor, 6, { ...context, damageTypes: ['venenoso'] })).appliedDamage, 6);
    assert.equal(prompts, 1);
});
