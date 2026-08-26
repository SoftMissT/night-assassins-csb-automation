/**
 * @fileoverview Serviço de progressão de níveis (1, 3, 7).
 */

import {
  ATTRIBUTE_GAIN_LEVELS,
  ONI_CORPO_DEMONIACO_LEVEL,
  ONI_FDV_FIXED_LEVEL,
  ONI_PLUS_ONE_LEVELS,
  ONI_PLUS_TWO_LEVEL,
  ONI_SNAPSHOT_LEVELS,
  SNAPSHOT_LEVELS,
  STANDARD_POOL,
} from "./constants.mjs";
import { actorKind } from "./actor-kind.mjs";
import { latestValues, currentConfigValues, parseLevel } from "./parsing.mjs";
import { buildSnapshotPatch, atomicActorUpdate } from "./persistence.mjs";
import {
  chooseCreationMethod,
  rollPool,
  chooseRolledPool,
  readDiscordPool,
  distributePool,
  applyAttributeGain,
  applyAttributeGainTwo,
  applyCorpoDemoniaco,
  confirmSnapshot,
} from "./dialogs/attribute-dialogs.mjs";

/**
 * Fluxo completo de criação de atributos no nível 1.
 * @param {Actor} actor
 * @returns {Promise<boolean>}
 */
export async function createLevelOneValues(actor) {
  const kind = actorKind(actor);
  const props = actor.system?.props ?? {};
  const currentValues = currentConfigValues(props, kind);

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

  const patch = buildSnapshotPatch(1, values, kind);
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
  const currentValues = currentConfigValues(props, "slayer");
  const baseValues = latestValues(props, level, "slayer");
  const gained = await applyAttributeGain(baseValues, level);
  if (!gained || !(await confirmSnapshot(gained, currentValues, level))) return false;

  const patch = buildSnapshotPatch(level, gained, "slayer");
  await atomicActorUpdate(actor, patch);
  ui.notifications?.info?.(`Atributos do nível ${level} salvos para ${actor.name}.`);
  return true;
}

/**
 * Fluxo de ganho de atributo Oni nos níveis 3, 4, 6, 8, 11, 12, 13 e 16.
 * @param {Actor} actor
 * @param {number} level
 * @returns {Promise<boolean>}
 */
export async function processOniLevelGain(actor, level) {
  const props = actor.system?.props ?? {};
  const currentValues = currentConfigValues(props, "oni");
  const baseValues = latestValues(props, level, "oni");
  let gained = null;
  if (ONI_PLUS_ONE_LEVELS.includes(level)) gained = await applyAttributeGain(baseValues, level);
  else if (level === ONI_PLUS_TWO_LEVEL) gained = await applyAttributeGainTwo(baseValues, level);
  else if (level === ONI_CORPO_DEMONIACO_LEVEL) gained = await applyCorpoDemoniaco(baseValues);
  else if (level === ONI_FDV_FIXED_LEVEL) gained = { ...baseValues, fdv: baseValues.fdv + 2 };
  else return false;
  if (!gained || !(await confirmSnapshot(gained, currentValues, level))) return false;

  const patch = buildSnapshotPatch(level, gained, "oni");
  await atomicActorUpdate(actor, patch);
  ui.notifications?.info?.(`Atributos Oni do nível ${level} salvos para ${actor.name}.`);
  return true;
}

/**
 * Snapshot manual (macro CSB `%{}%`) — roteia Slayer vs Oni.
 * @param {Actor} actor
 * @param {unknown} level
 * @returns {Promise<boolean>}
 */
export async function runAttributeSnapshot(actor, level) {
  const normalized = parseLevel(level);
  const kind = actorKind(actor);
  const levels = kind === "oni" ? ONI_SNAPSHOT_LEVELS : SNAPSHOT_LEVELS;
  if (!levels.includes(normalized)) {
    const message = kind === "oni"
      ? `O nível ${normalized} não concede snapshot de atributo Oni.`
      : normalized > 7
        ? "Os atributos-base permanecem no snapshot do nível 7. Bônus posteriores são derivados ou temporários."
        : `O nível ${normalized} não concede aumento fixo de atributo.`;
    ui.notifications?.info?.(message);
    return false;
  }
  if (normalized === 1) return createLevelOneValues(actor);
  if (kind === "oni") return processOniLevelGain(actor, normalized);
  if (!ATTRIBUTE_GAIN_LEVELS.includes(normalized)) return false;
  return processLevelGain(actor, normalized);
}
