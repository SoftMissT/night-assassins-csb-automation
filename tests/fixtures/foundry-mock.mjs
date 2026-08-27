/**
 * @fileoverview Mocks mínimos do ambiente Foundry para testes.
 */

export function setupFoundryMocks() {
    globalThis.foundry = {
        applications: {
            api: {
                DialogV2: {
                    wait: async () => null,
                },
            },
        },
    };

    globalThis.Roll = {
        create: (formula) => ({
            evaluate: async () => ({
                total: 10,
                toMessage: async () => {},
                dice: [{ results: [{ result: 1, active: true }] }],
            }),
            dice: [{ results: [{ result: 1, active: true }] }],
        }),
    };

    globalThis.ChatMessage = {
        getSpeaker: ({ actor } = {}) => ({ actor: actor?.id, alias: actor?.name }),
    };

    globalThis.ui = {
        notifications: {
            warn: () => {},
            error: () => {},
            info: () => {},
        },
    };

    globalThis.canvas = {
        ready: true,
        tokens: {
            controlled: [],
        },
    };

    globalThis.game = {
        user: {
            id: 'user_001',
            character: null,
            targets: new Set(),
        },
    };

    globalThis.fromUuid = async (uuid) => {
        return null;
    };
}

export function resetFoundryMocks() {
    delete globalThis.foundry;
    delete globalThis.Roll;
    delete globalThis.ChatMessage;
    delete globalThis.ui;
    delete globalThis.canvas;
    delete globalThis.game;
    delete globalThis.fromUuid;
}
