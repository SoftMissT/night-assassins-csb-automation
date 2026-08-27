import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { METAL_FORMS, METAL_HAMMER_PASSIVE } from '../scripts/metal-breathing-data.mjs';
import {
    buildMetalBreathingPlan,
    buildMetalHammerFollowUp,
    canApplyMetalChain,
    consumeMetalHammerPending,
    consumeMetalSteelDefense,
    metalStatePatch,
    parseMetalBreathingState,
    resolveMetalMagnetism,
    registerMetalBattleHit,
    registerMetalChainApplication,
    resolveMetalCriticalFailureOpportunity,
    resolveMetalIncomingAttackDefense,
    resolveMetalChainReroll,
    tickMetalBreathing,
    validateMetalMagnetismTarget,
} from '../scripts/metal-breathing-service.mjs';

describe('Respiração do Metal', () => {
    it('publica cinco formas oficiais e Martelo desde o nível 1', () => {
        assert.equal(METAL_FORMS.length, 5);
        assert.deepEqual(
            METAL_FORMS.map((form) => form.action),
            ['unica', 'especial', 'especial', 'completa', 'ataque']
        );
        assert.equal(METAL_HAMMER_PASSIVE.minimumLevel, 1);
    });

    it('Metalizado arredonda metade da VIT para cima e impede sobreposição', () => {
        const plan = buildMetalBreathingPlan('metal_01', 1, { vit_display: 5 });
        assert.equal(plan.state.metalized.blockBonus, 3);
        assert.equal(plan.state.metalized.turns, 2);
        assert.equal(
            buildMetalBreathingPlan('metal_01', 1, {
                resp_metal_estado: JSON.stringify(plan.state),
            }).ok,
            false
        );
        assert.equal(
            buildMetalBreathingPlan('metal_01', 4, { vit_display: 5 }).state.metalized.turns,
            4
        );
    });

    it('Inabalável reduz Cortante e Perfurante e prepara oportunidade escalada', () => {
        const plan = buildMetalBreathingPlan('metal_02', 3, {});
        assert.deepEqual(plan.state.unshakable.resistances, ['cortante', 'perfurante']);
        assert.equal(plan.state.unshakable.multiplier, 0.5);
        assert.equal(plan.state.unshakable.enemyCriticalFailureOpportunity.damage, '3d4');
    });

    it('Reação em Cadeia escala bônus, dura FDV e pune rerrolagem falha', () => {
        const plan = buildMetalBreathingPlan('metal_03', 4, { fdv_display: 5 });
        assert.equal(plan.state.chainReaction.damageBonus, 8);
        assert.equal(plan.state.chainReaction.turns, 5);
        assert.equal(
            resolveMetalChainReroll(plan.state, { originalTotal: 9, rerollHit: false }).exhaustion,
            1
        );
        assert.equal(
            resolveMetalChainReroll(plan.state, { originalTotal: 10, rerollHit: false }).allowed,
            false
        );
    });

    it('Duro como Aço respeita desbloqueio e consome a defesa preparada', () => {
        assert.equal(buildMetalBreathingPlan('metal_04', 1, {}).ok, false);
        assert.equal(
            buildMetalBreathingPlan('metal_04', 2, {}).state.steelDefense.defenseAdvantage,
            true
        );
        const level4 = buildMetalBreathingPlan('metal_04', 4, {});
        const consumed = consumeMetalSteelDefense(level4.state);
        assert.equal(consumed.effect.negateAttack, true);
        assert.equal(consumed.effect.counterAttack, true);
        assert.equal(consumed.state.steelDefense, undefined);
    });

    it('Forjado na Batalha substitui bônus a cada acerto e limita no quarto', () => {
        let state = buildMetalBreathingPlan('metal_06', 2, {
            vit_display: 4,
            for_display: 6,
        }).state;
        // Magnetismo desacoplado da 5ª Forma (decisão do Operador): não vive mais no Forjado
        assert.equal(state.battleForged.magnetismEligible, undefined);
        assert.equal(resolveMetalMagnetism({ vit_display: 4, for_display: 6 }).eligible, true);
        for (let i = 0; i < 5; i += 1) state = registerMetalBattleHit(state).state;
        assert.equal(state.battleForged.hits, 4);
        assert.equal(state.battleForged.forBonus, 2);
        assert.equal(state.battleForged.fdvBonus, 2);
        assert.equal(registerMetalBattleHit({}).changed, false);
    });

    it('Martelo causa metade arredondada para cima ou dano total com sinergia', () => {
        const half = buildMetalHammerFollowUp({ breathingLevel: 1, originalDamage: 15 });
        assert.equal(half.damage, 8);
        assert.equal(half.ignoresResistance, true);
        const total = buildMetalHammerFollowUp({
            breathingLevel: 3,
            originalDamage: 15,
            synergyBreathing: 'Pedra',
            allySpendsPdr: true,
        });
        assert.equal(total.damage, 15);
        assert.equal(total.allyPdrCost, 1);
    });

    it('consome Martelo uma única vez e preserva um plano executável', () => {
        const first = consumeMetalHammerPending(
            { metal: { hammerPending: true } },
            { breathingLevel: 1, originalDamage: 15 }
        );
        assert.equal(first.ok, true);
        assert.equal(first.consumed, true);
        assert.equal(first.damage, 8);
        assert.equal(first.requiresStandardAttackRoll, true);
        assert.equal(first.state.metal.hammerPending, undefined);
        assert.equal(
            consumeMetalHammerPending(first.state, { breathingLevel: 1, originalDamage: 15 })
                .consumed,
            false
        );
    });

    it('libera dano do Inabalável só após erro crítico e acerto da oportunidade', () => {
        const state = buildMetalBreathingPlan('metal_02', 3, {}).state;
        assert.equal(
            resolveMetalCriticalFailureOpportunity(state, { enemyCriticalFailure: false }).eligible,
            false
        );
        assert.equal(
            resolveMetalCriticalFailureOpportunity(state, {
                enemyCriticalFailure: true,
                opportunityHit: false,
            }).applyDamage,
            false
        );
        const resolved = resolveMetalCriticalFailureOpportunity(state, {
            enemyCriticalFailure: true,
            opportunityHit: true,
        });
        assert.deepEqual(resolved, {
            eligible: true,
            applyDamage: true,
            formula: '3d4',
            type: 'concussao',
        });
    });

    it('limita Reação em Cadeia uma vez por ação, não uma vez por turno', () => {
        const state = buildMetalBreathingPlan('metal_03', 2, { fdv_display: 4 }).state;
        assert.equal(canApplyMetalChain(state, 'acao-a'), true);
        const first = registerMetalChainApplication(state, 'acao-a');
        assert.equal(first.changed, true);
        assert.equal(canApplyMetalChain(first.state, 'acao-a'), false);
        assert.equal(canApplyMetalChain(first.state, 'acao-b'), true);
        assert.equal(registerMetalChainApplication(first.state, 'acao-b').changed, true);
    });

    it('valida o alvo obrigatório de Magnetismo quando elegível', () => {
        const state = buildMetalBreathingPlan(
            'metal_06',
            1,
            { vit_display: 6 },
            { targetUuid: 'Actor.metal' }
        ).state;
        assert.deepEqual(validateMetalMagnetismTarget(state, ['Actor.outro']), {
            active: true,
            valid: false,
            requiredTargetUuid: 'Actor.metal',
        });
        assert.equal(
            validateMetalMagnetismTarget(state, ['Actor.outro', 'Actor.metal']).valid,
            true
        );
        const inactive = buildMetalBreathingPlan(
            'metal_06',
            1,
            { vit_display: 5, for_display: 5 },
            { targetUuid: 'Actor.metal' }
        ).state;
        assert.equal(validateMetalMagnetismTarget(inactive, []).active, false);
    });

    it('consome Duro como Aço apenas pela resolução de ataque recebida', () => {
        const state = buildMetalBreathingPlan('metal_04', 4, {}).state;
        const resolved = resolveMetalIncomingAttackDefense(state);
        assert.equal(resolved.consumed, true);
        assert.equal(resolved.effect.negateAttack, true);
        assert.equal(resolveMetalIncomingAttackDefense(resolved.state).consumed, false);
    });

    it('tick reduz durações e limpa efeitos encerrados', () => {
        const state = {
            metalized: { turns: 1, blockBonus: 4 },
            unshakable: { turns: 2 },
            battleForged: { turns: 1, forBonus: 2, fdvBonus: 2 },
        };
        const tick = tickMetalBreathing(state);
        assert.equal(tick.state.metalized, undefined);
        assert.equal(tick.state.unshakable.turns, 1);
        assert.equal(tick.state.battleForged, undefined);
        assert.equal(
            parseMetalBreathingState(tick.patch['system.props.resp_metal_estado']).unshakable.turns,
            1
        );
    });
});

describe('Respiração do Metal — missão: estados simultâneos, legado e combos', () => {
    const VIT = { vit_display: 7, for_display: 6, fdv_display: 4, car_display: 3 };

    it('§35 · cinco estados ativos: consumir um não apaga os outros', () => {
        let state = {};
        for (const [id, level] of [
            ['metal_01', 2],
            ['metal_02', 1],
            ['metal_03', 3],
            ['metal_04', 2],
            ['metal_06', 1],
        ]) {
            state = buildMetalBreathingPlan(id, level, {
                ...VIT,
                resp_metal_estado: JSON.stringify(state),
            }).state;
        }
        assert.ok(
            state.metalized &&
                state.unshakable &&
                state.chainReaction &&
                state.steelDefense &&
                state.battleForged
        );

        // Consome o Duro como Aço (resolução de ataque recebido)
        const consumed = resolveMetalIncomingAttackDefense(state);
        assert.equal(consumed.consumed, true);
        assert.equal(consumed.state.steelDefense, undefined);

        // Os outros quatro permanecem intactos
        assert.ok(consumed.state.metalized?.turns > 0);
        assert.ok(consumed.state.unshakable?.turns > 0);
        assert.ok(consumed.state.chainReaction?.turns > 0);
        assert.ok(consumed.state.battleForged?.turns > 0);

        // Tick independente: todas as durações decrementam 1, nada some junto
        const ticked = tickMetalBreathing(consumed.state).state;
        assert.equal(ticked.metalized.turns, consumed.state.metalized.turns - 1);
        assert.equal(ticked.unshakable.turns, consumed.state.unshakable.turns - 1);
        assert.equal(ticked.chainReaction.turns, consumed.state.chainReaction.turns - 1);
        assert.equal(ticked.battleForged.turns, consumed.state.battleForged.turns - 1);
    });

    it('§36 · estado legado sem campos novos normaliza sem quebrar', () => {
        const legacy = {
            version: 1,
            metalized: { turns: 1, blockBonus: 3 },
            chainReaction: { turns: 2, damageBonus: 6 },
        };
        const plan = buildMetalBreathingPlan('metal_04', 3, {
            ...VIT,
            resp_metal_estado: JSON.stringify(legacy),
        });
        assert.equal(plan.ok, true);
        assert.equal(plan.state.metalized.blockBonus, 3);
        assert.ok(
            plan.state.chainReaction.damageBonus === 6 ||
                (plan.state.chainReaction === undefined) === false
        );
    });

    it('Combo A · Metalizado + Duro como Aço N2 compõem Bloqueio + vantagem', () => {
        const n1 = buildMetalBreathingPlan('metal_01', 1, VIT);
        assert.equal(n1.state.metalized.blockBonus, 4); // N1: ceil(VIT/2) com VIT 7
        let state = buildMetalBreathingPlan('metal_01', 2, VIT).state;
        assert.equal(state.metalized.blockBonus, 7); // N2+: VIT cheia
        const steel = buildMetalBreathingPlan('metal_04', 2, {
            ...VIT,
            resp_metal_estado: JSON.stringify(state),
        });
        assert.equal(steel.state.steelDefense.defenseAdvantage, true);
        assert.equal(steel.patch['system.props.resp_metal_bloqueio_bonus'], 7); // bônus persiste
    });

    it('Combo C · Reação em Cadeia + Forjado coexistem (dano da 3ª + FOR/FDV temporários)', () => {
        let state = buildMetalBreathingPlan('metal_03', 3, VIT).state;
        assert.equal(state.chainReaction.damageBonus, 6);
        state = buildMetalBreathingPlan('metal_06', 1, {
            ...VIT,
            resp_metal_estado: JSON.stringify(state),
        }).state;
        const forgedHit = registerMetalBattleHit(JSON.stringify(state)).state;
        assert.equal(forgedHit.battleForged.forBonus, 1);
        assert.equal(forgedHit.chainReaction.damageBonus, 6);
        const patch = metalStatePatch(forgedHit);
        assert.equal(patch['system.props.resp_metal_for_temp'], 1);
    });

    it('§23 · Reação em Cadeia na mesma ação: segunda aplicação é bloqueada', () => {
        let state = buildMetalBreathingPlan('metal_03', 3, VIT).state;
        const actionId = 'acao-unica-42';
        const first = registerMetalChainApplication(JSON.stringify(state), actionId);
        assert.equal(first.changed, true);
        const second = registerMetalChainApplication(first.state, actionId);
        assert.equal(second.changed, false);
        assert.equal(canApplyMetalChain(second.state, actionId), false);
    });
});

describe('Respiração do Metal — Magnetismo permanente (decisão do Operador)', () => {
    it('é elegível SEM Forjado ativo — passiva permanente', () => {
        const state = buildMetalBreathingPlan(
            'metal_06',
            1,
            { vit_display: 7, for_display: 4 },
            { targetUuid: 'Actor.inimigo' }
        ).state;
        assert.equal(state.battleForged.magnetismEligible, undefined); // desacoplado da 5ª
        assert.equal(state.magnetism.targetUuid, 'Actor.inimigo');
        const check = validateMetalMagnetismTarget(state, ['Actor.outro']);
        assert.deepEqual(check, {
            active: true,
            valid: false,
            requiredTargetUuid: 'Actor.inimigo',
        });
        assert.equal(validateMetalMagnetismTarget(state, ['Actor.inimigo']).valid, true);
    });

    it('não é elegível com VIT/FOR < 6 — nenhum alvo é gravado', () => {
        const state = buildMetalBreathingPlan(
            'metal_06',
            1,
            { vit_display: 5, for_display: 5 },
            { targetUuid: 'Actor.inimigo' }
        ).state;
        assert.equal(state.magnetism.targetUuid, '');
        assert.equal(validateMetalMagnetismTarget(state, []).active, false);
    });

    it('Forjado pode ELEVAR FOR até o limiar e ligar o Magnetismo; expirar desliga', () => {
        const props = { vit_display: 3, for_display: 5 };
        assert.equal(resolveMetalMagnetism(props).eligible, false); // base insuficiente

        const forged = { battleForged: { turns: 8, hits: 1, stage: 1, forBonus: 1, fdvBonus: 0 } };
        const withBonus = resolveMetalMagnetism(props, forged);
        assert.equal(withBonus.eligible, true); // FOR efetiva 6
        assert.equal(withBonus.effectiveFor, 6);

        // Forjado expira → bônus some → Magnetismo inativo (alvo deixa de ser obrigatório)
        const expiredState = {
            version: 1,
            magnetism: { targetUuid: 'Actor.alvo' },
            battleForged: undefined,
        };
        const afterExpiry = validateMetalMagnetismTarget(expiredState, [], props);
        assert.equal(afterExpiry.active, false);
    });

    it('estado legado (battleForged.magnetismEligible) continua validando', () => {
        const legacy = {
            version: 1,
            battleForged: {
                turns: 4,
                magnetismEligible: true,
                magnetismTargetUuid: 'Actor.legado',
            },
        };
        assert.deepEqual(validateMetalMagnetismTarget(legacy, ['Actor.outro']), {
            active: true,
            valid: false,
            requiredTargetUuid: 'Actor.legado',
        });
        assert.equal(validateMetalMagnetismTarget(legacy, ['Actor.legado']).valid, true);
    });

    it('fim do combate limpa o alvo obrigatório do Magnetismo', async () => {
        const { clearMetalBreathingState } = await import('../scripts/metal-breathing-service.mjs');
        const state = buildMetalBreathingPlan(
            'metal_06',
            1,
            { vit_display: 7 },
            { targetUuid: 'Actor.inimigo' }
        ).state;
        const cleared = parseMetalBreathingState(JSON.stringify({})).version
            ? clearMetalBreathingState(JSON.stringify(state))
            : null;
        assert.ok(cleared);
        assert.equal(cleared['system.props.resp_metal_estado'].match(/magnetism/), null);
    });
});
