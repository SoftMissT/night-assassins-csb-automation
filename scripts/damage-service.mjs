/**
 * @fileoverview Serviço de rolagem de dano com aplicação atômica.
 */

import { ATTRIBUTES, TIPOS_ACAO, TIPOS_DANO, MODULE_ID } from "./constants.mjs";
import { parseAttributeValue, parseNumber } from "./parsing.mjs";
import { openDamageDialog } from "./dialogs/damage-dialog.mjs";
import { applyOniDamage, applySlayerDamageAuto } from "./damage-relay.mjs";
import { getDamageStatusEffects, isReactionBlocked } from "./status-effects.mjs";
import { consumeSlayerActions } from "./action-service.mjs";
import { consumeOniActions } from "./oni-action-service.mjs";
import { parseWaterBreathingState } from "./breath-service.mjs";
import { actorKind, isSlayerActor } from "./actor-kind.mjs";
import { weaponProfilesForActor } from "./weapon-service.mjs";
import { flameWeaponTier } from "./flame-breathing-data.mjs";
import { consumeFlamePending, FLAME_HEAT_FLAG, flameStatePatch, parseFlameBreathingState } from "./flame-breathing-service.mjs";
import { addStoneBreak, parseBreathPassiveState, passiveStatePatch } from "./breath-passives.mjs";
import { openAttackBuilder } from "./items/attack-builder.mjs";

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

function weaponProfileEntry(profile, attrValues) {
  const attributeRules = Array.isArray(profile?.atributos) ? profile.atributos : [];
  const choiceRules = attributeRules.filter((rule) => rule?.escolha === true);
  const additiveRules = attributeRules.filter((rule) => rule?.escolha !== true);
  const selected = choiceRules.length > 0
    ? choiceRules.reduce((best, rule) => {
        const key = String(rule?.key ?? "").toLowerCase();
        const value = Math.floor((attrValues[key] ?? 0) * Number(rule?.multiplicador ?? 1));
        return value > best.value ? { key, value } : best;
      }, { key: "", value: 0 })
    : null;
  const additiveTotal = additiveRules.reduce((total, rule) => {
        const key = String(rule?.key ?? "").toLowerCase();
        return total + Math.floor((attrValues[key] ?? 0) * Number(rule?.multiplicador ?? 1));
      }, 0);
  const attributeTotal = (selected?.value ?? 0) + additiveTotal;
  return {
    tipoAcao: "ataque",
    dado: String(profile?.dano_dados ?? ""),
    fixo: Math.trunc(parseNumber(profile?.dano_fixo)) + attributeTotal,
    attrs: [],
    tiposDano: Array.isArray(profile?.tipos_dano) ? profile.tipos_dano : [],
  };
}

async function chooseWeaponProfile(profiles) {
  if (profiles.length === 1) return profiles[0];
  const options = profiles.map((profile, index) => `<option value="${index}">${profile.nome || `Perfil ${index + 1}`}${profile.alcance ? ` — ${profile.alcance}` : ""}</option>`).join("");
  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: "Escolher ataque da arma" },
    content: `<label>Perfil de ataque</label><select name="weaponProfile">${options}</select>`,
    modal: true,
    rejectClose: false,
    buttons: [
      { action: "select", label: "Continuar", callback: (_event, button) => Number(button.form.elements.weaponProfile.value) },
      { action: "cancel", label: "Cancelar", callback: () => null },
    ],
  });
  return Number.isInteger(result) ? profiles[result] ?? null : null;
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
  const attackerKind = actorKind(actor) ?? "slayer";
  const statusEffects = getDamageStatusEffects(props);
  if (statusEffects.blocked) return ui.notifications?.warn?.("Este personagem está incapacitado e não pode causar dano.");
  const attrValues = {};
  for (const { key } of ATTRIBUTES) {
    attrValues[key] = parseAttributeValue(props[`${key}_display`]);
  }

  const hasExplicitDamage = Array.isArray(options.entradas) && options.entradas.length > 0
    || Array.isArray(options.weaponProfiles) && options.weaponProfiles.length > 0
    || Boolean(options.formulaBase)
    || Number(options.fixo) !== 0
    || Array.isArray(options.attrs) && options.attrs.length > 0
    || Boolean(options.attr);
  if (!hasExplicitDamage && options.builder !== false) {
    const selection = await openAttackBuilder(actor);
    if (!selection || selection.cancelled) return;
    if (!selection.manual) {
      options = {
        ...options,
        nome: selection.nome || options.nome,
        entradas: selection.entradas,
        pdrCusto: parseNumber(options.pdrCusto) + parseNumber(selection.resourceCost),
      };
    }
  }

  const weaponProfiles = Array.isArray(options.weaponProfiles) ? options.weaponProfiles.filter((profile) => profile && typeof profile === "object") : [];
  if (weaponProfiles.length > 0) {
    const selectedProfile = await chooseWeaponProfile(weaponProfiles);
    if (!selectedProfile) return;
    options = { ...options, entradas: [weaponProfileEntry(selectedProfile, attrValues)] };
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
    resourceLabel: attackerKind === "oni" ? "PDK" : "PDR",
    resourceKey: attackerKind === "oni" ? "pdk_oni_gasto_valor" : "pdr_slayer_gasto_valor",
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
  const actionResult = attackerKind === "oni"
    ? await consumeOniActions(actor, actionTypes, { update: false })
    : await consumeSlayerActions(actor, actionTypes, { update: false });
  if (!actionResult.ok) return ui.notifications?.warn?.(actionResult.reason);

  const formulaParts = entradas.map((e) => buildEntryFormula(e.dado, e.fixo, e.selAttrs, attrValues));
  const specs = entradas.map((entry, index) => ({
    label: TIPOS_ACAO.find((type) => type.key === entry.tipoAcao)?.label ?? `Dano ${index + 1}`,
    types: entry.selTiposDano,
    formula: formulaParts[index],
  })).filter((spec) => spec.formula !== "0");
  const markFormula = attackerKind === "slayer" ? markDamageFormula(props, entradas) : "";
  if (markFormula) specs.push({ label: "Marca do Caçador", types: ["ferida"], formula: markFormula });
  const breathingState = parseWaterBreathingState(attackerKind === "slayer" ? props.resp_agua_estado : "");
  const breathingDamage = breathingState.pendingDamage;
  const hasAttackDamage = entradas.some((entry) => entry.tipoAcao === "ataque" || entry.tipoAcao === "especial" || entry.tipoAcao === "completa");
  if (breathingDamage?.formula && hasAttackDamage) {
    const formula = String(breathingDamage.formula).replace(/@([a-z_]+)/gi, (_, key) => String(attrValues[key.toLowerCase()] ?? 0));
    const types = Array.isArray(breathingDamage.types) ? breathingDamage.types : [];
    specs.push({ label: "Respiração da Água", types, formula, breathing: true });
    if (breathingDamage.critical) critical = true;
  }
  const flameState = parseFlameBreathingState(attackerKind === "slayer" ? props.resp_chamas_estado : "");
  const hasFlameBreathing = Boolean(props.resp_chamas_estado) || [...(actor.items ?? [])].some((item) => item.system?.props?.respiracao_nome === "Chamas");
  const flameDamage = flameState.pendingDamage;
  const flameTier = flameWeaponTier(flameState.weaponHeat);
  const flameTechnique = Boolean(flameDamage?.technique && hasAttackDamage);
  if (flameDamage?.formula && hasAttackDamage) specs.push({ label: "Respiração das Chamas", types: ["cortante"], formula: flameDamage.formula, flame: true });
  if (flameTechnique && flameTier.techniqueDie) specs.push({ label: "Fogo Fátuo", types: ["fogo"], formula: flameTier.techniqueDie, flame: true });
  if (flameState.ignition?.damageBonus && hasAttackDamage) specs.push({ label: "Ignição", types: ["fogo"], formula: String(flameState.ignition.damageBonus), flame: true });
  if (flameTier.weaponDamage > 0 && hasAttackDamage) specs.push({ label: "Fogo Fátuo — Arma", types: [], formula: String(flameTier.weaponDamage), flame: true });
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
  const subtotalDamage = components.reduce((total, component) => total + component.subtotal, 0);
  const finalDamage = flameTier.multiplier > 1 && hasAttackDamage ? Math.floor(subtotalDamage * flameTier.multiplier) : subtotalDamage;
  if (finalDamage > subtotalDamage) components.push({ label: "Fogo Fátuo 60 — +50%", types: ["fogo"], subtotal: finalDamage - subtotalDamage });
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
  if (flameDamage && hasAttackDamage) {
    const nextState = consumeFlamePending(flameState, { damage: true });
    const existing = updatesByActor.get(actor.uuid) ?? { actor, changes: {} };
    Object.assign(existing.changes, flameStatePatch(nextState));
    updatesByActor.set(actor.uuid, existing);
  }

  if (pdrGasto > 0) {
    const resourceProp = attackerKind === "oni" ? "pdk_oni_gasto_valor" : "pdr_slayer_gasto_valor";
    const pdrAtual = parseNumber(props[resourceProp]);
    const existing = updatesByActor.get(actor.uuid) ?? { actor, changes: {} };
    existing.changes[`system.props.${resourceProp}`] = pdrAtual + pdrGasto;
    updatesByActor.set(actor.uuid, existing);
  }

  const damageRequests = [];
  const targets = game?.user?.targets;
  if (targets && targets.size > 0 && finalDamage > 0) {
    for (const targetToken of targets) {
      const targetActor = targetToken.actor;
      if (!targetActor) continue;
      const heatMap = targetActor.getFlag?.(MODULE_ID, FLAME_HEAT_FLAG) ?? {};
      const heatBefore = Number(heatMap?.[actor.id]?.heat) || 0;
      const rengokuBonus = flameDamage?.rengoku
        ? heatBefore + (heatBefore >= 60 ? Math.max(0, Math.trunc(attrValues.fdv * attrValues.for)) : 0)
        : 0;
      let amount = finalDamage + rengokuBonus;
      if (flameDamage?.damagePerEnemyHeat && heatBefore > 0) {
        const heatRoll = await Roll.create(`${heatBefore}d8`).evaluate();
        await heatRoll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `<strong>Tormenta de Chamas</strong> — ${heatBefore}d8 pelas Brasas do alvo` });
        amount += Math.max(0, Math.trunc(Number(heatRoll.total) || 0));
      }
      if (flameDamage?.evasionDc) {
        const dex = parseAttributeValue(targetActor.system?.props?.dex_display);
        const save = await Roll.create(`1d20 + ${dex}`).evaluate();
        await save.toMessage({ speaker: ChatMessage.getSpeaker({ actor: targetActor }), flavor: `<strong>Tormenta de Chamas</strong> — Esquiva CD ${flameDamage.evasionDc}` });
        if (save.total >= flameDamage.evasionDc) amount = Math.floor(amount / 2);
      }
      if (flameDamage?.rengoku && flameDamage.saveDc) {
        const fdv = parseAttributeValue(targetActor.system?.props?.fdv_display);
        const save = await Roll.create(`1d20 + ${fdv}`).evaluate();
        await save.toMessage({ speaker: ChatMessage.getSpeaker({ actor: targetActor }), flavor: `<strong>Rengoku</strong> — FDV CD ${flameDamage.saveDc}` });
        if (save.total < flameDamage.saveDc) amount *= 2;
      }
      damageRequests.push({ actor: targetActor, amount, rengokuBonus, heatBefore });
    }
  }

  const knowsStone = attackerKind === "slayer" && [...(actor.items ?? [])].some((item) => item.system?.props?.respiracao_nome === "Pedra");
  if (knowsStone && hasAttackDamage && finalDamage > 0 && damageTypes.includes("concussao")) {
    const passiveState = parseBreathPassiveState(props.resp_passivas_estado);
    const weaponId = passiveState.lastWeapon?.id ?? "";
    if (weaponId) {
      const nextPassiveState = addStoneBreak(passiveState, weaponId, attrValues.for);
      const existing = updatesByActor.get(actor.uuid) ?? { actor, changes: {} };
      Object.assign(existing.changes, passiveStatePatch(nextPassiveState));
      updatesByActor.set(actor.uuid, existing);
    }
  }

  const pending = [...updatesByActor.values()];
  const results = await Promise.allSettled([
    ...pending.map(async (up) => {
      await up.actor.update(up.changes, { naCsbAutomation: true });
    }),
    ...damageRequests.map(({ actor: targetActor, amount }) => {
      const flameContext = hasFlameBreathing && hasAttackDamage ? {
        sourceId: actor.id,
        heat: 1 + Math.max(0, Number(flameState.activeForm?.enemyHeat) || 0),
        blockPenalty: Number(flameDamage.blockPenalty) || 0,
        blockPenaltyTurns: Number(flameDamage.blockPenaltyTurns) || 0,
        exhaustionOnHit: Number(flameDamage.exhaustionOnHit) || 0,
        exhaustionOverDamage: Number(flameDamage.exhaustionOverDamage) || 0,
      } : null;
      const targetKind = actorKind(targetActor);
      if (targetKind === "slayer") return applySlayerDamageAuto(targetActor, amount, { isAttack: true, attackName: nome, critical, damageTypes, components, flame: flameContext });
      if (targetKind === "oni") return applyOniDamage(targetActor, amount, { attackName: nome, critical, rolledTotal: finalDamage, damageTypes, components, requireApproval: true, flame: flameContext });
      return Promise.reject(new Error("Alvo sem identidade Slayer/Oni."));
    }),
  ]);

  const appliedTargets = [];
  for (const [index, result] of results.entries()) {
    if (result.status === "fulfilled") {
      if (index >= pending.length) {
        const targetActor = damageRequests[index - pending.length]?.actor;
        const applied = result.value;
        if (targetActor && applied?.ok !== false) {
          const amount = Math.max(0, Math.trunc(Number(applied?.appliedDamage) || 0));
          const wound = Math.max(0, Math.trunc(Number(applied?.woundDamage) || 0));
          appliedTargets.push({ name: targetActor.name, amount, wound });
          ui.notifications?.info?.(`${targetActor.name} recebeu ${amount} de dano${wound > 0 ? ` (${wound} de Ferida)` : ""}.`);
        }
      }
      continue;
    }
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
  const targetLine = appliedTargets.length
    ? `<div>Aplicado em: ${appliedTargets.map((target) => `${target.name} (${target.amount}${target.wound ? `, Ferida ${target.wound}` : ""})`).join(", ")}</div>`
    : damageRequests.length ? "<div>Alvo solicitado, mas a ficha não foi atualizada</div>" : "<div>Nenhum alvo — ficha não atualizada</div>";
  const flavor = `<div><strong>${nome}</strong>${critical ? " · CRÍTICO" : ""}${pdrGasto ? ` · −${pdrGasto} PDR` : ""}</div>${statusEffects.reasons.length ? `<div>Status: ${statusEffects.reasons.join(" · ")}</div>` : ""}${componentLines}<hr><div><strong>Total: ${finalDamage}</strong></div>${targetLine}`;
  const messageMode = game.settings?.get?.("core", "messageMode") ?? "public";
  const chatData = { speaker: ChatMessage.getSpeaker({ actor }), flavor, rolls, messageMode };
  await ChatMessage.create(chatData);
}

/**
 * Rola uma arma embutida usando o Rank e os atributos finais do Actor portador.
 * @param {object} options
 * @param {string} [options.itemUuid]
 * @param {string} [options.actorUuid]
 * @returns {Promise<void>}
 */
export async function rollWeaponItem(options = {}) {
  const directItem = options.item?.documentName === "Actor" ? null : options.item;
  const resolvedUuid = options.itemUuid ? await fromUuid(options.itemUuid) : null;
  const item = directItem ?? (resolvedUuid?.documentName === "Actor" ? null : resolvedUuid);
  if (!item) return ui.notifications?.warn?.("Item de arma não encontrado.");
  const actor = item.parent?.documentName === "Actor"
    ? item.parent
    : await resolveActor(options);
  if (!actor) return ui.notifications?.warn?.("A arma precisa estar vinculada a um Caçador para calcular o dano.");

  const itemProps = item.system?.props ?? {};
  const profiles = weaponProfilesForActor(itemProps, actor.system?.props ?? {});
  if (profiles.length === 0) return ui.notifications?.warn?.("Esta arma não possui perfil de ataque configurado.");

  return rollDamage({
    actor,
    nome: itemProps.arma_nome || item.name,
    weaponProfiles: profiles,
    tipoAcao: "ataque",
  });
}
