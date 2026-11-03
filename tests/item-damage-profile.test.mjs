import assert from 'node:assert/strict';
import test, { describe } from 'node:test';

import {
    ITEM_DAMAGE_PROFILE_KEY,
    itemDamageProfileFromProps,
    itemDamageProfilePatch,
    normalizeItemDamageProfile,
    saveItemDamageProfile,
} from '../scripts/item-damage-profile.mjs';

const entry = { tipoAcao: 'ataque', dado: '2d6', fixo: 3, attrs: ['for'], tiposDano: ['fogo'] };

describe('item-damage-profile', () => {
    test('normaliza perfil e aceita JSON persistido', () => {
        const profile = normalizeItemDamageProfile(JSON.stringify({ version: 1, entries: [entry] }));
        assert.deepEqual(profile.entries[0], entry);
        assert.deepEqual(itemDamageProfileFromProps({ [ITEM_DAMAGE_PROFILE_KEY]: profile }), profile);
    });

    test('rejeita perfil vazio, fórmula insegura e excesso de entradas', () => {
        assert.equal(normalizeItemDamageProfile({ entries: [] }), null);
        assert.equal(normalizeItemDamageProfile({ entries: [{ ...entry, dado: '2d6;evil()' }] }), null);
        assert.equal(normalizeItemDamageProfile({ entries: Array.from({ length: 9 }, () => entry) }), null);
    });

    test('monta patch namespaced', () => {
        const patch = itemDamageProfilePatch({ entries: [entry] });
        assert.equal(typeof patch[`system.props.${ITEM_DAMAGE_PROFILE_KEY}`], 'string');
        assert.equal(JSON.parse(patch[`system.props.${ITEM_DAMAGE_PROFILE_KEY}`]).version, 1);
    });

    test('salva somente para owner ou GM', async () => {
        const previousGame = globalThis.game;
        globalThis.game = { user: { isGM: false } };
        try {
            const denied = await saveItemDamageProfile({ isOwner: false, async update() {} }, { entries: [entry] });
            assert.equal(denied.ok, false);

            let patch;
            const item = { isOwner: true, async update(next) { patch = next; } };
            const saved = await saveItemDamageProfile(item, { entries: [entry] });
            assert.equal(saved.ok, true);
            assert.equal(JSON.parse(patch[`system.props.${ITEM_DAMAGE_PROFILE_KEY}`]).entries.length, 1);
        } finally {
            globalThis.game = previousGame;
        }
    });
});
