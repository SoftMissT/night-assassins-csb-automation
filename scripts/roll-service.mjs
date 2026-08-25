/**
 * @fileoverview Serviço de rolagem geral (teste).
 */

import { ATTR_NAMES, MODULE_ID } from "./constants.mjs";
import { parseAttributeValue } from "./parsing.mjs";
import { openRollDialog } from "./dialogs/roll-dialog.mjs";
import { getRollStatusEffects, mergeRollMode } from "./status-effects.mjs";
import { recoverSlayerFolego } from "./action-service.mjs";
import { buildFlameInterception, parseFlameBreathingState } from "./flame-breathing-service.mjs";
import { consumeMetalSteelDefense, parseMetalBreathingState } from "./metal-breathing-service.mjs";
import { parseMistBreathingState } from "./mist-breathing-service.mjs";
import { parseSnowBreathingState } from "./snow-breathing-service.mjs";
import { consumeStoneCounterAttack, parseStoneBreathingState } from "./stone-breathing-service.mjs";
import { derivedChannelForTest, resolveSlayerDerivedBonuses } from "./derived-bonus-service.mjs";

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
  let success = null;
  if (cdVal > 0) {
    success = roll.total >= cdVal;
    cdLine = ` | CD ${cdVal} → ${success ? "✅ Sucesso!" : "❌ Falha!"}`;
  }

  const message = await roll.toMessage({
    flavor: `<strong>${test}</strong> (${modeLabel})${attrLine ? " — " + attrLine : ""}${secLine}${bonusLine}${statusLine}${cdLine}`,
    speaker: ChatMessage.getSpeaker({ actor }),
    rollMode: rollMode,
  });
  if (["Bloqueio", "Esquiva"].includes(test) && naturalD20(roll) === 20) await recoverSlayerFolego(actor, 1);
  return { roll, message, success };
}

async function confirmDefenseSuccess(result, test) {
  if (result?.success !== null) return result?.success === true;
  return foundry.applications.api.DialogV2.confirm({
    window: { title: `${test} — confirmar resultado` },
    content: `<p>O resultado <strong>${result?.roll?.total ?? 0}</strong> defendeu o ataque?</p>`,
    yes: { label: "Sim, defendeu" },
    no: { label: "Não" },
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
  if (test === "Bloqueio") {
    const flameState = parseFlameBreathingState(actor.system?.props?.resp_chamas_estado);
    if (Number(flameState.block?.bonus) > 0) {
      statusEffects.modifier += Number(flameState.block.bonus);
      statusEffects.reasons.push(`Ondulação +${flameState.block.bonus} Bloqueio`);
    }
    const flamePenalty = actor.getFlag?.(MODULE_ID, "flameBlockPenalty");
    if (Number(flamePenalty?.turns) > 0 && Number(flamePenalty?.value) < 0) {
      statusEffects.modifier += Number(flamePenalty.value);
      statusEffects.reasons.push(`Céu em Chamas ${flamePenalty.value} Bloqueio`);
    }
    const metalState = parseMetalBreathingState(actor.system?.props?.resp_metal_estado);
    const stoneState = parseStoneBreathingState(actor.system?.props?.resp_pedra_estado);
    const metalBonus = Number(metalState.metalized?.blockBonus) || 0;
    const selectedTargetUuids = new Set([...(game.user?.targets ?? [])].map((token) => token.actor?.uuid).filter(Boolean));
    const stoneSourceUuid = String(stoneState.reflection?.target ?? "");
    const stoneApplies = !stoneSourceUuid || selectedTargetUuids.has(stoneSourceUuid);
    const stoneBonus = stoneApplies ? Number(stoneState.reflection?.blockBonus) || 0 : 0;
    if (metalBonus) { statusEffects.modifier += metalBonus; statusEffects.reasons.push(`Metalizado +${metalBonus}`); }
    if (stoneBonus) { statusEffects.modifier += stoneBonus; statusEffects.reasons.push(`Reflexão +${stoneBonus}`); }
  }
  if (["Bloqueio", "Esquiva"].includes(test)) {
    const mistState = parseMistBreathingState(actor.system?.props?.resp_nevoa_estado);
    const snowState = parseSnowBreathingState(actor.system?.props?.resp_neve_estado);
    const mistBonus = Number(mistState.fog?.bonus) || 0;
    const snowBonus = test === "Bloqueio"
      ? Number(snowState.iceHeart?.blockBonus) || 0
      : Number(snowState.iceHeart?.dodgeBonus) || 0;
    if (mistBonus) { statusEffects.modifier += mistBonus; statusEffects.reasons.push(`Neblina +${mistBonus}`); }
    if (snowBonus) { statusEffects.modifier += snowBonus; statusEffects.reasons.push(`Coração de Gelo +${snowBonus}`); }
  }
  if (statusEffects.blocked) return ui.notifications?.warn?.("Este personagem está incapacitado e não pode realizar a rolagem.");
  if (statusEffects.autoFail) return ui.notifications?.warn?.("Paralisia: falha automática em testes de FOR ou DEX que não sejam Defesa.");

  const dialogResult = await openRollDialog({ actor, test, attr, value: val, color });
  if (!dialogResult) return;

  const derivedChannel = derivedChannelForTest(test, options.modality ?? "");
  const derivedBonuses = resolveSlayerDerivedBonuses(actor.system?.props ?? {});
  const derivedTotal = derivedChannel ? derivedBonuses.channels[derivedChannel]?.total ?? 0 : 0;
  const bonusRaw = [dialogResult.bonusRaw, derivedTotal ? String(derivedTotal) : ""].filter(Boolean).join(" + ");

  // Duro como Aço N2 (Vantagem) é single-use: vale só para o "próximo ataque
  // inimigo", então precisa ser consumido aqui — sem isso, a Vantagem
  // vazaria para toda rolagem de Bloqueio/Esquiva seguinte.
  const metalState = parseMetalBreathingState(actor.system?.props?.resp_metal_estado);
  let metalSteelPatch = null;
  if (["Bloqueio", "Esquiva"].includes(test) && metalState.steelDefense?.defenseAdvantage) {
    dialogResult.mode = mergeRollMode(dialogResult.mode, "advantage");
    metalSteelPatch = consumeMetalSteelDefense(metalState).patch;
  }
  if (metalSteelPatch) await actor.update(metalSteelPatch, { naCsbAutomation: true, naBreathing: true });

  // Shi no Kata: Aisu Hato N4: "+2 em quaisquer testes contra CD" — cobre
  // qualquer teste de atributo com Classe de Dificuldade que não seja
  // Bloqueio/Esquiva (já somados acima via blockBonus/dodgeBonus).
  if (!["Bloqueio", "Esquiva"].includes(test) && Number(dialogResult.cdVal) > 0) {
    const snowIceHeartState = parseSnowBreathingState(actor.system?.props?.resp_neve_estado);
    const iceHeartTestBonus = Number(snowIceHeartState.iceHeart?.testBonus) || 0;
    if (iceHeartTestBonus) {
      statusEffects.modifier += iceHeartTestBonus;
      statusEffects.reasons.push(`Coração de Gelo +${iceHeartTestBonus}`);
    }
  }

  const result = await doRoll({
    actor,
    test,
    attr,
    val,
    mode: dialogResult.mode,
    rollMode: dialogResult.rollMode,
    secVal: dialogResult.secVal,
    bonusRaw,
    cdVal: dialogResult.cdVal,
    statusEffects,
  });
  const defenseSucceeded = result && ["Bloqueio", "Esquiva"].includes(test)
    ? await confirmDefenseSuccess(result, test)
    : false;
  if (defenseSucceeded) {
    const stoneState = parseStoneBreathingState(actor.system?.props?.resp_pedra_estado);
    const selectedTargetUuids = new Set([...(game.user?.targets ?? [])].map((token) => token.actor?.uuid).filter(Boolean));
    const stoneSourceUuid = String(stoneState.reflection?.target ?? "");
    const counter = (!stoneSourceUuid || selectedTargetUuids.has(stoneSourceUuid))
      ? consumeStoneCounterAttack(stoneState)
      : { available: false };
    if (counter.available) {
      await actor.update(counter.patch, { naCsbAutomation: true, naBreathing: true });
      const useCounter = await foundry.applications.api.DialogV2.confirm({
        window: { title: "Ganku no Hadae — Contra-ataque" },
        content: "<p>O inimigo afetado errou. Realizar agora o ataque padrão de contra-ataque?</p>",
        yes: { label: "Contra-atacar" },
        no: { label: "Recusar" },
        rejectClose: false,
      });
      if (useCounter) {
        const { rollHit } = await import("./hit-service.mjs");
        await rollHit({ actor, actorUuid: actor.uuid, autoDamage: true });
      }
    }
  }
  if (defenseSucceeded && test === "Bloqueio") {
    const flameState = parseFlameBreathingState(actor.system?.props?.resp_chamas_estado);
    if (flameState.block?.intercept) {
      const protectedToken = [...(game.user?.targets ?? [])][0] ?? null;
      const protectedActor = protectedToken?.actor ?? null;
      const interceptorToken = actor.getActiveTokens?.()[0] ?? canvas?.tokens?.controlled?.find((token) => token.actor?.uuid === actor.uuid) ?? null;
      const distance = interceptorToken && protectedToken && canvas?.grid?.measurePath
        ? Number(canvas.grid.measurePath([interceptorToken.center, protectedToken.center])?.distance) || 0
        : 0;
      if (distance > 3) {
        ui.notifications?.warn?.(`Shi no Kata Sei en no Uneri: o aliado está a ${distance.toFixed(1)}m; o limite é 3m.`);
        return result;
      }
      const interception = buildFlameInterception(flameState, { interceptorUuid: actor.uuid, protectedUuid: protectedActor?.uuid });
      result.interceptAvailable = interception.ok;
      if (interception.ok) {
        await Promise.all([actor.update(interception.patch, { naCsbAutomation: true, naBreathing: true }), protectedActor.setFlag(MODULE_ID, "flameInterception", interception.flag)]);
        await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<p><strong>Shi no Kata Sei en no Uneri</strong> — ${protectedActor.name} será interceptado pelo próximo dano recebido.</p>` });
      } else ui.notifications?.warn?.(interception.reason);
    }
  }
  return result;
}
