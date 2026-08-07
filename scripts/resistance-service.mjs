/**
 * @fileoverview Gerenciamento persistente de resistências tipadas no CSB.
 */

import { TIPOS_DANO } from "./constants.mjs";

const CONTRACTS = Object.freeze({
  slayer: Object.freeze({
    data: "status_slayer_resistencias_dados",
    summary: "status_slayer_resistencias_resumo",
  }),
  oni: Object.freeze({
    data: "status_oni_resistencias_dados",
    summary: "status_oni_resistencias_resumo",
  }),
});

const DAMAGE_BY_KEY = new Map(TIPOS_DANO.map((entry) => [entry.key, entry]));

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function normalizeResistanceKeys(value) {
  const raw = Array.isArray(value) ? value : String(value ?? "").split(",");
  return [...new Set(raw.map((entry) => String(entry).trim().toLowerCase()).filter((entry) => DAMAGE_BY_KEY.has(entry)))];
}

export function formatResistanceSummary(keys) {
  const normalized = normalizeResistanceKeys(keys);
  return normalized.length > 0
    ? normalized.map((key) => DAMAGE_BY_KEY.get(key).label).join(" · ")
    : "Nenhuma resistência";
}

export async function saveActorResistances(actor, keys, kind = "slayer") {
  if (!actor?.update) throw new Error("Actor inválido para salvar Resistências.");
  const contract = CONTRACTS[kind];
  if (!contract) throw new Error(`Contrato de Resistências desconhecido: ${kind}.`);
  const normalized = normalizeResistanceKeys(keys);
  const summary = formatResistanceSummary(normalized);
  await actor.update({
    [`system.props.${contract.data}`]: normalized.join(","),
    [`system.props.${contract.summary}`]: summary,
  }, { naCsbAutomation: true });
  return { keys: normalized, summary };
}

async function resolveActor(actorUuid) {
  if (actorUuid) {
    const document = await fromUuid(actorUuid);
    const actor = document?.actor ?? document;
    if (actor?.documentName === "Actor" || actor?.system?.props) return actor;
  }
  return canvas.tokens.controlled[0]?.actor ?? game.user?.character ?? null;
}

export async function openResistanceManager({ actorUuid, kind = "slayer" } = {}) {
  if (!canvas.ready) return ui.notifications.warn("Canvas não pronto.");
  const actor = await resolveActor(actorUuid);
  if (!actor) return ui.notifications.warn("Não há personagem ativo.");
  const contract = CONTRACTS[kind];
  if (!contract) return ui.notifications.error(`Contrato de Resistências desconhecido: ${kind}.`);

  const selected = new Set(normalizeResistanceKeys(actor.system?.props?.[contract.data]));
  const fields = TIPOS_DANO.map((type) => `
    <label style="display:flex;align-items:center;gap:8px;padding:7px 9px;background:#171411;border:1px solid #3a332c;border-radius:4px;">
      <input type="checkbox" name="na-resistance" value="${escapeHtml(type.key)}" ${selected.has(type.key) ? "checked" : ""}>
      <span><strong>${escapeHtml(type.label)}</strong><br><small style="color:#a99f93;">${escapeHtml(type.desc)}</small></span>
    </label>`).join("");

  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: `Resistências — ${actor.name}` },
    content: `
      <div class="na-csb-automation" style="display:grid;gap:8px;padding:4px 0;">
        <p style="margin:0;">Marque os tipos cujo dano final será reduzido à metade.</p>
        <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;max-height:520px;overflow:auto;">${fields}</div>
      </div>`,
    modal: true,
    rejectClose: false,
    buttons: [
      {
        action: "save-resistances",
        label: "Salvar Resistências",
        callback: (event, button) => [...new FormData(button.form).getAll("na-resistance")],
      },
      { action: "clear-resistances", label: "Limpar", callback: () => [] },
      { action: "cancel", label: "Cancelar", callback: () => null },
    ],
  });
  if (result === null || result === undefined) return null;
  const saved = await saveActorResistances(actor, result, kind);
  ui.notifications.info(`Resistências de ${actor.name}: ${saved.summary}.`);
  return saved;
}

export const RESISTANCE_CONTRACTS = CONTRACTS;
