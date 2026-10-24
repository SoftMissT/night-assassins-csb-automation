import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    auditWeaponCreation,
    findWeaponTwins,
    weaponCreationOrigin,
} from '../scripts/weapon-creation-audit.mjs';

/**
 * Nenhum código do módulo cria Item de arma. Quando uma cópia aparece "do nada", o que
 * identifica a causa é a origem registrada pelo próprio Foundry em `_stats`:
 * `duplicateSource` (botão Duplicar), `compendiumSource` (arrastar do compêndio) ou nada
 * (criação programática, importação ou outro módulo).
 */

function weapon(id, name, extra = {}) {
    return {
        id,
        uuid: `Actor.A.Item.${id}`,
        name,
        parent: { documentName: 'Actor', uuid: 'Actor.A', name: 'Caçador' },
        system: { props: { inventario_categoria: 'arma', arma_nome: name } },
        ...extra,
    };
}

describe('weaponCreationOrigin', () => {
    it('Duplicar tem prioridade sobre as demais origens', () => {
        const item = weapon('x', 'Katana', {
            _stats: { duplicateSource: 'Actor.A.Item.k1', compendiumSource: 'Compendium.m.p.Item.c' },
        });
        assert.deepEqual(weaponCreationOrigin(item), { kind: 'duplicar', source: 'Actor.A.Item.k1' });
    });

    it('compêndio quando só há compendiumSource', () => {
        const item = weapon('x', 'Katana', { _stats: { compendiumSource: 'Compendium.m.p.Item.c' } });
        assert.deepEqual(weaponCreationOrigin(item), {
            kind: 'compendio',
            source: 'Compendium.m.p.Item.c',
        });
    });

    it('sem nenhuma pista a origem é desconhecida', () => {
        assert.deepEqual(weaponCreationOrigin(weapon('x', 'Katana')), { kind: 'desconhecida', source: '' });
        assert.deepEqual(weaponCreationOrigin(weapon('x', 'Katana', { _stats: {} })), {
            kind: 'desconhecida',
            source: '',
        });
    });
});

describe('findWeaponTwins', () => {
    it('acha outra arma com o mesmo nome, ignorando caixa e a própria cópia', () => {
        const created = weapon('b', 'Katana');
        const items = [weapon('a', 'katana'), created, weapon('c', 'Revólver')];
        assert.deepEqual(
            findWeaponTwins(created, items).map((item) => item.id),
            ['a']
        );
    });

    it('item que não é arma não conta como gêmeo', () => {
        const created = weapon('b', 'Katana');
        const potion = { id: 'p', name: 'Katana', system: { props: { inventario_categoria: 'consumivel' } } };
        assert.deepEqual(findWeaponTwins(created, [potion, created]), []);
    });
});

describe('auditWeaponCreation', () => {
    const users = new Map([['u1', { id: 'u1', name: 'Mestre' }]]);

    it('cópia sem origem conhecida: loga com marcador e pede aviso', () => {
        const created = weapon('b', 'Katana');
        const result = auditWeaponCreation(created, { actorItems: [weapon('a', 'Katana'), created], userId: 'u1', users });
        assert.equal(result.twins.length, 1);
        assert.equal(result.origin.kind, 'desconhecida');
        assert.equal(result.notify, true);
        assert.match(result.logLine, /^\[NA-ARMA-DUP\] /u);
        const payload = JSON.parse(result.logLine.replace('[NA-ARMA-DUP] ', ''));
        assert.equal(payload.userName, 'Mestre');
        assert.equal(payload.actorUuid, 'Actor.A');
        assert.equal(payload.itemId, 'b');
        assert.deepEqual(payload.twinIds, ['a']);
        assert.equal(payload.origin, 'desconhecida');
        assert.match(result.message, /Katana/u);
    });

    it('cópia feita por Duplicar ou do compêndio é registrada, mas não gera aviso', () => {
        const base = [weapon('a', 'Katana')];
        const viaDuplicate = weapon('b', 'Katana', { _stats: { duplicateSource: 'Actor.A.Item.a' } });
        const viaCompendium = weapon('c', 'Katana', { _stats: { compendiumSource: 'Compendium.m.p.Item.c' } });
        const first = auditWeaponCreation(viaDuplicate, { actorItems: [...base, viaDuplicate], userId: 'u1', users });
        const second = auditWeaponCreation(viaCompendium, { actorItems: [...base, viaCompendium], userId: 'u1', users });
        assert.equal(first.notify, false);
        assert.equal(second.notify, false);
        assert.ok(first.logLine);
        assert.ok(second.logLine);
    });

    it('primeira cópia da arma não gera nada', () => {
        const created = weapon('a', 'Katana');
        assert.equal(auditWeaponCreation(created, { actorItems: [created], userId: 'u1', users }), null);
    });

    it('Item que não é arma ou que não está num Actor é ignorado', () => {
        const loose = { ...weapon('b', 'Katana'), parent: null };
        assert.equal(auditWeaponCreation(loose, { actorItems: [weapon('a', 'Katana'), loose], userId: 'u1', users }), null);
        const potion = { id: 'p', name: 'Katana', parent: { documentName: 'Actor' }, system: { props: {} } };
        assert.equal(auditWeaponCreation(potion, { actorItems: [potion, weapon('a', 'Katana')], userId: 'u1', users }), null);
    });

    it('usuário desconhecido não derruba a auditoria', () => {
        const created = weapon('b', 'Katana');
        const result = auditWeaponCreation(created, { actorItems: [weapon('a', 'Katana'), created], userId: 'nope', users });
        assert.equal(JSON.parse(result.logLine.replace('[NA-ARMA-DUP] ', '')).userName, 'desconhecido');
    });
});
