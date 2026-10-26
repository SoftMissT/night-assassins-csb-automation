import assert from 'node:assert/strict';
import test from 'node:test';

import { deleteDamagePreset } from '../scripts/dialogs/damage-preset-manager.mjs';

const presets = [
    { id: 'manter', name: 'Manter', entries: [{ dado: '1d6' }] },
    { id: 'excluir', name: 'Excluir', entries: [{ dado: '2d6' }] },
];

function actorWith({ isOwner = true, update } = {}) {
    return {
        isOwner,
        system: { props: { dano_presets: JSON.stringify({ version: 2, presets }) } },
        update: update ?? (async () => {}),
    };
}

test('deleteDamagePreset remove somente o id atual e preserva flags de update', async () => {
    globalThis.game = { user: { isGM: false } };
    let update;
    const result = await deleteDamagePreset(
        actorWith({
            update: async (...args) => {
                update = args;
            },
        }),
        'excluir'
    );
    assert.equal(result.ok, true);
    assert.equal(result.preset.name, 'Excluir');
    assert.deepEqual(result.presets.map(({ id }) => id), ['manter']);
    assert.deepEqual(JSON.parse(update[0]['system.props.dano_presets']).presets, [presets[0]]);
    assert.deepEqual(update[1], { naCsbAutomation: true, naDamagePresets: true });
});

test('deleteDamagePreset recusa não proprietário e id obsoleto sem gravar', async () => {
    globalThis.game = { user: { isGM: false } };
    let writes = 0;
    const update = async () => {
        writes += 1;
    };
    assert.equal((await deleteDamagePreset(actorWith({ isOwner: false, update }), 'excluir')).ok, false);
    assert.equal((await deleteDamagePreset(actorWith({ update }), 'inexistente')).ok, false);
    assert.equal(writes, 0);
});

test('deleteDamagePreset permite GM que não é dono e recusa ator ausente', async () => {
    globalThis.game = { user: { isGM: true } };
    let writes = 0;
    const result = await deleteDamagePreset(
        actorWith({
            isOwner: false,
            update: async () => {
                writes += 1;
            },
        }),
        'excluir'
    );
    assert.equal(result.ok, true);
    assert.equal(writes, 1);
    globalThis.game = { user: { isGM: false } };
    assert.equal((await deleteDamagePreset(null, 'excluir')).ok, false);
});

test('deleteDamagePreset fecha em erro sem declarar a exclusão concluída', async () => {
    globalThis.game = { user: { isGM: false } };
    const result = await deleteDamagePreset(
        actorWith({ update: async () => Promise.reject(new Error('falha simulada')) }),
        'excluir'
    );
    assert.deepEqual(result, { ok: false, reason: 'Não foi possível excluir o preset.' });
});
