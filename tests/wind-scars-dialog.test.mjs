import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { setupFoundryMocks } from './fixtures/foundry-mock.mjs';

setupFoundryMocks();

import { openWindScarsDialog } from '../scripts/slayer/wind-scars-dialog.mjs';

function makeVentoActor() {
    const updates = [];
    const actor = {
        name: 'Vento',
        isOwner: true,
        system: {
            props: {
                resp_vento_cicatrizes: '2',
                resp_vento_estado: JSON.stringify({ version: 1, scars: 3, battleDamage: { blunt: 0 } }),
            },
        },
        update: async (patch) => updates.push(patch),
    };
    return { actor, updates };
}

describe('wind scars dialog', () => {
    it('Cancelar não grava zero', async () => {
        const { actor, updates } = makeVentoActor();
        game.user.character = actor;
        canvas.tokens.controlled = [];
        const previous = foundry.applications.api.DialogV2.wait;
        try {
            for (const cancelled of ['cancel', false, null]) {
                foundry.applications.api.DialogV2.wait = async () => cancelled;
                assert.equal(await openWindScarsDialog(), null);
            }
            assert.equal(updates.length, 0);
        } finally {
            foundry.applications.api.DialogV2.wait = previous;
        }
    });

    it('Salvar 6 grava campo e estado; zero é valor válido', async () => {
        const { actor, updates } = makeVentoActor();
        game.user.character = actor;
        canvas.tokens.controlled = [];
        const previous = foundry.applications.api.DialogV2.wait;
        try {
            for (const value of [6, 0]) {
                foundry.applications.api.DialogV2.wait = async () => value;
                assert.equal(await openWindScarsDialog(), value);
            }
            assert.equal(updates[0]['system.props.resp_vento_cicatrizes'], 6);
            assert.equal(JSON.parse(updates[0]['system.props.resp_vento_estado']).scars, 6);
            assert.equal(updates[1]['system.props.resp_vento_cicatrizes'], 0);
        } finally {
            foundry.applications.api.DialogV2.wait = previous;
        }
    });

    it('recusa ficha ausente ou sem permissão', async () => {
        game.user.character = null;
        canvas.tokens.controlled = [];
        const previous = foundry.applications.api.DialogV2.wait;
        let opened = false;
        try {
            foundry.applications.api.DialogV2.wait = async () => {
                opened = true;
                return 3;
            };
            assert.equal(await openWindScarsDialog(), null);
            assert.equal(opened, false);
        } finally {
            foundry.applications.api.DialogV2.wait = previous;
        }
    });
});
