import { setupFoundryMocks } from "./fixtures/foundry-mock.mjs";
setupFoundryMocks();
globalThis.foundry.utils = { randomID: () => "test-action-id" };

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { makeActor } from "./fixtures/actor.mjs";
import { rollConfirmedBreathDamage } from "../scripts/breath-service.mjs";
import { buildStoneBreathingPlan } from "../scripts/stone-breathing-service.mjs";
import { stoneFormById } from "../scripts/stone-breathing-data.mjs";

describe("rollConfirmedBreathDamage — dano da Forma após acerto confirmado (regressão)", () => {
  it("propaga a fórmula de dano da Forma (Pedra 02) quando não há arma equipada", async () => {
    const actor = makeActor();
    const form = stoneFormById("pedra_02");
    const plan = buildStoneBreathingPlan("pedra_02", 3, {});
    const selected = plan.selected;
    assert.equal(selected.damage, "4d10");

    const hitResult = {
      attempts: [{ hit: true, critical: false }],
      weapon: null,
    };

    const calls = [];
    const rollDamage = async (options) => { calls.push(options); };
    const rollWeaponItem = async () => { throw new Error("não deveria usar arma quando hitResult.weapon é null"); };

    await rollConfirmedBreathDamage({
      actor,
      form: { id: form.id, respiracao: "Pedra", nome: "Quebra Superior" },
      selected: { dano: selected.damage, tiposDano: ["concussao"] },
      hitResult,
      rollDamage,
      rollWeaponItem,
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].entradas[0].dado, "4d10");
    assert.deepEqual(calls[0].entradas[0].tiposDano, ["concussao"]);
  });

  it("não chama rollDamage/rollWeaponItem quando nenhum ataque acertou", async () => {
    const actor = makeActor();
    const calls = [];
    const rollDamage = async (options) => { calls.push(options); };
    const rollWeaponItem = async () => { calls.push("weapon"); };

    await rollConfirmedBreathDamage({
      actor,
      form: { id: "pedra_02", respiracao: "Pedra", nome: "Quebra Superior" },
      selected: { dano: "4d10", tiposDano: ["concussao"] },
      hitResult: { attempts: [{ hit: false, critical: false }], weapon: null },
      rollDamage,
      rollWeaponItem,
    });

    assert.equal(calls.length, 0);
  });

  it("usa rollWeaponItem (não a fórmula da forma) quando o acerto veio de uma arma equipada", async () => {
    const actor = makeActor();
    actor.items = { get: (id) => ({ id, name: "Arma Teste" }) };
    const calls = [];
    const rollDamage = async (options) => { calls.push({ type: "generic", options }); };
    const rollWeaponItem = async (options) => { calls.push({ type: "weapon", options }); };

    await rollConfirmedBreathDamage({
      actor,
      form: { id: "pedra_02", respiracao: "Pedra", nome: "Quebra Superior" },
      selected: { dano: "4d10", tiposDano: ["concussao"] },
      hitResult: {
        attempts: [{ hit: true, critical: false }],
        weapon: { id: "weapon_001", profileIndex: 0 },
      },
      rollDamage,
      rollWeaponItem,
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].type, "weapon");
  });
});
