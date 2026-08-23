/**
 * @fileoverview Regressão do construtor de PhoneChatApp (Specs §7).
 *
 * Bug real reportado pelo operador: `new PhoneChatApp(...)` lançava
 * `TypeError: Cannot read properties of undefined (reading 'id')` dentro do
 * construtor nativo de `ApplicationV2`. Causa raiz: o override de
 * `_initializeApplicationOptions` chamava `super._initializeApplicationOptions`
 * mas não retornava o objeto de opções processado — o construtor nativo lê
 * `.id` (e outras props) do valor de retorno para montar `this.options` e o id
 * do elemento, então recebia `undefined`.
 *
 * Este mock de `ApplicationV2` reproduz esse contrato específico (usa o
 * retorno de `_initializeApplicationOptions` para ler `.id`) sem depender do
 * Foundry real, para travar a regressão em CI.
 */

import { describe, it, afterEach } from "node:test";
import assert from "node:assert";

const user = (id, isGM = false) => ({
  id,
  isGM,
  getFlag: () => null,
  setFlag: async () => {},
});

/**
 * Mock mínimo e fiel de `foundry.applications.api.ApplicationV2`: monta
 * `this.options` a partir do retorno de `_initializeApplicationOptions` e lê
 * `.id` dele, exatamente como o core faz em `foundry.mjs` (é essa leitura que
 * quebrava com `Cannot read properties of undefined (reading 'id')` quando o
 * override não retornava as opções processadas).
 */
class MockApplicationV2 {
  constructor(options = {}) {
    const merged = { ...this.constructor.DEFAULT_OPTIONS, ...options };
    const processed = this._initializeApplicationOptions(merged);
    // Comportamento real do core: falha aqui se `processed` for undefined.
    this.options = processed;
    this.id = processed.id;
    this.rendered = false;
  }

  _initializeApplicationOptions(options) {
    return options;
  }

  async render() {
    // Comportamento real do core (foundry.mjs #render): ApplicationV2 puro
    // recusa a renderização se a subclasse não implementar AMBOS os métodos
    // abstratos. Sem esta checagem o mock aprovava uma classe que o Foundry
    // real rejeita com "Application class is not renderable".
    for (const method of ["_renderHTML", "_replaceHTML"]) {
      if (typeof this[method] !== "function") {
        throw new Error(
          `The ${this.constructor.name} Application class is not renderable because it does not implement the abstract methods _renderHTML and _replaceHTML.`,
        );
      }
    }
    this.rendered = true;
    return this;
  }

  bringToFront() {
    this._broughtToFront = true;
  }

  async close() {
    this.rendered = false;
    this._onClose({});
    return this;
  }

  _onClose() {}
}

function installFoundryMock() {
  globalThis.foundry = {
    applications: { api: { ApplicationV2: MockApplicationV2 } },
  };
  globalThis.Hooks = { on: () => {}, callAll: () => {} };
  globalThis.ui = { notifications: { warn: () => {}, info: () => {} } };
}

function mockGame(currentUser) {
  const settingsStore = {};
  globalThis.game = {
    user: currentUser,
    users: { get: () => null, contents: [currentUser] },
    settings: {
      get: (moduleId, key) => settingsStore[key] ?? null,
      set: async (moduleId, key, value) => { settingsStore[key] = value; },
    },
    socket: { emit: () => {}, on: () => {} },
    i18n: { localize: (key) => key },
  };
  return settingsStore;
}

describe("PhoneChatApp — construtor ApplicationV2", () => {
  afterEach(() => {
    delete globalThis.foundry;
    delete globalThis.Hooks;
    delete globalThis.ui;
    delete globalThis.game;
  });

  it("openPhoneChat({}) não lança e produz uma instância com id definido", async () => {
    installFoundryMock();
    mockGame(user("gm_1", true));
    const { openPhoneChat } = await import("../scripts/phone-chat/phone-chat-app.mjs?t=" + Date.now());

    const app = await openPhoneChat({});
    assert.ok(app, "openPhoneChat deve retornar a instância");
    assert.strictEqual(app.id, "na-phone-chat");
    assert.strictEqual(app.options.id, "na-phone-chat");
  });

  it("fechar e reabrir não deixa a segunda instância quebrada (singleton resetado em _onClose)", async () => {
    installFoundryMock();
    mockGame(user("gm_1", true));
    const { openPhoneChat } = await import("../scripts/phone-chat/phone-chat-app.mjs?t=" + Date.now());

    const first = await openPhoneChat({});
    await first.close();

    const second = await openPhoneChat({});
    assert.notStrictEqual(second, first, "uma nova instância deve ser criada após close()");
    assert.strictEqual(second.id, "na-phone-chat");
    assert.strictEqual(second.rendered, true);
  });

  it("reabrir sem fechar reaproveita o singleton (bringToFront, sem novo construtor)", async () => {
    installFoundryMock();
    mockGame(user("gm_1", true));
    const { openPhoneChat } = await import("../scripts/phone-chat/phone-chat-app.mjs?t=" + Date.now());

    const first = await openPhoneChat({});
    const again = await openPhoneChat({});
    assert.strictEqual(again, first);
    assert.strictEqual(first._broughtToFront, true);
  });

  it("openMasterPhone propaga master:true até a instância de PhoneChatApp", async () => {
    installFoundryMock();
    mockGame(user("gm_1", true));
    const { openMasterPhone } = await import("../scripts/phone-chat/phone-chat-app.mjs?t=" + Date.now());

    const app = await openMasterPhone({});
    assert.ok(app, "openMasterPhone deve retornar a instância para GM");
    assert.strictEqual(app._master, true);
  });

  it("openMasterPhone recusa não-GM e não instancia PhoneChatApp", async () => {
    installFoundryMock();
    const warnings = [];
    mockGame(user("player_1", false));
    globalThis.ui.notifications.warn = (msg) => warnings.push(msg);
    const { openMasterPhone } = await import("../scripts/phone-chat/phone-chat-app.mjs?t=" + Date.now());

    const result = await openMasterPhone({});
    assert.strictEqual(result, null);
    assert.strictEqual(warnings.length, 1);
  });
});
