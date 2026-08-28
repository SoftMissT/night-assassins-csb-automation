import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const macroSource = fs.readFileSync(
    path.join(repoRoot, 'macros', 'na-gerenciar-resistencias.js'),
    'utf8'
);
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

test('macro de Resistências recebe o scope do CSB e não devolve objeto para a fórmula', async () => {
    let received;
    const game = {
        modules: new Map([
            [
                'night-assassins-csb-automation',
                {
                    api: {
                        openResistanceManager: async (options) => {
                            received = options;
                            return { keys: ['cortante'], summary: 'Cortante' };
                        },
                    },
                },
            ],
        ]),
    };
    const ui = { notifications: { error: assert.fail } };
    const execute = new AsyncFunction('game', 'ui', 'scope', macroSource);

    const result = await execute(game, ui, { actorUuid: 'Actor.Teste', kind: 'slayer' });

    assert.deepEqual(received, { actorUuid: 'Actor.Teste', kind: 'slayer' });
    assert.equal(result, '');
});
