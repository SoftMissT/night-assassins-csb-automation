import assert from "node:assert/strict";
import test from "node:test";

import { STATUS_SLAYER } from "../scripts/constants.mjs";
import {
  clampExhaustion,
  formatStatusSummary,
  normalizeStatusKeys,
  parseStatusState,
  saveSlayerStatuses,
  validateStatusConfiguration,
} from "../scripts/status-service.mjs";
import { STATUS_SLAYER_DANO_CONTINUO } from "../scripts/constants.mjs";

test("somente os cinco status oficiais causam dano contínuo", () => {
  assert.deepEqual(STATUS_SLAYER_DANO_CONTINUO, [
    "sangramento", "hemorragia", "envenenamento", "corroido", "em_chamas",
  ]);
  assert.ok(!STATUS_SLAYER_DANO_CONTINUO.includes("vulneravel"));
  assert.ok(!STATUS_SLAYER_DANO_CONTINUO.includes("fratura"));
  assert.ok(!STATUS_SLAYER_DANO_CONTINUO.includes("corrupcao"));
});

test("catálogo Slayer contém todos os status sem duplicar Resistência ou Ferida", () => {
  assert.equal(STATUS_SLAYER.length, 36);
  assert.equal(new Set(STATUS_SLAYER.map(({ key }) => key)).size, STATUS_SLAYER.length);
  assert.ok(STATUS_SLAYER.some(({ key }) => key === "vantagem"));
  assert.ok(STATUS_SLAYER.some(({ key }) => key === "fadiga_espiritual"));
  assert.ok(!STATUS_SLAYER.some(({ key }) => key === "resistencia" || key === "ferida"));
});

test("normaliza status, estado persistido e Exaustão", () => {
  assert.deepEqual(normalizeStatusKeys(["VANTAGEM", "invalido", "vantagem", "atordoamento"]), ["vantagem", "atordoamento"]);
  assert.equal(clampExhaustion(12), 8);
  assert.equal(clampExhaustion(-2), 0);
  assert.deepEqual(parseStatusState('{"active":["confuso"],"exhaustion":3}'), {
    version: 2, active: ["confuso"], exhaustion: 3, effects: {}, exhaustionMilestones: [],
  });
  assert.deepEqual(parseStatusState('<span>{&quot;active&quot;:[&quot;vantagem&quot;],&quot;exhaustion&quot;:0}</span>').active, ["vantagem"]);
  assert.equal(formatStatusSummary(["confuso"], 3), "Exaustão 3 · Confuso");
});

test("salva status e Exaustão em uma atualização atômica", async () => {
  let update;
  const actor = { update: async (...args) => { update = args; } };
  const result = await saveSlayerStatuses(actor, ["vulneravel", "vulneravel", "flanqueado"], 6);

  assert.deepEqual(result.active, ["vulneravel", "flanqueado"]);
  assert.equal(result.exhaustion, 6);
  assert.equal(result.summary, "Exaustão 6 · Vulnerável · Flanqueado");
  assert.deepEqual(update[0], {
    "system.props.status_slayer_dados": '{"version":2,"active":["vulneravel","flanqueado"],"exhaustion":6,"effects":{},"exhaustionMilestones":[]}',
    "system.props.status_slayer_resumo": "Exaustão 6 · Vulnerável · Flanqueado",
    "system.props.status_slayer_exaustao": 6,
  });
  assert.deepEqual(update[1], { naCsbAutomation: true });
});

test("Sangramento exige dano e quantidade de turnos da fonte", () => {
  assert.deepEqual(validateStatusConfiguration(["sangramento"], {
    sangramento: { damageFormula: "", remainingTurns: null },
  }), [
    "Sangramento: informe o dano por turno.",
    "Sangramento: informe a quantidade de turnos.",
  ]);
  assert.deepEqual(validateStatusConfiguration(["sangramento"], {
    sangramento: { damageFormula: "1d6", remainingTurns: 3 },
  }), []);
});
