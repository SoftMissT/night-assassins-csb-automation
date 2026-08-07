/**
 * @fileoverview Serviço de rolagem de dano com aplicação atômica.
 */

import { ATTRIBUTES, TIPOS_ACAO, TIPOS_DANO, MODULE_ID } from "./constants.mjs";
import { parseAttributeValue, parseNumber } from "./parsing.mjs";
import { openDamageDialog } from "./dialogs/damage-dialog.mjs";
import { applyOniDamage } from "./damage-relay.mjs";
import { getDamageStatusEffects, isReactionBlocked } from "./status-effects.mjs";
import { applySlayerDamage } from "./status-engine.mjs";

function buildEntryFormula(dado, fixo, selAttrs, attrValues) {
  const parts = [];
  const cleanDado = (dado || "").trim();
  if (cleanDado) parts.push(cleanDado);

  if (fixo !== 0) {
    if (parts.length === 0) parts.push(String(fixo));
    else parts.push(fixo > 0 ? `+ ${fixo}` : `- ${Math.abs(fixo)}`);
  }

  for (const k of selAttrs) {
    const v = attrValues[k] ?? 0;
    if (v !== 0) {
      if (parts.length === 0) parts.push(String(v));
      else parts.push(v > 0 ? `+ ${v}` : `- ${Math.abs(v)}`);
    }
  }

  return parts.length > 0 ? parts.join(" ") : "0";
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
 * API pública: rolagem de dano.
 * @param {object} options
 * @param {Actor} [options.actor]
 * @param {string} [options.actorUuid]
 * @param {string} [options.nome]
 * @param {Array} [options.entradas]
 * @param {number} [options.pdrCusto]
 * @param {string} [options.tipoAcao]
 * @param {string} [options.formulaBase]
 * @param {number} [options.fixo]
 * @param {string[]} [options.attrs]
 * @param {string} [options.attr]
 * @param {string[]} [options.tiposDano]
 * @param {string} [options.tipoDano]
 * @returns {Promise<void>}
 */
export async function rollDamage(options) {
  const actor = await resolveActor(options);
  if (!actor) {
    ui.notifications?.warn?.("Nenhum Actor encontrado para dano.");
    return;
  }

  const props = actor.system?.props ?? {};
  const statusEffects = getDamageStatusEffects(props);
  if (statusEffects.blocked) return ui.notifications?.warn?.("Este personagem está incapacitado e não pode causar dano.");
  const attrValues = {};
  for (const { key } of ATTRIBUTES) {
    attrValues[key] = parseAttributeValue(props[`${key}_display`]);
  }

  // Compatibilidade de entradas
  let preEntradas = options.entradas;
  if (!Array.isArray(preEntradas) || preEntradas.length === 0) {
    preEntradas = [{
      tipoAcao: options.tipoAcao ?? "",
      dado: options.formulaBase ?? "",
      fixo: Number.isFinite(Number(options.fixo)) ? Number(options.fixo) : 0,
      attrs: Array.isArray(options.attrs) ? options.attrs : options.attr ? [options.attr] : [],
      tiposDano: Array.isArray(options.tiposDano) ? options.tiposDano : options.tipoDano ? [options.tipoDano] : [],
    }];
  }

  const dialogResult = await openDamageDialog({
    actor,
    nome: options.nome ?? "",
    entradas: preEntradas,
    pdrCusto: options.pdrCusto ?? 0,
  });
  if (!dialogResult) return;

  const { nome, entradas } = dialogResult;
  const pdrGastoBase = dialogResult.pdrGasto;
  const pdrGasto = pdrGastoBase > 0 ? pdrGastoBase + statusEffects.pdrSurcharge : 0;
  if (entradas.length === 0) {
    ui.notifications?.warn?.("Adicione ao menos uma entrada de dano.");
    return;
  }
  if (entradas.some((entry) => entry.tipoAcao === "reacao") && isReactionBlocked(props)) {
    return ui.notifications?.warn?.("Os status atuais impedem o uso de Reações.");
  }

  const formulaParts = entradas.map((e) => buildEntryFormula(e.dado, e.fixo, e.selAttrs, attrValues));
  const validParts = formulaParts.filter((p) => p !== "0");
  let formula = validParts.length > 0 ? validParts.join(" + ") : "0";
  if (statusEffects.modifier) formula = `max(0, (${formula}) ${statusEffects.modifier > 0 ? "+" : "-"} ${Math.abs(statusEffects.modifier)})`;

  let roll;
  try {
    roll = await Roll.create(formula).evaluate();
  } catch (_) {
    ui.notifications?.error?.(`Fórmula inválida: ${formula}`);
    return;
  }

  // Agrupar atualizações por Actor
  const updatesByActor = new Map();

  if (pdrGasto > 0) {
    const pdrAtual = parseNumber(props.pdr_slayer_gasto_valor);
    updatesByActor.set(actor.uuid, {
      actor,
      changes: { "system.props.pdr_slayer_gasto_valor": pdrAtual + pdrGasto },
    });
  }

  const damageRequests = [];
  const targets = game?.user?.targets;
  if (targets && targets.size > 0 && roll.total > 0) {
    for (const targetToken of targets) {
      const targetActor = targetToken.actor;
      if (!targetActor) continue;
      if (targetActor.uuid === actor.uuid && (game.user.isGM || targetActor.isOwner)) {
        const current = parseNumber(targetActor.system?.props?.pdv_oni_dano_tomado);
        const existing = updatesByActor.get(targetActor.uuid) ?? { actor: targetActor, changes: {} };
        existing.changes["system.props.pdv_oni_dano_tomado"] = current + roll.total;
        updatesByActor.set(targetActor.uuid, existing);
        continue;
      }
      damageRequests.push({ actor: targetActor, amount: roll.total });
    }
  }

  const pending = [...updatesByActor.values()];
  const results = await Promise.allSettled([
    ...pending.map(async (up) => {
      await up.actor.update(up.changes, { naCsbAutomation: true });
    }),
    ...damageRequests.map(({ actor: targetActor, amount }) => {
      const targetProps = targetActor.system?.props ?? {};
      const isSlayerTarget = targetProps.pdv_slayer_total_valor !== undefined || targetProps.nome_slayer !== undefined;
      return isSlayerTarget
        ? applySlayerDamage(targetActor, amount, { isAttack: true })
        : applyOniDamage(targetActor, amount);
    }),
  ]);

  for (const [index, result] of results.entries()) {
    if (result.status === "fulfilled") continue;
    const targetName = index < pending.length
      ? pending[index].actor.name
      : damageRequests[index - pending.length]?.actor?.name ?? "alvo";
    console.warn?.(`[${MODULE_ID}] Falha ao atualizar ${targetName}`, result.reason);
    ui.notifications?.warn?.(`Não foi possível atualizar ${targetName}.`);
  }

  // Chat message
  const entradasHtml = entradas.map((e, i) => {
    const acaoMeta = TIPOS_ACAO.find((t) => t.key === e.tipoAcao);
    const danoMetas = e.selTiposDano.map((k) => TIPOS_DANO.find((t) => t.key === k)).filter(Boolean);

    const acaoStr = acaoMeta
      ? `<span style="background:#2A2520;color:#D8B45D;border:1px solid #4A3A2A;border-radius:3px;padding:1px 5px;font-size:10px;font-weight:bold;">${acaoMeta.label}</span> `
      : "";

    const danoStr = danoMetas.length
      ? `<span style="background:#2A2520;color:#A4FE23;border:1px solid #4A3A2A;border-radius:3px;padding:1px 5px;font-size:10px;font-weight:bold;">${danoMetas.map((t) => t.label).join(", ")}</span> `
      : "";

    const attrStr = e.selAttrs
      .filter((k) => attrValues[k] !== 0)
      .map((k) => {
        const meta = ATTRIBUTES.find((a) => a.key === k);
        return `<span style="color:${meta.color};font-weight:bold;">${meta.label}(${attrValues[k]})</span>`;
      })
      .join(" + ");

    const descs = danoMetas.map((t) => t.desc).filter(Boolean);
    const danoTipHtml = descs.length
      ? `<div style="font-size:11px;color:#D4CBBC;font-style:italic;margin-top:3px;background:rgba(0,0,0,0.15);padding:3px 6px;border-left:2px solid #D8B45D;">${descs.join(" | ")}</div>`
      : "";

    return `<div style="margin-top:6px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.1);">
      <div>${acaoStr}${danoStr}<code style="font-size:12px;font-weight:bold;">${formulaParts[i]}</code> ${attrStr ? "(" + attrStr + ")" : ""}</div>
      ${danoTipHtml}
    </div>`;
  }).join("");

  const pdrLine = pdrGasto > 0
    ? ` <span style="color:#BB97F9;">| PDR/PDK gasto: <strong>${pdrGasto}</strong></span>`
    : "";
  const statusLine = statusEffects.reasons.length
    ? `<div style="font-size:11px;color:#D8B45D;">Status: ${statusEffects.reasons.join(" · ")}</div>`
    : "";

  const flavor = `<div style="font-family:'Lexend',sans-serif;"><strong style="font-size:13px;color:#D8B45D;">${nome}</strong>${pdrLine}${statusLine}${entradasHtml}</div>`;

  await roll.toMessage({ flavor, speaker: ChatMessage.getSpeaker({ actor }) });
}
