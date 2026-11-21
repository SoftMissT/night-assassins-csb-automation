/**
 * @fileoverview Router de triggers do updateActor.
 */

import { ATTRIBUTES, ONI_SNAPSHOT_LEVELS, PROP_KEYS } from './constants.mjs';
import { changedProp, parseLevel, isDestinyMark, parseNumber } from './parsing.mjs';
import { createLevelOneValues, processLevelGain, processOniLevelGain } from './level-service.mjs';
import { applyInitialMark, upgradeMarkAtLevelSix } from './ability-service.mjs';
import { actorKind } from './actor-kind.mjs';
import { applyMasterBattleLevelEleven } from './slayer/class-runtime.mjs';
import { selectedSlayerClassKey } from './slayer/class-contracts.mjs';
import { effectiveRulesAbility } from './rules-profile.mjs';
import { chooseHashiraEliteBonus } from './dialogs/attribute-dialogs.mjs';

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
        // Number Fields do CSB nascem com defaultValue "0". Zero significa
        // que o snapshot ainda não foi distribuído, não que está concluído.
        return parseNumber(v) > 0;
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
    if (options?.naCsbAutomation === true && options?.naRulesProfile !== true) return;
    if (userId !== game?.user?.id) return;
    if (!actor?.isOwner) return;

    const kind = actorKind(actor);
    if (kind === 'npc') {
        const abilityChanged = changedProp(changes, PROP_KEYS.ability) !== undefined;
        const levelChanged = changedProp(changes, 'npc_nivel') !== undefined;
        if (!abilityChanged && !levelChanged) return;
        await withActorLock(actor.uuid, async () => {
            const props = actor.system?.props ?? {};
            if (!isDestinyMark(effectiveRulesAbility(props))) return;
            if (parseNumber(props.hab_marca_destino_bonus) < 2) await applyInitialMark(actor);
            if (parseNumber(actor.system?.props?.npc_nivel) >= 6 &&
                parseNumber(actor.system?.props?.hab_marca_destino_bonus) === 2)
                await upgradeMarkAtLevelSix(actor);
        });
        return;
    }

    // Domínio Oni: snapshot de atributo. PDV gains são handled por progression-engine.mjs.
    if (kind === 'oni') {
        const rawOniLevel = changedProp(changes, PROP_KEYS.level);
        if (rawOniLevel === undefined) return;
        const oniLevel = parseLevel(rawOniLevel);
        await withActorLock(actor.uuid, async () => {
            const props = actor.system?.props ?? {};
            if (!ONI_SNAPSHOT_LEVELS.includes(oniLevel) || isSnapshotComplete(props, oniLevel))
                return;
            if (oniLevel === 1) await createLevelOneValues(actor);
            else await processOniLevelGain(actor, oniLevel);
        });
        return;
    }

    const changedLevel = changedProp(changes, PROP_KEYS.level);
    const changedAbility = changedProp(changes, PROP_KEYS.ability);
    const changedClass = ['classe_escolhida', 'na_vanilla_class']
        .some(key => changedProp(changes, key) !== undefined);

    const level = changedLevel !== undefined ? parseLevel(changedLevel) : null;
    const ability = changedAbility !== undefined ? String(changedAbility ?? '').trim() : null;

    if (level === null && ability === null && !changedClass) return;

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

        // Nível 6 evolução da Marca
        if (level === 6) {
            const selectedAbility = effectiveRulesAbility(props);
            const abilityKey = normalizeAbility(selectedAbility);
            const isMark = isDestinyMark(abilityKey ?? selectedAbility);
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

        // Nível 11 — Mestre de Batalha: Corpo de Guerra, ganho único de 2d6 PDV máximo.
        if (kind === 'slayer' && (level >= 11 || changedClass) && selectedSlayerClassKey(props) === 'classe_mb') {
            await applyMasterBattleLevelEleven(actor, level);
        }
        // Nível 14 — Hashira de Elite.
        if (level === 14) {
            const currentChoice = String(props.nvl_14_bonus_choice ?? '').trim();

            if (currentChoice === 'pdv_vit3' || currentChoice === 'pdr_fdv2') {
                return;
            }

            const choice = await chooseHashiraEliteBonus(props);

            await actor.update(
                {
                    'system.props.nvl_14_bonus_choice': choice,
                },
                {
                    naCsbAutomation: true,
                    naHashiraEliteLevelFourteen: true,
                }
            );

            return;
        }
        // Marca do Destino escolha inicial
        if (ability !== null && isDestinyMark(effectiveRulesAbility(props))) {
            const markBonus = parseNumber(props.hab_marca_destino_bonus);
            if (markBonus < 2) {
                await applyInitialMark(actor);
            }
        }
    });
}

function normalizeAbility(raw) {
    const s = String(raw ?? '').trim();
    if (s.startsWith('hab_escolhida_')) return s;
    return null;
}
