/**
 * @fileoverview Store do HUD Telefone/Chat (Specs §3.1).
 *
 * Persistência de snapshot mundial único e versionado em um setting world JSON
 * (fallback confirmado no preflight: `game.world` é pacote, não Document).
 *
 * A parte "reducers" é pura (sem `game`) e testável; a parte "adapter" toca
 * `game.settings` somente no cliente GM. Escrita canônica é sempre do GM.
 */

import { MODULE_ID } from "../constants.mjs";
import {
  LIMITS,
  SCHEMA_VERSION,
  createEmptyState,
  generateLogicalId,
  isValidId,
  isValidWallpaper,
  normalizeMessage,
  normalizeState,
  normalizeText,
  pruneMessages,
  serializedBytes,
  validateParticipants,
} from "./phone-chat-domain.mjs";

export const PHONE_CHAT_STATE_KEY = "phoneChatState";

// ---------------------------------------------------------------------------
// Reducers puros — retornam { state, code, ...extra } sem tocar em `game`.
// ---------------------------------------------------------------------------

/**
 * Anexa mensagem com idempotência por operationId (Specs §6).
 * @param {object} state
 * @param {object} message mensagem normalizada
 * @returns {{ state: object, code: string, message?: object }}
 */
export function appendMessage(state, message) {
  const conversation = state.conversations[message.conversationId];
  if (!conversation) return { state, code: "NOT_FOUND" };
  if (conversation.archived) return { state, code: "ARCHIVED" };

  const existing = conversation.messages.find((m) => m.operationId === message.operationId);
  if (existing) return { state, code: "DUPLICATE_OPERATION", message: existing };

  const nextConversation = {
    ...conversation,
    messages: pruneMessages([...conversation.messages, message], state.settings.historyLimit),
    updatedAt: message.createdAt,
  };
  const unreadByUser = { ...(state.unreadByUser ?? {}) };
  for (const userId of conversation.participantUserIds ?? []) {
    if (userId === message.senderId && message.senderKind === "user") continue;
    unreadByUser[userId] = [...new Set([...(unreadByUser[userId] ?? []), conversation.id])];
  }

  return {
    state: {
      ...state,
      revision: state.revision + 1,
      conversations: { ...state.conversations, [conversation.id]: nextConversation },
      unreadByUser,
    },
    code: "MESSAGE_COMMITTED",
    message,
  };
}

/**
 * Remove uma mensagem confirmada (moderação do GM).
 * @param {object} state
 * @param {string} conversationId
 * @param {string} messageId
 * @returns {{ state: object, code: string }}
 */
export function markRead(state, userId, conversationId, read = true) {
  if (typeof userId !== "string" || !userId || !state.conversations[conversationId]) {
    return { state, code: "NOT_FOUND" };
  }
  const unreadByUser = { ...(state.unreadByUser ?? {}) };
  const current = new Set(unreadByUser[userId] ?? []);
  if (read) current.delete(conversationId);
  else current.add(conversationId);
  unreadByUser[userId] = [...current];
  return {
    state: { ...state, revision: state.revision + 1, unreadByUser },
    code: "UNREAD_UPDATED",
  };
}

export function editMessage(state, conversationId, messageId, text) {
  const conversation = state.conversations[conversationId];
  const normalized = normalizeText(text);
  if (!conversation || !normalized) return { state, code: "INVALID_PAYLOAD" };
  const index = conversation.messages.findIndex((message) => message.id === messageId);
  if (index < 0) return { state, code: "NOT_FOUND" };
  const messages = conversation.messages.slice();
  messages[index] = { ...messages[index], text: normalized, editedAt: Date.now() };
  return {
    state: { ...state, revision: state.revision + 1, conversations: { ...state.conversations, [conversationId]: { ...conversation, messages, updatedAt: Date.now() } } },
    code: "MESSAGE_EDITED",
  };
}

export function deleteMessage(state, conversationId, messageId) {
  const conversation = state.conversations[conversationId];
  if (!conversation) return { state, code: "NOT_FOUND" };
  const messages = conversation.messages.filter((m) => m.id !== messageId);
  if (messages.length === conversation.messages.length) return { state, code: "NOT_FOUND" };

  const nextConversation = { ...conversation, messages, updatedAt: Date.now() };
  return {
    state: {
      ...state,
      revision: state.revision + 1,
      conversations: { ...state.conversations, [conversationId]: nextConversation },
    },
    code: "MESSAGE_DELETED",
  };
}

/**
 * Cria ou atualiza uma conversa (administrativo). Aplica limites normativos.
 * @param {object} state
 * @param {object} raw
 * @returns {{ state: object, code: string, conversation?: object }}
 */
export function upsertConversation(state, raw) {
  const id = isValidId(raw?.id) ? raw.id : generateLogicalId();
  const exists = Boolean(state.conversations[id]);
  if (!exists && Object.keys(state.conversations).length >= LIMITS.conversations) {
    return { state, code: "STORE_LIMIT" };
  }

  const kind = raw?.kind === "group" ? "group" : "direct";
  const participantUserIds = [...new Set((Array.isArray(raw?.participantUserIds) ? raw.participantUserIds : []).filter((v) => typeof v === "string" && v.length > 0))];
  const contactIds = [...new Set((Array.isArray(raw?.contactIds) ? raw.contactIds : []).filter((v) => isValidId(v)))];

  const invalid = validateParticipants(kind, participantUserIds, contactIds);
  if (invalid) return { state, code: invalid };

  const displayName = normalizeText(raw?.displayName, LIMITS.name);
  if (displayName === null) return { state, code: "INVALID_PAYLOAD" };

  const prev = state.conversations[id] ?? { createdAt: Date.now(), messages: [], archived: false };
  const conversation = {
    id,
    kind,
    displayName,
    participantUserIds: participantUserIds.slice(0, LIMITS.participants),
    contactIds: contactIds.slice(0, LIMITS.participants),
    wallpaper: isValidWallpaper(raw?.wallpaper) ? raw?.wallpaper : null,
    archived: raw?.archived === true,
    createdAt: prev.createdAt,
    updatedAt: Date.now(),
    messages: prev.messages ?? [],
  };

  return {
    state: { ...state, revision: state.revision + 1, conversations: { ...state.conversations, [id]: conversation } },
    code: "CONVERSATION_COMMITTED",
    conversation,
  };
}

/**
 * Arquiva uma conversa.
 * @param {object} state
 * @param {string} conversationId
 * @returns {{ state: object, code: string }}
 */
export function archiveConversation(state, conversationId) {
  const conversation = state.conversations[conversationId];
  if (!conversation) return { state, code: "NOT_FOUND" };
  return {
    state: {
      ...state,
      revision: state.revision + 1,
      conversations: { ...state.conversations, [conversationId]: { ...conversation, archived: true, updatedAt: Date.now() } },
    },
    code: "CONVERSATION_ARCHIVED",
  };
}

/**
 * Cria ou atualiza um contato/NPC. Nome único entre contatos ativos.
 * @param {object} state
 * @param {object} raw
 * @returns {{ state: object, code: string, contact?: object }}
 */
export function upsertContact(state, raw) {
  const id = isValidId(raw?.id) ? raw.id : generateLogicalId();
  const exists = Boolean(state.contacts[id]);
  if (!exists && Object.keys(state.contacts).length >= LIMITS.contacts) {
    return { state, code: "STORE_LIMIT" };
  }

  const displayName = normalizeText(raw?.displayName, LIMITS.name);
  if (displayName === null) return { state, code: "INVALID_PAYLOAD" };

  const duplicate = Object.entries(state.contacts).find(
    ([key, contact]) => key !== id && !contact.archived && contact.displayName.toLowerCase() === displayName.toLowerCase(),
  );
  if (duplicate) return { state, code: "INVALID_PAYLOAD" };

  const prev = state.contacts[id] ?? { quickReplies: [], createdAt: Date.now(), archived: false };
  const contact = {
    id,
    kind: "npc",
    displayName,
    avatar: isValidWallpaper(raw?.avatar) ? raw?.avatar : null,
    quickReplies: prev.quickReplies ?? [],
    createdAt: prev.createdAt,
    updatedAt: Date.now(),
    archived: raw?.archived === true,
  };

  return {
    state: { ...state, revision: state.revision + 1, contacts: { ...state.contacts, [id]: contact } },
    code: "CONTACT_COMMITTED",
    contact,
  };
}

/**
 * Arquiva um contato/NPC.
 * @param {object} state
 * @param {string} contactId
 * @returns {{ state: object, code: string }}
 */
export function archiveContact(state, contactId) {
  const contact = state.contacts[contactId];
  if (!contact) return { state, code: "NOT_FOUND" };
  return {
    state: {
      ...state,
      revision: state.revision + 1,
      contacts: { ...state.contacts, [contactId]: { ...contact, archived: true, updatedAt: Date.now() } },
    },
    code: "CONTACT_ARCHIVED",
  };
}

/**
 * Cria ou atualiza uma resposta rápida de um contato.
 * @param {object} state
 * @param {string} contactId
 * @param {object} raw
 * @returns {{ state: object, code: string }}
 */
export function upsertQuickReply(state, contactId, raw) {
  const contact = state.contacts[contactId];
  if (!contact) return { state, code: "NOT_FOUND" };
  const text = normalizeText(raw?.text, LIMITS.quickReply);
  if (text === null) return { state, code: "INVALID_PAYLOAD" };

  const id = isValidId(raw?.id) ? raw.id : generateLogicalId();
  const quickReply = {
    id,
    text,
    enabled: raw?.enabled !== false,
    sortOrder: Number.isFinite(Number(raw?.sortOrder)) ? Math.trunc(Number(raw?.sortOrder)) : 0,
  };
  const quickReplies = [
    ...contact.quickReplies.filter((q) => q.id !== id),
    quickReply,
  ];

  return {
    state: {
      ...state,
      revision: state.revision + 1,
      contacts: { ...state.contacts, [contactId]: { ...contact, quickReplies, updatedAt: Date.now() } },
    },
    code: "QUICK_REPLY_COMMITTED",
  };
}

/**
 * Remove uma resposta rápida.
 * @param {object} state
 * @param {string} contactId
 * @param {string} quickReplyId
 * @returns {{ state: object, code: string }}
 */
export function deleteQuickReply(state, contactId, quickReplyId) {
  const contact = state.contacts[contactId];
  if (!contact) return { state, code: "NOT_FOUND" };
  const quickReplies = contact.quickReplies.filter((q) => q.id !== quickReplyId);
  if (quickReplies.length === contact.quickReplies.length) return { state, code: "NOT_FOUND" };
  return {
    state: {
      ...state,
      revision: state.revision + 1,
      contacts: { ...state.contacts, [contactId]: { ...contact, quickReplies, updatedAt: Date.now() } },
    },
    code: "QUICK_REPLY_DELETED",
  };
}

/**
 * Atualiza as configurações (limite de histórico, wallpaper global, enabled).
 * @param {object} state
 * @param {object} raw
 * @returns {{ state: object, code: string }}
 */
export function updateSettings(state, raw = {}) {
  const historyLimit = Number.isFinite(Number(raw.historyLimit))
    ? Math.max(LIMITS.historyLimitMin, Math.min(LIMITS.historyLimitMax, Math.trunc(Number(raw.historyLimit))))
    : state.settings.historyLimit;
  const settings = {
    enabled: raw?.enabled !== false,
    historyLimit,
    globalWallpaper: isValidWallpaper(raw?.globalWallpaper) ? raw?.globalWallpaper : state.settings.globalWallpaper,
  };

  // Poda todas as conversas após alteração do limite (Specs §6).
  const conversations = {};
  for (const [id, conversation] of Object.entries(state.conversations)) {
    conversations[id] = { ...conversation, messages: pruneMessages(conversation.messages, historyLimit) };
  }

  return {
    state: {
      ...state,
      revision: state.revision + 1,
      settings,
      conversations,
      unreadByUser: state.unreadByUser ?? {},
    },
    code: "SETTINGS_UPDATED",
  };
}

/**
 * Verifica se o snapshot serializado respeita o objetivo de 5 MiB.
 * @param {object} state
 * @returns {boolean}
 */
export function withinTotalBudget(state) {
  return serializedBytes(state) <= LIMITS.totalBytes;
}

// ---------------------------------------------------------------------------
// Adapter — persistência via setting world (somente GM).
// ---------------------------------------------------------------------------

/**
 * Lê o snapshot mundial e o normaliza.
 * @returns {object} estado normalizado.
 */
export function loadState() {
  const raw = game.settings.get(MODULE_ID, PHONE_CHAT_STATE_KEY);
  const { state } = normalizeState(raw);
  return state;
}

/**
 * Persiste o snapshot, carimbando updatedAt.
 * @param {object} nextState
 * @returns {Promise<object>}
 */
export async function persistState(nextState) {
  const state = { ...nextState, schemaVersion: SCHEMA_VERSION, updatedAt: Date.now() };
  await game.settings.set(MODULE_ID, PHONE_CHAT_STATE_KEY, state);
  return state;
}

/**
 * Executa um mutator dentro de uma única transação: lê, aplica, verifica
 * orçamento e persiste (incrementando revision via reducer). Somente GM.
 * @param {(state: object) => { state: object, code: string }} mutator
 * @returns {Promise<{ state: object, code: string }>}
 */
export async function commit(mutator) {
  const before = loadState();
  const result = mutator(before);
  if (!withinTotalBudget(result.state)) {
    return { state: before, code: "STORE_LIMIT" };
  }
  const persisted = await persistState(result.state);
  return { ...result, state: persisted };
}
