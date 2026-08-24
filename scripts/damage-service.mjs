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
import { applyBreathingStatus, parseWaterBreathingState } from "./breath-service.mjs";
import { currentPdv } from "./status-engine.mjs";
import { parseStatusState } from "./status-service.mjs";
import { actorKind, isSlayerActor } from "./actor-kind.mjs";
import { weaponAmmoPatch, weaponAmmoState, weaponProfilesForActor } from "./weapon-service.mjs";
import { flameWeaponTier } from "./flame-breathing-data.mjs";
import { consumeFlameInterception, consumeFlamePending, FLAME_HEAT_FLAG, flameStatePatch, parseFlameBreathingState } from "./flame-breathing-service.mjs";
import { consumeStonePending, parseStoneBreathingState, stoneStatePatch } from "./stone-breathing-service.mjs";
import { consumeMistPending, mistStatePatch, parseMistBreathingState, resolveMistFormula, resolveMistStigmaStunOnHit } from "./mist-breathing-service.mjs";
import { canApplyMetalChain, consumeMetalHammerPending, metalStatePatch, parseMetalBreathingState, registerMetalChainApplication } from "./metal-breathing-service.mjs";
import { breakSnowRestrictionOnDamage, consumeSnowPending, parseSnowBreathingState, resolveSnowAvalancheSynergy, resolveSnowFreezeGain, resolveSnowKekkijutsuGuard, snowStatePatch } from "./snow-breathing-service.mjs";
import { resolveBreathingDefense } from "./breathing-defense.mjs";
import { consumeWindPending, parseWindBreathingState, windStatePatch } from "./wind-breathing-service.mjs";
import { WIND_SYNERGY_BREATHINGS } from "./wind-breathing-data.mjs";
import { addStoneBreak, parseBreathPassiveState, passiveStatePatch } from "./breath-passives.mjs";
import { openAttackBuilder } from "./items/attack-builder.mjs";
import { metalHammerSynergyAllies, spendMetalHammerSynergyPdr } from "./metal-runtime.mjs";

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

function weaponProfileEntry(profile, attrValues, { includeAttributes = true, attackIndex = 0 } = {}) {
  const attributeRules = Array.isArray(profile?.atributos) ? profile.atributos : [];
  const usableRules = includeAttributes ? attributeRules : attributeRules.filter((rule) => !["FOR", "DEX"].includes(String(rule?.key ?? "").toUpperCase()));
  const choiceRules = usableRules.filter((rule) => rule?.escolha === true);
  const additiveRules = usableRules.filter((rule) => rule?.escolha !== true);
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
    attackIndex,
  };
}

function weaponProfileEntries(profile, attrValues) {
  const count = Math.max(1, Math.trunc(Number(profile?.ataques) || 1));
  return Array.from({ length: count }, (_unused, attackIndex) => weaponProfileEntry(profile, attrValues, { includeAttributes: attackIndex === 0, attackIndex }));
}

async function chooseWeaponProfile(profiles) {
  if (profiles.length === 1) return profiles[0];
  const options = profiles.map((profile, index) => `<option value="${index}">${profile.nome || `Perfil ${index + 1}`}${profile.alcance ? ` ${profile.alcance}` : ""}</option>`).join("");
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

async function chooseMetalHammerSynergy(attacker) {
  const combatActors = [...(game?.combat?.combatants ?? [])]
    .map((combatant) => combatant.actor)
    .filter(Boolean);
  const allies = metalHammerSynergyAllies(attacker, combatActors, {
    isAlly: (candidate) => actorKind(candidate) === "slayer",
  });
  if (allies.length === 0) return null;
  const options = [
    '<option value="">Sem sinergia metade do dano</option>',
    ...allies.map((entry) => `<option value="${entry.uuid}">${entry.name} ${entry.breathing} (1 PDR; dano integral)</option>`),
  ].join("");
  const chosenUuid = await foundry.applications.api.DialogV2.wait({
    window: { title: "Sinergia Martelo do Julgamento" },
    content: `<div class="na-csb-automation"><p>Um aliado de Chamas, Pedra ou Magma pode gastar 1 PDR para elevar o ataque adicional ao dano integral.</p><select name="ally">${options}</select></div>`,
    modal: true,
    rejectClose: false,
    buttons: [
      { action: "continue", label: "Continuar", callback: (_event, button) => String(button.form.elements.ally.value ?? "") },
      { action: "cancel", label: "Cancelar", callback: () => null },
    ],
  });
  if (chosenUuid === null) return { canceled: true, ally: null };
  return { canceled: false, ally: allies.find((entry) => entry.uuid === chosenUuid) ?? null };
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
  const actionId = String(options.actionId ?? globalThis.foundry?.utils?.randomID?.() ?? globalThis.crypto?.randomUUID?.() ?? Date.now());
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
        weaponItem: selection.weaponItem ?? options.weaponItem,
        pdrCusto: parseNumber(options.pdrCusto) + parseNumber(selection.resourceCost),
      };
    }
  }

  const weaponProfiles = Array.isArray(options.weaponProfiles) ? options.weaponProfiles.filter((profile) => profile && typeof profile === "object") : [];
  let selectedWeaponProfile = null;
  let weaponAmmo = null;
  if (weaponProfiles.length > 0) {
    selectedWeaponProfile = await chooseWeaponProfile(weaponProfiles);
    if (!selectedWeaponProfile) return;
    weaponAmmo = weaponAmmoState(options.weaponItem?.system?.props ?? {}, selectedWeaponProfile);
    if (weaponAmmo.required && weaponAmmo.current < weaponAmmo.shots) {
      return ui.notifications?.warn?.(`Munição insuficiente: são necessários ${weaponAmmo.shots} disparo(s), mas restam ${weaponAmmo.current}.`);
    }
    options = { ...options, entradas: weaponProfileEntries(selectedWeaponProfile, attrValues) };
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
  const actionResult = options.skipActionConsumption === true
    ? { ok: true, patch: {} }
    : attackerKind === "oni"
      ? await consumeOniActions(actor, actionTypes, { update: false })
      : await consumeSlayerActions(actor, actionTypes, { update: false });
  if (!actionResult.ok) return ui.notifications?.warn?.(actionResult.reason);

  const formulaParts = entradas.map((e) => buildEntryFormula(e.dado, e.fixo, e.selAttrs, attrValues));
  let specs = entradas.map((entry, index) => ({
    label: TIPOS_ACAO.find((type) => type.key === entry.tipoAcao)?.label ?? `Dano ${index + 1}`,
    types: entry.selTiposDano,
    formula: formulaParts[index],
  })).filter((spec) => spec.formula !== "0");
  const markFormula = attackerKind === "slayer" ? markDamageFormula(props, entradas) : "";
  if (markFormula) specs.push({ label: "Marca do Caçador", types: ["ferida"], formula: markFormula });
  const breathingState = parseWaterBreathingState(attackerKind === "slayer" ? props.resp_agua_estado : "");
  const breathingDamage = breathingState.pendingDamage;
  const hasAttackDamage = options.forceAttackDamage === true
    || entradas.some((entry) => entry.tipoAcao === "ataque" || entry.tipoAcao === "especial" || entry.tipoAcao === "completa");
  const injectBreathing = options.skipBreathingInjection !== true;
  if (injectBreathing && breathingDamage?.formula && hasAttackDamage) {
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
  if (flameDamage?.critical === true && hasAttackDamage) critical = true;
  if (injectBreathing && flameDamage?.formula && hasAttackDamage) specs.push({ label: "Respiração das Chamas", types: ["cortante"], formula: flameDamage.formula, flame: true });
  if (injectBreathing && flameDamage?.comboRider?.formula && hasAttackDamage) specs.push({ label: "Respiração das Chamas (1ª Forma)", types: ["cortante"], formula: String(flameDamage.comboRider.formula), flame: true });
  if (flameTechnique && flameTier.techniqueDie) specs.push({ label: "Fogo Fátuo", types: ["fogo"], formula: flameTier.techniqueDie, flame: true });
  if (flameState.ignition?.damageBonus && hasAttackDamage) specs.push({ label: "Ignição", types: ["fogo"], formula: String(flameState.ignition.damageBonus), flame: true });
  const rengokuAllies = Math.max(0, Math.trunc(Number(flameDamage?.rengokuAllies) || 0));
  if (flameDamage?.rengoku && rengokuAllies > 0 && hasAttackDamage) {
    specs.push({ label: `Sinergia de Aliados (${rengokuAllies}×5)`, types: ["fogo"], formula: String(rengokuAllies * 5), flame: true });
  }
  if (flameTier.weaponDamage > 0 && hasAttackDamage) specs.push({ label: "Fogo Fátuo Arma", types: [], formula: String(flameTier.weaponDamage), flame: true });
  const stoneState = parseStoneBreathingState(attackerKind === "slayer" ? props.resp_pedra_estado : "");
  const stoneDamage = stoneState.pendingDamage;
  if (injectBreathing && stoneDamage?.formula && hasAttackDamage) {
    const formula = String(stoneDamage.formula).replace(/@for\b/giu, String(attrValues.for ?? 0));
    specs.push({ label: "Respiração da Pedra", types: stoneDamage.types ?? ["concussao"], formula, stone: true });
  }
  const mistState = parseMistBreathingState(attackerKind === "slayer" ? props.resp_nevoa_estado : "");
  const mistDamage = mistState.pendingDamage;
  if (injectBreathing && mistDamage?.formula && hasAttackDamage) {
    if (mistDamage.replaceWeaponDamage) specs = specs.filter((spec) => spec.breathing || spec.flame || spec.stone);
    specs.push({ label: "Respiração da Névoa", types: ["cortante"], formula: resolveMistFormula(mistDamage.formula, props), mist: true });
    if (critical && mistDamage.criticalFormula) specs.push({ label: "Colapso da Névoa crítico", types: ["cortante"], formula: resolveMistFormula(mistDamage.criticalFormula, props), mist: true });
  }
  const metalState = parseMetalBreathingState(attackerKind === "slayer" ? props.resp_metal_estado : "");
  const metalChain = metalState.chainReaction;
  const metalChainApplies = canApplyMetalChain(metalState, actionId) && hasAttackDamage
    && specs.some((spec) => spec.types?.some((type) => ["cortante", "perfurante"].includes(type)));
  if (metalChainApplies) {
    specs.push({ label: "Respiração do Metal Reação em Cadeia", types: [], formula: String(metalChain.damageBonus || 0), metal: true });
  }
  const snowState = parseSnowBreathingState(attackerKind === "slayer" ? props.resp_neve_estado : "");
  const snowDamage = snowState.pendingDamage;
  if (injectBreathing && snowDamage?.formula && hasAttackDamage) {
    specs.push({ label: "Respiração da Neve", types: ["congelante"], formula: String(snowDamage.formula), snow: true });
  }
  if (snowState.belowZero?.fdvDamageBonus && hasAttackDamage) {
    specs.push({ label: "Abaixo de Zero", types: ["congelante"], formula: String(snowState.belowZero.fdvDamageBonus), snow: true });
  }
  // Respiração do Vento — contrato pendingDamage (P0 dano fantasma corrigido)
  const windState = parseWindBreathingState(attackerKind === "slayer" ? props.resp_vento_estado : "");
  const windDamage = windState.pendingDamage;
  let garrasApplied = false;
  if (windDamage?.garras && hasAttackDamage && specs.length > 0 && !garrasApplied) {
    // Garras do Vento Puro: transforma o PRIMEIRO spec (dano da arma):
    // N2/N3 → arma ×N · N4 → (arma + DEX) ×N
    const weaponSpec = specs.find((spec) => !spec.breathing && !spec.flame && !spec.stone && !spec.mist && !spec.snow);
    if (weaponSpec) {
      const { multiplier, addDex } = windDamage.garras;
      weaponSpec.formula = addDex
        ? `((${weaponSpec.formula}) + ${attrValues.dex ?? 0}) * ${multiplier}`
        : `(${weaponSpec.formula}) * ${multiplier}`;
      weaponSpec.label = `${weaponSpec.label} (Garras ×${multiplier})`;
      garrasApplied = true;
    }
  }
  if (injectBreathing && windDamage?.formula && hasAttackDamage) {
    specs.push({ label: "Respiração do Vento", types: Array.isArray(windDamage.types) ? windDamage.types : [], formula: String(windDamage.formula).replace(/@(dex|fdv|for)\b/giu, (_m, key) => String(attrValues[String(key).toLowerCase()] ?? 0)), wind: true });
  }
  if (specs.length === 0) return ui.notifications?.warn?.("Informe ao menos um dado, valor fixo ou atributo no dano.");

  let rolls;
  try {
    rolls = await Promise.all(specs.map((spec) => Roll.create(critical ? `2 * (${spec.formula})` : spec.formula).evaluate()));
  } catch (_) {
    ui.notifications?.error?.(`Fórmula inválida: ${specs.map((spec) => spec.formula).join(" + ")}`);
    return;
  }
  if (weaponAmmo?.required && hasAttackDamage && options.weaponItem?.update) {
    const patch = weaponAmmoPatch(options.weaponItem.system?.props ?? {}, weaponAmmo.current - weaponAmmo.shots);
    if (patch) {
      try {
        await options.weaponItem.update(patch, { naCsbAutomation: true });
      } catch (error) {
        console.warn?.(`[${MODULE_ID}] Falha ao consumir munição`, error);
        return ui.notifications?.warn?.("A arma não pôde atualizar a munição; o dano foi cancelado.");
      }
    }
  }
  // Dice So Nice é acionado automaticamente pelo ChatMessage.create quando rolls está preenchido.
  const components = specs.map((spec, index) => ({
    label: spec.label,
    types: spec.types,
    subtotal: Math.max(0, Math.trunc(Number(rolls[index].total) || 0)),
  }));
  const snowPenalty = actor.getFlag?.(MODULE_ID, "snowPenalty");
  let penalty = Math.max(0, -Math.trunc(statusEffects.modifier || 0) + Math.max(0, -(Number(snowPenalty?.damagePenalty) || 0)));
  for (const component of components) {
    if (penalty <= 0) break;
    const reduction = Math.min(component.subtotal, penalty);
    component.subtotal -= reduction;
    penalty -= reduction;
  }
  const subtotalDamage = components.reduce((total, component) => total + component.subtotal, 0);
  const finalDamage = flameTier.multiplier > 1 && hasAttackDamage ? Math.floor(subtotalDamage * flameTier.multiplier) : subtotalDamage;
  if (finalDamage > subtotalDamage) components.push({ label: "Fogo Fátuo 60 +50%", types: ["fogo"], subtotal: finalDamage - subtotalDamage });
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
  if (stoneDamage && hasAttackDamage) {
    const existing = updatesByActor.get(actor.uuid) ?? { actor, changes: {} };
    Object.assign(existing.changes, stoneStatePatch(consumeStonePending(stoneState, { damage: true })));
    updatesByActor.set(actor.uuid, existing);
  }
  if (mistDamage && hasAttackDamage) {
    const existing = updatesByActor.get(actor.uuid) ?? { actor, changes: {} };
    Object.assign(existing.changes, mistStatePatch(consumeMistPending(mistState, { damage: true })));
    updatesByActor.set(actor.uuid, existing);
  }
  if (snowDamage && hasAttackDamage) {
    const existing = updatesByActor.get(actor.uuid) ?? { actor, changes: {} };
    Object.assign(existing.changes, snowStatePatch(consumeSnowPending(snowState, { damage: true })));
    updatesByActor.set(actor.uuid, existing);
  }
  if (windDamage && hasAttackDamage && windDamage.formula !== "") {
    const existing = updatesByActor.get(actor.uuid) ?? { actor, changes: {} };
    Object.assign(existing.changes, windStatePatch(consumeWindPending(windState, { damage: true })));
    updatesByActor.set(actor.uuid, existing);
  }
  if (metalChainApplies) {
    const existing = updatesByActor.get(actor.uuid) ?? { actor, changes: {} };
    Object.assign(existing.changes, registerMetalChainApplication(metalState, actionId).patch);
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
  // Estigma da Névoa: "ao acertar qualquer ataque, pode atordoar o inimigo
  // por 1 turno" — benefício único por ataque bem-sucedido (não por alvo em
  // AOE), consumido aqui porque este é o ponto em que um acerto com dano
  // real contra um alvo é confirmado. `earned` nunca é apagado.
  let stigmaStunApplied = false;
  let cycloneAttackRoll = null;
  let cycloneAttackRolledMessage = false;
  let windSuppressResistances = false;
  const windVentaniaTargets = new Set();
  let windTufaoHealPending = false;
  if (targets && targets.size > 0 && finalDamage > 0) {
    for (const targetToken of targets) {
      const protectedActor = targetToken.actor;
      if (!protectedActor) continue;
      const interceptionFlag = protectedActor.getFlag?.(MODULE_ID, "flameInterception");
      const interception = consumeFlameInterception(interceptionFlag, protectedActor.uuid);
      const interceptorDocument = interception.intercepted
        ? await fromUuid(interception.interceptorUuid)
        : null;
      const interceptorActor = interceptorDocument?.actor ?? interceptorDocument;
      const targetActor = interceptorActor?.documentName === "Actor" ? interceptorActor : protectedActor;
      const intercepted = targetActor.uuid !== protectedActor.uuid;
      const heatMap = targetActor.getFlag?.(MODULE_ID, FLAME_HEAT_FLAG) ?? {};
      const heatBefore = Number(heatMap?.[actor.id]?.heat) || 0;
      let rengokuBonus = 0;
      let amount = finalDamage;
      let targetComponents = components.map((component) => ({ ...component, types: [...component.types] }));
      const targetMist = parseMistBreathingState(targetActor.system?.props?.resp_nevoa_estado);
      let effectiveCritical = critical;
      if (targetMist.dazzle?.criticalImmunity && critical) {
        targetComponents = specs.map((spec, index) => ({
          label: spec.label,
          types: [...spec.types],
          subtotal: Math.max(0, Math.trunc((Number(rolls[index].total) || 0) / 2)),
        }));
        const normalSubtotal = targetComponents.reduce((total, component) => total + component.subtotal, 0);
        amount = flameTier.multiplier > 1 && hasAttackDamage
          ? Math.floor(normalSubtotal * flameTier.multiplier)
          : normalSubtotal;
        if (amount > normalSubtotal) targetComponents.push({
          label: "Fogo Fátuo 60 +50%",
          types: ["fogo"],
          subtotal: amount - normalSubtotal,
        });
        effectiveCritical = false;
      }
      const blizzardStealth = actor.getFlag?.(MODULE_ID, "snowBlizzardStealth");
      if (blizzardStealth?.sourceActorUuid) {
        const sourceDocument = await fromUuid(blizzardStealth.sourceActorUuid);
        const snowSource = sourceDocument?.actor ?? sourceDocument;
        const synergy = resolveSnowAvalancheSynergy(snowSource?.system?.props?.resp_neve_estado, { targetUuid: targetActor.uuid, allyStealthed: true });
        if (synergy.applies) {
          const bonusRoll = await Roll.create(synergy.formula).evaluate();
          await bonusRoll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: "<strong>Avalanche Negativa</strong> sinergia com Nevasca" });
          const bonus = Math.max(0, Math.trunc(Number(bonusRoll.total) || 0));
          amount += bonus;
          targetComponents.push({ label: "Avalanche Negativa aliado furtivo", types: ["congelante"], subtotal: bonus });
          await targetActor.setFlag(MODULE_ID, "snowMovementPenalty", { value: bonus, turns: synergy.movementTurns, sourceActorUuid: snowSource?.uuid ?? "" });
        }
      }
      if (options.sourceFamily === "kekkijutsu") {
        const guardSourceFlag = targetActor.getFlag?.(MODULE_ID, "snowKekkijutsuGuardSource");
        const guardDocument = guardSourceFlag?.sourceActorUuid ? await fromUuid(guardSourceFlag.sourceActorUuid) : targetActor;
        const guardActor = guardDocument?.actor ?? guardDocument;
        const resolvedGuard = resolveSnowKekkijutsuGuard(guardActor?.system?.props?.resp_neve_estado, { enemyUuid: actor.uuid });
        if (resolvedGuard.active && (!resolvedGuard.protectedUuid || resolvedGuard.protectedUuid === targetActor.uuid)) {
          amount = Math.floor(amount * resolvedGuard.damageMultiplier);
          targetComponents = targetComponents.map((component) => ({ ...component, subtotal: Math.floor(component.subtotal * resolvedGuard.damageMultiplier) }));
          let nextGuardState = resolvedGuard.state;
          if (resolvedGuard.freeze > 0) nextGuardState = resolveSnowFreezeGain(nextGuardState, actor.uuid, resolvedGuard.freeze).state;
          await guardActor.update(snowStatePatch(nextGuardState), { naCsbAutomation: true, naBreathing: true });
          if (guardSourceFlag) await targetActor.unsetFlag(MODULE_ID, "snowKekkijutsuGuardSource");
          if (resolvedGuard.opportunityAttack) await guardActor.setFlag(MODULE_ID, "snowOpportunityAttack", { enemyUuid: actor.uuid, available: true });
          if (resolvedGuard.negateEffects) ui.notifications?.info?.("A Canção de um Dia Frio anulou os efeitos negativos do Kekkijutsu.");
        }
      }
      if (flameDamage?.damagePerEnemyHeat && heatBefore > 0) {
        const heatRoll = await Roll.create(`${heatBefore}d8`).evaluate();
        await heatRoll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `<strong>Tormenta de Chamas</strong> ${heatBefore}d8 pelas Brasas do alvo` });
        amount += Math.max(0, Math.trunc(Number(heatRoll.total) || 0));
      }
      if (flameDamage?.evasionDc) {
        const dex = parseAttributeValue(targetActor.system?.props?.dex_display);
        const save = await Roll.create(`1d20 + ${dex}`).evaluate();
        await save.toMessage({ speaker: ChatMessage.getSpeaker({ actor: targetActor }), flavor: `<strong>Tormenta de Chamas</strong> Esquiva CD ${flameDamage.evasionDc}` });
        if (save.total >= flameDamage.evasionDc) amount = Math.floor(amount / 2);
      }
      if (flameDamage?.rengoku && flameDamage.saveDc) {
        const fdv = parseAttributeValue(targetActor.system?.props?.fdv_display);
        const save = await Roll.create(`1d20 + ${fdv}`).evaluate();
        await save.toMessage({ speaker: ChatMessage.getSpeaker({ actor: targetActor }), flavor: `<strong>Rengoku</strong> FDV CD ${flameDamage.saveDc}` });
        if (save.total < flameDamage.saveDc) {
          // Vulnerável ao Rengoku: +1 dano por ponto de Fogo Fátuo da arma;
          // com 60+ Brasas Ardentes NAQUELE alvo, acrescenta FDV × FOR.
          rengokuBonus = Math.max(0, Number(flameState.weaponHeat) || 0)
            + (heatBefore >= 60 ? Math.max(0, Math.trunc(attrValues.fdv * attrValues.for)) : 0);
          amount += rengokuBonus;
        }
      }
      // ─── Respiração do Vento ───────────────────────────────────────────
      if (windDamage?.cycloneOpposed && hasAttackDamage) {
        // DECISÃO PENDENTE documentada: usa UMA rolagem ofensiva compartilhada
        // comparada à Esquiva individual de cada alvo.
        cycloneAttackRoll ??= await Roll.create(`1d20 + ${parseAttributeValue(props.dex_display)} + ${parseNumber(props.hab_acerto_bonus)}`).evaluate();
        if (!cycloneAttackRolledMessage) {
          await cycloneAttackRoll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: "<strong>Ciclone Penetrante</strong> Acerto padrão" });
          cycloneAttackRolledMessage = true;
        }
        const esquivaTarget = parseAttributeValue(targetActor.system?.props?.dex_display) + parseNumber(targetActor.system?.props?.hab_esquiva_bonus);
        if (cycloneAttackRoll.total < esquivaTarget) amount = Math.floor(amount / 2);
      }
      if (windDamage?.ignoreResistance && hasAttackDamage) windSuppressResistances = true;
      if (windDamage?.disablesHealing && hasAttackDamage && amount > 0) {
        await targetActor.setFlag(MODULE_ID, "windHealBlock", {
          sourceActorUuid: actor.uuid,
          kekkijutsuSurcharge: Number(windDamage.kekkijutsuSurcharge) || 0,
          untilRound: (game.combat?.round ?? 0) + 1,
        });
        ui.notifications?.info?.(`Tempestade Crescente: ${targetActor.name} não pode curar PDV até o próximo turno do usuário.`);
      }
      if (windDamage?.critBlocksRegenerationTurns && effectiveCritical && hasAttackDamage) {
        await targetActor.setFlag(MODULE_ID, "windRegenBlock", {
          turns: windDamage.critBlocksRegenerationTurns,
          sourceName: "Fumaça Escurecedora",
        });
      }
      if (windDamage?.tufao && hasAttackDamage && amount > 0) {
        const vit = parseAttributeValue(targetActor.system?.props?.vit_display);
        const bleedSave = await Roll.create(`1d20 + ${vit}`).evaluate();
        await bleedSave.toMessage({ speaker: ChatMessage.getSpeaker({ actor: targetActor }), flavor: `<strong>Tufão Idaten</strong> Sangramento VIT CD ${windDamage.tufao.bleedSaveDc}` });
        if (bleedSave.total < windDamage.tufao.bleedSaveDc) {
          await applyBreathingStatus(targetActor, "sangramento", {
            damageFormula: String(parseNumber(props.for_display)), remainingTurns: 3,
            sourceName: "Tufão Idaten", tick: "start", stacks: 1,
          });
        }
      }
      const targetSnowPenalty = targetActor.getFlag?.(MODULE_ID, "snowPenalty");
      if (targetSnowPenalty?.vulnerabilities?.some((type) => damageTypes.includes(type))) {
        amount *= 2;
        targetComponents = targetComponents.map((component) => component.types.some((type) => targetSnowPenalty.vulnerabilities.includes(type))
          ? { ...component, subtotal: component.subtotal * 2 }
          : component);
      }
      const existingSuppression = targetActor.getFlag?.(MODULE_ID, "mistResistanceSuppression");
      const newSuppressionTurns = Math.max(0, Number(mistDamage?.suppressResistanceTurns) || 0);
      if (newSuppressionTurns > 0) await targetActor.setFlag(MODULE_ID, "mistResistanceSuppression", { turns: newSuppressionTurns, sourceActorUuid: actor.uuid });
      const suppressResistances = newSuppressionTurns > 0 || Number(existingSuppression?.turns) > 0 || windSuppressResistances;
      const defense = resolveBreathingDefense({ amount, components: targetComponents, damageTypes, props: targetActor.system?.props ?? {}, suppressResistances });
      amount = defense.amount;
      targetComponents = defense.components;
      const targetPatch = { ...defense.patches };
      if (targetMist.incomingReduction?.formula && amount > 0) {
        const sourceToken = actor.getActiveTokens?.()[0];
        const targetActiveToken = targetActor.getActiveTokens?.()[0];
        const distance = sourceToken && targetActiveToken ? canvas?.grid?.measurePath?.([sourceToken.center, targetActiveToken.center])?.distance : null;
        const ranged = Number.isFinite(Number(distance)) && Number(distance) > 2;
        if (!targetMist.incomingReduction.rangedOnly || ranged) {
          const reduction = await Roll.create(targetMist.incomingReduction.formula).evaluate();
          await reduction.toMessage({ speaker: ChatMessage.getSpeaker({ actor: targetActor }), flavor: "<strong>Expansão de Névoa</strong> redução de dano" });
          amount = Math.max(0, amount - Math.max(0, Math.trunc(Number(reduction.total) || 0)));
          delete targetMist.incomingReduction;
          Object.assign(targetPatch, mistStatePatch(targetMist));
        }
      }
      if (targetMist.incomingHalfOnFailedSave && amount > 0) {
        const dcParts = String(targetMist.incomingHalfOnFailedSave.saveDc ?? "").match(/\d+/g) ?? [];
        const dc = dcParts.map(Number).reduce((total, value) => total + value, 0);
        const sab = parseAttributeValue(actor.system?.props?.sab_display);
        const save = await Roll.create(`1d20 + ${sab}`).evaluate();
        await save.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `<strong>Mar de Nuvens</strong> SAB contra CD ${dc}` });
        if (save.total < dc) amount = Math.floor(amount / 2);
        delete targetMist.incomingHalfOnFailedSave;
        Object.assign(targetPatch, mistStatePatch(targetMist));
      }
      if (!stigmaStunApplied && amount > 0 && attackerKind === "slayer" && targetActor.uuid !== actor.uuid) {
        const existingAttacker = updatesByActor.get(actor.uuid) ?? { actor, changes: {} };
        const attackerMistNow = existingAttacker.changes["system.props.resp_nevoa_estado"]
          ? parseMistBreathingState(existingAttacker.changes["system.props.resp_nevoa_estado"])
          : mistState;
        const stunResult = resolveMistStigmaStunOnHit(attackerMistNow);
        if (stunResult.applied) {
          stigmaStunApplied = true;
          Object.assign(existingAttacker.changes, mistStatePatch(stunResult.state));
          updatesByActor.set(actor.uuid, existingAttacker);
          await applyBreathingStatus(targetActor, "atordoamento", stunResult.effect);
        }
      }
      damageRequests.push({ actor: targetActor, protectedActor, intercepted, amount, rengokuBonus, heatBefore, components: targetComponents, patch: targetPatch, negated: defense.negated, critical: effectiveCritical });
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
    ...damageRequests.map(async ({ actor: targetActor, amount, components: targetComponents, patch: targetPatch, negated, critical: targetCritical }) => {
      if (Object.keys(targetPatch ?? {}).length) await targetActor.update(targetPatch, { naCsbAutomation: true, naBreathing: true });
      if (amount <= 0) return { ok: true, appliedDamage: 0, woundDamage: 0, negated };
      // Normalização no boundary: pendingDamage ausente (ataque padrão sem
      // técnica armada) NÃO pode crashar — contrato neutro = zeros.
      const flameContext = hasFlameBreathing && hasAttackDamage ? {
        sourceId: actor.id,
        heat: 1 + Math.max(0, Number(flameState.activeForm?.enemyHeat) || 0),
        blockPenalty: Number(flameDamage?.blockPenalty) || 0,
        blockPenaltyTurns: Number(flameDamage?.blockPenaltyTurns) || 0,
        exhaustionOnHit: Number(flameDamage?.exhaustionOnHit) || 0,
        exhaustionOverDamage: Number(flameDamage?.exhaustionOverDamage) || 0,
      } : null;
      const targetKind = actorKind(targetActor);
      if (targetKind === "slayer") return applySlayerDamageAuto(targetActor, amount, { isAttack: true, attackName: nome, critical: targetCritical, damageTypes, components: targetComponents, flame: flameContext });
      // Oni completo, Oni Minion e NPC compartilham o mesmo relay de dano
      // (chaves distintas resolvidas dentro do relay por tipo de ator).
      if (targetKind === "oni" || targetKind === "oni_minion" || targetKind === "npc") return applyOniDamage(targetActor, amount, { attackName: nome, critical: targetCritical, rolledTotal: amount, damageTypes, components: targetComponents, requireApproval: true, flame: flameContext });
      return Promise.reject(new Error(`Alvo sem identidade Slayer/Oni (${targetKind ?? "desconhecido"}): ${targetActor?.name ?? ""}.`));
    }),
  ]);

  // ─── Respiração do Vento — pós-dano ─────────────────────────────────
  for (const request of damageRequests) {
    if (!(request.amount > 0)) continue;
    // 7º Estilo: inimigos atingidos neste turno testam VIT (uma vez por alvo/turno)
    if (windDamage?.ventania && hasAttackDamage) {
      windVentaniaTargets.add(request.actor);
    }
    // 9º Estilo: cura 5 PDV se dano líquido >= 10% do PDV máximo do alvo
    if (windDamage?.tufao && request.amount > 0 && !windTufaoHealPending) {
      const maxPdv = parseNumber(request.actor.system?.props?.pdv_slayer_maximo_num)
        || parseNumber(request.actor.system?.props?.pdv_oni_maximo_num) || 0;
      const thresholdPdv = Number(windDamage.tufao.healThresholdPercent ?? 10);
      if (maxPdv > 0 && request.amount >= Math.ceil(maxPdv * thresholdPdv / 100)) windTufaoHealPending = true;
    }
  }
  for (const targetActor of windVentaniaTargets) {
    const round = game.combat?.round ?? 0;
    const turn = game.combat?.turn ?? 0;
    const saveKey = `windVentaniaSave`;
    const saves = targetActor.getFlag?.(MODULE_ID, saveKey) ?? {};
    if (saves[`${round}:${turn}`]) continue;
    const dcTotal = (await Roll.create(windDamage.ventania.dcFormula).evaluate()).total;
    const vit = parseAttributeValue(targetActor.system?.props?.vit_display);
    const save = await Roll.create(`1d20 + ${vit}`).evaluate();
    await save.toMessage({ speaker: ChatMessage.getSpeaker({ actor: targetActor }), flavor: `<strong>Ventania Rajadas Repentinas</strong> VIT CD ${dcTotal}` });
    await targetActor.setFlag(MODULE_ID, saveKey, { ...saves, [`${round}:${turn}`]: true });
    if (save.total < dcTotal) {
      const fallRoll = await Roll.create(windDamage.ventania.fallDamage).evaluate();
      await fallRoll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: targetActor }), flavor: "<strong>Ventania</strong> dano de queda" });
      const kind = actorKind(targetActor);
      if (kind === "slayer") await applySlayerDamageAuto(targetActor, fallRoll.total, { isAttack: false, attackName: "Ventania — queda", damageTypes: ["concussao"] });
      else if (kind === "oni") await applyOniDamage(targetActor, fallRoll.total, { attackName: "Ventania — queda", rolledTotal: fallRoll.total, damageTypes: ["concussao"] });
      await targetActor.setFlag(MODULE_ID, "windProne", {
        sourceActorUuid: actor.uuid,
        untilRound: round + 1,
        message: "Levantar exige gastar uma Ação Especial no próximo turno.",
      });
    }
  }
  if (windTufaoHealPending && Number(windDamage?.healOnBigHit ?? 0) > 0 && attackerKind === "slayer") {
    const healed = parseNumber(props.pdv_slayer_curado) + Number(windDamage.healOnBigHit);
    await actor.update({ "system.props.pdv_slayer_curado": healed }, { naCsbAutomation: true, naBreathing: true });
    ui.notifications?.info?.(`Tufão Idaten: você recupera ${windDamage.healOnBigHit} PDV.`);
  }

  const appliedTargets = [];
  for (const [index, result] of results.entries()) {
    if (result.status === "fulfilled") {
      if (index >= pending.length) {
        const request = damageRequests[index - pending.length];
        const targetActor = request?.actor;
        const applied = result.value;
        if (targetActor && applied?.ok !== false) {
          if (request.intercepted) {
            await request.protectedActor.unsetFlag(MODULE_ID, "flameInterception");
            await ChatMessage.create({
              speaker: ChatMessage.getSpeaker({ actor: targetActor }),
              content: `<p><strong>Ondulação da Chama Fluorescente</strong> ${targetActor.name} interceptou o dano destinado a ${request.protectedActor.name}.</p>`,
            });
          }
          const amount = Math.max(0, Math.trunc(Number(applied?.appliedDamage) || 0));
          const wound = Math.max(0, Math.trunc(Number(applied?.woundDamage) || 0));
          if (amount + wound > 0) {
            const restriction = targetActor.getFlag?.(MODULE_ID, "snowRestriction");
            if (restriction?.sourceActorUuid) {
              await targetActor.unsetFlag(MODULE_ID, "snowRestriction");
              const source = await fromUuid(restriction.sourceActorUuid);
              if (source?.system?.props?.resp_neve_estado) {
                const broken = breakSnowRestrictionOnDamage(source.system.props.resp_neve_estado, targetActor.uuid);
                await source.update(snowStatePatch(broken.state), { naCsbAutomation: true, naBreathing: true });
              }
            }
          }
          appliedTargets.push({ actor: targetActor, name: targetActor.name, amount, wound });
          ui.notifications?.info?.(`${targetActor.name} recebeu ${amount} de dano${wound > 0 ? ` (${wound} de Ferida)` : ""}.`);

          // Água 5 (Chuva Misericordiosa): finalizar o alvo recupera PDR igual
          // ao Nível de Respiração do usuário (regra do .md "Se finalizar").
          const killRecovery = Math.max(0, Math.trunc(parseNumber(breathingDamage?.recoverPdrOnKill)));
          if (killRecovery > 0 && targetActor.system?.props && currentPdv(targetActor.system.props) <= 0) {
            const pdrGastoAtual = parseNumber(props.pdr_slayer_gasto_valor);
            await actor.update({
              "system.props.pdr_slayer_gasto_valor": Math.max(0, pdrGastoAtual - killRecovery),
            }, { naCsbAutomation: true, naBreathing: true });
            ui.notifications?.info?.(`Chuva Misericordiosa: ${actor.name} recuperou ${killRecovery} PDR ao finalizar ${targetActor.name}.`);
          }
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

  const passiveAfterDamage = parseBreathPassiveState(actor.system?.props?.resp_passivas_estado);
  if (attackerKind === "slayer" && passiveAfterDamage.metal?.hammerPending && appliedTargets.length > 0) {
    const useHammer = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Martelo do Julgamento" },
      content: `<p>Usar o ataque adicional contra ${appliedTargets[0].name}? O dano será metade do dano causado, arredondado para cima, e ignorará Resistência.</p>`,
      rejectClose: false,
    });
    if (useHammer) {
      const synergyChoice = await chooseMetalHammerSynergy(actor);
      const originalDamage = appliedTargets[0].amount + appliedTargets[0].wound;
      let selectedAlly = synergyChoice?.canceled ? null : synergyChoice?.ally ?? null;
      let allySpend = selectedAlly ? spendMetalHammerSynergyPdr(selectedAlly.actor, 1) : null;
      if (selectedAlly && !allySpend.ok) {
        ui.notifications?.warn?.(`${allySpend.reason} O Martelo seguirá sem a sinergia.`);
        selectedAlly = null;
        allySpend = null;
      }
      const hammer = consumeMetalHammerPending(passiveAfterDamage, {
        breathingLevel: parseNumber(props.nvl_respiracao_num),
        originalDamage,
        synergyBreathing: selectedAlly?.breathing ?? "",
        allySpendsPdr: Boolean(selectedAlly),
      });
      if (hammer.ok) {
        if (selectedAlly) {
          await selectedAlly.actor.update(allySpend.patch, { naCsbAutomation: true, naBreathing: true });
        }
        try {
          await actor.update(passiveStatePatch(hammer.state), { naCsbAutomation: true, naBreathing: true });
        } catch (error) {
          if (selectedAlly && allySpend?.ok) {
            const spentKey = "system.props.pdr_slayer_gasto_valor";
            await selectedAlly.actor.update({ [spentKey]: Math.max(0, parseNumber(selectedAlly.actor.system?.props?.pdr_slayer_gasto_valor) - allySpend.cost) }, { naCsbAutomation: true, naBreathing: true });
          }
          throw error;
        }
        const { rollHit } = await import("./hit-service.mjs");
        const hit = await rollHit({ actor, actorUuid: actor.uuid });
        if (hit?.hits > 0) {
          const targetActor = appliedTargets[0].actor;
          const context = {
            attackName: "Martelo do Julgamento",
            damageTypes: ["concussao"],
            components: [{ label: "Martelo do Julgamento", types: ["concussao"], subtotal: hammer.damage }],
            ignoreResistance: true,
            requireApproval: true,
          };
          if (actorKind(targetActor) === "slayer") await applySlayerDamageAuto(targetActor, hammer.damage, context);
          else await applyOniDamage(targetActor, hammer.damage, context);
        }
      }
    }
  }
  const componentLines = components.map((component) => {
    const labels = component.types.map((key) => TIPOS_DANO.find((type) => type.key === key)?.label ?? key).join(" · ") || "Sem tipo";
    return `<div><strong>${component.label}</strong> ${labels}: <strong>${component.subtotal}</strong></div>`;
  }).join("");
  const targetLine = appliedTargets.length
    ? `<div>Aplicado em: ${appliedTargets.map((target) => `${target.name} (${target.amount}${target.wound ? `, Ferida ${target.wound}` : ""})`).join(", ")}</div>`
    : damageRequests.length ? "<div>Alvo solicitado, mas a ficha não foi atualizada</div>" : "<div>Nenhum alvo ficha não atualizada</div>";
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
  let profiles = weaponProfilesForActor(itemProps, actor.system?.props ?? {});
  if (profiles.length === 0) return ui.notifications?.warn?.("Esta arma não possui perfil de ataque configurado.");
  if (Number.isInteger(options.weaponProfileIndex) && profiles[options.weaponProfileIndex]) {
    profiles = [profiles[options.weaponProfileIndex]];
  }

  return rollDamage({
    actor,
    nome: itemProps.arma_nome || item.name,
    weaponProfiles: profiles,
    weaponItem: item,
    tipoAcao: "ataque",
    critical: options.critical === true,
    actionId: options.actionId,
    skipActionConsumption: options.skipActionConsumption === true,
    forceAttackDamage: options.forceAttackDamage === true,
  });
}

export async function reloadWeaponItem(options = {}) {
  const directItem = options.item?.documentName === "Actor" ? null : options.item;
  const resolvedUuid = options.itemUuid ? await fromUuid(options.itemUuid) : null;
  const item = directItem ?? (resolvedUuid?.documentName === "Actor" ? null : resolvedUuid);
  if (!item) return ui.notifications?.warn?.("Item de arma não encontrado.");
  const actor = item.parent?.documentName === "Actor" ? item.parent : await resolveActor(options);
  if (!actor) return ui.notifications?.warn?.("A arma precisa estar vinculada a um Slayer para recarregar.");

  const props = item.system?.props ?? {};
  const capacity = Math.max(0, Math.trunc(parseNumber(props.arma_municao_capacidade)));
  if (capacity <= 0) return ui.notifications?.warn?.("Esta arma não possui capacidade de munição configurada.");
  const current = Math.max(0, Math.min(capacity, Math.trunc(parseNumber(props.arma_municao_atual ?? capacity))));
  if (current >= capacity) return ui.notifications?.info?.("A arma já está com a munição cheia.");

  const actionResult = await consumeSlayerActions(actor, ["unica"], { update: false });
  if (!actionResult.ok) return ui.notifications?.warn?.(actionResult.reason);
  const itemPatch = weaponAmmoPatch(props, capacity);
  try {
    await Promise.all([
      actor.update(actionResult.patch, { naCsbAutomation: true, naActionEconomy: true }),
      item.update(itemPatch, { naCsbAutomation: true }),
    ]);
  } catch (error) {
    console.warn?.(`[${MODULE_ID}] Falha ao recarregar arma`, error);
    return ui.notifications?.warn?.("Não foi possível concluir a recarga da arma.");
  }
  return ui.notifications?.info?.(`${item.name || "Arma"} recarregada: ${capacity}/${capacity}.`);
}
