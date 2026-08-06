import { setupFoundryMocks } from "./fixtures/foundry-mock.mjs";
setupFoundryMocks();

import { describe, it } from "node:test";
import assert from "node:assert";
import { makeActor } from "./fixtures/actor.mjs";

let _dialogReturn = null;
foundry.applications.api.DialogV2.wait = async () => _dialogReturn;

let _rollResult = { total: 12, toMessage: async () => {}, dice: [{ results: [{ result: 1, active: true }] }] };
Roll.create = (formula) => ({
  evaluate: async () => _rollResult,
  dice: [{ results: [{ result: 1, active: true }] }],
});

import { rollHit } from "../scripts/hit-service.mjs";

describe("hit-service", () => {
  it("avisa quando acerto_label é inválido", async () => {
    let warned = false;
    ui.notifications.warn = (msg) => { if (msg.includes("DEX ou FOR")) warned = true; };
    const actor = makeActor({ props: { acerto_label: "invalido" } });
    await rollHit({ actor });
    assert.strictEqual(warned, true);
  });

  it("rola para DEX", async () => {
    _dialogReturn = { mode: "normal", rollMode: "publicroll", bonusRaw: "", cdVal: 0 };
    let called = false;
    _rollResult = { total: 14, toMessage: async () => { called = true; }, dice: [{ results: [{ result: 1, active: true }] }] };
    const actor = makeActor({ props: { acerto_label: "acerto_label_dex", atr_dex_valor: "<span>5</span>" } });
    await rollHit({ actor });
    assert.strictEqual(called, true);
  });

  it("rola para FOR", async () => {
    _dialogReturn = { mode: "normal", rollMode: "publicroll", bonusRaw: "", cdVal: 0 };
    let called = false;
    _rollResult = { total: 14, toMessage: async () => { called = true; }, dice: [{ results: [{ result: 1, active: true }] }] };
    const actor = makeActor({ props: { acerto_label: "acerto_label_for", atr_for_valor: "<span>6</span>" } });
    await rollHit({ actor });
    assert.strictEqual(called, true);
  });
});
