import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SNOW_FORMS, snowFormById } from '../scripts/snow-breathing-data.mjs';
import {
    addSnowFreeze,
    breakSnowRestrictionOnDamage,
    buildSnowBreathingPlan,
    clearSnowBreathingState,
    grantBlizzardStealth,
    parseSnowBreathingState,
    resolveSnowFreezeGain,
    snowEffectiveBreathLevel,
    snowFreezeCount,
    resolveSnowAvalancheSynergy,
    resolveSnowKekkijutsuGuard,
    resolveSnowRestrictionEscape,
    snowRestrictionFlag,
    snowTickPatchWithExhaustion,
    spendFreezeForRestriction,
    tickSnowBreathing,
} from '../scripts/snow-breathing-service.mjs';

const props = { fdv_display: 3, car_display: 4, nvl_num: 8 };

describe('Respiração da Neve', () => {
    it('cataloga sete Formas com custos e progressões oficiais', () => {
        assert.equal(SNOW_FORMS.length, 7);
        assert.equal(snowFormById('neve_01').levels[3].damage, '2d10');
        assert.deepEqual(snowFormById('neve_02').levels[3].vulnerabilities, [
            'cortante',
            'perfurante',
        ]);
        assert.equal(snowFormById('neve_05').levels[2].damage, '6d10');
        assert.equal(snowFormById('neve_07').levels[3].freeze, 1);
    });

    it('Fluxo de Neve prepara dano escalado e Congelar no acerto', () => {
        const plan = buildSnowBreathingPlan('neve_01', 3, props);
        assert.equal(plan.cost, 2);
        assert.equal(plan.state.pendingDamage.formula, '2d8');
        assert.equal(plan.state.pendingDamage.freezeOnHit, 1);
        assert.equal(plan.state.pendingDamage.range, 5);
        assert.equal(plan.state.nextHit.source, 'neve_01');
    });

    it('Inverno Sombrio aplica penalidade por dois turnos e recarga de três', () => {
        const plan = buildSnowBreathingPlan('neve_02', 4, props);
        assert.equal(plan.state.pendingTargetEffect.hitPenalty, -4);
        assert.deepEqual(plan.state.pendingTargetEffect.vulnerabilities, [
            'cortante',
            'perfurante',
        ]);
        assert.equal(plan.state.cooldowns.neve_02, 3);
        assert.equal(
            buildSnowBreathingPlan('neve_02', 4, { ...props, resp_neve_estado: plan.state }).ok,
            false
        );
    });

    it('Nevasca dura CAR turnos e concede furtividade uma vez por rodada', () => {
        const plan = buildSnowBreathingPlan('neve_03', 1, props, { ownerUuid: 'Actor.Owner' });
        assert.equal(plan.state.blizzard.turns, 4);
        const first = grantBlizzardStealth(plan.state, {
            allyUuid: 'Actor.Ally',
            allyBreathing: 'Água',
            currentRound: 2,
        });
        assert.equal(first.ok, true);
        assert.equal(first.pdrRecovery, 2);
        assert.equal(
            grantBlizzardStealth(first.state, { allyUuid: 'Actor.Other', currentRound: 2 }).ok,
            false
        );
    });

    it('Coração de Gelo eleva a respiração ou concede +2 no nível máximo e gera Exaustão', () => {
        assert.equal(
            buildSnowBreathingPlan('neve_04', 3, props).state.iceHeart.breathingLevelBonus,
            1
        );
        const plan = buildSnowBreathingPlan('neve_04', 4, props);
        assert.equal(plan.state.iceHeart.hitBonus, 2);
        let tick = tickSnowBreathing(plan.state);
        tick = tickSnowBreathing(tick.state);
        assert.deepEqual(tick.events, [{ type: 'exhaustion', amount: 1 }]);
    });

    it('Avalanche prepara Acerto, dano e Congelar crítico', () => {
        const plan = buildSnowBreathingPlan('neve_05', 4, props, { targetUuid: 'Actor.Target' });
        assert.equal(plan.state.nextHit.bonus, 2);
        assert.equal(plan.state.nextHit.criticalFreeze, 1);
        assert.equal(plan.state.pendingDamage.formula, '8d10');
        assert.equal(plan.state.avalancheTarget.allyStealthBonusDamage, '1d4');
    });

    it('Abaixo de Zero acumula potência sem estender duração', () => {
        const first = buildSnowBreathingPlan('neve_06', 4, props);
        const ticked = tickSnowBreathing(first.state).state;
        const second = buildSnowBreathingPlan('neve_06', 4, { ...props, resp_neve_estado: ticked });
        assert.equal(second.state.belowZero.turns, 2);
        assert.equal(second.state.belowZero.stacks, 2);
        assert.equal(second.state.belowZero.fdvHitBonus, 6);
        assert.equal(second.state.belowZero.fdvDamageBonus, 6);
    });

    it('Canção protege aliado sinérgico e aplica Congelar no nível 4', () => {
        const plan = buildSnowBreathingPlan('neve_07', 4, props, {
            protectedUuid: 'Actor.Ally',
            allyBreathing: 'Cristal',
        });
        assert.equal(plan.state.kekkijutsuGuard.damageMultiplier, 0.5);
        assert.equal(plan.state.kekkijutsuGuard.opportunityAttack, true);
        assert.equal(plan.state.kekkijutsuGuard.freezeOnUse, 1);
    });

    it('Congelar acumula por alvo, restringe aos cinco e rompe ao receber dano', () => {
        let result = addSnowFreeze({}, 'Actor.Target', 5);
        assert.equal(result.reachedFive, true);
        assert.equal(snowFreezeCount(result.state, 'Actor.Target'), 5);
        const spent = spendFreezeForRestriction(result.state, 'Actor.Target', 4);
        assert.equal(spent.ok, true);
        assert.equal(spent.restriction.escapeDc, 12);
        assert.equal(spent.restriction.escapeAction, 'ataque');
        // A regra manda gastar a Ação Única, não os acúmulos: os 5 Congelar
        // permanecem no alvo mesmo depois de restringir (decisão do Operador).
        assert.equal(snowFreezeCount(spent.state, 'Actor.Target'), 5);
        assert.equal(
            breakSnowRestrictionOnDamage(spent.state, 'Actor.Target').restrictedTarget,
            undefined
        );
    });

    it('restringir de novo exige outra Ação Única: bloqueia enquanto o alvo já está restringido, libera após romper e ainda ter 5+ Congelar', () => {
        const frozen = addSnowFreeze({}, 'Actor.Target', 5).state;
        const firstRestriction = spendFreezeForRestriction(frozen, 'Actor.Target', 4);
        assert.equal(firstRestriction.ok, true);
        // Já restringido: não pode gastar outra Ação Única para restringir de novo.
        assert.equal(
            spendFreezeForRestriction(firstRestriction.state, 'Actor.Target', 4).ok,
            false
        );
        // Depois de romper o root (por dano ou fuga), os stacks continuam em 5 —
        // o usuário PODE gastar uma nova Ação Única para restringir outra vez.
        const broken = breakSnowRestrictionOnDamage(firstRestriction.state, 'Actor.Target');
        const secondRestriction = spendFreezeForRestriction(broken, 'Actor.Target', 4);
        assert.equal(secondRestriction.ok, true);
        assert.equal(snowFreezeCount(secondRestriction.state, 'Actor.Target'), 5);
    });

    it('fim de combate limpa formas ativas e recargas da Neve, mas preserva Congelar por alvo (sem duração definida na regra)', () => {
        const withInverno = buildSnowBreathingPlan('neve_02', 3, props).state;
        const frozen = addSnowFreeze(withInverno, 'Actor.Oni', 3).state;
        const patch = clearSnowBreathingState(frozen);
        const cleared = parseSnowBreathingState(patch['system.props.resp_neve_estado']);
        assert.equal(cleared.cooldowns.neve_02, undefined);
        assert.equal(cleared.pendingTargetEffect, undefined);
        assert.equal(snowFreezeCount(cleared, 'Actor.Oni'), 3);
        assert.equal(patch['system.props.resp_neve_resumo'], 'Neve · sem efeito ativo');
    });

    it('Abaixo de Zero nível 4 dispara explosão ao alcançar cinco Congelar', () => {
        const plan = buildSnowBreathingPlan('neve_06', 4, props);
        const result = resolveSnowFreezeGain(plan.state, 'Actor.Target', 5, {
            recoveryChoice: 'pdr',
        });
        assert.equal(result.burstFormula, '6d4');
        assert.deepEqual(result.recovery, { resource: 'pdr', amount: 1, pdr: 1 });
    });

    it('Abaixo de Zero nível 3 solicita escolha entre 2 PDV e 1 PDR por aplicação', () => {
        const plan = buildSnowBreathingPlan('neve_06', 3, props);
        const unresolved = resolveSnowFreezeGain(plan.state, 'Actor.Target', 1);
        assert.equal(unresolved.recovery.resource, 'choice');
        assert.deepEqual(
            resolveSnowFreezeGain(plan.state, 'Actor.Target', 1, { recoveryChoice: 'pdv' })
                .recovery,
            { resource: 'pdv', amount: 2, pdv: 2 }
        );
    });

    it('Coração de Gelo eleva somente o nível efetivo e respeita o teto 4', () => {
        const active = buildSnowBreathingPlan('neve_04', 2, props).state;
        assert.equal(snowEffectiveBreathLevel(2, active), 3);
        assert.equal(snowEffectiveBreathLevel(4, active), 4);
        assert.equal(snowEffectiveBreathLevel(2, {}), 2);
    });

    it('restrição produz flag transferível ao alvo', () => {
        const frozen = addSnowFreeze({}, 'Actor.Target', 5).state;
        const spent = spendFreezeForRestriction(frozen, 'Actor.Target', 4);
        assert.deepEqual(snowRestrictionFlag(spent.restriction, 'Actor.Snow'), {
            sourceActorUuid: 'Actor.Snow',
            targetUuid: 'Actor.Target',
            escapeDc: 12,
            escapeAction: 'ataque',
            escapeAttribute: 'FOR',
            breakOnDamage: true,
        });
    });

    it('tick consolida Exaustão e estado em um único patch', () => {
        const plan = buildSnowBreathingPlan('neve_04', 2, props);
        const first = snowTickPatchWithExhaustion(plan.state, 3);
        assert.equal(first.patch['system.props.status_slayer_exaustao'], undefined);
        const second = snowTickPatchWithExhaustion(first.state, 3);
        assert.equal(second.patch['system.props.status_slayer_exaustao'], 4);
    });

    it('fuga da restrição consome Ataque e compara FOR com a CD persistida', () => {
        const flag = { targetUuid: 'Actor.Target', escapeDc: 12 };
        assert.equal(resolveSnowRestrictionEscape(flag, 11).escaped, false);
        assert.deepEqual(resolveSnowRestrictionEscape(flag, 12), {
            ok: true,
            escaped: true,
            total: 12,
            dc: 12,
            consumesAction: 'ataque',
        });
    });

    it('Canção consome a guarda e resolve Kekkijutsu uma única vez', () => {
        const plan = buildSnowBreathingPlan('neve_07', 4, props, {
            protectedUuid: 'Actor.Ally',
            allyBreathing: 'Água',
        });
        const resolved = resolveSnowKekkijutsuGuard(plan.state, { enemyUuid: 'Actor.Oni' });
        assert.equal(resolved.active, true);
        assert.equal(resolved.damageMultiplier, 0.5);
        assert.equal(resolved.negateEffects, true);
        assert.equal(resolved.freeze, 1);
        assert.equal(resolved.opportunityAttack, true);
        assert.equal(resolveSnowKekkijutsuGuard(resolved.state).active, false);
    });

    it('sinergia da Avalanche exige alvo marcado e furtividade da Nevasca', () => {
        const plan = buildSnowBreathingPlan('neve_05', 2, props, { targetUuid: 'Actor.Oni' });
        assert.equal(
            resolveSnowAvalancheSynergy(plan.state, {
                targetUuid: 'Actor.Oni',
                allyStealthed: false,
            }).applies,
            false
        );
        assert.deepEqual(
            resolveSnowAvalancheSynergy(plan.state, {
                targetUuid: 'Actor.Oni',
                allyStealthed: true,
            }),
            {
                applies: true,
                formula: '1d4',
                movementTurns: 2,
            }
        );
    });

    it('Congelar é por alvo: dois inimigos nunca compartilham a mesma pilha (Inimigo A=2, B=4 → Fluxo acerta A → A=3, B continua 4)', () => {
        let state = addSnowFreeze({}, 'Actor.A', 2).state;
        state = addSnowFreeze(state, 'Actor.B', 4).state;
        const afterHitOnA = addSnowFreeze(state, 'Actor.A', 1);
        assert.equal(snowFreezeCount(afterHitOnA.state, 'Actor.A'), 3);
        assert.equal(snowFreezeCount(afterHitOnA.state, 'Actor.B'), 4);
    });

    describe('Combos obrigatórios (seção 38)', () => {
        it('Combo A — Abaixo de Zero N3 + Fluxo de Neve: acerto aplica +1 Congelar e oferece escolha 2 PDV/1 PDR', () => {
            const belowZero = buildSnowBreathingPlan('neve_06', 3, props).state;
            const gain = resolveSnowFreezeGain(belowZero, 'Actor.Oni', 1, {
                recoveryChoice: 'pdv',
            });
            assert.equal(snowFreezeCount(gain.state, 'Actor.Oni'), 1);
            assert.deepEqual(gain.recovery, { resource: 'pdv', amount: 2, pdv: 2 });
            assert.equal(gain.burstFormula, null);
        });

        it('Combo B — Abaixo de Zero N4 + alvo com 4 Congelar + Fluxo acerta: 5º stack dispara 6d4 automático sem 2ª rolagem de Acerto, e ainda oferece a escolha do N3', () => {
            const belowZero = buildSnowBreathingPlan('neve_06', 4, props).state;
            const primed = addSnowFreeze(belowZero, 'Actor.Oni', 4).state;
            const gain = resolveSnowFreezeGain(primed, 'Actor.Oni', 1, { recoveryChoice: 'pdr' });
            assert.equal(snowFreezeCount(gain.state, 'Actor.Oni'), 5);
            assert.equal(gain.burstFormula, '6d4');
            assert.deepEqual(gain.recovery, { resource: 'pdr', amount: 1, pdr: 1 });
        });

        it('Combo C — Nevasca + aliado Água/Vento/Cristal: recebe Furtividade + 2 PDR, uma única vez naquela concessão', () => {
            const blizzard = buildSnowBreathingPlan('neve_03', 1, props, {
                ownerUuid: 'Actor.Snow',
            }).state;
            const granted = grantBlizzardStealth(blizzard, {
                allyUuid: 'Actor.Ally',
                allyBreathing: 'Vento',
                currentRound: 1,
            });
            assert.equal(granted.ok, true);
            assert.equal(granted.stealth, true);
            assert.equal(granted.pdrRecovery, 2);
            // Mesma rodada, outro aliado: bloqueado (só 1 concessão por rodada).
            assert.equal(
                grantBlizzardStealth(granted.state, {
                    allyUuid: 'Actor.Other',
                    allyBreathing: 'Água',
                    currentRound: 1,
                }).ok,
                false
            );
            // Respiração sem sinergia: Furtividade concedida, mas sem recuperação de PDR.
            const nextRound = grantBlizzardStealth(
                { ...blizzard, blizzard: { ...blizzard.blizzard, lastGrantRound: null } },
                { allyUuid: 'Actor.Other', allyBreathing: 'Chamas', currentRound: 2 }
            );
            assert.equal(nextRound.ok, true);
            assert.equal(nextRound.pdrRecovery, 0);
        });

        it('Combo D — Nevasca + Avalanche acertou o alvo + aliado furtivo pela Nevasca acerta esse alvo: 1d4 único vira dano bônus E redução de deslocamento', () => {
            const avalanche = buildSnowBreathingPlan('neve_05', 3, props, {
                targetUuid: 'Actor.Oni',
            }).state;
            const synergy = resolveSnowAvalancheSynergy(avalanche, {
                targetUuid: 'Actor.Oni',
                allyStealthed: true,
            });
            assert.equal(synergy.applies, true);
            assert.equal(synergy.formula, '1d4');
            assert.equal(synergy.movementTurns, 2);
            // Um alvo NÃO marcado pela Avalanche não recebe a sinergia.
            assert.equal(
                resolveSnowAvalancheSynergy(avalanche, {
                    targetUuid: 'Actor.OutroAlvo',
                    allyStealthed: true,
                }).applies,
                false
            );
        });

        it('Combo E — Coração de Gelo + outra Forma da Neve: consulta nível efetivo +1 sem alterar o nível base do Actor', () => {
            const iceHeart = buildSnowBreathingPlan('neve_04', 2, props).state;
            assert.equal(snowEffectiveBreathLevel(2, iceHeart), 3);
            assert.equal(snowEffectiveBreathLevel(4, iceHeart), 4); // nunca ultrapassa N4
            assert.equal(snowEffectiveBreathLevel(2, {}), 2); // sem Coração ativo, nível real é preservado
        });

        it('Combo F — Canção N4 + Abaixo de Zero N4 + inimigo com 4 Congelar: Canção aplica +1 Congelar chegando a 5 → explosão 6d4 (o source da aplicação não importa)', () => {
            const belowZero = buildSnowBreathingPlan('neve_06', 4, props).state;
            const primed = addSnowFreeze(belowZero, 'Actor.Oni', 4).state;
            const songPlan = buildSnowBreathingPlan('neve_07', 4, props, {
                protectedUuid: 'Actor.Snow',
                allyBreathing: '',
            });
            assert.equal(songPlan.state.kekkijutsuGuard.freezeOnUse, 1);
            // O Congelar aplicado pela Canção passa pelo MESMO núcleo (resolveSnowFreezeGain)
            // usado por Fluxo/Avalanche/Inverno — o threshold N4 dispara independente da origem.
            const gain = resolveSnowFreezeGain(
                primed,
                'Actor.Oni',
                songPlan.state.kekkijutsuGuard.freezeOnUse
            );
            assert.equal(snowFreezeCount(gain.state, 'Actor.Oni'), 5);
            assert.equal(gain.burstFormula, '6d4');
        });
    });

    it('estados simultâneos: tickar Inverno (cooldown) não muta Nevasca/Coração/Abaixo de Zero/Congelar/marca de Avalanche por referência compartilhada', () => {
        const withInverno = buildSnowBreathingPlan('neve_02', 3, props).state;
        const withBlizzard = buildSnowBreathingPlan(
            'neve_03',
            2,
            { ...props, resp_neve_estado: withInverno },
            { ownerUuid: 'Actor.Snow' }
        ).state;
        const withIceHeart = buildSnowBreathingPlan('neve_04', 2, {
            ...props,
            resp_neve_estado: withBlizzard,
        }).state;
        const withBelowZero = buildSnowBreathingPlan('neve_06', 3, {
            ...props,
            resp_neve_estado: withIceHeart,
        }).state;
        const withAvalanche = buildSnowBreathingPlan(
            'neve_05',
            2,
            { ...props, resp_neve_estado: withBelowZero },
            { targetUuid: 'Actor.Marked' }
        ).state;
        const frozenA = addSnowFreeze(withAvalanche, 'Actor.A', 2).state;
        const combined = addSnowFreeze(frozenA, 'Actor.B', 4).state;

        // Snapshot profundo ANTES do tick para comparar depois (garante ausência
        // de mutação por referência compartilhada / aliasing entre chamadas).
        const snapshot = structuredClone(combined);

        const tick = tickSnowBreathing(combined);

        // O estado ORIGINAL (snapshot) precisa permanecer intacto — tickSnowBreathing
        // não pode mutar o objeto de entrada por referência.
        assert.deepEqual(combined, snapshot);

        // Cooldown do Inverno decrementa 1 (de 3 para 2).
        assert.equal(tick.state.cooldowns.neve_02, 2);
        // Congelar por alvo permanece intacto (sem duração própria).
        assert.equal(snowFreezeCount(tick.state, 'Actor.A'), 2);
        assert.equal(snowFreezeCount(tick.state, 'Actor.B'), 4);
        // Marca da Avalanche permanece (turns decrementados, mas o alvo persiste).
        assert.equal(tick.state.avalancheTarget.uuid, 'Actor.Marked');
        // Nevasca/Coração/Abaixo de Zero decrementam de forma independente, sem
        // um sobrescrever o campo do outro.
        assert.equal(tick.state.blizzard.turns, snapshot.blizzard.turns - 1);
        assert.equal(tick.state.iceHeart.turns, snapshot.iceHeart.turns - 1);
        assert.equal(tick.state.belowZero.turns, snapshot.belowZero.turns - 1);
        // Stacks/potência do Abaixo de Zero não são afetados pelo tick.
        assert.equal(tick.state.belowZero.stacks, snapshot.belowZero.stacks);
    });
});
