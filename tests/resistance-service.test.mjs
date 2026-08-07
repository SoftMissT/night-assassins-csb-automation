import { setupFoundryMocks } from "./fixtures/foundry-mock.mjs";
setupFoundryMocks();

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatResistanceSummary, normalizeResistanceKeys, saveActorResistances } from "../scripts/resistance-service.mjs";

describe("resistance-service", () => {
  it("normaliza, remove duplicatas e ignora tipos desconhecidos", () => {
    assert.deepEqual(normalizeResistanceKeys("fogo,cortante,FOGO,inexistente"), ["fogo", "cortante"]);
  });

  it("produz resumo legível", () => {
    assert.equal(formatResistanceSummary(["cortante", "necrotico"]), "Cortante · Necrótico");
    assert.equal(formatResistanceSummary([]), "Nenhuma resistência");
  });

  it("salva dados e resumo no contrato Slayer", async () => {
    let captured = null;
    const actor = { update: async (patch, options) => { captured = { patch, options }; } };
    const result = await saveActorResistances(actor, ["fogo", "ferida"], "slayer");
    assert.deepEqual(result, { keys: ["fogo", "ferida"], summary: "Fogo · Ferida" });
    assert.deepEqual(captured, {
      patch: {
        "system.props.status_slayer_resistencias_dados": "fogo,ferida",
        "system.props.status_slayer_resistencias_resumo": "Fogo · Ferida",
      },
      options: { naCsbAutomation: true },
    });
  });
});

