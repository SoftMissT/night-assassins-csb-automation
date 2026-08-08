import assert from "node:assert/strict";
import test from "node:test";

import { setupFoundryMocks } from "./fixtures/foundry-mock.mjs";
setupFoundryMocks();

globalThis.ChatMessage.create = async () => {};
let rollTotal = 4;
let lastFormula = "";
Roll.create = (formula) => {
  lastFormula = formula;
  return { evaluate: async () => ({ total: rollTotal, toMessage: async () => {} }) };
};

import {
  applySlayerDamage,
  movementBlocked,
  processActorStatusTiming,
  reconcileSlayerExhaustion,
  resolveIncomingDamage,
  resolveSlayerHealing,
} from "../scripts/status-engine.mjs";

function actorWith(props) {
  const actor = {
    id: "slayer-1",
    name: "Slayer",
    system: { props: { ...props } },
    async update(patch) {
      for (const [path, value] of Object.entries(patch)) {
        const key = path.replace("system.props.", "");
        actor.system.props[key] = value;
      }
    },
  };
  return actor;
}

test("Vulnerável e Exaustão 6 dobram somente dano de ataque", () => {
  const state = { active: ["vulneravel"], exhaustion: 0 };
  assert.deepEqual(resolveIncomingDamage(state, 7, { isAttack: true }), { damage: 14, vulnerable: true });
  assert.deepEqual(resolveIncomingDamage(state, 7, { isAttack: false }), { damage: 7, vulnerable: false });
  assert.equal(resolveIncomingDamage({ active: [], exhaustion: 6 }, 7, { isAttack: true }).damage, 14);
});

test("dano recebido remove Confuso, Distraído e Sonhando", async () => {
  const actor = actorWith({
    pdv_slayer_dano_tomado: 2,
    status_slayer_dados: JSON.stringify({ version: 2, active: ["confuso", "distraido", "sonhando"], exhaustion: 0, effects: {}, exhaustionMilestones: [] }),
  });
  const result = await applySlayerDamage(actor, 5, { isAttack: true });
  assert.equal(actor.system.props.pdv_slayer_dano_tomado, 7);
  assert.deepEqual(result.removed, ["confuso", "distraido", "sonhando"]);
  assert.deepEqual(JSON.parse(actor.system.props.status_slayer_dados).active, []);
});

test("Sangramento causa dano no início do turno e expira", async () => {
  rollTotal = 3;
  const actor = actorWith({
    pdv_slayer_dano_tomado: 0,
    status_slayer_dados: JSON.stringify({
      version: 2,
      active: ["sangramento"],
      exhaustion: 0,
      effects: { sangramento: { damageFormula: "1d6", remainingTurns: 1, stacks: 1, tick: "start" } },
      exhaustionMilestones: [],
    }),
  });
  await processActorStatusTiming(actor, "start");
  assert.equal(lastFormula, "1d6");
  assert.equal(actor.system.props.pdv_slayer_dano_tomado, 3);
  assert.deepEqual(JSON.parse(actor.system.props.status_slayer_dados).active, []);
});

test("Sangramento mantém e reduz a quantidade de turnos", async () => {
  rollTotal = 2;
  const actor = actorWith({
    pdv_slayer_dano_tomado: 0,
    status_slayer_dados: JSON.stringify({
      version: 2,
      active: ["sangramento"],
      exhaustion: 0,
      effects: { sangramento: { damageFormula: "1d4", remainingTurns: 3, stacks: 1, tick: "start" } },
      exhaustionMilestones: [],
    }),
  });
  await processActorStatusTiming(actor, "start");
  const state = JSON.parse(actor.system.props.status_slayer_dados);
  assert.equal(actor.system.props.pdv_slayer_dano_tomado, 2);
  assert.equal(state.effects.sangramento.remainingTurns, 2);
  assert.ok(state.active.includes("sangramento"));
});

test("Sangramento incompleto não causa dano nem perde duração", async () => {
  globalThis.ui.notifications.error = () => {};
  const actor = actorWith({
    pdv_slayer_dano_tomado: 0,
    status_slayer_dados: JSON.stringify({
      version: 2, active: ["sangramento"], exhaustion: 0,
      effects: { sangramento: { damageFormula: "", remainingTurns: null, stacks: 1, tick: "start" } },
      exhaustionMilestones: [],
    }),
  });
  await processActorStatusTiming(actor, "start");
  const state = JSON.parse(actor.system.props.status_slayer_dados);
  assert.equal(actor.system.props.pdv_slayer_dano_tomado, 0);
  assert.equal(state.effects.sangramento.remainingTurns, null);
  assert.ok(state.active.includes("sangramento"));
});

test("Corroído soma um dado por pilha", async () => {
  rollTotal = 8;
  const actor = actorWith({
    pdv_slayer_dano_tomado: 0,
    status_slayer_dados: JSON.stringify({
      version: 2, active: ["corroido"], exhaustion: 0,
      effects: { corroido: { damageFormula: "1d4", remainingTurns: null, stacks: 2, tick: "start" } }, exhaustionMilestones: [],
    }),
  });
  await processActorStatusTiming(actor, "start");
  assert.equal(lastFormula, "(1d4) + (1d4)");
  assert.equal(actor.system.props.pdv_slayer_dano_tomado, 8);
});

test("Exaustão 3 bloqueia movimento", () => {
  assert.equal(movementBlocked({ status_slayer_exaustao: 3 }), true);
  assert.equal(movementBlocked({ status_slayer_exaustao: 2 }), false);
});

test("Exaustão 5 perde metade do PDV uma única vez", async () => {
  globalThis.game.combats = [];
  const actor = actorWith({
    pdv_slayer_atual_valor_display: 21,
    pdv_slayer_dano_tomado: 4,
    status_slayer_exaustao: 5,
    status_slayer_dados: JSON.stringify({ version: 2, active: [], exhaustion: 5, effects: {}, exhaustionMilestones: [] }),
  });
  const first = await reconcileSlayerExhaustion(actor);
  const second = await reconcileSlayerExhaustion(actor);
  assert.equal(first.extraDamage, 10);
  assert.equal(actor.system.props.pdv_slayer_dano_tomado, 14);
  assert.deepEqual(second.reached, []);
});

test("Exaustão 5 usa o PDV atual numérico e ignora números do CSS do Label", async () => {
  globalThis.game.combats = [];
  const actor = actorWith({
    pdv_slayer_conta_atual: 14,
    pdv_slayer_atual_valor_display: `<div><style>@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@700');</style><span style="font-size:18px">14</span></div>`,
    pdv_slayer_dano_tomado: 0,
    status_slayer_exaustao: 5,
    status_slayer_dados: JSON.stringify({ version: 2, active: [], exhaustion: 5, effects: {}, exhaustionMilestones: [] }),
  });
  const result = await reconcileSlayerExhaustion(actor);
  assert.equal(result.extraDamage, 7);
  assert.equal(actor.system.props.pdv_slayer_dano_tomado, 7);
});

test("Exaustão 5 deriva o atual das parcelas canônicas quando o Label calculado está contaminado", async () => {
  globalThis.game.combats = [];
  const actor = actorWith({
    pdv_slayer_total_conta: 14,
    pdv_slayer_conta_atual: "<span style=\"font-size:2px\">13</span>",
    pdv_slayer_dano_tomado: 1,
    pdv_slayer_dano_ferida: 0,
    pdv_slayer_curado: 0,
    pdv_slayer_extra: 0,
    status_slayer_exaustao: 5,
    status_slayer_dados: JSON.stringify({ version: 2, active: [], exhaustion: 5, effects: {}, exhaustionMilestones: [] }),
  });
  const result = await reconcileSlayerExhaustion(actor);
  assert.equal(result.extraDamage, 6);
  assert.equal(actor.system.props.pdv_slayer_dano_tomado, 7);
});

test("Corrupção e Regeneração Suprimida reduzem cura pela metade", () => {
  const props = {
    pdv_slayer_curado: 2,
    status_slayer_dados: JSON.stringify({ version: 2, active: ["corrupcao"], exhaustion: 0, effects: {}, exhaustionMilestones: [] }),
  };
  assert.deepEqual(resolveSlayerHealing(props, 9), { value: 5, multiplier: 0.5, requestedDelta: 7 });
});

test("Exaustão 8 impede qualquer cura", () => {
  const props = { pdv_slayer_curado: 2, status_slayer_exaustao: 8 };
  assert.deepEqual(resolveSlayerHealing(props, 12), { value: 2, multiplier: 0, requestedDelta: 10 });
});
