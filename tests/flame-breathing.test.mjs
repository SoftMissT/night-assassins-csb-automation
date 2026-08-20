import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FLAME_FORMS, flameFormById, flameWeaponTier } from "../scripts/flame-breathing-data.mjs";
import { addFlameEnemyHeat, buildFlameBreathingPlan, buildFlameInterception, consumeFlameInterception, consumeFlamePending, parseFlameBreathingState, tickFlameBreathing } from "../scripts/flame-breathing-service.mjs";

describe("Respiração das Chamas", () => {
  it("possui uma passiva e oito formas ativas", () => {
    assert.equal(FLAME_FORMS.length, 9);
    assert.equal(FLAME_FORMS.filter((form) => form.passive).length, 1);
    assert.equal(FLAME_FORMS.filter((form) => !form.passive).length, 8);
  });

  it("aplica os patamares substitutivos de Fogo Fátuo", () => {
    assert.deepEqual(flameWeaponTier(0), { heat: 0, hit: 0, weaponDamage: 0, techniqueDie: "", multiplier: 1, selfDamage: 0 });
    assert.equal(flameWeaponTier(10).weaponDamage, 2);
    assert.equal(flameWeaponTier(30).techniqueDie, "1d6");
    assert.equal(flameWeaponTier(50).hit, 3);
    assert.equal(flameWeaponTier(60).multiplier, 1.5);
    assert.equal(flameWeaponTier(90).heat, 60);
  });

  it("Fogo Desconhecido prepara dano e ataque adicional", () => {
    const plan = buildFlameBreathingPlan("chamas_02", 4, {});
    assert.equal(plan.ok, true);
    assert.equal(plan.action, "especial");
    assert.equal(plan.cost, 4);
    assert.equal(plan.state.weaponHeat, 2);
    assert.equal(plan.state.pendingDamage.formula, "2d4");
    assert.deepEqual(plan.state.pendingDamage.formulas, ["2d4", "2d4"]);
    assert.equal(plan.state.nextHit.count, 2);
    assert.equal(plan.state.flameOne.extraAttackDamage, "2d4");
  });

  it("Céu em Chamas recebe bônus do calor atual e crítico", () => {
    const props = { resp_chamas_estado: JSON.stringify({ weaponHeat: 10 }) };
    const plan = buildFlameBreathingPlan("chamas_03", 4, props);
    assert.equal(plan.state.weaponHeat, 13);
    assert.equal(plan.state.nextHit.bonus, 4);
    assert.equal(plan.state.pendingDamage.critical, true);
    assert.equal(plan.state.pendingDamage.blockPenalty, -2);
  });

  it("bloqueia formas indisponíveis e requisito de Cauterizar", () => {
    assert.equal(buildFlameBreathingPlan("chamas_06", 2, {}).ok, false);
    assert.match(buildFlameBreathingPlan("chamas_07", 1, {}).reason, /5 Pontos/);
    assert.equal(buildFlameBreathingPlan("chamas_07", 1, { resp_chamas_estado: '{"weaponHeat":5}' }).ok, true);
  });

  it("Rengoku calcula CD com CAR final", () => {
    const plan = buildFlameBreathingPlan("chamas_09", 3, { car_display: 4 });
    assert.equal(plan.state.nextHit.bonus, 4);
    assert.equal(plan.state.pendingDamage.saveDc, 16);
    assert.equal(plan.state.activeForm.enemyHeat, 4);
  });

  it("Brasas cruzam cada limiar somente uma vez", () => {
    const first = addFlameEnemyHeat({}, "slayer", 12);
    assert.deepEqual(first.thresholds, [5, 10]);
    const second = addFlameEnemyHeat(first.state, "slayer", 10);
    assert.deepEqual(second.thresholds, [20]);
    const third = addFlameEnemyHeat(second.state, "slayer", 0);
    assert.deepEqual(third.thresholds, []);
  });

  it("consome modificadores separadamente", () => {
    const state = parseFlameBreathingState({ nextHit: { bonus: 2 }, pendingDamage: { formula: "4d10", uses: 1 } });
    const afterHit = consumeFlamePending(state, { hit: true });
    assert.equal(afterHit.nextHit, undefined);
    assert.ok(afterHit.pendingDamage);
    assert.equal(consumeFlamePending(afterHit, { damage: true }).pendingDamage, undefined);
  });

  it("avança a fila de dano do ataque adicional", () => {
    const state = buildFlameBreathingPlan("chamas_02", 3, {}).state;
    const next = consumeFlamePending(state, { damage: true });
    assert.equal(next.pendingDamage.formula, "1d4");
    assert.equal(next.pendingDamage.uses, 1);
  });

  it("Ignição e Fogo Fátuo 60 causam dano por turno", () => {
    const tick = tickFlameBreathing({ weaponHeat: 60, ignition: { turns: 1, damageBonus: 8, selfDamage: 5 } });
    assert.deepEqual(tick.events.map((event) => event.amount), [5, 2]);
    assert.equal(tick.state.ignition, undefined);
  });

  it("Ondulação prepara e consome interceptação para outro aliado", () => {
    const plan = buildFlameBreathingPlan("chamas_04", 4, { resp_chamas_estado: JSON.stringify({ weaponHeat: 30 }) });
    const prepared = buildFlameInterception(plan.state, { interceptorUuid: "Actor.Fire", protectedUuid: "Actor.Ally" });
    assert.equal(prepared.ok, true);
    assert.equal(consumeFlameInterception(prepared.flag, "Actor.Ally").interceptorUuid, "Actor.Fire");
    assert.equal(consumeFlameInterception(prepared.flag, "Actor.Other").intercepted, false);
    assert.equal(buildFlameInterception(plan.state, { interceptorUuid: "Actor.Fire", protectedUuid: "Actor.Fire" }).ok, false);
  });

  it("expõe as formas pelo ID canônico", () => {
    assert.equal(flameFormById("chamas_05")?.name, "Tigre Ardente");
    assert.equal(flameFormById("inexistente"), null);
  });
});
