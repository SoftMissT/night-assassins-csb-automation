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
  if (!value) return { version: 2, active: [], exhaustion: 0, effects: {}, exhaustionMilestones: [] };
  try {
    let candidate = value;
    if (typeof candidate === "string") {
      candidate = candidate
        .replace(/<[^>]*>/g, "")
        .replaceAll("&quot;", '"')
        .replaceAll("&#34;", '"')
        .replaceAll("&amp;", "&")
        .replaceAll("&nbsp;", " ")
        .trim();
      const firstBrace = candidate.indexOf("{");
      const lastBrace = candidate.lastIndexOf("}");
      if (firstBrace >= 0 && lastBrace > firstBrace) candidate = candidate.slice(firstBrace, lastBrace + 1);
    }
    let parsed = typeof candidate === "string" ? JSON.parse(candidate) : candidate;
    if (typeof parsed === "string") parsed = JSON.parse(parsed);
    return {
      version: 2,
      active: normalizeStatusKeys(parsed?.active),
      exhaustion: clampExhaustion(parsed?.exhaustion),
      effects: normalizeStatusEffects(parsed?.effects),
      exhaustionMilestones: [...new Set((Array.isArray(parsed?.exhaustionMilestones) ? parsed.exhaustionMilestones : [])
        .map((entry) => Number.parseInt(entry, 10)).filter((entry) => entry === 5 || entry === 8))],
    };
  } catch {
    return { version: 2, active: normalizeStatusKeys(value), exhaustion: 0, effects: {}, exhaustionMilestones: [] };
  }
}

export function normalizeStatusEffects(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const normalized = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!STATUS_BY_KEY.has(key) || !raw || typeof raw !== "object") continue;
    const remaining = raw.remainingTurns === null || raw.remainingTurns === ""
      ? null
      : Math.max(0, Number.parseInt(raw.remainingTurns, 10) || 0);
    normalized[key] = {
      damageFormula: String(raw.damageFormula ?? "").trim().slice(0, 80),
      remainingTurns: remaining,
      sourceName: String(raw.sourceName ?? "").trim().slice(0, 120),
      saveAttr: ["VIT", "DEX", "FOR", "CAR", "FDV", "INT", "SAB"].includes(String(raw.saveAttr).toUpperCase())
        ? String(raw.saveAttr).toUpperCase() : "",
      saveDc: Math.max(0, Math.min(99, Number.parseInt(raw.saveDc, 10) || 0)),
      stacks: Math.max(1, Math.min(99, Number.parseInt(raw.stacks, 10) || 1)),
      tick: raw.tick === "end" ? "end" : "start",
    };
  }
  return normalized;
}

export function formatStatusSummary(active, exhaustion = 0) {
  const labels = normalizeStatusKeys(active).map((key) => STATUS_BY_KEY.get(key).label);
  const level = clampExhaustion(exhaustion);
  if (level > 0) labels.unshift(`Exaustão ${level}`);
  return labels.length > 0 ? labels.join(" · ") : "Nenhum status";
}

export async function saveSlayerStatuses(actor, active, exhaustion = 0, effects = {}, exhaustionMilestones = []) {
  if (!actor?.update) throw new Error("Actor inválido para salvar status.");
  const activeKeys = normalizeStatusKeys(active);
  const normalizedEffects = normalizeStatusEffects(effects);
  const state = {
    version: 2,
    active: activeKeys,
    exhaustion: clampExhaustion(exhaustion),
    effects: Object.fromEntries(Object.entries(normalizedEffects).filter(([key]) => activeKeys.includes(key))),
    exhaustionMilestones: [...new Set(exhaustionMilestones)].filter((entry) => entry === 5 || entry === 8),
  };
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
  const configurable = [
    ["sangramento", "Sangramento", "1d4", 3], ["hemorragia", "Hemorragia", "1d6", 3],
    ["envenenamento", "Envenenamento", "1d4", 3], ["corroido", "Corroído", "1d4", ""],
    ["em_chamas", "Em Chamas", "1d4", ""], ["invisivel_inalvejavel", "Invisível / Inalvejável", "", ""],
    ["vulneravel", "Vulnerável", "", 1], ["restricao_movimentos", "Restrição de Movimentos", "", ""],
    ["atordoamento", "Atordoamento", "", 1], ["paralisia", "Paralisia", "", ""],
    ["colapso", "Colapso", "", ""], ["confuso", "Confuso", "", ""],
    ["amedrontado", "Amedrontado", "", ""], ["desequilibrado", "Desequilibrado", "", 1],
    ["desorientado", "Desorientado", "", 1], ["hipotermia", "Hipotermia", "", ""],
    ["corrupcao", "Corrupção", "", ""],
    ["regeneracao_suprimida", "Regeneração Suprimida", "", 2],
    ["silenciado", "Silenciado", "", ""], ["suprimido", "Suprimido", "", ""],
  ];
  const configRows = configurable.map(([key, label, defaultFormula, defaultTurns]) => {
    const effect = state.effects[key] ?? {};
    return `<div style="display:grid;grid-template-columns:1.4fr 1fr .65fr .55fr .7fr .65fr 1fr;gap:5px;align-items:center;padding:5px;background:#171411;">
      <strong>${escapeHtml(label)}</strong>
      <input name="effect.${key}.formula" value="${escapeHtml(effect.damageFormula ?? defaultFormula)}" placeholder="Dano">
      <input type="number" min="0" name="effect.${key}.turns" value="${effect.remainingTurns === null ? "" : effect.remainingTurns ?? defaultTurns}" placeholder="Turnos">
      <input type="number" min="1" max="99" name="effect.${key}.stacks" value="${effect.stacks ?? 1}" title="Pilhas">
      <select name="effect.${key}.attr"><option value="">Sem teste</option>${["VIT","DEX","FOR","CAR","FDV","INT","SAB"].map((attr) => `<option value="${attr}" ${effect.saveAttr === attr ? "selected" : ""}>${attr}</option>`).join("")}</select>
      <input type="number" min="0" max="99" name="effect.${key}.dc" value="${effect.saveDc ?? 0}" placeholder="CD">
      <input name="effect.${key}.source" value="${escapeHtml(effect.sourceName ?? "")}" placeholder="Fonte">
    </div>`;
  }).join("");

  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: `Status — ${actor.name}` },
    content: `<div style="display:grid;gap:8px;max-height:650px;overflow:auto;padding-right:4px;">
      <label style="display:flex;align-items:center;gap:10px;padding:8px;background:#241d18;">
        <strong>Exaustão acumulada</strong>
        <input type="number" name="na-exhaustion" min="0" max="8" step="1" value="${state.exhaustion}" style="width:70px;">
      </label>
      ${sections}
      <fieldset style="border:1px solid #433b34;padding:8px;margin:0;">
        <legend>Configuração mecânica</legend>
        <p class="hint">Dano e turnos vêm da técnica que aplicou o status. Turnos vazios significam duração manual.</p>
        <div style="display:grid;gap:4px;">${configRows}</div>
      </fieldset>
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
          const effects = {};
          for (const [key] of configurable) {
            effects[key] = {
              damageFormula: form.get(`effect.${key}.formula`),
              remainingTurns: form.get(`effect.${key}.turns`) || null,
              saveAttr: form.get(`effect.${key}.attr`) || (["silenciado", "suprimido"].includes(key) ? "FDV" : ["hipotermia", "paralisia"].includes(key) ? "VIT" : ""),
              saveDc: form.get(`effect.${key}.dc`),
              sourceName: form.get(`effect.${key}.source`),
              stacks: form.get(`effect.${key}.stacks`) ?? 1,
              tick: state.effects[key]?.tick ?? ([
                "invisivel_inalvejavel", "vulneravel", "restricao_movimentos", "atordoamento", "paralisia",
                "colapso", "confuso", "amedrontado", "desorientado", "hipotermia", "suprimido",
              ].includes(key) ? "end" : "start"),
            };
          }
          return { active: form.getAll("na-status"), exhaustion: form.get("na-exhaustion"), effects };
        },
      },
      { action: "clear-statuses", label: "Limpar", callback: () => ({ active: [], exhaustion: 0 }) },
      { action: "cancel", label: "Cancelar", callback: () => null },
    ],
  });
  if (result === null || result === undefined) return null;
  const retainedMilestones = state.exhaustionMilestones.filter((level) => clampExhaustion(result.exhaustion) >= level);
  const saved = await saveSlayerStatuses(actor, result.active, result.exhaustion, result.effects, retainedMilestones);
  ui.notifications.info(`Status de ${actor.name}: ${saved.summary}.`);
  return saved;
}

export const STATUS_SLAYER_CONTRACT = CONTRACT;
