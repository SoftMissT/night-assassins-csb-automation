import { setupFoundryMocks } from './fixtures/foundry-mock.mjs';
setupFoundryMocks();

import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
    MESSAGE_MODES,
    buildEntryFormula,
    messageModeOptionsHtml,
    resolveAttributeRefs,
    resolveMessageMode,
} from '../scripts/damage-formula.mjs';

describe('damage-formula', () => {
    const attrs = { vit: 1, dex: 4, for: 3, car: 0, fdv: 2, int: 0, sab: -1 };

    it('troca @atributo pelo valor da ficha, sem mexer no resto da fórmula', () => {
        assert.equal(resolveAttributeRefs('2d6 + @for', attrs), '2d6 + 3');
        assert.equal(resolveAttributeRefs('1d8+@DEX*2', attrs), '1d8+4*2');
        assert.equal(resolveAttributeRefs('4d6kh3', attrs), '4d6kh3');
    });

    it('atributo negativo vira parêntese para não quebrar a soma', () => {
        assert.equal(resolveAttributeRefs('1d6 + @sab', attrs), '1d6 + (-1)');
    });

    it('referência desconhecida fica intacta para o Roll acusar o erro', () => {
        assert.equal(resolveAttributeRefs('1d6 + @xyz', attrs), '1d6 + @xyz');
    });

    it('monta a entrada com fórmula livre, fixo e atributos marcados', () => {
        assert.equal(buildEntryFormula('2d6+1d4', 2, ['for'], attrs), '2d6+1d4 + 2 + 3');
        assert.equal(buildEntryFormula('1d10 + @dex', 0, [], attrs), '1d10 + 4');
        assert.equal(buildEntryFormula('', 5, [], attrs), '5');
        assert.equal(buildEntryFormula('', 0, [], attrs), '0');
    });

    it('fixo negativo depois de fórmula com subtração mantém a conta', () => {
        assert.equal(buildEntryFormula('1d8 - 1', -2, [], attrs), '1d8 - 1 - 2');
    });

    it('aceita os modos v14 e converte os legados', () => {
        assert.deepEqual(
            MESSAGE_MODES.map((mode) => mode.key),
            ['public', 'gm', 'blind', 'self']
        );
        assert.equal(resolveMessageMode('gm'), 'gm');
        assert.equal(resolveMessageMode('blindroll'), 'blind');
        assert.equal(resolveMessageMode('selfroll'), 'self');
        assert.equal(resolveMessageMode('publicroll'), 'public');
    });

    it('os selects de visibilidade abrem no modo atual do chat', () => {
        const previous = game.settings;
        game.settings = { get: (ns, key) => (ns === 'core' && key === 'messageMode' ? 'gm' : undefined) };
        try {
            const html = messageModeOptionsHtml();
            assert.match(html, /<option value="gm" selected>/);
            assert.equal((html.match(/ selected/g) ?? []).length, 1);
        } finally {
            game.settings = previous;
        }
    });

    it('Acerto e testes usam o mesmo seletor, sem padrão público fixo', async () => {
        const { readFile } = await import('node:fs/promises');
        for (const file of ['hit-dialog.mjs', 'roll-dialog.mjs', 'damage-dialog.mjs']) {
            const source = await readFile(new URL(`../scripts/dialogs/${file}`, import.meta.url), 'utf8');
            assert.match(source, /messageModeOptionsHtml\(\)/, file);
            assert.doesNotMatch(source, /<option value="publicroll">/, file);
        }
    });

    it('modo ausente ou inválido cai no modo atual do chat', () => {
        const previous = game.settings;
        game.settings = { get: (ns, key) => (ns === 'core' && key === 'messageMode' ? 'gm' : undefined) };
        try {
            assert.equal(resolveMessageMode(''), 'gm');
            assert.equal(resolveMessageMode('qualquer'), 'gm');
            assert.equal(resolveMessageMode(undefined), 'gm');
        } finally {
            game.settings = previous;
        }
    });
});
