/**
 * @fileoverview Serviço de rolagem de acerto.
 */

import { parseAttributeValue } from "./parsing.mjs";
import { openHitDialog } from "./dialogs/hit-dialog.mjs";
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

function buildFormula(mode, attrVal, bonusExtra, statusModifier = 0) {
  const dice = getDice(mode);
  let base = `${dice} + ${attrVal}`;
  if (statusModifier) base += statusModifier > 0 ? ` + ${statusModifier}` : ` - ${Math.abs(statusModifier)}`;
  return bonusExtra ? `${base} ${bonusExtra}` : base;
}

async function doRoll({ actor, attrName, attrVal, mode, rollMode, bonusRaw, cdVal, rollCount = 1, statusEffects }) {
  mode = mergeRollMode(mode, statusEffects.mode);
  const { extra, display } = parseBonus(bonusRaw);
  const formula = buildFormula(mode, attrVal, extra, statusEffects.modifier);

  let rolls;
  try {
    rolls = await Promise.all(Array.from({ length: Math.min(20, Math.max(1, Math.trunc(rollCount || 1))) }, () => Roll.create(formula).evaluate()));
  } catch (err) {
    ui.notifications?.error?.(`Erro na fórmula: ${formula}`);
    return;
  }

  const modeLabel = getModeLabel(mode);
  const bonusLine = display ? ` | Bônus: ${display}` : "";
  const statusLine = statusEffects.reasons.length ? ` | Status: ${statusEffects.reasons.join(", ")}` : "";

  await Promise.all(rolls.map((roll, index) => {
    let cdLine = "";
    if (cdVal > 0) {
      const passou = roll.total >= cdVal;
      cdLine = ` | CD ${cdVal} → ${passou ? "✅ Sucesso!" : "❌ Falha!"}`;
    }
    const countLine = rolls.length > 1 ? ` ${index + 1}/${rolls.length}` : "";
    return roll.toMessage({
      flavor: `<strong>Acerto${countLine}</strong> (${modeLabel}) — ${attrName} = ${attrVal}${bonusLine}${statusLine}${cdLine}`,
      speaker: ChatMessage.getSpeaker({ actor }),
      rollMode,
    });
  }));
  return rolls;
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

  const statusEffects = getRollStatusEffects(props, { test: "Acerto", attr: attrName, kind: "attack" });
  if (statusEffects.blocked) return ui.notifications?.warn?.("Este personagem está incapacitado e não pode atacar.");
  if (statusEffects.autoFail) return ui.notifications?.warn?.("Paralisia: falha automática neste Acerto.");

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
    rollCount: dialogResult.rollCount,
    statusEffects,
  });
}
