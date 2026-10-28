import assert from 'node:assert/strict';
import test from 'node:test';
import { setupFoundryMocks } from './fixtures/foundry-mock.mjs';
import { makeActor } from './fixtures/actor.mjs';

setupFoundryMocks();

test('Cancelar no diálogo de teste devolve falso para DialogV2', async () => {
    let config;
    foundry.applications.api.DialogV2.wait = async (options) => {
        config = options;
        return false;
    };
    const { openRollDialog } = await import('../scripts/dialogs/roll-dialog.mjs');

    await openRollDialog({
        actor: makeActor(),
        test: 'Teste',
        attr: 'FOR',
        value: 4,
    });

    const cancel = config.buttons.find((button) => button.action === 'cancel');
    assert.equal(cancel.callback(), false);
});
