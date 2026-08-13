const ONI_TEMPLATE_IDS = new Set(["pqr15wsdsqbcn15w"]);
const SLAYER_TEMPLATE_IDS = new Set(["naslayertpl00001", "xif9qdbxtkel1bxw"]);

function clean(value) {
  return String(value ?? "").trim().toLocaleLowerCase("pt-BR");
}

function templateMarkers(actor) {
  return [actor?.id, actor?.name, actor?.system?.template, actor?.system?.templateId, actor?.prototypeToken?.name].map(clean);
}

export function actorKind(actor) {
  const props = actor?.system?.props ?? {};
  const markers = templateMarkers(actor);
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
  return explicitSlayer ? "slayer" : null;
}

export const isOniActor = (actor) => actorKind(actor) === "oni";
export const isSlayerActor = (actor) => actorKind(actor) === "slayer";
