import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MIST_FORMS, mistFormById } from "../scripts/mist-breathing-data.mjs";
import {
  buildMistBreathingPlan, consumeMistPending, grantMistPattern, mistPatternCount,
  parseMistBreathingState, resolveEightLayersResult, resolveMistFormula, resolveMistReduction, tickMistBreathing,
} from "../scripts/mist-breathing-service.mjs";

const props = { sab_display: 4, fdv_display: 3, dex_display: 5, for_display: 2, car_display: 2, nvl_num: 8 };

describe("Respiração da Névoa", () => {
  it("cataloga oito Formas com níveis, custos e ações oficiais", () => {
    assert.equal(MIST_FORMS.length, 8);
    assert.deepEqual(MIST_FORMS.map((form) => form.order), [1,2,3,4,5,6,7,8]);
    assert.equal(mistFormById("nevoa_02").levels[3].damage, "10d6");
    assert.equal(mistFormById("nevoa_05").levels[0], null);
    assert.equal(mistFormById("nevoa_08").levels[3].criticalImmunity, true);
  });

  it("Céu Suspenso prepara bônus de SAB escalável para um único contato", () => {
    const plan = buildMistBreathingPlan("nevoa_01", 4, props);
    const state = parseMistBreathingState(plan.patch["system.props.resp_nevoa_estado"]);
    assert.equal(plan.action, "especial");
    assert.equal(plan.cost, 2);
    assert.equal(state.pendingDamage.formula, "4 + 3");
    assert.equal(state.pendingDamage.contactOnce, true);
    assert.equal(consumeMistPending(state, { damage: true }).pendingDamage, undefined);
  });

  it("Oito Camadas prepara cinco acertos +2 e troca dano conforme os acertos", () => {
    const plan = buildMistBreathingPlan("nevoa_02", 3, props);
    assert.equal(plan.state.nextHit.count, 5);
    assert.equal(plan.state.nextHit.bonus, 2);
    const two = resolveEightLayersResult(plan.state, 2);
    assert.deepEqual({ mode: two.mode, weaponRolls: two.weaponRolls }, { mode: "weapon-per-hit", weaponRolls: 2 });
    const three = resolveEightLayersResult(plan.state, 3);
    assert.deepEqual({ mode: three.mode, formula: three.formula }, { mode: "fixed", formula: "8d6" });
    assert.equal(mistPatternCount(resolveEightLayersResult(plan.state, 5).state), 1);
  });

  it("Expansão escala com nível de Slayer e SAB apenas nos níveis 3–4", () => {
    assert.equal(buildMistBreathingPlan("nevoa_03", 2, props).state.incomingReduction.formula, "1d6 + 8");
    assert.equal(buildMistBreathingPlan("nevoa_03", 3, props).state.incomingReduction.formula, "1d6 + 8 + 4");
    assert.deepEqual(resolveMistReduction(20, 7), { incoming: 20, reduction: 7, negated: false, finalDamage: 13 });
    assert.equal(resolveMistReduction(10, 11).negated, true);
  });

  it("Corte de Advecção exige Vantagem e pode suprimir Resistência", () => {
    assert.equal(buildMistBreathingPlan("nevoa_04", 1, props).noCost, true);
    const plan = buildMistBreathingPlan("nevoa_04", 4, props, { advantageAttack: true, suppressResistance: true, suppressAttribute: 5 });
    assert.equal(plan.cost, 4);
    assert.equal(plan.state.pendingDamage.formula, "6d6");
    assert.equal(plan.state.pendingDamage.replaceWeaponDamage, true);
    assert.equal(plan.state.pendingDamage.suppressResistanceTurns, 5);
  });

  it("Mar de Nuvens exige nível 2, dá Vantagem e gera Reflexão pelo dobro do custo", () => {
    assert.equal(buildMistBreathingPlan("nevoa_05", 1, props).ok, false);
    const plan = buildMistBreathingPlan("nevoa_05", 3, props, { doubleCost: true });
    assert.equal(plan.cost, 4);
    assert.equal(plan.state.incomingHalfOnFailedSave.saveDc, "10 + 4");
    assert.equal(plan.state.nextHit.advantage, true);
    assert.equal(plan.state.patterns.reflection, true);
  });

  it("Névoa sob o Luar cobra cada ataque extra e ativa Colapso com três Padrões", () => {
    let state = {};
    for (const pattern of ["cyclone", "stigma", "reflection"]) state = grantMistPattern(state, pattern);
    const plan = buildMistBreathingPlan("nevoa_06", 4, { ...props, resp_nevoa_estado: state }, { dexCheckPassed: true, extraAttacks: 3 });
    assert.equal(plan.cost, 5);
    assert.equal(plan.state.nextHit.count, 4);
    assert.equal(plan.state.nextHit.bonus, 4);
    assert.equal(plan.state.nextHit.criticalBonus, 3);
    assert.equal(plan.state.collapse, true);
    assert.equal(plan.state.pendingDamage.formula, "@sab");
  });

  it("Neblina dura o maior entre 3 turnos e CAR e aplica o bônus do nível", () => {
    const plan = buildMistBreathingPlan("nevoa_07", 4, { ...props, car_display: 5 }, { opposedPassed: true });
    assert.equal(plan.state.fog.turns, 5);
    assert.equal(plan.state.fog.bonus, 4);
    const tick = tickMistBreathing(plan.patch["system.props.resp_nevoa_estado"]);
    assert.equal(parseMistBreathingState(tick["system.props.resp_nevoa_estado"]).fog.turns, 4);
  });

  it("Ofuscamento aplica cinco turnos, imunidade a Exaustão e proteção crítica do nível 4", () => {
    const plan = buildMistBreathingPlan("nevoa_08", 4, props, { allyUuid: "Actor.Ally" });
    assert.equal(plan.state.dazzle.turns, 5);
    assert.equal(plan.state.dazzle.hitPenalty, -2);
    assert.equal(plan.state.dazzle.hitBonus, 2);
    assert.equal(plan.state.dazzle.exhaustionImmune, true);
    assert.equal(plan.state.dazzle.criticalImmunity, true);
    assert.equal(plan.state.dazzle.allyUuid, "Actor.Ally");
  });

  it("resolve placeholders oficiais sem usar eval", () => {
    assert.equal(resolveMistFormula("1d6 + @level + @sab", props), "1d6 + 8 + 4");
  });
});
