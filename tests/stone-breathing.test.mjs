import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { STONE_FORMS, stoneFormById } from '../scripts/stone-breathing-data.mjs';
import {
    buildStoneBreathingPlan,
    buildStoneMarkReactivation,
    clearStoneBreathingState,
    consumeStoneCounterAttack,
    consumeStonePending,
    parseStoneBreathingState,
    tickStoneBreathing,
    stoneReflectionPenalty,
} from '../scripts/stone-breathing-service.mjs';

describe('Respiração da Pedra', () => {
    it('publica as cinco Formas oficiais com ações corretas', () => {
        assert.equal(STONE_FORMS.length, 5);
        assert.equal(stoneFormById('pedra_01').action, 'unica');
        assert.equal(stoneFormById('pedra_03').action, 'reacao');
        assert.deepEqual(stoneFormById('pedra_04').actions, ['ataque', 'especial']);
        assert.equal(stoneFormById('pedra_02').name, 'Tenmen Kudaki / Hyōmen Kurasshu / Kyoseki');
        assert.equal(stoneFormById('pedra_05').name, 'Kaifuku-ryoku');
    });

    it('Serpentino escala Ferida e calcula CD pelo dano originário', () => {
        assert.deepEqual(
            STONE_FORMS[0].levels.map((entry) => entry.damage),
            ['1d4', '1d6', '2d4', '2d4 + @for']
        );
        const plan = buildStoneBreathingPlan(
            'pedra_01',
            4,
            { for_display: 5 },
            { originDamage: 27 }
        );
        assert.equal(plan.cost, 3);
        assert.equal(plan.state.serpentine.saveDc, 17);
        assert.equal(plan.state.serpentine.noHitRoll, true);
        assert.deepEqual(plan.state.serpentine.damageComponents, [
            { formula: '2d4', types: ['ferida'] },
            { formula: '@for', types: ['concussao'] },
        ]);
    });

    it('Quebra Superior escala dano e Sangramento por dois turnos', () => {
        const plans = [1, 2, 3, 4].map((level) => buildStoneBreathingPlan('pedra_02', level, {}));
        assert.deepEqual(
            plans.map((plan) => plan.selected.damage),
            ['3d10', '3d10', '4d10', '5d10']
        );
        assert.deepEqual(
            plans.map((plan) => plan.state.bleeding.amount),
            [4, 5, 6, 7]
        );
        assert.ok(plans.every((plan) => plan.state.bleeding.turns === 2));
    });

    it('Reflexão escolhe FOR no corpo a corpo e DEX à distância', () => {
        const melee = buildStoneBreathingPlan(
            'pedra_03',
            3,
            { for_display: 5, dex_display: 2 },
            { weaponRange: 'corpo' }
        );
        const ranged = buildStoneBreathingPlan(
            'pedra_03',
            4,
            { for_display: 5, dex_display: 2 },
            { weaponRange: 'distancia', protectedUuid: 'Actor.ally' }
        );
        assert.equal(melee.state.reflection.attackPenalty, 7);
        assert.equal(melee.state.reflection.blockTurns, 2);
        assert.equal(ranged.state.reflection.attackPenalty, 4);
        assert.equal(ranged.state.reflection.counterAttack, true);
        assert.equal(ranged.state.reflection.allyTarget, 'Actor.ally');
        assert.equal(stoneReflectionPenalty(ranged.state), -4);
        const consumed = consumeStoneCounterAttack(ranged.state);
        assert.equal(consumed.available, true);
        assert.equal(consumed.state.reflection.counterAttack, false);
    });

    it('Reflexão preserva a duração de Bloqueio até completar dois turnos', () => {
        const plan = buildStoneBreathingPlan(
            'pedra_03',
            4,
            { for_display: 5 },
            { weaponRange: 'corpo' }
        );
        assert.equal(tickStoneBreathing(plan.state).state.reflection.blockTurns, 1);
        assert.equal(
            tickStoneBreathing(tickStoneBreathing(plan.state).state).state.reflection,
            undefined
        );
    });

    it('Riólito só existe nos níveis 3 e 4 e cria dois danos', () => {
        assert.equal(buildStoneBreathingPlan('pedra_04', 2, {}).ok, false);
        const plan = buildStoneBreathingPlan('pedra_04', 4, {});
        assert.deepEqual(plan.actions, ['ataque', 'especial']);
        assert.equal(plan.state.pendingDamage.formula, '8d6');
        assert.equal(plan.state.pendingDamage.uses, 2);
        assert.equal(consumeStonePending(plan.state, { damage: true }).pendingDamage.uses, 1);
    });

    it('Resiliência dura três turnos e só pode ser usada uma vez no combate', () => {
        const plan = buildStoneBreathingPlan('pedra_05', 1, {});
        assert.equal(plan.state.resilience.multiplier, 0.5);
        assert.deepEqual(plan.state.resilience.resistances, [
            'concussao',
            'cortante',
            'perfurante',
        ]);
        assert.equal(
            buildStoneBreathingPlan('pedra_05', 1, {
                resp_pedra_estado: JSON.stringify(plan.state),
            }).ok,
            false
        );
        const tick = tickStoneBreathing(plan.state);
        assert.equal(tick.state.resilience.turns, 2);
        const cleared = clearStoneBreathingState(tick.state)['system.props.resp_pedra_estado'];
        assert.equal(parseStoneBreathingState(cleared).resilienceUsed, undefined);
    });

    it('reativação pela Marca dura até o final do combate e cobra exatamente 5 PDR', () => {
        const previous = { resilienceUsed: true, bleeding: { amount: 4, turns: 2 } };
        const plan = buildStoneMarkReactivation({
            resp_pedra_estado: JSON.stringify(previous),
            pdr_slayer_total_conta: 12,
            pdr_slayer_gasto_valor: 3,
        });
        assert.equal(plan.eligible, true);
        assert.equal(plan.ok, true);
        assert.equal(plan.state.resilience.untilCombatEnd, true);
        assert.equal(plan.state.resilience.turns, null);
        assert.deepEqual(plan.state.bleeding, previous.bleeding);
        assert.equal(plan.patch['system.props.pdr_slayer_gasto_valor'], 8);
        assert.equal(
            Object.keys(plan.patch).some((key) => key.includes('acao')),
            false
        );
    });

    it('reativação pela Marca exige uso prévio e não repete efeito já estendido', () => {
        const neverUsed = buildStoneMarkReactivation({ resp_pedra_estado: JSON.stringify({}) });
        const alreadyExtended = buildStoneMarkReactivation({
            resp_pedra_estado: JSON.stringify({
                resilienceUsed: true,
                resilience: { untilCombatEnd: true },
            }),
        });
        assert.equal(neverUsed.eligible, false);
        assert.equal(alreadyExtended.eligible, false);
    });

    it('reativação pela Marca não gera patch quando faltam PDR', () => {
        const plan = buildStoneMarkReactivation({
            resp_pedra_estado: JSON.stringify({ resilienceUsed: true }),
            pdr_slayer_total_conta: 7,
            pdr_slayer_gasto_valor: 4,
        });
        assert.equal(plan.eligible, true);
        assert.equal(plan.ok, false);
        assert.equal(plan.cost, 5);
        assert.equal(plan.pdrCurrent, 3);
        assert.equal(plan.patch, undefined);
    });

    it('o botão manual não transforma Resiliência em reativação da Marca', () => {
        const firstUse = buildStoneBreathingPlan('pedra_05', 4, {}, { markReactivation: true });
        assert.equal(firstUse.ok, true);
        assert.equal(firstUse.state.resilience.turns, 3);
        assert.equal(firstUse.state.resilience.untilCombatEnd, false);
        const secondUse = buildStoneBreathingPlan(
            'pedra_05',
            4,
            {
                resp_pedra_estado: JSON.stringify(firstUse.state),
            },
            { markReactivation: true }
        );
        assert.equal(secondUse.ok, false);
    });

    it('estados simultâneos: Sangramento (Quebra Superior) e Resiliência coexistem sem mutação por referência compartilhada', () => {
        const bleedPlan = buildStoneBreathingPlan('pedra_02', 3, {});
        assert.equal(bleedPlan.state.bleeding.amount, 6);
        const resiliencePlan = buildStoneBreathingPlan('pedra_05', 2, {
            resp_pedra_estado: JSON.stringify(bleedPlan.state),
        });
        assert.equal(
            resiliencePlan.state.bleeding.amount,
            6,
            'o Sangramento herdado do estado anterior não deve ser apagado por outra Forma'
        );
        assert.equal(
            resiliencePlan.state.pendingDamage.formula,
            '4d10',
            'o dano pendente da Quebra Superior deve sobreviver à ativação da Resiliência'
        );
        assert.equal(resiliencePlan.state.resilience.multiplier, 0.5);

        // Tick de turno: a Resiliência perde 1 turno, o Sangramento (que não tem
        // campo `turns` gerenciado por tickStoneBreathing) permanece intocado por
        // referência — a mutação de um não pode vazar para o outro.
        const ticked = tickStoneBreathing(resiliencePlan.state);
        assert.equal(ticked.state.resilience.turns, 2);
        assert.equal(ticked.state.bleeding.amount, 6);
        assert.equal(ticked.state.bleeding.turns, 2);
        // Original permanece intocado: tickStoneBreathing não deve mutar o estado recebido por referência.
        assert.equal(resiliencePlan.state.resilience.turns, 3);
    });

    it('Riólito: Recuperação por Crítico é limitada aos 2 PDR do dado curado, não hardcoded no chamador', () => {
        assert.equal(stoneFormById('pedra_04').levels[2].recoverPdrOnCritical, 2);
        assert.equal(stoneFormById('pedra_04').levels[3].recoverPdrOnCritical, 2);
        const plan = buildStoneBreathingPlan('pedra_04', 3, {});
        assert.equal(plan.selected.recoverPdrOnCritical, 2);
        assert.equal(plan.state.pendingDamage.recoverPdrMaximum, 2);
    });
});
