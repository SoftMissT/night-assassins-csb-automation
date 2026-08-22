/**
 * @fileoverview Fluxo administrativo do HUD Telefone/Chat (Specs §4.2, §6, CT-031/CT-032).
 *
 * Somente GM. Cada operação commita no store (fonte única) e distribui sync
 * filtrado por usuário ativo. Diálogos seguem o padrão DialogV2 do relay.
 */

import { LIMITS, escapeHtml, isValidWallpaper } from "./phone-chat-domain.mjs";
import {
  archiveContact,
  archiveConversation,
  commit,
  deleteMessage,
  deleteQuickReply,
  loadState,
  updateSettings,
  upsertContact,
  upsertConversation,
  upsertQuickReply,
} from "./phone-chat-store.mjs";
import { broadcastFullSync } from "./phone-chat-relay.mjs";

function notify(code) {
  const successCodes = new Set([
    "CONVERSATION_COMMITTED", "CONVERSATION_ARCHIVED",
    "CONTACT_COMMITTED", "CONTACT_ARCHIVED",
    "QUICK_REPLY_COMMITTED", "QUICK_REPLY_DELETED",
    "MESSAGE_DELETED", "SETTINGS_UPDATED",
  ]);
  if (code === "STORE_LIMIT") return ui.notifications.warn("Limite de armazenamento do telefone atingido.");
  if (!successCodes.has(code)) return ui.notifications.warn(`Operação recusada (${code}).`);
  return null;
}

async function applyAdmin(mutator, reason) {
  const result = await commit(mutator);
  notify(result.code);
  if (result.code !== "STORE_LIMIT" && !["NOT_FOUND", "INVALID_PAYLOAD"].includes(result.code)) {
    broadcastFullSync(reason);
    Hooks.callAll("phoneChatStateChanged");
  }
  return result;
}

/**
 * Cria ou edita um contato/NPC com respostas rápidas (uma por linha).
 * @param {string|null} [contactId]
 * @returns {Promise<object>} resultado do commit.
 */
export async function promptContactManager(contactId = null) {
  if (!game.user.isGM) return null;
  const Dialog = foundry.applications.api.DialogV2;
  const state = loadState();
  const contact = contactId ? state.contacts[contactId] : null;
  const quickLines = (contact?.quickReplies ?? []).map((quick) => quick.text).join("\n");

  const saved = await Dialog.wait({
    window: { title: contact ? "Editar contato/NPC" : "Novo contato/NPC" },
    position: { width: 440 },
    modal: true,
    rejectClose: false,
    content: `
      <form>
        <div class="form-group"><label>Nome</label><div class="form-fields"><input type="text" name="displayName" maxlength="${LIMITS.name}" value="${escapeHtml(contact?.displayName ?? "")}" /></div></div>
        <div class="form-group"><label>Avatar (URL/path)</label><div class="form-fields"><input type="text" name="avatar" value="${escapeHtml(contact?.avatar ?? "")}" placeholder="opcional" /></div></div>
        <div class="form-group"><label>Respostas rápidas (uma por linha)</label><div class="form-fields"><textarea name="quickReplies" rows="4">${escapeHtml(quickLines)}</textarea></div></div>
      </form>`,
    buttons: [
      { action: "cancel", label: "Cancelar", callback: () => null },
      {
        action: "save",
        label: "Salvar",
        default: true,
        callback: (_event, _button, dialog) => {
          const root = dialog.element;
          return {
            displayName: root.querySelector("[name='displayName']")?.value ?? "",
            avatar: root.querySelector("[name='avatar']")?.value ?? "",
            quickRepliesRaw: root.querySelector("[name='quickReplies']")?.value ?? "",
          };
        },
      },
    ],
  });
  if (!saved) return null;

  const result = await applyAdmin(
    (current) => upsertContact(current, {
      id: contactId ?? undefined,
      displayName: saved.displayName,
      avatar: isValidWallpaper(saved.avatar) ? saved.avatar : null,
    }),
    "conversation-updated",
  );

  if (result.contact && result.code === "CONTACT_COMMITTED") {
    const nextTexts = saved.quickRepliesRaw.split("\n").map((line) => line.trim()).filter(Boolean);
    const currentTexts = result.contact.quickReplies.map((quick) => quick.text);
    let working = result.state;
    for (const quick of result.contact.quickReplies) {
      if (!nextTexts.includes(quick.text)) {
        working = deleteQuickReply(working, result.contact.id, quick.id).state;
      }
    }
    for (const text of nextTexts) {
      if (!currentTexts.includes(text)) {
        working = upsertQuickReply(working, result.contact.id, { text }).state;
      }
    }
    if (working.revision !== result.state.revision) {
      await applyAdmin(() => ({ state: working, code: "QUICK_REPLY_COMMITTED" }), "conversation-updated");
    }
  }
  return result;
}

/**
 * Coleta os jogadores ativos (não-GM) para seleção em conversas.
 * @returns {Array<{id: string, name: string}>}
 */
export function listPlayers() {
  return (game.users?.contents ?? [])
    .filter((user) => !user.isGM)
    .map((user) => ({ id: user.id, name: user.name }));
}

/**
 * Cria ou edita uma conversa (participantes, contatos, wallpaper).
 * @param {string|null} [conversationId]
 * @returns {Promise<object>}
 */
export async function promptConversationManager(conversationId = null) {
  if (!game.user.isGM) return null;
  const Dialog = foundry.applications.api.DialogV2;
  const state = loadState();
  const conversation = conversationId ? state.conversations[conversationId] : null;

  const playerOptions = listPlayers().map((player) => {
    const checked = conversation?.participantUserIds?.includes(player.id) ? "checked" : "";
    return `<label class="checkbox"><input type="checkbox" name="player" value="${escapeHtml(player.id)}" ${checked}> ${escapeHtml(player.name)}</label>`;
  }).join("");
  const contactOptions = Object.values(state.contacts)
    .filter((contact) => !contact.archived)
    .map((contact) => {
      const checked = conversation?.contactIds?.includes(contact.id) ? "checked" : "";
      return `<label class="checkbox"><input type="checkbox" name="contact" value="${escapeHtml(contact.id)}" ${checked}> ${escapeHtml(contact.displayName)}</label>`;
    }).join("");

  const saved = await Dialog.wait({
    window: { title: conversation ? "Editar conversa" : "Nova conversa" },
    position: { width: 480 },
    modal: true,
    rejectClose: false,
    content: `
      <form>
        <div class="form-group"><label>Nome</label><div class="form-fields"><input type="text" name="displayName" maxlength="${LIMITS.name}" value="${escapeHtml(conversation?.displayName ?? "")}" /></div></div>
        <div class="form-group"><label>Tipo</label><div class="form-fields"><select name="kind"><option value="direct" ${conversation?.kind !== "group" ? "selected" : ""}>Direta (2)</option><option value="group" ${conversation?.kind === "group" ? "selected" : ""}>Grupo</option></select></div></div>
        <fieldset><legend>Jogadores</legend>${playerOptions || "<p class='hint'>Nenhum jogador ativo.</p>"}</fieldset>
        <fieldset><legend>Contatos/NPC</legend>${contactOptions || "<p class='hint'>Cadastre um contato primeiro.</p>"}</fieldset>
        <div class="form-group"><label>Wallpaper da conversa</label><div class="form-fields"><input type="text" name="wallpaper" value="${escapeHtml(conversation?.wallpaper ?? "")}" placeholder="opcional" /></div></div>
      </form>`,
    buttons: [
      { action: "cancel", label: "Cancelar", callback: () => null },
      {
        action: "save",
        label: "Salvar",
        default: true,
        callback: (_event, _button, dialog) => {
          const root = dialog.element;
          return {
            displayName: root.querySelector("[name='displayName']")?.value ?? "",
            kind: root.querySelector("[name='kind']")?.value ?? "direct",
            participantUserIds: [...root.querySelectorAll("[name='player']:checked")].map((input) => input.value),
            contactIds: [...root.querySelectorAll("[name='contact']:checked")].map((input) => input.value),
            wallpaper: root.querySelector("[name='wallpaper']")?.value ?? "",
          };
        },
      },
    ],
  });
  if (!saved) return null;

  return applyAdmin(
    (current) => upsertConversation(current, {
      id: conversationId ?? undefined,
      ...saved,
      wallpaper: isValidWallpaper(saved.wallpaper) ? saved.wallpaper : null,
    }),
    "conversation-updated",
  );
}

/**
 * Configurações globais: limite de histórico e wallpaper mundial.
 * @returns {Promise<object>}
 */
export async function promptGlobalSettings() {
  if (!game.user.isGM) return null;
  const Dialog = foundry.applications.api.DialogV2;
  const state = loadState();

  const saved = await Dialog.wait({
    window: { title: "Telefone — configurações" },
    position: { width: 420 },
    modal: true,
    rejectClose: false,
    content: `
      <form>
        <div class="form-group"><label>Limite de histórico por conversa (${LIMITS.historyLimitMin}-${LIMITS.historyLimitMax})</label><div class="form-fields"><input type="number" name="historyLimit" min="${LIMITS.historyLimitMin}" max="${LIMITS.historyLimitMax}" step="1" value="${state.settings.historyLimit}" /></div></div>
        <div class="form-group"><label>Wallpaper global</label><div class="form-fields"><input type="text" name="globalWallpaper" value="${escapeHtml(state.settings.globalWallpaper ?? "")}" placeholder="opcional" /></div></div>
      </form>`,
    buttons: [
      { action: "cancel", label: "Cancelar", callback: () => null },
      {
        action: "save",
        label: "Salvar",
        default: true,
        callback: (_event, _button, dialog) => {
          const root = dialog.element;
          return {
            historyLimit: Number(root.querySelector("[name='historyLimit']")?.value),
            globalWallpaper: root.querySelector("[name='globalWallpaper']")?.value ?? "",
          };
        },
      },
    ],
  });
  if (!saved) return null;

  return applyAdmin(
    (current) => updateSettings(current, {
      historyLimit: saved.historyLimit,
      globalWallpaper: isValidWallpaper(saved.globalWallpaper) ? saved.globalWallpaper : null,
      enabled: current.settings.enabled,
    }),
    "settings-updated",
  );
}

/**
 * Moderação: remove uma mensagem confirmada após confirmação.
 * @param {string} conversationId
 * @param {string} messageId
 * @returns {Promise<object|null>}
 */
export async function confirmDeleteMessage(conversationId, messageId) {
  if (!game.user.isGM) return null;
  const Dialog = foundry.applications.api.DialogV2;
  const confirmed = await Dialog.confirm({
    window: { title: "Remover mensagem" },
    modal: true,
    content: "<p>Remover esta mensagem para todos os participantes?</p>",
    rejectClose: false,
  });
  if (!confirmed) return null;
  return applyAdmin(
    (current) => deleteMessage(current, conversationId, messageId),
    "message-deleted",
  );
}
