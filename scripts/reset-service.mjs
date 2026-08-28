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
  const user = globalThis.game?.user;
  if (!user) return false;
  if (user.isGM) return true;
  if (typeof actor.testUserPermission === "function") {
    return actor.testUserPermission(user, "OWNER");
  }
  const ownerLevel = globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? 3;
  const ownership = actor.ownership?.[user.id] ?? actor.permission ?? 0;
  return ownership >= ownerLevel;
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
    globalThis.ui?.notifications?.warn?.(`${actor.name} não é um Slayer ou Oni válido para reset.`);
    return { success: false, cancelled: false };
  }

  if (!canReset(actor)) {
    globalThis.ui?.notifications?.warn?.("Você não tem permissão para resetar esta ficha.");
    return { success: false, cancelled: false };
  }

  console.warn(`[NA-RESET] REQUESTED actor=${actor.name} kind=${kind}`);

  // DialogV2 confirmação
  const DialogV2 = globalThis.foundry?.applications?.api?.DialogV2 ?? globalThis.DialogV2;
  if (!DialogV2?.wait) throw new Error("DialogV2 indisponível no Foundry v14.");
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
        callback: () => false,
      },
      {
        action: "confirm",
        label: "RESETAR",
        class: "na-reset-confirm",
        callback: () => true,
      },
    ],
    rejectClose: false,
  });

  if (confirmed !== true) {
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

    globalThis.ui?.notifications?.info?.(`Ficha de ${actor.name} resetada.`);

    // Re-render se necessário
    if (actor.sheet?.rendered) {
      actor.sheet.render();
    }

    return { success: true };
  } catch (error) {
    console.error(`[NA-RESET] FAILED actor=${actor.name}:`, error);
    globalThis.ui?.notifications?.error?.(`Falha ao resetar ${actor.name}: ${error.message}`);
    return { success: false };
  }
}
