import { describe, it } from "node:test";
import assert from "node:assert/strict";

const {
  getRecoveryForms,
  getRecoveryForm,
  getRecoveryCD,
  canUseForm,
  calculatePdvRecovery,
  calculatePdrRecovery,
  getExpurgoRetestBonus,
  getChoqueIgnoreTurns,
  causesOfegante,
  buildFormEffect,
} = await import("../scripts/recovery-breathing-service.mjs");

function makeProps(overrides = {}) {
  return { vit_display: "4", fdv_display: "3", ...overrides };
}

describe("recovery-breathing-service", () => {
  describe("getRecoveryForms", () => {
    it("retorna 4 formas", () => {
      const forms = getRecoveryForms();
      assert.equal(Object.keys(forms).length, 4);
    });

    it("todas custam 0 PDR", () => {
      const forms = getRecoveryForms();
      for (const f of Object.values(forms)) {
        assert.equal(f.teste !== undefined, true);
      }
    });
  });

  describe("getRecoveryForm", () => {
    it("retorna forma por id", () => {
      const f = getRecoveryForm("coagulacao");
      assert.equal(f.nome, "Coagulação Forçada");
    });

    it("retorna null para id inválido", () => {
      assert.equal(getRecoveryForm("invalida"), null);
    });
  });

  describe("getRecoveryCD", () => {
    it("CD 14 para nível 1", () => assert.equal(getRecoveryCD(1), 14));
    it("CD 12 para nível 2", () => assert.equal(getRecoveryCD(2), 12));
    it("CD 10 para nível 3", () => assert.equal(getRecoveryCD(3), 10));
    it("CD 8 para nível 4", () => assert.equal(getRecoveryCD(4), 8));
    it("nível 5 usa CD 8", () => assert.equal(getRecoveryCD(5), 8));
  });

  describe("canUseForm", () => {
    it("coagulacao disponível no nível 1", () => {
      const r = canUseForm("coagulacao", 1);
      assert.equal(r.ok, true);
    });

    it("expurgo indisponível no nível 1", () => {
      const r = canUseForm("expurgo", 1);
      assert.equal(r.ok, false);
      assert.match(r.reason, /Nível de Respiração 2/);
    });

    it("expurgo disponível no nível 2", () => {
      const r = canUseForm("expurgo", 2);
      assert.equal(r.ok, true);
    });

    it("sinfonia indisponível no nível 2", () => {
      const r = canUseForm("sinfonia", 2);
      assert.equal(r.ok, false);
      assert.match(r.reason, /Nível de Respiração 3/);
    });

    it("sinfonia disponível no nível 3", () => {
      const r = canUseForm("sinfonia", 3);
      assert.equal(r.ok, true);
    });

    it("forma desconhecida", () => {
      const r = canUseForm("fantasma", 4);
      assert.equal(r.ok, false);
      assert.match(r.reason, /desconhecida/);
    });
  });

  describe("calculatePdvRecovery", () => {
    it("coagulacao nível 1: 2d6 + VIT", () => {
      const r = calculatePdvRecovery("coagulacao", 1, 4);
      assert.equal(r.formula, "2d6 + 4");
      assert.ok(r.amount >= 4);
    });

    it("coagulacao nível 3: 4d6 + VIT", () => {
      const r = calculatePdvRecovery("coagulacao", 3, 4);
      assert.equal(r.formula, "4d6 + 4");
      assert.ok(r.amount >= 4);
    });

    it("sinfonia nível 3: 6d8 + VIT×2", () => {
      const r = calculatePdvRecovery("sinfonia", 3, 4);
      assert.equal(r.formula, "6d8 + 4 × 2");
      assert.ok(r.amount >= 8);
    });

    it("sinfonia nível 4: 8d8 + VIT×2", () => {
      const r = calculatePdvRecovery("sinfonia", 4, 4);
      assert.equal(r.formula, "8d8 + 4 × 2");
      assert.ok(r.amount >= 8);
    });

    it("forma inválida retorna 0", () => {
      const r = calculatePdvRecovery("x", 1, 4);
      assert.equal(r.amount, 0);
    });
  });

  describe("calculatePdrRecovery", () => {
    it("coagulacao nível 1: 2d6 + FDV", () => {
      const r = calculatePdrRecovery("coagulacao", 1, 3);
      assert.equal(r.formula, "2d6 + 3");
      assert.ok(r.amount >= 3);
    });

    it("choque nível 2: 3d6 + FDV", () => {
      const r = calculatePdrRecovery("choque", 2, 3);
      assert.equal(r.formula, "3d6 + 3");
      assert.ok(r.amount >= 3);
    });

    it("sinfonia nível 4: 8d8 + FDV×2", () => {
      const r = calculatePdrRecovery("sinfonia", 4, 3);
      assert.equal(r.formula, "8d8 + 3 × 2");
      assert.ok(r.amount >= 6);
    });
  });

  describe("getExpurgoRetestBonus", () => {
    it("nível 2: +2", () => assert.equal(getExpurgoRetestBonus(2), 2));
    it("nível 3: +4", () => assert.equal(getExpurgoRetestBonus(3), 4));
    it("nível 4: +6", () => assert.equal(getExpurgoRetestBonus(4), 6));
  });

  describe("getChoqueIgnoreTurns", () => {
    it("nível 1: 1 rodada", () => assert.equal(getChoqueIgnoreTurns(1), 1));
    it("nível 2: 1 rodada", () => assert.equal(getChoqueIgnoreTurns(2), 1));
    it("nível 3: 2 rodadas", () => assert.equal(getChoqueIgnoreTurns(3), 2));
    it("nível 4: 2 rodadas", () => assert.equal(getChoqueIgnoreTurns(4), 2));
  });

  describe("causesOfegante", () => {
    it("sinfonia causa Ofegante", () => assert.equal(causesOfegante("sinfonia"), true));
    it("coagulacao não causa", () => assert.equal(causesOfegante("coagulacao"), false));
    it("expurgo não causa", () => assert.equal(causesOfegante("expurgo"), false));
    it("choque não causa", () => assert.equal(causesOfegante("choque"), false));
    it("forma inválida não causa", () => assert.equal(causesOfegante("x"), false));
  });

  describe("buildFormEffect", () => {
    it("coagulacao nível 1 completo", () => {
      const e = buildFormEffect("coagulacao", 1, makeProps());
      assert.equal(e.nome, "Coagulação Forçada");
      assert.equal(e.tipo, "Ação Especial");
      assert.equal(e.ofegante, false);
      assert.ok(e.pdvRecovery.amount > 0);
    });

    it("sinfonia nível 3 com Ofegante", () => {
      const e = buildFormEffect("sinfonia", 3, makeProps({ fdv_display: "5" }));
      assert.equal(e.ofegante, true);
      assert.ok(e.pdrRecovery.amount > 0);
    });

    it("expurgo com bônus reteste", () => {
      const e = buildFormEffect("expurgo", 3, makeProps());
      assert.equal(e.retesteBonus, 4);
    });

    it("choque com ignore exhaustion", () => {
      const e = buildFormEffect("choque", 3, makeProps());
      assert.equal(e.ignoreExhaustion, 2);
      assert.equal(e.pdvRecovery.amount, 0);
      assert.ok(e.pdrRecovery.amount > 0);
    });

    it("forma inválida retorna null", () => {
      assert.equal(buildFormEffect("x", 1, makeProps()), null);
    });
  });
});
