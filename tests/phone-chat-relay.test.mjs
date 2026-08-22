import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";

import {
  PHONE_CHAT_SOCKET,
  PHONE_CHAT_TYPES,
  PHONE_CHAT_TIMEOUT_MS,
  applyMessage,
  buildFilteredSnapshot,
  electPrimaryGm,
  handleMessageRequest,
  routeSocketMessage,
  sendMessage,
  syncRecipients,
} from "../scripts/phone-chat/phone-chat-relay.mjs";

import { createEmptyState, normalizeState } from "../scripts/phone-chat/phone-chat-domain.mjs";
import { upsertConversation, upsertContact } from "../scripts/phone-chat/phone-chat-store.mjs";

const user = (id, isGM = false, active = true) => ({ id, isGM, active });

const baseState = () => {
  let state = createEmptyState();
  state = upsertContact(state, { id: "npc-1", displayName: "Muzan" }).state;
  state = upsertConversation(state, {
    id: "c-1",
    kind: "group",
    displayName: "Covil",
    participantUserIds: ["player_1", "player_2"],
    contactIds: ["npc-1"],
  }).state;
  return state;
};

function mockGame({ user = {}, users = [], socket = null } = {}) {
  const emitted = [];
  const settingsStore = {};
  globalThis.game = {
    user,
    users: {
      get: (id) => users.find((u) => u.id === id) ?? null,
      contents: users,
    },
    socket: socket ?? {
      emit: (name, data) => emitted.push({ name, data }),
      on: () => {},
    },
    settings: {
      get: (moduleId, key) => settingsStore[key] ?? null,
      set: async (moduleId, key, value) => { settingsStore[key] = value; },
    },
  };
  return { emitted, settingsStore };
}

function seedState(value) {
  const settingsStore = {};
  settingsStore["phoneChatState"] = value;
  globalThis.game.settings.get = (moduleId, key) => settingsStore[key] ?? null;
  return settingsStore;
}

describe("phone-chat-relay puro", () => {
  it("CT-011 participante envia como usuário e a mensagem é persistida", () => {
    const state = baseState();
    const result = applyMessage(state, {
      conversationId: "c-1",
      senderKind: "user",
      contactId: null,
      requester: user("player_1"),
      text: "Olá",
      operationId: "op-1",
      now: 1000,
    });
    assert.strictEqual(result.code, "MESSAGE_COMMITTED");
    assert.strictEqual(result.state.revision, state.revision + 1);
    assert.strictEqual(result.message.senderKind, "user");
    assert.strictEqual(result.message.senderId, "player_1");
  });

  it("CT-012 não participante envia → FORBIDDEN", () => {
    const result = applyMessage(baseState(), {
      conversationId: "c-1", senderKind: "user", contactId: null,
      requester: user("intruso"), text: "oi", operationId: "op-1", now: 1,
    });
    assert.strictEqual(result.code, "FORBIDDEN");
  });

  it("CT-013 não participante não recebe conversa no sync filtrado", () => {
    const snapshot = buildFilteredSnapshot(baseState(), "intruso", false);
    assert.deepEqual(snapshot.conversations, {});
    assert.deepEqual(snapshot.contacts, {});
  });

  it("CT-014 forja senderId: usuário sempre assume o id do requester", () => {
    const state = baseState();
    const result = applyMessage(state, {
      conversationId: "c-1", senderKind: "user", contactId: null,
      requester: user("player_1"), text: "forjado", operationId: "op-1", now: 1,
    });
    assert.strictEqual(result.message.senderId, "player_1");
    assert.notStrictEqual(result.message.senderId, "player_2");
  });

  it("CT-015 jogador não envia como NPC → FORBIDDEN", () => {
    const result = applyMessage(baseState(), {
      conversationId: "c-1", senderKind: "npc", contactId: "npc-1",
      requester: user("player_1"), text: "fingindo", operationId: "op-1", now: 1,
    });
    assert.strictEqual(result.code, "FORBIDDEN");
  });

  it("CT-016 GM envia como NPC válido e representa o GM", () => {
    const result = applyMessage(baseState(), {
      conversationId: "c-1", senderKind: "npc", contactId: "npc-1",
      requester: user("gm_1", true), text: "Sou Muzan", operationId: "op-1", now: 1,
    });
    assert.strictEqual(result.code, "MESSAGE_COMMITTED");
    assert.strictEqual(result.message.senderKind, "npc");
    assert.strictEqual(result.message.senderId, "npc-1");
    assert.strictEqual(result.message.representedByUserId, "gm_1");
  });

  it("CT-018 operação idempotente entre GMs não duplica", () => {
    const state = baseState();
    const a = applyMessage(state, {
      conversationId: "c-1", senderKind: "user", contactId: null,
      requester: user("player_1"), text: "x", operationId: "dup", now: 1,
    });
    const b = applyMessage(a.state, {
      conversationId: "c-1", senderKind: "user", contactId: null,
      requester: user("player_1"), text: "x", operationId: "dup", now: 2,
    });
    assert.strictEqual(b.code, "DUPLICATE_OPERATION");
    assert.strictEqual(b.state, a.state);
  });

  it("CT-021 jogador removido perde leitura no snapshot filtrado", () => {
    const state = baseState();
    const removed = upsertConversation(state, {
      id: "c-1", kind: "group", displayName: "Covil",
      participantUserIds: ["player_2"], contactIds: ["npc-1"],
    }).state;
    const snapshot = buildFilteredSnapshot(removed, "player_1", false);
    assert.deepEqual(snapshot.conversations, {});
  });

  it("CT-022 conversa arquivada rejeita mensagem com ARCHIVED", () => {
    const state = upsertConversation(baseState(), {
      id: "c-1", kind: "group", displayName: "Covil",
      participantUserIds: ["player_1", "player_2"], contactIds: ["npc-1"], archived: true,
    }).state;
    const result = applyMessage(state, {
      conversationId: "c-1", senderKind: "user", contactId: null,
      requester: user("player_1"), text: "oi", operationId: "op-1", now: 1,
    });
    assert.strictEqual(result.code, "ARCHIVED");
  });

  it("eleição de GM primário é determinística", () => {
    const users = [
      user("gm_b", true), user("gm_a", true), user("player", false),
    ];
    assert.strictEqual(electPrimaryGm(users).id, "gm_a");
    assert.strictEqual(electPrimaryGm([user("player")]), null);
  });

  it("syncRecipients inclui participantes e GMs sem duplicar", () => {
    const conv = baseState().conversations["c-1"];
    const recipients = syncRecipients(conv, [user("player_1"), user("gm_1", true)]);
    assert.ok(recipients.includes("player_1"));
    assert.ok(recipients.includes("player_2"));
    assert.ok(recipients.includes("gm_1"));
    assert.strictEqual(new Set(recipients).size, recipients.length);
  });
});

describe("phone-chat-relay adapter", () => {
  let originalTimeout;

  beforeEach(() => {});
  afterEach(() => {
    delete globalThis.game;
    delete globalThis.foundry;
    if (originalTimeout !== undefined) {
      // @ts-ignore
      Object.defineProperty(globalThis, "PHONE_CHAT_TIMEOUT_MS", { value: originalTimeout });
    }
  });

  it("CT-019 sem GM ativo → NO_GM", async () => {
    mockGame({ user: user("player_1"), users: [user("player_1"), user("player_2")] });
    const result = await sendMessage({ conversationId: "c-1", text: "oi" });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, "NO_GM");
  });

  it("CT-017 cliente não-GM não persiste: handleMessageRequest ignora", async () => {
    const state = baseState();
    const { emitted, settingsStore } = mockGame({ user: user("gm_1", true), users: [user("gm_1", true)] });
    seedState(state);
    await handleMessageRequest({
      type: PHONE_CHAT_TYPES.MESSAGE_REQUEST,
      requestId: "r-1", operationId: "op-x", requesterId: "player_1", gmId: "gm_other",
      clientSchemaVersion: 1, conversationId: "c-1", senderKind: "user", senderId: "forged", text: "x",
    });
    // gmId não é o GM atual: nenhuma resposta emitida e estado não muda.
    assert.strictEqual(emitted.length, 0);
  });

  it("CT-014 handleMessageRequest substitui senderId forjado", async () => {
    const state = baseState();
    const { emitted, settingsStore } = mockGame({
      user: user("gm_1", true),
      users: [user("gm_1", true), user("player_1"), user("player_2")],
    });
    seedState(state);
    await handleMessageRequest({
      type: PHONE_CHAT_TYPES.MESSAGE_REQUEST,
      requestId: "r-1", operationId: "op-y", requesterId: "player_1", gmId: "gm_1",
      clientSchemaVersion: 1, conversationId: "c-1", senderKind: "user", senderId: "player_2", text: "eu sou outro",
    });

    const persisted = settingsStore["phoneChatState"];
    const msg = persisted.conversations["c-1"].messages.find((m) => m.operationId === "op-y");
    assert.ok(msg);
    assert.strictEqual(msg.senderId, "player_1");
    assert.notStrictEqual(msg.senderId, "player_2");

    const response = emitted.find((e) => e.data.type === PHONE_CHAT_TYPES.RESPONSE);
    assert.ok(response);
    assert.strictEqual(response.data.ok, true);
    assert.strictEqual(response.data.code, "MESSAGE_COMMITTED");
  });

  it("CT-011 sync é emitido apenas para participantes e GM", async () => {
    const state = baseState();
    const { emitted, settingsStore } = mockGame({
      user: user("gm_1", true),
      users: [user("gm_1", true), user("player_1"), user("player_2"), user("intruso")],
    });
    seedState(state);
    await handleMessageRequest({
      type: PHONE_CHAT_TYPES.MESSAGE_REQUEST,
      requestId: "r-1", operationId: "op-z", requesterId: "player_1", gmId: "gm_1",
      clientSchemaVersion: 1, conversationId: "c-1", senderKind: "user", senderId: "player_1", text: "oi",
    });
    const sync = emitted.find((e) => e.data.type === PHONE_CHAT_TYPES.SYNC);
    assert.ok(sync);
    assert.ok(sync.data.recipientIds.includes("player_1"));
    assert.ok(sync.data.recipientIds.includes("player_2"));
    assert.ok(sync.data.recipientIds.includes("gm_1"));
    assert.ok(!sync.data.recipientIds.includes("intruso"));
    assert.strictEqual(sync.data.schemaVersion, 1);
  });

  it("CT-013 não participante pede sync e não recebe conversa", async () => {
    const state = baseState();
    const { emitted } = mockGame({
      user: user("gm_1", true),
      users: [user("gm_1", true), user("intruso")],
    });
    seedState(state);
    await routeSocketMessage({
      type: PHONE_CHAT_TYPES.SYNC_REQUEST,
      requestId: "r-sync", requesterId: "intruso", gmId: "gm_1", clientSchemaVersion: 1, knownRevision: 0,
    });
    const sync = emitted.find((e) => e.data.type === PHONE_CHAT_TYPES.SYNC);
    assert.ok(sync);
    assert.deepEqual(sync.data.changes.conversations, {});
    assert.deepEqual(sync.data.changes.contacts, {});
  });

  it("jogador envia mensagem via socket e aguarda resposta do GM", async () => {
    let requestPayload;
    const gmUser = user("gm_1", true);
    const socket = {
      emit: (name, data) => {
        requestPayload = { name, data };
        // Simula o GM respondendo de forma síncrona.
        setTimeout(() => {
          const pendingKey = requestPayload.data.requestId;
          // Injeta resposta via rota de socket.
          routeSocketMessage({
            type: PHONE_CHAT_TYPES.RESPONSE,
            recipientId: "player_1",
            requestId: pendingKey,
            operationId: requestPayload.data.operationId,
            ok: true,
            code: "MESSAGE_COMMITTED",
            message: "ok",
          });
        }, 0);
      },
      on: () => {},
    };
    mockGame({ user: user("player_1"), users: [user("player_1"), gmUser], socket });
    const result = await sendMessage({ conversationId: "c-1", text: "alô" });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.code, "MESSAGE_COMMITTED");
    assert.strictEqual(requestPayload.name, PHONE_CHAT_SOCKET);
    assert.strictEqual(requestPayload.data.type, PHONE_CHAT_TYPES.MESSAGE_REQUEST);
    assert.strictEqual(requestPayload.data.gmId, "gm_1");
  });
});
