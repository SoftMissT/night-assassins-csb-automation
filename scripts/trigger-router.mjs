/**
 * @fileoverview Router de triggers do updateActor.
 */

import { ATTRIBUTES, PROP_KEYS } from "./constants.mjs";
import { changedProp, parseLevel, isDestinyMark, parseNumber } from "./parsing.mjs";
import { createLevelOneValues, processLevelGain } from "./level-service.mjs";
import { applyInitialMark, upgradeMarkAtLevelSix } from "./ability-service.mjs";
import { mbPermanentPdvPatch, mbShouldApplyPermanentPdv } from "./slayer/class-runtime.mjs";

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

  const changedLevel = changedProp(changes, PROP_KEYS.level);
  const changedAbility = changedProp(changes, PROP_KEYS.ability);
  const changedClass = changedProp(changes, "classe_escolhida");

  const level = changedLevel !== undefined ? parseLevel(changedLevel) : null;
  const ability = changedAbility !== undefined ? String(changedAbility ?? "").trim() : null;
  const classKey = changedClass !== undefined ? String(changedClass ?? "").trim() : null;

  if (level === null && ability === null && classKey === null) return;

  await withActorLock(actor.uuid, async () => {
    const props = actor.system?.props ?? {};
    const effectiveProps = {
      ...props,
      nvl_num: level ?? parseLevel(props.nvl_pj),
      classe_escolhida: classKey ?? props.classe_escolhida,
    };

    // Mestre de Batalha — Corpo de Guerra: +2d6 PDV uma única vez no nível 11.
    if (mbShouldApplyPermanentPdv(effectiveProps)) {
      const roll = await Roll.create("2d6").evaluate();
      await roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor }),
        flavor: `<strong>Mestre de Batalha — Corpo de Guerra</strong><br>Ganho permanente de PDV no nível 11.`,
      });
      await actor.update(
        mbPermanentPdvPatch(roll.total, props.pdv_slayer_extra),
        { naCsbAutomation: true, naSlayerClass: true },
      );
      return;
    }

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
