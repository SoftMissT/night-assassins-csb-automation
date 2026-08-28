/**
 * @fileoverview Persistência atômica em actor.system.props.
 */

import { ATTRIBUTES, snapshotKey, configKey } from './constants.mjs';

/**
 * Constrói um patch de snapshot para um nível específico.
 * @param {number} level
 * @param {Record<string, number>} values
 * @param {"slayer"|"oni"} [kind="slayer"]
 * @returns {Record<string, number>}
 */
export function buildSnapshotPatch(level, values, kind = 'slayer') {
    const entries = [];
    for (const { key } of ATTRIBUTES) {
        entries.push([`system.props.${snapshotKey(kind, key, level)}`, values[key]]);
        entries.push([`system.props.${configKey(kind, key)}`, values[key]]);
    }
    return Object.fromEntries(entries);
}

/**
 * Constrói um patch de configuração a partir de valores-base.
 * @param {Record<string, number>} values
 * @param {"slayer"|"oni"} [kind="slayer"]
 * @returns {Record<string, number>}
 */
export function buildConfigPatch(values, kind = 'slayer') {
    const entries = [];
    for (const { key } of ATTRIBUTES) {
        entries.push([`system.props.${configKey(kind, key)}`, values[key]]);
    }
    return Object.fromEntries(entries);
}

/**
 * Atualiza o Actor de forma atômica, marcando para evitar recursão.
 * @param {Actor} actor
 * @param {object} patch
 * @returns {Promise<void>}
 */
export async function atomicActorUpdate(actor, patch) {
    if (!actor || typeof actor.update !== 'function') {
        throw new Error('Actor inválido para atualização atômica.');
    }
    await actor.update(patch, { naCsbAutomation: true });
}
