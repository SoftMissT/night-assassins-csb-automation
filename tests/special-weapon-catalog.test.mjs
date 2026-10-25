import { setupFoundryMocks } from './fixtures/foundry-mock.mjs';
setupFoundryMocks();

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { hydrateSpecialWeaponItem } from '../scripts/special-weapon-service.mjs';

function worldItem(name, props = {}) {
    const updates = [];
    return {
        updates,
        name,
        system: { props: { arma_nome: name, ...props } },
        async update(patch) {
            updates.push(patch);
        },
    };
}

describe('dados canônicos das armas especiais (fora do Compêndio)', () => {
    it('hidrata arma do mundo pelo catálogo interno, sem consultar packs', async () => {
        const previousPacks = game.packs;
        game.packs = {
            get: () => {
                throw new Error('não deve ler o Compêndio');
            },
            [Symbol.iterator]: function* () {},
        };
        try {
            const item = worldItem('Rebellion');
            const result = await hydrateSpecialWeaponItem(item);
            assert.equal(result.ok, true);
            assert.equal(result.canonical.name, 'Rebellion');
            assert.match(result.patch['system.props.dupla_alma_vinculo_json'], /Isis/u);
            assert.equal(item.updates.length, 1);
        } finally {
            game.packs = previousPacks;
        }
    });

    it('não sobrescreve o que a arma do mundo já tem', async () => {
        const item = worldItem('Rebellion', { dupla_alma_vinculo_json: '{"entidade":"Própria"}' });
        const result = await hydrateSpecialWeaponItem(item);
        assert.equal(result.ok, true);
        assert.equal('system.props.dupla_alma_vinculo_json' in result.patch, false);
    });

    it('arma fora do catálogo com dados próprios da Dupla Alma segue funcionando', async () => {
        const item = worldItem('Arma da mesa', {
            dupla_alma_vinculo_json: '{"entidade":"Ana","demonio":"Kuro"}',
        });
        const result = await hydrateSpecialWeaponItem(item);
        assert.equal(result.ok, true);
        assert.deepEqual(result.patch, {});
        assert.equal(item.updates.length, 0);
        // Cerimônia e Despertar leem `canonical.system.props`: precisa ser a arma, não vazio.
        assert.equal(result.canonical, item);
        assert.match(result.canonical.system.props.dupla_alma_vinculo_json, /Kuro/u);
    });

    it('arma fora do catálogo e sem dados falha com motivo claro', async () => {
        const result = await hydrateSpecialWeaponItem(worldItem('Arma vazia'));
        assert.equal(result.ok, false);
        assert.match(result.reason, /dados da Dupla Alma/u);
    });
});
