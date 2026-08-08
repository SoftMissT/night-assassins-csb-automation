/**
 * @fileoverview Entry point do módulo Night Assassins CSB Automation.
 */

import { MODULE_ID, ATTRIBUTES } from "./constants.mjs";
import { handleActorUpdate } from "./trigger-router.mjs";
import { rollTest } from "./roll-service.mjs";
import { rollHit } from "./hit-service.mjs";
import { rollDamage } from "./damage-service.mjs";
import { createLevelOneValues, processLevelGain } from "./level-service.mjs";
import { applyInitialMark, upgradeMarkAtLevelSix } from "./ability-service.mjs";
import { applyOniDamage, registerDamageRelay } from "./damage-relay.mjs";
import { parseNumber, currentConfigValues, latestValues, changedProp, isDestinyMark, normalizeAbilityKey } from "./parsing.mjs";
import { registerSettings, SETTINGS } from "./settings.mjs";
import { openGmDashboard } from "./gm-dashboard.mjs";
import { syncCanonicalMacros } from "./macro-sync.mjs";
import { openResistanceManager } from "./resistance-service.mjs";
import { openStatusManager } from "./status-service.mjs";
import { getRollStatusEffects, getDamageStatusEffects, getStatusCapabilities, mergeRollMode, isReactionBlocked } from "./status-effects.mjs";
import { applySlayerDamage, movementBlocked, processActorStatusTiming, reconcileSlayerExhaustion, registerStatusEngine, resolveSlayerHealing } from "./status-engine.mjs";
import { consumeSlayerActions, openActionManager, parseActionState, registerActionEngine, resetSlayerActions, slayerMovementMeters } from "./action-service.mjs";
import { openRestManager, registerRestEngine, resolveRestTier, restEligibleStatuses } from "./rest-service.mjs";

Hooks.once("init", () => {
  registerSettings();
});

Hooks.once("ready", () => {
  if (game.system.id !== "custom-system-builder") {
    console.warn?.(`[${MODULE_ID}] Sistema incompatível: ${game.system.id}. Módulo desativado.`);
    return;
  }
  registerStatusEngine();
  registerActionEngine();
  registerRestEngine();

  if (game.settings.get(MODULE_ID, SETTINGS.enableSheetAutomation)) {
    Hooks.on("updateActor", handleActorUpdate);
  }

  if (game.settings.get(MODULE_ID, SETTINGS.enableDamageRelay)) {
    registerDamageRelay();
  }

  if (game.user.isGM) {
    void syncCanonicalMacros()
      .then(({ created, updated }) => {
        if (created > 0 || updated > 0) ui.notifications.info(`Macros Night Assassins sincronizadas: ${created} adicionadas, ${updated} atualizadas.`);
      })
      .catch((error) => ui.notifications.error(`Falha ao carregar macros Night Assassins: ${error.message}`));
  }

  const module = game.modules.get(MODULE_ID);
  if (module) {
    module.api = {
      rollTest,
      rollHit,
      rollDamage,
      applyOniDamage,
      openGmDashboard,
      openResistanceManager,
      openStatusManager,
      getRollStatusEffects,
      getDamageStatusEffects,
      mergeRollMode,
      isReactionBlocked,
      getStatusCapabilities,
      applySlayerDamage,
      movementBlocked,
      processActorStatusTiming,
      reconcileSlayerExhaustion,
      resolveSlayerHealing,
      consumeSlayerActions,
      resetSlayerActions,
      parseActionState,
      openActionManager,
      slayerMovementMeters,
      openRestManager,
      resolveRestTier,
      restEligibleStatuses,
      syncMacros: syncCanonicalMacros,
      openLevelOne: createLevelOneValues,
      processLevel: processLevelGain,
      processAbility: applyInitialMark,
      upgradeMark: upgradeMarkAtLevelSix,
      diagnoseActor,
    };
  }

  console.log?.(`[${MODULE_ID}] Módulo ativado.`);
});

/**
 * Diagnostica um Actor retornando estado legível.
 * @param {Actor} actor
 * @returns {object}
 */
function diagnoseActor(actor) {
  if (!actor) return { ok: false, reason: "Actor não fornecido." };
  const props = actor.system?.props ?? {};
  const issues = [];

  const hasLevel1 = ATTRIBUTES.some((a) => props[`${a.key}_nvl1`] !== undefined && props[`${a.key}_nvl1`] !== null && props[`${a.key}_nvl1`] !== "");
  if (!hasLevel1) issues.push("Nível 1 incompleto.");

  const level = parseNumber(props.nvl_pj);
  const markBonus = parseNumber(props.hab_marca_destino_bonus);
  const markAttr = props.hab_marca_destino_atributo;
  const ability = normalizeAbilityKey(props.hab_escolhida);

  if (ability === "hab_escolhida_marca_destino" && markBonus < 2 && hasLevel1) {
    issues.push("Marca do Destino pendente: bônus +2 não aplicado.");
  }
  if (level >= 6 && markBonus === 2 && ability === "hab_escolhida_marca_destino") {
    issues.push("Marca do Destino pendente no nível 6: evolução para +3 não aplicada.");
  }

  return {
    ok: issues.length === 0,
    actor: actor.name,
    uuid: actor.uuid,
    level,
    ability,
    markBonus,
    markAttr,
    issues,
    config: currentConfigValues(props),
    latest: latestValues(props, level || 1),
  };
}
