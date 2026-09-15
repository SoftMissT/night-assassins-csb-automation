import { setupFoundryMocks } from './fixtures/foundry-mock.mjs';
setupFoundryMocks();

import assert from 'node:assert/strict';
import test from 'node:test';
import { breathingItemsForActor } from '../scripts/breath-service.mjs';

test('macro própria de Chamas lista somente suas Formas em ordem', () => {
    const actor = {
        items: [
            { id: 'water', system: { props: { respiracao_nome: 'Água', forma_id: 'agua_01', forma_ordem: 1 } } },
            { id: 'flame-2', system: { props: { respiracao_nome: 'Chamas', forma_id: 'chamas_02', forma_ordem: 2 } } },
            { id: 'flame-1', system: { props: { respiracao_nome: 'Chamas', forma_id: 'chamas_01', forma_ordem: 1 } } },
            { id: 'invalid', system: { props: { respiracao_nome: 'Chamas' } } },
        ],
    };

    assert.deepEqual(
        breathingItemsForActor(actor, 'Chamas').map(({ id }) => id),
        ['flame-1', 'flame-2']
    );
});
