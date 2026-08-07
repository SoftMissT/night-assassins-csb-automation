/**
 * @fileoverview Serviço de rolagem geral (teste).
 */

import { ATTR_NAMES } from "./constants.mjs";
import { parseAttributeValue } from "./parsing.mjs";
import { openRollDialog } from "./dialogs/roll-dialog.mjs";
import { getRollStatusEffects, mergeRollMode } from "./status-effects.mjs";

function getDice(mode) {
  if (mode === "advantage") return "2d20kh1";
  if (mode === "disadvantage") return "2d20kl1";
  return "1d20";
}

function getModeLabel(mode) {
  if (mode === "advantage") return "Vantagem";
  if (mode === "disadvantage") return "Desvantagem";
  return "Normal";
}

function parseBonus(raw) {
  const s = (raw || "").trim();
  if (!s) return { extra: "", display: "" };
  const clean = s.replace(/^\+/, "");
  return { extra: clean ? `+ ${clean}` : "", display: s };
}

function buildFormula(mode, val, secVal, bonusExtra, statusModifier = 0) {
  const dice = getDice(mode);
  let base = `${dice} + ${val}`;
  if (secVal) base += ` + ${secVal}`;
  if (statusModifier) base += statusModifier > 0 ? ` + ${statusModifier}` : ` - ${Math.abs(statusModifier)}`;
  return bonusExtra ? `${base} ${bonusExtra}` : base;
}

async function doRoll({ actor, test, attr, val, mode, rollMode, secVal, bonusRaw, cdVal, statusEffects }) {
  mode = mergeRollMode(mode, statusEffects.mode);
  const { extra, display } = parseBonus(bonusRaw);
  const formula = buildFormula(mode, val, secVal, extra, statusEffects.modifier);

  let roll;
  try {
    roll = await Roll.create(formula).evaluate();
  } catch (err) {
    ui.notifications?.error?.(`Erro na fórmula: ${formula}`);
    return;
  }

  const modeLabel = getModeLabel(mode);
  const attrLine = attr ? `${attr} = ${val}` : "";
  const secLine = secVal ? ` + ${attr.toUpperCase?.() ?? "?"} = ${secVal}` : "";
  const bonusLine = display ? ` | Bônus: ${display}` : "";
  const statusLine = statusEffects.reasons.length ? ` | Status: ${statusEffects.reasons.join(", ")}` : "";

  let cdLine = "";
  if (cdVal > 0) {
    const passou = roll.total >= cdVal;
    cdLine = ` | CD ${cdVal} → ${passou ? "✅ Sucesso!" : "❌ Falha!"}`;
  }

  await roll.toMessage({
    flavor: `<strong>${test}</strong> (${modeLabel})${attrLine ? " — " + attrLine : ""}${secLine}${bonusLine}${statusLine}${cdLine}`,
    speaker: ChatMessage.getSpeaker({ actor }),
    rollMode: rollMode,
  });
}

/**
 * Resolves an Actor from options.
 * @param {object} options
 * @returns {Actor|null}
 */
async function resolveActor(options) {
  if (options.actor && typeof options.actor.update === "function") return options.actor;
  if (options.actorUuid) {
    const doc = await fromUuid(options.actorUuid);
    return doc?.actor ?? doc ?? null;
  }
  const controlled = canvas?.tokens?.controlled;
  if (controlled?.length > 0) return controlled[0].actor;
  return game?.user?.character ?? null;
}

/**
 * API pública: rolagem geral de teste.
 * @param {object} options
 * @param {Actor} [options.actor]
 * @param {string} [options.actorUuid]
 * @param {string} options.test
 * @param {string} options.attr
 * @param {string} [options.color]
 * @returns {Promise<void>}
 */
export async function rollTest(options) {
  const actor = await resolveActor(options);
  if (!actor) {
    ui.notifications?.warn?.("Nenhum Actor encontrado para rolagem.");
    return;
  }

  const test = options.test ?? "Teste";
  const attr = options.attr ?? "";
  const displayKey = `${String(attr).toLowerCase()}_display`;
  if (!Object.prototype.hasOwnProperty.call(actor.system?.props ?? {}, displayKey)) {
    ui.notifications?.error?.(`A ficha não possui a key ${displayKey}.`);
    return;
  }
  const val = parseAttributeValue(actor.system?.props?.[displayKey]);
  const color = options.color ?? "";
  const statusEffects = getRollStatusEffects(actor.system?.props, {
    test,
    attr,
    kind: ["Bloqueio", "Esquiva"].includes(test) ? "defense" : "test",
  });
  if (statusEffects.blocked) return ui.notifications?.warn?.("Este personagem está incapacitado e não pode realizar a rolagem.");

  const dialogResult = await openRollDialog({ actor, test, attr, value: val, color });
  if (!dialogResult) return;

  await doRoll({
    actor,
    test,
    attr,
    val,
    mode: dialogResult.mode,
    rollMode: dialogResult.rollMode,
    secVal: dialogResult.secVal,
    bonusRaw: dialogResult.bonusRaw,
    cdVal: dialogResult.cdVal,
    statusEffects,
  });
}
