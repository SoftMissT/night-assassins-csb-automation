import { setupFoundryMocks } from './fixtures/foundry-mock.mjs';
setupFoundryMocks();

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    diagnosticJournalOwnership,
    isNightAssassinsDiagnostic,
} from '../scripts/diagnostic-journal.mjs';

describe('diagnostic-journal', () => {
    it('aceita somente mensagens atribuíveis ao módulo', () => {
        assert.equal(isNightAssassinsDiagnostic('[NA-ONI-PDV] ROLL FAILED'), true);
        assert.equal(
            isNightAssassinsDiagnostic(
                'modules/night-assassins-csb-automation/scripts/main.mjs:10'
            ),
            true
        );
        assert.equal(
            isNightAssassinsDiagnostic(
                'Compendium.night-assassins-csb-automation.night-assassins-macros'
            ),
            true
        );
        assert.equal(isNightAssassinsDiagnostic('Foundry VTT | Connected to server socket'), false);
        assert.equal(isNightAssassinsDiagnostic('libWrapper: another-module failed'), false);
        assert.equal(
            isNightAssassinsDiagnostic({
                scope: {
                    uuid: 'Compendium.night-assassins-csb-automation.night-assassins-armas',
                },
            }),
            false,
            'objetos estruturados do CSB não são serializados nem atribuídos ao módulo'
        );
    });

    it('mantém o Journal invisível por padrão e OWNER somente para GMs', () => {
        globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { NONE: 0, OWNER: 3 } };
        globalThis.game = {
            users: [
                { id: 'gm-a', isGM: true },
                { id: 'gm-b', isGM: true },
                { id: 'player', isGM: false },
            ],
        };
        assert.deepEqual(diagnosticJournalOwnership(), { default: 0, 'gm-a': 3, 'gm-b': 3 });
    });
});
