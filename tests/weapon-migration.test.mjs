import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { repairSlayerWeaponItems, weaponRepairChanges } from "../scripts/weapon-migration.mjs";

const armedItem = {
  id: "abc123",
  name: "Gilgamesh Yoroi do Sol",
  ownership: { default: 2 },
  system: {
    template: "NAWeaponTpl00001",
    props: {
      inventario_categoria: "arma",
      arma_nome: "Gilgamesh Yoroi do Sol",
      arma_propriedades: "Acuidade",
      arma_perfis_ataque: [
        { nome: "Ataque Base", dano_fixo: 4, tipos_dano: ["cortante"], atributos: [{ key: "DEX", multiplicador: 1 }] },
      ],
    },
  },
};

describe("weapon-migration", () => {
  it("gera o patch de resumos para uma arma com perfis", () => {
    const changes = weaponRepairChanges(armedItem);
    assert.ok(changes);
    assert.equal(changes._id, "abc123");
    assert.ok(changes["system.props.arma_perfis_ataque_json"]);
    assert.ok(changes["system.props.arma_mecanicas_json"]);
    assert.equal(changes["system.props.arma_perfis_resumo"], "Ataque Base");
    assert.equal(changes["system.props.arma_tipos_dano_resumo"], "cortante");
    assert.equal(changes["system.props.arma_atributos_resumo"], "DEX");
  });

  it("é idempotente: após aplicar, não gera novo patch", () => {
    const first = weaponRepairChanges(armedItem);
    assert.ok(first);
    const appliedProps = {
      ...armedItem.system.props,
      arma_perfis_ataque_json: first["system.props.arma_perfis_ataque_json"],
      arma_mecanicas_json: first["system.props.arma_mecanicas_json"],
      arma_perfis_resumo: first["system.props.arma_perfis_resumo"],
      arma_tipos_dano_resumo: first["system.props.arma_tipos_dano_resumo"],
      arma_atributos_resumo: first["system.props.arma_atributos_resumo"],
    };
    assert.equal(weaponRepairChanges({ ...armedItem, system: { ...armedItem.system, props: appliedProps } }), null);
  });

  it("ignora itens que não são armas", () => {
    assert.equal(weaponRepairChanges({ id: "x", name: "Erva", system: { props: { inventario_categoria: "item" } } }), null);
  });

  it("arma sem perfil de ataque ainda recebe correção de ownership (P0: player abre item)", () => {
    assert.deepEqual(
      weaponRepairChanges({ id: "x", name: "Adaga", system: { props: { inventario_categoria: "arma" } } }),
      { _id: "x", ownership: { default: 2 } },
    );
  });

  it("contabiliza Actors corrigidos e itens atualizados", async () => {
    let calls = 0;
    const actors = [{
      items: [
        armedItem,
        { id: "y", name: "Erva", system: { props: { inventario_categoria: "item" } } },
      ],
      updateEmbeddedDocuments(type, updates) {
        calls += 1;
        assert.equal(type, "Item");
        return Promise.resolve(updates);
      },
    }];
    const result = await repairSlayerWeaponItems({ actors });
    assert.equal(result.actors, 1);
    assert.equal(result.items, 1);
    assert.equal(calls, 1);
  });

  it("retorna vazio sem Actors no ambiente de testes", async () => {
    const result = await repairSlayerWeaponItems();
    assert.deepEqual(result, { actors: 0, items: 0 });
  });
});