import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { METAL_FORMS, METAL_HAMMER_PASSIVE } from "../scripts/metal-breathing-data.mjs";
import {
  buildMetalBreathingPlan,
  buildMetalHammerFollowUp,
  canApplyMetalChain,
  consumeMetalHammerPending,
  consumeMetalSteelDefense,
  parseMetalBreathingState,
  registerMetalBattleHit,
  registerMetalChainApplication,
  resolveMetalCriticalFailureOpportunity,
  resolveMetalIncomingAttackDefense,
  resolveMetalChainReroll,
  tickMetalBreathing,
  validateMetalMagnetismTarget,
} from "../scripts/metal-breathing-service.mjs";

describe("Respiração do Metal", () => {
  it("publica cinco formas oficiais e Martelo desde o nível 1", () => {
    assert.equal(METAL_FORMS.length, 5);
    assert.deepEqual(METAL_FORMS.map((form) => form.action), ["unica", "especial", "especial", "completa", "ataque"]);
    assert.equal(METAL_HAMMER_PASSIVE.minimumLevel, 1);
  });

  it("Metalizado arredonda metade da VIT para cima e impede sobreposição", () => {
    const plan = buildMetalBreathingPlan("metal_01", 1, { vit_display: 5 });
    assert.equal(plan.state.metalized.blockBonus, 3);
    assert.equal(plan.state.metalized.turns, 2);
    assert.equal(buildMetalBreathingPlan("metal_01", 1, { resp_metal_estado: JSON.stringify(plan.state) }).ok, false);
    assert.equal(buildMetalBreathingPlan("metal_01", 4, { vit_display: 5 }).state.metalized.turns, 4);
  });

  it("Inabalável reduz Cortante e Perfurante e prepara oportunidade escalada", () => {
    const plan = buildMetalBreathingPlan("metal_02", 3, {});
    assert.deepEqual(plan.state.unshakable.resistances, ["cortante", "perfurante"]);
    assert.equal(plan.state.unshakable.multiplier, 0.5);
    assert.equal(plan.state.unshakable.enemyCriticalFailureOpportunity.damage, "3d4");
  });

  it("Reação em Cadeia escala bônus, dura FDV e pune rerrolagem falha", () => {
    const plan = buildMetalBreathingPlan("metal_03", 4, { fdv_display: 5 });
    assert.equal(plan.state.chainReaction.damageBonus, 8);
    assert.equal(plan.state.chainReaction.turns, 5);
    assert.equal(resolveMetalChainReroll(plan.state, { originalTotal: 9, rerollHit: false }).exhaustion, 1);
    assert.equal(resolveMetalChainReroll(plan.state, { originalTotal: 10, rerollHit: false }).allowed, false);
  });

  it("Duro como Aço respeita desbloqueio e consome a defesa preparada", () => {
    assert.equal(buildMetalBreathingPlan("metal_04", 1, {}).ok, false);
    assert.equal(buildMetalBreathingPlan("metal_04", 2, {}).state.steelDefense.defenseAdvantage, true);
    const level4 = buildMetalBreathingPlan("metal_04", 4, {});
    const consumed = consumeMetalSteelDefense(level4.state);
    assert.equal(consumed.effect.negateAttack, true);
    assert.equal(consumed.effect.counterAttack, true);
    assert.equal(consumed.state.steelDefense, undefined);
  });

  it("Forjado na Batalha substitui bônus a cada acerto e limita no quarto", () => {
    let state = buildMetalBreathingPlan("metal_06", 2, { vit_display: 4, for_display: 6 }).state;
    assert.equal(state.battleForged.magnetismEligible, true);
    for (let i = 0; i < 5; i += 1) state = registerMetalBattleHit(state).state;
    assert.equal(state.battleForged.hits, 4);
    assert.equal(state.battleForged.forBonus, 2);
    assert.equal(state.battleForged.fdvBonus, 2);
    assert.equal(registerMetalBattleHit({}).changed, false);
  });

  it("Martelo causa metade arredondada para cima ou dano total com sinergia", () => {
    const half = buildMetalHammerFollowUp({ breathingLevel: 1, originalDamage: 15 });
    assert.equal(half.damage, 8);
    assert.equal(half.ignoresResistance, true);
    const total = buildMetalHammerFollowUp({ breathingLevel: 3, originalDamage: 15, synergyBreathing: "Pedra", allySpendsPdr: true });
    assert.equal(total.damage, 15);
    assert.equal(total.allyPdrCost, 1);
  });

  it("consome Martelo uma única vez e preserva um plano executável", () => {
    const first = consumeMetalHammerPending({ metal: { hammerPending: true } }, { breathingLevel: 1, originalDamage: 15 });
    assert.equal(first.ok, true);
    assert.equal(first.consumed, true);
    assert.equal(first.damage, 8);
    assert.equal(first.requiresStandardAttackRoll, true);
    assert.equal(first.state.metal.hammerPending, undefined);
    assert.equal(consumeMetalHammerPending(first.state, { breathingLevel: 1, originalDamage: 15 }).consumed, false);
  });

  it("libera dano do Inabalável só após erro crítico e acerto da oportunidade", () => {
    const state = buildMetalBreathingPlan("metal_02", 3, {}).state;
    assert.equal(resolveMetalCriticalFailureOpportunity(state, { enemyCriticalFailure: false }).eligible, false);
    assert.equal(resolveMetalCriticalFailureOpportunity(state, { enemyCriticalFailure: true, opportunityHit: false }).applyDamage, false);
    const resolved = resolveMetalCriticalFailureOpportunity(state, { enemyCriticalFailure: true, opportunityHit: true });
    assert.deepEqual(resolved, { eligible: true, applyDamage: true, formula: "3d4", type: "concussao" });
  });

  it("limita Reação em Cadeia uma vez por ação, não uma vez por turno", () => {
    const state = buildMetalBreathingPlan("metal_03", 2, { fdv_display: 4 }).state;
    assert.equal(canApplyMetalChain(state, "acao-a"), true);
    const first = registerMetalChainApplication(state, "acao-a");
    assert.equal(first.changed, true);
    assert.equal(canApplyMetalChain(first.state, "acao-a"), false);
    assert.equal(canApplyMetalChain(first.state, "acao-b"), true);
    assert.equal(registerMetalChainApplication(first.state, "acao-b").changed, true);
  });

  it("valida o alvo obrigatório de Magnetismo quando elegível", () => {
    const state = buildMetalBreathingPlan("metal_06", 1, { vit_display: 6 }, { targetUuid: "Actor.metal" }).state;
    assert.deepEqual(validateMetalMagnetismTarget(state, ["Actor.outro"]), { active: true, valid: false, requiredTargetUuid: "Actor.metal" });
    assert.equal(validateMetalMagnetismTarget(state, ["Actor.outro", "Actor.metal"]).valid, true);
    const inactive = buildMetalBreathingPlan("metal_06", 1, { vit_display: 5, for_display: 5 }, { targetUuid: "Actor.metal" }).state;
    assert.equal(validateMetalMagnetismTarget(inactive, []).active, false);
  });

  it("consome Duro como Aço apenas pela resolução de ataque recebida", () => {
    const state = buildMetalBreathingPlan("metal_04", 4, {}).state;
    const resolved = resolveMetalIncomingAttackDefense(state);
    assert.equal(resolved.consumed, true);
    assert.equal(resolved.effect.negateAttack, true);
    assert.equal(resolveMetalIncomingAttackDefense(resolved.state).consumed, false);
  });

  it("tick reduz durações e limpa efeitos encerrados", () => {
    const state = {
      metalized: { turns: 1, blockBonus: 4 },
      unshakable: { turns: 2 },
      battleForged: { turns: 1, forBonus: 2, fdvBonus: 2 },
    };
    const tick = tickMetalBreathing(state);
    assert.equal(tick.state.metalized, undefined);
    assert.equal(tick.state.unshakable.turns, 1);
    assert.equal(tick.state.battleForged, undefined);
    assert.equal(parseMetalBreathingState(tick.patch["system.props.resp_metal_estado"]).unshakable.turns, 1);
  });
});
