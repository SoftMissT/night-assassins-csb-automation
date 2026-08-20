import assert from "node:assert/strict";
import test from "node:test";
import { buildInterludeProgressPatch, executeInterludeActivity } from "../scripts/interlude-service.mjs";

test("Cabaca acumula sucessos consecutivos e conclui no terceiro", () => {
  const first = buildInterludeProgressPatch({}, "cabaca_pequena", true);
  assert.equal(first.progress, 1);
  const third = buildInterludeProgressPatch({ interludio_cabaca_pequena_sucessos: 2 }, "cabaca_pequena", true);
  assert.equal(third.complete, true);
  assert.equal(third.patch["system.props.interludio_cabaca_pequena_completa"], 1);
});

test("Falha em Cabaca zera a sequencia", () => {
  const result = buildInterludeProgressPatch({ interludio_cabaca_media_sucessos: 2 }, "cabaca_media", false);
  assert.equal(result.progress, 0);
});

test("Copo de Cha preserva vitorias ao falhar", () => {
  const result = buildInterludeProgressPatch({ interludio_copo_cha_vitorias: 2 }, "copo_cha", false);
  assert.equal(result.progress, 2);
});

test("Cabaca Gigante desbloqueia Concentracao Total Constante", () => {
  const result = buildInterludeProgressPatch({ interludio_cabaca_gigante_sucessos: 2 }, "cabaca_gigante", true);
  assert.equal(result.patch["system.props.interludio_concentracao_total_constante"], 1);
  assert.equal(result.patch["system.props.interludio_respiracao_repouso"], 1);
});

test("progresso do treino espera a animação do Dice So Nice", async () => {
  const order = [];
  const originals = { Roll: globalThis.Roll, ChatMessage: globalThis.ChatMessage, game: globalThis.game };
  globalThis.Roll = class {
    constructor() { this.total = 18; }
    async evaluate() { order.push("evaluate"); return this; }
    async toMessage() { order.push("roll-message"); return { id: "roll-1" }; }
  };
  globalThis.ChatMessage = {
    getSpeaker: () => ({}),
    create: async () => { order.push("progress-message"); },
  };
  globalThis.game = { dice3d: { waitFor3DAnimationByMessageID: async (id) => { assert.equal(id, "roll-1"); order.push("dice-finished"); } } };
  const actor = {
    system: { props: { vit_display: 3 } },
    update: async () => { order.push("actor-update"); },
  };
  try {
    await executeInterludeActivity(actor, "cabaca_pequena");
    assert.deepEqual(order, ["evaluate", "roll-message", "dice-finished", "actor-update", "progress-message"]);
  } finally {
    Object.assign(globalThis, originals);
  }
});

test("falha da animação do Dice So Nice não bloqueia o progresso", async () => {
  const order = [];
  const originals = { Roll: globalThis.Roll, ChatMessage: globalThis.ChatMessage, game: globalThis.game };
  globalThis.Roll = class {
    constructor() { this.total = 18; }
    async evaluate() { return this; }
    async toMessage() { return { id: "roll-2" }; }
  };
  globalThis.ChatMessage = {
    getSpeaker: () => ({}),
    create: async () => { order.push("progress-message"); },
  };
  globalThis.game = { dice3d: { waitFor3DAnimationByMessageID: async () => { throw new Error("DSN indisponível"); } } };
  const actor = {
    system: { props: { vit_display: 3 } },
    update: async () => { order.push("actor-update"); },
  };
  try {
    await executeInterludeActivity(actor, "cabaca_pequena");
    assert.deepEqual(order, ["actor-update", "progress-message"]);
  } finally {
    Object.assign(globalThis, originals);
  }
});
