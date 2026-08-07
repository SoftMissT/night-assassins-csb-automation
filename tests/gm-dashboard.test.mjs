import { setupFoundryMocks } from "./fixtures/foundry-mock.mjs";
setupFoundryMocks();

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { hunterData, openGmDashboard } from "../scripts/gm-dashboard.mjs";

describe("gm-dashboard", () => {
  it("lê as seis keys canônicas do Caçador", () => {
    const data = hunterData({
      name: "Actor Tanjiro",
      system: { props: {
        nome_cacador: "Tanjiro",
        pdv_total_valor: 40,
        pdr_total_valor: 20,
        pdv_atual_valor_display: "<strong>30</strong>",
        pdr_atual_valor_display: 10,
        hab_escolhida: "hab_escolhida_tsuyoi",
        metal_escolhido: "metal_preto",
      } },
    });

    assert.equal(data.name, "Tanjiro");
    assert.deepEqual(data.pdv, { current: 30, max: 40, percent: 75 });
    assert.deepEqual(data.pdr, { current: 10, max: 20, percent: 50 });
    assert.equal(data.ability, "Tsuyoi");
    assert.equal(data.metal, "Preto");
  });

  it("ignora NPC com recursos mas sem nome_cacador", () => {
    assert.equal(hunterData({ name: "O Cirurgião", system: { props: { pdv_total_valor: 800, pdr_total_valor: 80 } } }), null);
  });

  it("abre painel somente para GM com barras de PDV e PDR", async () => {
    let config;
    game.user.isGM = true;
    game.actors = { contents: [{
      name: "Actor Zenitsu",
      system: { props: {
        nome_cacador: "Zenitsu",
        pdv_total_valor: 22,
        pdr_total_valor: 12,
        pdv_atual_valor_display: 11,
        pdr_atual_valor_display: 6,
        hab_escolhida: "hab_escolhida_audicao",
        metal_escolhido: "metal_amarelo",
      } },
    }] };
    globalThis.window = { innerWidth: 1280, innerHeight: 900, __NAGmDashboard: null };
    globalThis.Hooks = { once: () => undefined };
    class MockDialogV2 {
      constructor(value) { config = value; }
      render() { this.rendered = true; }
      async close() { return undefined; }
    }
    foundry.applications = { api: { DialogV2: MockDialogV2 } };

    const dialog = await openGmDashboard();

    assert.match(config.content, /Zenitsu/);
    assert.match(config.content, /PDV/);
    assert.match(config.content, /<strong>11<small>\/ 22<\/small>/);
    assert.match(config.content, /PDR/);
    assert.match(config.content, /<strong>6<small>\/ 12<\/small>/);
    assert.match(config.content, /Audição Sobrenatural/);
    assert.ok(dialog.rendered);
    assert.deepEqual(config.buttons.map(({ action }) => action), ["close", "refresh"]);
  });
});
