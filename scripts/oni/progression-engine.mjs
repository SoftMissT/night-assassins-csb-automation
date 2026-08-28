/**
 * @fileoverview Engine dedicada de progressão de PDV do Oni.
 * Registra hooks ANTES do ready para garantir que ningún update
 * fique sem processar. Independente de enableSheetAutomation.
 */

import { actorKind } from "../actor-kind.mjs";
import { changedProp, parseLevel } from "../parsing.mjs";
import { ensureOniProgression } from "./progression-service.mjs";

/** Lock por actor.uuid para evitar concorrência. */
const locks = new Map();

async function withLock(uuid, task) {
  const existing = locks.get(uuid);
  const next = (async () => {
    if (existing) await existing;
    await task();
  })();
  locks.set(uuid, next);
  try {
    await next;
  } finally {
    if (locks.get(uuid) === next) locks.delete(uuid);
  }
}

/**
 * Handler para updateActor / updateDocument.
 * Detecta mudança de nvl_pj em Ators Oni e dispara progressão.
 */
async function oniUpdateHandler(actor, changes, options, userId) {
  if (options?.naCsbAutomation === true) return;
  if (userId !== game?.user?.id) return;
  if (!actor?.isOwner) return;
  if (actorKind(actor) !== "oni") return;

  const rawLevel = changedProp(changes, "nvl_pj");
  if (rawLevel === undefined) return;

  const level = parseLevel(rawLevel);
  console.log(`[NA-Oni] level change: ${actor.name} → N${level}`);

  await withLock(actor.uuid, async () => {
    try {
      await ensureOniProgression(actor, { level, showDice: true });
      console.log(`[NA-Oni] progression persisted for ${actor.name}`);
    } catch (error) {
      console.error(`[NA-Oni] progression failed for ${actor.name}:`, error);
    }
  });
}

/**
 * Handler para createActor.
 * Quando um Oni é criado, reconcilia ganhos de PDV faltantes.
 */
async function oniCreateHandler(actor) {
  if (actorKind(actor) !== "oni") return;

  await withLock(actor.uuid, async () => {
    try {
      console.log(`[NA-Oni] createActor: ${actor.name}`);
      await ensureOniProgression(actor, { showDice: true });
      console.log(`[NA-Oni] progression persisted for ${actor.name}`);
    } catch (error) {
      console.error(`[NA-Oni] progression failed for ${actor.name}:`, error);
    }
  });
}

/**
 * Catch-up no ready: GM autoritativo reconcilia Onis existentes.
 */
export async function oniReadyCatchUp() {
  if (game.system.id !== "custom-system-builder") return;

  const gmId = game.users
    ?.filter((u) => u.active && u.isGM)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))[0]?.id;

  if (game.user?.id !== gmId) return;

      console.log(`[NA-Oni] ready catch-up: starting for ${game.actors?.contents?.length ?? 0} actors`);

  for (const actor of game.actors?.contents ?? []) {
    if (actorKind(actor) !== "oni") continue;
    try {
      await ensureOniProgression(actor, { showDice: false });
    } catch (error) {
      console.warn(`[NA-Oni] Falha no catch-up de ${actor.name}:`, error);
    }
  }

  console.log(`[NA-Oni] ready catch-up: complete`);
}

/**
 * Registra a engine de progressão Oni.
 * DEVE ser chamada no init (antes do ready) para garantir que
 * os hooks de update/create estejam disponíveis desde o início.
 */
export function registerOniProgressionEngine() {
  Hooks.on("updateActor", oniUpdateHandler);
  Hooks.on("createActor", oniCreateHandler);
  Hooks.once("ready", oniReadyCatchUp);

  console.log(`[NA-Oni] progression engine registered`);
}
