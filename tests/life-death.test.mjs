import assert from "node:assert/strict";
import test from "node:test";
import { defaultLifeDeathState, formatLifeDeathSummary, parseLifeDeathState, slayerCurrentPdv } from "../scripts/life-death-service.mjs";

test("Vida e Morte cria estado Slayer canônico", () => {
  assert.deepEqual(parseLifeDeathState(""), defaultLifeDeathState());
});

test("Vida e Morte normaliza estado persistido pelo CSB", () => {
  const state = parseLifeDeathState('&quot;{&quot;dying&quot;:true,&quot;deathMarks&quot;:9,&quot;fallsThisCombat&quot;:2}&quot;');
  assert.equal(state.dying, true);
  assert.equal(state.deathMarks, 3);
  assert.equal(state.fallsThisCombat, 2);
});

test("Vida e Morte calcula PDV pelas parcelas numéricas canônicas", () => {
  assert.equal(slayerCurrentPdv({ pdv_slayer_total_conta: 20, pdv_slayer_dano_ferida: 2, pdv_slayer_extra: 3, pdv_slayer_curado: 4, pdv_slayer_dano_tomado: 10 }), 15);
});

test("Vida e Morte apresenta estado legível", () => {
  assert.equal(formatLifeDeathSummary({ ...defaultLifeDeathState(), dying: true, deathMarks: 2 }), "À Beira da Morte · 2/3 Marcas");
  assert.equal(formatLifeDeathSummary({ ...defaultLifeDeathState(), dying: true, stabilized: true, deathMarks: 1 }), "À Beira da Morte · Estabilizado · 1/3 Marcas");
  assert.equal(formatLifeDeathSummary({ ...defaultLifeDeathState(), dead: true }), "Morto");
});

test("Vida e Morte sanitiza nome do actor e motivo no ChatMessage contra XSS", async () => {
  const chatMessages = [];
  globalThis.ChatMessage = {
    getSpeaker: () => ({}),
    create: async (msg) => {
      chatMessages.push(msg);
      return {};
    },
  };
  globalThis.game = { combats: [], user: { isGM: true }, users: [{ id: "gm", isGM: true, active: true }] };
  globalThis.Roll = {
    create: () => ({
      evaluate: async () => ({
        total: 1,
        dice: [{ results: [{ result: 1 }] }],
        toMessage: async () => {},
      }),
    }),
  };

  const maliciousActor = {
    name: "<script>alert('xss')</script>",
    system: {
      props: {
        vida_morte_slayer_dados: JSON.stringify({ dying: true, stabilized: false, dead: false }),
        pdv_slayer_total_conta: 20,
        pdv_slayer_dano_tomado: 20,
        vit_display: 2,
      },
    },
    update: async () => {},
  };

  const { processDeathTest } = await import("../scripts/life-death-service.mjs");
  await processDeathTest(maliciousActor, { force: true });

  assert.ok(chatMessages.length > 0);
  const reviveMessage = chatMessages.find((m) => m.content.includes("voltou com"));
  assert.ok(reviveMessage, "Mensagem de revive deve ter sido gerada");
  assert.ok(!reviveMessage.content.includes("<script>"), "Conteúdo do chat não deve conter tags <script> não escapadas");
  assert.ok(reviveMessage.content.includes("&lt;script&gt;alert(&#039;xss&#039;)&lt;/script&gt;"), "Nome do actor deve estar escapado em HTML");
});
