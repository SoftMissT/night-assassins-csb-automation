import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
    calculateOniResources,
    missingOniPdvGains,
    normalizeOniLevel,
    oniKekkijutsuRank,
    oniLegendaryActions,
    oniRandomPdvRequirements,
    oniRank,
    oniRegenerationProfile,
    oniSpecializationRank,
    oniUnarmedProfile,
} from '../scripts/oni/progression-service.mjs';

describe('oni progression core', () => {
    it('mantém catálogo estruturado completo de 20 níveis', () => {
        const catalog = JSON.parse(
            fs.readFileSync(new URL('../catalogs/oni-progression.json', import.meta.url), 'utf8')
        );
        assert.equal(catalog.schemaVersion, 1);
        assert.equal(catalog.levels.length, 20);
        assert.deepEqual(
            catalog.levels.map((entry) => entry.level),
            Array.from({ length: 20 }, (_, index) => index + 1)
        );
        assert.equal(catalog.levels[19].features.includes('acao_mitica'), true);
    });

    it('normaliza nível e resolve todas as patentes canônicas', () => {
        assert.equal(normalizeOniLevel(0), 1);
        assert.deepEqual(oniRank(7), {
            level: 7,
            title: 'Candidato às Doze Kizuki',
            band: 'candidato',
        });
        assert.deepEqual(oniRank(13), {
            level: 13,
            title: 'Lua Inferior Um',
            band: 'lua_inferior',
        });
        assert.deepEqual(oniRank(20), { level: 20, title: 'Rei dos Onis', band: 'rei_oni' });
    });

    it('resolve ranks de Especialização e Kekkijutsu nos níveis corretos', () => {
        assert.equal(oniSpecializationRank(2), null);
        assert.equal(oniSpecializationRank(3), 'C');
        assert.equal(oniSpecializationRank(7), 'B');
        assert.equal(oniSpecializationRank(12), 'A');
        assert.equal(oniSpecializationRank(16), 'S');
        assert.equal(oniSpecializationRank(19), 'SS');
        assert.equal(oniKekkijutsuRank(3), 'inicial');
        assert.equal(oniKekkijutsuRank(5), 'C');
        assert.equal(oniKekkijutsuRank(9), 'B');
        assert.equal(oniKekkijutsuRank(12), 'A');
        assert.equal(oniKekkijutsuRank(15), 'S');
        assert.equal(oniKekkijutsuRank(18), 'SS');
    });

    it('escala ataques naturais marciais e de garra ou mordida', () => {
        assert.deepEqual(oniUnarmedProfile(1, 'martial'), {
            style: 'martial',
            attribute: 'FOR',
            formula: '2+FOR',
            supernatural: false,
        });
        assert.equal(oniUnarmedProfile(4, 'bite').formula, '1d6+DEX');
        assert.equal(oniUnarmedProfile(7, 'martial').formula, '2d6+FOR');
        assert.equal(oniUnarmedProfile(10, 'claw').formula, '2d8+DEX');
        assert.equal(oniUnarmedProfile(13, 'martial').formula, '3d8+FOR');
        assert.equal(oniUnarmedProfile(16, 'bite').formula, '4d10+DEX');
        assert.equal(oniUnarmedProfile(20, 'martial').formula, '6d10+FOR');
    });

    it('descreve regeneração ativa, automática e reanexação sem executar rolagens', () => {
        assert.deepEqual(oniRegenerationProfile(1), { available: false });
        assert.equal(oniRegenerationProfile(2).activeFormula, '1d4+VIT');
        assert.equal(oniRegenerationProfile(5).activeFormula, '1d6+VIT');
        assert.deepEqual(oniRegenerationProfile(9).allowedActions, ['unique', 'special']);
        assert.equal(oniRegenerationProfile(9).reattachAvailable, true);
        assert.equal(oniRegenerationProfile(13).automaticStartTurnFormula, 'VIT');
        assert.equal(oniRegenerationProfile(17).limbsRegrowNextTurn, true);
    });

    it('exige resultados persistidos para cada ganho aleatório alcançado', () => {
        const state = oniRandomPdvRequirements(5, { pdv_oni_ganho_nvl2: 3, pdv_oni_ganho_nvl3: 4 });
        assert.equal(state.total, 7);
        assert.equal(state.complete, false);
        assert.deepEqual(
            state.missing.map((entry) => entry.level),
            [4, 5]
        );
    });

    it('lista ganhos aleatórios pendentes para rolagem automática', () => {
        assert.deepEqual(
            missingOniPdvGains(5, { pdv_oni_ganho_nvl2: 3, pdv_oni_ganho_nvl3: 4 }).map(
                (entry) => entry.level
            ),
            [4, 5]
        );
        assert.deepEqual(
            missingOniPdvGains(5, { 2: 3, 3: 4 }).map((entry) => entry.level),
            [4, 5]
        );
        assert.deepEqual(
            missingOniPdvGains(12, {}).map((entry) => entry.level),
            Array.from({ length: 11 }, (_, index) => index + 2)
        );
        assert.equal(
            missingOniPdvGains(4, {
                pdv_oni_ganho_nvl2: 2,
                pdv_oni_ganho_nvl3: 3,
                pdv_oni_ganho_nvl4: 4,
            }).length,
            0
        );
    });

    it('calcula PDV e PDK máximos sem rerrolar parcelas aleatórias', () => {
        const persistedPdvGains = Object.fromEntries(
            Array.from({ length: 11 }, (_, index) => [`pdv_oni_ganho_nvl${index + 2}`, 4])
        );
        const level12 = calculateOniResources({
            level: 12,
            originPdv: 20,
            originPdk: 10,
            vitality: 4,
            persistedPdvGains,
        });
        assert.equal(level12.pdvMaximum, 64);
        assert.equal(level12.pdkMaximum, 104);
        assert.equal(level12.randomPdvComplete, true);

        const level20 = calculateOniResources({
            level: 20,
            originPdv: 20,
            originPdk: 10,
            vitality: 4,
            persistedPdvGains,
        });
        assert.equal(level20.pdvMaximum, 64 + 3 * 34 + 4 * 44 + 70);
        assert.equal(level20.pdkMaximum, 264);
    });

    it('escala ações lendárias somente nos patamares de chefe', () => {
        assert.equal(oniLegendaryActions(12), 0);
        assert.equal(oniLegendaryActions(13), 1);
        assert.equal(oniLegendaryActions(17), 2);
        assert.equal(oniLegendaryActions(19), 3);
    });
});
