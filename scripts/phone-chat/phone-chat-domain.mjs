/**
 * @fileoverview Domínio puro do HUD Telefone/Chat (hud-telefone-chat).
 *
 * Sem DOM, sem socket, sem persistência. Apenas contratos lógicos, limites,
 * normalização, migração, poda e validação de payloads. É a fonte da verdade
 * para o restante do módulo e para os casos CT-001..CT-010.
 *
 * Conformidade: Specs-hud-telefone-chat §2, §3 e §6.
 */

export const SCHEMA_VERSION = 1;

export const LIMITS = Object.freeze({
  message: 2000,
  name: 80,
  id: 64,
  avatar: 512,
  quickReply: 2000,
  participants: 32,
  conversations: 500,
  contacts: 500,
  historyLimitMin: 20,
  historyLimitMax: 500,
  historyLimitDefault: 100,
  payloadBytes: 16384,
  totalBytes: 5 * 1024 * 1024,
});

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

const FORBIDDEN_WALLPAPER = /^(javascript:|data:text\/html|data:image\/svg\+xml[^,]*,.*<|[\s\S]*<\s*(script|img|iframe)\b)/i;

/**
 * Valida um identificador lógico gerado pelo módulo.
 * @param {unknown} id
 * @returns {boolean}
 */
export function isValidId(id) {
  return typeof id === "string" && id.length <= LIMITS.id && ID_PATTERN.test(id);
}

/**
 * Sanitiza/normaliza texto de mensagem. Retorna null quando inválido (vazio
 * após trim, acima do limite ou não string).
 * @param {unknown} text
 * @param {number} [max]
 * @returns {string|null}
 */
export function normalizeText(text, max = LIMITS.message) {
  if (typeof text !== "string") return null;
  const value = text.trim();
  if (value.length === 0) return null;
  if ([...value].length > max) return null;
  return value;
}

/**
 * Valida wallpaper/avatar. Aceita null, string vazia ou caminho/URL sem
 * esquemas executáveis e sem HTML.
 * @param {unknown} value
 * @returns {boolean}
 */
export function isValidWallpaper(value) {
  if (value === null || value === undefined || value === "") return true;
  if (typeof value !== "string") return false;
  if ([...value].length > LIMITS.avatar) return false;
  if (FORBIDDEN_WALLPAPER.test(value)) return false;
  return true;
}

/**
 * Gera um ID lógico seguro. Prioriza o helper do Foundry, com fallback local
 * para uso puro (testes e validação fora do client).
 * @returns {string}
 */
export function generateId() {
  if (typeof foundry !== "undefined" && typeof foundry.utils?.randomID === "function") {
    return foundry.utils.randomID();
  }
  const bytes = new Uint8Array(12);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Gera um ID compatível com o padrão [A-Za-z0-9_-], usando o generateId como
 * base e forçando o conjunto permitido.
 * @returns {string}
 */
export function generateLogicalId() {
  return generateId().replace(/[^A-Za-z0-9_-]/g, "X");
}

/**
 * Cria o estado vazio normalizado (schema 1).
 * @returns {object}
 */
export function createEmptyState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    revision: 0,
    updatedAt: 0,
    settings: {
      enabled: true,
      historyLimit: LIMITS.historyLimitDefault,
      globalWallpaper: null,
    },
    contacts: {},
    conversations: {},
    unreadByUser: {},
  };
}

function normalizeSettings(raw) {
  const settings = raw && typeof raw === "object" ? raw : {};
  const historyLimit = Number.isFinite(Number(settings.historyLimit))
    ? Math.trunc(Number(settings.historyLimit))
    : LIMITS.historyLimitDefault;
  return {
    enabled: settings.enabled !== false,
    historyLimit: Math.max(LIMITS.historyLimitMin, Math.min(LIMITS.historyLimitMax, historyLimit)),
    globalWallpaper: isValidWallpaper(settings.globalWallpaper) ? settings.globalWallpaper : null,
  };
}

function normalizeQuickReply(raw) {
  if (!raw || typeof raw !== "object") return null;
  const text = normalizeText(raw.text, LIMITS.quickReply);
  if (text === null) return null;
  return {
    id: isValidId(raw.id) ? raw.id : null,
    text,
    enabled: raw.enabled !== false,
    sortOrder: Number.isFinite(Number(raw.sortOrder)) ? Math.trunc(Number(raw.sortOrder)) : 0,
  };
}

function normalizeContact(raw) {
  if (!raw || typeof raw !== "object") return null;
  const displayName = normalizeText(raw.displayName, LIMITS.name);
  if (displayName === null || !isValidId(raw.id)) return null;
  const quickReplies = Array.isArray(raw.quickReplies)
    ? raw.quickReplies.map(normalizeQuickReply).filter((quick) => quick && quick.id && quick.text)
    : [];
  return {
    id: raw.id,
    kind: raw.kind === "npc" ? "npc" : "npc",
    displayName,
    avatar: isValidWallpaper(raw.avatar) ? raw.avatar : null,
    quickReplies,
    createdAt: Math.max(0, Math.trunc(Number(raw.createdAt) || 0)),
    updatedAt: Math.max(0, Math.trunc(Number(raw.updatedAt) || 0)),
    archived: raw.archived === true,
  };
}

function normalizeMessage(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (!isValidId(raw.id) || !isValidId(raw.conversationId) || !isValidId(raw.operationId)) return null;
  if (raw.senderKind !== "user" && raw.senderKind !== "npc") return null;
  const text = normalizeText(raw.text, LIMITS.message);
  if (text === null) return null;
  if (typeof raw.senderId !== "string" || raw.senderId.length === 0) return null;
  return {
    id: raw.id,
    operationId: raw.operationId,
    conversationId: raw.conversationId,
    senderKind: raw.senderKind,
    senderId: raw.senderId,
    representedByUserId: typeof raw.representedByUserId === "string" ? raw.representedByUserId : null,
    text,
    createdAt: Math.max(0, Math.trunc(Number(raw.createdAt) || 0)),
    status: raw.status === "pending" ? "pending" : "confirmed",
  };
}

function pruneMessages(messages, historyLimit) {
  return [...messages]
    .sort((a, b) => (a.createdAt - b.createdAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .slice(Math.max(0, messages.length - historyLimit));
}

function normalizeConversation(raw, historyLimit) {
  if (!raw || typeof raw !== "object") return null;
  if (!isValidId(raw.id)) return null;
  if (raw.kind !== "direct" && raw.kind !== "group") return null;
  const displayName = normalizeText(raw.displayName, LIMITS.name);
  const participantUserIds = Array.isArray(raw.participantUserIds)
    ? [...new Set(raw.participantUserIds.filter((id) => typeof id === "string" && id.length > 0))].slice(0, LIMITS.participants)
    : [];
  const contactIds = Array.isArray(raw.contactIds)
    ? [...new Set(raw.contactIds.filter((id) => isValidId(id)))].slice(0, LIMITS.participants)
    : [];
  const messages = Array.isArray(raw.messages)
    ? raw.messages.map(normalizeMessage).filter((message) => message && message.conversationId === raw.id)
    : [];
  return {
    id: raw.id,
    kind: raw.kind,
    displayName: displayName ?? raw.displayName ?? "",
    participantUserIds,
    contactIds,
    wallpaper: isValidWallpaper(raw.wallpaper) ? raw.wallpaper : null,
    archived: raw.archived === true,
    gmNotes: typeof raw.gmNotes === "string" ? raw.gmNotes.slice(0, 5000) : "",
    createdAt: Math.max(0, Math.trunc(Number(raw.createdAt) || 0)),
    updatedAt: Math.max(0, Math.trunc(Number(raw.updatedAt) || 0)),
    messages: pruneMessages(messages, historyLimit),
  };
}

/**
 * Normaliza um snapshot arbitrário para o schema lógico 1, removendo campos
 * desconhecidos e aplicando poda. Lança erro codificado `SCHEMA_UNSUPPORTED`
 * quando o schema de entrada é maior que o suportado.
 * @param {unknown} raw
 * @returns {{ state: object, migrated: boolean }}
 */
export function normalizeState(raw) {
  if (raw === null || raw === undefined) return { state: createEmptyState(), migrated: false };
  if (typeof raw !== "object") return { state: createEmptyState(), migrated: false };

  const schemaVersion = Number.isFinite(Number(raw.schemaVersion)) ? Math.trunc(Number(raw.schemaVersion)) : 0;
  if (schemaVersion > SCHEMA_VERSION) {
    const error = new Error("Snapshot com schema não suportado.");
    error.code = "SCHEMA_UNSUPPORTED";
    throw error;
  }

  const settings = normalizeSettings(raw.settings);
  const historyLimit = settings.historyLimit;

  const contactsRaw = raw.contacts && typeof raw.contacts === "object" ? raw.contacts : {};
  const contacts = {};
  for (const [key, value] of Object.entries(contactsRaw)) {
    const contact = normalizeContact(value);
    if (contact) contacts[key] = contact;
  }

  const conversationsRaw = raw.conversations && typeof raw.conversations === "object" ? raw.conversations : {};
  const conversations = {};
  for (const [key, value] of Object.entries(conversationsRaw)) {
    const conversation = normalizeConversation(value, historyLimit);
    if (conversation) conversations[key] = conversation;
  }

  const revision = Math.max(0, Math.trunc(Number(raw.revision) || 0));
  const unreadByUser = {};
  if (raw.unreadByUser && typeof raw.unreadByUser === "object") {
    for (const [userId, conversationIds] of Object.entries(raw.unreadByUser)) {
      if (typeof userId !== "string" || !Array.isArray(conversationIds)) continue;
      unreadByUser[userId] = [...new Set(conversationIds.filter((id) => isValidId(id)))];
    }
  }

  return {
    state: {
      schemaVersion: SCHEMA_VERSION,
      revision,
      updatedAt: Math.max(0, Math.trunc(Number(raw.updatedAt) || 0)),
      settings,
      contacts,
      conversations,
      unreadByUser,
    },
    migrated: schemaVersion < SCHEMA_VERSION,
  };
}

/**
 * Mede o tamanho serializado de um objeto em bytes (UTF-8).
 * @param {unknown} value
 * @returns {number}
 */
export function serializedBytes(value) {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).length;
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

/**
 * Verifica se o payload serializado respeita o limite normativo.
 * @param {unknown} value
 * @returns {boolean}
 */
export function payloadWithinLimit(value) {
  return serializedBytes(value) <= LIMITS.payloadBytes;
}

/**
 * Gera um ID de operação válido (idempotência de escrita).
 * @returns {string}
 */
export function generateOperationId() {
  return generateLogicalId();
}

/**
 * Escapa texto para inserção segura em HTML (textContent/manual).
 * @param {unknown} value
 * @returns {string}
 */
export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/**
 * Valida a cardinalidade de participantes de uma conversa (Specs §2.1).
 * Uma conversa direta exige exatamente dois totais; um grupo exige pelo menos
 * dois e no máximo LIMITS.participants.
 * @param {"direct"|"group"} kind
 * @param {string[]} participantUserIds
 * @param {string[]} contactIds
 * @returns {string|null} código de erro ou null se válido.
 */
export function validateParticipants(kind, participantUserIds, contactIds) {
  const users = Array.isArray(participantUserIds) ? [...new Set(participantUserIds)] : [];
  const contacts = Array.isArray(contactIds) ? [...new Set(contactIds)] : [];
  const total = users.length + contacts.length;
  if (total > LIMITS.participants) return "INVALID_PAYLOAD";
  if (total < 2) return "INVALID_PAYLOAD";
  if (kind === "direct" && total !== 2) return "INVALID_PAYLOAD";
  return null;
}

export { normalizeMessage, normalizeContact, normalizeConversation, pruneMessages, normalizeQuickReply };
