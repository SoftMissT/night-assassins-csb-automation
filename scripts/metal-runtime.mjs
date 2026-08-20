import { parseNumber } from "./parsing.mjs";
import { resolveMetalCriticalFailureOpportunity } from "./metal-breathing-service.mjs";

const HAMMER_SYNERGIES = new Set(["chamas", "pedra", "magma"]);

function normalizedBreathing(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

export function slayerPdrAvailable(props = {}) {
  const maximum = Math.max(0,
    parseNumber(props.pdr_slayer_total_conta)
      + parseNumber(props.metal_slayer_pdr_bonus)
      + parseNumber(props.pdr_slayer_extra));
  return Math.max(0, Math.min(maximum,
    maximum + parseNumber(props.pdr_slayer_curado) - parseNumber(props.pdr_slayer_gasto_valor)));
}

export function actorMetalHammerSynergy(actor) {
  const breathing = [...(actor?.items ?? [])]
    .map((item) => normalizedBreathing(item?.system?.props?.respiracao_nome))
    .find((name) => HAMMER_SYNERGIES.has(name));
  return breathing || "";
}

/** Lista somente aliados presentes que conhecem a sinergia e podem pagar 1 PDR. */
export function metalHammerSynergyAllies(attacker, actors = [], { isAlly = () => true } = {}) {
  return actors.flatMap((actor) => {
    if (!actor?.uuid || actor.uuid === attacker?.uuid || isAlly(actor, attacker) !== true) return [];
    const breathing = actorMetalHammerSynergy(actor);
    const pdrAvailable = slayerPdrAvailable(actor.system?.props ?? {});
    if (!breathing || pdrAvailable < 1) return [];
    return [{ actor, uuid: actor.uuid, name: actor.name || "Aliado", breathing, pdrAvailable }];
  });
}

/** Patch atômico que cobra o PDR da sinergia sem alterar o máximo. */
export function spendMetalHammerSynergyPdr(ally, cost = 1) {
  const props = ally?.system?.props ?? {};
  const amount = Math.max(0, Math.trunc(parseNumber(cost)));
  if (!ally?.uuid || amount < 1) return { ok: false, reason: "Aliado inválido para a sinergia." };
  if (!actorMetalHammerSynergy(ally)) return { ok: false, reason: "O aliado não possui Respiração sinérgica." };
  if (slayerPdrAvailable(props) < amount) return { ok: false, reason: "O aliado não possui PDR suficiente." };
  return {
    ok: true,
    cost: amount,
    patch: { "system.props.pdr_slayer_gasto_valor": parseNumber(props.pdr_slayer_gasto_valor) + amount },
  };
}

/** Converte o erro crítico e o acerto da oportunidade em entrada para rollDamage. */
export function buildInabalavelOpportunityDamage(raw, { enemyNatural = 0, opportunityHit = false } = {}) {
  const resolution = resolveMetalCriticalFailureOpportunity(raw, {
    enemyCriticalFailure: Number(enemyNatural) === 1,
    opportunityHit,
  });
  if (!resolution.applyDamage) return { ...resolution, entries: [] };
  return {
    ...resolution,
    entries: [{ tipoAcao: "reacao", dado: resolution.formula, fixo: 0, attrs: [], tiposDano: [resolution.type] }],
  };
}
