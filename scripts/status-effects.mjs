/**
 * @fileoverview Resolução mecânica pura dos status do Slayer.
 */

import { parseStatusState } from "./status-service.mjs";

function statusContext(props = {}) {
  const state = parseStatusState(props.status_slayer_dados);
  const exhaustion = Math.max(state.exhaustion, Number.parseInt(props.status_slayer_exaustao, 10) || 0);
  return { active: new Set(state.active), exhaustion };
}

export function mergeRollMode(requested = "normal", forced = "normal") {
  const modes = new Set([requested, forced].filter((mode) => mode === "advantage" || mode === "disadvantage"));
  if (modes.size !== 1) return "normal";
  return modes.has("advantage") ? "advantage" : "disadvantage";
}

function forcedMode(active, disadvantage) {
  const advantage = active.has("vantagem");
  const hasDisadvantage = active.has("desvantagem") || disadvantage;
  if (advantage === hasDisadvantage) return "normal";
  return advantage ? "advantage" : "disadvantage";
}

export function getRollStatusEffects(props = {}, { test = "", attr = "", kind = "test" } = {}) {
  const { active, exhaustion } = statusContext(props);
  const attribute = String(attr).trim().toUpperCase();
  const testName = String(test).trim().toLowerCase();
  const attack = kind === "attack";
  const defense = kind === "defense" || testName === "bloqueio" || testName === "esquiva";
  const resistance = testName.includes("resist");
  const initiative = testName.includes("iniciativa");
  const reasons = [];
  let modifier = 0;
  let disadvantage = false;

  const blocked = !defense && (active.has("atordoamento") || active.has("suprimido") || active.has("sonhando") || exhaustion >= 7);
  if (blocked) reasons.push("incapacitado");

  if (active.has("fratura") && attribute === "FOR") { modifier -= 2; reasons.push("Fratura −2 FOR"); }
  if (exhaustion >= 2 && attribute === "DEX") { modifier -= 2; reasons.push("Exaustão 2 −2 DEX"); }
  if (active.has("fadiga_espiritual") && attribute === "FDV" && resistance) { modifier -= 2; reasons.push("Fadiga Espiritual −2 resistência FDV"); }
  if (active.has("fadiga_mental") && (attribute === "SAB" || initiative)) { disadvantage = true; reasons.push("Fadiga Mental: Desvantagem"); }

  if (active.has("cegueira_parcial") && (attack || defense)) { modifier -= 2; reasons.push("Cegueira Parcial −2"); }
  if (active.has("cegueira_parcial") && attribute === "SAB" && testName.includes("percep")) {
    disadvantage = true;
    reasons.push("Cegueira Parcial: Desvantagem visual");
  }
  if (active.has("surdez_parcial") && attribute === "SAB" && testName.includes("percep")) {
    modifier -= 2;
    reasons.push("Surdez Parcial −2 percepção auditiva");
  }

  if (attack) {
    if (active.has("desorientado")) { modifier -= 2; reasons.push("Desorientado −2 Ataque"); }
    if (exhaustion >= 1) { modifier -= 1; reasons.push("Exaustão 1 −1 Ataque"); }
    if (exhaustion >= 4) { disadvantage = true; reasons.push("Exaustão 4: Desvantagem"); }
    if (active.has("encorajado")) { modifier += 2; reasons.push("Encorajado +2 Ataque"); }
  }

  if (defense) {
    if (active.has("desequilibrado")) { modifier -= 2; reasons.push("Desequilibrado −2 Defesa"); }
    if (active.has("flanqueado")) { modifier -= 2; reasons.push("Flanqueado −2 Defesa"); }
    if (active.has("encorajado") && testName === "esquiva") { modifier += 1; reasons.push("Encorajado +1 Esquiva"); }
  }

  if (resistance && attribute === "FDV" && active.has("encorajado")) {
    modifier += 2;
    reasons.push("Encorajado +2 FDV");
  }

  return { blocked, mode: forcedMode(active, disadvantage), modifier, reasons, exhaustion };
}

export function getDamageStatusEffects(props = {}) {
  const { active, exhaustion } = statusContext(props);
  const reasons = [];
  let modifier = 0;
  let pdrSurcharge = 0;
  if (exhaustion >= 1) { modifier -= 1; reasons.push("Exaustão 1 −1 Dano"); }
  if (active.has("fadiga_espiritual")) { pdrSurcharge = 1; reasons.push("Fadiga Espiritual +1 PDR"); }
  const criticalAllowed = !active.has("fadiga_corporal");
  if (!criticalAllowed) reasons.push("Fadiga Corporal impede crítico");
  const blocked = active.has("atordoamento") || active.has("suprimido") || active.has("sonhando") || exhaustion >= 7;
  return { blocked, criticalAllowed, modifier, pdrSurcharge, reasons };
}

export function isReactionBlocked(props = {}) {
  const { active, exhaustion } = statusContext(props);
  return exhaustion >= 7 || ["atordoamento", "suprimido", "sonhando", "frenesi", "desorientado", "distraido"]
    .some((key) => active.has(key));
}
