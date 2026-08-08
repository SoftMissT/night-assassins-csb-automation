/**
 * @fileoverview Serviço de rolagem de dano com aplicação atômica.
 */

import { ATTRIBUTES, TIPOS_ACAO, TIPOS_DANO, MODULE_ID } from "./constants.mjs";
import { parseAttributeValue, parseNumber } from "./parsing.mjs";
import { openDamageDialog } from "./dialogs/damage-dialog.mjs";
import { applyOniDamage, applySlayerDamageAuto } from "./damage-relay.mjs";
import { getDamageStatusEffects, isReactionBlocked } from "./status-effects.mjs";
import { consumeSlayerActions } from "./action-service.mjs";
import { parseWaterBreathingState } from "./breath-service.mjs";

function buildEntryFormula(dado, fixo, selAttrs = [], attrValues) {
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

function markDamageFormula(props, entries) {
  if (parseNumber(props.marca_ativa) !== 1) return "";
  const dice = Math.max(0, Math.trunc(parseNumber(props.marca_dano_dados)));
  const faces = Math.max(0, Math.trunc(parseNumber(props.marca_dano_faces)));
  if (dice < 1 || faces < 2) return "";
  const continuous = new Set(["sangramento", "envenenamento"]);
  const directAttack = entries.some((entry) => {
    const damageTypes = Array.isArray(entry.selTiposDano) ? entry.selTiposDano : [];
    return entry.tipoAcao === "ataque"
      && (damageTypes.length === 0 || damageTypes.some((type) => !continuous.has(type)));
  });
  return directAttack ? `${dice}d${faces}` : "";
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
export async function rollDamage(options = {}) {
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
    critical: options.critical === true,
  });
  if (!dialogResult) return;

  const nome = dialogResult.nome ?? "Dano";
  const entradas = Array.isArray(dialogResult.entradas) ? dialogResult.entradas : [];
  let critical = dialogResult.critical === true;
  if (critical && !statusEffects.criticalAllowed) {
    critical = false;
    ui.notifications?.warn?.("Fadiga Corporal impede Acertos Críticos. O dano será rolado normalmente.");
  }
  const pdrGastoBase = dialogResult.pdrGasto;
  const pdrGasto = pdrGastoBase > 0 ? pdrGastoBase + statusEffects.pdrSurcharge : 0;
  if (entradas.length === 0) {
    ui.notifications?.warn?.("Adicione ao menos uma entrada de dano.");
    return;
  }
  if (entradas.some((entry) => entry.tipoAcao === "reacao") && isReactionBlocked(props)) {
    return ui.notifications?.warn?.("Os status atuais impedem o uso de Reações.");
  }
  const actionTypes = [...new Set(entradas.map((entry) => entry.tipoAcao).filter(Boolean))];
  const actionResult = await consumeSlayerActions(actor, actionTypes, { update: false });
  if (!actionResult.ok) return ui.notifications?.warn?.(actionResult.reason);

  const formulaParts = entradas.map((e) => buildEntryFormula(e.dado, e.fixo, e.selAttrs, attrValues));
  const specs = entradas.map((entry, index) => ({
    label: TIPOS_ACAO.find((type) => type.key === entry.tipoAcao)?.label ?? `Dano ${index + 1}`,
    types: entry.selTiposDano,
    formula: formulaParts[index],
  })).filter((spec) => spec.formula !== "0");
  const markFormula = markDamageFormula(props, entradas);
  if (markFormula) specs.push({ label: "Marca do Caçador", types: ["ferida"], formula: markFormula });
  const breathingState = parseWaterBreathingState(props.resp_agua_estado);
  const breathingDamage = breathingState.pendingDamage;
  const hasAttackDamage = entradas.some((entry) => entry.tipoAcao === "ataque" || entry.tipoAcao === "especial" || entry.tipoAcao === "completa");
  if (breathingDamage?.formula && hasAttackDamage) {
    const formula = String(breathingDamage.formula).replace(/@([a-z_]+)/gi, (_, key) => String(attrValues[key.toLowerCase()] ?? 0));
    specs.push({ label: "Respiração da Água", types: [], formula, breathing: true });
    if (breathingDamage.critical) critical = true;
  }
  if (specs.length === 0) return ui.notifications?.warn?.("Informe ao menos um dado, valor fixo ou atributo no dano.");

  let rolls;
  try {
    rolls = await Promise.all(specs.map((spec) => Roll.create(critical ? `2 * (${spec.formula})` : spec.formula).evaluate()));
  } catch (_) {
    ui.notifications?.error?.(`Fórmula inválida: ${specs.map((spec) => spec.formula).join(" + ")}`);
    return;
  }
  // Dice So Nice é acionado automaticamente pelo ChatMessage.create quando rolls está preenchido.
  const components = specs.map((spec, index) => ({
    label: spec.label,
    types: spec.types,
    subtotal: Math.max(0, Math.trunc(Number(rolls[index].total) || 0)),
  }));
  let penalty = Math.max(0, -Math.trunc(statusEffects.modifier || 0));
  for (const component of components) {
    if (penalty <= 0) break;
    const reduction = Math.min(component.subtotal, penalty);
    component.subtotal -= reduction;
    penalty -= reduction;
  }
  const finalDamage = components.reduce((total, component) => total + component.subtotal, 0);
  const damageTypes = [...new Set(components.flatMap((component) => component.types))];

  // Agrupar atualizações por Actor
  const updatesByActor = new Map();

  if (Object.keys(actionResult.patch ?? {}).length > 0) {
    updatesByActor.set(actor.uuid, { actor, changes: { ...actionResult.patch } });
  }

  if (breathingDamage && hasAttackDamage) {
    const nextState = { ...breathingState };
    const remaining = Math.max(0, Math.trunc(parseNumber(breathingDamage.uses)) - 1);
    if (remaining > 0) nextState.pendingDamage = { ...breathingDamage, uses: remaining };
    else delete nextState.pendingDamage;
    const existing = updatesByActor.get(actor.uuid) ?? { actor, changes: {} };
    existing.changes["system.props.resp_agua_estado"] = JSON.stringify(nextState);
    existing.changes["system.props.resp_bonus_dano_dados"] = remaining > 0 ? breathingDamage.formula ?? "" : "";
    existing.changes["system.props.resp_efeito_flag"] = remaining > 0 ? props.resp_efeito_flag ?? "" : "";
    if (breathingDamage.exhaustion) {
      existing.changes["system.props.status_slayer_exaustao"] = Math.min(8, parseNumber(props.status_slayer_exaustao) + parseNumber(breathingDamage.exhaustion));
    }
    updatesByActor.set(actor.uuid, existing);
  }

  if (pdrGasto > 0) {
    const pdrAtual = parseNumber(props.pdr_slayer_gasto_valor);
    const existing = updatesByActor.get(actor.uuid) ?? { actor, changes: {} };
    existing.changes["system.props.pdr_slayer_gasto_valor"] = pdrAtual + pdrGasto;
    updatesByActor.set(actor.uuid, existing);
  }

  const damageRequests = [];
  const targets = game?.user?.targets;
  if (targets && targets.size > 0 && finalDamage > 0) {
    for (const targetToken of targets) {
      const targetActor = targetToken.actor;
      if (!targetActor) continue;
      damageRequests.push({ actor: targetActor, amount: finalDamage });
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
        ? applySlayerDamageAuto(targetActor, amount, { isAttack: true, attackName: nome, critical, damageTypes, components })
        : applyOniDamage(targetActor, amount, { attackName: nome, critical, rolledTotal: finalDamage, damageTypes, components, requireApproval: true });
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

  if (finalDamage > 0 && (!targets || targets.size === 0)) ui.notifications?.warn?.("Nenhum alvo marcado. O dano foi rolado, mas nenhuma ficha foi atualizada.");
  const componentLines = components.map((component) => {
    const labels = component.types.map((key) => TIPOS_DANO.find((type) => type.key === key)?.label ?? key).join(" · ") || "Sem tipo";
    return `<div><strong>${component.label}</strong> — ${labels}: <strong>${component.subtotal}</strong></div>`;
  }).join("");
  const targetLine = damageRequests.length ? `<div>Alvo(s): ${damageRequests.map((request) => request.actor.name).join(", ")}</div>` : "<div>Nenhum alvo — ficha não atualizada</div>";
  const flavor = `<div><strong>${nome}</strong>${critical ? " · CRÍTICO" : ""}${pdrGasto ? ` · −${pdrGasto} PDR` : ""}</div>${statusEffects.reasons.length ? `<div>Status: ${statusEffects.reasons.join(" · ")}</div>` : ""}${componentLines}<hr><div><strong>Total: ${finalDamage}</strong></div>${targetLine}`;
  const mode = game.settings?.get?.("core", "rollMode") ?? "publicroll";
  const chatData = { speaker: ChatMessage.getSpeaker({ actor }), flavor, rolls };
  await ChatMessage.create(ChatMessage.applyMode ? ChatMessage.applyMode(chatData, { publicroll: "public", gmroll: "gm", blindroll: "blind", selfroll: "self" }[mode] ?? "public") : chatData);
}
