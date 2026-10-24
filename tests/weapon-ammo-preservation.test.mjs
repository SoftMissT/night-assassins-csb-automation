import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import { canonicalWeaponForItem, weaponRepairChanges } from '../scripts/weapon-migration.mjs';

/**
 * O reparo em lote ("Corrigir armas") e a reidratação rodam sobre Itens que já pertencem
 * a Caçadores. A munição gasta é estado do jogador: o reparo pode limitá-la à capacidade,
 * mas nunca recarregá-la. Antes desta correção, `arma_municao_atual` voltava ao valor do
 * catálogo (capacidade cheia) a cada execução (Arco Longo 2 → 12, Revólver 2 → 12).
 */

const catalog = JSON.parse(
    await readFile(new URL('../catalogs/slayer-weapons.json', import.meta.url), 'utf8')
);
const canonicalWeapons = catalog.documents.filter((entry) => entry?.type === 'equippableItem');

function ownedCopy(name, props = {}) {
    const canonical = canonicalWeapons.find((entry) => entry.name === name);
    assert.ok(canonical, `${name} deve existir no catálogo`);
    const item = structuredClone(canonical);
    item.id = 'item-do-cacador';
    item.ownership = { default: 2 };
    Object.assign(item.system.props, props);
    return item;
}

function repair(item) {
    return weaponRepairChanges(item, canonicalWeaponForItem(item, canonicalWeapons));
}

function applyChanges(item, changes) {
    const props = { ...item.system.props };
    for (const [path, value] of Object.entries(changes ?? {})) {
        if (path.startsWith('system.props.')) props[path.slice('system.props.'.length)] = value;
    }
    return { ...item, system: { ...item.system, props } };
}

describe('reparo de armas preserva a munição gasta', () => {
    for (const name of ['Arco Longo', 'Revólver']) {
        it(`${name}: munição gasta (2) não volta à capacidade cheia`, () => {
            const item = ownedCopy(name, { arma_municao_atual: 2 });
            const capacity = Number(item.system.props.arma_municao_capacidade);
            assert.ok(capacity > 2, 'o cenário precisa de capacidade maior que a munição atual');
            const changes = repair(item);
            const proposed = changes?.['system.props.arma_municao_atual'];
            assert.ok(
                proposed === undefined || proposed === 2,
                `o reparo propôs ${proposed} para a munição atual (jogador tem 2)`
            );
        });
    }

    it('munição zerada (0) continua zerada', () => {
        const changes = repair(ownedCopy('Revólver', { arma_municao_atual: 0 }));
        const proposed = changes?.['system.props.arma_municao_atual'];
        assert.ok(proposed === undefined || proposed === 0, `propôs ${proposed}`);
    });

    it('valor guardado como texto numérico é respeitado (CSB pode gravar string)', () => {
        const changes = repair(ownedCopy('Rifle', { arma_municao_atual: '3' }));
        const proposed = changes?.['system.props.arma_municao_atual'];
        assert.ok(proposed === undefined || Number(proposed) === 3, `propôs ${proposed}`);
    });

    it('munição acima da capacidade é limitada à capacidade', () => {
        const item = ownedCopy('Balestra', { arma_municao_atual: 99 });
        const capacity = Number(item.system.props.arma_municao_capacidade);
        assert.equal(repair(item)?.['system.props.arma_municao_atual'], capacity);
    });

    it('Item sem munição registrada recebe a capacidade cheia do catálogo', () => {
        const item = ownedCopy('Escopeta Cano Duplo');
        delete item.system.props.arma_municao_atual;
        const capacity = Number(item.system.props.arma_municao_capacidade);
        assert.equal(repair(item)?.['system.props.arma_municao_atual'], capacity);
    });

    it('arma sem munição (corpo a corpo) fica com 0 e não gera ruído', () => {
        const melee = canonicalWeapons.find(
            (entry) => !(Number(entry.system?.props?.arma_municao_capacidade) > 0)
        );
        const item = structuredClone(melee);
        item.id = 'item-melee';
        item.ownership = { default: 2 };
        const proposed = repair(item)?.['system.props.arma_municao_atual'];
        assert.ok(proposed === undefined || proposed === 0, `propôs ${proposed}`);
    });

    it('continua idempotente para arma de fogo: depois de aplicar, não há novo patch', () => {
        const item = ownedCopy('Revólver', { arma_municao_atual: 2 });
        const first = repair(item);
        const applied = applyChanges(item, first);
        assert.equal(Number(applied.system.props.arma_municao_atual), 2, 'a munição gasta sobrevive');
        assert.equal(repair(applied), null);
    });
});
