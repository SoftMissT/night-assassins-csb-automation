import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    parseBlockingFlags,
    registerBlockingDamage,
    tickBlockingFlags,
    canActiveRegenerate,
    rollActiveRegeneration,
    buildActiveRegenerationPatch,
    canAutomaticRegenerate,
    automaticRegenerationAmount,
    buildAutomaticRegenerationPatch,
    bitePdkRecovery,
    spendPdkForAccuracy,
    resetTurnRegeneration,
} from '../scripts/oni/regeneration-service.mjs';

describe('oni regeneration-service - bloqueadores', () => {
    it('parseBlockingFlags detecta solar, glicinia, nichirin e reg_suprimida', () => {
        const { blockedBy } = parseBlockingFlags({
            oni_status_solar: true,
            oni_status_glicinia: true,
        });
        assert.ok(blockedBy.includes('solar'));
        assert.ok(blockedBy.includes('glicinia'));
        assert.ok(!blockedBy.includes('nichirin'));
    });

    it('parseBlockingFlags detecta solar via oni_solar_block_turns > 0', () => {
        const { blockedBy } = parseBlockingFlags({ oni_solar_block_turns: 2 });
        assert.ok(blockedBy.includes('solar'));
    });

    it('parseBlockingFlags vazio quando sem bloqueadores', () => {
        const { blockedBy } = parseBlockingFlags({});
        assert.equal(blockedBy.length, 0);
    });

    it('registerBlockingDamage registra solar com 2 turnos de bloqueio', () => {
        const patch = registerBlockingDamage({}, 'solar');
        assert.equal(patch['system.props.oni_solar_block_turns'], 2);
        assert.equal(patch['system.props.oni_status_solar'], true);
    });

    it('registerBlockingDamage ignora tipos nao bloqueadores', () => {
        const patch = registerBlockingDamage({}, 'cortante');
        assert.deepEqual(patch, {});
    });

    it('tickBlockingFlags decrementa solar e remove quando chega a 0', () => {
        assert.equal(
            tickBlockingFlags({ oni_solar_block_turns: 2 })['system.props.oni_solar_block_turns'],
            1
        );
        const final = tickBlockingFlags({ oni_solar_block_turns: 1 });
        assert.equal(final['system.props.oni_solar_block_turns'], 0);
        assert.equal(final['system.props.oni_status_solar'], false);
    });

    it('tickBlockingFlags retorna null quando nao ha solar ativo', () => {
        assert.equal(tickBlockingFlags({ oni_solar_block_turns: 0 }), null);
        assert.equal(tickBlockingFlags({}), null);
    });
});

describe('oni regeneration-service - regeneracao ativa', () => {
    it('N1 nao pode regenerar ativamente', () => {
        const result = canActiveRegenerate(1, {});
        assert.equal(result.ok, false);
    });

    it('N2 pode regenerar com Acao Especial disponivel', () => {
        const result = canActiveRegenerate(2, {}, { turn: { especial: 0 } });
        assert.equal(result.ok, true);
        assert.equal(result.action, 'especial');
    });

    it('N2 nao pode regenerar se Acao Especial ja foi usada', () => {
        const result = canActiveRegenerate(2, {}, { turn: { especial: 1 } });
        assert.equal(result.ok, false);
    });

    it('N9 pode usar Acao Especial ou Unica', () => {
        const withUnique = canActiveRegenerate(
            9,
            {},
            { turn: { especial: 1 }, round: { unica: 0 } }
        );
        assert.equal(withUnique.ok, true);
        assert.equal(withUnique.action, 'unica');
    });

    it('regeneracao bloqueada por solar', () => {
        const result = canActiveRegenerate(5, { oni_status_solar: true });
        assert.equal(result.ok, false);
        assert.match(result.reason, /solar/);
    });

    it('regeneracao bloqueada se ja usada no turno', () => {
        const result = canActiveRegenerate(5, { oni_regeneracao_usada_turno: true });
        assert.equal(result.ok, false);
        assert.match(result.reason, /já usada/);
    });

    it('rollActiveRegeneration gera formula com VIT substituido', () => {
        const { formula } = rollActiveRegeneration(oniRegenerationProfileN2(), 5);
        assert.match(formula, /5/);
    });

    it('buildActiveRegenerationPatch soma cura acumulada', () => {
        const patch = buildActiveRegenerationPatch(10, 5);
        assert.equal(patch['system.props.pdv_oni_curado'], 15);
        assert.equal(patch['system.props.oni_regeneracao_usada_turno'], true);
    });

    it('resetTurnRegeneration limpa flag de uso', () => {
        const patch = resetTurnRegeneration();
        assert.equal(patch['system.props.oni_regeneracao_usada_turno'], false);
    });
});

describe('oni regeneration-service - regeneracao automatica', () => {
    it('N12 nao tem regeneracao automatica', () => {
        assert.equal(canAutomaticRegenerate(12).ok, false);
        assert.equal(automaticRegenerationAmount(12, 5), 0);
    });

    it('N13 tem regeneracao automatica de VIT', () => {
        assert.equal(canAutomaticRegenerate(13).ok, true);
        assert.equal(automaticRegenerationAmount(13, 5), 5);
    });

    it('N20 tem regeneracao automatica de VIT', () => {
        assert.equal(automaticRegenerationAmount(20, 7), 7);
    });

    it('regeneracao automatica bloqueada por glicinia', () => {
        const result = canAutomaticRegenerate(15, { oni_status_glicinia: true });
        assert.equal(result.ok, false);
    });

    it('buildAutomaticRegenerationPatch soma cura acumulada', () => {
        const patch = buildAutomaticRegenerationPatch(13, 5, 3);
        assert.equal(patch['system.props.pdv_oni_curado'], 8);
    });
});

describe('oni regeneration-service - mordida e PDK ofensivo', () => {
    it('bitePdkRecovery soma 1 ao pdk_oni_recuperado acumulado', () => {
        const patch = bitePdkRecovery(5, 3);
        assert.equal(patch['system.props.pdk_oni_recuperado'], 4);
    });

    it('spendPdkForAccuracy gasta 1 PDK e da +1 bonus', () => {
        const result = spendPdkForAccuracy(2, 1);
        assert.equal(result.ok, true);
        assert.equal(result.bonus, 1);
        assert.equal(result.patch['system.props.pdk_oni_gasto_valor'], 3);
    });

    it('spendPdkForAccuracy gasta 2 PDK e da +2 bonus', () => {
        const result = spendPdkForAccuracy(2, 2);
        assert.equal(result.ok, true);
        assert.equal(result.bonus, 2);
    });

    it('spendPdkForAccuracy recusa mais de 2', () => {
        const result = spendPdkForAccuracy(5, 3);
        assert.equal(result.bonus, 2);
    });

    it('spendPdkForAccuracy recusa 0', () => {
        const result = spendPdkForAccuracy(5, 0);
        assert.equal(result.ok, false);
        assert.equal(result.bonus, 0);
    });
});

function oniRegenerationProfileN2() {
    return { available: true, activeFormula: '1d4+VIT', allowedActions: ['special'] };
}
