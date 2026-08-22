import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  calculateCD,
  calculateDamageCost,
  totalDamageCost,
  calculateStatusCost,
  totalStatusCost,
  ACTIONS_BY_SCALE,
  SCALE_LIMITS,
  SPECIAL_DAMAGE_RULES,
  LIMITATION_DISCOUNTS,
  WOUND_ATTRIBUTE_MAP,
  RESISTANCE_MAP,
  REGEN_ACTIVATION,
  ONI_SCALES,
  SCALE_LABELS,
  SCALE_CD_BONUS,
  FERIDAS_DOMINANTES,
  FERIDA_LABELS,
  KEKKIJUTSU_FUNCTIONS,
  FUNCAO_LABELS,
  ACTION_TYPES,
} from "../scripts/oni/kekkijutsu-cost-tables.mjs";

import {
  resolveKekkijutsuCD,
  resolveResistanceType,
  validateActionByScale,
  validateScaleLimits,
  auditKekkijutsuCost,
  getSpecialDamageRule,
  resolveWoundBonus,
  canHaveDomain,
  canUseRegeneration,
  resolveKekkijutsuUse,
} from "../scripts/oni/kekkijutsu-engine.mjs";

// ─── COST TABLES ──────────────────────────────────────────────────────

describe("kekkijutsu-cost-tables: calculateCD", () => {
  it("CD = 10 + atributo para oni_comum", () => {
    assert.equal(calculateCD(5, "oni_comum"), 15);
  });

  it("CD = 10 + atributo + bonus escala para boss_missao", () => {
    assert.equal(calculateCD(5, "boss_missao"), 17);
  });

  it("CD com bonus adicional", () => {
    assert.equal(calculateCD(5, "oni_comum", 3), 18);
  });

  it("CD com atributo 0", () => {
    assert.equal(calculateCD(0, "minion"), 10);
  });

  it("CD com atributo negativo usa 0", () => {
    assert.equal(calculateCD(-5, "minion"), 10);
  });

  it("CD para rei_oni com atributo alto", () => {
    assert.equal(calculateCD(8, "rei_oni"), 23);
  });
});

describe("kekkijutsu-cost-tables: calculateDamageCost", () => {
  it("d4 cortante = 1 PDK", () => {
    assert.deepEqual(calculateDamageCost("1d4", "cortante"), { baseCost: 1, additionalDice: 0, totalCost: 1 });
  });

  it("d8 cortante = 3 PDK", () => {
    assert.deepEqual(calculateDamageCost("1d8", "cortante"), { baseCost: 3, additionalDice: 0, totalCost: 3 });
  });

  it("2d8 cortante = 3 + 1 = 4 PDK", () => {
    assert.deepEqual(calculateDamageCost("2d8", "cortante"), { baseCost: 3, additionalDice: 1, totalCost: 4 });
  });

  it("3d12 necrotico = 8 + 2 = 10 PDK", () => {
    assert.deepEqual(calculateDamageCost("3d12", "necrotico"), { baseCost: 8, additionalDice: 2, totalCost: 10 });
  });

  it("1d6 sonico = 3 PDK", () => {
    assert.deepEqual(calculateDamageCost("1d6", "sonico"), { baseCost: 3, additionalDice: 0, totalCost: 3 });
  });

  it("dado invalido retorna 0", () => {
    assert.deepEqual(calculateDamageCost("invalido", "cortante"), { baseCost: 0, additionalDice: 0, totalCost: 0 });
  });
});

describe("kekkijutsu-cost-tables: totalDamageCost", () => {
  it("vazio = 0", () => {
    assert.equal(totalDamageCost([]), 0);
  });

  it("soma multiplos componentes", () => {
    assert.equal(totalDamageCost([{ dice: "1d8", type: "cortante" }, { dice: "1d6", type: "sonico" }]), 6);
  });
});

describe("kekkijutsu-cost-tables: calculateStatusCost", () => {
  it("resistencia 1 turno = 1 PDK", () => {
    assert.equal(calculateStatusCost("resistencia", 1), 1);
  });

  it("resistencia 3 turnos = 4 PDK", () => {
    assert.equal(calculateStatusCost("resistencia", 3), 4);
  });

  it("atordoamento 2 turnos = 4 PDK", () => {
    assert.equal(calculateStatusCost("atordoamento", 2), 4);
  });

  it("dominio 5 turnos = 10 PDK", () => {
    assert.equal(calculateStatusCost("dominio", 5), 10);
  });

  it("status desconhecido = 0", () => {
    assert.equal(calculateStatusCost("desconhecido", 1), 0);
  });
});

describe("kekkijutsu-cost-tables: totalStatusCost", () => {
  it("vazio = 0", () => {
    assert.equal(totalStatusCost([]), 0);
  });

  it("soma multiplos status", () => {
    assert.equal(totalStatusCost([{ type: "resistencia", duration: 1 }, { type: "atordoamento", duration: 2 }]), 5);
  });
});

describe("kekkijutsu-cost-tables: ACTIONS_BY_SCALE", () => {
  it("minion so tem ataque e especial", () => {
    assert.ok(ACTIONS_BY_SCALE.minion.has("ataque"));
    assert.ok(ACTIONS_BY_SCALE.minion.has("especial"));
    assert.equal(ACTIONS_BY_SCALE.minion.has("reacao"), false);
  });

  it("boss_campanha tem lendaria", () => {
    assert.ok(ACTIONS_BY_SCALE.boss_campanha.has("lendaria"));
  });

  it("rei_oni tem todas as acoes", () => {
    assert.equal(ACTIONS_BY_SCALE.rei_oni.size, 9);
  });
});

describe("kekkijutsu-cost-tables: SCALE_LIMITS", () => {
  it("minion maxCost 3", () => {
    assert.equal(SCALE_LIMITS.minion.maxCost, 3);
  });

  it("lua_superior tem hasDomain superior", () => {
    assert.equal(SCALE_LIMITS.lua_superior.hasDomain, "superior");
  });

  it("rei_oni hasLegendary true", () => {
    assert.equal(SCALE_LIMITS.rei_oni.hasLegendary, true);
  });
});

describe("kekkijutsu-cost-tables: SPECIAL_DAMAGE_RULES", () => {
  it("trovejante tem regra", () => {
    assert.ok(SPECIAL_DAMAGE_RULES.trovejante);
  });

  it("necrotico tem regra", () => {
    assert.ok(SPECIAL_DAMAGE_RULES.necrotico);
  });

  it("cortante NAO tem regra especial", () => {
    assert.equal(SPECIAL_DAMAGE_RULES.cortante, undefined);
  });
});

describe("kekkijutsu-cost-tables: LIMITATION_DISCOUNTS", () => {
  it("melee_only desconta 1", () => {
    assert.equal(LIMITATION_DISCOUNTS.melee_only, -1);
  });

  it("once_per_scene desconta 3", () => {
    assert.equal(LIMITATION_DISCOUNTS.once_per_scene, -3);
  });
});

describe("kekkijutsu-cost-tables: WOUND_ATTRIBUTE_MAP", () => {
  it("ira_odio mapeia para FOR", () => {
    assert.equal(WOUND_ATTRIBUTE_MAP.ira_odio, "FOR");
  });

  it("medo_obsessao mapeia para FDV", () => {
    assert.equal(WOUND_ATTRIBUTE_MAP.medo_obsessao, "FDV");
  });
});

describe("kekkijutsu-cost-tables: RESISTANCE_MAP", () => {
  it("veneno usa VIT", () => {
    assert.equal(RESISTANCE_MAP.veneno_acido_doenca_corpo, "VIT");
  });

  it("ilusao usa INT", () => {
    assert.equal(RESISTANCE_MAP.ilusao_logica, "INT");
  });
});

describe("kekkijutsu-cost-tables: REGEN_ACTIVATION", () => {
  it("requer nivel 7+", () => {
    assert.equal(REGEN_ACTIVATION.minLevel, 7);
  });

  it("acao completa", () => {
    assert.equal(REGEN_ACTIVATION.action, "completa");
  });

  it("proibe minion", () => {
    assert.ok(REGEN_ACTIVATION.forbiddenScales.includes("minion"));
  });
});

// ─── ENGINE ───────────────────────────────────────────────────────────

describe("kekkijutsu-engine: resolveKekkijutsuCD", () => {
  const technique = { testType: "FDV", cdFormula: "", testFormula: "" };
  const actor = { system: { props: { fdv: 6, nivel_oni_escal: "boss_missao" } } };

  it("calcula CD corretamente", () => {
    const result = resolveKekkijutsuCD(technique, actor);
    assert.equal(result.cd, 18);
    assert.equal(result.attributeKey, "fdv");
  });

  it("usa escala do context", () => {
    const result = resolveKekkijutsuCD(technique, actor, { scale: "lua_superior" });
    assert.equal(result.cd, 20);
  });
});

describe("kekkijutsu-engine: resolveResistanceType", () => {
  it("veneno retorna VIT", () => {
    assert.equal(resolveResistanceType({ damage: [{ types: ["venenoso"] }] }), "VIT");
  });

  it("mental retorna INT", () => {
    assert.equal(resolveResistanceType({ damage: [{ types: ["mental"] }] }), "INT");
  });

  it("cortante retorna FDV", () => {
    assert.equal(resolveResistanceType({ damage: [{ types: ["cortante"] }] }), "FDV");
  });
});

describe("kekkijutsu-engine: validateActionByScale", () => {
  it("ataque permitido para minion", () => {
    assert.ok(validateActionByScale("minion", "ataque").ok);
  });

  it("reacao NAO permitido para minion", () => {
    assert.equal(validateActionByScale("minion", "reacao").ok, false);
  });

  it("reacao permitido para elite", () => {
    assert.ok(validateActionByScale("elite", "reacao").ok);
  });

  it("escala desconhecida retorna erro", () => {
    assert.equal(validateActionByScale("desconhecida", "ataque").ok, false);
  });
});

describe("kekkijutsu-engine: validateScaleLimits", () => {
  it("custo dentro do limite", () => {
    assert.ok(validateScaleLimits("minion", 2).ok);
  });

  it("custo acima do limite gera warning", () => {
    const result = validateScaleLimits("minion", 5);
    assert.equal(result.ok, false);
    assert.ok(result.warnings.length > 0);
  });
});

describe("kekkijutsu-engine: auditKekkijutsuCost", () => {
  it("custo vazio = 1 (minimo)", () => {
    const result = auditKekkijutsuCost({});
    assert.equal(result.totalCost, 1);
  });

  it("soma dano e status", () => {
    const result = auditKekkijutsuCost({
      damage: [{ dice: "1d8", type: "cortante" }],
      status: [{ type: "resistencia", duration: 1 }],
    });
    assert.equal(result.breakdown.damageCost, 3);
    assert.equal(result.breakdown.statusCost, 1);
    assert.equal(result.totalCost, 4);
  });

  it("aplica desconto de limitations", () => {
    const result = auditKekkijutsuCost({
      damage: [{ dice: "1d8", type: "cortante" }],
      context: { limitations: ["melee_only"] },
    });
    assert.equal(result.breakdown.discount, -1);
  });

  it("area grande custa +2", () => {
    const result = auditKekkijutsuCost({
      context: { area: "grande" },
    });
    assert.equal(result.breakdown.areaCost, 2);
  });
});

describe("kekkijutsu-engine: getSpecialDamageRule", () => {
  it("trovejante tem regra", () => {
    const result = getSpecialDamageRule("trovejante");
    assert.ok(result.hasSpecialRule);
    assert.ok(result.rule.includes("reduzido"));
  });

  it("cortante nao tem regra", () => {
    const result = getSpecialDamageRule("cortante");
    assert.equal(result.hasSpecialRule, false);
  });
});

describe("kekkijutsu-engine: resolveWoundBonus", () => {
  it("ira_odio retorna FOR", () => {
    assert.deepEqual(resolveWoundBonus("ira_odio"), { attribute: "FOR", bonus: 1 });
  });

  it("outra retorna FDV", () => {
    assert.deepEqual(resolveWoundBonus("outra"), { attribute: "FDV", bonus: 1 });
  });
});

describe("kekkijutsu-engine: canHaveDomain", () => {
  it("minion nao tem dominio", () => {
    assert.equal(canHaveDomain("minion").canHaveDomain, false);
  });

  it("boss_missao tem dominio menor_condicional", () => {
    assert.equal(canHaveDomain("boss_missao").canHaveDomain, true);
    assert.equal(canHaveDomain("boss_missao").domainType, "menor_condicional");
  });

  it("lua_superior tem dominio superior", () => {
    assert.equal(canHaveDomain("lua_superior").domainType, "superior");
  });
});

describe("kekkijutsu-engine: canUseRegeneration", () => {
  it("minion nao pode usar", () => {
    const result = canUseRegeneration("minion", 10);
    assert.equal(result.canUse, false);
  });

  it("oni_comum nivel baixo nao pode usar", () => {
    const result = canUseRegeneration("oni_comum", 5);
    assert.equal(result.canUse, false);
  });

  it("oni_comum nivel 7 pode usar", () => {
    const result = canUseRegeneration("oni_comum", 7);
    assert.equal(result.canUse, true);
  });
});

describe("kekkijutsu-engine: resolveKekkijutsuUse", () => {
  const technique = {
    id: "kekki_teste",
    name: "Kekkijutsu Teste",
    action: "especial",
    unlockLevel: 3,
    pdkCost: 4,
    testType: "FDV",
    damage: [{ dice: "1d8", type: "cortante" }],
    status: [],
    narrative: "Um teste.",
  };

  const actor = {
    system: {
      props: {
        fdv: 5,
        nvl_num: 5,
        pdk_oni_atual_num: 10,
        nivel_oni_escal: "oni_comum",
      },
    },
  };

  it("sucesso: retorna resultado completo", () => {
    const result = resolveKekkijutsuUse({ actor, technique });
    assert.ok(result.ok);
    assert.equal(result.result.techniqueId, "kekki_teste");
    assert.equal(result.result.pdkCost, 3);
    assert.ok(result.result.cd >= 10);
  });

  it("falha: nivel insuficiente", () => {
    const lowLevelActor = {
      system: {
        props: {
          fdv: 5,
          nvl_num: 2,
          pdk_oni_atual_num: 10,
          nivel_oni_escal: "oni_comum",
        },
      },
    };
    const result = resolveKekkijutsuUse({ actor: lowLevelActor, technique });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes("Nível insuficiente")));
  });

  it("falha: pdk insuficiente", () => {
    const lowPdkActor = {
      system: {
        props: {
          fdv: 5,
          nvl_num: 5,
          pdk_oni_atual_num: 2,
          nivel_oni_escal: "oni_comum",
        },
      },
    };
    const result = resolveKekkijutsuUse({ actor: lowPdkActor, technique });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes("PDK insuficiente")));
  });

  it("falha: acao nao permitida para escala", () => {
    const minionTechnique = { ...technique, action: "reacao" };
    const result = resolveKekkijutsuUse({ actor, technique: minionTechnique });
    assert.equal(result.ok, false);
  });
});
