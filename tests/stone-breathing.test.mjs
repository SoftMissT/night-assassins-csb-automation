import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { STONE_FORMS, stoneFormById } from "../scripts/stone-breathing-data.mjs";
import {
  buildStoneBreathingPlan,
  clearStoneBreathingState,
  consumeStoneCounterAttack,
  consumeStonePending,
  parseStoneBreathingState,
  tickStoneBreathing,
  stoneReflectionPenalty,
} from "../scripts/stone-breathing-service.mjs";

describe("Respiração da Pedra", () => {
  it("publica as cinco Formas oficiais com ações corretas", () => {
    assert.equal(STONE_FORMS.length, 5);
    assert.equal(stoneFormById("pedra_01").action, "unica");
    assert.equal(stoneFormById("pedra_03").action, "reacao");
    assert.deepEqual(stoneFormById("pedra_04").actions, ["ataque", "especial"]);
  });

  it("Serpentino escala Ferida e calcula CD pelo dano originário", () => {
    assert.deepEqual(STONE_FORMS[0].levels.map((entry) => entry.damage), ["1d4", "1d6", "2d4", "2d4 + @for"]);
    const plan = buildStoneBreathingPlan("pedra_01", 4, { for_display: 5 }, { originDamage: 27 });
    assert.equal(plan.cost, 3);
    assert.equal(plan.state.serpentine.saveDc, 17);
    assert.equal(plan.state.serpentine.noHitRoll, true);
    assert.deepEqual(plan.state.serpentine.damageComponents, [
      { formula: "2d4", types: ["ferida"] },
      { formula: "@for", types: ["concussao"] },
    ]);
  });

  it("Quebra Superior escala dano e Sangramento por dois turnos", () => {
    const plans = [1, 2, 3, 4].map((level) => buildStoneBreathingPlan("pedra_02", level, {}));
    assert.deepEqual(plans.map((plan) => plan.selected.damage), ["3d10", "3d10", "4d10", "5d10"]);
    assert.deepEqual(plans.map((plan) => plan.state.bleeding.amount), [4, 5, 6, 7]);
    assert.ok(plans.every((plan) => plan.state.bleeding.turns === 2));
  });

  it("Reflexão escolhe FOR no corpo a corpo e DEX à distância", () => {
    const melee = buildStoneBreathingPlan("pedra_03", 3, { for_display: 5, dex_display: 2 }, { weaponRange: "corpo" });
    const ranged = buildStoneBreathingPlan("pedra_03", 4, { for_display: 5, dex_display: 2 }, { weaponRange: "distancia" });
    assert.equal(melee.state.reflection.attackPenalty, 7);
    assert.equal(melee.state.reflection.blockTurns, 2);
    assert.equal(ranged.state.reflection.attackPenalty, 4);
    assert.equal(ranged.state.reflection.counterAttack, true);
    assert.equal(stoneReflectionPenalty(ranged.state), -4);
    const consumed = consumeStoneCounterAttack(ranged.state);
    assert.equal(consumed.available, true);
    assert.equal(consumed.state.reflection.counterAttack, false);
  });

  it("Reflexão preserva a duração de Bloqueio até completar dois turnos", () => {
    const plan = buildStoneBreathingPlan("pedra_03", 4, { for_display: 5 }, { weaponRange: "corpo" });
    assert.equal(tickStoneBreathing(plan.state).state.reflection.blockTurns, 1);
    assert.equal(tickStoneBreathing(tickStoneBreathing(plan.state).state).state.reflection, undefined);
  });

  it("Riólito só existe nos níveis 3 e 4 e cria dois danos", () => {
    assert.equal(buildStoneBreathingPlan("pedra_04", 2, {}).ok, false);
    const plan = buildStoneBreathingPlan("pedra_04", 4, {});
    assert.deepEqual(plan.actions, ["ataque", "especial"]);
    assert.equal(plan.state.pendingDamage.formula, "8d6");
    assert.equal(plan.state.pendingDamage.uses, 2);
    assert.equal(consumeStonePending(plan.state, { damage: true }).pendingDamage.uses, 1);
  });

  it("Resiliência dura três turnos e só pode ser usada uma vez no combate", () => {
    const plan = buildStoneBreathingPlan("pedra_05", 1, {});
    assert.equal(plan.state.resilience.multiplier, 0.5);
    assert.deepEqual(plan.state.resilience.resistances, ["concussao", "cortante", "perfurante"]);
    assert.equal(buildStoneBreathingPlan("pedra_05", 1, { resp_pedra_estado: JSON.stringify(plan.state) }).ok, false);
    const tick = tickStoneBreathing(plan.state);
    assert.equal(tick.state.resilience.turns, 2);
    const cleared = clearStoneBreathingState(tick.state)["system.props.resp_pedra_estado"];
    assert.equal(parseStoneBreathingState(cleared).resilienceUsed, undefined);
  });

  it("reativação pela Marca dura até o final do combate", () => {
    const previous = { resilienceUsed: true };
    const plan = buildStoneBreathingPlan("pedra_05", 4, { resp_pedra_estado: JSON.stringify(previous) }, { markReactivation: true });
    assert.equal(plan.ok, true);
    assert.equal(plan.state.resilience.untilCombatEnd, true);
    assert.equal(plan.state.resilience.turns, null);
  });
});
