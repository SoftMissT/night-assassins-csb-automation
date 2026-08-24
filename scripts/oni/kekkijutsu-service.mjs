import kekkijutsuCatalog from "../../catalogs/oni-kekkijutsus.json" with { type: "json" };

const TECHNIQUES_BY_ID = new Map(kekkijutsuCatalog.techniques.map((t) => [t.id, Object.freeze(t)]));
const VALID_ACTIONS = new Set(kekkijutsuCatalog.actionTypes);
const UNLOCK_LEVELS = Object.freeze(new Set(kekkijutsuCatalog.unlockLevels));

function integer(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : fallback;
}

export const KEKKIJUTSU_IDS = Object.freeze([...TECHNIQUES_BY_ID.keys()]);
export const KEKKIJUTSU_ACTION_TYPES = Object.freeze([...VALID_ACTIONS]);

export function getKekkijutsu(id) {
  return TECHNIQUES_BY_ID.get(String(id ?? "").trim().toLocaleLowerCase("pt-BR")) ?? null;
}

export function isKekkijutsuItem(item) {
  const props = item?.system?.props ?? {};
  return Boolean(props.kekki_id || props.kekkijutsu_id || item?.system?.template === "NAKekkijutsuTpl001");
}

export function normalizeKekkijutsu(item) {
  const props = item?.system?.props ?? {};
  const id = props.kekki_id ?? props.kekkijutsu_id ?? null;
  const catalog = id ? getKekkijutsu(id) : null;
  if (catalog) return catalog;
  const damage = [];
  if (props.kekki_dmg_dice) damage.push({ dice: props.kekki_dmg_dice, type: props.kekki_dmg_type ?? "cortante" });
  return Object.freeze({
    id: id ?? "unknown",
    name: props.kekki_nome ?? props.name ?? item?.name ?? "Kekkijutsu",
    origin: props.kekki_origem ?? null,
    unlockLevel: integer(props.kekki_nivel_desbloqueio, 3),
    rank: props.kekki_rank ?? "inicial",
    action: props.kekki_acao ?? "especial",
    pdkCost: integer(props.kekki_pdk_custo, 1),
    range: integer(props.kekki_alcance, 0),
    target: props.kekki_alvo ?? "unico",
    testType: props.kekki_teste_tipo ?? "none",
    testFormula: props.kekki_teste_formula ?? "",
    cdFormula: props.kekki_cd_formula ?? "",
    damage,
    status: [],
    duration: integer(props.kekki_duracao, 0),
    limit: props.kekki_limite ?? "1x/turno",
    narrative: props.kekki_narrativa ?? "",
  });
}

export function validateKekkijutsuUse(actor, technique, context = {}) {
  const errors = [];
  const props = actor?.system?.props ?? {};
  const level = integer(context.level ?? props.nvl_num ?? props.nivel_oni_num ?? 1);
  const currentPdk = integer(context.currentPdk ?? props.pdk_oni_atual_num ?? 0);
  const techniqueLevel = integer(technique.unlockLevel);
  if (level < techniqueLevel) errors.push(`Nível insuficiente: requer ${techniqueLevel}, atual ${level}.`);
  if (currentPdk < technique.pdkCost) errors.push(`PDK insuficiente: requer ${technique.pdkCost}, atual ${currentPdk}.`);
  if (!VALID_ACTIONS.has(technique.action)) errors.push(`Ação inválida: ${technique.action}.`);
  const usedThisTurn = props[`kekki_uso_${technique.id}_turno`];
  if (usedThisTurn === true || usedThisTurn === "true") errors.push("Kekkijutsu já usado neste turno.");
  if (technique.limit?.includes("cena") || technique.limit?.includes("combate")) {
    const usedThisScene = props[`kekki_uso_${technique.id}_cena`];
    if (usedThisScene === true || usedThisScene === "true") errors.push("Kekkijutsu já usado nesta cena/combate.");
  }
  return Object.freeze({ ok: errors.length === 0, errors, level, currentPdk });
}

export function buildKekkijutsuAttack(technique, actorAttrs = {}) {
  const damageComponents = (technique.damage ?? []).map((d, i) => ({
    id: `${technique.id}_dmg_${i}`,
    label: d.dice,
    formula: d.dice,
    types: [d.type],
    onFail: d.onFail ?? "full",
    onSuccess: d.onSuccess ?? "half",
  }));
  return Object.freeze({
    techniqueId: technique.id,
    techniqueName: technique.name,
    action: technique.action,
    pdkCost: technique.pdkCost,
    range: technique.range,
    target: technique.target,
    testType: technique.testType,
    testFormula: technique.testFormula,
    cdFormula: technique.cdFormula,
    damage: damageComponents,
    status: technique.status ?? [],
    duration: technique.duration ?? 0,
    limit: technique.limit ?? "1x/turno",
    narrative: technique.narrative ?? "",
    attributeTerms: technique.testType !== "none" && technique.testType
      ? [{ key: technique.testType.toUpperCase(), multiplier: 1, rounding: "floor" }]
      : [],
  });
}

export function buildKekkijutsuUsePatch(technique) {
  const patch = {
    [`system.props.kekki_uso_${technique.id}_turno`]: true,
  };
  if (technique.limit?.includes("cena") || technique.limit?.includes("combate")) {
    patch[`system.props.kekki_uso_${technique.id}_cena`] = true;
  }
  return Object.freeze(patch);
}

export function buildKekkijutsuPdkPatch(currentGasto, cost) {
  return Object.freeze({
    "system.props.pdk_oni_gasto_valor": Math.max(0, integer(currentGasto)) + Math.max(0, integer(cost)),
  });
}

export function resetKekkijutsuTurnState(props = {}) {
  const patch = {};
  for (const key of Object.keys(props)) {
    if (key.startsWith("kekki_uso_") && key.endsWith("_turno")) {
      patch[`system.props.${key}`] = false;
    }
  }
  return Object.freeze(patch);
}

export function resetKekkijutsuSceneState(props = {}) {
  const patch = {};
  for (const key of Object.keys(props)) {
    if (key.startsWith("kekki_uso_") && (key.endsWith("_cena") || key.endsWith("_combate"))) {
      patch[`system.props.${key}`] = false;
    }
  }
  return Object.freeze(patch);
}

export function kekkijutsuPotenciacao(technique, extraPdk) {
  if (!technique.potenciacao) return null;
  return Object.freeze({
    extraPdk: integer(extraPdk),
    rangeBonus: technique.potenciacao.rangeBonus ?? 0,
    cdBonus: technique.potenciacao.cdBonus ?? 0,
    totalPdkCost: technique.pdkCost + integer(technique.potenciacao.extraPdk),
  });
}
