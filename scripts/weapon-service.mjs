import { MODULE_ID } from "./constants.mjs";
import { parseAttributeValue, parseNumber } from "./parsing.mjs";

export const WEAPON_RANK_LEVELS = Object.freeze({ D: 2, C: 4, B: 6, A: 8, S: 11, SS: 12 });

export function slayerWeaponRank(actorProps = {}) {
  const text = String(actorProps.rank_atual ?? actorProps.rank_slayer_atual ?? "").toUpperCase();
  for (const rank of ["SS", "S", "A", "B", "C", "D"]) {
    if (new RegExp(`(?:RANK\\s*)?${rank}(?:\\b|$)`).test(text)) return rank;
  }
  const level = Math.max(0, Math.trunc(parseNumber(actorProps.nvl_num ?? actorProps.nivel_slayer_num ?? actorProps.nivel)));
  if (level >= 12) return "SS";
  if (level >= 11) return "S";
  if (level >= 8) return "A";
  if (level >= 6) return "B";
  if (level >= 4) return "C";
  if (level >= 2) return "D";
  return "";
}

export function extractWeaponRankFormulas(markdown = "") {
  const section = String(markdown).match(/# DANO POR RANK([\s\S]*?)(?=\n# [^#]|$)/i)?.[1] ?? "";
  const formulas = {};
  for (const match of section.matchAll(/## Rank (SS|S|A|B|C|D)[^\n]*\n+([\s\S]*?)(?=\n## Rank |$)/gi)) {
    const values = [...match[2].matchAll(/`([^`]+)`/g)].map((entry) => entry[1].trim()).filter(Boolean);
    if (values.length > 0) formulas[match[1].toUpperCase()] = values;
  }
  return formulas;
}

function diceFromFormula(formula = "") {
  return [...String(formula).matchAll(/\b\d+d\d+\b/gi)].map((match) => match[0]).join(" + ");
}

function attributeChoiceKeys(formula = "") {
  const keys = new Set();
  for (const match of String(formula).toUpperCase().matchAll(/\b(VIT|DEX|FOR|CAR|FDV|INT|SAB)\b\s+OU\s+\b(VIT|DEX|FOR|CAR|FDV|INT|SAB)\b/g)) {
    keys.add(match[1]);
    keys.add(match[2]);
  }
  return keys;
}

const WEAPON_ATTRIBUTES = new Set(["VIT", "DEX", "FOR", "CAR", "FDV", "INT", "SAB"]);

function parseStructuredValue(value) {
  if (value && typeof value === "object") return value;
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    return JSON.parse(value);
  } catch (_) {
    return null;
  }
}

function textList(value) {
  if (Array.isArray(value)) return value.map((entry) => String(entry ?? "").trim()).filter(Boolean);
  const parsed = parseStructuredValue(value);
  if (Array.isArray(parsed)) return textList(parsed);
  return String(value ?? "")
    .split(/[,;/]|\s+ou\s+|\s+e\s+/iu)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

const DAMAGE_TYPE_ALIASES = Object.freeze({
  "concussao": "concussao",
  "concussivo": "concussao",
  "cortante": "cortante",
  "perfurante": "perfurante",
  "trovejante": "trovejante",
  "sonoro": "sonoro",
  "ferida": "ferida",
  "sangramento": "sangramento",
  "envenenamento": "envenenamento",
  "necrotico": "necrotico",
  "acido": "acido",
  "eletrico": "eletrico",
  "fogo": "fogo",
  "impacto": "impacto",
  "mental": "mental",
  "solar": "solar",
  "venenoso": "venenoso",
  "congelante": "congelante",
});

export function weaponDamageTypeKeys(value = []) {
  return [...new Set(textList(value).map((entry) => String(entry)
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/\s+a?\s*escolha.*$/u, "")
    .trim()).map((entry) => DAMAGE_TYPE_ALIASES[entry] ?? entry).filter((entry) => DAMAGE_TYPE_ALIASES[entry]))];
}

function objectList(value) {
  const parsed = parseStructuredValue(value);
  if (Array.isArray(parsed)) return parsed.filter((entry) => entry && typeof entry === "object");
  return parsed && typeof parsed === "object" ? [parsed] : [];
}

function legacyAttributeMultiplier(itemProps, key) {
  const normalized = String(itemProps.arma_regra_completa ?? itemProps.descricao ?? "")
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "");
  const normalizedKey = String(key).toLocaleLowerCase("pt-BR");
  return new RegExp(`(?:metade(?:\\s+(?:da|de))?|1\\s*/\\s*2)\\s*${normalizedKey}\\b`, "u").test(normalized) ? 0.5 : 1;
}

export function weaponProfilesFromProps(itemProps = {}) {
  const parsedProfiles = parseStructuredValue(itemProps.arma_perfis_ataque)
    ?? parseStructuredValue(itemProps.arma_perfis_ataque_json);
  const profiles = Array.isArray(parsedProfiles)
    ? parsedProfiles.filter((profile) => profile && typeof profile === "object")
    : parsedProfiles && typeof parsedProfiles === "object" ? [parsedProfiles] : [];
  if (profiles.length > 0) return profiles;

  const hasLegacyData = ["arma_dano_dados", "arma_dano_fixo", "arma_dano_atributo", "arma_tipos_dano"].some((key) => itemProps[key] !== undefined && itemProps[key] !== "");
  if (!hasLegacyData) return [];

  const legacyAttributes = textList(itemProps.arma_dano_atributo ?? itemProps.arma_dano_atributo_json)
    .map((key) => key.toUpperCase())
    .filter((key) => WEAPON_ATTRIBUTES.has(key));
  const attributes = legacyAttributes.map((key) => ({
    key,
    multiplicador: legacyAttributeMultiplier(itemProps, key),
    escolha: legacyAttributes.length > 1,
  }));
  const fixed = Number.isFinite(Number(itemProps.arma_dano_fixo)) ? Number(itemProps.arma_dano_fixo) : 0;
  const dice = String(itemProps.arma_dano_dados ?? "").trim();
  const types = weaponDamageTypeKeys(itemProps.arma_tipos_dano ?? itemProps.arma_tipos_dano_json);
  const formulaParts = [fixed || "", dice, attributes.map((rule) => `${rule.multiplicador === 0.5 ? "metade de " : ""}${rule.key}`).join(" ou ")].filter(Boolean);
  return [{
    nome: "Ataque Base",
    formula_texto: [formulaParts.join(" + "), types.join(" ou ")].filter(Boolean).join(" / "),
    dano_dados: dice,
    dano_fixo: fixed,
    atributos: attributes,
    tipos_dano: types,
    alcance: itemProps.arma_alcance,
    critico: itemProps.arma_critico,
  }];
}

export function weaponPropertyKeys(value = "") {
  const normalized = String(value ?? "")
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[ *_]/gu, "");
  return [...new Set(normalized.split(/[/,&;]|\s+e\s+/u).map((part) => part.replace(/\s+\d+$/u, "").trim()).filter(Boolean))];
}

export function weaponAttackAttributes(itemProps = {}, profile = {}) {
  const explicitRaw = parseStructuredValue(itemProps.arma_atributo_acerto)
    ?? parseStructuredValue(itemProps.arma_atributo_acerto_json)
    ?? itemProps.arma_atributo_acerto
    ?? itemProps.arma_atributo_acerto_json
    ?? "";
  const explicit = textList(explicitRaw)
    .map((key) => key.toUpperCase())
    .filter((key) => WEAPON_ATTRIBUTES.has(key));
  if (explicit.length > 0) return [...new Set(explicit)];

  const properties = weaponPropertyKeys(itemProps.arma_propriedades);
  if (properties.includes("acuidade")) return ["FOR", "DEX"];
  if (properties.includes("concussao")) return ["FOR"];
  if (properties.includes("manejavel")) return ["DEX"];

  const profileAttributes = objectList(profile.atributos)
    .map((rule) => String(rule?.key ?? "").toUpperCase())
    .filter((key) => WEAPON_ATTRIBUTES.has(key));
  return [...new Set(profileAttributes)];
}

export function weaponPropertyMechanics(itemProps = {}) {
  const mechanics = objectList(itemProps.arma_mecanicas ?? itemProps.arma_mecanicas_json);
  if (mechanics.length > 0) return mechanics;
  return weaponPropertyKeys(itemProps.arma_propriedades).map((id) => ({ id, kind: "unresolved" }));
}

export function weaponProficiencyNames(actorProps = {}) {
  const raw = actorProps.armas_proficientes ?? actorProps.proficiencias_armas ?? actorProps.proficiencia_armas ?? "";
  if (Array.isArray(raw)) return raw.map((name) => String(name).trim()).filter(Boolean);
  return String(raw).split(/[,;\n]/u).map((name) => name.trim()).filter(Boolean);
}

export function isWeaponProficient(itemProps = {}, actorProps = {}) {
  const names = weaponProficiencyNames(actorProps);
  if (names.length === 0) return true;
  const weaponName = String(itemProps.arma_nome ?? "").trim().toLocaleLowerCase("pt-BR");
  return names.some((name) => String(name).trim().toLocaleLowerCase("pt-BR") === weaponName);
}

export function weaponAmmoState(itemProps = {}, profile = {}) {
  const capacity = Math.max(0, Math.trunc(Number(itemProps.arma_municao_capacidade) || 0));
  const current = capacity > 0 ? Math.max(0, Math.min(capacity, Math.trunc(Number(itemProps.arma_municao_atual ?? capacity)))) : null;
  const shots = Math.max(1, Math.trunc(Number(profile.ataques) || 1));
  return { capacity, current, shots, required: capacity > 0 && current !== null };
}

export function weaponAmmoPatch(itemProps = {}, remaining = 0) {
  if (!itemProps.arma_municao_capacidade) return null;
  return { "system.props.arma_municao_atual": Math.max(0, Math.trunc(Number(remaining) || 0)) };
}

export function weaponProfilesForActor(itemProps = {}, actorProps = {}) {
  const profiles = weaponProfilesFromProps(itemProps);
  const rank = slayerWeaponRank(actorProps);
  const proficient = isWeaponProficient(itemProps, actorProps);
  const parsedRankFormulas = parseStructuredValue(itemProps.arma_formulas_por_rank)
    ?? parseStructuredValue(itemProps.arma_formulas_por_rank_json);
  const rankFormulas = parsedRankFormulas && typeof parsedRankFormulas === "object"
    ? parsedRankFormulas
    : extractWeaponRankFormulas(itemProps.arma_regra_completa);
  const ranked = Array.isArray(rankFormulas[rank]) ? rankFormulas[rank] : [];

  return profiles.map((profile, index) => {
    const rankFormula = ranked[index] ?? ranked[0] ?? "";
    const rankDice = diceFromFormula(rankFormula);
    const baseDice = String(profile.dano_dados ?? "").trim();
    const choiceKeys = attributeChoiceKeys(profile.formula_texto || rankFormula);
    const propertyKeys = weaponPropertyKeys(itemProps.arma_propriedades);
    const profileMode = weaponPropertyKeys(profile.nome).find((key) => ["nitoryu", "ryoto"].includes(key)) ?? "";
    const namedProfiles = profiles.some((entry) => weaponPropertyKeys(entry.nome).some((key) => ["nitoryu", "ryoto"].includes(key)));
    const integratedDouble = !namedProfiles && propertyKeys.includes("ryoto");
    const morote = proficient && propertyKeys.includes("morote");
    const allowedAttributes = proficient ? weaponAttackAttributes(itemProps, profile) : [];
    const sourceAttributes = proficient ? objectList(profile.atributos).map((rule) => ({ ...rule })) : [];
    const generatedMultiplier = morote ? 1 : 0.5;
    const generatedAttributes = allowedAttributes.length > 0 && sourceAttributes.length === 0
      ? allowedAttributes.map((key) => ({ key, multiplicador: generatedMultiplier, escolha: allowedAttributes.length > 1 }))
      : [];
    const attributes = [...sourceAttributes, ...generatedAttributes].map((rule) => {
      const key = String(rule.key ?? "").toUpperCase();
      const promoted = morote && (key === "FOR" || key === "DEX") && Number(rule.multiplicador) > 0;
      return {
        ...rule,
        key,
        multiplicador: promoted ? 1 : rule.multiplicador,
        escolha: rule.escolha === true || choiceKeys.has(key) || (generatedAttributes.length > 1 && (key === "FOR" || key === "DEX")),
      };
    });
    return {
      ...profile,
      tipos_dano: weaponDamageTypeKeys(profile.tipos_dano ?? itemProps.arma_tipos_dano ?? itemProps.arma_tipos_dano_json),
      atributos: attributes,
      dano_dados: [baseDice, rankDice].filter(Boolean).join(" + "),
      rank,
      rank_formula: rankFormula,
      proficiente: proficient,
      propriedade_chaves: propertyKeys,
      modo_propriedade: profileMode || (integratedDouble ? "ryoto" : ""),
      ataques: profileMode || integratedDouble ? 2 : 1,
    };
  });
}

export function weaponActorSummary(actorProps = {}) {
  return {
    rank: slayerWeaponRank(actorProps),
    for: parseAttributeValue(actorProps.for_display),
    dex: parseAttributeValue(actorProps.dex_display),
    fdv: parseAttributeValue(actorProps.fdv_display),
  };
}

/**
 * Check if the weapon has enough ammunition for an attack.
 * @param {object} itemProps
 * @param {object} profile - attack profile with ataques count
 * @returns {{ ok: boolean, reason?: string, current: number|null, required: number }}
 */
export function checkAmmoAvailable(itemProps = {}, profile = {}) {
  const state = weaponAmmoState(itemProps, profile);
  if (!state.required) return { ok: true, current: null, required: 0 };
  const needed = state.shots;
  if (state.current === null || state.current < needed) {
    return {
      ok: false,
      reason: `Munição insuficiente: ${state.current ?? 0}/${state.capacity} (necessário: ${needed})`,
      current: state.current,
      required: needed,
    };
  }
  return { ok: true, current: state.current, required: needed };
}

/**
 * Check if the weapon requires an adapter and if it's installed.
 * @param {object} itemProps
 * @returns {{ required: boolean, installed: boolean, pending: boolean }}
 */
export function checkAdapterStatus(itemProps = {}) {
  const required = Number(itemProps.arma_adapter_necessario) === 1;
  const installed = Number(itemProps.arma_adapter_instalado) === 1;
  return { required, installed, pending: required && !installed };
}

/**
 * Build a patch to consume ammunition after an attack.
 * @param {object} itemProps
 * @param {object} profile
 * @returns {object|null} patch or null if no ammo system
 */
export function consumeAmmoPatch(itemProps = {}, profile = {}) {
  const state = weaponAmmoState(itemProps, profile);
  if (!state.required || state.current === null) return null;
  const remaining = Math.max(0, state.current - state.shots);
  return weaponAmmoPatch(itemProps, remaining);
}

/**
 * Get a summary of the weapon's inline state for display.
 * @param {object} itemProps
 * @param {object} actorProps
 * @returns {object}
 */
export function getWeaponInlineState(itemProps = {}, actorProps = {}) {
  const rank = slayerWeaponRank(actorProps);
  const ammo = weaponAmmoState(itemProps, { ataques: 1 });
  const adapter = checkAdapterStatus(itemProps);
  return {
    rank,
    ammoCurrent: ammo.current,
    ammoCapacity: ammo.capacity,
    ammoRequired: ammo.required,
    adapterPending: adapter.pending,
  };
}

// ---------------------------------------------------------------------------
// Current Weapon Contract (Fase 3)
// ---------------------------------------------------------------------------

const FLAG_NAMESPACE = MODULE_ID;
const MAIN_SLOT = "main";
const OFFHAND_SLOT = "offhand";

/**
 * Get the flag key for a weapon slot.
 * @param {string} slot
 * @returns {{ uuid: string, profileIndex: string }}
 */
function slotFlagKeys(slot = MAIN_SLOT) {
  const prefix = slot === OFFHAND_SLOT ? "offhand" : "current";
  return {
    uuid: `${prefix}WeaponUuid`,
    profileIndex: `${prefix}WeaponProfileIndex`,
  };
}

/**
 * Set the current weapon for an actor.
 * @param {Actor} actor
 * @param {object} options
 * @param {string} options.weaponUuid - UUID of the weapon item
 * @param {string} [options.slot="main"] - "main" or "offhand"
 * @param {number} [options.profileIndex=0] - Attack profile index
 * @returns {Promise<object>} the flag patch applied
 */
export async function setCurrentWeaponForActor(actor, { weaponUuid, slot = MAIN_SLOT, profileIndex = 0 } = {}) {
  if (!actor) throw new Error("setCurrentWeaponForActor: actor is required");
  if (!weaponUuid) throw new Error("setCurrentWeaponForActor: weaponUuid is required");

  const keys = slotFlagKeys(slot);
  const patch = {
    [`flags.${FLAG_NAMESPACE}.${keys.uuid}`]: weaponUuid,
    [`flags.${FLAG_NAMESPACE}.${keys.profileIndex}`]: Math.max(0, Math.trunc(Number(profileIndex) || 0)),
  };
  await actor.update(patch, { [`${FLAG_NAMESPACE}CurrentWeapon`]: true });
  return patch;
}

/**
 * Clear the current weapon for an actor.
 * @param {Actor} actor
 * @param {object} [options]
 * @param {string} [options.slot="main"]
 * @returns {Promise<object>} the flag patch applied
 */
export async function clearCurrentWeaponForActor(actor, { slot = MAIN_SLOT } = {}) {
  if (!actor) throw new Error("clearCurrentWeaponForActor: actor is required");

  const keys = slotFlagKeys(slot);
  const patch = {
    [`flags.${FLAG_NAMESPACE}.${keys.uuid}`]: null,
    [`flags.${FLAG_NAMESPACE}.${keys.profileIndex}`]: null,
  };
  await actor.update(patch, { [`${FLAG_NAMESPACE}CurrentWeapon`]: true });
  return patch;
}

/**
 * Get the current weapon UUID and profile index from actor flags.
 * @param {Actor} actor
 * @param {object} [options]
 * @param {string} [options.slot="main"]
 * @returns {{ weaponUuid: string|null, profileIndex: number }}
 */
export function getCurrentWeaponForActor(actor, { slot = MAIN_SLOT } = {}) {
  if (!actor) return { weaponUuid: null, profileIndex: 0 };

  const keys = slotFlagKeys(slot);
  const flags = actor.flags?.[FLAG_NAMESPACE] ?? {};
  const weaponUuid = flags[keys.uuid] || null;
  const profileIndex = Math.max(0, Math.trunc(Number(flags[keys.profileIndex]) || 0));
  return { weaponUuid, profileIndex };
}

/**
 * Validate that the current weapon still exists and is a valid weapon item.
 * @param {Actor} actor
 * @param {object} [options]
 * @param {string} [options.slot="main"]
 * @returns {Promise<{ valid: boolean, weapon?: Item, reason?: string }>}
 */
export async function validateCurrentWeaponForActor(actor, { slot = MAIN_SLOT } = {}) {
  if (!actor) return { valid: false, reason: "No actor" };

  const { weaponUuid, profileIndex } = getCurrentWeaponForActor(actor, { slot });
  if (!weaponUuid) return { valid: false, reason: "No weapon set" };

  const doc = await fromUuid(weaponUuid);
  const item = doc?.item ?? doc ?? null;

  if (!item) return { valid: false, reason: "Weapon item not found (deleted?)" };
  if (item.parent?.uuid !== actor.uuid) return { valid: false, reason: "Weapon does not belong to this actor" };

  const props = item.system?.props ?? {};
  const isWeapon = item.system?.template === "NAWeaponTpl00001"
    || props.arma_critico !== undefined
    || Boolean(props.arma_nome && (props.arma_dano_fixo !== undefined || props.arma_dano_atributo !== undefined));
  if (!isWeapon) return { valid: false, reason: "Item is not a weapon" };

  return { valid: true, weapon: item, profileIndex };
}

/**
 * Resolve the attack weapon from explicit UUID, actor flags, or dialog.
 * Priority:
 *   1. weaponUuid passed explicitly
 *   2. flag currentWeaponUuid/offhandWeaponUuid
 *   3. open dialog if allowDialog=true
 *   4. return null with error
 *
 * @param {Actor} actor
 * @param {object} [options]
 * @param {string} [options.weaponUuid]
 * @param {string} [options.slot="main"]
 * @param {number} [options.profileIndex]
 * @param {boolean} [options.allowDialog=true]
 * @param {boolean} [options.persistSelection=true]
 * @returns {Promise<{ weapon: Item|null, weaponUuid: string|null, profileIndex: number, fromDialog: boolean }>}
 */
export async function resolveAttackWeaponForActor(actor, {
  weaponUuid: explicitUuid,
  slot = MAIN_SLOT,
  profileIndex: explicitProfileIndex,
  allowDialog = true,
  persistSelection = true,
} = {}) {
  if (!actor) return { weapon: null, weaponUuid: null, profileIndex: 0, fromDialog: false };

  // Priority 1: explicit UUID
  if (explicitUuid) {
    const doc = await fromUuid(explicitUuid);
    const item = doc?.item ?? doc ?? null;
    if (item && item.parent?.uuid === actor.uuid) {
      if (persistSelection) {
        await setCurrentWeaponForActor(actor, { weaponUuid: explicitUuid, slot, profileIndex: explicitProfileIndex ?? 0 });
      }
      return { weapon: item, weaponUuid: explicitUuid, profileIndex: explicitProfileIndex ?? 0, fromDialog: false };
    }
  }

  // Priority 2: flag
  const { weaponUuid: flagUuid, profileIndex: flagProfileIndex } = getCurrentWeaponForActor(actor, { slot });
  if (flagUuid) {
    const validation = await validateCurrentWeaponForActor(actor, { slot });
    if (validation.valid) {
      return { weapon: validation.weapon, weaponUuid: flagUuid, profileIndex: explicitProfileIndex ?? flagProfileIndex, fromDialog: false };
    }
    // Flag points to deleted/invalid weapon — clear it
    await clearCurrentWeaponForActor(actor, { slot });
  }

  // Priority 3: dialog
  if (allowDialog) {
    return { weapon: null, weaponUuid: null, profileIndex: 0, fromDialog: true };
  }

  // Priority 4: no weapon
  return { weapon: null, weaponUuid: null, profileIndex: 0, fromDialog: false };
}
