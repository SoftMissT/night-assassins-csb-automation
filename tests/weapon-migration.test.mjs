import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { repairSlayerWeaponItems, weaponRepairChanges } from "../scripts/weapon-migration.mjs";

const armedItem = {
  id: "abc123",
  name: "Gilgamesh Yoroi do Sol",
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

  it("ignora armas sem perfil de ataque", () => {
    assert.equal(weaponRepairChanges({ id: "x", name: "Adaga", system: { props: { inventario_categoria: "arma" } } }), null);
  });

  it("repara inventario_categoria ausente em Item criado direto do template (sem catálogo)", () => {
    const legacyItem = {
      id: "legacy1",
      name: "Espada Sem Nome",
      system: {
        template: "NAWeaponTpl00001",
        props: {
          // Sem inventario_categoria: reproduz Item criado via "Create Item" na
          // ficha (fora do fluxo de catálogo/compêndio) — causa raiz do crash
          // `equalText(item.inventario_categoria, 'arma')` com undefined.
          arma_nome: "Espada Sem Nome",
        },
      },
    };
    const changes = weaponRepairChanges(legacyItem);
    assert.ok(changes);
    assert.equal(changes._id, "legacy1");
    assert.equal(changes["system.props.inventario_categoria"], "arma");
  });

  it("não gera patch de categoria quando inventario_categoria já é 'arma'", () => {
    assert.equal(
      weaponRepairChanges({ id: "x", name: "Adaga", system: { props: { inventario_categoria: "arma" } } })?.["system.props.inventario_categoria"],
      undefined,
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