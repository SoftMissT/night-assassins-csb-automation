/**
 * @fileoverview Serviço de rolagem de acerto.
 */

import { parseAttributeValue } from "./parsing.mjs";
import { openHitConfirmationDialog, openHitDialog } from "./dialogs/hit-dialog.mjs";
import { getRollStatusEffects, mergeRollMode } from "./status-effects.mjs";
import { TIPOS_ACAO } from "./constants.mjs";
import { recoverSlayerFolego } from "./action-service.mjs";
import { parseWaterBreathingState } from "./breath-service.mjs";
import { flameWeaponTier } from "./flame-breathing-data.mjs";
import { consumeFlamePending, flameStatePatch, parseFlameBreathingState } from "./flame-breathing-service.mjs";

function naturalD20(roll) {
  return Math.max(0, ...(roll?.dice ?? []).flatMap((die) => (die?.results ?? []).filter((result) => result.active !== false).map((result) => Number(result.result) || 0)));
}

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

async function doRoll({ actor, attrName, attrVal, mode, rollMode, bonusRaw, cdVal, rollCount = 1, actionType = "", statusEffects }) {
  mode = mergeRollMode(mode, statusEffects.mode);
  const { extra, display } = parseBonus(bonusRaw);
  const formula = buildFormula(mode, attrVal, extra, statusEffects.modifier);

  const maximum = Math.min(20, Math.max(1, Math.trunc(rollCount || 1)));
  const modeLabel = getModeLabel(mode);
  const bonusLine = display ? ` | Bônus: ${display}` : "";
  const statusLine = statusEffects.reasons.length ? ` | Status: ${statusEffects.reasons.join(", ")}` : "";
  const attempts = [];
  let interrupted = false;
  const actionLabel = TIPOS_ACAO.find((entry) => entry.key === actionType)?.label;

  for (let index = 0; index < maximum; index += 1) {
    let roll;
    try {
      roll = await Roll.create(formula).evaluate();
    } catch (err) {
      ui.notifications?.error?.(`Erro na fórmula: ${formula}`);
      return;
    }
    let cdLine = "";
    if (cdVal > 0) {
      const passou = roll.total >= cdVal;
      cdLine = ` | CD ${cdVal} → ${passou ? "✅ Sucesso!" : "❌ Falha!"}`;
    }
    const countLine = maximum > 1 ? ` ${index + 1}/${maximum}` : "";
    const message = await roll.toMessage({
      flavor: `${actionLabel ? `${actionLabel} · ` : ""}Acerto${countLine} (${modeLabel}) ${attrName} ${attrVal}${bonusLine}${statusLine}${cdLine}`,
      speaker: ChatMessage.getSpeaker({ actor }),
      rollMode,
    });
    await game.dice3d?.waitFor3DAnimationByMessageID?.(message?.id);
    const decision = await openHitConfirmationDialog({ current: index + 1, maximum, total: roll.total, cdVal });
    if (!decision || decision.stop) {
      interrupted = true;
      break;
    }
    attempts.push({ roll, hit: decision.hit });
    if (decision.hit && naturalD20(roll) === 20) await recoverSlayerFolego(actor, 1);
    if (!decision.continue && index + 1 < maximum) {
      interrupted = true;
      break;
    }
  }

  const hits = attempts.filter(({ hit }) => hit).length;
  const misses = attempts.length - hits;
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: "Sequência de Acerto",
    content: `<p><strong>${attempts.length}/${maximum}</strong> tentativa(s) · <strong>${hits}</strong> acerto(s) · <strong>${misses}</strong> erro(s)${interrupted ? " · encerrada" : ""}</p>`,
  });
  return { attempts, hits, misses, interrupted, maximum };
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

  const breathingState = parseWaterBreathingState(props.resp_agua_estado);
  const breathHit = breathingState.nextHit;
  const flameState = parseFlameBreathingState(props.resp_chamas_estado);
  const flameHit = flameState.nextHit;
  const flameTier = flameWeaponTier(flameState.weaponHeat);
  const breathBonus = (Number(breathHit?.bonus) || 0) + (Number(flameHit?.bonus) || 0) + flameTier.hit;
  const bonusRaw = [dialogResult.bonusRaw, breathBonus ? String(breathBonus) : ""].filter(Boolean).join(" + ");
  const requestedMode = breathHit?.advantage || flameHit?.advantage ? mergeRollMode(dialogResult.mode, "advantage") : dialogResult.mode;

  const result = await doRoll({
    actor,
    attrName,
    attrVal,
    mode: requestedMode,
    rollMode: dialogResult.rollMode,
    bonusRaw,
    cdVal: dialogResult.cdVal,
    rollCount: Math.max(dialogResult.rollCount, Number(breathHit?.count) || 1, Number(flameHit?.count) || 1),
    actionType: dialogResult.actionType,
    statusEffects,
  });
  if (result?.attempts?.length && breathHit) {
    delete breathingState.nextHit;
    await actor.update({
      "system.props.resp_agua_estado": JSON.stringify(breathingState),
      "system.props.resp_bonus_acerto_temp": 0,
    }, { naCsbAutomation: true, naBreathing: true });
  }
  if (result?.attempts?.length && flameHit) {
    await actor.update(flameStatePatch(consumeFlamePending(flameState, { hit: true })), { naCsbAutomation: true, naBreathing: true });
  }
}
