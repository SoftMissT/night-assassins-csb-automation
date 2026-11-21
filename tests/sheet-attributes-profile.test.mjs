import assert from 'node:assert/strict';
import test from 'node:test';
import { fillMissingSheetAttributes, resolveSheetAttribute } from '../scripts/sheet-attributes.mjs';

test('NPC em vanilla não soma Tsuyoi nem Marca do Destino no atributo exibido', () => {
    const previous = globalThis.game;
    try {
        globalThis.game = { settings: { get: () => 'vanilla' } };
        const tsuyoi = { npc_vit_base: 4, hab_escolhida: 'hab_escolhida_tsuyoi' };
        assert.equal(resolveSheetAttribute({ system: { props: tsuyoi } }, 'VIT'), 4);
        const marca = { npc_vit_base: 4, hab_escolhida: 'hab_escolhida_marca_destino',
            hab_marca_destino_atributo: 'vit', hab_marca_destino_bonus: 3 };
        assert.equal(resolveSheetAttribute({ system: { props: marca } }, 'VIT'), 4);
    } finally { globalThis.game = previous; }
});

test('NPC em homebrew mantém Tsuyoi e Marca do Destino', () => {
    const previous = globalThis.game;
    try {
        globalThis.game = { settings: { get: () => 'homebrew' } };
        const tsuyoi = { npc_vit_base: 4, hab_escolhida: 'hab_escolhida_tsuyoi' };
        assert.equal(resolveSheetAttribute({ system: { props: tsuyoi } }, 'VIT'), 5);
        const marca = { npc_vit_base: 4, hab_escolhida: 'hab_escolhida_marca_destino',
            hab_marca_destino_atributo: 'vit', hab_marca_destino_bonus: 3 };
        assert.equal(resolveSheetAttribute({ system: { props: marca } }, 'VIT'), 7);
    } finally { globalThis.game = previous; }
});

test('fillMissingSheetAttributes substitui texto quebrado do CSB (NaN/undefined/ERROR)', () => {
    for (const broken of ['NaN', 'undefined', 'ERROR']) {
        const element = { textContent: broken };
        const root = {
            querySelectorAll: selector => selector === '.na-sheet-stat.na-sheet-role-for' ? [element] : [],
        };
        fillMissingSheetAttributes(root, { system: { props: { npc_for_base: 6 } } });
        assert.equal(element.textContent, '6');
    }
});
