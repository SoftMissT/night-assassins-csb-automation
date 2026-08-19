import { MODULE_ID } from "./constants.mjs";

const PACK_ID = `${MODULE_ID}.night-assassins-respiracoes`;
const BREATH_TEMPLATE_ID = "NABreathTpl00001";

function normalizeKey(value) {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^a-z0-9]/gu, "");
}

function hasLevels(props) {
  return props.tem_nvl1 !== undefined
    || props.tem_nvl2 !== undefined
    || props.tem_nvl3 !== undefined
    || props.tem_nvl4 !== undefined;
}

export function buildCanonicalBreathMap(documents) {
  const byName = new Map();
  const byId = new Map();
  for (const document of documents ?? []) {
    if (document?.type !== "equippableItem") continue;
    const props = document?.system?.props ?? {};
    const nameKey = normalizeKey(document.name);
    const idKey = String(props.forma_id ?? "").trim().toLocaleLowerCase("pt-BR");
    if (nameKey) byName.set(nameKey, document);
    if (idKey) byId.set(idKey, document);
  }
  return { byName, byId };
}

function isBreathingLike(props) {
  return Boolean(props.forma_id)
    || Boolean(props.nome_forma)
    || Boolean(props.respiracao_nome);
}

export function breathingItemPatch(item, canonical) {
  if (!item) return null;
  const props = item?.system?.props ?? {};
  const alreadyCanonical = item.system?.template === BREATH_TEMPLATE_ID
    && props.inventario_categoria === "respiracao"
    && Boolean(props.forma_id)
    && Boolean(props.respiracao_nome)
    && hasLevels(props);
  if (alreadyCanonical) return null;

  if (canonical) {
    const canonicalProps = canonical.system?.props ?? {};
    const mergedProps = {};
    for (const [key, value] of Object.entries(canonicalProps)) mergedProps[key] = value;
    for (const [key, value] of Object.entries(props)) {
      if (!(key in mergedProps)) mergedProps[key] = value;
    }
    return {
      _id: item.id ?? item._id,
      name: canonical.name,
      img: canonical.img,
      system: {
        template: canonical.system?.template ?? BREATH_TEMPLATE_ID,
        props: mergedProps,
      },
      flags: {
        ...(item.flags ?? {}),
        [MODULE_ID]: {
          ...(item.flags?.[MODULE_ID] ?? {}),
          breathRepaired: true,
        },
      },
    };
  }

  if (isBreathingLike(props) && props.inventario_categoria !== "respiracao") {
    return {
      _id: item.id ?? item._id,
      "system.props.inventario_categoria": "respiracao",
    };
  }

  return null;
}

/**
 * Corrige as Formas de Respiração existentes nos Actors usando o Compendium canônico.
 * @param {object} [options]
 * @param {object[]} [options.actors] Actors a reparar (padrão: todos os Actors do mundo).
 * @returns {Promise<{actors: number, items: number}>}
 */
export async function repairBreathingItems({ actors = globalThis.game?.actors?.contents ?? [] } = {}) {
  const pack = game.packs.get(PACK_ID);
  if (!pack) throw new Error(`Compendium ${PACK_ID} não encontrado.`);

  const documents = await pack.getDocuments();
  const { byName, byId } = buildCanonicalBreathMap(documents);

  const updatesPerActor = actors.map((actor) => {
    const itemUpdates = [...(actor?.items ?? [])]
      .map((item) => {
        const props = item?.system?.props ?? {};
        const canonical = byId.get(String(props.forma_id ?? "").trim().toLocaleLowerCase("pt-BR"))
          ?? byName.get(normalizeKey(item?.name));
        return breathingItemPatch(item, canonical);
      })
      .filter(Boolean);
    if (itemUpdates.length === 0) return null;
    return actor.updateEmbeddedDocuments("Item", itemUpdates, { naCsbAutomation: true }).then(() => itemUpdates.length);
  }).filter(Boolean);

  const results = await Promise.all(updatesPerActor);
  return {
    actors: results.length,
    items: results.reduce((total, count) => total + count, 0),
  };
}