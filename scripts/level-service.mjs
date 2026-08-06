/**
 * @fileoverview Serviço de progressão de níveis (1, 3, 7).
 */

import { STANDARD_POOL } from "./constants.mjs";
import { latestValues, currentConfigValues } from "./parsing.mjs";
import { buildSnapshotPatch, atomicActorUpdate } from "./persistence.mjs";
import {
  chooseCreationMethod,
  rollPool,
  chooseRolledPool,
  readDiscordPool,
  distributePool,
  applyAttributeGain,
  confirmSnapshot,
} from "./dialogs/attribute-dialogs.mjs";

/**
 * Fluxo completo de criação de atributos no nível 1.
 * @param {Actor} actor
 * @returns {Promise<boolean>}
 */
export async function createLevelOneValues(actor) {
  const props = actor.system?.props ?? {};
  const currentValues = currentConfigValues(props);

  const method = await chooseCreationMethod();
  if (!method) return false;

  const pool =
    method === "standard"
      ? [...STANDARD_POOL]
      : method === "roll"
        ? await chooseRolledPool(actor, await rollPool(actor, 1))
        : await readDiscordPool();

  if (!pool) return false;
  const values = await distributePool(pool, 1, currentValues);
  if (!values || !(await confirmSnapshot(values, currentValues, 1))) return false;

  const patch = buildSnapshotPatch(1, values);
  await atomicActorUpdate(actor, patch);
  ui.notifications?.info?.(`Os sete atributos do nível 1 foram salvos para ${actor.name}.`);
  return true;
}

/**
 * Fluxo de ganho de +1 no nível 3 ou 7.
 * @param {Actor} actor
 * @param {number} level
 * @returns {Promise<boolean>}
 */
export async function processLevelGain(actor, level) {
  const props = actor.system?.props ?? {};
  const currentValues = currentConfigValues(props);
  const baseValues = latestValues(props, level);
  const gained = await applyAttributeGain(baseValues, level);
  if (!gained || !(await confirmSnapshot(gained, currentValues, level))) return false;

  const patch = buildSnapshotPatch(level, gained);
  await atomicActorUpdate(actor, patch);
  ui.notifications?.info?.(`Atributos do nível ${level} salvos para ${actor.name}.`);
  return true;
}
