import assert from 'node:assert/strict';
import test, { describe } from 'node:test';

import { itemHudMarkup } from '../scripts/item-sheet-hud.mjs';

const weapon = (props = {}) => ({
    uuid: 'Actor.a.Item.i',
    isOwner: true,
    type: 'equippableItem',
    system: { template: 'NAWeaponTpl00001', props: { arma_nome: 'Katana', ...props } },
});

describe('HUD de Item', () => {
    test('arma recebe ações rápidas de ataque, dano e salvar', () => {
        const html = itemHudMarkup(weapon());
        assert.match(html, /data-na-item-toolbar/);
        assert.match(html, /data-na-item-action="roll"/);
        assert.match(html, /data-na-item-action="damage"/);
        assert.match(html, /data-na-item-action="save"/);
    });

    test('arma com munição recebe recarga e Item sem dono bloqueia salvar', () => {
        const html = itemHudMarkup(weapon({ arma_municao_capacidade: 6 }));
        assert.match(html, /data-na-item-action="reload"/);
        const locked = itemHudMarkup({ ...weapon(), isOwner: false });
        assert.match(locked, /data-na-item-action="save" disabled/);
    });

    test('Item genérico não ganha HUD de arma', () => {
        assert.equal(itemHudMarkup({ type: 'equippableItem', system: { props: {} } }), '');
    });

    test('arma especial mantém ações de rolagem, mas não grava perfil normal', () => {
        const html = itemHudMarkup({
            ...weapon(),
            system: { template: 'NASpecialWeaponTpl00001', props: { arma_nome: 'Rebellion', arma_categoria: 'especial' } },
        });
        assert.match(html, /data-na-item-action="roll"/);
        assert.doesNotMatch(html, /data-na-item-action="save"/);
    });
});
