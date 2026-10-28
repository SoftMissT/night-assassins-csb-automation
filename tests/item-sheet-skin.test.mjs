import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { BREATHING_ACCENTS, itemSheetClasses, itemSheetKind, tagItemSheet } from '../scripts/item-sheet-skin.mjs';

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

    it('marca o form da ficha, nunca o primeiro input (HTMLFormElement expõe [0])', () => {
        const Original = globalThis.HTMLElement;
        class FakeElement {
            constructor() {
                this.classes = new Set();
                this.classList = { add: (...names) => names.forEach((name) => this.classes.add(name)) };
            }
        }
        globalThis.HTMLElement = FakeElement;
        try {
            const form = new FakeElement();
            form[0] = new FakeElement();
            tagItemSheet({ item: item({ arma_nome: 'Katana' }), element: form }, form);
            assert.deepEqual([...form.classes], ['na-sheet', 'na-item', 'na-item--arma']);
            assert.deepEqual([...form[0].classes], []);
        } finally {
            globalThis.HTMLElement = Original;
        }
    });

    it('cada cor de Respiração existe no CSS, e o CSS cobre os 4 tipos', async () => {
        const css = await readFile(new URL('../styles/na-csb-automation.css', import.meta.url), 'utf8');
        for (const slug of Object.keys(BREATHING_ACCENTS))
            assert.match(css, new RegExp(`\\.na-item--resp-${slug}\\s*\\{[^}]*--na-item-accent`), slug);
        for (const kind of ['arma', 'especial', 'forma', 'kekki'])
            assert.match(css, new RegExp(`\\.na-item--${kind}\\b`), kind);
    });

    it('a pele do item anula a caixa-alta que a ficha de ator força em título, aba e botão', async () => {
        const css = await readFile(new URL('../styles/na-csb-automation.css', import.meta.url), 'utf8');
        const block = css.slice(css.indexOf('ITENS —'));
        assert.match(
            block,
            /\.na-item \.custom-system-panel-title,[^{]*\.na-item \.na-sheet-text[^{]*\{[^}]*text-transform:\s*none/u
        );
    });

    it('título recolhível é mirado pelo DOM real do CSB (details > summary dentro do painel pai)', async () => {
        const css = await readFile(new URL('../styles/na-csb-automation.css', import.meta.url), 'utf8');
        const block = css.slice(css.indexOf('ITENS —'));
        // `.custom-system-panel > summary` nunca casa: o summary fica dentro de <details>.
        assert.doesNotMatch(block, /\.custom-system-panel > summary/u);
        assert.match(block, /\.na-item summary > :is\(span, h3\)/u);
    });

    it('Forma: Efeito preso na 5ª coluna para o nível desligado não desalinhar a tabela', async () => {
        const css = await readFile(new URL('../styles/na-csb-automation.css', import.meta.url), 'utf8');
        assert.match(css, /\.nvl1_efeito, \.nvl2_efeito, \.nvl3_efeito, \.nvl4_efeito\)\s*\{\s*grid-column: 5;/u);
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
        // A faixa de combate escreve o valor na cor do item: arma, especial e Kekkijutsu também passam.
        const itemAccents = { arma: '#d8b45d', especial: '#00d9ff', especial2: '#ff2b4a', kekki: '#ff2b4a' };
        for (const [slug, hex] of Object.entries({ ...BREATHING_ACCENTS, ...itemAccents }))
            assert.ok(ratio(hex, '#121018') >= 4.5, `${slug} ${hex}: ${ratio(hex, '#121018').toFixed(2)}`);
    });
});
