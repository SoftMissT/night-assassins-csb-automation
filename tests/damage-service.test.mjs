import { setupFoundryMocks } from "./fixtures/foundry-mock.mjs";
setupFoundryMocks();

import { describe, it } from "node:test";
import assert from "node:assert";
import { makeActor } from "./fixtures/actor.mjs";

let _dialogReturn = null;
foundry.applications.api.DialogV2.wait = async () => _dialogReturn;

let _rollResult = { total: 8, toMessage: async () => {}, dice: [{ results: [{ result: 1, active: true }] }] };
Roll.create = (formula) => ({
  evaluate: async () => _rollResult,
  dice: [{ results: [{ result: 1, active: true }] }],
});

import { rollDamage } from "../scripts/damage-service.mjs";

describe("damage-service", () => {
  it("cancela quando dialog retorna null", async () => {
    _dialogReturn = null;
    const actor = makeActor();
    let rolled = false;
    _rollResult = { total: 8, toMessage: async () => { rolled = true; } };
    await rollDamage({ actor, nome: "Golpe", entradas: [{ dado: "1d8", fixo: 2, attrs: ["for"], tiposDano: ["cortante"] }] });
    assert.strictEqual(rolled, false);
  });

  it("aplica PDR e dano em atacante e alvo diferentes", async () => {
    _dialogReturn = { nome: "Golpe", pdrGasto: 3, entradas: [{ dado: "1d8", fixo: 2, selAttrs: ["for"], selTiposDano: ["cortante"], tipoAcao: "ataque" }] };
    const attacker = makeActor({ id: "atk", uuid: "Actor.atk" });
    const target = makeActor({ id: "tgt", uuid: "Actor.tgt", props: { pdv_oni_dano_tomado: 0 } });

    let attackerUpdated = false;
    let targetUpdated = false;
    attacker.update = async (patch, options) => {
      assert.strictEqual(patch["system.props.pdr_gasto_valor"], 3);
      assert.strictEqual(options?.naCsbAutomation, true);
      attackerUpdated = true;
    };
    target.update = async (patch, options) => {
      assert.strictEqual(patch["system.props.pdv_oni_dano_tomado"], 8);
      assert.strictEqual(options?.naCsbAutomation, true);
      targetUpdated = true;
    };

    game.user.targets = new Set([{ actor: target }]);

    let rolled = false;
    _rollResult = { total: 8, toMessage: async () => { rolled = true; } };
    await rollDamage({ actor: attacker, nome: "Golpe", entradas: [{ dado: "1d8", fixo: 2, attrs: ["for"], tiposDano: ["cortante"] }], pdrCusto: 3 });
    assert.strictEqual(attackerUpdated, true);
    assert.strictEqual(targetUpdated, true);
    assert.strictEqual(rolled, true);
  });

  it("combina PDR e dano quando atacante é alvo", async () => {
    _dialogReturn = { nome: "Golpe", pdrGasto: 2, entradas: [{ dado: "1d6", fixo: 0, selAttrs: [], selTiposDano: [], tipoAcao: "" }] };
    const actor = makeActor({ id: "self", uuid: "Actor.self", props: { pdr_gasto_valor: 1, pdv_oni_dano_tomado: 0 } });
    actor.system.props.pdr_gasto_valor = 1;

    let updated = false;
    actor.update = async (patch, options) => {
      assert.strictEqual(patch["system.props.pdr_gasto_valor"], 3);
      assert.strictEqual(patch["system.props.pdv_oni_dano_tomado"], 5);
      assert.strictEqual(options?.naCsbAutomation, true);
      updated = true;
    };

    game.user.targets = new Set([{ actor }]);

    let rolled = false;
    _rollResult = { total: 5, toMessage: async () => { rolled = true; } };
    await rollDamage({ actor, nome: "Golpe", entradas: [{ dado: "1d6" }], pdrCusto: 2 });
    assert.strictEqual(updated, true);
    assert.strictEqual(rolled, true);
  });
});
