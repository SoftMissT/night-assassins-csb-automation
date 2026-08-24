/**
 * @fileoverview Repair de Actors Oni legados (P0 — reconstrução da ficha).
 *
 * A ficha Oni foi reestruturada (novas abas, Fôlego/Marca removidos, dropdown
 * de Classe migrado para Especialização). Actors que já existem no mundo do
 * Operador foram criados com o template ANTIGO — este serviço migra os dados
 * deles para o esquema novo, SEM apagar nada e SEM curar/restaurar PDV/PDK
 * para o máximo só porque o template mudou.
 *
 * Idempotente: marca cada Actor migrado com a flag `oniRepairVersion` e pula
 * quem já está na versão atual. GM-only — chamado uma vez por Actor na
 * inicialização do mundo (ver scripts/main.mjs, hook "ready").
 */
import { MODULE_ID } from "../constants.mjs";
import { actorKind } from "../actor-kind.mjs";

export const ONI_REPAIR_VERSION = 2;

const NUMERIC_PROP_PATTERNS = Object.freeze([
  /^atr_(?:vit|dex|for|car|fdv|int|sab)_valor_config$/,
  /^bonus_atr_(?:vit|dex|for|car|fdv|int|sab)_valor_temp$/,
  /^pdv_oni_ganho_nvl\d+$/,
  /^(?:pdv_oni_(?:dano_tomado|dano_ferida|curado|extra)|pdk_oni_(?:gasto_valor|curado|extra))$/,
  /^oni_(?:nivel_na_queda|recurso_slayer_antes_queda)$/,
]);

/** Mapa key antiga (dropdown "Classe") -> key nova (dropdown "Especialização"). */
const LEGACY_CLASS_TO_SPECIALIZATION = Object.freeze({
  classe_oni_escolha: "oni_especializacao_escolha",
  classe_oni_artista_marcial: "oni_especializacao_artista_marcial",
  classe_oni_cacador_noturno: "oni_especializacao_cacador_noturno",
  classe_oni_espadachim_profano: "oni_especializacao_espadachim_profano",
  classe_oni_marionetista: "oni_especializacao_marionetista",
  classe_oni_mestre_da_recuperacao: "oni_especializacao_mestre_recuperacao",
  classe_oni_nobre_de_sangue: "oni_especializacao_nobre_de_sangue",
  classe_oni_soberano_demoniaco: "oni_especializacao_soberano_demonico",
  classe_oni_tecelao_de_sangue: "oni_especializacao_tecelao_de_sangue",
  classe_oni_titan: "oni_especializacao_titan",
  classe_oni_toxico: "oni_especializacao_toxico",
});

function integer(value) {
  const n = primitiveNumber(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/**
 * Converte valores legados de NumberField que o CSB persistiu como wrappers
 * (`{value: 4}` etc.) sem transformar dropdowns e textos em números.
 * @param {unknown} value
 * @returns {number}
 */
export function primitiveNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (value && typeof value === "object") {
    for (const key of ["value", "current", "total", "number"]) {
      if (Object.hasOwn(value, key)) return primitiveNumber(value[key]);
    }
    const primitive = value.valueOf?.();
    if (primitive !== value) return primitiveNumber(primitive);
    return 0;
  }
  const cleaned = String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(",", ".")
    .trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function isNumericOniProp(key) {
  return NUMERIC_PROP_PATTERNS.some((pattern) => pattern.test(key));
}

/**
 * Calcula o patch de migração de um Actor Oni legado sem mutar nada.
 * Função pura — usada tanto pelo runtime (Actor real) quanto pelos testes
 * (fixture simples com `{ system: { props } }`).
 * @param {{system:{props:object}}} actorLike
 * @returns {{needsRepair:boolean, patch:object, preserved:object}}
 */
export function planOniRepair(actorLike) {
  const props = actorLike?.system?.props ?? {};
  const patch = {};
  const preserved = {};

  // 1. Migrar Classe (legado) -> Especialização (nova), sem apagar o dado antigo.
  const legacyClass = props.classe_escolhida;
  const hasNewSpecialization = props.oni_especializacao_id !== undefined && props.oni_especializacao_id !== "" && props.oni_especializacao_id !== "oni_especializacao_escolha";
  if (!hasNewSpecialization && legacyClass !== undefined) {
    const mapped = LEGACY_CLASS_TO_SPECIALIZATION[legacyClass] ?? null;
    if (mapped && mapped !== "oni_especializacao_escolha") {
      patch["system.props.oni_especializacao_id"] = mapped;
      preserved.especializacao = mapped;
    }
  }

  // 2. NumberFields antigos podem ter sido persistidos como Object durante
  // importações/reloads do CSB. `fallback()` não converte tipo: um Object
  // chega ao MathJS e quebra toda a cadeia de atributos, PDV e PDK.
  for (const [key, value] of Object.entries(props)) {
    if (!isNumericOniProp(key) || (typeof value !== "object" && Number.isFinite(Number(value)))) continue;
    patch[`system.props.${key}`] = primitiveNumber(value);
  }

  // 3. PDV/PDK atual: NUNCA restaurar para o máximo. O ledger de dano
  // (pdv_oni_dano_tomado / pdv_oni_curado / pdv_oni_extra e os equivalentes
  // de PDK) permanece com as MESMAS keys no template novo — não é
  // renomeado — então o valor atual computado (pdv_oni_atual_num /
  // pdk_oni_atual_num) já é preservado automaticamente pela própria
  // continuidade das keys. Aqui só registramos o snapshot para auditoria/
  // teste; nenhuma escrita é feita nesses campos.
  const pdvAtual = integer(props.pdv_oni_atual_num);
  const pdkAtual = integer(props.pdk_oni_atual_num);
  if (pdvAtual !== null) preserved.pdvAtual = pdvAtual;
  if (pdkAtual !== null) preserved.pdkAtual = pdkAtual;

  // 4. Progressão: nível, Origem, atributos, ledger de PDV, notas, Items —
  // todos permanecem nas MESMAS keys (nvl_pj, origem_dropdown,
  // atr_*_valor_config, pdv_oni_ganho_nvlN, notas_oni_diario, Items do
  // Actor). Nada a migrar; preservados por construção.
  preserved.nivel = props.nvl_pj ?? null;
  preserved.origem = props.origem_dropdown ?? null;

  return { needsRepair: Object.keys(patch).length > 0, patch, preserved };
}

/**
 * Aplica o repair a um Actor Oni real do Foundry. Idempotente — pula Actors
 * já marcados com a versão atual de repair.
 * @param {Actor} actor
 * @returns {Promise<{repaired:boolean, skipped:boolean, preserved:object}>}
 */
export async function repairOniActors(actor) {
  if (!actor?.update) throw new Error("Actor inválido para repair Oni.");
  if (actorKind(actor) !== "oni") return { repaired: false, skipped: true, preserved: {} };

  const currentVersion = actor.getFlag?.(MODULE_ID, "oniRepairVersion") ?? 0;
  if (currentVersion >= ONI_REPAIR_VERSION) {
    return { repaired: false, skipped: true, preserved: {} };
  }

  const { needsRepair, patch, preserved } = planOniRepair(actor);
  if (needsRepair) {
    await actor.update(patch, { naCsbAutomation: true });
  }
  await actor.setFlag(MODULE_ID, "oniRepairVersion", ONI_REPAIR_VERSION);
  return { repaired: needsRepair, skipped: false, preserved };
}
