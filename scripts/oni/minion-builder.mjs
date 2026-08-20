import minionCatalog from "../../catalogs/oni-minion-packages.json" with { type: "json" };

const SEVEN = ["vit", "dex", "for", "car", "fdv", "int", "sab"];

const PACKAGES_BY_ID = new Map(minionCatalog.packages.map((p) => [p.id, Object.freeze(p)]));
const TYPES_BY_ID = new Map(Object.entries(minionCatalog.types).map(([id, t]) => [id, Object.freeze(t)]));
const TRAITS_BY_ID = new Map(minionCatalog.traits.map((t) => [t.id, Object.freeze(t)]));
const ATTACKS_BY_ID = new Map(minionCatalog.attacks.map((a) => [a.id, Object.freeze(a)]));

function integer(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export const MINION_TYPE_IDS = Object.freeze([...TYPES_BY_ID.keys()]);
export const MINION_PACKAGE_IDS = Object.freeze([...PACKAGES_BY_ID.keys()]);
export const MINION_TRAIT_IDS = Object.freeze([...TRAITS_BY_ID.keys()]);
export const MINION_ATTACK_IDS = Object.freeze([...ATTACKS_BY_ID.keys()]);
export const MINION_WEAKNESSES = Object.freeze([...minionCatalog.weaknesses]);

export function sceneScale(highestSlayerLevel = 1, slayerCount = 1) {
  return Math.max(1, integer(highestSlayerLevel) + Math.max(1, integer(slayerCount)));
}

export function minionLevel(typeId, highestSlayerLevel = 1, slayerCount = 1) {
  const type = TYPES_BY_ID.get(String(typeId ?? "").trim().toLocaleLowerCase("pt-BR"));
  if (!type) return 1;
  const scale = sceneScale(highestSlayerLevel, slayerCount);
  const raw = scale + type.levelOffset;
  return clamp(integer(raw, 1), minionCatalog.levelMin, minionCatalog.levelMax);
}

export function getMinionPackage(packageId) {
  return PACKAGES_BY_ID.get(String(packageId ?? "").trim().toLocaleLowerCase("pt-BR")) ?? null;
}

export function getMinionAttack(attackId) {
  return ATTACKS_BY_ID.get(String(attackId ?? "").trim().toLocaleLowerCase("pt-BR")) ?? null;
}

export function getMinionTrait(traitId) {
  return TRAITS_BY_ID.get(String(traitId ?? "").trim().toLocaleLowerCase("pt-BR")) ?? null;
}

export function minionPdv(typeId, level, vitality = 0) {
  const type = TYPES_BY_ID.get(String(typeId ?? "").trim().toLocaleLowerCase("pt-BR"));
  if (!type) return 0;
  const vit = Math.max(0, integer(vitality));
  const lvl = clamp(integer(level, 1), minionCatalog.levelMin, minionCatalog.levelMax);
  return type.pdvBase + lvl + vit;
}

export function minionPdk(typeId, fdv = 0) {
  const type = TYPES_BY_ID.get(String(typeId ?? "").trim().toLocaleLowerCase("pt-BR"));
  if (!type) return 0;
  return type.pdkBase + Math.max(0, integer(fdv));
}

export function buildMinion({ type = "fraco", package: packageId = "bruto", attack = "garras", trait = "regeneracao_fraca", weakness = 0, highestSlayerLevel = 1, slayerCount = 1, name = "" } = {}) {
  const pkg = getMinionPackage(packageId);
  if (!pkg) throw new Error(`Pacote de Minion inválido: ${packageId}`);
  const lvl = minionLevel(type, highestSlayerLevel, slayerCount);
  const attrs = pkg.attributes;
  const vit = integer(attrs.vit);
  const fdv = integer(attrs.fdv);
  const pdv = minionPdv(type, lvl, vit);
  const pdk = minionPdk(type, fdv);
  const attackDef = getMinionAttack(attack);
  const traitDef = getMinionTrait(trait);
  const weaknessIndex = clamp(integer(weakness, 0), 0, MINION_WEAKNESSES.length - 1);
  const weaknessText = MINION_WEAKNESSES[weaknessIndex];

  return Object.freeze({
    name: name || `Minion ${pkg.name} ${type}`,
    type: String(type).trim().toLocaleLowerCase("pt-BR"),
    level: lvl,
    package: pkg.id,
    attributes: Object.freeze({ ...attrs }),
    vit, fdv,
    pdv, pdk,
    attack: attackDef ? Object.freeze({ id: attackDef.id, name: attackDef.name, dice: attackDef.dice, damageType: attackDef.damageType, testAttribute: attackDef.testAttribute }) : null,
    trait: traitDef ? Object.freeze({ id: traitDef.id, name: traitDef.name, category: traitDef.category, source: traitDef.source, description: traitDef.description }) : null,
    weakness: weaknessText,
    sceneScale: sceneScale(highestSlayerLevel, slayerCount),
  });
}

export function buildMinionProps(minion) {
  const props = {};
  props.oni_minion_nome = minion.name;
  props.oni_minion_tipo = minion.type;
  props.oni_minion_nivel = minion.level;
  props.oni_minion_pacote = minion.package;
  props.oni_minion_pdv_base = minion.pdv;
  props.oni_minion_pdv_dano = 0;
  props.oni_minion_pdv_curado = 0;
  props.oni_minion_pdv_total_label = String(minion.pdv);
  props.oni_minion_pdk_base = minion.pdk;
  props.oni_minion_pdk_gasto = 0;
  props.oni_minion_pdk_recuperado = 0;
  props.oni_minion_pdk_total_label = String(minion.pdk);
  props.oni_minion_traco = minion.trait?.id ?? "";
  props.oni_minion_traco_nome = minion.trait?.name ?? "";
  props.oni_minion_ataque = minion.attack?.id ?? "";
  props.oni_minion_ataque_nome = minion.attack?.name ?? "";
  props.oni_minion_fraqueza = minion.weakness;
  for (const attr of SEVEN) {
    props[`oni_minion_${attr}_base`] = integer(minion.attributes[attr]);
    props[`oni_minion_${attr}_display_label`] = String(integer(minion.attributes[attr]));
  }
  return Object.freeze(props);
}

export function recommendedCount(slayerCount = 1, danger = "media") {
  const table = {
    facil: { 1: [1], 2: [2], 3: [3], 4: [4], 5: [5] },
    media: { 1: [1], 2: [2], 3: [2, 1], 4: [3], 5: [4] },
    perigosa: { 1: [1], 2: [1, 1], 3: [2], 4: [2, 1], 5: [2, 2] },
  };
  const dangerKey = ["facil", "media", "perigosa"].includes(String(danger).trim().toLocaleLowerCase("pt-BR")) ? String(danger).trim().toLocaleLowerCase("pt-BR") : "media";
  const count = clamp(integer(slayerCount, 1), 1, 5);
  return Object.freeze(table[dangerKey][count] ?? [1]);
}
