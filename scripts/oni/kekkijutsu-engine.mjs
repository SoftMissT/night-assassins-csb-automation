/**
 * @fileoverview Extensões do kekkijutsu-service: CD, Cost Audit, Escalation Limits.
 * Importa de kekkijutsu-cost-tables.mjs e complementa kekkijutsu-service.mjs.
 *
 * @module kekkijutsu-engine
 */

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
} from "./kekkijutsu-cost-tables.mjs";

function integer(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : fallback;
}

/**
 * Calcula CD para o teste de resistência de um Kekkijutsu.
 * @param {object} technique - técnica normalizada
 * @param {object} actor - ator (com system.props)
 * @param {object} [context={}]
 * @returns {{ cd: number, testFormula: string, attributeKey: string, resistanceType: string }}
 */
export function resolveKekkijutsuCD(technique, actor, context = {}) {
  const props = actor?.system?.props ?? {};
  const scale = context.scale ?? props.nivel_oni_escal ?? props.kekki_escala ?? "oni_comum";

  const testType = (technique.testType ?? "FDV").toUpperCase();
  const attributeKey = testType.toLowerCase();
  const attrValue = integer(props[attributeKey] ?? props[`atk_${attributeKey}`] ?? 0);
  const bonus = integer(context.cdBonus ?? 0);

  const cd = calculateCD(attrValue, scale, bonus);
  const resistanceType = context.resistanceType ?? resolveResistanceType(technique);

  return Object.freeze({
    cd,
    testFormula: technique.cdFormula ?? technique.testFormula ?? "",
    attributeKey,
    resistanceType,
    scale,
  });
}

/**
 * Resolve o tipo de resistência com base nos tipos de dano da técnica.
 * @param {object} technique
 * @returns {string}
 */
export function resolveResistanceType(technique) {
  const damageTypes = (technique.damage ?? []).flatMap((d) => d.types ?? []);
  if (damageTypes.some((t) => ["venenoso", "acido", "doenca"].includes(t))) return "VIT";
  if (damageTypes.some((t) => ["trovejante", "sonico"].includes(t))) return "VIT";
  if (damageTypes.some((t) => ["necrotico", "ferida"].includes(t))) return "FDV";
  if (damageTypes.some((t) => ["mental"].includes(t))) return "INT";
  return "FDV";
}

/**
 * Valida se a escala do ator permite a ação escolhida.
 * @param {string} scale
 * @param {string} action
 * @returns {{ ok: boolean, error: string|null }}
 */
export function validateActionByScale(scale, action) {
  const allowed = ACTIONS_BY_SCALE[scale];
  if (!allowed) return { ok: false, error: `Escala desconhecida: ${scale}` };
  if (!allowed.has(action)) {
    return { ok: false, error: `Ação "${action}" não permitida para escala "${scale}". Ações permitidas: ${[...allowed].join(", ")}` };
  }
  return { ok: true, error: null };
}

/**
 * Valida limites de escala (custo máximo, dado de dano máximo, etc).
 * @param {string} scale
 * @param {number} pdkCost
 * @param {string[]} [damageDice=[]] - ex: ["2d8", "1d6"]
 * @returns {{ ok: boolean, warnings: string[] }}
 */
export function validateScaleLimits(scale, pdkCost, damageDice = []) {
  const limits = SCALE_LIMITS[scale];
  if (!limits) return { ok: false, warnings: [`Escala desconhecida: ${scale}`] };

  const warnings = [];
  if (pdkCost > limits.maxCost) {
    warnings.push(`Custo PDK (${pdkCost}) excede limite da escala ${scale} (${limits.maxCost}).`);
  }
  return { ok: warnings.length === 0, warnings };
}

/**
 * Audita o custo total de um Kekkijutsu.
 * @param {object} params
 * @param {Array} params.damage - [{dice, type}]
 * @param {Array} params.status - [{type, duration}]
 * @param {object} [params.context={}] - target, area, unusualAction, duration, hybridization, limitations
 * @returns {{ totalCost: number, breakdown: object, warnings: string[] }}
 */
export function auditKekkijutsuCost({ damage = [], status = [], context = {} } = {}) {
  const damageCost = totalDamageCost(damage);
  const statusCost = totalStatusCost(status);

  const additionalTargetCost = context.target === "multiplo" ? Math.max(0, integer(context.attributeValue) - 10) : 0;
  const areaCost = context.area === "grande" ? 2 : 0;
  const unusualActionCost = context.unusualAction ? 2 : 0;
  const durationCost = integer(context.duration) > 0 ? Math.max(0, Math.floor(integer(context.duration) / 4)) : 0;
  const hybridizationCost = integer(context.hybridization);

  const discount = (context.limitations ?? []).reduce((sum, key) => sum + (LIMITATION_DISCOUNTS[key] ?? 0), 0);

  const totalCost = Math.max(1, damageCost + statusCost + additionalTargetCost + areaCost + unusualActionCost + durationCost + hybridizationCost + discount);

  const breakdown = {
    damageCost,
    statusCost,
    additionalTargetCost,
    areaCost,
    unusualActionCost,
    durationCost,
    hybridizationCost,
    discount,
    totalCost,
  };

  const warnings = [];
  if (totalCost < 1) warnings.push("Custo total mínimo é 1 PDK.");
  if (discount < 0) warnings.push(`Desconto de ${Math.abs(discount)} PDK aplicado.`);

  return Object.freeze({ totalCost, breakdown, warnings });
}

/**
 * Verifica se o dano especial tem regras especiais.
 * @param {string} damageType
 * @returns {{ hasSpecialRule: boolean, rule: string|null }}
 */
export function getSpecialDamageRule(damageType) {
  const rule = SPECIAL_DAMAGE_RULES[damageType];
  return { hasSpecialRule: Boolean(rule), rule: rule ?? null };
}

/**
 * Resolve o bônus de atributo por ferida dominante.
 * @param {string} woundType
 * @returns {{ attribute: string, bonus: number }}
 */
export function resolveWoundBonus(woundType) {
  const attribute = WOUND_ATTRIBUTE_MAP[woundType] ?? "FDV";
  return { attribute, bonus: 1 };
}

/**
 * Verifica se o Oni pode ter Domínio baseado na escala.
 * @param {string} scale
 * @returns {{ canHaveDomain: boolean, domainType: string|null }}
 */
export function canHaveDomain(scale) {
  const limits = SCALE_LIMITS[scale];
  if (!limits || !limits.hasDomain) return { canHaveDomain: false, domainType: null };
  return { canHaveDomain: true, domainType: limits.hasDomain };
}

/**
 * Verifica se o Oni pode usar Regeneração Ativa.
 * @param {string} scale
 * @param {number} level
 * @returns {{ canUse: boolean, reason: string|null }}
 */
export function canUseRegeneration(scale, level) {
  if (REGEN_ACTIVATION.forbiddenScales.includes(scale)) {
    return { canUse: false, reason: "Onis de escala minion não podem usar Regeneração Ativa." };
  }
  if (level < REGEN_ACTIVATION.minLevel) {
    return { canUse: false, reason: `Requer nível ${REGEN_ACTIVATION.minLevel}+. Atual: ${level}.` };
  }
  return { canUse: true, reason: null };
}

/**
 * Resolve uso de Kekkijutsu completo (13 passos do spec).
 * @param {object} params
 * @param {object} params.actor
 * @param {object} params.technique
 * @param {object} [params.context={}]
 * @returns {{ ok: boolean, result: object|null, errors: string[] }}
 */
export function resolveKekkijutsuUse({ actor, technique, context = {} } = {}) {
  const errors = [];
  const props = actor?.system?.props ?? {};

  const scale = context.scale ?? props.nivel_oni_escal ?? props.kekki_escala ?? "oni_comum";
  const level = integer(context.level ?? props.nvl_num ?? props.nivel_oni_num ?? 1);
  const currentPdk = integer(context.currentPdk ?? props.pdk_oni_atual_num ?? 0);

  if (level < integer(technique.unlockLevel)) {
    errors.push(`Nível insuficiente: requer ${technique.unlockLevel}, atual ${level}.`);
  }
  if (currentPdk < technique.pdkCost) {
    errors.push(`PDK insuficiente: requer ${technique.pdkCost}, atual ${currentPdk}.`);
  }

  const actionCheck = validateActionByScale(scale, technique.action);
  if (!actionCheck.ok) errors.push(actionCheck.error);

  const scaleCheck = validateScaleLimits(scale, technique.pdkCost, (technique.damage ?? []).map((d) => d.dice));
  if (!scaleCheck.ok) errors.push(...scaleCheck.warnings);

  const costAudit = auditKekkijutsuCost({
    damage: technique.damage ?? [],
    status: technique.status ?? [],
    context: {
      target: technique.target,
      area: context.area,
      unusualAction: context.unusualAction,
      duration: technique.duration,
      hybridization: context.hybridization,
      limitations: context.limitations,
      attributeValue: integer(props[technique.testType?.toLowerCase()] ?? 0),
    },
  });

  if (costAudit.warnings.length) errors.push(...costAudit.warnings);

  if (errors.length > 0) {
    return Object.freeze({ ok: false, result: null, errors });
  }

  const cd = resolveKekkijutsuCD(technique, actor, { scale, cdBonus: context.cdBonus });

  return Object.freeze({
    ok: true,
    errors: [],
    result: Object.freeze({
      techniqueId: technique.id,
      techniqueName: technique.name,
      action: technique.action,
      scale,
      pdkCost: costAudit.totalCost,
      costBreakdown: costAudit.breakdown,
      cd: cd.cd,
      testType: technique.testType,
      resistanceType: cd.resistanceType,
      damage: technique.damage ?? [],
      status: technique.status ?? [],
      narrative: technique.narrative ?? "",
      specialRules: (technique.damage ?? []).map((d) => getSpecialDamageRule(d.type)).filter((r) => r.hasSpecialRule),
    }),
  });
}
