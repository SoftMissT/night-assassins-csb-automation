import { setupFoundryMocks } from "./fixtures/foundry-mock.mjs";
setupFoundryMocks();

import { describe, it } from "node:test";
import assert from "node:assert";
import { applyOniDamage, calculateApprovedDamage, DAMAGE_RELAY_KEY, DAMAGE_TYPES, requestDamageApproval } from "../scripts/damage-relay.mjs";

describe("damage-relay", () => {
  it("acumula somente pdv_oni_dano_tomado quando o usuário pode atualizar", async () => {
    game.user.isGM = false;
    const actor = {
      name: "Oni",
      uuid: "Actor.oni",
      isOwner: true,
      system: { props: { pdv_oni_dano_tomado: 7 } },
      update: async (patch, options) => {
        assert.deepStrictEqual(patch, { "system.props.pdv_oni_dano_tomado": 12 });
        assert.strictEqual(options.naCsbAutomation, true);
      },
    };

    const result = await applyOniDamage(actor, 5);
    assert.strictEqual(DAMAGE_RELAY_KEY, "pdv_oni_dano_tomado");
    assert.strictEqual(result.total, 12);
  });

  it("rejeita dano zero ou negativo", async () => {
    await assert.rejects(() => applyOniDamage({ isOwner: true }, 0), /dano inválido/i);
  });

  it("mostra ao GM crítico, resistência e todos os tipos de dano", async () => {
    let dialogConfig;
    foundry.applications = {
      api: {
        DialogV2: {
          wait: async (config) => {
            dialogConfig = config;
            return true;
          },
        },
      },
    };

    const approved = await requestDamageApproval(
      { name: "Oni Lua" },
      { name: "Tanjiro" },
      24,
      8,
      { attackName: "Hinokami", critical: true, rolledTotal: 12, damageTypes: ["fogo", "cortante"] },
    );
    assert.strictEqual(approved, true);
    assert.match(dialogConfig.content, /Tanjiro/);
    assert.match(dialogConfig.content, /Oni Lua/);
    assert.match(dialogConfig.content, /Hinokami/);
    assert.match(dialogConfig.content, /Crítico · base 12/);
    assert.match(dialogConfig.content, /Resistente · metade/);
    assert.strictEqual((dialogConfig.content.match(/name="damageType"/g) ?? []).length, DAMAGE_TYPES.length);
    assert.deepStrictEqual(dialogConfig.buttons.map(({ action }) => action), ["deny", "approve"]);
  });

  it("aplica resistência depois do dano crítico já calculado", () => {
    assert.strictEqual(calculateApprovedDamage(42, false), 42);
    assert.strictEqual(calculateApprovedDamage(42, true), 21);
    assert.strictEqual(calculateApprovedDamage(41, true), 20);
  });
});
