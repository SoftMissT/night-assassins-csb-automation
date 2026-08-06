import { setupFoundryMocks } from "./fixtures/foundry-mock.mjs";
setupFoundryMocks();

import { describe, it, before } from "node:test";
import assert from "node:assert";
import { makeActor } from "./fixtures/actor.mjs";

// Stub DialogV2 para roll-service
let _dialogReturn = null;
foundry.applications.api.DialogV2.wait = async () => _dialogReturn;

let _rollResult = { total: 15, toMessage: async () => {}, dice: [{ results: [{ result: 1, active: true }] }] };
Roll.create = (formula) => ({
  evaluate: async () => _rollResult,
  dice: [{ results: [{ result: 1, active: true }] }],
});

import { rollTest } from "../scripts/roll-service.mjs";

describe("roll-service", () => {
  it("cancela quando dialog retorna null", async () => {
    _dialogReturn = null;
    const actor = makeActor();
    let called = false;
    _rollResult = { total: 15, toMessage: async () => { called = true; }, dice: [{ results: [{ result: 1, active: true }] }] };
    await rollTest({ actor, test: "Teste", attr: "FOR", value: 5 });
    assert.strictEqual(called, false);
  });

  it("rola normal quando dialog retorna dados", async () => {
    _dialogReturn = { mode: "normal", rollMode: "publicroll", secVal: 0, bonusRaw: "", cdVal: 0 };
    const actor = makeActor();
    let called = false;
    _rollResult = { total: 15, toMessage: async () => { called = true; }, dice: [{ results: [{ result: 1, active: true }] }] };
    await rollTest({ actor, test: "Teste", attr: "FOR", value: 5 });
    assert.strictEqual(called, true);
  });

  it("avisa quando actor não é encontrado", async () => {
    let warned = false;
    ui.notifications.warn = () => { warned = true; };
    await rollTest({ actorUuid: "Actor.inexistente" });
    assert.strictEqual(warned, true);
  });
});
