/**
 * @fileoverview Application do HUD Telefone/Chat (Specs §7).
 *
 * Singleton `ApplicationV2` escura, lateral, mestre-detalhe: lista de
 * conversas, thread, composer e painel administrativo (GM). Renderização por
 * `_renderHTML` (fallback confirmado) com texto inserido via escape.
 */

import { MODULE_ID } from "../constants.mjs";
import { escapeHtml, generateLogicalId } from "./phone-chat-domain.mjs";
import { archiveConversation, commit, loadState } from "./phone-chat-store.mjs";
import { broadcastFullSync, PHONE_CHAT_TYPES, requestSync, sendMessage, subscribeSync } from "./phone-chat-relay.mjs";
import {
  confirmDeleteMessage,
  promptContactManager,
  promptConversationManager,
  promptGlobalSettings,
} from "./phone-chat-admin.mjs";

const FLAG_LAST_THREAD = "phoneChatLastThread";

let singleton = null;

/**
 * Abre (ou foca) a HUD Telefone/Chat. Entrada pública para macro e botão.
 * @param {{actorUuid?: string, threadId?: string}} [options]
 * @returns {Promise<object>}
 */
export async function openPhoneChat(options = {}) {
  if (!singleton) {
    singleton = new PhoneChatApp();
    await singleton.render({ force: false });
  } else {
    singleton.bringToFront();
    if (options.threadId) singleton.activateConversation(options.threadId);
  }
  return singleton;
}

/**
 * Injeta o botão "Telefone" no cabeçalho das fichas Night Assassins
 * (Specs RF-008 — caminho garantido via hooks públicos de render).
 * @param {Application} app
 * @param {JQuery|HTMLElement} html
 * @returns {void}
 */
export function attachPhoneChatHeaderButton(app, html) {
  if (!app?.actor) return;
  const root = html?.[0] ?? html;
  const el = root instanceof HTMLElement ? root : null;
  const header = el?.querySelector?.(".window-header")
    ?? app.element?.querySelector?.(".window-header")
    ?? null;
  if (!header || header.querySelector(".na-phone-chat-open")) return;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "header-control icon fas fa-comment-dots na-phone-chat-open";
  button.title = game.i18n.localize("NA.PhoneChat.Title");
  button.setAttribute("aria-label", button.title);
  button.dataset.actorUuid = app.actor.uuid ?? "";
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    void openPhoneChat({ actorUuid: app.actor.uuid });
  });
  header.appendChild(button);
}

/**
 * Classe da HUD Telefone/Chat.
 */
export class PhoneChatApp extends foundry.applications.api.ApplicationV2 {
  /** @override */
  static DEFAULT_OPTIONS = {
    id: "na-phone-chat",
    classes: ["na-phone-chat"],
    tag: "aside",
    window: {
      title: "NA.PhoneChat.Title",
      icon: "fas fa-comment-dots",
      resizable: true,
      minimizable: true,
      frame: true,
    },
    position: {
      width: 360,
      height: 520,
      left: null,
      top: null,
    },
  };

  /** @override */
  _initializeApplicationOptions(options) {
    super._initializeApplicationOptions(options);
    this._snapshot = { conversations: {}, contacts: {}, settings: {} };
    this._revision = 0;
    this._activeConversationId = null;
    this._status = "loading";
    this._draft = "";
    this._lastThread = game.user.getFlag(MODULE_ID, FLAG_LAST_THREAD) ?? null;
    subscribeSync((message) => this._onSync(message));
    Hooks.on("phoneChatStateChanged", () => {
      if (game.user.isGM && this.rendered) {
        this._snapshot = loadState();
        this._revision = this._snapshot.revision;
        this.render({ force: true });
      }
    });
  }

  /**
   * Atualiza o snapshot local a partir do evento de sync filtrado.
   * O sync carrega o snapshot filtrado completo — substituição, não merge,
   * garante que remoções propaguem (Specs §4.5).
   * @param {object} message
   * @returns {void}
   */
  _onSync(message) {
    if (message.revision <= this._revision) return;
    this._revision = message.revision;
    const changes = message.changes ?? {};
    this._snapshot.conversations = { ...(changes.conversations ?? {}) };
    this._snapshot.contacts = { ...(changes.contacts ?? {}) };
    if (changes.settings) {
      this._snapshot.settings = { ...this._snapshot.settings, ...changes.settings };
    }
    this._status = "ready";
    if (!this._activeConversationId) this._restoreLastThread();
    this.render({ force: true });
  }

  /**
   * Reabre a última conversa utilizada quando ela existe no snapshot.
   * @returns {void}
   */
  _restoreLastThread() {
    if (this._lastThread && this._snapshot.conversations[this._lastThread]) {
      this._activeConversationId = this._lastThread;
    }
  }

  /** @override */
  async _renderHTML(context, options) {
    if (game.user.isGM) {
      this._snapshot = loadState();
      this._revision = this._snapshot.revision;
      this._status = "ready";
    }

    const list = this._renderConversationList();
    const thread = this._renderThread();
    const composer = this._renderComposer();
    const admin = game.user.isGM ? this._renderAdmin() : "";

    return `
      <div class="na-phone-chat__body">
        <section class="na-phone-chat__list">${list}</section>
        <section class="na-phone-chat__main">
          ${thread}
          ${composer}
        </section>
        ${admin}
      </div>`;
  }

  /** @override */
  async _onFirstRender(context, options) {
    await this.refresh();
  }

  /** @override */
  async _onRender(context, options) {
    this.element.querySelectorAll("[data-conversation-id]").forEach((el) => {
      el.addEventListener("click", (event) => {
        if (event.target.closest("[data-action]")) return;
        this.activateConversation(el.dataset.conversationId);
      });
    });
    const form = this.element.querySelector(".na-phone-chat__composer");
    form?.addEventListener("submit", (event) => {
      event.preventDefault();
      void this._onSubmit(event);
    });
    const sendAs = this.element.querySelector("[name='sendAs']");
    sendAs?.addEventListener("change", () => this.render({ force: true }));
    this.element.querySelectorAll("[data-quick-reply]").forEach((el) => {
      el.addEventListener("click", () => void this._sendQuickReply(el.dataset.quickReply));
    });
    this.element.querySelectorAll("[data-action]").forEach((el) => {
      el.addEventListener("click", () => void this._onAction(el.dataset.action, el.dataset));
    });
  }

  /**
   * Recarrega o estado (GM lê direto; jogador solicita sync).
   * @returns {Promise<void>}
   */
  async refresh() {
    this._status = "loading";
    if (game.user.isGM) {
      this._snapshot = loadState();
      this._revision = this._snapshot.revision;
      this._status = "ready";
      if (!this._activeConversationId) this._restoreLastThread();
      this.render({ force: true });
      return;
    }
    await requestSync();
  }

  /**
   * Ativa uma conversa e salva a última aberta.
   * @param {string} conversationId
   * @returns {void}
   */
  activateConversation(conversationId) {
    this._activeConversationId = conversationId;
    void game.user.setFlag(MODULE_ID, FLAG_LAST_THREAD, conversationId);
    this.render({ force: true });
  }

  /** @returns {string} */
  _renderConversationList() {
    const conversations = Object.values(this._snapshot.conversations)
      .filter((c) => !c.archived)
      .sort((a, b) => b.updatedAt - a.updatedAt);
    if (conversations.length === 0) {
      return `<p class="na-phone-chat__empty">${escapeHtml(game.i18n.localize("NA.PhoneChat.Empty"))}</p>`;
    }
    const gmControls = (conversation) => game.user.isGM
      ? `<span class="na-phone-chat__thread-controls">
          <button type="button" data-action="edit-conversation" data-conversation-id="${escapeHtml(conversation.id)}" title="Editar">✎</button>
          <button type="button" data-action="archive-conversation" data-conversation-id="${escapeHtml(conversation.id)}" title="Arquivar">🗄</button>
        </span>`
      : "";
    return conversations.map((conversation) => {
      const active = conversation.id === this._activeConversationId ? "is-active" : "";
      const last = conversation.messages[conversation.messages.length - 1];
      const preview = last ? escapeHtml(last.text.slice(0, 48)) : "";
      return `<div class="na-phone-chat__thread-row">
        <button type="button" class="na-phone-chat__thread ${active}" data-conversation-id="${escapeHtml(conversation.id)}">
          <span class="na-phone-chat__thread-name">${escapeHtml(conversation.displayName)}</span>
          <span class="na-phone-chat__thread-preview">${preview}</span>
        </button>
        ${gmControls(conversation)}
      </div>`;
    }).join("");
  }

  /** @returns {string} */
  _renderThread() {
    const conversation = this._snapshot.conversations[this._activeConversationId];
    if (!conversation) {
      return `<div class="na-phone-chat__thread-view na-phone-chat__placeholder">${escapeHtml(game.i18n.localize("NA.PhoneChat.SelectThread"))}</div>`;
    }
    const wallpaper = conversation.wallpaper ?? this._snapshot.settings?.globalWallpaper ?? null;
    const style = wallpaper ? `background-image:url('${escapeHtml(wallpaper)}');background-size:cover;background-position:center;` : "";
    const contacts = this._snapshot.contacts;
    const bubbles = conversation.messages.map((message) => {
      const mine = message.senderKind === "user" && message.senderId === game.user.id;
      const fromNpc = message.senderKind === "npc";
      const author = fromNpc ? (contacts[message.senderId]?.displayName ?? message.senderId) : message.senderId;
      const moderation = game.user.isGM
        ? `<button type="button" class="na-phone-chat__delete" data-action="delete-message" data-message-id="${escapeHtml(message.id)}" title="${escapeHtml(game.i18n.localize("NA.PhoneChat.DeleteMessage"))}">×</button>`
        : "";
      return `<div class="na-phone-chat__bubble ${mine ? "is-mine" : ""} ${fromNpc ? "is-npc" : ""}">
        <span class="na-phone-chat__author">${escapeHtml(author)}</span>
        <span class="na-phone-chat__text">${escapeHtml(message.text)}</span>
        ${moderation}
      </div>`;
    }).join("");
    return `<div class="na-phone-chat__thread-view ${wallpaper ? "has-wallpaper" : ""}" style="${style}">${bubbles}</div>`;
  }

  /** @returns {string} */
  _renderComposer() {
    const conversation = this._snapshot.conversations[this._activeConversationId];
    if (!conversation) return "";
    const contactId = conversation.contactIds[0] ?? null;
    const npcOption = game.user.isGM && contactId
      ? `<option value="npc">${escapeHtml(game.i18n.localize("NA.PhoneChat.SendAsNpc"))}</option>`
      : "";
    const quickReplies = game.user.isGM && contactId
      ? (this._snapshot.contacts[contactId]?.quickReplies ?? [])
        .filter((quick) => quick.enabled)
        .map((quick) => `<button type="button" class="na-phone-chat__quick" data-quick-reply="${escapeHtml(quick.text)}" title="${escapeHtml(game.i18n.localize("NA.PhoneChat.SendAsNpc"))}">${escapeHtml(quick.text)}</button>`)
        .join("")
      : "";
    return `<form class="na-phone-chat__composer">
      ${game.user.isGM && contactId ? `<select name="sendAs" class="na-phone-chat__send-as"><option value="user">${escapeHtml(game.i18n.localize("NA.PhoneChat.SendAsUser"))}</option>${npcOption}</select>` : ""}
      <div class="na-phone-chat__quick-row">${quickReplies}</div>
      <div class="na-phone-chat__input-row">
        <input type="text" name="draft" maxlength="2000" class="na-phone-chat__input" autocomplete="off" value="${escapeHtml(this._draft)}" />
        <button type="submit" class="na-phone-chat__send">➤</button>
      </div>
    </form>`;
  }

  /** @returns {string} */
  _renderAdmin() {
    return `<section class="na-phone-chat__admin">
      <h3>${escapeHtml(game.i18n.localize("NA.PhoneChat.AdminTitle"))}</h3>
      <button type="button" data-action="new-contact">${escapeHtml(game.i18n.localize("NA.PhoneChat.NewContact"))}</button>
      <button type="button" data-action="new-conversation">${escapeHtml(game.i18n.localize("NA.PhoneChat.NewConversation"))}</button>
      <button type="button" data-action="global-settings">${escapeHtml(game.i18n.localize("NA.PhoneChat.GlobalSettings"))}</button>
    </section>`;
  }

  /**
   * @param {SubmitEvent} event
   * @returns {Promise<void>}
   */
  async _onSubmit(event) {
    const conversationId = this._activeConversationId;
    if (!conversationId) return;
    const input = event.currentTarget.querySelector("[name='draft']");
    const text = input?.value?.trim();
    if (!text) return;
    const sendAs = this.element.querySelector("[name='sendAs']")?.value ?? "user";
    const contactId = sendAs === "npc"
      ? this._snapshot.conversations[conversationId]?.contactIds?.[0] ?? null
      : null;

    this._status = "pending";
    this.render({ force: true });

    const result = await sendMessage({
      conversationId,
      text,
      senderKind: sendAs === "npc" ? "npc" : "user",
      contactId,
      operationId: generateLogicalId(),
    });

    this._status = result.ok ? "ready" : "error";
    if (result.ok) {
      this._draft = "";
      if (game.user.isGM) {
        this._snapshot = loadState();
        this._revision = this._snapshot.revision;
      }
    } else {
      this._draft = text;
      ui.notifications.warn(result.message);
    }
    this.render({ force: true });
  }

  /**
   * Envia uma resposta rápida como NPC (fluxo exclusivo do GM).
   * @param {string} text
   * @returns {Promise<void>}
   */
  async _sendQuickReply(text) {
    const conversationId = this._activeConversationId;
    if (!conversationId || !game.user.isGM) return;
    const contactId = this._snapshot.conversations[conversationId]?.contactIds?.[0] ?? null;
    if (!contactId) return;
    await sendMessage({ conversationId, text, senderKind: "npc", contactId, operationId: generateLogicalId() });
    this._snapshot = loadState();
    this._revision = this._snapshot.revision;
    this.render({ force: true });
  }

  /**
   * @param {string} action
   * @param {DOMStringMap} dataset
   * @returns {Promise<void>}
   */
  async _onAction(action, dataset = {}) {
    switch (action) {
      case "new-contact":
        await promptContactManager();
        break;
      case "new-conversation":
        await promptConversationManager();
        break;
      case "global-settings":
        await promptGlobalSettings();
        break;
      case "edit-conversation":
        await promptConversationManager(dataset.conversationId);
        break;
      case "archive-conversation": {
        const result = await commit((state) => archiveConversation(state, dataset.conversationId));
        broadcastFullSync("conversation-updated");
        Hooks.callAll("phoneChatStateChanged");
        if (result.code === "CONVERSATION_ARCHIVED") this._activeConversationId = null;
        this._snapshot = loadState();
        this.render({ force: true });
        break;
      }
      case "delete-message": {
        const conversationId = this._activeConversationId;
        if (conversationId && dataset.messageId) {
          await confirmDeleteMessage(conversationId, dataset.messageId);
          if (game.user.isGM) this._snapshot = loadState();
          this.render({ force: true });
        }
        break;
      }
      default:
        break;
    }
  }
}
