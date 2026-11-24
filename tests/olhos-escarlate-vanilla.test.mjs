import assert from 'node:assert/strict';
import test from 'node:test';
import { setupFoundryMocks } from './fixtures/foundry-mock.mjs';
import { resolveSlayerDerivedBonuses } from '../scripts/derived-bonus-service.mjs';
import { SETTINGS } from '../scripts/settings.mjs';

function configure(respiracao) {
    setupFoundryMocks();
    game.user.isGM = true;
    const selection = { respiracao, olhos_escarlate: true };
    game.settings = { get: (_module, key) => key === SETTINGS.rulesSelection ? JSON.stringify(selection) : undefined };
}

function pdrSources(level) {
    const props = { resp_slayer_display: 'resp_slayer_raposa', nvl_respiracao_num: level };
    return resolveSlayerDerivedBonuses(props).channels.pdrMaximo.sources
        .filter(source => source.label === 'Olhos Escarlate').length;
}

test('Vanilla: Olhos Escarlate dá +1 PDR máximo só no Nível 1 de Respiração (livro p. 65)', () => {
    configure('vanilla');
    assert.equal(pdrSources(1), 1);
    for (const level of [2, 3, 4]) assert.equal(pdrSources(level), 0, `nível ${level}`);
});

test('Homebrew: o +1 de PDR máximo do Olhos Escarlate continua em todos os níveis', () => {
    configure('homebrew');
    for (const level of [1, 2, 3, 4]) assert.equal(pdrSources(level), 1, `nível ${level}`);
});
