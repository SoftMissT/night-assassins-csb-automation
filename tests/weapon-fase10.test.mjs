import { describe, it } from "node:test";
import assert from "node:assert/strict";

const {
  checkAmmoAvailable,
  checkAdapterStatus,
  consumeAmmoPatch,
  getWeaponInlineState,
  weaponAmmoState,
} = await import("../scripts/weapon-service.mjs");

function makeItemProps(overrides = {}) {
  return {
    arma_municao_capacidade: 0,
    arma_municao_atual: 0,
    arma_adapter_necessario: 0,
    arma_adapter_instalado: 0,
    ...overrides,
  };
}

function makeActorProps(overrides = {}) {
  return {
    nvl_num: "6",
    ...overrides,
  };
}

describe("weapon-service — Fase 10", () => {
  describe("checkAmmoAvailable", () => {
    it("ok sem sistema de munição", () => {
      const r = checkAmmoAvailable(makeItemProps(), { ataques: 1 });
      assert.equal(r.ok, true);
      assert.equal(r.current, null);
    });

    it("ok com munição suficiente", () => {
      const r = checkAmmoAvailable(
        makeItemProps({ arma_municao_capacidade: 10, arma_municao_atual: 5 }),
        { ataques: 2 }
      );
      assert.equal(r.ok, true);
      assert.equal(r.current, 5);
      assert.equal(r.required, 2);
    });

    it("falha com munição insuficiente", () => {
      const r = checkAmmoAvailable(
        makeItemProps({ arma_municao_capacidade: 10, arma_municao_atual: 1 }),
        { ataques: 2 }
      );
      assert.equal(r.ok, false);
      assert.match(r.reason, /insuficiente/);
      assert.equal(r.current, 1);
    });

    it("falha com munição zero", () => {
      const r = checkAmmoAvailable(
        makeItemProps({ arma_municao_capacidade: 10, arma_municao_atual: 0 }),
        { ataques: 1 }
      );
      assert.equal(r.ok, false);
    });
  });

  describe("checkAdapterStatus", () => {
    it("sem adapter", () => {
      const r = checkAdapterStatus(makeItemProps());
      assert.equal(r.required, false);
      assert.equal(r.pending, false);
    });

    it("adapter necessário e instalado", () => {
      const r = checkAdapterStatus(makeItemProps({
        arma_adapter_necessario: 1,
        arma_adapter_instalado: 1,
      }));
      assert.equal(r.required, true);
      assert.equal(r.installed, true);
      assert.equal(r.pending, false);
    });

    it("adapter necessário e NÃO instalado", () => {
      const r = checkAdapterStatus(makeItemProps({
        arma_adapter_necessario: 1,
        arma_adapter_instalado: 0,
      }));
      assert.equal(r.required, true);
      assert.equal(r.installed, false);
      assert.equal(r.pending, true);
    });
  });

  describe("consumeAmmoPatch", () => {
    it("null sem munição", () => {
      const r = consumeAmmoPatch(makeItemProps(), { ataques: 1 });
      assert.equal(r, null);
    });

    it("patch com munição", () => {
      const patch = consumeAmmoPatch(
        makeItemProps({ arma_municao_capacidade: 10, arma_municao_atual: 5 }),
        { ataques: 2 }
      );
      assert.ok(patch);
      assert.equal(patch["system.props.arma_municao_atual"], 3);
    });

    it("patch com munição zero após consumo", () => {
      const patch = consumeAmmoPatch(
        makeItemProps({ arma_municao_capacidade: 10, arma_municao_atual: 1 }),
        { ataques: 1 }
      );
      assert.ok(patch);
      assert.equal(patch["system.props.arma_municao_atual"], 0);
    });
  });

  describe("getWeaponInlineState", () => {
    it("estado básico", () => {
      const s = getWeaponInlineState(makeItemProps(), makeActorProps());
      assert.equal(s.rank, "B");
      assert.equal(s.ammoCurrent, null);
      assert.equal(s.adapterPending, false);
    });

    it("com munição e adapter pendente", () => {
      const s = getWeaponInlineState(
        makeItemProps({
          arma_municao_capacidade: 8,
          arma_municao_atual: 3,
          arma_adapter_necessario: 1,
          arma_adapter_instalado: 0,
        }),
        makeActorProps()
      );
      assert.equal(s.ammoCurrent, 3);
      assert.equal(s.ammoCapacity, 8);
      assert.equal(s.adapterPending, true);
    });
  });
});
