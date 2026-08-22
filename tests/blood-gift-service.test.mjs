import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";

class MockRoll {
  constructor(formula) {
    this.formula = formula;
    this.total = Math.floor(Math.random() * 100) + 1;
  }
  async evaluate() { return this; }
}

globalThis.Roll = MockRoll;
globalThis.game = { user: { id: "user1" }, dice3d: null, settings: { get: () => "roll" } };
globalThis.ChatMessage = { create: mock.fn(async () => {}), getSpeaker: () => ({}) };

const { rollBloodGiftForActor, getBloodGiftTable } = await import("../scripts/blood-gift-service.mjs");

function makeActor(origem = "") {
  return {
    name: "Test Oni",
    system: { props: { origem } },
    update: mock.fn(async () => {}),
  };
}

describe("blood-gift-service", () => {
  it("getBloodGiftTable retorna 10 entradas", () => {
    const table = getBloodGiftTable();
    assert.equal(table.length, 10);
    assert.equal(table[0].min, 1);
    assert.equal(table[9].min, 100);
  });

  it("rollBloodGiftForActor retorna rolls, best e gift", async () => {
    const result = await rollBloodGiftForActor(makeActor(), { apply: false });
    assert.ok(Array.isArray(result.rolls));
    assert.equal(result.rolls.length, 2);
    assert.equal(result.best, Math.max(...result.rolls));
    assert.ok(result.gift?.key);
    assert.ok(result.gift?.label);
  });

  it("usa 3 rolagens para Descendente Perdido", async () => {
    const result = await rollBloodGiftForActor(makeActor("Descendente Perdido"), { apply: false });
    assert.equal(result.rolls.length, 3);
  });

  it("usa 2 rolagens para origem normal", async () => {
    const result = await rollBloodGiftForActor(makeActor("Órfão"), { apply: false });
    assert.equal(result.rolls.length, 2);
  });

  it("apply=true atualiza o actor", async () => {
    const actor = makeActor();
    await rollBloodGiftForActor(actor, { apply: true });
    assert.equal(actor.update.mock.callCount(), 1);
    const call = actor.update.mock.calls[0];
    assert.ok(call.arguments[0]["system.props.hab_escolhida"]);
  });

  it("lança erro sem actor", async () => {
    await assert.rejects(() => rollBloodGiftForActor(null), /actor is required/);
  });
});
