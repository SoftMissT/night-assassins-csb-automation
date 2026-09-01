import { setupFoundryMocks } from './fixtures/foundry-mock.mjs';
setupFoundryMocks();

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
    buildDiagnosticExport,
    diagnosticJournalOwnership,
    isNightAssassinsDiagnostic,
} from '../scripts/diagnostic-journal.mjs';

describe('diagnostic-journal', () => {
    it('não depende de foundry.utils.deepEqual, ausente no Foundry v14', () => {
        const source = fs.readFileSync('scripts/diagnostic-journal.mjs', 'utf8');
        assert.doesNotMatch(source, /foundry\.utils\.deepEqual/u);
        assert.match(source, /foundry\.utils\?\.saveDataToFile\s*\?\?\s*globalThis\.saveDataToFile/u);
    });

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

    it('exporta todas as páginas do Journal em Markdown', () => {
        const journal = {
            name: 'NA Registro de Erros',
            pages: {
                contents: [
                    { id: 'a', name: '2026-08-30 Sessão', text: { markdown: '# Erro A\nDetalhes' } },
                    { id: 'b', name: '2026-08-31 Sessão', text: { content: '# Erro B\nStack' } },
                ],
            },
        };
        const result = buildDiagnosticExport(journal, {
            format: 'markdown',
            generatedAt: '2026-08-31T12:00:00.000Z',
        });
        assert.match(result, /2026-08-30 Sessão/);
        assert.match(result, /# Erro A/);
        assert.match(result, /2026-08-31 Sessão/);
        assert.match(result, /# Erro B/);
    });

    it('exporta JSON estruturado sem perder páginas', () => {
        const journal = {
            name: 'NA Registro de Erros',
            pages: [{ id: 'a', name: 'Sessão', text: { markdown: 'conteúdo' } }],
        };
        const result = JSON.parse(
            buildDiagnosticExport(journal, {
                format: 'json',
                generatedAt: '2026-08-31T12:00:00.000Z',
            })
        );
        assert.equal(result.schema, 'night-assassins-diagnostic-v1');
        assert.equal(result.pages.length, 1);
        assert.equal(result.pages[0].markdown, 'conteúdo');
    });
});
