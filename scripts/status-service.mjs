/**
 * @fileoverview Catálogo e persistência da base de status do Slayer.
 */

import { STATUS_SLAYER } from "./constants.mjs";

const STATUS_BY_KEY = new Map(STATUS_SLAYER.map((status) => [status.key, status]));
const CONTRACT = Object.freeze({
  data: "status_slayer_dados",
  summary: "status_slayer_resumo",
  exhaustion: "status_slayer_exaustao",
});

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function normalizeStatusKeys(value) {
  const raw = Array.isArray(value) ? value : String(value ?? "").split(",");
  return [...new Set(raw.map((entry) => String(entry).trim().toLowerCase()).filter((entry) => STATUS_BY_KEY.has(entry)))];
}

export function clampExhaustion(value) {
  const numeric = Number.parseInt(value, 10);
  return Number.isFinite(numeric) ? Math.min(8, Math.max(0, numeric)) : 0;
}

export function parseStatusState(value) {
  if (!value) return { active: [], exhaustion: 0 };
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return {
      active: normalizeStatusKeys(parsed?.active),
      exhaustion: clampExhaustion(parsed?.exhaustion),
    };
  } catch {
    return { active: normalizeStatusKeys(value), exhaustion: 0 };
  }
}

export function formatStatusSummary(active, exhaustion = 0) {
  const labels = normalizeStatusKeys(active).map((key) => STATUS_BY_KEY.get(key).label);
  const level = clampExhaustion(exhaustion);
  if (level > 0) labels.unshift(`Exaustão ${level}`);
  return labels.length > 0 ? labels.join(" · ") : "Nenhum status";
}

export async function saveSlayerStatuses(actor, active, exhaustion = 0) {
  if (!actor?.update) throw new Error("Actor inválido para salvar status.");
  const state = { version: 1, active: normalizeStatusKeys(active), exhaustion: clampExhaustion(exhaustion) };
  const summary = formatStatusSummary(state.active, state.exhaustion);
  await actor.update({
    [`system.props.${CONTRACT.data}`]: JSON.stringify(state),
    [`system.props.${CONTRACT.summary}`]: summary,
    [`system.props.${CONTRACT.exhaustion}`]: state.exhaustion,
  }, { naCsbAutomation: true });
  return { ...state, summary };
}

async function resolveActor(actorUuid) {
  if (actorUuid) {
    const document = await fromUuid(actorUuid);
    const actor = document?.actor ?? document;
    if (actor?.documentName === "Actor" || actor?.system?.props) return actor;
  }
  return canvas.tokens.controlled[0]?.actor ?? game.user?.character ?? null;
}

export async function openStatusManager({ actorUuid } = {}) {
  if (!canvas.ready) return ui.notifications.warn("Canvas não pronto.");
  const actor = await resolveActor(actorUuid);
  if (!actor) return ui.notifications.warn("Não há personagem ativo.");
  if (!actor.isOwner) return ui.notifications.error("Você não pode alterar este personagem.");

  const props = actor.system?.props ?? {};
  const state = parseStatusState(props[CONTRACT.data]);
  state.exhaustion = clampExhaustion(props[CONTRACT.exhaustion] ?? state.exhaustion);
  const selected = new Set(state.active);
  const categories = new Map();
  for (const status of STATUS_SLAYER) {
    if (!categories.has(status.category)) categories.set(status.category, []);
    categories.get(status.category).push(status);
  }
  const sections = [...categories].map(([category, statuses]) => `
    <fieldset style="border:1px solid #433b34;padding:8px;margin:0;">
      <legend>${escapeHtml(category)}</legend>
      <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px;">
        ${statuses.map((status) => `<label style="display:flex;align-items:center;gap:7px;padding:5px 7px;background:#171411;">
          <input type="checkbox" name="na-status" value="${escapeHtml(status.key)}" ${selected.has(status.key) ? "checked" : ""}>
          <span>${escapeHtml(status.label)}</span>
        </label>`).join("")}
      </div>
    </fieldset>`).join("");

  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: `Status — ${actor.name}` },
    content: `<div style="display:grid;gap:8px;max-height:650px;overflow:auto;padding-right:4px;">
      <label style="display:flex;align-items:center;gap:10px;padding:8px;background:#241d18;">
        <strong>Exaustão acumulada</strong>
        <input type="number" name="na-exhaustion" min="0" max="8" step="1" value="${state.exhaustion}" style="width:70px;">
      </label>
      ${sections}
    </div>`,
    position: { width: 720 },
    modal: true,
    rejectClose: false,
    buttons: [
      {
        action: "save-statuses",
        label: "Salvar Status",
        default: true,
        callback: (event, button) => {
          const form = new FormData(button.form);
          return { active: form.getAll("na-status"), exhaustion: form.get("na-exhaustion") };
        },
      },
      { action: "clear-statuses", label: "Limpar", callback: () => ({ active: [], exhaustion: 0 }) },
      { action: "cancel", label: "Cancelar", callback: () => null },
    ],
  });
  if (result === null || result === undefined) return null;
  const saved = await saveSlayerStatuses(actor, result.active, result.exhaustion);
  ui.notifications.info(`Status de ${actor.name}: ${saved.summary}.`);
  return saved;
}

export const STATUS_SLAYER_CONTRACT = CONTRACT;
