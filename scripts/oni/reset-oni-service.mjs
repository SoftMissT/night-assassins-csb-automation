/**
 * @fileoverview Serviço de reset de estado temporário da ficha Oni.
 * Preserva: nível, origem, especialização, atributos, pdv_oni_ganho_nvl2..12,
 *           progressão, kekkijutsu, itens.
 * Reseta: dano, cura, extra, gasto PDK, PDV/PDK atual → máximo.
 */

import { parseNumber } from "../parsing.mjs";

/**
 * Chaves de estado TEMPORÁRIO do Oni (resetadas no reset).
 * Valor: default a ser aplicado.
 */
const ONI_TEMP_KEYS = Object.freeze({
  pdv_oni_dano_tomado: 0,
  pdv_oni_curado: 0,
  pdv_oni_extra: 0,
  pdk_oni_gasto_valor: 0,
  pdk_oni_curado: 0,
});

/**
 * Chaves de progressão Oni que NUNCA devem ser limpas.
 */
const ONI_PERMANENT_KEYS = Object.freeze([
  "nvl_oni",
  "nvl_pj",
  "origem_oni_pdv_val",
  "origem_oni_pdk_val",
  "fdv_oni_nvl1",
  "pdv_oni_ganho_nvl2",
  "pdv_oni_ganho_nvl3",
  "pdv_oni_ganho_nvl4",
  "pdv_oni_ganho_nvl5",
  "pdv_oni_ganho_nvl6",
  "pdv_oni_ganho_nvl7",
  "pdv_oni_ganho_nvl8",
  "pdv_oni_ganho_nvl9",
  "pdv_oni_ganho_nvl10",
  "pdv_oni_ganho_nvl11",
  "pdv_oni_ganho_nvl12",
]);

/**
 * Verifica se um actor é um Oni válido para reset.
 * @param {Actor} actor
 * @returns {boolean}
 */
export function isOniForReset(actor) {
  const props = actor?.system?.props;
  if (!props) return false;
  return (
    props.nvl_oni !== undefined ||
    props.pdv_oni_ganho_nvl2 !== undefined ||
    props.pdv_oni_total_conta !== undefined
  );
}

/**
 * Calcula o patch de reset para um Oni.
 * @param {Actor} actor
 * @returns {{ patch: object, summary: string[] }}
 */
export function buildOniResetPatch(actor) {
  const props = actor.system?.props ?? {};
  const patch = {};
  const summary = [];

  // Reset chaves temporárias
  for (const [key, defaultValue] of Object.entries(ONI_TEMP_KEYS)) {
    patch[`system.props.${key}`] = defaultValue;
    summary.push(`${key} → ${defaultValue}`);
  }

  // PDV atual → PDV máximo (via switchCase no CSB, mas podemos setar display)
  const pdvMax = parseNumber(props.pdv_oni_maximo_num) || parseNumber(props.pdv_oni_total_conta);
  if (pdvMax > 0) {
    patch["system.props.pdv_oni_atual_valor_display"] = pdvMax;
    summary.push(`pdv_oni_atual_valor_display → ${pdvMax} (máximo)`);
  }

  // PDK atual → PDK máximo
  const pdkMax = parseNumber(props.pdk_oni_maximo_num) || parseNumber(props.pdk_oni_total_conta);
  if (pdkMax > 0) {
    patch["system.props.pdk_oni_atual_valor_display"] = pdkMax;
    summary.push(`pdk_oni_atual_valor_display → ${pdkMax} (máximo)`);
  }

  return { patch, summary };
}

/**
 * Executa o reset de estado temporário de um Oni.
 * Gera UM único actor.update().
 * @param {Actor} actor
 * @returns {Promise<{ success: boolean, patch: object }>}
 */
export async function resetOniSheetState(actor) {
  if (!isOniForReset(actor)) {
    throw new Error(`Actor ${actor.name} não é um Oni válido para reset.`);
  }

  const { patch, summary } = buildOniResetPatch(actor);

  console.warn(`[NA-RESET] ONI RESET actor=${actor.name} keys=${summary.length}`);

  await actor.update(patch, { naCsbAutomation: true, naReset: true });

  console.warn(`[NA-RESET] ONI COMPLETE actor=${actor.name}`);

  return { success: true, patch };
}
