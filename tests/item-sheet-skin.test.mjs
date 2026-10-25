import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { BREATHING_ACCENTS, itemSheetClasses, itemSheetKind } from '../scripts/item-sheet-skin.mjs';

const item = (props = {}, extra = {}) => ({ type: 'equippableItem', system: { props, ...extra } });

describe('pele das fichas de item', () => {
    it('reconhece os 4 tipos pelos dados, não só pelo id do template (o CSB remapeia no mundo)', () => {
        assert.equal(itemSheetKind(item({ arma_nome: 'Katana', arma_dano_fixo: 5 })), 'arma');
        assert.equal(itemSheetKind(item({ arma_nome: 'Rebellion', arma_categoria: 'especial' })), 'especial');
        assert.equal(
            itemSheetKind(item({ inventario_categoria: 'respiracao', respiracao_nome: 'Chamas', forma_id: 'chamas_01' })),
            'forma'
        );
        assert.equal(itemSheetKind(item({ kekki_nome: 'Fio de Sangue' })), 'kekki');
        assert.equal(itemSheetKind(item({ inventario_categoria: 'item' })), null);
    });

    it('reconhece os próprios templates pelo id estático', () => {
        const tpl = (_id) => ({ id: _id, type: '_equippableItemTemplate', system: { props: {} } });
        assert.equal(itemSheetKind(tpl('NAWeaponTpl00001')), 'arma');
        assert.equal(itemSheetKind(tpl('NASpecialWeaponTpl00001')), 'especial');
        assert.equal(itemSheetKind(tpl('NABreathTpl00001')), 'forma');
        assert.equal(itemSheetKind(tpl('NAKekkijutsuTpl001')), 'kekki');
    });

    it('a Forma leva a cor da sua Respiração; nome com acento e caixa variam', () => {
        const classes = itemSheetClasses(
            item({ inventario_categoria: 'respiracao', respiracao_nome: 'Névoa', forma_id: 'nevoa_1' })
        );
        assert.deepEqual(classes, ['na-sheet', 'na-item', 'na-item--forma', 'na-item--resp-nevoa']);
    });

    it('Respiração sem cor própria fica só com o acento padrão da Forma', () => {
        const classes = itemSheetClasses(
            item({ inventario_categoria: 'respiracao', respiracao_nome: 'Sol', forma_id: 'sol_1' })
        );
        assert.deepEqual(classes, ['na-sheet', 'na-item', 'na-item--forma']);
    });

    it('item que não é do sistema não recebe classe nenhuma', () => {
        assert.deepEqual(itemSheetClasses(item({ inventario_categoria: 'consumivel' })), []);
        assert.deepEqual(itemSheetClasses(null), []);
    });

    it('cada cor de Respiração existe no CSS, e o CSS cobre os 4 tipos', async () => {
        const css = await readFile(new URL('../styles/na-csb-automation.css', import.meta.url), 'utf8');
        for (const slug of Object.keys(BREATHING_ACCENTS))
            assert.match(css, new RegExp(`\\.na-item--resp-${slug}\\s*\\{[^}]*--na-item-accent`), slug);
        for (const kind of ['arma', 'especial', 'forma', 'kekki'])
            assert.match(css, new RegExp(`\\.na-item--${kind}\\b`), kind);
    });

    it('acento de cada Respiração passa AA (4,5:1) sobre o fundo da ficha', () => {
        const luminance = (hex) => {
            const [r, g, b] = hex.match(/\w\w/g).map((c) => {
                const v = parseInt(c, 16) / 255;
                return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
            });
            return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };
        const ratio = (a, b) => {
            const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
            return (hi + 0.05) / (lo + 0.05);
        };
        for (const [slug, hex] of Object.entries(BREATHING_ACCENTS))
            assert.ok(ratio(hex, '#121018') >= 4.5, `${slug} ${hex}: ${ratio(hex, '#121018').toFixed(2)}`);
    });
});
