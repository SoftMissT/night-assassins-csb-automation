/**
 * @fileoverview Catálogo e persistência da base de status do Slayer.
 */

import { STATUS_SLAYER, STATUS_SLAYER_DANO_CONTINUO } from "./constants.mjs";

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

const FINITE_SOURCE_DAMAGE = Object.freeze(["sangramento", "hemorragia", "envenenamento"]);

export function validateStatusConfiguration(active, effects = {}) {
  const selected = new Set(normalizeStatusKeys(active));
  const errors = [];
  for (const key of FINITE_SOURCE_DAMAGE) {
    if (!selected.has(key)) continue;
    const effect = effects[key] ?? {};
    const label = STATUS_BY_KEY.get(key)?.label ?? key;
    if (!String(effect.damageFormula ?? "").trim()) errors.push(`${label}: informe o dano por turno.`);
    if (!Number.isInteger(Number(effect.remainingTurns)) || Number(effect.remainingTurns) < 1) {
      errors.push(`${label}: informe a quantidade de turnos.`);
    }
  }
  return errors;
}

export async function openStatusManager({ actorUuid, draft = null } = {}) {
  if (!canvas.ready) return ui.notifications.warn("Canvas não pronto.");
  const actor = await resolveActor(actorUuid);
  if (!actor) return ui.notifications.warn("Não há personagem ativo.");
  if (!actor.isOwner) return ui.notifications.error("Você não pode alterar este personagem.");

  const props = actor.system?.props ?? {};
  const state = parseStatusState(props[CONTRACT.data]);
  if (draft) {
    state.active = normalizeStatusKeys(draft.active);
    state.effects = normalizeStatusEffects(draft.effects);
    state.exhaustion = clampExhaustion(draft.exhaustion);
  }
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
    { key: "sangramento", label: "Sangramento", damage: "source", duration: "source" },
    { key: "hemorragia", label: "Hemorragia", damage: "source", duration: "source" },
    { key: "envenenamento", label: "Envenenamento", damage: "source", duration: "source" },
    { key: "corroido", label: "Corroído", damage: "source", stacks: true },
    { key: "em_chamas", label: "Em Chamas", damage: "1d4" },
    { key: "invisivel_inalvejavel", label: "Invisível / Inalvejável", duration: "source" },
    { key: "vulneravel", label: "Vulnerável", duration: "source" },
    { key: "restricao_movimentos", label: "Restrição de Movimentos", duration: "source" },
    { key: "atordoamento", label: "Atordoamento", duration: "source" },
    { key: "paralisia", label: "Paralisia", duration: "source", save: "VIT" },
    { key: "colapso", label: "Colapso", duration: "source", save: "VIT", defaultDc: 15 },
    { key: "confuso", label: "Confuso", duration: "source" },
    { key: "amedrontado", label: "Amedrontado", duration: "source" },
    { key: "desequilibrado", label: "Desequilibrado" },
    { key: "sem_reacao", label: "Sem Reação", duration: "source" },
    { key: "desorientado", label: "Desorientado", defaultTurns: 1 },
    { key: "hipotermia", label: "Hipotermia", save: "VIT", stacks: true },
    { key: "corrupcao", label: "Corrupção", stacks: true },
    { key: "regeneracao_suprimida", label: "Regeneração Suprimida", duration: "source" },
    { key: "silenciado", label: "Silenciado", save: "FDV" },
    { key: "suprimido", label: "Suprimido", duration: "source", save: "FDV" },
  ];
  const configRows = configurable.map((config) => {
    const { key, label } = config;
    const effect = state.effects[key] ?? {};
    const damageInput = config.damage === "source"
      ? `<input name="effect.${key}.formula" value="${escapeHtml(effect.damageFormula ?? "")}" placeholder="Dano da fonte">`
      : config.damage === "1d4" ? `<span title="Dano fixo">1d4 fixo</span>` : `<span>—</span>`;
    const turnsInput = config.duration === "source" || config.defaultTurns
      ? `<input type="number" min="1" step="1" name="effect.${key}.turns" value="${effect.remainingTurns ?? config.defaultTurns ?? ""}" placeholder="Turnos" title="Quantidade de turnos definida pela fonte">`
      : `<span>Manual</span>`;
    const stacksInput = config.stacks
      ? `<input type="number" min="1" max="99" name="effect.${key}.stacks" value="${effect.stacks ?? 1}" title="Pilhas">`
      : `<span>—</span>`;
    const saveInput = config.save
      ? `<select name="effect.${key}.attr">${["VIT","DEX","FOR","CAR","FDV","INT","SAB"].map((attr) => `<option value="${attr}" ${(effect.saveAttr || config.save) === attr ? "selected" : ""}>${attr}</option>`).join("")}</select>`
      : `<span>—</span>`;
    const dcInput = config.save
      ? `<input type="number" min="0" max="99" name="effect.${key}.dc" value="${effect.saveDc || config.defaultDc || 0}" placeholder="CD">`
      : `<span>—</span>`;
    return `<div style="display:grid;grid-template-columns:1.4fr 1fr .65fr .55fr .7fr .65fr 1fr;gap:5px;align-items:center;padding:5px;background:#171411;">
      <strong>${escapeHtml(label)}</strong>
      ${damageInput}${turnsInput}${stacksInput}${saveInput}${dcInput}
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
        <p class="hint">Somente Sangramento, Hemorragia, Envenenamento, Corroído e Em Chamas causam dano no início do turno. “Fonte” significa que fórmula ou duração vêm da técnica.</p>
        ${draft?.errors?.length ? `<div style="border-left:4px solid #d64545;background:#2a1515;padding:8px;color:#ffb5b5;">${draft.errors.map(escapeHtml).join("<br>")}</div>` : ""}
        <div style="display:grid;grid-template-columns:1.4fr 1fr .65fr .55fr .7fr .65fr 1fr;gap:5px;padding:5px 8px;color:#d7ad5b;font-size:11px;text-transform:uppercase;letter-spacing:.06em;">
          <strong>Status</strong><strong>Dano/turno</strong><strong>Turnos</strong><strong>Pilhas</strong><strong>Teste</strong><strong>CD</strong><strong>Fonte</strong>
        </div>
        <div style="display:grid;gap:4px;">${configRows}</div>
      </fieldset>
    </div>`,
    position: { width: 920 },
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
          for (const config of configurable) {
            const { key } = config;
            effects[key] = {
              damageFormula: config.damage === "1d4" ? "1d4" : config.damage === "source" ? form.get(`effect.${key}.formula`) : "",
              remainingTurns: form.get(`effect.${key}.turns`) || null,
              saveAttr: config.save ? (form.get(`effect.${key}.attr`) || config.save) : "",
              saveDc: form.get(`effect.${key}.dc`),
              sourceName: form.get(`effect.${key}.source`),
              stacks: config.stacks ? (form.get(`effect.${key}.stacks`) ?? 1) : 1,
              tick: state.effects[key]?.tick ?? ([
                "invisivel_inalvejavel", "vulneravel", "restricao_movimentos", "atordoamento", "paralisia",
                "colapso", "confuso", "amedrontado", "desorientado", "hipotermia", "suprimido",
              ].includes(key) ? "end" : "start"),
            };
          }
          const active = form.getAll("na-status");
          const exhaustion = form.get("na-exhaustion");
          const errors = validateStatusConfiguration(active, effects);
          return { active, exhaustion, effects, errors, invalid: errors.length > 0 };
        },
      },
      { action: "clear-statuses", label: "Limpar", callback: () => ({ active: [], exhaustion: 0 }) },
      { action: "cancel", label: "Cancelar", callback: () => null },
    ],
  });
  if (result === null || result === undefined) return null;
  if (result.invalid) {
    ui.notifications.error(result.errors[0]);
    return openStatusManager({ actorUuid: actor.uuid, draft: result });
  }
  const retainedMilestones = state.exhaustionMilestones.filter((level) => clampExhaustion(result.exhaustion) >= level);
  const saved = await saveSlayerStatuses(actor, result.active, result.exhaustion, result.effects, retainedMilestones);
  ui.notifications.info(`Status de ${actor.name}: ${saved.summary}.`);
  return saved;
}

export const STATUS_SLAYER_CONTRACT = CONTRACT;
export const STATUS_SLAYER_DANO_KEYS = STATUS_SLAYER_DANO_CONTINUO;
