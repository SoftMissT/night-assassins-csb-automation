/**
 * @fileoverview Serviço de reset de estado temporário da ficha Oni.
 * Preserva: nível, origem, especialização, atributos, pdv_oni_ganho_nvl2..12,
 *           progressão, kekkijutsu, itens.
 * Reseta: dano, cura, extra, gasto PDK, PDV/PDK atual → máximo.
 */

import { defaultOniActionState, oniActionMaximums } from "../oni-action-service.mjs";

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
  pdk_oni_extra: 0,
  bonus_atr_vit_oni_valor_temp: 0,
  bonus_atr_dex_oni_valor_temp: 0,
  bonus_atr_for_oni_valor_temp: 0,
  bonus_atr_car_oni_valor_temp: 0,
  bonus_atr_fdv_oni_valor_temp: 0,
  bonus_atr_int_oni_valor_temp: 0,
  bonus_atr_sab_oni_valor_temp: 0,
});

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
    if (!Object.hasOwn(props, key)) continue;
    patch[`system.props.${key}`] = defaultValue;
    summary.push(`${key} → ${defaultValue}`);
  }

  if (Object.hasOwn(props, "acoes_oni_dados")) {
    const actionState = defaultOniActionState();
    patch["system.props.acoes_oni_dados"] = JSON.stringify(actionState);
    if (Object.hasOwn(props, "acoes_oni_resumo")) {
      const maximums = oniActionMaximums(props);
      patch["system.props.acoes_oni_resumo"] = Object.entries({
        ...actionState.turn,
        ...actionState.round,
      }).map(([key]) => `${key.toUpperCase()} ${maximums[key]}/${maximums[key]}`).join(" · ");
    }
    summary.push("economia de ações Oni → estado inicial");
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
