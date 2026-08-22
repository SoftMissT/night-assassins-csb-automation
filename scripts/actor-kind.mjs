const ONI_MINION_TEMPLATE_IDS = new Set(["naoniminiontpl001"]);
const ONI_TEMPLATE_IDS = new Set(["pqr15wsdsqbcn15w"]);
const SLAYER_TEMPLATE_IDS = new Set(["naslayertpl00001", "xif9qdbxtkel1bxw"]);
const NPC_TEMPLATE_IDS = new Set(["nanpctemplate001"]);

function clean(value) {
  return String(value ?? "").trim().toLocaleLowerCase("pt-BR");
}

function templateMarkers(actor) {
  return [actor?.id, actor?.name, actor?.system?.template, actor?.system?.templateId, actor?.prototypeToken?.name].map(clean);
}

export function actorKind(actor) {
  const props = actor?.system?.props ?? {};
  const markers = templateMarkers(actor);
  const explicitOniMinion = props.oni_minion_nome !== undefined
    || props.oni_minion_tipo !== undefined
    || props.oni_minion_pdv_base !== undefined
    || props.oni_minion_pdk_base !== undefined
    || markers.some((value) => value === "oni_minion_template" || value.includes("oni_minion_template") || ONI_MINION_TEMPLATE_IDS.has(value));
  if (explicitOniMinion) return "oni_minion";

  const explicitOni = props.nome_oni !== undefined
    || props.classe_oni_escolha !== undefined
    || props.pdv_oni_total_conta !== undefined
    || props.pdv_oni_total_valor !== undefined
    || props.pdk_oni_total_conta !== undefined
    || props.pdk_oni_total_valor !== undefined
    || markers.some((value) => value === "oni_template" || value.includes("oni_template") || ONI_TEMPLATE_IDS.has(value));
  if (explicitOni) return "oni";

  const explicitSlayer = props.nome_slayer !== undefined
    || props.pdv_slayer_total_conta !== undefined
    || props.pdv_slayer_total_valor !== undefined
    || markers.some((value) => value.includes("slayer_template") || SLAYER_TEMPLATE_IDS.has(value));
  if (explicitSlayer) return "slayer";

  const explicitNpc = props.npc_nome !== undefined
    || props.npc_papel !== undefined
    || props.npc_pdv_base !== undefined
    || markers.some((value) => value.includes("npc_template") || NPC_TEMPLATE_IDS.has(value));
  return explicitNpc ? "npc" : null;
}

export const isOniMinionActor = (actor) => actorKind(actor) === "oni_minion";
export const isOniActor = (actor) => actorKind(actor) === "oni";
export const isSlayerActor = (actor) => actorKind(actor) === "slayer";
export const isNpcActor = (actor) => actorKind(actor) === "npc";
