import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  oniRank,
  oniSpecializationRank,
  oniKekkijutsuRank,
  oniUnarmedProfile,
  oniRegenerationProfile,
  oniLegendaryActions,
  oniRandomPdvRequirements,
  missingOniPdvGains,
  calculateOniResources,
} from "../scripts/oni/progression-service.mjs";

describe("Progressão Oni 1–20", () => {
  describe("Rank da Especialização — decisão do Operador (modelo 1B)", () => {
    const tabela = [
      [2, null], [3, "C"], [6, "C"], [7, "B"], [11, "B"],
      [12, "A"], [15, "A"], [16, "S"], [18, "S"], [19, "SS"], [20, "SS"],
    ];
    for (const [level, expected] of tabela) {
      it(`N${level} → ${expected ?? "sem rank"}`, () => {
        assert.equal(oniSpecializationRank(level), expected);
      });
    }
  });

  describe("Patente automática", () => {
    it("faixas e nomes específicos", () => {
      assert.equal(oniRank(1).title, "Oni Recém-Transformado");
      assert.equal(oniRank(6).band, "oni");
      assert.equal(oniRank(7).title, "Candidato às Doze Kizuki");
      assert.equal(oniRank(8).title, "Lua Inferior Seis");
      assert.equal(oniRank(13).band, "lua_inferior");
      assert.equal(oniRank(14).title, "Lua Superior Seis");
      assert.equal(oniRank(19).band, "lua_superior");
      assert.equal(oniRank(20).title, "Rei dos Onis");
    });
  });

  describe("Dano desarmado por nível", () => {
    it("N1 sem dado, sobrenatural só a partir de N4", () => {
      assert.equal(oniUnarmedProfile(1).formula, "2+FOR");
      assert.equal(oniUnarmedProfile(1).supernatural, false);
      assert.equal(oniUnarmedProfile(4).formula, "1d6+FOR");
      assert.equal(oniUnarmedProfile(4).supernatural, true);
    });
    it("escalada marcial e garras/mordida", () => {
      assert.equal(oniUnarmedProfile(10).formula, "2d8+FOR");
      assert.equal(oniUnarmedProfile(13).formula, "3d8+FOR");
      assert.equal(oniUnarmedProfile(16).formula, "4d10+FOR");
      assert.equal(oniUnarmedProfile(20).formula, "6d10+FOR");
      const claw = oniUnarmedProfile(7, "clawBite");
      assert.equal(claw.attribute, "DEX");
      assert.equal(claw.formula, "2d6+DEX");
    });
  });

  describe("Regeneração por faixa", () => {
    it("gates e fórmulas", () => {
      assert.equal(oniRegenerationProfile(1).available, false);
      const n2 = oniRegenerationProfile(2);
      assert.deepEqual(n2.allowedActions, ["special"]);
      assert.equal(n2.activeFormula, "1d4+VIT");
      assert.equal(oniRegenerationProfile(5).activeFormula, "1d6+VIT");
      const n9 = oniRegenerationProfile(9);
      assert.equal(n9.activeFormula, "2d4+VIT");
      assert.ok(n9.allowedActions.includes("unique"));
      assert.equal(n9.reattachAvailable, true);
      assert.equal(oniRegenerationProfile(13).automaticStartTurnFormula, "VIT");
      assert.equal(oniRegenerationProfile(17).limbsRegrowNextTurn, true);
    });
  });

  describe("Ações Lendárias", () => {
    it("N12=0 · N13=1 · N17=2 · N19=3", () => {
      assert.equal(oniLegendaryActions(12), 0);
      assert.equal(oniLegendaryActions(13), 1);
      assert.equal(oniLegendaryActions(17), 2);
      assert.equal(oniLegendaryActions(19), 3);
    });
  });

  describe("Ledger de ganhos aleatórios de PDV (níveis 2–12)", () => {
    it("N1 não exige nenhum ganho", () => {
      const req = oniRandomPdvRequirements(1, {});
      assert.equal(req.complete, true);
      assert.equal(req.required.length, 0);
    });

    it("level jump N10 lista exatamente os ganhos 2..10 pendentes", () => {
      const missing = missingOniPdvGains(10, {});
      assert.deepEqual(missing.map((entry) => entry.level), [2, 3, 4, 5, 6, 7, 8, 9, 10]);
    });

    it("persistidos nunca rerrolam e somam uma única vez", () => {
      const persisted = { pdv_oni_ganho_nvl2: 3, pdv_oni_ganho_nvl3: 4 };
      const first = oniRandomPdvRequirements(5, persisted);
      assert.equal(first.missing.length, 2); // nvl4 e nvl5
      assert.equal(first.total, 7);
      assert.equal(oniRandomPdvRequirements(5, persisted).total, 7); // estável
    });

    it("reduzir nível preserva histórico dos níveis acima", () => {
      const history = { pdv_oni_ganho_nvl2: 3, pdv_oni_ganho_nvl9: 5 };
      const atEight = oniRandomPdvRequirements(8, history);
      assert.equal(atEight.total, 3); // nvl9 ignorado enquanto N8
      assert.equal(history.pdv_oni_ganho_nvl9, 5); // não apagado
    });

    it("aceita formato indexado legado", () => {
      const req = oniRandomPdvRequirements(3, { 2: 2 });
      assert.equal(req.total, 2);
      assert.equal(req.complete, false);
    });
  });

  describe("PDV/PDK máximos calculados", () => {
    it("N1: só origem", () => {
      const r = calculateOniResources({ level: 1, originPdv: 18, originPdk: 8, vitality: 3 });
      assert.equal(r.pdvMaximum, 18);
      assert.equal(r.pdkMaximum, 8);
      assert.equal(r.randomPdvComplete, true);
    });

    it("N5: origem + ganhos rolados 2..5 (sem fixo)", () => {
      const persisted = { pdv_oni_ganho_nvl2: 2, pdv_oni_ganho_nvl3: 3, pdv_oni_ganho_nvl4: 4, pdv_oni_ganho_nvl5: 5 };
      const r = calculateOniResources({ level: 5, originPdv: 20, originPdk: 8, vitality: 4, persistedPdvGains: persisted });
      assert.equal(r.breakdown.randomPdv, 14);
      assert.equal(r.pdvMaximum, 34);
      assert.equal(r.breakdown.pdkGained, 4 + 4 + 6 + 6); // níveis 2..5
      assert.equal(r.pdkMaximum, 8 + 20);
      assert.equal(r.randomPdvComplete, true);
    });

    it("N10 incompleto reporta faltantes sem quebrar o máximo parcial", () => {
      const r = calculateOniResources({ level: 10, originPdv: 28, originPdk: 18, vitality: 5, persistedPdvGains: {} });
      assert.equal(r.randomPdvComplete, false);
      assert.equal(r.missingPdvGains.length, 9);
      assert.ok(r.pdvMaximum >= 28);
    });

    it("N15/N20 aplicam ganhos fixos com VIT", () => {
      const persistedAll12 = {};
      let sum = 0;
      for (let lvl = 2; lvl <= 12; lvl += 1) { persistedAll12[`pdv_oni_ganho_nvl${lvl}`] = 1; sum += 1; }
      const n15 = calculateOniResources({ level: 15, originPdv: 30, originPdk: 24, vitality: 6, persistedPdvGains: persistedAll12 });
      // fixos 13,14,15 = 3 × (30+6)
      assert.equal(n15.breakdown.fixedPdv, 3 * 36);
      const n20 = calculateOniResources({ level: 20, originPdv: 30, originPdk: 24, vitality: 6, persistedPdvGains: persistedAll12 });
      // 13..15 = 36 cada; 16..19 = 46 cada; 20 = 50+30
      assert.equal(n20.breakdown.fixedPdv, 3 * 36 + 4 * 46 + 80);
      assert.equal(n20.breakdown.randomPdv, sum);
    });
  });

  describe("Kekkijutsu rank (referência consolidada)", () => {
    it("marcos canônicos", () => {
      assert.equal(oniKekkijutsuRank(2), null);
      assert.equal(oniKekkijutsuRank(3), "inicial");
      assert.equal(oniKekkijutsuRank(5), "C");
      assert.equal(oniKekkijutsuRank(12), "A");
      assert.equal(oniKekkijutsuRank(18), "SS");
    });
  });
});
