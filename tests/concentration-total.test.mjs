import { describe, it } from "node:test";
import assert from "node:assert/strict";

const {
  getConcentrationStage,
  canActivateStage2,
  getConcentrationDuration,
  getMovementBonus,
  getVitBonus,
  getBreathingCostReduction,
  buildActivationPatch,
  buildEndDurationPatch,
  buildZeroPdrPatch,
  getConcentrationSummary,
} = await import("../scripts/concentration-total-service.mjs");

function makeProps(overrides = {}) {
  return {
    concentracao_total_constante: "0",
    concentracao_total_nivel: "0",
    concentracao_total_ativa: "0",
    concentracao_total_rodadas: "0",
    concentracao_total_rodadas_max: "0",
    pdr_slayer_atual_valor_display: "10",
    fdv_display: "5",
    status_slayer_exaustao: "0",
    ...overrides,
  };
}

describe("concentration-total-service", () => {
  describe("getConcentrationStage", () => {
    it("retorna 0 sem treinamento", () => {
      assert.equal(getConcentrationStage(makeProps()), 0);
    });

    it("retorna 2 com nível 2+", () => {
      assert.equal(getConcentrationStage(makeProps({ concentracao_total_nivel: "2" })), 2);
    });

    it("retorna 3 com constante", () => {
      assert.equal(getConcentrationStage(makeProps({ concentracao_total_constante: "1" })), 3);
    });
  });

  describe("canActivateStage2", () => {
    it("rejeita sem treinamento", () => {
      const r = canActivateStage2(makeProps());
      assert.equal(r.ok, false);
    });

    it("rejeita Estágio 3 (passivo)", () => {
      const r = canActivateStage2(makeProps({ concentracao_total_constante: "1" }));
      assert.equal(r.ok, false);
      assert.match(r.reason, /passiva/);
    });

    it("rejeita sem PDR", () => {
      const r = canActivateStage2(makeProps({ concentracao_total_nivel: "2", pdr_slayer_atual_valor_display: "0" }));
      assert.equal(r.ok, false);
      assert.match(r.reason, /Sem PDR/);
    });

    it("aceita Estágio 2 com PDR", () => {
      const r = canActivateStage2(makeProps({ concentracao_total_nivel: "2" }));
      assert.equal(r.ok, true);
    });
  });

  describe("getConcentrationDuration", () => {
    it("retorna FDV como duração", () => {
      assert.equal(getConcentrationDuration(makeProps({ fdv_display: "7" })), 7);
    });

    it("mínimo 1 rodada", () => {
      assert.equal(getConcentrationDuration(makeProps({ fdv_display: "0" })), 1);
    });
  });

  describe("getMovementBonus", () => {
    it("0 para não treinado", () => assert.equal(getMovementBonus(0), 0));
    it("1.5 para Estágio 2", () => assert.equal(getMovementBonus(2), 1.5));
    it("1.5 para Estágio 3", () => assert.equal(getMovementBonus(3), 1.5));
  });

  describe("getVitBonus", () => {
    it("0 para não treinado", () => assert.equal(getVitBonus(0), 0));
    it("2 para Estágio 2", () => assert.equal(getVitBonus(2), 2));
    it("1 para Estágio 3", () => assert.equal(getVitBonus(3), 1));
  });

  describe("getBreathingCostReduction", () => {
    it("sem redução para não treinado", () => {
      assert.equal(getBreathingCostReduction(0, 4), 4);
    });

    it("reduz 1 para Estágio 2 (mín 1)", () => {
      assert.equal(getBreathingCostReduction(2, 4), 3);
      assert.equal(getBreathingCostReduction(2, 1), 1);
    });

    it("reduz 1 para Estágio 3 (mín 1)", () => {
      assert.equal(getBreathingCostReduction(3, 7), 6);
    });
  });

  describe("patches", () => {
    it("buildActivationPatch ativa e define rodadas", () => {
      const patch = buildActivationPatch(makeProps({ fdv_display: "6" }));
      assert.equal(patch["system.props.concentracao_total_ativa"], 1);
      assert.equal(patch["system.props.concentracao_total_rodadas"], 6);
    });

    it("buildEndDurationPatch adiciona 1 exaustão", () => {
      const patch = buildEndDurationPatch(makeProps({ status_slayer_exaustao: "2" }), false);
      assert.equal(patch["system.props.concentracao_total_ativa"], 0);
      assert.equal(patch["system.props.status_slayer_exaustao"], 3);
    });

    it("buildEndDurationPatch sem exaustão para imunes", () => {
      const patch = buildEndDurationPatch(makeProps({ status_slayer_exaustao: "2" }), true);
      assert.equal(patch["system.props.status_slayer_exaustao"], 2);
    });

    it("buildZeroPdrPatch desativa", () => {
      const patch = buildZeroPdrPatch();
      assert.equal(patch["system.props.concentracao_total_ativa"], 0);
    });
  });

  describe("getConcentrationSummary", () => {
    it("estado padrão", () => {
      const s = getConcentrationSummary(makeProps());
      assert.equal(s.stage, 0);
      assert.equal(s.active, false);
    });

    it("Estágio 2 ativo", () => {
      const s = getConcentrationSummary(makeProps({
        concentracao_total_nivel: "2",
        concentracao_total_ativa: "1",
        concentracao_total_rodadas: "4",
        concentracao_total_rodadas_max: "6",
      }));
      assert.equal(s.stage, 2);
      assert.equal(s.active, true);
      assert.equal(s.roundsLeft, 4);
      assert.equal(s.vitBonus, 2);
    });
  });
});
