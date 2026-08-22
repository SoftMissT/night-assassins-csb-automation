import { describe, it } from "node:test";
import assert from "node:assert/strict";

const { slayerMaxPdv, slayerCurrentPdv } = await import("../scripts/life-death-service.mjs");

describe("life-death-service - nvl_0 guard", () => {
  it("slayerMaxPdv retorna 0 para nivel 0 (props vazias)", () => {
    const props = {};
    assert.equal(slayerMaxPdv(props), 0);
  });

  it("slayerCurrentPdv retorna 0 para nivel 0", () => {
    const props = {};
    assert.equal(slayerCurrentPdv(props), 0);
  });

  it("slayerMaxPdv retorna valor correto com props preenchidas", () => {
    const props = {
      pdv_slayer_total_conta: "20",
      pdv_slayer_dano_ferida: "5",
      pdv_slayer_extra: "2",
    };
    assert.equal(slayerMaxPdv(props), 17);
  });

  it("slayerCurrentPdv considera cura e dano", () => {
    const props = {
      pdv_slayer_total_conta: "20",
      pdv_slayer_dano_ferida: "5",
      pdv_slayer_extra: "0",
      pdv_slayer_curado: "3",
      pdv_slayer_dano_tomado: "8",
    };
    assert.equal(slayerCurrentPdv(props), 10);
  });
});
