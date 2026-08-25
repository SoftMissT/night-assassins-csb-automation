import { setupFoundryMocks } from "./fixtures/foundry-mock.mjs";
setupFoundryMocks();

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { derivedBonusSummary, derivedChannelForTest, resolveSlayerDerivedBonuses } from "../scripts/derived-bonus-service.mjs";

describe("derived-bonus-service", () => {
  it("resolve Tato por nível sem depender de hidden attributes", () => {
    const n1 = resolveSlayerDerivedBonuses({ hab_escolhida: "hab_escolhida_tato", nvl_pj: "nvl_1" });
    const n6 = resolveSlayerDerivedBonuses({ hab_escolhida: "hab_escolhida_tato", nvl_pj: "nvl_6" });
    assert.equal(n1.channels.bloqueio.total, 2);
    assert.equal(n1.channels.esquiva.total, 1);
    assert.equal(n6.channels.bloqueio.total, 3);
    assert.equal(n6.channels.esquiva.total, 2);
  });

  it("separa dano fixo vermelho de envenenamento roxo", () => {
    const red = resolveSlayerDerivedBonuses({ metal_escolhido: "metal_vermelha" });
    const purple = resolveSlayerDerivedBonuses({ metal_escolhido: "metal_roxa" });
    assert.equal(red.channels.danoFixo.total, 2);
    assert.equal(red.typedDamage.length, 0);
    assert.deepEqual(purple.typedDamage[0], {
      channel: "danoTipado", value: 3, label: "Metal Roxo", origin: "Metal", types: ["envenenamento"],
    });
  });

  it("corrige Preto para Bloqueio e Azul para Bloqueio e Esquiva", () => {
    const black = resolveSlayerDerivedBonuses({ metal_escolhido: "metal_preta" });
    const blue = resolveSlayerDerivedBonuses({ metal_escolhido: "metal_azul" });
    assert.equal(black.channels.bloqueio.total, 4);
    assert.equal(black.channels.esquiva.total, 0);
    assert.equal(blue.channels.bloqueio.total, 3);
    assert.equal(blue.channels.esquiva.total, 3);
  });

  it("anexa contribuição temporária sem persistir total", () => {
    const result = resolveSlayerDerivedBonuses({ hab_acerto_bonus: 1 }, {
      runtimeSources: [{ channel: "acerto", value: 2, label: "Forma", origin: "Respiração" }],
    });
    assert.equal(result.channels.acerto.total, 3);
    assert.equal(result.channels.acerto.sources.length, 2);
  });

  it("mapeia testes e gera resumo compacto", () => {
    const result = resolveSlayerDerivedBonuses({ hab_acerto_bonus: 1, metal_bloqueio_bonus: 4 });
    assert.equal(derivedChannelForTest("Percepção Auditiva"), "percepcaoAuditiva");
    assert.equal(derivedChannelForTest("Esquiva"), "esquiva");
    assert.match(derivedBonusSummary(result), /Acerto \+1/);
    assert.match(derivedBonusSummary(result), /Bloqueio \+4/);
  });
});
