/**
 * @fileoverview Serviço de Habilidades Especiais (Marca do Destino).
 */

import { ATTRIBUTES } from "./constants.mjs";
import { parseNumber, latestValues, isDestinyMark } from "./parsing.mjs";
import { buildSnapshotPatch, buildConfigPatch, atomicActorUpdate } from "./persistence.mjs";
import { chooseMarkedAttribute } from "./dialogs/attribute-dialogs.mjs";

/**
 * Aplica a Marca do Destino inicial (+2) quando a habilidade é escolhida.
 * @param {Actor} actor
 * @returns {Promise<boolean>}
 */
export async function applyInitialMark(actor) {
  const props = actor.system?.props ?? {};
  if (parseNumber(props.hab_marca_destino_bonus) >= 2) return false;

  // Verifica se nível 1 está configurado
  const hasLevel1 = ATTRIBUTES.some((a) => {
    const v = props[`${a.key}_nvl1`];
    return v !== undefined && v !== null && v !== "";
  });
  if (!hasLevel1) {
    ui.notifications?.warn?.("Atributos do nível 1 precisam ser concluídos antes de aplicar a Marca do Destino.");
    return false;
  }

  const values = latestValues(props, 2);
  const chosen = await chooseMarkedAttribute(values, 2);
  if (!chosen) return false;

  const newValue = values[chosen] + 2;
  const patch = {
    [`system.props.${chosen}_nvl1`]: newValue,
    [`system.props.atr_${chosen}_valor_config`]: newValue,
    "system.props.hab_marca_destino_atributo": chosen,
    "system.props.hab_marca_destino_bonus": 2,
  };
  await atomicActorUpdate(actor, patch);
  ui.notifications?.info?.(`Marca do Destino aplicada: +2 em ${chosen.toUpperCase()}.`);
  return true;
}

/**
 * Evolui a Marca do Destino no nível 6 (+1 adicional, total +3).
 * @param {Actor} actor
 * @returns {Promise<boolean>}
 */
export async function upgradeMarkAtLevelSix(actor) {
  const props = actor.system?.props ?? {};
  if (!isDestinyMark(props.hab_escolhida) || parseNumber(props.hab_marca_destino_bonus) >= 3) return false;

  const values = latestValues(props, 6);
  let chosen = String(props.hab_marca_destino_atributo ?? "");
  if (!ATTRIBUTES.some((a) => a.key === chosen)) {
    chosen = await chooseMarkedAttribute(values, 1);
  }
  if (!chosen) return false;

  values[chosen] += 1;
  const patch = buildSnapshotPatch(6, values);
  patch["system.props.hab_marca_destino_atributo"] = chosen;
  patch["system.props.hab_marca_destino_bonus"] = 3;
  await atomicActorUpdate(actor, patch);
  ui.notifications?.info?.(`Marca do Destino evoluiu para +3 em ${chosen.toUpperCase()}.`);
  return true;
}
