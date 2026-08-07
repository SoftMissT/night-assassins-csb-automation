import { setupFoundryMocks } from "./fixtures/foundry-mock.mjs";
setupFoundryMocks();

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { hunterData, oniData, openGmDashboard } from "../scripts/gm-dashboard.mjs";

describe("gm-dashboard", () => {
  it("lê somente nome, PDV e PDR do Caçador", () => {
    const data = hunterData({
      name: "Actor Tanjiro",
      system: { props: {
        nome_slayer: "Tanjiro",
        pdv_slayer_total_valor: 40,
        pdr_slayer_total_valor: 20,
        pdv_slayer_atual_valor_display: "<strong>30</strong>",
        pdr_slayer_atual_valor_display: 10,
      } },
    });

    assert.equal(data.name, "Tanjiro");
    assert.equal(data.kind, "hunter");
    assert.deepEqual(data.pdv, { current: 30, max: 40, percent: 75 });
    assert.deepEqual(data.pdr, { current: 10, max: 20, percent: 50 });
    assert.deepEqual(Object.keys(data).sort(), ["actor", "image", "kind", "name", "pdr", "pdv"]);
  });

  it("lê Oni somente por keys que contêm oni", () => {
    const data = oniData({
      name: "Akaza",
      system: { props: {
        nome_oni: "Akaza",
        pdv_oni_total_valor: 200,
        pdv_oni_atual_valor_display: 145,
        pdr_oni_total_valor: 40,
        pdr_oni_atual_valor_display: 12,
      } },
    });

    assert.equal(data.name, "Akaza");
    assert.equal(data.kind, "oni");
    assert.deepEqual(data.pdv, { current: 145, max: 200, percent: 72.5 });
    assert.deepEqual(data.pdr, { current: 12, max: 40, percent: 30 });
  });

  it("calcula PDV/PDR atual do Oni quando os displays ainda não existem", () => {
    const data = oniData({
      name: "Oni",
      system: { props: {
        pdv_oni_total_valor: 100,
        pdv_oni_dano_tomado: 35,
        pdr_oni_total_valor: 20,
        pdr_oni_gasto_valor: 6,
      } },
    });

    assert.equal(data.pdv.current, 65);
    assert.equal(data.pdr.current, 14);
  });

  it("não classifica Caçador como Oni", () => {
    assert.equal(oniData({ name: "Tanjiro", system: { props: { nome_slayer: "Tanjiro", pdv_oni_dano_tomado: 0 } } }), null);
  });

  it("abre painel compacto, não modal e com fechamento explícito", async () => {
    let config;
    game.user.isGM = true;
    game.actors = { contents: [
      {
        name: "Actor Zenitsu",
        system: { props: {
          nome_slayer: "Zenitsu",
          pdv_slayer_total_valor: 22,
          pdr_slayer_total_valor: 12,
          pdv_slayer_atual_valor_display: 11,
          pdr_slayer_atual_valor_display: 6,
        } },
      },
      {
        name: "Gyutaro",
        system: { props: {
          nome_oni: "Gyutaro",
          pdv_oni_total_valor: 180,
          pdv_oni_atual_valor_display: 90,
          pdr_oni_total_valor: 30,
          pdr_oni_atual_valor_display: 15,
        } },
      },
    ] };
    globalThis.window = { innerWidth: 1280, innerHeight: 900, __NAGmDashboard: null };
    globalThis.Hooks = { once: () => undefined, on: () => 1, off: () => undefined };
    class MockDialogV2 {
      constructor(value) { config = value; }
      render() { this.rendered = true; }
      async close() { this.closed = true; }
    }
    foundry.applications = { api: { DialogV2: MockDialogV2 } };

    const dialog = await openGmDashboard();

    assert.match(config.content, /Controle de Combate/);
    assert.match(config.content, /Caçadores/);
    assert.match(config.content, /Inimigos/);
    assert.match(config.content, /Zenitsu/);
    assert.match(config.content, /Gyutaro/);
    assert.doesNotMatch(config.content, /Classe|Origem|Respiração|Esquiva|Bloqueio/);
    assert.equal(config.position.width, 680);
    assert.equal(config.modal, false);
    assert.deepEqual(config.buttons.map(({ action }) => action), ["close"]);
    await config.buttons[0].callback();
    assert.equal(dialog.closed, true);
  });
});
