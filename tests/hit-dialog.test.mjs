import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { setupFoundryMocks } from './fixtures/foundry-mock.mjs';

setupFoundryMocks();

import { openHitConfirmationDialog } from '../scripts/dialogs/hit-dialog.mjs';

describe('hit confirmation dialog', () => {
    it('oferece continuar no último Acerto se confirmar o crítico abrir um soco extra', async () => {
        const previous = foundry.applications.api.DialogV2.wait;
        try {
            foundry.applications.api.DialogV2.wait = async (config) => {
                assert.match(config.content, /crítico libera um ataque extra/u);
                const hit = config.buttons.find(button => button.action === 'hit');
                const miss = config.buttons.find(button => button.action === 'miss');
                assert.deepEqual(miss.callback(null, { form: { elements: {} } }), { hit: false, continue: false });
                assert.deepEqual(hit.callback(null, { form: { elements: { 'na-hit-stop': { checked: true } } } }),
                    { hit: true, continue: false });
                return hit.callback(null, { form: { elements: {} } });
            };
            const result = await openHitConfirmationDialog({
                current: 1, maximum: 1, total: 24, natural: 20,
                critical: true, extendsOnCriticalHit: true,
            });
            assert.deepEqual(result, { hit: true, continue: true });
        } finally { foundry.applications.api.DialogV2.wait = previous; }
    });

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
