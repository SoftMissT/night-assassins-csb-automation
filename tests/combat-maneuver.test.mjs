import { setupFoundryMocks } from './fixtures/foundry-mock.mjs';
setupFoundryMocks();

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { COMBAT_MANEUVERS } from '../scripts/combat-maneuvers-data.mjs';
import {
    parseCombatManeuverState,
    consumeCombatManeuverPending,
    resolveCombatManeuverBonuses,
    useCombatManeuver,
} from '../scripts/combat-maneuver-service.mjs';

function actor(extra = {}) {
    const value = {
        id: 'slayer-1',
        type: 'slayer',
        isOwner: true,
        system: { props: { nome_slayer: 'Teste', fdv_display: 4, for_display: 3, folego_slayer_atual: 6, ...extra } },
    };
    value.update = async (patch) => {
        for (const [key, current] of Object.entries(patch)) {
            const path = key.replace('system.props.', '');
            value.system.props[path] = current;
        }
    };
    return value;
}

describe('Manobras de Combate', () => {
    it('cataloga todas as manobras nomeadas e custos positivos', () => {
        assert.equal(COMBAT_MANEUVERS.length, 26);
        assert.equal(new Set(COMBAT_MANEUVERS.map((entry) => entry.id)).size, COMBAT_MANEUVERS.length);
        assert.ok(COMBAT_MANEUVERS.every((entry) => entry.cost >= 1 && entry.trigger && entry.effect));
    });

    it('Ataque Imprudente paga Fôlego e deixa Vantagem/+FOR pendentes', async () => {
        const slayer = actor();
        const result = await useCombatManeuver({ actor: slayer, maneuverId: 'ataque_imprudente', context: 'attack', targetUuid: 'oni-1' });
        assert.equal(result.ok, true);
        assert.equal(slayer.system.props.folego_slayer_atual, 3);
        const status = JSON.parse(slayer.system.props.status_slayer_dados);
        assert.ok(status.active.includes('vulneravel'));
        assert.equal(status.effects.vulneravel.remainingTurns, 1);
        assert.deepEqual(resolveCombatManeuverBonuses(slayer, { channel: 'dano', targetUuid: 'oni-1' }), {
            attackBonus: 0,
            damageBonus: 3,
            defenseBonus: 0,
            movementBonus: 0,
            advantage: false,
            maxDamage: false,
        });
    });

    it('bloqueia duas manobras no mesmo contexto e não gasta Fôlego na segunda', async () => {
        const slayer = actor();
        await useCombatManeuver({ actor: slayer, maneuverId: 'finta', context: 'attack', targetUuid: 'oni-1' });
        const second = await useCombatManeuver({ actor: slayer, maneuverId: 'finta', context: 'attack', targetUuid: 'oni-1' });
        assert.equal(second.ok, false);
        assert.equal(slayer.system.props.folego_slayer_atual, 4);
    });

    it('Leitura de Padrão fornece marcadores e só pode ser usada uma vez por alvo', async () => {
        const slayer = actor();
        const result = await useCombatManeuver({ actor: slayer, maneuverId: 'leitura_padrao', context: 'situation', targetUuid: 'oni-1' });
        assert.equal(result.ok, true);
        const state = parseCombatManeuverState(slayer.system.props.manobras_slayer_estado, 'fora-combate');
        assert.equal(state.markers['oni-1'], 2);
        const second = await useCombatManeuver({ actor: slayer, maneuverId: 'leitura_padrao', context: 'situation-2', targetUuid: 'oni-1' });
        assert.equal(second.ok, false);
    });

    it('consome acerto e dano em etapas sem perder o bônus de dano', async () => {
        const slayer = actor();
        await useCombatManeuver({
            actor: slayer,
            maneuverId: 'ataque_imprudente',
            context: 'attack',
            targetUuid: 'oni-1',
        });
        await consumeCombatManeuverPending(slayer, { targetUuid: 'oni-1', part: 'hit' });
        assert.deepEqual(resolveCombatManeuverBonuses(slayer, { channel: 'acerto', targetUuid: 'oni-1' }), {
            attackBonus: 0,
            damageBonus: 0,
            defenseBonus: 0,
            movementBonus: 0,
            advantage: false,
            maxDamage: false,
        });
        assert.equal(resolveCombatManeuverBonuses(slayer, { channel: 'dano', targetUuid: 'oni-1' }).damageBonus, 3);
        await consumeCombatManeuverPending(slayer, { targetUuid: 'oni-1', part: 'damage' });
        assert.equal(resolveCombatManeuverBonuses(slayer, { channel: 'dano', targetUuid: 'oni-1' }).damageBonus, 0);
    });
});
