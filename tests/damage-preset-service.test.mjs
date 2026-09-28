import assert from 'node:assert/strict';
import test, { describe } from 'node:test';

import {
    DAMAGE_PRESETS_KEY,
    MAX_DAMAGE_PRESETS,
    damagePresetsPatch,
    groupedPresets,
    normalizeDamagePreset,
    normalizePresetEntry,
    parseDamagePresets,
    presetGroupKey,
    presetGroupLabel,
    presetsForGroup,
    removeDamagePreset,
    upsertDamagePreset,
} from '../scripts/damage-preset-service.mjs';

const validEntry = () => ({
    tipoAcao: 'ataque',
    dado: '2d6',
    fixo: 3,
    attrs: ['for'],
    tiposDano: ['fogo'],
});

describe('damage-preset-service — normalização', () => {
    test('aceita um preset válido e normaliza atributos/tipos', () => {
        const preset = normalizeDamagePreset({
            name: 'Corte de Teste',
            group: 'Chamas',
            entries: [{ tipoAcao: 'ataque', dado: '2d6 + @for', fixo: 0, attrs: ['FOR'], tiposDano: ['Fogo'] }],
        });
        assert.ok(preset);
        assert.equal(preset.name, 'Corte de Teste');
        assert.equal(preset.group, 'chamas');
        assert.deepEqual(preset.entries[0].attrs, ['for']);
        assert.deepEqual(preset.entries[0].tiposDano, ['fogo']);
        assert.ok(preset.id);
    });

    test('rejeita preset sem nome, sem entradas ou com excesso de entradas', () => {
        assert.equal(normalizeDamagePreset({ name: '', entries: [validEntry()] }), null);
        assert.equal(normalizeDamagePreset({ name: 'Sem passos', entries: [] }), null);
        assert.equal(
            normalizeDamagePreset({
                name: 'Grande demais',
                entries: Array.from({ length: 9 }, validEntry),
            }),
            null
        );
    });

    test('rejeita entrada sem conteúdo ou com fórmula insegura', () => {
        assert.equal(normalizePresetEntry({ tipoAcao: 'ataque' }), null);
        assert.equal(normalizePresetEntry({ dado: '2d6; malicioso()', fixo: 0 }), null);
        assert.equal(normalizePresetEntry({ dado: '2d6', fixo: 0, tipoAcao: 'epica' }), null);
    });

    test('descarta atributos e tipos de dano desconhecidos sem quebrar', () => {
        const entry = normalizePresetEntry({
            dado: '2d6',
            fixo: 0,
            attrs: ['inexistente', 'for'],
            tiposDano: ['inventado', 'fogo'],
        });
        assert.ok(entry);
        assert.deepEqual(entry.attrs, ['for']);
        assert.deepEqual(entry.tiposDano, ['fogo']);
    });

    test('mantém grupo livre e mapeia rótulos conhecidos', () => {
        assert.equal(presetGroupKey('Chamas'), 'chamas');
        assert.equal(presetGroupKey('Água'), 'agua');
        assert.equal(presetGroupKey('Classes'), 'Classes');
        assert.equal(presetGroupKey(''), 'normal');
        assert.equal(presetGroupLabel('chamas'), 'Chamas');
        assert.equal(presetGroupLabel('Classes'), 'Classes');
    });
});

describe('damage-preset-service — persistência', () => {
    test('faz upsert, atualiza por id e respeita o limite', () => {
        const first = upsertDamagePreset([], { name: 'A', group: 'normal', entries: [validEntry()] });
        assert.equal(first.ok, true);
        assert.equal(first.presets.length, 1);
        const id = first.presets[0].id;

        const updated = upsertDamagePreset(first.presets, {
            id,
            name: 'A2',
            group: 'normal',
            entries: [validEntry()],
        });
        assert.equal(updated.ok, true);
        assert.equal(updated.presets.length, 1);
        assert.equal(updated.presets[0].name, 'A2');

        const full = Array.from({ length: MAX_DAMAGE_PRESETS }, (_unused, index) => ({
            name: `P${index}`,
            group: 'normal',
            entries: [validEntry()],
        }));
        const rejected = upsertDamagePreset(full, {
            name: 'Excedente',
            group: 'normal',
            entries: [validEntry()],
        });
        assert.equal(rejected.ok, false);
        assert.match(rejected.reason, /Limite/);
    });

    test('remove por id e ignora id inexistente', () => {
        const store = upsertDamagePreset([], {
            name: 'B',
            group: 'normal',
            entries: [validEntry()],
        });
        const id = store.presets[0].id;
        assert.equal(removeDamagePreset(store.presets, id).length, 0);
        assert.equal(removeDamagePreset(store.presets, 'nao-existe').length, 1);
    });

    test('lê string, objeto, array e valor inválido', () => {
        const preset = { id: 'x', name: 'X', group: 'normal', entries: [validEntry()] };
        assert.deepEqual(parseDamagePresets(JSON.stringify({ version: 1, presets: [preset] })).presets, [
            preset,
        ]);
        assert.deepEqual(parseDamagePresets({ presets: [preset] }).presets, [preset]);
        assert.deepEqual(parseDamagePresets([preset]).presets, [preset]);
        assert.deepEqual(parseDamagePresets('{quebrado').presets, []);
    });

    test('monta o patch do Actor na chave system.props', () => {
        const patch = damagePresetsPatch([]);
        assert.deepEqual(Object.keys(patch), [`system.props.${DAMAGE_PRESETS_KEY}`]);
        assert.equal(JSON.parse(patch[`system.props.${DAMAGE_PRESETS_KEY}`]).version, 1);
    });
});

describe('damage-preset-service — agrupamento', () => {
    test('ordena grupos conhecidos antes dos livres', () => {
        const presets = [
            { id: '1', name: 'Classes', group: 'Classes', entries: [validEntry()] },
            { id: '2', name: 'Chama', group: 'chamas', entries: [validEntry()] },
            { id: '3', name: 'Normal', group: 'normal', entries: [validEntry()] },
        ];
        assert.deepEqual(
            groupedPresets(presets).map((group) => group.key),
            ['normal', 'chamas', 'Classes']
        );
    });

    test('filtra por rótulo ou chave', () => {
        const presets = [
            { id: '1', name: 'A', group: 'agua', entries: [validEntry()] },
            { id: '2', name: 'B', group: 'normal', entries: [validEntry()] },
        ];
        assert.deepEqual(presetsForGroup(presets, 'Água').map((preset) => preset.id), ['1']);
        assert.deepEqual(presetsForGroup(presets, 'agua').map((preset) => preset.id), ['1']);
        assert.deepEqual(presetsForGroup(presets, 'normal').map((preset) => preset.id), ['2']);
    });
});
