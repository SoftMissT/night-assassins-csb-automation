import { setupFoundryMocks } from "./fixtures/foundry-mock.mjs";
setupFoundryMocks();

import { describe, it } from "node:test";
import assert from "node:assert";
import { makeActor } from "./fixtures/actor.mjs";

let _dialogReturn = null;
foundry.applications.api.DialogV2.wait = async () => _dialogReturn;

import { applyInitialMark, upgradeMarkAtLevelSix } from "../scripts/ability-service.mjs";

describe("ability-service", () => {
  describe("applyInitialMark", () => {
    it("não aplica se bônus já é >= 2", async () => {
      const actor = makeActor({ props: { hab_marca_destino_bonus: 2 } });
      let updated = false;
      actor.update = async () => { updated = true; };
      const result = await applyInitialMark(actor);
      assert.strictEqual(result, false);
      assert.strictEqual(updated, false);
    });

    it("não aplica se nível 1 incompleto", async () => {
      const actor = makeActor({ props: { vit_nvl1: undefined, dex_nvl1: undefined, for_nvl1: undefined, car_nvl1: undefined, fdv_nvl1: undefined, int_nvl1: undefined, sab_nvl1: undefined, hab_marca_destino_bonus: 0 } });
      let warned = false;
      ui.notifications.warn = () => { warned = true; };
      const result = await applyInitialMark(actor);
      assert.strictEqual(result, false);
      assert.strictEqual(warned, true);
    });

    it("aplica +2 quando escolhido", async () => {
      _dialogReturn = "vit";
      const actor = makeActor({ props: { hab_marca_destino_bonus: 0, vit_nvl1: 4, atr_vit_valor_config: 4 } });
      let patch = null;
      actor.update = async (p, opts) => { patch = p; };
      const result = await applyInitialMark(actor);
      assert.strictEqual(result, true);
      assert.strictEqual(patch["system.props.vit_nvl1"], 6);
      assert.strictEqual(patch["system.props.atr_vit_valor_config"], 6);
      assert.strictEqual(patch["system.props.hab_marca_destino_bonus"], 2);
      assert.strictEqual(patch["system.props.hab_marca_destino_atributo"], "vit");
    });
  });

  describe("upgradeMarkAtLevelSix", () => {
    it("não evolui se bônus já é 3", async () => {
      const actor = makeActor({ props: { hab_escolhida: "hab_escolhida_marca_destino", hab_marca_destino_bonus: 3 } });
      let updated = false;
      actor.update = async () => { updated = true; };
      const result = await upgradeMarkAtLevelSix(actor);
      assert.strictEqual(result, false);
      assert.strictEqual(updated, false);
    });

    it("evolui automaticamente quando atributo guardado existe", async () => {
      const actor = makeActor({
        props: {
          hab_escolhida: "hab_escolhida_marca_destino",
          hab_marca_destino_bonus: 2,
          hab_marca_destino_atributo: "vit",
          vit_nvl1: 6,
          atr_vit_valor_config: 6,
          vit_nvl6: undefined,
        },
      });
      let patch = null;
      actor.update = async (p, opts) => { patch = p; };
      const result = await upgradeMarkAtLevelSix(actor);
      assert.strictEqual(result, true);
      assert.strictEqual(patch["system.props.vit_nvl6"], 7);
      assert.strictEqual(patch["system.props.atr_vit_valor_config"], 7);
      assert.strictEqual(patch["system.props.hab_marca_destino_bonus"], 3);
    });
  });
});
