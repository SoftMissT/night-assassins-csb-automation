import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";

const {
  getAwakeningCD,
  checkAwakeningQualification,
  isNascidoMarcado,
  calculateMarkDamage,
  activateMark,
  deactivateMark,
  getMarkSummary,
} = await import("../scripts/marca-cacador-service.mjs");

function makeProps(overrides = {}) {
  return {
    hab_escolhida: "",
    origem: "",
    classe: "",
    nivel: "12",
    marca_ativa: "0",
    marca_dano_dados: "0",
    marca_dano_faces: "0",
    marca_anos_queimados: "0",
    marca_despertada: "0",
    ...overrides,
  };
}

function makeActor(propsOverrides = {}) {
  const props = makeProps(propsOverrides);
  return {
    system: { props },
    update: mock.fn(async () => {}),
  };
}

describe("marca-cacador-service", () => {
  describe("getAwakeningCD", () => {
    it("retorna CD 18 para Exterminador semvantagens", () => {
      assert.equal(getAwakeningCD(makeProps()), 18);
    });

    it("retorna CD 16 para Descendente Perdido", () => {
      assert.equal(getAwakeningCD(makeProps({ origem: "Descendente Perdido" })), 16);
    });

    it("retorna CD 14 para Marca do Destino", () => {
      assert.equal(getAwakeningCD(makeProps({ hab_escolhida: "hab_escolhida_marca_destino" })), 14);
    });

    it("retorna 0 (auto) para Descendente Perdido + Marca do Destino", () => {
      const props = makeProps({
        hab_escolhida: "hab_escolhida_marca_destino",
        origem: "Descendente Perdido",
      });
      assert.equal(getAwakeningCD(props), 0);
    });
  });

  describe("checkAwakeningQualification", () => {
    it("rejeita nao-Exterminadores", () => {
      const r = checkAwakeningQualification(makeActor({ classe: "Samurai" }));
      assert.equal(r.ok, false);
      assert.match(r.reason, /Exterminadores/);
    });

    it("rejeita nivel abaixo de 12", () => {
      const r = checkAwakeningQualification(makeActor({ classe: "Exterminador", nivel: "10" }));
      assert.equal(r.ok, false);
      assert.match(r.reason, /nivel 12/);
    });

    it("aceita Exterminador nivel 12", () => {
      const r = checkAwakeningQualification(makeActor({ classe: "Exterminador", nivel: "12" }));
      assert.equal(r.ok, true);
    });
  });

  describe("isNascidoMarcado", () => {
    it("retorna false sem vantagens", () => {
      assert.equal(isNascidoMarcado(makeProps()), false);
    });

    it("retorna false so com Marca do Destino", () => {
      assert.equal(isNascidoMarcado(makeProps({ hab_escolhida: "hab_escolhida_marca_destino" })), false);
    });

    it("retorna false so com Descendente Perdido", () => {
      assert.equal(isNascidoMarcado(makeProps({ origem: "Descendente Perdido" })), false);
    });

    it("retorna true com ambas", () => {
      const props = makeProps({
        hab_escolhida: "hab_escolhida_marca_destino",
        origem: "Descendente Perdido",
      });
      assert.equal(isNascidoMarcado(props), true);
    });
  });

  describe("calculateMarkDamage", () => {
    it("Normal: 1 ano = 1d12", () => {
      const { formula } = calculateMarkDamage(makeActor(), 1);
      assert.equal(formula, "1d12");
    });

    it("Normal: 3 anos = 3d12", () => {
      const { formula } = calculateMarkDamage(makeActor(), 3);
      assert.equal(formula, "3d12");
    });

    it("Nascido Marcado: 1 grau = 1d20", () => {
      const actor = makeActor({
        hab_escolhida: "hab_escolhida_marca_destino",
        origem: "Descendente Perdido",
      });
      const { formula } = calculateMarkDamage(actor, 1);
      assert.equal(formula, "1d20");
    });

    it("Nascido Marcado: 2 graus = 2d20", () => {
      const actor = makeActor({
        hab_escolhida: "hab_escolhida_marca_destino",
        origem: "Descendente Perdido",
      });
      const { formula } = calculateMarkDamage(actor, 2);
      assert.equal(formula, "2d20");
    });
  });

  describe("activateMark / deactivateMark", () => {
    it("activateMark atualiza props corretamente", async () => {
      const actor = makeActor();
      const ok = await activateMark(actor, 2);
      assert.equal(ok, true);
      assert.equal(actor.update.mock.callCount(), 1);
      const patch = actor.update.mock.calls[0].arguments[0];
      assert.equal(patch["system.props.marca_ativa"], 1);
      assert.equal(patch["system.props.marca_dano_dados"], 2);
      assert.equal(patch["system.props.marca_dano_faces"], 12);
      assert.equal(patch["system.props.marca_anos_queimados"], 2);
    });

    it("deactivateMark zera props", async () => {
      const actor = makeActor({ marca_ativa: "1" });
      const ok = await deactivateMark(actor);
      assert.equal(ok, true);
      const patch = actor.update.mock.calls[0].arguments[0];
      assert.equal(patch["system.props.marca_ativa"], 0);
    });

    it("activateMark lancA erro sem actor", async () => {
      await assert.rejects(() => activateMark(null, 1), /actor is required/);
    });
  });

  describe("getMarkSummary", () => {
    it("retorna estado padrao", () => {
      const s = getMarkSummary(makeActor());
      assert.equal(s.nascido, false);
      assert.equal(s.despertada, false);
      assert.equal(s.ativa, false);
      assert.equal(s.anosQueimados, 0);
      assert.equal(s.awakeningCD, 18);
    });

    it("retorna estado Nascido Marcado", () => {
      const actor = makeActor({
        hab_escolhida: "hab_escolhida_marca_destino",
        origem: "Descendente Perdido",
        marca_despertada: "1",
        marca_ativa: "1",
        marca_anos_queimados: "2",
      });
      const s = getMarkSummary(actor);
      assert.equal(s.nascido, true);
      assert.equal(s.despertada, true);
      assert.equal(s.ativa, true);
      assert.equal(s.anosQueimados, 2);
      assert.equal(s.awakeningCD, 0);
    });
  });
});
