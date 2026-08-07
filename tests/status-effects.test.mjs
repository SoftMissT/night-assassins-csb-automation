import assert from "node:assert/strict";
import test from "node:test";

import {
  getDamageStatusEffects,
  getRollStatusEffects,
  getStatusCapabilities,
  isReactionBlocked,
  mergeRollMode,
} from "../scripts/status-effects.mjs";

function props(active = [], exhaustion = 0) {
  return {
    status_slayer_dados: JSON.stringify({ version: 1, active, exhaustion }),
    status_slayer_exaustao: exhaustion,
  };
}

test("Vantagem e Desvantagem opostas se anulam", () => {
  assert.equal(mergeRollMode("advantage", "disadvantage"), "normal");
  assert.equal(mergeRollMode("normal", "advantage"), "advantage");
});

test("Fadiga Mental dá Desvantagem em SAB", () => {
  const result = getRollStatusEffects(props(["fadiga_mental"]), { test: "Percepção", attr: "SAB" });
  assert.equal(result.mode, "disadvantage");
  assert.equal(getRollStatusEffects(props(["fadiga_mental"]), { test: "Iniciativa", attr: "DEX" }).mode, "disadvantage");
});

test("Cegueira Parcial penaliza Acerto e Defesa", () => {
  assert.equal(getRollStatusEffects(props(["cegueira_parcial"]), { test: "Acerto", attr: "FOR", kind: "attack" }).modifier, -2);
  assert.equal(getRollStatusEffects(props(["cegueira_parcial"]), { test: "Esquiva", attr: "DEX", kind: "defense" }).modifier, -2);
});

test("Fadiga Espiritual afeta FDV e aumenta o custo de PDR", () => {
  assert.equal(getRollStatusEffects(props(["fadiga_espiritual"]), { test: "Resistência", attr: "FDV" }).modifier, -2);
  assert.equal(getRollStatusEffects(props(["fadiga_espiritual"]), { test: "Concentração", attr: "FDV" }).modifier, 0);
  assert.equal(getDamageStatusEffects(props(["fadiga_espiritual"])).pdrSurcharge, 1);
});

test("Fadiga Corporal impede crítico e Exaustão reduz ataque e dano", () => {
  const current = props(["fadiga_corporal"], 4);
  const attack = getRollStatusEffects(current, { test: "Acerto", attr: "DEX", kind: "attack" });
  const damage = getDamageStatusEffects(current);
  assert.equal(attack.mode, "disadvantage");
  assert.equal(attack.modifier, -3);
  assert.equal(damage.criticalAllowed, false);
  assert.equal(damage.modifier, -1);
});

test("Atordoamento bloqueia ações e Frenesi bloqueia Reações", () => {
  assert.equal(getRollStatusEffects(props(["atordoamento"]), { test: "Acerto", kind: "attack" }).blocked, true);
  assert.equal(getRollStatusEffects(props(["atordoamento"]), { test: "Bloqueio", kind: "defense" }).blocked, false);
  assert.equal(isReactionBlocked(props(["frenesi"])), true);
});

test("Paralisia falha FOR/DEX fora da Defesa", () => {
  assert.equal(getRollStatusEffects(props(["paralisia"]), { test: "Atletismo", attr: "FOR" }).autoFail, true);
  assert.equal(getRollStatusEffects(props(["paralisia"]), { test: "Esquiva", attr: "DEX", kind: "defense" }).autoFail, false);
});

test("Corrupção drena FDV por pilha", () => {
  const current = {
    status_slayer_dados: JSON.stringify({ version: 2, active: ["corrupcao"], exhaustion: 0, effects: { corrupcao: { stacks: 3 } } }),
  };
  assert.equal(getRollStatusEffects(current, { test: "Resistência", attr: "FDV" }).modifier, -3);
});

test("capacidades refletem movimento, silêncio, cura e hipotermia", () => {
  const current = {
    status_slayer_dados: JSON.stringify({
      version: 2,
      active: ["fratura", "hipotermia", "silenciado", "regeneracao_suprimida"],
      exhaustion: 3,
      effects: { hipotermia: { stacks: 2 } },
    }),
  };
  assert.deepEqual(getStatusCapabilities(current), {
    targetable: true,
    movementAllowed: false,
    movementMultiplier: 0.5,
    movementPenaltyMeters: 4.5,
    spiritualActionsAllowed: false,
    sprintAllowed: true,
    healingMultiplier: 0.5,
    incomingDemonicDamageBonus: 0,
    reactionsAllowed: true,
    ignoresFear: false,
    ignoresConfusion: false,
    deadFromExhaustion: false,
  });
});
