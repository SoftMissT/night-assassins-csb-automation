import { setupFoundryMocks } from './fixtures/foundry-mock.mjs';
setupFoundryMocks();

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CANONICAL_MACRO_PACK_ID, syncCanonicalMacros } from '../scripts/macro-sync.mjs';

describe('macro-sync', () => {
    it('sincroniza Controle GM, Criar Arma, Criar Forma, Criar Item e Arma Especial como privados', async () => {
        const created = [];
        const updated = [];
        const docs = [
            {
                name: 'Night Assassins Rolagem de Dano',
                uuid: 'Compendium.na.damage',
                toObject: () => ({ name: 'Night Assassins Rolagem de Dano', command: 'damage' }),
            },
            {
                name: 'Night Assassins Controle GM',
                uuid: 'Compendium.na.gm',
                toObject: () => ({ name: 'Night Assassins Controle GM', command: 'gm' }),
            },
            {
                name: 'Night Assassins Criar Arma',
                uuid: 'Compendium.na.criar-arma',
                toObject: () => ({ name: 'Night Assassins Criar Arma', command: 'criar' }),
            },
            {
                name: 'Night Assassins Criar Forma de Respiração',
                uuid: 'Compendium.na.criar-forma',
                toObject: () => ({ name: 'Night Assassins Criar Forma de Respiração', command: 'forma' }),
            },
            {
                name: 'Night Assassins Criar Item',
                uuid: 'Compendium.na.criar-item',
                toObject: () => ({ name: 'Night Assassins Criar Item', command: 'item' }),
            },
            {
                name: 'Night Assassins Criar Arma Especial',
                uuid: 'Compendium.na.criar-arma-especial',
                toObject: () => ({ name: 'Night Assassins Criar Arma Especial', command: 'especial' }),
            },
        ];

        globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { NONE: 0, OBSERVER: 2 } };
        globalThis.Folder = { create: async (data) => ({ ...data, id: 'folder-na' }) };
        globalThis.Macro = {
            createDocuments: async (data) => created.push(...data),
            updateDocuments: async (data) => updated.push(...data),
        };
        game.user.isGM = true;
        game.folders = { find: () => null };
        game.macros = {
            contents: [
                {
                    id: 'world-damage',
                    name: 'Night Assassins — Rolagem de Dano',
                    folder: 'folder-old',
                    flags: {
                        'night-assassins-csb-automation': { sourceId: 'Compendium.na.damage' },
                    },
                },
            ],
        };
        game.packs = new Map([[CANONICAL_MACRO_PACK_ID, { getDocuments: async () => docs }]]);

        const result = await syncCanonicalMacros();

        assert.deepEqual(result, { created: 5, updated: 0, skipped: 1, folderId: 'folder-na' });
        assert.equal(created.length, 5);
        assert.equal(created[0].name, 'Night Assassins Controle GM');
        assert.equal(created[0].folder, 'folder-na');
        assert.deepEqual(created[0].ownership, { default: 0 });
        assert.equal(created[1].name, 'Night Assassins Criar Arma');
        assert.deepEqual(created[1].ownership, { default: 0 });
        assert.equal(created[2].name, 'Night Assassins Criar Forma de Respiração');
        assert.equal(created[2].folder, 'folder-na');
        assert.deepEqual(created[2].ownership, { default: 0 });
        assert.equal(created[3].name, 'Night Assassins Criar Item');
        assert.equal(created[3].folder, 'folder-na');
        assert.deepEqual(created[3].ownership, { default: 0 });
        assert.equal(created[4].name, 'Night Assassins Criar Arma Especial');
        assert.equal(created[4].folder, 'folder-na');
        assert.deepEqual(created[4].ownership, { default: 0 });
        assert.equal(updated.length, 0);
    });

    it('não cria macros quando o usuário não é GM', async () => {
        game.user.isGM = false;
        assert.deepEqual(await syncCanonicalMacros(), { created: 0, updated: 0, skipped: 0 });
    });

    it('atualiza o launcher GM pelo ID canônico mesmo quando perdeu as flags', async () => {
        const updated = [];
        const document = {
            id: 'NAGMControl00001',
            name: 'Night Assassins Controle GM',
            uuid: 'Compendium.na.gm',
            toObject: () => ({
                name: 'Night Assassins Controle GM',
                type: 'script',
                scope: 'global',
                command: 'openGmDashboard()',
            }),
        };
        globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { NONE: 0, OBSERVER: 2 } };
        globalThis.Macro = {
            createDocuments: async () => assert.fail('não deve criar uma Macro duplicada'),
            updateDocuments: async (data) => updated.push(...data),
        };
        game.user.isGM = true;
        game.folders = { find: () => ({ id: 'folder-na' }) };
        game.macros = {
            contents: [{ id: 'NAGMControl00001', name: 'Macro antiga', folder: 'folder-na', flags: {} }],
        };
        game.packs = new Map([[CANONICAL_MACRO_PACK_ID, { getDocuments: async () => [document] }]]);

        const result = await syncCanonicalMacros();

        assert.equal(result.updated, 1);
        assert.equal(result.created, 0);
        assert.equal(updated[0]._id, 'NAGMControl00001');
        assert.equal(updated[0].command, 'openGmDashboard()');
        assert.deepEqual(updated[0].ownership, { default: 0 });
    });

    it('não sobrescreve uma Macro do usuário apenas porque o nome coincide', async () => {
        const created = [];
        const document = {
            id: 'NAGMControl00001',
            name: 'Night Assassins Controle GM',
            uuid: 'Compendium.na.gm',
            toObject: () => ({ name: 'Night Assassins Controle GM', command: 'oficial' }),
        };
        globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { NONE: 0, OBSERVER: 2 } };
        globalThis.Macro = {
            createDocuments: async (data) => created.push(...data),
            updateDocuments: async () => assert.fail('não deve sobrescrever Macro do usuário'),
        };
        game.user.isGM = true;
        game.folders = { find: () => ({ id: 'folder-na' }) };
        game.macros = {
            contents: [
                {
                    id: 'macro-usuario',
                    name: 'Night Assassins Controle GM',
                    flags: {},
                },
            ],
        };
        game.packs = new Map([[CANONICAL_MACRO_PACK_ID, { getDocuments: async () => [document] }]]);

        const result = await syncCanonicalMacros();

        assert.equal(result.created, 1);
        assert.equal(result.updated, 0);
        assert.equal(created[0].command, 'oficial');
    });
});
