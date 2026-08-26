/**
 * @fileoverview Router de triggers do updateActor.
 */

import { ATTRIBUTES, ONI_SNAPSHOT_LEVELS, PROP_KEYS } from "./constants.mjs";
import { changedProp, parseLevel, isDestinyMark, parseNumber } from "./parsing.mjs";
import { createLevelOneValues, processLevelGain, processOniLevelGain } from "./level-service.mjs";
import { applyInitialMark, upgradeMarkAtLevelSix } from "./ability-service.mjs";
import { actorKind } from "./actor-kind.mjs";
import { ensureOniProgression } from "./oni/progression-service.mjs";

/** @type {Map<string, Promise<void>>} */
const actorLocks = new Map();

/**
 * Adquire lock serializado por actor.uuid.
 * @param {string} uuid
 * @param {() => Promise<void>} task
 */
async function withActorLock(uuid, task) {
  const existing = actorLocks.get(uuid);
  const next = (async () => {
    if (existing) await existing;
    await task();
  })();
  actorLocks.set(uuid, next);
  try {
    await next;
  } finally {
    if (actorLocks.get(uuid) === next) {
      actorLocks.delete(uuid);
    }
  }
}

/**
 * Verifica se um snapshot de nível está completo.
 * @param {object} props
 * @param {number} level
 * @returns {boolean}
 */
function isSnapshotComplete(props, level) {
  return ATTRIBUTES.every((a) => {
    const v = props[`${a.key}_nvl${level}`];
    return v !== undefined && v !== null && v !== "";
  });
}

/**
 * Manipula updateActor do Foundry.
 * @param {Actor} actor
 * @param {object} changes
 * @param {object} options
 * @param {string} userId
 */
export async function handleActorUpdate(actor, changes, options, userId) {
  if (options?.naCsbAutomation === true) return;
  if (userId !== game?.user?.id) return;
  if (!actor?.isOwner) return;

  // Domínio Oni: sem Marca Slayer. Ledger de PDV (2–12) + snapshot de atributo.
  if (actorKind(actor) === "oni") {
    const rawOniLevel = changedProp(changes, PROP_KEYS.level);
    if (rawOniLevel === undefined) return;
    const oniLevel = parseLevel(rawOniLevel);
    await withActorLock(actor.uuid, async () => {
      await ensureOniProgression(actor, { level: oniLevel });
      const props = actor.system?.props ?? {};
      if (!ONI_SNAPSHOT_LEVELS.includes(oniLevel) || isSnapshotComplete(props, oniLevel)) return;
      if (oniLevel === 1) await createLevelOneValues(actor);
      else await processOniLevelGain(actor, oniLevel);
    });
    return;
  }

  const changedLevel = changedProp(changes, PROP_KEYS.level);
  const changedAbility = changedProp(changes, PROP_KEYS.ability);

  const level = changedLevel !== undefined ? parseLevel(changedLevel) : null;
  const ability = changedAbility !== undefined ? String(changedAbility ?? "").trim() : null;

  if (level === null && ability === null) return;

  await withActorLock(actor.uuid, async () => {
    const props = actor.system?.props ?? {};

    // Nível 1
    if (level === 1 && !isSnapshotComplete(props, 1)) {
      await createLevelOneValues(actor);
      return;
    }

    // Nível 3
    if (level === 3 && !isSnapshotComplete(props, 3)) {
      await processLevelGain(actor, 3);
      return;
    }

    // Nível 6 — evolução da Marca
    if (level === 6) {
      const abilityKey = normalizeAbility(props.hab_escolhida);
      const isMark = isDestinyMark(abilityKey ?? props.hab_escolhida);
      const markBonus = parseNumber(props.hab_marca_destino_bonus);
      if (isMark && markBonus === 2 && !isSnapshotComplete(props, 6)) {
        await upgradeMarkAtLevelSix(actor);
        return;
      }
      // Nível 6 sem Marca: nenhum ganho genérico
    }

    // Nível 7
    if (level === 7 && !isSnapshotComplete(props, 7)) {
      await processLevelGain(actor, 7);
      return;
    }

    // Marca do Destino — escolha inicial
    if (ability !== null && isDestinyMark(ability)) {
      const markBonus = parseNumber(props.hab_marca_destino_bonus);
      if (markBonus < 2) {
        await applyInitialMark(actor);
      }
    }
  });
}

function normalizeAbility(raw) {
  const s = String(raw ?? "").trim();
  if (s.startsWith("hab_escolhida_")) return s;
  return null;
}
