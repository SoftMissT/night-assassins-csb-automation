import { weaponDamageTypeKeys, weaponProfilesFromProps, weaponPropertyMechanics } from "./weapon-service.mjs";

function sameValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isWeaponItem(item) {
  const props = item?.system?.props ?? {};
  return props.inventario_categoria === "arma"
    || props.arma_nome
    || item?.system?.template === "NAWeaponTpl00001";
}

function profileSummary(profiles) {
  return profiles.map((profile) => profile.formula_texto || profile.nome || "Ataque Base").filter(Boolean).join("\n");
}

function typeSummary(profiles, props) {
  const types = profiles.flatMap((profile) => Array.isArray(profile.tipos_dano) ? profile.tipos_dano : []);
  return weaponDamageTypeKeys(types.length > 0 ? types : props.arma_tipos_dano ?? props.arma_tipos_dano_json).join(", ");
}

function attributeSummary(profiles, props) {
  const attributes = profiles.flatMap((profile) => (Array.isArray(profile.atributos) ? profile.atributos : []).map((rule) => rule?.key).filter(Boolean));
  const fallback = props.arma_dano_atributo ?? props.arma_dano_atributo_json;
  let fallbackAttributes = [];
  try { fallbackAttributes = Array.isArray(fallback) ? fallback : JSON.parse(String(fallback || "[]")); } catch (_) { fallbackAttributes = []; }
  return [...new Set(attributes.length > 0 ? attributes : fallbackAttributes)].join(" ou ");
}

export function weaponRepairChanges(item) {
  if (!isWeaponItem(item)) return null;
  const props = item.system?.props ?? {};
  const changes = {};
  if (props.inventario_categoria !== "arma") {
    changes["system.props.inventario_categoria"] = "arma";
  }
  const profiles = weaponProfilesFromProps(props);
  if (profiles.length > 0) {
    const next = {
      arma_perfis_ataque_json: JSON.stringify(profiles),
      arma_mecanicas_json: JSON.stringify(weaponPropertyMechanics(props)),
      arma_perfis_resumo: profileSummary(profiles),
      arma_tipos_dano_resumo: typeSummary(profiles, props),
      arma_atributos_resumo: attributeSummary(profiles, props),
    };
    for (const [key, value] of Object.entries(next)) {
      if (!sameValue(props[key], value)) changes[`system.props.${key}`] = value;
    }
  }
  return Object.keys(changes).length > 0 ? { _id: item.id, ...changes } : null;
}

export async function repairSlayerWeaponItems({ actors = globalThis.game?.actors?.contents ?? [] } = {}) {
  const updates = actors.map((actor) => {
    const itemUpdates = [...(actor?.items ?? [])].map(weaponRepairChanges).filter(Boolean);
    if (itemUpdates.length === 0) return null;
    return actor.updateEmbeddedDocuments("Item", itemUpdates, { naCsbAutomation: true }).then(() => itemUpdates.length);
  }).filter(Boolean);
  const results = await Promise.all(updates);
  return { actors: results.length, items: results.reduce((total, count) => total + count, 0) };
}
