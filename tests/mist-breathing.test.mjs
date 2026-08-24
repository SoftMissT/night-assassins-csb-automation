import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MIST_FORMS, mistFormById } from "../scripts/mist-breathing-data.mjs";
import {
  buildMistBreathingPlan, clearMistBreathingState, consumeMistPatternBenefit, consumeMistPending,
  grantMistPattern, mistPatternCount, normalizeMistBreathingState, parseMistBreathingState,
  resolveEightLayersResult, resolveMistFormula, resolveMistReduction, resolveMistStigmaStunOnHit,
  resolveMistReflectionRecoveryAvailable, tickMistBreathing,
} from "../scripts/mist-breathing-service.mjs";

const props = { sab_display: 4, fdv_display: 3, dex_display: 5, for_display: 2, car_display: 2, nvl_num: 8 };

function threePatterns() {
  let state = normalizeMistBreathingState({});
  for (const pattern of ["cyclone", "stigma", "reflection"]) state = grantMistPattern(state, pattern);
  return state;
}

describe("Respiração da Névoa — dados", () => {
  it("cataloga oito Formas com níveis, custos e ações oficiais", () => {
    assert.equal(MIST_FORMS.length, 8);
    assert.deepEqual(MIST_FORMS.map((form) => form.order), [1, 2, 3, 4, 5, 6, 7, 8]);
    assert.equal(mistFormById("nevoa_02").levels[3].damage, "10d6");
    assert.equal(mistFormById("nevoa_05").levels[0], null);
    assert.equal(mistFormById("nevoa_08").levels[3].criticalImmunity, true);
  });
});

describe("Respiração da Névoa — estado dos Padrões (earned x benefitAvailable)", () => {
  it("normaliza estado legado (booleano) sem quebrar Actors existentes", () => {
    const legacy = normalizeMistBreathingState({ patterns: { cyclone: true, stigma: false } });
    assert.deepEqual(legacy.patterns.cyclone, { earned: true, benefitAvailable: true, turnsRemaining: 1 });
    assert.equal(legacy.patterns.stigma.earned, false);
    assert.equal(legacy.patterns.reflection.earned, false);
  });

  it("normaliza estado ausente/corrompido para o schema vazio", () => {
    assert.equal(normalizeMistBreathingState(undefined).patterns.cyclone.earned, false);
    assert.equal(normalizeMistBreathingState("{ isso não é JSON").patterns.cyclone.earned, false);
    assert.equal(normalizeMistBreathingState(null).version, 1);
  });

  it("grantMistPattern marca earned E benefitAvailable; consumeMistPatternBenefit preserva earned", () => {
    let state = grantMistPattern({}, "cyclone");
    assert.deepEqual(state.patterns.cyclone, { earned: true, benefitAvailable: true, turnsRemaining: 1 });
    state = consumeMistPatternBenefit(state, "cyclone");
    assert.equal(state.patterns.cyclone.earned, true, "earned nunca é apagado ao consumir o benefício");
    assert.equal(state.patterns.cyclone.benefitAvailable, false);
    // Consumir de novo (sem benefício disponível) é no-op seguro.
    const again = consumeMistPatternBenefit(state, "cyclone");
    assert.equal(again.patterns.cyclone.earned, true);
  });

  it("mistPatternCount conta earned, não benefitAvailable", () => {
    let state = grantMistPattern({}, "cyclone");
    state = consumeMistPatternBenefit(state, "cyclone");
    assert.equal(mistPatternCount(state), 1, "benefício gasto não reduz a contagem de Padrões conquistados");
  });

  it("os três Padrões coexistem de forma independente (não se sobrescrevem)", () => {
    let state = {};
    state = grantMistPattern(state, "cyclone");
    state = grantMistPattern(state, "stigma");
    state = grantMistPattern(state, "reflection");
    assert.equal(mistPatternCount(state), 3);
    state = consumeMistPatternBenefit(state, "stigma");
    assert.equal(state.patterns.cyclone.benefitAvailable, true);
    assert.equal(state.patterns.stigma.benefitAvailable, false);
    assert.equal(state.patterns.reflection.benefitAvailable, true);
    assert.equal(mistPatternCount(state), 3, "consumir o benefício de um Padrão não afeta os outros dois");
  });
});

describe("1ª Forma — Céu Suspenso", () => {
  it("prepara bônus de SAB escalável para um único contato de ataque padrão", () => {
    const plan = buildMistBreathingPlan("nevoa_01", 4, props);
    assert.equal(plan.action, "especial");
    assert.equal(plan.cost, 2);
    assert.equal(plan.state.pendingDamage.formula, "4 + 3");
    assert.equal(plan.state.pendingDamage.contactOnce, true);
    assert.equal(plan.state.pendingDamage.standardAttackOnly, true);
    assert.equal(plan.state.skySuspended.contactUsesPerAction, 1);
  });

  it("Combo A: uma técnica intermediária não consome o pendente; só o consumo explícito de hit/damage apaga", () => {
    const plan = buildMistBreathingPlan("nevoa_01", 3, props);
    let state = plan.state;
    // Simula: nada consome o pendente até o próximo ataque padrão acertar.
    assert.ok(state.pendingDamage);
    state = consumeMistPending(state, { hit: true }); // erro no ataque padrão não deveria chamar isso — ver teste abaixo
    assert.equal(state.pendingDamage.formula, "4 + 2", "consumir só 'hit' não apaga o dano pendente");
    state = consumeMistPending(state, { damage: true });
    assert.equal(state.pendingDamage, undefined, "acerto bem-sucedido consome dano pendente");
  });
});

describe("2ª Forma — Névoa de Oito Camadas", () => {
  it("prepara 5 rolagens independentes com +2 cada (nunca uma rolagem agregada)", () => {
    const plan = buildMistBreathingPlan("nevoa_02", 3, props);
    assert.equal(plan.cost, 3);
    assert.equal(plan.state.nextHit.count, 5);
    assert.equal(plan.state.nextHit.bonus, 2);
  });

  for (const [hits, expectedMode, expectedRolls] of [[0, "none", 0], [1, "weapon-per-hit", 1], [2, "weapon-per-hit", 2]]) {
    it(`${hits} acerto(s) → dano de arma por ataque (nunca dano fixo)`, () => {
      const plan = buildMistBreathingPlan("nevoa_02", 3, props);
      const result = resolveEightLayersResult(plan.state, hits);
      assert.equal(result.mode, expectedMode);
      assert.equal(result.weaponRolls, expectedRolls);
      assert.equal(result.formula, "");
    });
  }

  for (const [level, hits, expectedFormula] of [[1, 3, "5d6"], [2, 4, "6d6"], [3, 3, "8d6"], [4, 5, "10d6"]]) {
    it(`Nível ${level}, ${hits} acertos → dano TOTAL fixo ${expectedFormula} (não por acerto)`, () => {
      const plan = buildMistBreathingPlan("nevoa_02", level, props);
      const result = resolveEightLayersResult(plan.state, hits);
      assert.equal(result.mode, "fixed");
      assert.equal(result.formula, expectedFormula);
      assert.equal(result.weaponRolls, 0);
    });
  }

  it("Combo B: 5/5 acertos concede Ciclone da Névoa (earned + benefício), Padrão permanece após o uso", () => {
    const plan = buildMistBreathingPlan("nevoa_02", 3, props);
    const four = resolveEightLayersResult(plan.state, 4);
    assert.equal(mistPatternCount(four.state), 0, "4/5 acertos não concede Ciclone");
    const five = resolveEightLayersResult(plan.state, 5);
    assert.equal(five.state.patterns.cyclone.earned, true);
    assert.equal(five.state.patterns.cyclone.benefitAvailable, true);
    // Próximo turno: técnica da Névoa custo base 0.
    const freePlan = buildMistBreathingPlan("nevoa_01", 4, { ...props, resp_nevoa_estado: five.state }, { useCycloneFree: true });
    assert.equal(freePlan.cost, 0, "Ciclone isenta o custo BASE da próxima técnica");
    assert.equal(freePlan.state.patterns.cyclone.earned, true, "Padrão Ciclone permanece após consumir o benefício");
    assert.equal(freePlan.state.patterns.cyclone.benefitAvailable, false, "benefício gasto, não pode ser reusado");
  });

  it("Ciclone não cobre custos extras opcionais (4ª/5ª) — só o custo BASE", () => {
    const cycloneState = grantMistPattern({}, "cyclone");
    const plan = buildMistBreathingPlan("nevoa_04", 3, { ...props, resp_nevoa_estado: cycloneState },
      { useCycloneFree: true, advantageAttack: true, suppressResistance: true, suppressAttribute: "dex" });
    assert.equal(plan.cost, 1, "custo base (3) isento + apenas o +1 PDR opcional da Anulação de Resistências");
  });
});

describe("3ª Forma — Expansão de Névoa", () => {
  it("só reage a ataques à distância (rangedOnly)", () => {
    const plan = buildMistBreathingPlan("nevoa_03", 2, props);
    assert.equal(plan.state.incomingReduction.rangedOnly, true);
  });

  it("N1/N2: 1d6 + Nível de Exterminador; N3/N4: soma SAB também", () => {
    assert.equal(buildMistBreathingPlan("nevoa_03", 1, props).state.incomingReduction.formula, "1d6 + 8");
    assert.equal(buildMistBreathingPlan("nevoa_03", 2, props).state.incomingReduction.formula, "1d6 + 8");
    assert.equal(buildMistBreathingPlan("nevoa_03", 3, props).state.incomingReduction.formula, "1d6 + 8 + 4");
    assert.equal(buildMistBreathingPlan("nevoa_03", 4, props).state.incomingReduction.formula, "1d6 + 8 + 4");
  });

  it("resultado maior → anula; resultado menor → subtrai", () => {
    assert.deepEqual(resolveMistReduction(20, 7), { incoming: 20, reduction: 7, negated: false, finalDamage: 13 });
    assert.equal(resolveMistReduction(10, 11).negated, true);
    assert.equal(resolveMistReduction(10, 11).finalDamage, 0);
  });

  it("empate (resultado == dano): defesa ganha de ataque — nega todo o dano, igual a 'maior' (decisão do Operador)", () => {
    const tie = resolveMistReduction(10, 10);
    assert.equal(tie.negated, true);
    assert.equal(tie.finalDamage, 0);
  });

  it("Combo C: reduzir/anular dano de Kekkijutsu concede Estigma da Névoa; Padrão permanece após atordoar", () => {
    const plan = buildMistBreathingPlan("nevoa_03", 4, props, { kekkijutsuReduced: true });
    assert.equal(plan.state.patterns.stigma.earned, true);
    assert.equal(plan.state.patterns.stigma.benefitAvailable, true);
    const stun = resolveMistStigmaStunOnHit(plan.state);
    assert.equal(stun.applied, true);
    assert.equal(stun.state.patterns.stigma.earned, true, "Padrão permanece após atordoar");
    assert.equal(stun.state.patterns.stigma.benefitAvailable, false);
    const secondStun = resolveMistStigmaStunOnHit(stun.state);
    assert.equal(secondStun.applied, false, "benefício já foi gasto");
  });

  it("sem Kekkijutsu reduzido, Estigma não é concedida", () => {
    const plan = buildMistBreathingPlan("nevoa_03", 4, props, { kekkijutsuReduced: false });
    assert.equal(plan.state.patterns.stigma.earned, false);
  });
});

describe("4ª Forma — Corte de Advecção / Fecha Neblinada", () => {
  it("exige Vantagem já existente; sem Vantagem, a Forma é bloqueada (sem custo)", () => {
    const plan = buildMistBreathingPlan("nevoa_04", 3, props, { advantageAttack: false });
    assert.equal(plan.ok, false);
    assert.equal(plan.noCost, true);
  });

  it("dano SUBSTITUI (nunca soma) e escala 3d6/4d6/5d6/6d6 por nível", () => {
    for (const [level, expected, cost] of [[1, "3d6", 2], [2, "4d6", 2], [3, "5d6", 3], [4, "6d6", 3]]) {
      const plan = buildMistBreathingPlan("nevoa_04", level, props, { advantageAttack: true });
      assert.equal(plan.state.pendingDamage.formula, expected);
      assert.equal(plan.state.pendingDamage.replaceWeaponDamage, true);
      assert.equal(plan.cost, cost);
    }
  });

  it("Sinergia: +1 PDR opcional e Anulação de Resistências com duração por DEX OU FOR (escolha do usuário)", () => {
    const byDex = buildMistBreathingPlan("nevoa_04", 4, props, { advantageAttack: true, suppressResistance: true, suppressAttribute: "dex" });
    assert.equal(byDex.cost, 4);
    assert.equal(byDex.state.pendingDamage.suppressResistanceTurns, 5);
    const byFor = buildMistBreathingPlan("nevoa_04", 4, props, { advantageAttack: true, suppressResistance: true, suppressAttribute: "for" });
    assert.equal(byFor.state.pendingDamage.suppressResistanceTurns, 2);
  });

  it("sem sinergia escolhida, não paga o PDR extra nem aplica Anulação de Resistências", () => {
    const plan = buildMistBreathingPlan("nevoa_04", 4, props, { advantageAttack: true, suppressResistance: false });
    assert.equal(plan.cost, 3);
    assert.equal(plan.state.pendingDamage.suppressResistanceTurns, 0);
  });
});

describe("5ª Forma — Mar de Nuvens Neblinadas", () => {
  it("indisponível no Nível 1", () => {
    const plan = buildMistBreathingPlan("nevoa_05", 1, props);
    assert.equal(plan.ok, false);
  });

  it("CDs corretas por nível: 9+SAB, 10+SAB, 12+SAB", () => {
    assert.equal(buildMistBreathingPlan("nevoa_05", 2, props).state.mistSea.saveDc, "9 + 4");
    assert.equal(buildMistBreathingPlan("nevoa_05", 3, props).state.mistSea.saveDc, "10 + 4");
    assert.equal(buildMistBreathingPlan("nevoa_05", 4, props).state.mistSea.saveDc, "12 + 4");
  });

  it("Vantagem no próximo ataque é concedida independente do resultado do teste, vinculada ao inimigo por UUID", () => {
    const plan = buildMistBreathingPlan("nevoa_05", 2, props, { targetUuid: "Actor.Enemy1" });
    assert.equal(plan.state.nextHit.advantage, true);
    assert.equal(plan.state.nextHit.targetUuid, "Actor.Enemy1");
  });

  it("falha do inimigo → metade do dano; sucesso → dano normal (marcado no estado para o damage-service)", () => {
    const plan = buildMistBreathingPlan("nevoa_05", 4, props);
    assert.equal(plan.state.incomingHalfOnFailedSave.saveDc, "12 + 4");
  });

  it("Combo D: pagar o DOBRO do custo TOTAL concede Reflexão; Padrão permanece após usar a Recuperação com Vantagem", () => {
    const plan = buildMistBreathingPlan("nevoa_05", 3, props, { doubleCost: true });
    assert.equal(plan.cost, 4, "custo total dobrado (2 → 4), não custo normal + dobro");
    assert.equal(plan.state.patterns.reflection.earned, true);
    assert.equal(plan.state.patterns.reflection.benefitAvailable, true);
    const recovery = resolveMistReflectionRecoveryAvailable(plan.state);
    assert.equal(recovery.available, true);
    assert.equal(recovery.state.patterns.reflection.earned, true, "Padrão permanece após consumir a Recuperação com Vantagem");
    assert.equal(recovery.state.patterns.reflection.benefitAvailable, false);
  });

  it("sem pagar o dobro, não concede Reflexão", () => {
    const plan = buildMistBreathingPlan("nevoa_05", 3, props, { doubleCost: false });
    assert.equal(plan.cost, 2);
    assert.equal(plan.state.patterns.reflection.earned, false);
  });
});

describe("6ª Forma — Névoa sob o Luar", () => {
  it("declaração cobra 2 PDR mesmo se o teste de DEX falhar (custo por declaração, não por sucesso)", () => {
    const plan = buildMistBreathingPlan("nevoa_06", 2, props, { dexCheckPassed: false });
    assert.equal(plan.ok, true, "a Forma continua 'ok' — o custo de declaração já ocorreu, sem criar dano");
    assert.equal(plan.cost, 2);
    assert.equal(plan.state.dexFailed, true);
    assert.equal(plan.state.nextHit, undefined, "sem SAB nos ataques");
    assert.equal(plan.state.pendingDamage, undefined, "sem dano criado");
    assert.equal(plan.state.collapse, false, "sem Colapso");
  });

  it("sucesso: +SAB em todos os ataques do turno (nextHit.bonus = SAB)", () => {
    const plan = buildMistBreathingPlan("nevoa_06", 2, props, { dexCheckPassed: true, extraAttacks: 0 });
    assert.equal(plan.state.nextHit.bonus, 4);
    assert.equal(plan.state.moonMist.active, true);
    assert.equal(plan.state.moonMist.hitBonusAttribute, "SAB");
  });

  it("cadeia de ataques: cada ataque extra cobra +1 PDR (não pré-cobra tudo de uma vez conceitualmente)", () => {
    const plan = buildMistBreathingPlan("nevoa_06", 4, props, { dexCheckPassed: true, extraAttacks: 3 });
    assert.equal(plan.cost, 2 + 3, "2 PDR de declaração + 1 PDR por cada um dos 3 ataques extras");
    assert.equal(plan.state.nextHit.count, 4);
  });

  it("Combo E: com os 3 Padrões conquistados, Colapso ativa — +SAB no dano de cada acerto", () => {
    const state = threePatterns();
    const plan = buildMistBreathingPlan("nevoa_06", 4, { ...props, resp_nevoa_estado: state }, { dexCheckPassed: true, extraAttacks: 0 });
    assert.equal(plan.state.collapse, true);
    assert.equal(plan.state.pendingDamage.formula, "@sab");
    assert.equal(mistPatternCount(plan.state), 3, "Colapso NÃO consome os 3 Padrões (decisão pendente, mantido conservador)");
  });

  it("crítico soma FDV no Acerto e no Dano SOMENTE durante Colapso, e só naquele ataque", () => {
    const state = threePatterns();
    const collapsePlan = buildMistBreathingPlan("nevoa_06", 4, { ...props, resp_nevoa_estado: state }, { dexCheckPassed: true, extraAttacks: 0 });
    assert.equal(collapsePlan.state.nextHit.criticalBonus, 3, "FDV do exemplo é 3");
    assert.equal(collapsePlan.state.pendingDamage.criticalFormula, "@fdv");

    const noPatterns = buildMistBreathingPlan("nevoa_06", 4, props, { dexCheckPassed: true, extraAttacks: 0 });
    assert.equal(noPatterns.state.collapse, false);
    assert.equal(noPatterns.state.nextHit.criticalBonus, 0, "sem Colapso, o crítico não ganha bônus de FDV");
    assert.equal(noPatterns.state.pendingDamage, undefined, "sem Colapso, a 6ª Forma não adiciona dano extra por acerto");
  });
});

describe("7ª Forma — Neblina", () => {
  it("indisponível no Nível 1", () => {
    assert.equal(buildMistBreathingPlan("nevoa_07", 1, props).ok, false);
  });

  it("duração é max(3, CAR), nunca soma", () => {
    assert.equal(buildMistBreathingPlan("nevoa_07", 4, { ...props, car_display: 1 }, { opposedPassed: true }).state.fog.turns, 3);
    assert.equal(buildMistBreathingPlan("nevoa_07", 4, { ...props, car_display: 5 }, { opposedPassed: true }).state.fog.turns, 5);
  });

  it("bônus por nível em Acerto/Dano/Esquiva/Bloqueio: +2/+3/+4", () => {
    assert.equal(buildMistBreathingPlan("nevoa_07", 2, props, { opposedPassed: true }).state.fog.bonus, 2);
    assert.equal(buildMistBreathingPlan("nevoa_07", 3, props, { opposedPassed: true }).state.fog.bonus, 3);
    assert.equal(buildMistBreathingPlan("nevoa_07", 4, props, { opposedPassed: true }).state.fog.bonus, 4);
  });

  it("falha no teste oposto de SAB impede o efeito", () => {
    const plan = buildMistBreathingPlan("nevoa_07", 2, props, { opposedPassed: false });
    assert.equal(plan.ok, false);
  });

  it("tick decrementa a duração até expirar", () => {
    const plan = buildMistBreathingPlan("nevoa_07", 4, { ...props, car_display: 5 }, { opposedPassed: true });
    const tick = tickMistBreathing(plan.patch["system.props.resp_nevoa_estado"]);
    assert.equal(parseMistBreathingState(tick["system.props.resp_nevoa_estado"]).fog.turns, 4);
  });
});

describe("8ª Forma — Ofuscamento", () => {
  it("indisponível no Nível 1, 5 turnos, 7 PDR em N2/N3/N4", () => {
    for (const level of [2, 3, 4]) {
      const plan = buildMistBreathingPlan("nevoa_08", level, props, { targetUuid: "Actor.Enemy", allyUuid: "Actor.Ally" });
      assert.equal(plan.cost, 7);
      assert.equal(plan.state.obfuscation.turns, 5);
    }
  });

  it("N2: -2 no Acerto do inimigo contra usuário/aliado + imunidade a Exaustão", () => {
    const plan = buildMistBreathingPlan("nevoa_08", 2, props, { targetUuid: "Actor.Enemy", allyUuid: "Actor.Ally" });
    assert.equal(plan.state.obfuscation.hitPenalty, -2);
    assert.equal(plan.state.obfuscation.hitBonus, 0);
    assert.equal(plan.state.obfuscation.exhaustionImmune, true);
    assert.equal(plan.state.obfuscation.targetUuid, "Actor.Enemy");
    assert.equal(plan.state.obfuscation.allyUuid, "Actor.Ally");
  });

  it("N3: mantém N2 + target-specific +2 Acerto contra o inimigo ofuscado", () => {
    const plan = buildMistBreathingPlan("nevoa_08", 3, props, { targetUuid: "Actor.Enemy", allyUuid: "Actor.Ally" });
    assert.equal(plan.state.obfuscation.hitPenalty, -2);
    assert.equal(plan.state.obfuscation.hitBonus, 2);
  });

  it("N4: mantém anteriores + normaliza dano crítico (não vira erro)", () => {
    const plan = buildMistBreathingPlan("nevoa_08", 4, props, { targetUuid: "Actor.Enemy", allyUuid: "Actor.Ally" });
    assert.equal(plan.state.obfuscation.criticalImmunity, true);
    assert.equal(plan.state.dazzle.criticalImmunity, true, "campo legado 'dazzle' sincronizado para hit-service/damage-service");
  });
});

describe("Combo F — Neblina + Lua: bônus independentes coexistem", () => {
  it("Neblina (+3 Acerto/Dano N3) e Lua (+SAB Acerto) não se substituem", () => {
    let state = buildMistBreathingPlan("nevoa_07", 3, props, { opposedPassed: true }).state;
    const luar = buildMistBreathingPlan("nevoa_06", 3, { ...props, resp_nevoa_estado: state }, { dexCheckPassed: true, extraAttacks: 0 });
    assert.equal(luar.state.fog.bonus, 3, "Neblina permanece intacta ao ativar a Lua");
    assert.equal(luar.state.nextHit.bonus, 4, "Lua soma SAB separadamente");
  });
});

describe("Combo G — Ofuscamento + reação: estados independentes", () => {
  it("usar Expansão ou Mar de Nuvens não apaga o Ofuscamento ativo", () => {
    let state = buildMistBreathingPlan("nevoa_08", 4, props, { targetUuid: "Actor.Enemy", allyUuid: "Actor.Ally" }).state;
    const expansion = buildMistBreathingPlan("nevoa_03", 4, { ...props, resp_nevoa_estado: state }, {});
    assert.ok(expansion.state.obfuscation, "Ofuscamento sobrevive à Expansão de Névoa");
    const mistSea = buildMistBreathingPlan("nevoa_05", 4, { ...props, resp_nevoa_estado: expansion.state }, {});
    assert.ok(mistSea.state.obfuscation, "Ofuscamento sobrevive ao Mar de Nuvens");
  });
});

describe("Estados simultâneos — sem shallow-copy/aliasing entre Formas", () => {
  it("consumir/tickar um efeito não muta os demais estados aninhados por referência", () => {
    let state = threePatterns();
    state = buildMistBreathingPlan("nevoa_07", 4, { ...props, resp_nevoa_estado: state, car_display: 5 }, { opposedPassed: true }).state;
    state = buildMistBreathingPlan("nevoa_08", 4, { ...props, resp_nevoa_estado: state }, { targetUuid: "Actor.Enemy", allyUuid: "Actor.Ally" }).state;
    state = buildMistBreathingPlan("nevoa_05", 2, { ...props, resp_nevoa_estado: state }, { targetUuid: "Actor.Enemy" }).state;
    const skySuspended = buildMistBreathingPlan("nevoa_01", 3, { ...props, resp_nevoa_estado: state }).state;

    const snapshotFogTurns = skySuspended.fog.turns;
    const snapshotObfTurns = skySuspended.obfuscation.turns;
    const snapshotPatterns = mistPatternCount(skySuspended);

    // Tick uma vez: só fog/obfuscation/patterns.benefit devem mudar; pendingDamage (Céu Suspenso) intacto.
    const ticked = normalizeMistBreathingState(tickMistBreathing(mistStateJson(skySuspended))["system.props.resp_nevoa_estado"]);
    assert.equal(ticked.fog.turns, snapshotFogTurns - 1);
    assert.equal(ticked.obfuscation.turns, snapshotObfTurns - 1);
    assert.equal(mistPatternCount(ticked), snapshotPatterns, "earned dos 3 Padrões não muda só por tickar");
    assert.equal(ticked.pendingDamage.formula, skySuspended.pendingDamage.formula, "Céu Suspenso pendente não é afetado pelo tick de Neblina/Ofuscamento");
    assert.equal(ticked.nextHit.advantage, true, "Vantagem do Mar de Nuvens sobrevive ao tick de outras Formas");

    // Consumir o pendingDamage do Céu Suspenso não deve tocar fog/obfuscation/nextHit.
    const afterHit = consumeMistPending(ticked, { damage: true });
    assert.equal(afterHit.fog.turns, ticked.fog.turns);
    assert.equal(afterHit.obfuscation.turns, ticked.obfuscation.turns);
    assert.equal(afterHit.nextHit.advantage, true);
  });
});

describe("clearMistBreathingState — combate encerrado", () => {
  it("limpa efeitos de combate e reseta os Padrões conquistados (decisão do Operador)", () => {
    const state = threePatterns();
    const patch = clearMistBreathingState(state);
    const cleared = parseMistBreathingState(patch["system.props.resp_nevoa_estado"]);
    assert.equal(mistPatternCount(cleared), 0, "Padrões resetam ao fim do combate, mesmo padrão de Quebra/Esquentar");
    assert.equal(cleared.fog, null);
    assert.equal(cleared.obfuscation, null);
  });
});

describe("utilitário de fórmulas", () => {
  it("resolve placeholders oficiais sem usar eval", () => {
    assert.equal(resolveMistFormula("1d6 + @level + @sab", props), "1d6 + 8 + 4");
  });
});

function mistStateJson(state) {
  return JSON.stringify(state);
}
