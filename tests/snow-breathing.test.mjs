import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SNOW_FORMS, snowFormById } from "../scripts/snow-breathing-data.mjs";
import {
  addSnowFreeze, breakSnowRestrictionOnDamage, buildSnowBreathingPlan, grantBlizzardStealth,
  parseSnowBreathingState, resolveSnowFreezeGain, snowEffectiveBreathLevel, snowFreezeCount,
  resolveSnowAvalancheSynergy, resolveSnowKekkijutsuGuard, resolveSnowRestrictionEscape,
  snowRestrictionFlag, snowTickPatchWithExhaustion, spendFreezeForRestriction, tickSnowBreathing,
} from "../scripts/snow-breathing-service.mjs";

const props = { fdv_display: 3, car_display: 4, nvl_num: 8 };

describe("Respiração da Neve", () => {
  it("cataloga sete Formas com custos e progressões oficiais", () => {
    assert.equal(SNOW_FORMS.length, 7);
    assert.equal(snowFormById("neve_01").levels[3].damage, "2d10");
    assert.deepEqual(snowFormById("neve_02").levels[3].vulnerabilities, ["cortante", "perfurante"]);
    assert.equal(snowFormById("neve_05").levels[2].damage, "6d10");
    assert.equal(snowFormById("neve_07").levels[3].freeze, 1);
  });

  it("Fluxo de Neve prepara dano escalado e Congelar no acerto", () => {
    const plan = buildSnowBreathingPlan("neve_01", 3, props);
    assert.equal(plan.cost, 2);
    assert.equal(plan.state.pendingDamage.formula, "2d8");
    assert.equal(plan.state.pendingDamage.freezeOnHit, 1);
    assert.equal(plan.state.pendingDamage.range, 5);
    assert.equal(plan.state.nextHit.source, "neve_01");
  });

  it("Inverno Sombrio aplica penalidade por dois turnos e recarga de três", () => {
    const plan = buildSnowBreathingPlan("neve_02", 4, props);
    assert.equal(plan.state.pendingTargetEffect.hitPenalty, -4);
    assert.deepEqual(plan.state.pendingTargetEffect.vulnerabilities, ["cortante", "perfurante"]);
    assert.equal(plan.state.cooldowns.neve_02, 3);
    assert.equal(buildSnowBreathingPlan("neve_02", 4, { ...props, resp_neve_estado: plan.state }).ok, false);
  });

  it("Nevasca dura CAR turnos e concede furtividade uma vez por rodada", () => {
    const plan = buildSnowBreathingPlan("neve_03", 1, props, { ownerUuid: "Actor.Owner" });
    assert.equal(plan.state.blizzard.turns, 4);
    const first = grantBlizzardStealth(plan.state, { allyUuid: "Actor.Ally", allyBreathing: "Água", currentRound: 2 });
    assert.equal(first.ok, true);
    assert.equal(first.pdrRecovery, 2);
    assert.equal(grantBlizzardStealth(first.state, { allyUuid: "Actor.Other", currentRound: 2 }).ok, false);
  });

  it("Coração de Gelo eleva a respiração ou concede +2 no nível máximo e gera Exaustão", () => {
    assert.equal(buildSnowBreathingPlan("neve_04", 3, props).state.iceHeart.breathingLevelBonus, 1);
    const plan = buildSnowBreathingPlan("neve_04", 4, props);
    assert.equal(plan.state.iceHeart.hitBonus, 2);
    let tick = tickSnowBreathing(plan.state);
    tick = tickSnowBreathing(tick.state);
    assert.deepEqual(tick.events, [{ type: "exhaustion", amount: 1 }]);
  });

  it("Avalanche prepara Acerto, dano e Congelar crítico", () => {
    const plan = buildSnowBreathingPlan("neve_05", 4, props, { targetUuid: "Actor.Target" });
    assert.equal(plan.state.nextHit.bonus, 2);
    assert.equal(plan.state.nextHit.criticalFreeze, 1);
    assert.equal(plan.state.pendingDamage.formula, "8d10");
    assert.equal(plan.state.avalancheTarget.allyStealthBonusDamage, "1d4");
  });

  it("Abaixo de Zero acumula potência sem estender duração", () => {
    const first = buildSnowBreathingPlan("neve_06", 4, props);
    const ticked = tickSnowBreathing(first.state).state;
    const second = buildSnowBreathingPlan("neve_06", 4, { ...props, resp_neve_estado: ticked });
    assert.equal(second.state.belowZero.turns, 2);
    assert.equal(second.state.belowZero.stacks, 2);
    assert.equal(second.state.belowZero.fdvHitBonus, 6);
    assert.equal(second.state.belowZero.fdvDamageBonus, 6);
  });

  it("Canção protege aliado sinérgico e aplica Congelar no nível 4", () => {
    const plan = buildSnowBreathingPlan("neve_07", 4, props, { protectedUuid: "Actor.Ally", allyBreathing: "Cristal" });
    assert.equal(plan.state.kekkijutsuGuard.damageMultiplier, 0.5);
    assert.equal(plan.state.kekkijutsuGuard.opportunityAttack, true);
    assert.equal(plan.state.kekkijutsuGuard.freezeOnUse, 1);
  });

  it("Congelar acumula por alvo, restringe aos cinco e rompe ao receber dano", () => {
    let result = addSnowFreeze({}, "Actor.Target", 5);
    assert.equal(result.reachedFive, true);
    assert.equal(snowFreezeCount(result.state, "Actor.Target"), 5);
    const spent = spendFreezeForRestriction(result.state, "Actor.Target", 4);
    assert.equal(spent.ok, true);
    assert.equal(spent.restriction.escapeDc, 12);
    assert.equal(spent.restriction.escapeAction, "ataque");
    assert.equal(breakSnowRestrictionOnDamage(spent.state, "Actor.Target").restrictedTarget, undefined);
  });

  it("Abaixo de Zero nível 4 dispara explosão ao alcançar cinco Congelar", () => {
    const plan = buildSnowBreathingPlan("neve_06", 4, props);
    const result = resolveSnowFreezeGain(plan.state, "Actor.Target", 5, { recoveryChoice: "pdr" });
    assert.equal(result.burstFormula, "6d4");
    assert.deepEqual(result.recovery, { resource: "pdr", amount: 1, pdr: 1 });
  });

  it("Abaixo de Zero nível 3 solicita escolha entre 2 PDV e 1 PDR por aplicação", () => {
    const plan = buildSnowBreathingPlan("neve_06", 3, props);
    const unresolved = resolveSnowFreezeGain(plan.state, "Actor.Target", 1);
    assert.equal(unresolved.recovery.resource, "choice");
    assert.deepEqual(resolveSnowFreezeGain(plan.state, "Actor.Target", 1, { recoveryChoice: "pdv" }).recovery, { resource: "pdv", amount: 2, pdv: 2 });
  });

  it("Coração de Gelo eleva somente o nível efetivo e respeita o teto 4", () => {
    const active = buildSnowBreathingPlan("neve_04", 2, props).state;
    assert.equal(snowEffectiveBreathLevel(2, active), 3);
    assert.equal(snowEffectiveBreathLevel(4, active), 4);
    assert.equal(snowEffectiveBreathLevel(2, {}), 2);
  });

  it("restrição produz flag transferível ao alvo", () => {
    const frozen = addSnowFreeze({}, "Actor.Target", 5).state;
    const spent = spendFreezeForRestriction(frozen, "Actor.Target", 4);
    assert.deepEqual(snowRestrictionFlag(spent.restriction, "Actor.Snow"), {
      sourceActorUuid: "Actor.Snow", targetUuid: "Actor.Target", escapeDc: 12,
      escapeAction: "ataque", escapeAttribute: "FOR", breakOnDamage: true,
    });
  });

  it("tick consolida Exaustão e estado em um único patch", () => {
    const plan = buildSnowBreathingPlan("neve_04", 2, props);
    const first = snowTickPatchWithExhaustion(plan.state, 3);
    assert.equal(first.patch["system.props.status_slayer_exaustao"], undefined);
    const second = snowTickPatchWithExhaustion(first.state, 3);
    assert.equal(second.patch["system.props.status_slayer_exaustao"], 4);
  });

  it("fuga da restrição consome Ataque e compara FOR com a CD persistida", () => {
    const flag = { targetUuid: "Actor.Target", escapeDc: 12 };
    assert.equal(resolveSnowRestrictionEscape(flag, 11).escaped, false);
    assert.deepEqual(resolveSnowRestrictionEscape(flag, 12), { ok: true, escaped: true, total: 12, dc: 12, consumesAction: "ataque" });
  });

  it("Canção consome a guarda e resolve Kekkijutsu uma única vez", () => {
    const plan = buildSnowBreathingPlan("neve_07", 4, props, { protectedUuid: "Actor.Ally", allyBreathing: "Água" });
    const resolved = resolveSnowKekkijutsuGuard(plan.state, { enemyUuid: "Actor.Oni" });
    assert.equal(resolved.active, true);
    assert.equal(resolved.damageMultiplier, 0.5);
    assert.equal(resolved.negateEffects, true);
    assert.equal(resolved.freeze, 1);
    assert.equal(resolved.opportunityAttack, true);
    assert.equal(resolveSnowKekkijutsuGuard(resolved.state).active, false);
  });

  it("sinergia da Avalanche exige alvo marcado e furtividade da Nevasca", () => {
    const plan = buildSnowBreathingPlan("neve_05", 2, props, { targetUuid: "Actor.Oni" });
    assert.equal(resolveSnowAvalancheSynergy(plan.state, { targetUuid: "Actor.Oni", allyStealthed: false }).applies, false);
    assert.deepEqual(resolveSnowAvalancheSynergy(plan.state, { targetUuid: "Actor.Oni", allyStealthed: true }), {
      applies: true, formula: "1d4", movementTurns: 2,
    });
  });
});
