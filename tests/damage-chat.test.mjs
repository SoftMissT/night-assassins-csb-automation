import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildDamageFlavor, damageTypeLabel, splitAmongTargets } from '../scripts/damage-service.mjs';

describe('chat de dano', () => {
    it('dá uma cor por tipo de dano, com fallback para tipo desconhecido', () => {
        assert.match(damageTypeLabel('fogo'), /color:#ff7a2f/);
        assert.match(damageTypeLabel('fogo'), /fogo/i);
        assert.match(damageTypeLabel('cortante'), /color:#ff5b6e/);
        assert.match(damageTypeLabel('concussao'), /color:#d9d24a/);
        assert.match(damageTypeLabel('desconhecido'), /color:#d9c7a3/);
    });

    it('critério crítico sobrepõe o resultado com banner grande', () => {
        const flavor = buildDamageFlavor({
            nome: 'Tigre Ardente',
            critical: true,
            pdrGasto: 3,
            reasons: [],
            components: [{ label: 'Tigre Ardente', types: ['fogo'], subtotal: 22 }],
            finalDamage: 22,
        });
        assert.match(flavor, /⚔ CRÍTICO ⚔/);
        assert.match(flavor, /font-size:22px/);
        assert.match(flavor, /font-size:18px/);
        assert.match(flavor, /color:#ff7a2f/);
        assert.match(flavor, /Total: 22/);
    });

    it('divide o dano igualmente entre alvos e dá a sobra aos primeiros', () => {
        assert.deepEqual([0, 1, 2].map((i) => splitAmongTargets(10, 3, i)), [4, 3, 3]);
        assert.deepEqual([0, 1].map((i) => splitAmongTargets(7, 2, i)), [4, 3]);
        assert.equal(splitAmongTargets(20, 1, 0), 20);
        assert.equal(splitAmongTargets(-5, 2, 0), 0);
    });

    it('mostra a divisão por tipo de dano com a cor de cada tipo', () => {
        const flavor = buildDamageFlavor({
            nome: 'Golpe misto', critical: false, pdrGasto: 0, reasons: [],
            components: [{ label: 'Golpe misto', types: ['cortante', 'fogo'], subtotal: 9 }],
            finalDamage: 9,
        });
        assert.match(flavor, /color:#ff5b6e[^>]*>Cortante<\/span>: <strong>5<\/strong>/);
        assert.match(flavor, /color:#ff7a2f[^>]*>Fogo<\/span>: <strong>4<\/strong>/);
    });

    it('agrupa o chat por respiração com a cor da respiração', () => {
        const flavor = buildDamageFlavor({
            nome: 'Tigre Ardente', breathing: 'Chamas', critical: false, pdrGasto: 3, reasons: [],
            components: [{ label: 'Tigre Ardente', types: ['fogo'], subtotal: 22 }], finalDamage: 22,
        });
        assert.match(flavor, /color:#ff7a2f[^>]*>Chamas<\/div>/);
        assert.match(flavor, /<strong>Tigre Ardente<\/strong>/);
    });

    it('sem crítico mantém o resultado discreto', () => {
        const flavor = buildDamageFlavor({
            nome: 'Ataque', critical: false, pdrGasto: 0, reasons: [],
            components: [{ label: 'Ataque', types: ['cortante'], subtotal: 8 }], finalDamage: 8,
        });
        assert.doesNotMatch(flavor, /CRÍTICO/);
        assert.doesNotMatch(flavor, /font-size:22px/);
        assert.match(flavor, /color:#ff5b6e/);
    });
});
