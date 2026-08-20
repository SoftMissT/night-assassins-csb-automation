/** Estado e planos executáveis da Respiração da Névoa. */
import { parseNumber } from "./parsing.mjs";
import { mistFormById } from "./mist-breathing-data.mjs";

export function parseMistBreathingState(raw) {
  if (raw && typeof raw === "object") return { version: 1, patterns: {}, ...raw };
  try {
    const parsed = JSON.parse(String(raw || "{}"));
    return parsed && typeof parsed === "object" ? { version: 1, patterns: {}, ...parsed } : { version: 1, patterns: {} };
  } catch (_) {
    return { version: 1, patterns: {} };
  }
}

export function mistStatePatch(state, overrides = {}) {
  return { "system.props.resp_nevoa_estado": JSON.stringify({ version: 1, patterns: {}, ...state }), ...overrides };
}

export function mistPatternCount(state) {
  return ["cyclone", "stigma", "reflection"].filter((key) => state?.patterns?.[key]).length;
}

export function grantMistPattern(state, pattern) {
  if (!["cyclone", "stigma", "reflection"].includes(pattern)) return state;
  return { ...state, patterns: { ...(state.patterns ?? {}), [pattern]: true } };
}

export function consumeMistPending(state, { hit = false, damage = false } = {}) {
  const next = structuredClone(state ?? {});
  if (hit) delete next.nextHit;
  if (damage) delete next.pendingDamage;
  return next;
}

export function resolveMistFormula(formula, props = {}, extra = {}) {
  const values = {
    sab: parseNumber(props.sab_display), fdv: parseNumber(props.fdv_display), dex: parseNumber(props.dex_display),
    for: parseNumber(props.for_display), car: parseNumber(props.car_display), level: Math.max(1, Math.trunc(parseNumber(extra.level ?? props.nvl_num))),
  };
  return String(formula ?? "").replace(/@(sab|fdv|dex|for|car|level)\b/giu, (_match, key) => String(values[String(key).toLowerCase()] ?? 0));
}

export function resolveEightLayersResult(state, hits) {
  const count = Math.max(0, Math.min(5, Math.trunc(parseNumber(hits))));
  let next = structuredClone(state ?? {});
  if (count === 5) next = grantMistPattern(next, "cyclone");
  return {
    hits: count,
    mode: count >= 3 ? "fixed" : "weapon-per-hit",
    formula: count >= 3 ? String(state?.eightLayers?.damage ?? "") : "",
    weaponRolls: count >= 3 ? 0 : count,
    state: next,
  };
}

export function resolveMistReduction(incomingDamage, rolledReduction) {
  const incoming = Math.max(0, Math.trunc(parseNumber(incomingDamage)));
  const reduction = Math.max(0, Math.trunc(parseNumber(rolledReduction)));
  return { incoming, reduction, negated: reduction > incoming, finalDamage: reduction > incoming ? 0 : Math.max(0, incoming - reduction) };
}

export function buildMistBreathingPlan(formId, level, props = {}, choices = {}) {
  const form = mistFormById(formId);
  const selected = form?.levels?.[level - 1];
  if (!form || !selected) return { ok: false, noCost: true, reason: "Forma indisponível neste Nível de Respiração." };
  const state = parseMistBreathingState(props.resp_nevoa_estado);
  const sab = parseNumber(props.sab_display);
  const fdv = parseNumber(props.fdv_display);
  const car = parseNumber(props.car_display);
  const slayerLevel = Math.max(1, Math.trunc(parseNumber(props.nvl_num ?? props.nvl_pj)));
  const base = { ok: true, form, selected, action: form.action, cost: selected.cost, state, patch: {} };

  if (formId === "nevoa_01") {
    state.pendingDamage = { source: formId, formula: resolveMistFormula(selected.bonus, props), uses: 1, contactOnce: true };
  } else if (formId === "nevoa_02") {
    state.nextHit = { source: formId, count: 5, bonus: 2 };
    state.eightLayers = { threshold: 3, damage: selected.damage, weaponDamageBelowThreshold: true };
  } else if (formId === "nevoa_03") {
    state.incomingReduction = { source: formId, formula: resolveMistFormula(selected.reduction, props, { level: slayerLevel }), rangedOnly: true, level: slayerLevel, sab: level >= 3 ? sab : 0 };
    if (choices.kekkijutsuReduced) Object.assign(state, grantMistPattern(state, "stigma"));
  } else if (formId === "nevoa_04") {
    if (!choices.advantageAttack) return { ok: false, noCost: true, reason: "Exige um ataque com Vantagem." };
    if (choices.suppressResistance) base.cost += 1;
    state.pendingDamage = { source: formId, formula: selected.damage, uses: 1, replaceWeaponDamage: true,
      suppressResistanceTurns: choices.suppressResistance ? Math.max(0, parseNumber(choices.suppressAttribute)) : 0 };
    state.nextHit = { source: formId, advantage: true };
  } else if (formId === "nevoa_05") {
    if (choices.doubleCost) base.cost *= 2;
    state.incomingHalfOnFailedSave = { source: formId, saveDc: selected.saveDc.replace("@sab", String(sab)), advantageNextHit: true };
    state.nextHit = { source: formId, advantage: true };
    if (choices.doubleCost) Object.assign(state, grantMistPattern(state, "reflection"));
  } else if (formId === "nevoa_06") {
    if (choices.dexCheckPassed === false) return { ok: false, noCost: true, reason: "Falha no teste de DEX CD 12." };
    const extraAttacks = Math.max(0, Math.trunc(parseNumber(choices.extraAttacks)));
    base.cost += extraAttacks;
    const collapse = mistPatternCount(state) === 3;
    state.nextHit = { source: formId, count: 1 + extraAttacks, bonus: sab, stopOnMiss: true, criticalBonus: fdv };
    state.pendingDamage = collapse ? { source: formId, formula: "@sab", uses: 1 + extraAttacks, criticalFormula: "@fdv" } : undefined;
    state.collapse = collapse;
  } else if (formId === "nevoa_07") {
    if (choices.opposedPassed === false) return { ok: false, noCost: false, reason: "O teste oposto de SAB falhou." };
    const turns = Math.max(3, Math.trunc(car));
    state.fog = { source: formId, turns, bonus: selected.bonus };
  } else if (formId === "nevoa_08") {
    state.dazzle = { source: formId, turns: 5, hitPenalty: selected.hitPenalty, hitBonus: selected.hitBonus ?? 0,
      exhaustionImmune: true, criticalImmunity: Boolean(selected.criticalImmunity), allyUuid: String(choices.allyUuid ?? "") };
  }

  Object.assign(base.patch, mistStatePatch(state, {
    "system.props.resp_nevoa_resumo": `Padrões ${mistPatternCount(state)}/3`,
    "system.props.resp_efeito_flag": `Névoa: ${form.name}`,
    "system.props.resp_efeito_duracao": state.fog?.turns ?? state.dazzle?.turns ?? 0,
    "system.props.resp_bonus_acerto_temp": state.fog?.bonus ?? state.dazzle?.hitBonus ?? state.nextHit?.bonus ?? 0,
    "system.props.resp_bonus_esquiva_temp": state.fog?.bonus ?? 0,
    "system.props.resp_bonus_bloqueio_temp": state.fog?.bonus ?? 0,
    "system.props.resp_bonus_dano_fixo": state.fog?.bonus ?? 0,
  }));
  return base;
}

export function tickMistBreathing(raw) {
  const state = parseMistBreathingState(raw);
  for (const key of ["fog", "dazzle"]) {
    if (state[key]?.turns > 0) {
      state[key].turns -= 1;
      if (state[key].turns <= 0) delete state[key];
    }
  }
  return mistStatePatch(state, {
    "system.props.resp_efeito_duracao": state.fog?.turns ?? state.dazzle?.turns ?? 0,
    "system.props.resp_bonus_acerto_temp": state.fog?.bonus ?? state.dazzle?.hitBonus ?? state.nextHit?.bonus ?? 0,
    "system.props.resp_bonus_esquiva_temp": state.fog?.bonus ?? 0,
    "system.props.resp_bonus_bloqueio_temp": state.fog?.bonus ?? 0,
    "system.props.resp_bonus_dano_fixo": state.fog?.bonus ?? 0,
  });
}

export function clearMistBreathingState(raw) {
  const state = parseMistBreathingState(raw);
  delete state.nextHit;
  delete state.pendingDamage;
  delete state.eightLayers;
  delete state.incomingReduction;
  delete state.incomingHalfOnFailedSave;
  delete state.fog;
  delete state.dazzle;
  delete state.collapse;
  return mistStatePatch(state, {
    "system.props.resp_efeito_duracao": 0,
    "system.props.resp_bonus_acerto_temp": 0,
    "system.props.resp_bonus_esquiva_temp": 0,
    "system.props.resp_bonus_bloqueio_temp": 0,
    "system.props.resp_bonus_dano_fixo": 0,
  });
}
