import assert from 'node:assert/strict';
import test from 'node:test';
import { setupFoundryMocks } from './fixtures/foundry-mock.mjs';

setupFoundryMocks();

const { readDiscordPool, distributePool, discordPoolCounter } =
    await import('../scripts/dialogs/attribute-dialogs.mjs');
const currentValues = { vit: 4, dex: 4, for: 4, car: 4, fdv: 4, int: 4, sab: 4 };

test('Discord trata a ação cancelar como cancelamento silencioso', async () => {
    let warnings = 0;
    ui.notifications.warn = () => {
        warnings += 1;
    };
    foundry.applications.api.DialogV2.wait = async () => 'cancel';
    assert.equal(await readDiscordPool(), null);
    assert.equal(warnings, 0);
});

test('Discord mostra contador dos sete resultados', async () => {
    let content = '';
    foundry.applications.api.DialogV2.wait = async (config) => {
        content = config.content;
        return 'cancel';
    };
    await readDiscordPool();
    assert.match(content, /data-na-discord-counter/);
    assert.match(content, /7 valores restantes/);
    assert.doesNotMatch(content, /oninput=/);
    assert.deepEqual(discordPoolCounter('4,4,4,4,4,4,4'), {
        count: 7,
        text: '7 de 7 pronto',
        color: '#3ddc84',
    });
    assert.equal(discordPoolCounter('4,4').text, '5 valores restantes');
    assert.equal(discordPoolCounter('1,2,3,4,1,2,3,4').text, '1 valor excedente');
});

test('distribuição trata cancelar sem tentar mapear uma string', async () => {
    foundry.applications.api.DialogV2.wait = async () => 'cancel';
    assert.equal(await distributePool([4, 3, 2, 2, 1, 1, 1], 1, currentValues), null);
});

test('distribuição usa selects nativos 1 a 4 e exibe resultados com estado de uso', async () => {
    let content = '';
    foundry.applications.api.DialogV2.wait = async (config) => {
        content = config.content;
        return 'cancel';
    };
    await distributePool([4, 3, 2, 2, 1, 1, 1], 1, currentValues);
    assert.match(content, /data-na-pool-chip/);
    assert.match(content, /data-na-pool-remaining/);
    assert.match(content, /data-na-pool-select/);
    assert.doesNotMatch(content, /onchange=/);
    for (const value of [1, 2, 3, 4])
        assert.match(content, new RegExp(`<option value="${value}">${value}<\\/option>`));
    assert.doesNotMatch(content, /resultado 1<\/option>/);
});

test('distribuição aceita exatamente o multiconjunto rolado', async () => {
    foundry.applications.api.DialogV2.wait = async () => ['4', '3', '2', '2', '1', '1', '1'];
    assert.deepEqual(await distributePool([4, 3, 2, 2, 1, 1, 1], 1, currentValues), {
        vit: 4,
        dex: 3,
        for: 2,
        car: 2,
        fdv: 1,
        int: 1,
        sab: 1,
    });
});
