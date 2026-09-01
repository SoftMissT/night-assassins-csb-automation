import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { setupFoundryMocks } from './fixtures/foundry-mock.mjs';

setupFoundryMocks();

import { openHitConfirmationDialog } from '../scripts/dialogs/hit-dialog.mjs';

describe('hit confirmation dialog', () => {
    it('mostra arma, perfil, natural e crítico efetivo antes da confirmação', async () => {
        let config = null;
        foundry.applications.api.DialogV2.wait = async (received) => {
            config = received;
            return { hit: true, continue: false };
        };

        await openHitConfirmationDialog({
            current: 1,
            maximum: 1,
            total: 24,
            natural: 19,
            criticalThreshold: 19,
            critical: true,
            weaponName: 'Double Blade',
            profileName: 'Ryōtō',
        });

        assert.match(config.content, /Double Blade — Ryōtō/u);
        assert.match(config.content, /Natural:\s*<strong>19<\/strong>/u);
        assert.match(config.content, /Crítico da arma:\s*<strong>19\+<\/strong>/u);
        assert.match(config.content, /ACERTO CRÍTICO/u);
    });

    it('distingue natural 19 de uma arma cujo crítico é 20', async () => {
        let config = null;
        foundry.applications.api.DialogV2.wait = async (received) => {
            config = received;
            return { hit: true, continue: false };
        };

        await openHitConfirmationDialog({
            current: 1,
            maximum: 1,
            total: 25,
            natural: 19,
            criticalThreshold: 20,
            critical: false,
            weaponName: 'Katana',
            profileName: 'Morote',
        });

        assert.match(config.content, /Crítico da arma:\s*<strong>20\+<\/strong>/u);
        assert.match(config.content, /Acerto normal/u);
        assert.doesNotMatch(config.content, /ACERTO CRÍTICO/u);
    });
});
