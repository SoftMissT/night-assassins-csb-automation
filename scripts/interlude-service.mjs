/**
 * @fileoverview Progressao executavel dos treinos de Interludio do Slayer.
 */

import { parseNumber } from "./parsing.mjs";

export const INTERLUDE_ACTIVITIES = Object.freeze({
  cabaca_pequena: { label: "Cabaca Pequena", formula: (p) => `1d20 + ${parseNumber(p.vit_display)}`, dc: 14, progress: "interludio_cabaca_pequena_sucessos", complete: "interludio_cabaca_pequena_completa", consecutive: true },
  cabaca_media: { label: "Cabaca Media", formula: (p) => `1d20 + ${parseNumber(p.vit_display) + parseNumber(p.fdv_display)}`, dc: 16, progress: "interludio_cabaca_media_sucessos", complete: "interludio_cabaca_media_completa", consecutive: true },
  cabaca_gigante: { label: "Cabaca Gigante", formula: (p) => `1d20 + ${parseNumber(p.vit_display) + parseNumber(p.fdv_display)}`, dc: 18, progress: "interludio_cabaca_gigante_sucessos", complete: "interludio_cabaca_gigante_completa", consecutive: true },
  copo_cha: { label: "Copo de Cha Medicinal", formula: (p) => `1d20 + ${parseNumber(p.dex_display)}`, dc: 20, progress: "interludio_copo_cha_vitorias", complete: "interludio_olhos_falcao", consecutive: false },
});

export function buildInterludeProgressPatch(props = {}, activityKey, success) {
  const activity = INTERLUDE_ACTIVITIES[activityKey];
  if (!activity) throw new Error("Atividade de Interludio invalida.");
  if (parseNumber(props[activity.complete]) > 0) return { complete: true, progress: 3, patch: {} };
  const previous = Math.max(0, Math.min(3, Math.trunc(parseNumber(props[activity.progress]))));
  const progress = success ? Math.min(3, previous + 1) : activity.consecutive ? 0 : previous;
  const complete = progress >= 3;
  const patch = {
    [`system.props.${activity.progress}`]: progress,
    [`system.props.${activity.complete}`]: complete ? 1 : 0,
  };
  if (activityKey === "cabaca_gigante" && complete) {
    patch["system.props.interludio_concentracao_total_constante"] = 1;
    patch["system.props.interludio_respiracao_repouso"] = 1;
  }
  return { complete, progress, patch };
}

async function resolveActor(actorUuid) {
  if (actorUuid) {
    const document = await fromUuid(actorUuid);
    const actor = document?.actor ?? document;
    if (actor?.system?.props) return actor;
  }
  return canvas.tokens.controlled[0]?.actor ?? game.user?.character ?? null;
}

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

export async function executeInterludeActivity(actor, activityKey) {
  const activity = INTERLUDE_ACTIVITIES[activityKey];
  if (!activity) throw new Error("Atividade de Interludio invalida.");
  const props = actor.system?.props ?? {};
  if (parseNumber(props[activity.complete]) > 0) throw new Error(`${activity.label} ja foi concluido.`);
  const roll = await new Roll(activity.formula(props)).evaluate();
  const rollMessage = await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `${activity.label} contra CD ${activity.dc}` });
  if (rollMessage?.id) {
    try {
      await game.dice3d?.waitFor3DAnimationByMessageID?.(rollMessage.id);
    } catch (_) {
      // Dice So Nice is optional. Its animation must never block training progress.
    }
  }
  const success = Number(roll.total) >= activity.dc;
  const result = buildInterludeProgressPatch(props, activityKey, success);
  await actor.update(result.patch, { naCsbAutomation: true, naInterlude: true });
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="na-interlude-card"><strong>${escapeHtml(activity.label)}</strong><p>${success ? "Sucesso" : "Falha"} progresso ${result.progress}/3.</p>${result.complete ? "<p><strong>Treino concluido e beneficio desbloqueado.</strong></p>" : ""}</div>`,
  });
  return { success, ...result };
}

export async function openInterludeManager({ actorUuid } = {}) {
  const actor = await resolveActor(actorUuid);
  if (!actor) return ui.notifications.warn("Nao ha personagem ativo.");
  const props = actor.system?.props ?? {};
  const options = Object.entries(INTERLUDE_ACTIVITIES).map(([key, activity]) => {
    const progress = Math.min(3, Math.max(0, Math.trunc(parseNumber(props[activity.progress]))));
    const complete = parseNumber(props[activity.complete]) > 0;
    return `<option value="${key}" ${complete ? "disabled" : ""}>${escapeHtml(activity.label)} ${complete ? "CONCLUIDO" : `${progress}/3`}</option>`;
  }).join("");
  const choice = await foundry.applications.api.DialogV2.wait({
    window: { title: `Interludio ${actor.name}` },
    position: { width: 560, height: "auto" },
    modal: true,
    rejectClose: false,
    content: `<fieldset><legend>Treino da semana</legend><div class="form-group"><label>Atividade</label><div class="form-fields"><select name="activity">${options}</select></div></div><p class="hint">Cabacas: a falha zera a sequencia. Copo de Cha: as vitorias sao acumuladas.</p></fieldset>`,
    buttons: [
      { action: "roll", label: "Realizar teste", default: true, callback: (_event, button) => String(button.form.elements.activity.value) },
      { action: "cancel", label: "Cancelar", callback: () => null },
    ],
  });
  if (!choice) return null;
  return executeInterludeActivity(actor, choice);
}
