import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const macroSource = fs.readFileSync(
    path.join(repoRoot, 'macros', 'na-gerenciar-descanso.js'),
    'utf8'
);
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

test('macro de Descanso usa o Actor da ficha e não devolve objeto ao CSB', async () => {
    let received = null;
    const game = {
        modules: new Map([
            [
                'night-assassins-csb-automation',
                {
                    api: {
                        openRestManager: async (args) => {
                            received = args;
                        },
                    },
                },
            ],
        ]),
    };
    const ui = { notifications: { error: () => {} } };
    const execute = new AsyncFunction('game', 'ui', 'scope', macroSource);
    const result = await execute(game, ui, { actorUuid: 'Actor.slayer' });
    assert.equal(result, '');
    assert.deepEqual(received, { actorUuid: 'Actor.slayer' });
});
