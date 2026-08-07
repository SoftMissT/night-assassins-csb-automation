import { setupFoundryMocks } from "./fixtures/foundry-mock.mjs";
setupFoundryMocks();

import { describe, it } from "node:test";
import assert from "node:assert";
import { makeActor } from "./fixtures/actor.mjs";

let _dialogReturn = null;
foundry.applications.api.DialogV2.wait = async () => Array.isArray(_dialogReturn) ? _dialogReturn.shift() : _dialogReturn;
ChatMessage.create = async (data) => data;

let _rollResult = { total: 12, toMessage: async () => {}, dice: [{ results: [{ result: 1, active: true }] }] };
let _formula = "";
Roll.create = (formula) => {
  _formula = formula;
  return {
    evaluate: async () => _rollResult,
    dice: [{ results: [{ result: 1, active: true }] }],
  };
};

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
    const actor = makeActor({ props: { acerto_label: "acerto_label_dex", dex_display: "<span>5</span>", atr_dex_valor: "<span>99</span>" } });
    await rollHit({ actor });
    assert.strictEqual(called, true);
    assert.match(_formula, /\+ 5$/);
  });

  it("rola para FOR", async () => {
    _dialogReturn = { mode: "normal", rollMode: "publicroll", bonusRaw: "", cdVal: 0 };
    let called = false;
    _rollResult = { total: 14, toMessage: async () => { called = true; }, dice: [{ results: [{ result: 1, active: true }] }] };
    const actor = makeActor({ props: { acerto_label: "acerto_label_for", for_display: "<span>6</span>", atr_for_valor: "<span>99</span>" } });
    await rollHit({ actor });
    assert.strictEqual(called, true);
    assert.match(_formula, /\+ 6$/);
  });

  it("aplica Cegueira e Exaustão no Acerto", async () => {
    _dialogReturn = { mode: "normal", rollMode: "publicroll", bonusRaw: "", cdVal: 0 };
    const actor = makeActor({ props: {
      acerto_label: "acerto_label_dex",
      dex_display: "5",
      status_slayer_dados: JSON.stringify({ active: ["cegueira_parcial"], exhaustion: 4 }),
      status_slayer_exaustao: 4,
    } });
    await rollHit({ actor });
    assert.match(_formula, /^2d20kl1 \+ 5 - 5$/);
  });

  it("rola um Acerto por vez e confirma antes do próximo", async () => {
    _dialogReturn = [
      { mode: "normal", rollMode: "publicroll", bonusRaw: "", cdVal: 0, rollCount: 3 },
      { hit: true, continue: true },
      { hit: false, continue: true },
      { hit: true, continue: false },
    ];
    let messages = 0;
    _rollResult = { total: 14, toMessage: async ({ flavor }) => {
      messages += 1;
      assert.match(flavor, new RegExp(`Acerto ${messages}/3`));
    } };
    const actor = makeActor({ props: {
      nome_slayer: "Slayer",
      pdv_slayer_total_valor: 20,
      acerto_label: "acerto_label_dex",
      dex_display: "5",
      acoes_slayer_dados: JSON.stringify({ version: 1, turn: { movimento: 0, ataque: 1, especial: 0 }, round: { unica: 0, reacao: 0 } }),
    } });
    let actorUpdates = 0;
    actor.update = async () => { actorUpdates += 1; };
    await rollHit({ actor });
    assert.equal(messages, 3);
    assert.equal(actorUpdates, 0);
  });

  it("permite encerrar a sequência antes do limite", async () => {
    _dialogReturn = [
      { mode: "normal", rollMode: "publicroll", bonusRaw: "", cdVal: 0, rollCount: 5 },
      { hit: true, continue: true },
      { hit: false, continue: false },
    ];
    let messages = 0;
    _rollResult = { total: 11, toMessage: async () => { messages += 1; } };
    const actor = makeActor({ props: { acerto_label: "acerto_label_for", for_display: "4" } });
    await rollHit({ actor });
    assert.equal(messages, 2);
  });
});
