import assert from 'node:assert/strict';
import test, { describe } from 'node:test';

import {
    canonicalBreathing,
    isMigrated,
    normalizeForm,
    rawFormsFor,
    resolveForm,
    resolveLevel,
} from '../scripts/breathing-contract.mjs';

describe('breathing-contract — normalização', () => {
    test('CT-001: aceita os formatos atuais das seis publicadas', () => {
        const cases = [
            ['Chamas', 'chamas_02', { acao: 'especial', custo: 2, dano: '2d4' }],
            ['Pedra', 'pedra_02', { acao: 'ataque', custo: 3, dano: '3d10' }],
            ['Névoa', 'nevoa_02', { acao: 'ataque', custo: 3, dano: '5d6' }],
            ['Neve', 'neve_01', { acao: 'especial', custo: 1, dano: '2d4' }],
            ['Metal', 'metal_01', { acao: 'unica', custo: 2, dano: '' }],
            ['Vento', 'vento_02', { acao: 'ataque', custo: 0, dano: '' }],
            ['Água', 'agua_01', { acao: 'unica', custo: 1, dano: '1d6' }],
        ];
        for (const [respiracao, formaId, expected] of cases) {
            const form = resolveForm(respiracao, formaId);
            assert.ok(form, `${respiracao} ${formaId} deveria normalizar`);
            assert.equal(form.respiracao, respiracao);
            assert.equal(form.acao, expected.acao);
            assert.equal(form.niveis[0].custo, expected.custo);
            assert.equal(form.niveis[0].dano, expected.dano);
        }
    });

    test('mapeia feeds por Forma (calor no uso, calor no acerto)', () => {
        const shiranui = resolveForm('Chamas', 'chamas_02');
        assert.equal(shiranui.feedsUsar.weaponHeat, 2);
        assert.equal(shiranui.feedsAcerto.enemyHeat, 0);

        const nobori = resolveForm('Chamas', 'chamas_03');
        assert.equal(nobori.feedsUsar.weaponHeat, 3);
        assert.equal(nobori.feedsAcerto.enemyHeat, 2);
    });

    test('normaliza tipos de dano conhecidos e descarta desconhecidos', () => {
        const form = normalizeForm(
            {
                id: 'teste_01',
                action: 'ataque',
                levels: [{ cost: 1, damage: '1d6', damageTypes: ['Concussao', 'inventado'] }],
            },
            'Pedra'
        );
        assert.deepEqual(form.niveis[0].tiposDano, ['concussao']);
    });

    test('recusa Forma sem id, sem custo ou com fórmula insegura', () => {
        assert.equal(normalizeForm({ levels: [{ cost: 1 }] }, 'Chamas'), null);
        assert.equal(
            normalizeForm({ id: 'x', levels: [{ damage: '1d6' }] }, 'Chamas'),
            null,
            'nível com objeto mas sem custo'
        );
        assert.equal(
            normalizeForm({ id: 'x', levels: [{ cost: 1, damage: '2d6; malicioso()' }] }, 'Chamas'),
            null
        );
        assert.equal(
            normalizeForm({ id: 'x', levels: [{ cost: -1, damage: '1d6' }] }, 'Chamas'),
            null
        );
    });

    test('aceita dado canônico com feeds e primitivas declaradas', () => {
        const form = normalizeForm(
            {
                id: 'pedra_x',
                action: 'ataque',
                feedsAcerto: { enemyHeat: 1 },
                tags: ['rengoku'],
                levels: [
                    {
                        custo: 3,
                        dano: '3d10',
                        tiposDano: ['concussao'],
                        texto: 'Sangra.',
                        primitivas: [{ tipo: 'aplicaStatus', status: 'sangramento' }],
                    },
                ],
            },
            'Pedra'
        );
        assert.ok(form);
        assert.equal(form.feedsAcerto.enemyHeat, 1);
        assert.deepEqual(form.tags, ['rengoku']);
        assert.equal(form.niveis[0].primitivas.length, 1);
    });
});

describe('breathing-contract — resolução', () => {
    test('CT-002: resolveLevel recusa nível indisponível', () => {
        const rengoku = resolveForm('Chamas', 'chamas_09');
        assert.equal(resolveLevel(rengoku, 1).ok, false);
        assert.equal(resolveLevel(rengoku, 2).ok, true);
        assert.equal(resolveLevel(rengoku, 5).ok, false);
        assert.equal(resolveLevel(rengoku, 0).ok, false);
    });

    test('resolveForm aceita nome com acento, sem acento e romaji', () => {
        assert.ok(resolveForm('Névoa', 'nevoa_02'));
        assert.ok(resolveForm('nevoa', 'nevoa_02'));
        assert.ok(resolveForm('Mist', 'nevoa_02'));
        assert.equal(resolveForm('Pedra', 'nao_existe'), null);
        assert.equal(resolveForm('Inexistente', 'x'), null);
    });

    test('canonicalBreathing normaliza e isMigrated reflete a leva atual', () => {
        assert.equal(canonicalBreathing('Água'), 'Água');
        assert.equal(canonicalBreathing('agua'), 'Água');
        assert.equal(canonicalBreathing('flame'), 'Chamas');
        assert.equal(isMigrated('Pedra'), true, 'Pedra migra na leva 1 (passo 4)');
        assert.equal(isMigrated('Chamas'), false, 'as demais seguem na rota legada');
        assert.equal(rawFormsFor('Chamas').length > 0, true);
        assert.equal(rawFormsFor('Inexistente').length, 0);
    });
});