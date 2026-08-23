import { describe, it } from "node:test";
import assert from "node:assert";

import {
  LIMITS,
  SCHEMA_VERSION,
  createEmptyState,
  escapeHtml,
  generateLogicalId,
  isValidId,
  isValidWallpaper,
  normalizeMessage,
  normalizeState,
  normalizeText,
  pruneMessages,
  validateParticipants,
} from "../scripts/phone-chat/phone-chat-domain.mjs";

import {
  appendMessage,
  deleteMessage,
  editMessage,
  markRead,
  updateSettings,
  upsertContact,
  upsertConversation,
} from "../scripts/phone-chat/phone-chat-store.mjs";

import { canReadConversation, canSendAsNpc, canSendAsUser, isParticipant } from "../scripts/phone-chat/phone-chat-permissions.mjs";

const message = (overrides = {}) => ({
  id: "m-1",
  operationId: "op-1",
  conversationId: "c-1",
  senderKind: "user",
  senderId: "user_001",
  representedByUserId: null,
  text: "Olá",
  createdAt: 1000,
  status: "confirmed",
  ...overrides,
});

const conversation = (overrides = {}) => ({
  id: "c-1",
  kind: "direct",
  displayName: "Conversa",
  participantUserIds: ["user_001", "user_002"],
  contactIds: [],
  wallpaper: null,
  archived: false,
  createdAt: 0,
  updatedAt: 0,
  messages: [],
  ...overrides,
});

describe("phone-chat-domain", () => {
  it("CT-001 normaliza estado vazio para schema 1", () => {
    const { state, migrated } = normalizeState(null);
    assert.strictEqual(state.schemaVersion, SCHEMA_VERSION);
    assert.strictEqual(state.revision, 0);
    assert.deepEqual(state.settings, { enabled: true, historyLimit: 100, globalWallpaper: null });
    assert.deepEqual(state.contacts, {});
    assert.deepEqual(state.conversations, {});
    assert.strictEqual(migrated, false);
  });

  it("CT-002 rejeita mensagem vazia", () => {
    assert.strictEqual(normalizeText("   "), null);
    assert.strictEqual(normalizeText(""), null);
  });

  it("CT-003 rejeita mensagem acima de 2000 caracteres", () => {
    assert.strictEqual(normalizeText("a".repeat(2001)), null);
    assert.strictEqual(normalizeText("a".repeat(2000)).length, 2000);
  });

  it("CT-004 texto com HTML permanece literal (escape no render)", () => {
    const text = "<script>alert(1)</script>";
    const escaped = escapeHtml(text);
    assert.strictEqual(escaped, "&lt;script&gt;alert(1)&lt;/script&gt;");
    assert.doesNotMatch(escaped, /<script>/);
    assert.strictEqual(normalizeText(text), text);
  });

  it("CT-005 poda mantém as N mensagens mais recentes", () => {
    const messages = [
      message({ id: "a", createdAt: 1 }),
      message({ id: "b", createdAt: 3 }),
      message({ id: "c", createdAt: 2 }),
      message({ id: "d", createdAt: 4 }),
    ];
    const pruned = pruneMessages(messages, 3);
    assert.deepEqual(pruned.map((m) => m.id), ["c", "b", "d"]);
  });

  it("CT-006 operação repetida é idempotente e não duplica", () => {
    const base = normalizeState({ conversations: { "c-1": conversation() } }).state;
    const first = appendMessage(base, message());
    assert.strictEqual(first.code, "MESSAGE_COMMITTED");
    assert.strictEqual(first.state.conversations["c-1"].messages.length, 1);

    const second = appendMessage(first.state, message());
    assert.strictEqual(second.code, "DUPLICATE_OPERATION");
    assert.strictEqual(second.state, first.state);
    assert.strictEqual(second.state.conversations["c-1"].messages.length, 1);
  });

  it("CT-007 schema maior que suportado lança SCHEMA_UNSUPPORTED", () => {
    assert.throws(() => normalizeState({ schemaVersion: 99 }), (error) => error.code === "SCHEMA_UNSUPPORTED");
  });

  it("CT-008 migra schema 0 preservando mensagens válidas", () => {
    const raw = {
      schemaVersion: 0,
      contacts: { "contact-1": { id: "contact-1", displayName: "NPC", kind: "npc" } },
      conversations: {
        "c-1": conversation({ messages: [message({ text: "válida" })] }),
      },
    };
    const { state, migrated } = normalizeState(raw);
    assert.strictEqual(migrated, true);
    assert.strictEqual(state.schemaVersion, SCHEMA_VERSION);
    assert.strictEqual(state.conversations["c-1"].messages.length, 1);
    assert.strictEqual(state.contacts["contact-1"].displayName, "NPC");
  });

  it("CT-009 rejeita 33º participante", () => {
    const users = Array.from({ length: 33 }, (_, i) => `user_${i}`);
    assert.strictEqual(validateParticipants("group", users, []), "INVALID_PAYLOAD");
    assert.strictEqual(validateParticipants("group", users.slice(0, 32), []), null);
    assert.strictEqual(validateParticipants("direct", ["a", "b", "c"], []), "INVALID_PAYLOAD");
  });

  it("CT-010 rejeita wallpaper proibido", () => {
    assert.strictEqual(isValidWallpaper("javascript:alert(1)"), false);
    assert.strictEqual(isValidWallpaper("data:text/html,<b>x</b>"), false);
    assert.strictEqual(isValidWallpaper("<img src=x>"), false);
    assert.strictEqual(isValidWallpaper("icons/svg/mystery-man.svg"), true);
    assert.strictEqual(isValidWallpaper(null), true);
  });

  it("IDs lógicos seguem o padrão [A-Za-z0-9_-]", () => {
    for (let i = 0; i < 50; i++) {
      assert.match(generateLogicalId(), /^[A-Za-z0-9_-]{1,64}$/);
    }
    assert.ok(isValidId("abc-123_X"));
    assert.strictEqual(isValidId("bad id!"), false);
  });
});

describe("phone-chat-store reducers", () => {
  it("atualiza limite e poda todas as conversas (clamp mínimo 20)", () => {
    const messages = Array.from({ length: 25 }, (_, i) => message({ id: `m${i}`, operationId: `op${i}`, createdAt: i }));
    const base = normalizeState({
      conversations: { "c-1": conversation({ messages }) },
    }).state;
    const result = updateSettings(base, { historyLimit: 20 });
    assert.strictEqual(result.code, "SETTINGS_UPDATED");
    assert.strictEqual(result.state.conversations["c-1"].messages.length, 20);
    assert.deepEqual(result.state.conversations["c-1"].messages.map((m) => m.id), messages.slice(5).map((m) => m.id));
    assert.strictEqual(result.state.revision, base.revision + 1);
    assert.strictEqual(result.state.settings.historyLimit, 20);
  });

  it("historyLimit abaixo do mínimo é clampado para 20", () => {
    const base = createEmptyState();
    const result = updateSettings(base, { historyLimit: 1 });
    assert.strictEqual(result.state.settings.historyLimit, 20);
  });

  it("rejeita conversa acima do limite de 500", () => {
    const conversations = {};
    for (let i = 0; i < LIMITS.conversations; i++) {
      conversations[`c-${i}`] = conversation({ id: `c-${i}`, participantUserIds: [`u_${i}`, "gm"] });
    }
    const base = normalizeState({ conversations }).state;
    const result = upsertConversation(base, { kind: "direct", displayName: "Extra", participantUserIds: ["x", "gm"] });
    assert.strictEqual(result.code, "STORE_LIMIT");
  });

  it("mensagem nova marca unread e markRead limpa por usuário", () => {
    const base = normalizeState({ conversations: { "c-1": conversation() } }).state;
    const committed = appendMessage(base, message());
    assert.deepEqual(committed.state.unreadByUser.user_002, ["c-1"]);
    const read = markRead(committed.state, "user_002", "c-1", true);
    assert.deepEqual(read.state.unreadByUser.user_002, []);
    const unread = markRead(read.state, "user_002", "c-1", false);
    assert.deepEqual(unread.state.unreadByUser.user_002, ["c-1"]);
  });

  it("GM pode editar texto de mensagem sem alterar o ID", () => {
    const base = normalizeState({ conversations: { "c-1": conversation({ messages: [message()] }) } }).state;
    const result = editMessage(base, "c-1", "m-1", "Texto corrigido");
    assert.strictEqual(result.code, "MESSAGE_EDITED");
    assert.strictEqual(result.state.conversations["c-1"].messages[0].id, "m-1");
    assert.strictEqual(result.state.conversations["c-1"].messages[0].text, "Texto corrigido");
  });

  it("moderação remove mensagem sem apagar o restante", () => {
    const base = normalizeState({
      conversations: { "c-1": conversation({ messages: [message({ id: "a" }), message({ id: "b", operationId: "op-b" })] }) },
    }).state;
    const result = deleteMessage(base, "c-1", "a");
    assert.strictEqual(result.code, "MESSAGE_DELETED");
    assert.deepEqual(result.state.conversations["c-1"].messages.map((m) => m.id), ["b"]);
  });

  it("contato exige nome único entre ativos", () => {
    const base = normalizeState({ contacts: { "npc-1": { id: "npc-1", displayName: "Muzan", kind: "npc" } } }).state;
    const dup = upsertContact(base, { displayName: "MUZAN" });
    assert.strictEqual(dup.code, "INVALID_PAYLOAD");
    const ok = upsertContact(base, { displayName: "Kokushibo" });
    assert.strictEqual(ok.code, "CONTACT_COMMITTED");
  });
});

describe("phone-chat-permissions", () => {
  const user = (id, isGM = false) => ({ id, isGM });
  const conv = conversation({ participantUserIds: ["player_1", "gm_user"] });

  it("participante lê; não participante não", () => {
    assert.ok(canReadConversation(user("player_1"), conv));
    assert.ok(canReadConversation(user("gm_user", true), conv));
    assert.strictEqual(canReadConversation(user("intruso"), conv), false);
    assert.strictEqual(isParticipant("player_1", conv), true);
    assert.strictEqual(isParticipant("intruso", conv), false);
  });

  it("jogador não envia como NPC; GM sim quando controla contato", () => {
    const withNpc = conversation({ contactIds: ["npc-1"] });
    assert.strictEqual(canSendAsNpc(user("player_1"), withNpc, "npc-1"), false);
    assert.ok(canSendAsNpc(user("gm_user", true), withNpc, "npc-1"));
    assert.strictEqual(canSendAsNpc(user("gm_user", true), withNpc, "npc-2"), false);
  });

  it("conversa arquivada bloqueia envio", () => {
    const archived = conversation({ archived: true });
    assert.strictEqual(canSendAsUser(user("player_1"), archived), false);
    assert.strictEqual(canSendAsUser(user("gm_user", true), archived), false);
  });

  it("createEmptyState é idempotente e isolado", () => {
    const a = createEmptyState();
    const b = createEmptyState();
    assert.notStrictEqual(a, b);
    assert.deepEqual(a, b);
    assert.deepEqual(LIMITS, {
      message: 2000, name: 80, id: 64, avatar: 512, quickReply: 2000,
      participants: 32, conversations: 500, contacts: 500,
      historyLimitMin: 20, historyLimitMax: 500, historyLimitDefault: 100,
      payloadBytes: 16384, totalBytes: 5 * 1024 * 1024,
    });
  });

  it("normalizeMessage exige remetente válido e texto", () => {
    assert.strictEqual(normalizeMessage({ id: "m", operationId: "o", conversationId: "c", senderKind: "user", senderId: "", text: "x", createdAt: 1 }), null);
    assert.strictEqual(normalizeMessage({ id: "m", operationId: "o", conversationId: "c", senderKind: "npc", senderId: "s", text: "", createdAt: 1 }), null);
    assert.ok(normalizeMessage(message()));
  });
});
