import { setupFoundryMocks } from './fixtures/foundry-mock.mjs';
setupFoundryMocks();

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { makeActor } from './fixtures/actor.mjs';
import { createCombatContext, validateCombatContext } from '../scripts/core/combat-context.mjs';
import { createActorTransaction } from '../scripts/core/actor-transaction.mjs';

describe('core combat context', () => {
    it('preserva a identidade Slayer e os alvos explícitos', async () => {
        const actor = makeActor({ props: { nome_slayer: 'Kwon', pdv_slayer_total_valor: 20 } });
        const target = makeActor({ props: { nome_oni: 'Lua', pdv_oni_total_valor: 30 } });
        const context = await createCombatContext({ actor, targets: [target], combat: null });
        assert.equal(context.actor, actor);
        assert.equal(context.actorKind, 'slayer');
        assert.deepEqual(context.targets, [target]);
    });

    it('valida ownerKind, alvo obrigatório e limite', async () => {
        const actor = makeActor({ props: { nome_slayer: 'Kwon', pdv_slayer_total_valor: 20 } });
        const context = await createCombatContext({ actor, targets: [] });
        const missing = validateCombatContext(context, {
            ownerKind: 'slayer',
            target: { mode: 'enemy', maximum: 1 },
        });
        assert.equal(missing.ok, false);
        assert.match(missing.issues[0], /Nenhum alvo/);
        const wrong = validateCombatContext(context, {
            ownerKind: 'oni',
            target: { mode: 'none' },
        });
        assert.equal(wrong.ok, false);
        assert.match(wrong.issues[0], /oni/);
    });
});

describe('actor transaction', () => {
    it('funde patches e executa uma escrita por Actor em paralelo', async () => {
        const writes = [];
        const actor = makeActor({ props: { nome_slayer: 'Kwon' } });
        actor.uuid = 'Actor.slayer';
        actor.update = async (patch, options) => writes.push({ patch, options });
        const transaction = createActorTransaction()
            .stage(actor, { 'system.props.pdr_slayer_gasto_valor': 2 })
            .stage(actor, { 'system.props.folego_slayer_atual': 3 });
        const result = await transaction.commit();
        assert.equal(result.ok, true);
        assert.equal(writes.length, 1);
        assert.deepEqual(writes[0].patch, {
            'system.props.pdr_slayer_gasto_valor': 2,
            'system.props.folego_slayer_atual': 3,
        });
        assert.equal(writes[0].options.naTransaction, true);
    });

    it('não permite commit duplicado', async () => {
        const actor = makeActor();
        actor.uuid = 'Actor.once';
        actor.update = async () => {};
        const transaction = createActorTransaction().stage(actor, { 'system.props.test': 1 });
        await transaction.commit();
        await assert.rejects(() => transaction.commit(), /finalizada/);
    });
});
