import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    resolveClassRank,
    classStateKey,
    mbDamageBonus,
    mbShouldApplyPermanentPdv,
    mbPermanentPdvPatch,
    mbParryAvailable,
    mbParryConsume,
    mbParryReduction,
    poisonApply,
    poisonTick,
    cortaCuraMultiplier,
    kakushiAmpararHeal,
    kakushiAmpararAvailable,
    kakushiAmpararConsume,
    kakushiTatakaaeeeRoll,
    resetClassTurnState,
    resetClassRoundState,
    classEventContext,
} from '../scripts/slayer/class-runtime.mjs';

describe('class-runtime - rank resolution', () => {
    it('nivel 1-3 sem rank', () => {
        assert.equal(resolveClassRank('classe_mb', 1), null);
        assert.equal(resolveClassRank('classe_mb', 3), null);
    });

    it('nivel 4-5 rank C', () => {
        assert.equal(resolveClassRank('classe_mb', 4), 'C');
        assert.equal(resolveClassRank('classe_mb', 5), 'C');
    });

    it('nivel 11 rank S', () => {
        assert.equal(resolveClassRank('classe_mb', 11), 'S');
    });

    it('nivel 12+ rank SS', () => {
        assert.equal(resolveClassRank('classe_mb', 12), 'SS');
        assert.equal(resolveClassRank('classe_mb', 14), 'SS');
    });
});

describe('class-runtime - Mestre de Batalha', () => {
    it('rank C da +2 de dano em ataque basico', () => {
        assert.equal(mbDamageBonus('C'), 2);
    });

    it('rank B da +4 de dano (substitui C)', () => {
        assert.equal(mbDamageBonus('B'), 4);
    });

    it('rank A/S/SS nao da bonus de Dilacerador', () => {
        assert.equal(mbDamageBonus('A'), 0);
        assert.equal(mbDamageBonus('S'), 0);
    });

    it('ganho permanente de 2d6 PDV so aplica uma vez (idempotente)', () => {
        const props = { nvl_num: 11, classe_escolhida: 'classe_mb' };
        assert.equal(mbShouldApplyPermanentPdv(props), true);
        const appliedProps = {
            nvl_num: 11,
            classe_escolhida: 'classe_mb',
            slayer_class_mb_corpo_guerra_applied: 12,
        };
        assert.equal(mbShouldApplyPermanentPdv(appliedProps), false);
    });

    it('mbPermanentPdvPatch soma ao ja aplicado', () => {
        const patch = mbPermanentPdvPatch(7, 5);
        assert.equal(patch['system.props.pdv_slayer_extra'], 12);
        assert.equal(patch['system.props.slayer_class_mb_corpo_guerra_applied'], 12);
    });

    it('parry disponivel no inicio da rodada', () => {
        assert.equal(mbParryAvailable({}), true);
        assert.equal(mbParryAvailable({ slayer_class_mb_parry_used_round: 1 }), false);
    });

    it('parry consume marca uso', () => {
        const patch = mbParryConsume();
        assert.equal(patch['system.props.slayer_class_mb_parry_used_round'], 1);
    });

    it('parry reduction usa atributo de defesa', () => {
        assert.equal(mbParryReduction('S', 5), 5);
        assert.equal(mbParryReduction('SS', 7), 7);
        assert.equal(mbParryReduction('C', 5), 0);
    });
});

describe('class-runtime - Usuario de Veneno', () => {
    it('rank C aplica veneno CAR dano por 2 rodadas', () => {
        const patch = poisonApply({}, 4, 'C');
        assert.equal(patch['system.props.slayer_veneno_dano'], 4);
        assert.equal(patch['system.props.slayer_veneno_rodadas'], 2);
        assert.equal(patch['system.props.slayer_veneno_stacks'], 1);
    });

    it('rank B aplica veneno CAR+2 por 3 rodadas', () => {
        const patch = poisonApply({}, 4, 'B');
        assert.equal(patch['system.props.slayer_veneno_dano'], 6);
        assert.equal(patch['system.props.slayer_veneno_rodadas'], 3);
    });

    it('rank S permite ate 3 stacks', () => {
        const p1 = poisonApply({}, 4, 'S');
        const p2 = poisonApply({ slayer_veneno_stacks: 1 }, 4, 'S');
        const p3 = poisonApply({ slayer_veneno_stacks: 2 }, 4, 'S');
        assert.equal(p1['system.props.slayer_veneno_stacks'], 1);
        assert.equal(p2['system.props.slayer_veneno_stacks'], 2);
        assert.equal(p3['system.props.slayer_veneno_stacks'], 3);
    });

    it('poisonTick causa dano por stack e decrementa rodadas', () => {
        const result = poisonTick({
            slayer_veneno_stacks: 2,
            slayer_veneno_dano: 4,
            slayer_veneno_rodadas: 3,
        });
        assert.equal(result.damage, 8);
        assert.equal(result.patch['system.props.slayer_veneno_rodadas'], 2);
    });

    it('poisonTick expira quando rodadas chegam a 0', () => {
        const result = poisonTick({
            slayer_veneno_stacks: 1,
            slayer_veneno_dano: 4,
            slayer_veneno_rodadas: 1,
        });
        assert.equal(result.damage, 4);
        assert.equal(result.patch['system.props.slayer_veneno_rodadas'], 0);
        assert.equal(result.patch['system.props.slayer_veneno_stacks'], 0);
    });

    it('cortaCuraMultiplier reduz cura em 50% quando envenenado', () => {
        assert.equal(cortaCuraMultiplier({ slayer_veneno_stacks: 1 }), 0.5);
        assert.equal(cortaCuraMultiplier({ slayer_veneno_stacks: 3 }), 0.5);
        assert.equal(cortaCuraMultiplier({}), 1);
    });
});

describe('class-runtime - Kakushi', () => {
    it('rank C cura INT ou SAB', () => {
        assert.equal(kakushiAmpararHeal('C', 5), 5);
    });

    it('rank B cura 3 + INT ou SAB', () => {
        assert.equal(kakushiAmpararHeal('B', 5), 8);
    });

    it('amparar disponivel no inicio da rodada', () => {
        assert.equal(kakushiAmpararAvailable({}), true);
        assert.equal(
            kakushiAmpararAvailable({ slayer_class_kakushi_amparar_used_round: 1 }),
            false
        );
    });

    it('tatakaaeee calcula bonus por CAR', () => {
        const result = kakushiTatakaaeeeRoll(5);
        assert.equal(result.threshold, 15);
        assert.equal(result.bonus, 10);
    });
});

describe('class-runtime - estado e resets', () => {
    it('classStateKey gera chave namespaced', () => {
        assert.equal(
            classStateKey('classe_mb', 'parry_used_round'),
            'slayer_class_mb_parry_used_round'
        );
        assert.equal(
            classStateKey('classe_kakushi', 'amparar_used_round'),
            'slayer_class_kakushi_amparar_used_round'
        );
    });

    it('resetClassTurnState zera chaves de turno', () => {
        const props = { slayer_class_mb_parry_used_turn: 1, slayer_class_mb_parry_used_round: 1 };
        const patch = resetClassTurnState('classe_mb', props);
        assert.equal(patch['system.props.slayer_class_mb_parry_used_turn'], 0);
        assert.ok(!('system.props.slayer_class_mb_parry_used_round' in patch));
    });

    it('resetClassRoundState zera chaves de rodada', () => {
        const props = { slayer_class_mb_parry_used_turn: 1, slayer_class_mb_parry_used_round: 1 };
        const patch = resetClassRoundState('classe_mb', props);
        assert.equal(patch['system.props.slayer_class_mb_parry_used_round'], 0);
        assert.ok(!('system.props.slayer_class_mb_parry_used_turn' in patch));
    });
});

describe('class-runtime - event dispatcher', () => {
    it('basic-hit e aplicavel para rank C e B', () => {
        const ctx = classEventContext({ classKey: 'classe_mb', level: 4, event: 'basic-hit' });
        assert.equal(ctx.rank, 'C');
        assert.equal(ctx.applicable, true);
    });

    it('basic-critical e aplicavel para rank A', () => {
        const ctx = classEventContext({ classKey: 'classe_mb', level: 8, event: 'basic-critical' });
        assert.equal(ctx.rank, 'A');
        assert.equal(ctx.applicable, true);
    });

    it('physical-melee-damage e aplicavel para rank S', () => {
        const ctx = classEventContext({
            classKey: 'classe_mb',
            level: 11,
            event: 'physical-melee-damage',
        });
        assert.equal(ctx.rank, 'S');
        assert.equal(ctx.applicable, true);
    });

    it('evento nao aplicavel retorna false', () => {
        const ctx = classEventContext({ classKey: 'classe_mb', level: 1, event: 'basic-hit' });
        assert.equal(ctx.applicable, false);
    });
});
