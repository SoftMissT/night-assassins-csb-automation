import { setupFoundryMocks } from "./fixtures/foundry-mock.mjs";
setupFoundryMocks();

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { hunterData, openGmDashboard } from "../scripts/gm-dashboard.mjs";

describe("gm-dashboard", () => {
  it("lê identidade, progressão, atributos e recursos do Caçador", () => {
    const data = hunterData({
      name: "Actor Tanjiro",
      system: { props: {
        nome_cacador: "Tanjiro",
        pdv_total_valor: 40,
        pdr_total_valor: 20,
        pdv_atual_valor_display: "<strong>30</strong>",
        pdr_atual_valor_display: 10,
        pdr_gasto_valor: 4,
        nvl_pj: "nvl_7",
        nvl_respiracao_num: 2,
        classe_escolhida: "classe_mb",
        origem_dropdown: "origem_tsuguko",
        respiracao: "respiracao_agua",
        vit_display: 7,
        dex_display: 6,
        for_display: 5,
        car_display: 4,
        fdv_display: 3,
        int_display: 2,
        sab_display: 1,
        hab_escolhida: "hab_escolhida_tsuyoi",
        metal_escolhido: "metal_preto",
      } },
    });

    assert.equal(data.name, "Tanjiro");
    assert.deepEqual(data.pdv, { current: 30, max: 40, percent: 75 });
    assert.deepEqual(data.pdr, { current: 10, max: 20, percent: 50, spent: 4 });
    assert.equal(data.level, 7);
    assert.equal(data.breathLevel, 2);
    assert.equal(data.className, "Mb");
    assert.equal(data.origin, "Tsuguko");
    assert.equal(data.breath, "Agua");
    assert.deepEqual(data.attributes, { vit: 7, dex: 6, for: 5, car: 4, fdv: 3, int: 2, sab: 1 });
    assert.equal(data.dodge, "1d20 + 6");
    assert.equal(data.block, "1d20 + 5");
    assert.equal(data.ability, "Tsuyoi");
    assert.equal(data.metal, "Preto");
  });

  it("ignora NPC com recursos mas sem nome_cacador", () => {
    assert.equal(hunterData({ name: "O Cirurgião", system: { props: { pdv_total_valor: 800, pdr_total_valor: 80 } } }), null);
  });

  it("abre mesa tática persistente com tabela, atributos e recursos", async () => {
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
        pdr_gasto_valor: 2,
        nvl_pj: "nvl_4",
        nvl_respiracao_num: 2,
        classe_escolhida: "classe_kakushi",
        origem_dropdown: "origem_isolado",
        respiracao: "respiracao_trovao",
        vit_display: 4,
        dex_display: 5,
        for_display: 2,
        car_display: 1,
        fdv_display: 3,
        int_display: 2,
        sab_display: 1,
        hab_escolhida: "hab_escolhida_audicao",
        metal_escolhido: "metal_amarelo",
      } },
    }] };
    globalThis.window = { innerWidth: 1280, innerHeight: 900, __NAGmDashboard: null };
    globalThis.Hooks = { once: () => undefined, on: () => 1, off: () => undefined };
    class MockDialogV2 {
      constructor(value) { config = value; }
      render() { this.rendered = true; }
      async close() { return undefined; }
    }
    foundry.applications = { api: { DialogV2: MockDialogV2 } };

    const dialog = await openGmDashboard();

    assert.match(config.content, /Zenitsu/);
    assert.match(config.content, /Controle de Campo/);
    assert.match(config.content, /<table class="na-gm-table">/);
    assert.match(config.content, /Kakushi/);
    assert.match(config.content, /Isolado/);
    assert.match(config.content, /Trovao/);
    assert.match(config.content, /PDV/);
    assert.match(config.content, /<strong>11<\/strong><small>\/ 22<\/small>/);
    assert.match(config.content, /PDR/);
    assert.match(config.content, /<strong>6<\/strong><small>\/ 12<\/small>/);
    assert.match(config.content, /Audição Sobrenatural/);
    assert.match(config.content, /1d20 \+ 5/);
    assert.match(config.content, /1d20 \+ 2/);
    assert.ok(dialog.rendered);
    assert.equal(config.modal, false);
    assert.deepEqual(config.buttons.map(({ action }) => action), ["close"]);
  });
});
