import { setupFoundryMocks } from "./fixtures/foundry-mock.mjs";
setupFoundryMocks();

import { describe, it } from "node:test";
import assert from "node:assert";
import { applyOniDamage, DAMAGE_RELAY_KEY, requestDamageApproval } from "../scripts/damage-relay.mjs";

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

  it("mostra ao GM o modal de autorização com o total previsto", async () => {
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

    const approved = await requestDamageApproval({ name: "Oni Lua" }, { name: "Tanjiro" }, 12, 8);
    assert.strictEqual(approved, true);
    assert.match(dialogConfig.content, /Tanjiro/);
    assert.match(dialogConfig.content, /Oni Lua/);
    assert.match(dialogConfig.content, /Total após aplicar/);
    assert.match(dialogConfig.content, />20</);
    assert.deepStrictEqual(dialogConfig.buttons.map(({ action }) => action), ["deny", "approve"]);
  });
});
