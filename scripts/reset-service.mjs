/**
 * @fileoverview Serviço unificado de reset de ficha (Slayer/Oni).
 * Expõe: resetSheet(actor) — DialogV2 + confirmação + reset.
 * Não usa TemplateSystem.reloadTemplate().
 */

import { isSlayerForReset, buildSlayerResetPatch, resetSlayerSheetState } from "./reset-slayer-service.mjs";
import { isOniForReset, buildOniResetPatch, resetOniSheetState } from "./oni/reset-oni-service.mjs";

/**
 * Detecta o tipo de actor (slayer/oni/desconhecido).
 * @param {Actor} actor
 * @returns {"slayer"|"oni"|"unknown"}
 */
function detectKind(actor) {
  if (isSlayerForReset(actor)) return "slayer";
  if (isOniForReset(actor)) return "oni";
  return "unknown";
}

/**
 * Verifica permissão para resetar.
 * @param {Actor} actor
 * @returns {boolean}
 */
function canReset(actor) {
  if (game.user?.isGM) return true;
  const ownership = actor.ownership?.[game.user?.id] ?? actor.permission;
  return ownership >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
}

/**
 * Abre DialogV2 de confirmação e executa o reset se confirmado.
 * @param {Actor} actor
 * @returns {Promise<{ success: boolean, cancelled?: boolean }>}
 */
export async function resetSheet(actor) {
  if (!actor?.update) throw new Error("Actor inválido para reset.");

  const kind = detectKind(actor);
  if (kind === "unknown") {
    ui.notifications.warn(`${actor.name} não é um Slayer ou Oni válido para reset.`);
    return { success: false, cancelled: false };
  }

  if (!canReset(actor)) {
    ui.notifications.warn("Você não tem permissão para resetar esta ficha.");
    return { success: false, cancelled: false };
  }

  console.warn(`[NA-RESET] REQUESTED actor=${actor.name} kind=${kind}`);

  // DialogV2 confirmação
  const confirmed = await DialogV2.wait({
    window: {
      title: "Resetar ficha?",
      classes: ["na-reset-dialog"],
      contentClass: "na-reset-content",
    },
    content: `
      <div class="na-reset-dialog-content">
        <p>Isso restaurará PDV/recursos e removerá estados temporários de combate.</p>
        <p><strong>Nível, atributos permanentes, progressão, Origem, Especialização/Respiração e inventário serão preservados.</strong></p>
      </div>
    `,
    buttons: [
      {
        action: "cancel",
        label: "CANCELAR",
        class: "na-reset-cancel",
      },
      {
        action: "confirm",
        label: "RESETAR",
        class: "na-reset-confirm",
      },
    ],
    close: () => ({ action: "cancel" }),
  });

  if (!confirmed || confirmed.action !== "confirm") {
    console.warn(`[NA-RESET] CANCELLED actor=${actor.name}`);
    return { success: false, cancelled: true };
  }

  console.warn(`[NA-RESET] CONFIRMED actor=${actor.name}`);

  // Executar reset
  try {
    if (kind === "slayer") {
      await resetSlayerSheetState(actor);
    } else {
      await resetOniSheetState(actor);
    }

    ui.notifications.info(`Ficha de ${actor.name} resetada.`);

    // Re-render se necessário
    if (actor.sheet?.rendered) {
      actor.sheet.render();
    }

    return { success: true };
  } catch (error) {
    console.error(`[NA-RESET] FAILED actor=${actor.name}:`, error);
    ui.notifications.error(`Falha ao resetar ${actor.name}: ${error.message}`);
    return { success: false };
  }
}
