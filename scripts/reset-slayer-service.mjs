/**
 * @fileoverview Serviço de reset de estado temporário da ficha Slayer.
 * Preserva: nível, origem, respiração, atributos, progressão, itens, ferida.
 * Reseta: dano, cura, extra, gasto PDR, fôlego, flags temporárias.
 */

import { parseNumber } from "./parsing.mjs";

/**
 * Chaves de estado TEMPORÁRIO do Slayer (resetadas no reset).
 * Valor: default a ser aplicado.
 */
const SLAYER_TEMP_KEYS = Object.freeze({
  pdv_slayer_dano_tomado: 0,
  pdv_slayer_curado: 0,
  pdv_slayer_extra: 0,
  pdr_slayer_gasto_valor: 0,
  pdr_slayer_curado: 0,
});

/**
 * Verifica se um actor é um Slayer válido para reset.
 * @param {Actor} actor
 * @returns {boolean}
 */
export function isSlayerForReset(actor) {
  const props = actor?.system?.props;
  if (!props) return false;
  return (
    props.nome_slayer !== undefined ||
    props.pdv_slayer_total_valor !== undefined ||
    props.pdv_slayer_total_conta !== undefined
  );
}

/**
 * Calcula o patch de reset para um Slayer.
 * @param {Actor} actor
 * @returns {{ patch: object, summary: string[] }}
 */
export function buildSlayerResetPatch(actor) {
  const props = actor.system?.props ?? {};
  const patch = {};
  const summary = [];

  // Reset chaves temporárias
  for (const [key, defaultValue] of Object.entries(SLAYER_TEMP_KEYS)) {
    patch[`system.props.${key}`] = defaultValue;
    summary.push(`${key} → ${defaultValue}`);
  }

  // Restaurar fôlego ao máximo
  const folegoMax = Math.max(
    0,
    parseNumber(props.folego_slayer_maximo) || (2 + parseNumber(props.fdv_display))
  );
  patch["system.props.folego_slayer_atual"] = folegoMax;
  summary.push(`folego_slayer_atual → ${folegoMax} (máximo)`);

  return { patch, summary };
}

/**
 * Executa o reset de estado temporário de um Slayer.
 * Gera UM único actor.update().
 * @param {Actor} actor
 * @returns {Promise<{ success: boolean, patch: object }>}
 */
export async function resetSlayerSheetState(actor) {
  if (!isSlayerForReset(actor)) {
    throw new Error(`Actor ${actor.name} não é um Slayer válido para reset.`);
  }

  const { patch, summary } = buildSlayerResetPatch(actor);

  console.warn(`[NA-RESET] SLAYER RESET actor=${actor.name} keys=${summary.length}`);

  await actor.update(patch, { naCsbAutomation: true, naReset: true });

  console.warn(`[NA-RESET] SLAYER COMPLETE actor=${actor.name}`);

  return { success: true, patch };
}
