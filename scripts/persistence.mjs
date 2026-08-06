/**
 * @fileoverview Persistência atômica em actor.system.props.
 */

import { ATTRIBUTES } from "./constants.mjs";

/**
 * Constrói um patch de snapshot para um nível específico.
 * @param {number} level
 * @param {Record<string, number>} values
 * @returns {Record<string, number>}
 */
export function buildSnapshotPatch(level, values) {
  const entries = [];
  for (const { key } of ATTRIBUTES) {
    entries.push([`system.props.${key}_nvl${level}`, values[key]]);
    entries.push([`system.props.atr_${key}_valor_config`, values[key]]);
  }
  return Object.fromEntries(entries);
}

/**
 * Constrói um patch de configuração a partir de valores-base.
 * @param {Record<string, number>} values
 * @returns {Record<string, number>}
 */
export function buildConfigPatch(values) {
  const entries = [];
  for (const { key } of ATTRIBUTES) {
    entries.push([`system.props.atr_${key}_valor_config`, values[key]]);
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
  if (!actor || typeof actor.update !== "function") {
    throw new Error("Actor inválido para atualização atômica.");
  }
  await actor.update(patch, { naCsbAutomation: true });
}
