/**
 * @fileoverview Serviço de rolagem de acerto.
 */

import { parseAttributeValue } from "./parsing.mjs";
import { openHitDialog } from "./dialogs/hit-dialog.mjs";

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

function buildFormula(mode, attrVal, bonusExtra) {
  const dice = getDice(mode);
  const base = `${dice} + ${attrVal}`;
  return bonusExtra ? `${base} ${bonusExtra}` : base;
}

async function doRoll({ actor, attrName, attrVal, mode, rollMode, bonusRaw, cdVal }) {
  const { extra, display } = parseBonus(bonusRaw);
  const formula = buildFormula(mode, attrVal, extra);

  let roll;
  try {
    roll = await Roll.create(formula).evaluate();
  } catch (err) {
    ui.notifications?.error?.(`Erro na fórmula: ${formula}`);
    return;
  }

  const modeLabel = getModeLabel(mode);
  const bonusLine = display ? ` | Bônus: ${display}` : "";

  let cdLine = "";
  if (cdVal > 0) {
    const passou = roll.total >= cdVal;
    cdLine = ` | CD ${cdVal} → ${passou ? "✅ Sucesso!" : "❌ Falha!"}`;
  }

  await roll.toMessage({
    flavor: `<strong>Acerto</strong> (${modeLabel}) — ${attrName} = ${attrVal}${bonusLine}${cdLine}`,
    speaker: ChatMessage.getSpeaker({ actor }),
    rollMode: rollMode,
  });
}

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
 * API pública: rolagem de acerto.
 * @param {object} options
 * @param {Actor} [options.actor]
 * @param {string} [options.actorUuid]
 * @returns {Promise<void>}
 */
export async function rollHit(options) {
  const actor = await resolveActor(options);
  if (!actor) {
    ui.notifications?.warn?.("Nenhum Actor encontrado para acerto.");
    return;
  }

  const props = actor.system?.props ?? {};
  const acertoLabel = props.acerto_label ?? "";

  let attrName = "";
  let attrVal = 0;
  let color = "";

  if (acertoLabel === "acerto_label_dex") {
    if (!Object.prototype.hasOwnProperty.call(props, "dex_display")) return ui.notifications?.error?.("A ficha não possui a key dex_display.");
    attrName = "DEX";
    attrVal = parseAttributeValue(props.dex_display);
    color = "#28D7FF";
  } else if (acertoLabel === "acerto_label_for") {
    if (!Object.prototype.hasOwnProperty.call(props, "for_display")) return ui.notifications?.error?.("A ficha não possui a key for_display.");
    attrName = "FOR";
    attrVal = parseAttributeValue(props.for_display);
    color = "#C1000C";
  } else {
    ui.notifications?.warn?.("Escolha DEX ou FOR no campo 'Como Acerta'.");
    return;
  }

  const dialogResult = await openHitDialog({ attrName, attrVal, color });
  if (!dialogResult) return;

  await doRoll({
    actor,
    attrName,
    attrVal,
    mode: dialogResult.mode,
    rollMode: dialogResult.rollMode,
    bonusRaw: dialogResult.bonusRaw,
    cdVal: dialogResult.cdVal,
  });
}
