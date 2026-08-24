import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FLAME_FORMS, flameFormById, flameWeaponTier } from "../scripts/flame-breathing-data.mjs";
import { addFlameEnemyHeat, buildFlameBreathingPlan, buildFlameInterception, clearFlameBreathingState, consumeFlameInterception, consumeFlamePending, flameWeaponHeat, FLAME_SYNERGY_BREATHINGS, parseFlameBreathingState, resolveFlameRengokuAllies, synchronizeFlameWeapon, tickFlameBreathing } from "../scripts/flame-breathing-service.mjs";

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
    assert.equal(flameFormById("chamas_05")?.name, "Go no Kata Enko");
    assert.equal(flameFormById("chamas_05")?.ptName, "Tigre Ardente");
    assert.equal(flameFormById("inexistente"), null);
  });

  it("mantém Esquentar separado por arma sincronizada", () => {
    let state = synchronizeFlameWeapon({}, { id: "katana", name: "Katana" }, 12);
    state = synchronizeFlameWeapon(state, { id: "arco", name: "Arco" }, 3);
    assert.equal(flameWeaponHeat(state, "katana"), 12);
    assert.equal(flameWeaponHeat(state, "arco"), 3);
    state = synchronizeFlameWeapon(state, { id: "katana", name: "Katana" }, 0);
    assert.equal(state.weaponHeat, 12);
    assert.equal(state.synchronizedWeapon.id, "katana");
  });

  it("a Forma soma Esquentar somente na arma sincronizada e o fim do combate limpa todas", () => {
    let state = synchronizeFlameWeapon({}, { id: "katana", name: "Katana" }, 9);
    state = synchronizeFlameWeapon(state, { id: "arco", name: "Arco" }, 4);
    const plan = buildFlameBreathingPlan("chamas_03", 1, { resp_chamas_estado: JSON.stringify(state) }, {
      synchronizedWeapon: { id: "katana", name: "Katana" },
    });
    assert.equal(flameWeaponHeat(plan.state, "katana"), 12);
    assert.equal(flameWeaponHeat(plan.state, "arco"), 4);
    const cleared = parseFlameBreathingState(JSON.parse(clearFlameBreathingState()["system.props.resp_chamas_estado"]));
    assert.deepEqual(cleared.weaponHeatById, {});
    assert.equal(cleared.weaponHeat, 0);
  });
});

describe("Respiração das Chamas — combos e regras da missão", () => {
  it("COMBO OBRIGATÓRIO 1ª N2 + 2ª N2: rider aplicado à 2ª e ataque adicional preservado", () => {
    const plan1 = buildFlameBreathingPlan("chamas_02", 2, {});
    const plan2 = buildFlameBreathingPlan("chamas_03", 2, { resp_chamas_estado: JSON.stringify(plan1.state) });

    // Custos somados corretamente: 3 PDR + 3 PDR
    assert.equal(plan1.cost, 3);
    assert.equal(plan2.cost, 3);
    // Fogo Fátuo acumulado: +2 (1ª) + +3 (2ª) = 5
    assert.equal(plan2.state.weaponHeat, 5);
    // Rider da 1ª acompanha a 2ª em vez de ser sobrescrito
    assert.equal(plan2.state.pendingDamage.comboRider.formula, "2d4");
    assert.equal(plan2.state.pendingDamage.critical, true);
    // Ataque padrão adicional da 1ª permanece disponível após o combo
    assert.equal(plan2.state.flameOne.extraAttackAvailable, true);

    // 2ª acerta e causa dano → rider consumido; ataque adicional rearmado
    const afterHit = consumeFlamePending(plan2.state, { hit: true });
    assert.equal(afterHit.nextHit, undefined);
    const afterDamage = consumeFlamePending(afterHit, { damage: true });
    assert.equal(afterDamage.nextHit.source, "chamas_02");
    assert.equal(afterDamage.nextHit.count, 1);
    assert.equal(afterDamage.flameOne.extraAttackAvailable, false);
    assert.equal(afterDamage.flameOne.extraAttackConsumed, true);
    // N2: ataque adicional sem dano bônus próprio
    assert.equal(afterDamage.pendingDamage, undefined);
  });

  it("combo 1ª N3 + 2ª: ataque adicional recebe +1d4 com rolagem própria", () => {
    const plan1 = buildFlameBreathingPlan("chamas_02", 3, {});
    const plan2 = buildFlameBreathingPlan("chamas_05", 1, { resp_chamas_estado: JSON.stringify(plan1.state) });
    assert.equal(plan2.state.pendingDamage.comboRider.formula, "2d4");
    assert.equal(plan2.state.pendingDamage.formula, "4d10");

    const afterHit = consumeFlamePending(plan2.state, { hit: true });
    const afterDamage = consumeFlamePending(afterHit, { damage: true });
    assert.equal(afterDamage.pendingDamage.formula, "1d4");
    assert.equal(afterDamage.pendingDamage.uses, 1);
    // Fogo Fátuo do combo: +2 + +3 = 5; Tigre concede Vantagem só com 30+
    assert.equal(afterDamage.nextHit.source, "chamas_02");
  });

  it("pendentes da 1ª expiram no fim do turno", () => {
    const plan1 = buildFlameBreathingPlan("chamas_02", 4, {});
    const tick = tickFlameBreathing(plan1.state);
    assert.equal(tick.state.flameOne, undefined);
    assert.equal(tick.state.pendingDamage, undefined);
    assert.equal(tick.state.nextHit, undefined);
  });

  it("Rengoku registra aliados sinérgicos no plano", () => {
    const allies = [{ uuid: "Actor.Amor" }, { uuid: "Actor.Vento" }];
    const props = { resp_chamas_estado: JSON.stringify({ weaponHeat: 12 }), car_display: 5 };
    const plan = buildFlameBreathingPlan("chamas_09", 4, { ...props }, { rengokuAllies: allies });
    assert.equal(plan.state.pendingDamage.rengokuAllies, 2);
    assert.deepEqual(plan.state.rengokuAllies, ["Actor.Amor", "Actor.Vento"]);
    assert.equal(plan.cost, 5);
  });

  it("resolveFlameRengokuAllies filtra respiração compatível, PDR e o próprio usuário", () => {
    const candidates = [
      { uuid: "Actor.Amor", name: "Amor", respiracoes: ["Amor"], pdrAvailable: 6 },
      { uuid: "Actor.Agua", name: "Água", respiracoes: ["Água"], pdrAvailable: 9 },
      { uuid: "Actor.SolPobre", name: "Sol sem PDR", respiracoes: ["Sol"], pdrAvailable: 1 },
      { uuid: "Actor.Magma", name: "Magma", respiracoes: ["Magma", "Vento"], pdrAvailable: 2 },
      { uuid: "Actor.Eu", name: "Eu", respiracoes: ["Chamas"], pdrAvailable: 30 },
    ];
    const eligible = resolveFlameRengokuAllies(candidates, "Actor.Eu");
    assert.deepEqual(eligible.map((ally) => ally.uuid), ["Actor.Amor", "Actor.Magma"]);
    assert.ok(FLAME_SYNERGY_BREATHINGS.includes("yogan"));
  });

  it("Brasas são independentes por alvo/atacante (mapa por UUID)", () => {
    const enemyA = addFlameEnemyHeat({}, "Actor.Cacador1", 8);
    const enemyB = addFlameEnemyHeat({}, "Actor.Cacador1", 3);
    const otherUser = addFlameEnemyHeat({}, "Actor.Cacador2", 53);
    assert.deepEqual(enemyA.thresholds, [5]);
    assert.deepEqual(enemyB.thresholds, []);
    assert.deepEqual(otherUser.thresholds, [5, 10, 20, 30, 40, 50]);
    assert.equal(otherUser.state["Actor.Cacador2"].heat, 53);
  });

  it("Tigre Ardente: rolagem única, vantagem com 30+ e Exaustão N4 acima de 30 de dano", () => {
    const low = buildFlameBreathingPlan("chamas_05", 1, {});
    assert.equal(low.state.nextHit.count, 1);
    assert.equal(low.state.nextHit.advantage, false);
    assert.equal(low.state.activeForm.enemyHeat, 3);
    assert.equal(low.state.pendingDamage.exhaustionOverDamage, 0);

    const high = buildFlameBreathingPlan("chamas_05", 4, { resp_chamas_estado: JSON.stringify({ weaponHeat: 30 }) });
    assert.equal(high.state.weaponHeat, 33);
    assert.equal(high.state.nextHit.advantage, true);
    assert.equal(high.state.pendingDamage.exhaustionOverDamage, 30);
    assert.equal(high.state.pendingDamage.formula, "6d10");
  });

  it("Tormenta N4 escala por Brasas de cada alvo (dado configurado por inimigo)", () => {
    assert.equal(buildFlameBreathingPlan("chamas_06", 1, {}).ok, false);
    const n3 = buildFlameBreathingPlan("chamas_06", 3, {});
    assert.equal(n3.state.pendingDamage.damagePerEnemyHeat, "");
    const n4 = buildFlameBreathingPlan("chamas_06", 4, {});
    assert.equal(n4.state.pendingDamage.damagePerEnemyHeat, "1d8");
    assert.equal(n4.cost, 8);
  });

  it("Cauterizar exige 5 de Esquentar mas não os consome", () => {
    const plan = buildFlameBreathingPlan("chamas_07", 4, { resp_chamas_estado: JSON.stringify({ weaponHeat: 7 }) });
    assert.equal(plan.ok, true);
    assert.equal(plan.state.weaponHeat, 7);
    assert.equal(plan.state.healing.removeBleeding, true);
    assert.equal(plan.cost, 4);
  });
});

describe("Chamas — fila de efeitos pendentes (combos encadeados)", () => {
  it("D · encadeado 1ª N3 → 2ª → 5ª → ataque adicional preserva o +1d4", () => {
    const plan1 = buildFlameBreathingPlan("chamas_02", 3, {});
    const state2 = buildFlameBreathingPlan("chamas_03", 2, { resp_chamas_estado: JSON.stringify(plan1.state) }).state;
    // 2ª acerta e consome o rider principal
    const after2 = consumeFlamePending(consumeFlamePending(state2, { hit: true }), { damage: true });
    assert.equal(after2.pendingDamage.formula, "1d4"); // ataque adicional armado

    // jogador usa a 5ª ANTES do ataque adicional — não pode apagar o +1d4
    const state3 = buildFlameBreathingPlan("chamas_05", 2, { resp_chamas_estado: JSON.stringify(after2) }).state;
    assert.equal(state3.pendingDamage.source, "chamas_05");
    assert.ok(!state3.pendingDamage.comboRider); // rider armado não vaza como combo

    // 5ª resolve → ataque adicional é rearmed com o mesmo bônus
    const after3 = consumeFlamePending(consumeFlamePending(state3, { hit: true }), { damage: true });
    assert.equal(after3.pendingDamage.source, "chamas_02");
    assert.equal(after3.pendingDamage.extraAttackArmed, true);
    assert.equal(after3.pendingDamage.formula, "1d4");

    // ataque adicional finalmente resolvido
    const afterExtra = consumeFlamePending(consumeFlamePending(after3, { hit: true }), { damage: true });
    const extraEffect = afterExtra.pendingEffects.find((effect) => effect.id === "unknown_fire_extra_attack");
    assert.equal(extraEffect.used, true);
  });

  it("F · consumir o rider principal não apaga extra attack, ignição nem block", () => {
    let state = buildFlameBreathingPlan("chamas_08", 3, {}).state; // Ignição
    const plan1 = buildFlameBreathingPlan("chamas_02", 3, { resp_chamas_estado: JSON.stringify(state) });
    state = plan1.state;
    assert.ok(state.ignition);
    const afterHit = consumeFlamePending(state, { hit: true });
    const afterDamage = consumeFlamePending(afterHit, { damage: true });
    const main = afterDamage.pendingEffects.find((effect) => effect.id === "unknown_fire_main");
    const extra = afterDamage.pendingEffects.find((effect) => effect.id === "unknown_fire_extra_attack");
    assert.equal(main.consumed, true);        // rider principal consumido
    assert.notEqual(extra.used, true);        // ...sem consumir o ataque adicional
    assert.equal(extra.damageBonus, "1d4");   // bônus do adicional intacto na fila
    assert.ok(afterDamage.ignition);          // Ignição persistente intacta
    // Resolvendo o segundo golpe da 1ª Forma → agora sim o adicional se consome
    const afterExtra = consumeFlamePending(afterDamage, { damage: true });
    assert.equal(afterExtra.pendingEffects.find((effect) => effect.id === "unknown_fire_extra_attack").used, true);
    assert.ok(afterExtra.ignition);
  });

  it("G · estado legado (flameOne/pendingDamage sem fila) é normalizado sem quebrar", () => {
    const legacy = {
      version: 1,
      weaponHeat: 15,
      pendingDamage: { source: "chamas_02", formula: "2d4", uses: 1, technique: true },
      flameOne: { level: 3, extraAttackDamage: "1d4", extraAttackAvailable: true },
    };
    const plan = buildFlameBreathingPlan("chamas_03", 2, { resp_chamas_estado: JSON.stringify(legacy) });
    assert.equal(plan.ok, true);
    assert.equal(plan.state.pendingDamage.comboRider.formula, "2d4");
    const queue = plan.state.pendingEffects;
    assert.ok(queue.some((effect) => effect.id === "unknown_fire_main" && effect.formula === "2d4"));
    assert.ok(queue.some((effect) => effect.id === "unknown_fire_extra_attack" && effect.damageBonus === "1d4"));
    const afterCombo = consumeFlamePending(consumeFlamePending(plan.state, { hit: true }), { damage: true });
    assert.equal(afterCombo.pendingDamage.formula, "1d4");
  });

  it("H · Ignição + 1ª + 2ª coexistem sem sobrescrita", () => {
    const ignitionState = buildFlameBreathingPlan("chamas_08", 4, {}).state;
    assert.equal(ignitionState.ignition.damageBonus, 8);
    const plan1 = buildFlameBreathingPlan("chamas_02", 2, { resp_chamas_estado: JSON.stringify(ignitionState) });
    const plan2 = buildFlameBreathingPlan("chamas_03", 2, { resp_chamas_estado: JSON.stringify(plan1.state) });
    assert.ok(plan2.state.ignition);
    assert.equal(plan2.state.ignition.damageBonus, 8);
    assert.equal(plan2.state.pendingDamage.critical, true);
    assert.equal(plan2.state.pendingDamage.comboRider.formula, "2d4");
    const resolved = consumeFlamePending(consumeFlamePending(plan2.state, { hit: true }), { damage: true });
    assert.ok(resolved.ignition);
    assert.equal(resolved.flameOne.extraAttackAvailable, false);
    assert.equal(resolved.flameOne.extraAttackConsumed, true);
  });

  it("C · 1ª N4: ataque principal e adicional recebem +2d4 cada", () => {
    const plan1 = buildFlameBreathingPlan("chamas_02", 4, {});
    assert.deepEqual(plan1.state.pendingDamage.formulas, ["2d4", "2d4"]);
    const plan2 = buildFlameBreathingPlan("chamas_03", 1, { resp_chamas_estado: JSON.stringify(plan1.state) });
    assert.equal(plan2.state.pendingDamage.comboRider.formula, "2d4");
    const afterCombo = consumeFlamePending(consumeFlamePending(plan2.state, { hit: true }), { damage: true });
    assert.equal(afterCombo.pendingDamage.formula, "2d4");
  });

  it("E · nada da fila sobrevive ao fim do turno", () => {
    const plan1 = buildFlameBreathingPlan("chamas_02", 3, {});
    const tick = tickFlameBreathing({ ...plan1.state, pendingEffects: plan1.state.pendingEffects });
    assert.equal(tick.state.pendingEffects, undefined);
    assert.equal(tick.state.flameOne, undefined);
    assert.equal(tick.state.nextHit, undefined);
    assert.equal(tick.state.pendingDamage, undefined);
  });

  it("DECISÃO DO OPERADOR · 1ª + Tormenta: rider integra a técnica (rolagem única), aplicado por alvo", () => {
    const plan1 = buildFlameBreathingPlan("chamas_02", 2, {});
    const stormPlan = buildFlameBreathingPlan("chamas_06", 3, { resp_chamas_estado: JSON.stringify(plan1.state) });
    // Rider acompanha a Tormenta como parte da técnica (sem rolagem separada por alvo)
    assert.equal(stormPlan.state.pendingDamage.comboRider.formula, "2d4");
    assert.equal(stormPlan.state.pendingDamage.areaMeters, 10);
    assert.equal(stormPlan.state.pendingDamage.halfOnSave, true);
    // Fila marca o rider como pendente de consumo pela resolução única da técnica
    assert.ok(stormPlan.state.pendingEffects.find((effect) => effect.id === "unknown_fire_main" && !effect.consumed));
  });
});
