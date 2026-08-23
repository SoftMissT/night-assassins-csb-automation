/**
 * @fileoverview Relay de socket do HUD Telefone/Chat (Specs §4, §5, §8).
 *
 * O GM é a autoridade de escrita. Todo request/response/sync trafega pelo canal
 * nativo `module.${MODULE_ID}` já declarado no manifesto. A parte pura
 * (applyMessage, buildFilteredSnapshot, electPrimaryGm) é testável sem socket.
 */

import { MODULE_ID } from "../constants.mjs";
import { SCHEMA_VERSION, generateLogicalId, isValidId, normalizeText } from "./phone-chat-domain.mjs";
import { canSendAsNpc, canSendAsUser } from "./phone-chat-permissions.mjs";
import {
  PHONE_CHAT_STATE_KEY,
  appendMessage,
  commit,
  deleteMessage,
  loadState,
  updateSettings,
  upsertContact,
  upsertConversation,
  archiveContact,
  archiveConversation,
  upsertQuickReply,
  deleteQuickReply,
  markRead as markReadState,
  editMessage as editMessageState,
} from "./phone-chat-store.mjs";

export const PHONE_CHAT_SOCKET = `module.${MODULE_ID}`;
export const PHONE_CHAT_TIMEOUT_MS = 60000;

export const PHONE_CHAT_TYPES = Object.freeze({
  MESSAGE_REQUEST: "phone-chat-message-request",
  ADMIN_REQUEST: "phone-chat-admin-request",
  SYNC_REQUEST: "phone-chat-sync-request",
  READ_REQUEST: "phone-chat-read-request",
  RESPONSE: "phone-chat-response",
  SYNC: "phone-chat-sync",
});

const pendingRequests = new Map();

let syncSubscriber = null;

/**
 * Registra o callback que recebe eventos `phone-chat-sync` direcionados ao
 * usuário atual. A Application usa isso para atualizar a visão sem polling.
 * @param {(message: object) => void} callback
 * @returns {void}
 */
export function subscribeSync(callback) {
  syncSubscriber = callback;
}

// ---------------------------------------------------------------------------
// Parte pura — testável sem game/socket.
// ---------------------------------------------------------------------------

/**
 * Eleição determinística do GM primário (menor id lexicográfico).
 * @param {Array<{id: string, active: boolean, isGM: boolean}>} users
 * @returns {{id: string}|null}
 */
export function electPrimaryGm(users) {
  const active = (users ?? [])
    .filter((user) => user.active && user.isGM)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return active[0] ?? null;
}

/**
 * Aplica uma mensagem de entrada com autorização e idempotência.
 * @param {object} state
 * @param {object} params
 * @returns {{ state: object, code: string, message?: object }}
 */
export function applyMessage(state, params) {
  const { conversationId, senderKind, contactId, requester, text, operationId, now, createdAt = now } = params;
  if (!isValidId(operationId)) return { state, code: "INVALID_PAYLOAD" };

  const conversation = state.conversations[conversationId];
  if (!conversation) return { state, code: "NOT_FOUND" };
  if (conversation.archived) return { state, code: "ARCHIVED" };

  let senderId;
  let representedByUserId = null;
  if (senderKind === "user") {
    if (!canSendAsUser(requester, conversation)) return { state, code: "FORBIDDEN" };
    senderId = requester.id;
  } else if (senderKind === "npc") {
    if (!canSendAsNpc(requester, conversation, contactId)) return { state, code: "FORBIDDEN" };
    senderId = contactId;
    representedByUserId = requester.id;
  } else {
    return { state, code: "INVALID_PAYLOAD" };
  }

  const normalized = normalizeText(text);
  if (normalized === null) return { state, code: "INVALID_PAYLOAD" };

  const message = {
    id: generateLogicalId(),
    operationId,
    conversationId,
    senderKind,
    senderId,
    representedByUserId,
    text: normalized,
    createdAt,
    status: "confirmed",
  };

  return appendMessage(state, message);
}

/**
 * Monta um snapshot filtrado para um usuário (Specs §4.3/§4.5). O GM recebe o
 * estado completo; jogadores recebem apenas conversas de que participam e os
 * contatos usados por essas conversas.
 * @param {object} state
 * @param {string} userId
 * @param {boolean} isGM
 * @returns {{ conversations: object, contacts: object }}
 */
export function buildFilteredSnapshot(state, userId, isGM) {
  if (isGM) return { conversations: state.conversations, contacts: state.contacts, unreadByUser: state.unreadByUser ?? {} };

  const conversations = {};
  const allowedContactIds = new Set();
  for (const [id, conversation] of Object.entries(state.conversations)) {
    if (conversation.participantUserIds.includes(userId)) {
      conversations[id] = conversation;
      for (const contactId of conversation.contactIds) allowedContactIds.add(contactId);
    }
  }

  const contacts = {};
  for (const contactId of allowedContactIds) {
    if (state.contacts[contactId]) contacts[contactId] = state.contacts[contactId];
  }

  return { conversations, contacts, unreadByUser: { [userId]: state.unreadByUser?.[userId] ?? [] } };
}

/**
 * Calcula os recipientIds de um sync (participantes + GMs).
 * @param {object} conversation
 * @param {Array<{id: string, isGM: boolean}>} users
 * @returns {string[]}
 */
export function syncRecipients(conversation, users) {
  const ids = new Set(conversation.participantUserIds);
  for (const user of users ?? []) {
    if (user.isGM) ids.add(user.id);
  }
  return [...ids];
}

// ---------------------------------------------------------------------------
// Adapter — socket e persistência.
// ---------------------------------------------------------------------------

function emit(message) {
  game.socket.emit(PHONE_CHAT_SOCKET, message);
}

function codeToMessage(code) {
  const messages = {
    MESSAGE_COMMITTED: "Mensagem enviada.",
    CONVERSATION_COMMITTED: "Conversa atualizada.",
    CONVERSATION_ARCHIVED: "Conversa arquivada.",
    CONTACT_COMMITTED: "Contato atualizado.",
    CONTACT_ARCHIVED: "Contato arquivado.",
    QUICK_REPLY_COMMITTED: "Resposta rápida atualizada.",
    QUICK_REPLY_DELETED: "Resposta rápida removida.",
    MESSAGE_DELETED: "Mensagem removida.",
    SETTINGS_UPDATED: "Configurações atualizadas.",
    UNREAD_UPDATED: "Leitura atualizada.",
    FORBIDDEN: "Você não tem permissão para esta ação.",
    INVALID_PAYLOAD: "Conteúdo inválido.",
    NOT_FOUND: "Recurso não encontrado.",
    ARCHIVED: "A conversa está arquivada.",
    NO_GM: "Nenhum GM ativo no momento.",
    TIMEOUT: "O GM não respondeu a tempo.",
    SCHEMA_UNSUPPORTED: "Versão de dados incompatível.",
    STORE_LIMIT: "Limite de armazenamento atingido.",
    DUPLICATE_OPERATION: "Operação já processada.",
  };
  return messages[code] ?? "Erro desconhecido.";
}

function respond(recipientId, requestId, operationId, code, extra = {}) {
  emit({
    type: PHONE_CHAT_TYPES.RESPONSE,
    recipientId,
    requestId,
    operationId,
    ok: code === "MESSAGE_COMMITTED" || code === "CONVERSATION_COMMITTED" || code === "CONVERSATION_ARCHIVED"
      || code === "CONTACT_COMMITTED" || code === "CONTACT_ARCHIVED" || code === "QUICK_REPLY_COMMITTED"
      || code === "QUICK_REPLY_DELETED" || code === "MESSAGE_DELETED" || code === "SETTINGS_UPDATED"
      || code === "UNREAD_UPDATED",
    code,
    message: codeToMessage(code),
    ...extra,
  });
}

function emitSync(recipientIds, revision, reason, changes) {
  emit({
    type: PHONE_CHAT_TYPES.SYNC,
    recipientIds,
    revision,
    schemaVersion: SCHEMA_VERSION,
    reason,
    changes,
  });
}

function currentUsers() {
  return game.users?.contents ?? game.users ?? [];
}

/**
 * Processa um pedido de mensagem no cliente GM.
 * @param {object} message
 * @returns {Promise<void>}
 */
export async function handleMessageRequest(message) {
  if (!game.user.isGM || message.gmId !== game.user.id) return;

  if (Number(message.clientSchemaVersion) > SCHEMA_VERSION) {
    respond(message.requesterId, message.requestId, message.operationId, "SCHEMA_UNSUPPORTED");
    return;
  }

  const requester = game.users.get(message.requesterId);
  if (!requester) {
    respond(message.requesterId, message.requestId, message.operationId, "NOT_FOUND");
    return;
  }

  const conversation = loadState().conversations[message.conversationId];
  if (!conversation) {
    respond(message.requesterId, message.requestId, message.operationId, "NOT_FOUND");
    return;
  }

  // Anti-spoof: senderId para "user" é sempre derivado do requester.
  const senderKind = message.senderKind === "npc" ? "npc" : "user";
  const contactId = senderKind === "npc" ? message.senderId : null;

  const result = await commit((state) =>
    applyMessage(state, {
      conversationId: message.conversationId,
      senderKind,
      contactId,
      requester,
      text: message.text,
      operationId: message.operationId,
      now: Date.now(),
    }),
  );

  if (result.code === "MESSAGE_COMMITTED") {
    const recipients = syncRecipients(conversation, currentUsers());
    emitSync(recipients, result.state.revision, "message-created", {
      conversations: { [conversation.id]: result.state.conversations[conversation.id] },
      contacts: {},
      removedConversationIds: [],
      removedMessageIds: [],
    });
  }

  respond(message.requesterId, message.requestId, message.operationId, result.code);
}

const ADMIN_ACTIONS = Object.freeze({
  "conversation-upsert": (state, payload) => upsertConversation(state, payload),
  "conversation-archive": (state, payload) => archiveConversation(state, payload.conversationId),
  "contact-upsert": (state, payload) => upsertContact(state, payload),
  "contact-archive": (state, payload) => archiveContact(state, payload.contactId),
  "quick-reply-upsert": (state, payload) => upsertQuickReply(state, payload.contactId, payload),
  "quick-reply-delete": (state, payload) => deleteQuickReply(state, payload.contactId, payload.quickReplyId),
  "message-delete": (state, payload) => deleteMessage(state, payload.conversationId, payload.messageId),
  "settings-update": (state, payload) => updateSettings(state, payload),
});

/**
 * Processa um pedido administrativo no cliente GM.
 * @param {object} message
 * @returns {Promise<void>}
 */
export async function handleAdminRequest(message) {
  if (!game.user.isGM) return;
  if (message.requesterId !== game.user.id) {
    respond(message.requesterId, message.requestId, message.operationId, "FORBIDDEN");
    return;
  }
  if (Number(message.clientSchemaVersion) > SCHEMA_VERSION) {
    respond(message.requesterId, message.requestId, message.operationId, "SCHEMA_UNSUPPORTED");
    return;
  }

  const handler = ADMIN_ACTIONS[message.action];
  if (!handler) {
    respond(message.requesterId, message.requestId, message.operationId, "INVALID_PAYLOAD");
    return;
  }

  const result = await commit((state) => handler(state, message.payload ?? {}));

  if (result.code === "SETTINGS_UPDATED") {
    const users = currentUsers().map((u) => u.id);
    emitSync(users, result.state.revision, "settings-updated", {
      conversations: {},
      contacts: {},
      removedConversationIds: [],
      removedMessageIds: [],
      settings: result.state.settings,
    });
  }

  respond(message.requesterId, message.requestId, message.operationId, result.code);
}

/**
 * Processa um pedido de sync no cliente GM, devolvendo somente o filtrado.
 * @param {object} message
 * @returns {Promise<void>}
 */
export async function handleReadRequest(message) {
  if (!game.user.isGM || message.gmId !== game.user.id) return;
  const result = await commit((state) => markReadState(state, message.requesterId, message.conversationId, message.read !== false));
  respond(message.requesterId, message.requestId, message.operationId, result.code);
  if (result.code === "UNREAD_UPDATED") {
    const snapshot = buildFilteredSnapshot(result.state, message.requesterId, false);
    emitSync([message.requesterId], result.state.revision, "read-updated", {
      conversations: snapshot.conversations,
      contacts: snapshot.contacts,
      unreadByUser: { [message.requesterId]: result.state.unreadByUser[message.requesterId] ?? [] },
      removedConversationIds: [],
      removedMessageIds: [],
    });
  }
}

export async function handleSyncRequest(message) {
  if (!game.user.isGM || message.gmId !== game.user.id) return;
  const requester = game.users.get(message.requesterId);
  if (!requester) return;

  const state = loadState();
  const snapshot = buildFilteredSnapshot(state, requester.id, requester.isGM);

  emitSync([requester.id], state.revision, "sync-request", {
    conversations: snapshot.conversations,
    contacts: snapshot.contacts,
    removedConversationIds: [],
    removedMessageIds: [],
  });
}

/**
 * Entrega um evento de sync ao assinante quando direcionado ao usuário atual.
 * @param {object} message
 * @returns {void}
 */
export function handleSyncEvent(message) {
  if (!Array.isArray(message.recipientIds) || !message.recipientIds.includes(game.user.id)) return;
  if (Number(message.schemaVersion) !== SCHEMA_VERSION) return;
  if (typeof syncSubscriber === "function") syncSubscriber(message);
}

/**
 * Roteia uma mensagem de socket para o handler correto.
 * @param {object} message
 * @returns {void}
 */
export function routeSocketMessage(message = {}) {
  switch (message.type) {
    case PHONE_CHAT_TYPES.MESSAGE_REQUEST:
      void handleMessageRequest(message);
      return;
    case PHONE_CHAT_TYPES.ADMIN_REQUEST:
      void handleAdminRequest(message);
      return;
    case PHONE_CHAT_TYPES.SYNC_REQUEST:
      void handleSyncRequest(message);
      return;
    case PHONE_CHAT_TYPES.READ_REQUEST:
      void handleReadRequest(message);
      return;
    case PHONE_CHAT_TYPES.RESPONSE:
      handleResponse(message);
      return;
    case PHONE_CHAT_TYPES.SYNC:
      handleSyncEvent(message);
      return;
    default:
      return;
  }
}

function handleResponse(message) {
  if (message.recipientId !== game.user.id) return;
  const pending = pendingRequests.get(message.requestId);
  if (!pending) return;
  clearTimeout(pending.timeoutId);
  pendingRequests.delete(message.requestId);
  pending.resolve({ ok: message.ok, code: message.code, message: message.message });
}

function requestWithTimeout(emitFn) {
  return new Promise((resolve) => {
    const requestId = typeof foundry !== "undefined" && foundry.utils?.randomID
      ? foundry.utils.randomID()
      : generateLogicalId();
    const timeoutId = setTimeout(() => {
      pendingRequests.delete(requestId);
      resolve({ ok: false, code: "TIMEOUT", message: codeToMessage("TIMEOUT") });
    }, PHONE_CHAT_TIMEOUT_MS);
    pendingRequests.set(requestId, { resolve, timeoutId });
    emitFn(requestId);
  });
}

function activePrimaryGm() {
  return electPrimaryGm(currentUsers().map((user) => ({ id: user.id, active: user.active, isGM: user.isGM })));
}

/**
 * Envia uma mensagem pelo fluxo autoritativo (jogador) ou local (GM).
 * @param {{conversationId: string, text: string, senderKind?: "user"|"npc", contactId?: string|null, operationId?: string|null}} params
 * @returns {Promise<{ok: boolean, code: string, message: string}>}
 */
export async function sendMessage(params) {
  const { conversationId, text, senderKind = "user", contactId = null } = params;

  if (game.user.isGM) {
    const conversation = loadState().conversations[conversationId];
    if (!conversation) return { ok: false, code: "NOT_FOUND", message: codeToMessage("NOT_FOUND") };
    const result = await commit((state) =>
      applyMessage(state, {
        conversationId,
        senderKind,
        contactId,
        requester: game.user,
        text,
        operationId: params.operationId ?? generateLogicalId(),
        now: Date.now(),
        createdAt: params.createdAt ?? Date.now(),
      }),
    );
    const recipients = syncRecipients(conversation, currentUsers());
    if (result.code === "MESSAGE_COMMITTED") {
      emitSync(recipients, result.state.revision, "message-created", {
        conversations: { [conversation.id]: result.state.conversations[conversation.id] },
        contacts: {},
        unreadByUser: Object.fromEntries(recipients.map((id) => [id, result.state.unreadByUser?.[id] ?? []])),
        removedConversationIds: [],
        removedMessageIds: [],
      });
    }
    return { ok: result.code === "MESSAGE_COMMITTED", code: result.code, message: codeToMessage(result.code) };
  }

  const gm = activePrimaryGm();
  if (!gm) return { ok: false, code: "NO_GM", message: codeToMessage("NO_GM") };

  const operationId = params.operationId ?? generateLogicalId();
  return requestWithTimeout((requestId) => {
    emit({
      type: PHONE_CHAT_TYPES.MESSAGE_REQUEST,
      requestId,
      operationId,
      requesterId: game.user.id,
      gmId: gm.id,
      clientSchemaVersion: SCHEMA_VERSION,
      conversationId,
      senderKind,
      senderId: contactId ?? game.user.id,
      text,
    });
  });
}

/**
 * Solicita o snapshot filtrado ao GM. O jogador recebe a resposta de forma
 * assíncrona via evento `phone-chat-sync`; o GM lê o estado diretamente.
 * @returns {Promise<{ok: boolean, code: string, message: string}>}
 */
export async function markRead(conversationId, read = true) {
  if (!conversationId) return { ok: false, code: "INVALID_PAYLOAD", message: codeToMessage("INVALID_PAYLOAD") };
  if (game.user.isGM) {
    const result = await commit((state) => markReadState(state, game.user.id, conversationId, read));
    return { ok: result.code === "UNREAD_UPDATED", code: result.code, message: codeToMessage(result.code) };
  }
  const gm = activePrimaryGm();
  if (!gm) return { ok: false, code: "NO_GM", message: codeToMessage("NO_GM") };
  return requestWithTimeout((requestId) => emit({
    type: PHONE_CHAT_TYPES.READ_REQUEST,
    requestId,
    operationId: generateLogicalId(),
    requesterId: game.user.id,
    gmId: gm.id,
    clientSchemaVersion: SCHEMA_VERSION,
    conversationId,
    read,
  }));
}

export async function editMessage(conversationId, messageId, text) {
  if (!game.user.isGM) return { ok: false, code: "FORBIDDEN", message: codeToMessage("FORBIDDEN") };
  const result = await commit((state) => editMessageState(state, conversationId, messageId, text));
  if (result.code === "MESSAGE_EDITED") broadcastFullSync("message-edited");
  return { ok: result.code === "MESSAGE_EDITED", code: result.code, message: codeToMessage(result.code) };
}

export async function insertMessage(params) {
  if (!game.user.isGM) return { ok: false, code: "FORBIDDEN", message: codeToMessage("FORBIDDEN") };
  return sendMessage(params);
}

export async function requestSync() {
  if (game.user.isGM) return { ok: true, code: "LOCAL", message: "" };
  const gm = activePrimaryGm();
  if (!gm) return { ok: false, code: "NO_GM", message: codeToMessage("NO_GM") };
  const requestId = typeof foundry !== "undefined" && foundry.utils?.randomID
    ? foundry.utils.randomID()
    : generateLogicalId();
  emit({
    type: PHONE_CHAT_TYPES.SYNC_REQUEST,
    requestId,
    requesterId: game.user.id,
    gmId: gm.id,
    clientSchemaVersion: SCHEMA_VERSION,
    knownRevision: 0,
  });
  return { ok: true, code: "SYNC_REQUESTED", message: "" };
}

/**
 * Distribui o snapshot filtrado para cada usuário ativo não-GM após uma
 * mudança administrativa (Specs §4.5 — nunca vazar conversa alheia).
 * @param {string} reason
 * @returns {{ sent: number, users: number }}
 */
export function broadcastFullSync(reason) {
  if (!game.user.isGM) return { sent: 0, users: 0 };
  const state = loadState();
  const users = currentUsers();
  let sent = 0;
  for (const user of users) {
    if (!user.active || user.isGM) continue;
    const snapshot = buildFilteredSnapshot(state, user.id, false);
    emitSync([user.id], state.revision, reason, {
      conversations: snapshot.conversations,
      contacts: snapshot.contacts,
      unreadByUser: snapshot.unreadByUser,
      removedConversationIds: [],
      removedMessageIds: [],
    });
    sent += 1;
  }
  return { sent, users: users.length };
}

/**
 * Registra o listener de socket do telefone (idempotente por design do Hooks).
 * @returns {void}
 */
export function registerPhoneChatRelay() {
  game.socket.on(PHONE_CHAT_SOCKET, routeSocketMessage);
}

export { PHONE_CHAT_STATE_KEY };
