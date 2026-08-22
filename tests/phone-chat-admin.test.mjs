import { describe, it } from "node:test";
import assert from "node:assert";

import {
  confirmDeleteMessage,
  promptContactManager,
  promptConversationManager,
  promptGlobalSettings,
} from "../scripts/phone-chat/phone-chat-admin.mjs";

import { createEmptyState } from "../scripts/phone-chat/phone-chat-domain.mjs";
import {
  deleteQuickReply,
  upsertContact,
  upsertConversation,
  upsertQuickReply,
} from "../scripts/phone-chat/phone-chat-store.mjs";

const user = (id, isGM = false, active = true) => ({ id, isGM, active });

globalThis.foundry = { applications: { api: { DialogV2: {} } } };

function mockGame({ user: currentUser, users = [], emitted = [] } = {}) {
  const settingsStore = {};
  globalThis.game = {
    user: currentUser,
    users: {
      get: (id) => users.find((u) => u.id === id) ?? null,
      contents: users,
      filter: (predicate) => users.filter(predicate),
    },
    socket: {
      emit: (name, data) => emitted.push({ name, data }),
      on: () => {},
    },
    settings: {
      get: (moduleId, key) => settingsStore[key] ?? null,
      set: async (moduleId, key, value) => { settingsStore[key] = value; },
    },
    i18n: { localize: (key) => key },
  };
  globalThis.ui = { notifications: { warn: () => {}, error: () => {}, info: () => {} } };
  globalThis.Hooks = { callAll: () => {} };
  return { settingsStore };
}

function readPersisted(settingsStore) {
  return settingsStore["phoneChatState"] ?? null;
}

const baseState = () => {
  let state = createEmptyState();
  state = upsertContact(state, { id: "npc-1", displayName: "Muzan" }).state;
  state = upsertConversation(state, {
    id: "c-1",
    kind: "group",
    displayName: "Covil",
    participantUserIds: ["player_1"],
    contactIds: ["npc-1"],
  }).state;
  return state;
};

function fakeDialog(returnValueFactory) {
  return async (config) => {
    config.__captured = config;
    const element = {
      querySelector: (selector) => returnValueFactory(selector),
      querySelectorAll: () => [],
    };
    const save = config.buttons.find((button) => button.action === "save");
    return save ? save.callback(null, null, { element }) : null;
  };
}

describe("phone-chat-admin reducers", () => {
  it("resposta rápida é criada, atualizada e removida", () => {
    let state = upsertContact(baseState(), { id: "npc-1", displayName: "Muzan" }).state;
    state = upsertQuickReply(state, "npc-1", { text: "Eu vejo tudo." }).state;
    assert.strictEqual(state.contacts["npc-1"].quickReplies.length, 1);

    const quickId = state.contacts["npc-1"].quickReplies[0].id;
    state = upsertQuickReply(state, "npc-1", { id: quickId, text: "Eu sou eterno." }).state;
    assert.strictEqual(state.contacts["npc-1"].quickReplies.length, 1);
    assert.strictEqual(state.contacts["npc-1"].quickReplies[0].text, "Eu sou eterno.");

    state = deleteQuickReply(state, "npc-1", quickId).state;
    assert.strictEqual(state.contacts["npc-1"].quickReplies.length, 0);
  });

  it("resposta rápida vazia ou contato inexistente são recusados", () => {
    const state = baseState();
    assert.strictEqual(upsertQuickReply(state, "npc-x", { text: "oi" }).code, "NOT_FOUND");
    assert.strictEqual(upsertQuickReply(state, "npc-1", { text: "   " }).code, "INVALID_PAYLOAD");
  });
});

describe("phone-chat-admin dialogs", () => {
  it("promptGlobalSettings lê limite e wallpaper do formulário e persiste", async () => {
    const emitted = [];
    const { settingsStore } = mockGame({ user: user("gm_1", true), users: [user("gm_1", true)] });
    settingsStore["phoneChatState"] = baseState();
    foundry.applications = {
      api: {
        DialogV2: {
          wait: fakeDialog((selector) => ({
            value: selector.includes("historyLimit") ? "250" : "assets/wall.webp",
          })),
          confirm: async () => false,
        },
      },
    };

    await promptGlobalSettings();
    const persisted = readPersisted(settingsStore);
    // commit persistiu via game.settings.set no mesmo store mockado.
    assert.ok(persisted);
    assert.strictEqual(persisted.settings.historyLimit, 250);
    assert.strictEqual(persisted.settings.globalWallpaper, "assets/wall.webp");
  });

  it("promptGlobalSettings rejeita wallpaper proibido", async () => {
    const { settingsStore } = mockGame({ user: user("gm_1", true), users: [user("gm_1", true)] });
    settingsStore["phoneChatState"] = baseState();
    foundry.applications = {
      api: {
        DialogV2: {
          wait: fakeDialog((selector) => ({
            value: selector.includes("historyLimit") ? "100" : "javascript:alert(1)",
          })),
          confirm: async () => false,
        },
      },
    };

    await promptGlobalSettings();
    const persisted = readPersisted(settingsStore);
    assert.strictEqual(persisted.settings.globalWallpaper, null);
  });

  it("promptContactManager cria NPC com respostas rápidas em linha", async () => {
    const { settingsStore } = mockGame({ user: user("gm_1", true), users: [user("gm_1", true)] });
    settingsStore["phoneChatState"] = createEmptyState();
    let calls = 0;
    foundry.applications = {
      api: {
        DialogV2: {
          wait: fakeDialog(() => {
            calls += 1;
            if (calls === 1) {
              return { value: "Kokushibo" };
            }
            if (calls === 2) {
              return { value: "" };
            }
            return { value: "Lâmina lunar\nSexto olho" };
          }),
          confirm: async () => false,
        },
      },
    };

    const result = await promptContactManager(null);
    assert.strictEqual(result.code, "CONTACT_COMMITTED");

    const persisted = readPersisted(settingsStore);
    const contact = Object.values(persisted.contacts)[0];
    assert.strictEqual(contact.displayName, "Kokushibo");
    assert.deepStrictEqual(
      contact.quickReplies.map((quick) => quick.text).sort(),
      ["Lâmina lunar", "Sexto olho"],
    );
  });

  it("jogador não abre nenhum diálogo administrativo", async () => {
    mockGame({ user: user("player_1"), users: [user("player_1")] });
    let called = false;
    foundry.applications = {
      api: {
        DialogV2: {
          wait: async () => { called = true; return null; },
          confirm: async () => { called = true; return null; },
        },
      },
    };

    await promptGlobalSettings();
    await promptContactManager();
    await promptConversationManager();
    await confirmDeleteMessage("c-1", "m-1");
    assert.strictEqual(called, false);
  });
});
