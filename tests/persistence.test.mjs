import { describe, it } from "node:test";
import assert from "node:assert";
import { buildSnapshotPatch, buildConfigPatch, atomicActorUpdate } from "../scripts/persistence.mjs";

describe("persistence", () => {
  describe("buildSnapshotPatch", () => {
    it("gera 14 entradas para nível 1", () => {
      const values = { vit: 4, dex: 3, for: 2, car: 2, fdv: 1, int: 1, sab: 1 };
      const patch = buildSnapshotPatch(1, values);
      assert.strictEqual(Object.keys(patch).length, 14);
      assert.strictEqual(patch["system.props.vit_nvl1"], 4);
      assert.strictEqual(patch["system.props.atr_vit_valor_config"], 4);
    });
  });

  describe("buildConfigPatch", () => {
    it("gera 7 entradas", () => {
      const values = { vit: 4, dex: 3, for: 2, car: 2, fdv: 1, int: 1, sab: 1 };
      const patch = buildConfigPatch(values);
      assert.strictEqual(Object.keys(patch).length, 7);
      assert.strictEqual(patch["system.props.atr_vit_valor_config"], 4);
    });
  });

  describe("atomicActorUpdate", () => {
    it("chama actor.update com naCsbAutomation", async () => {
      let called = false;
      const actor = {
        update: async (patch, options) => {
          called = true;
          assert.strictEqual(options?.naCsbAutomation, true);
          assert.strictEqual(patch["system.props.vit_nvl1"], 4);
        },
      };
      await atomicActorUpdate(actor, { "system.props.vit_nvl1": 4 });
      assert.strictEqual(called, true);
    });

    it("rejeita actor inválido", async () => {
      await assert.rejects(atomicActorUpdate(null, {}), /Actor inválido/);
    });
  });
});
