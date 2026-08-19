import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { breathingItemPatch, buildCanonicalBreathMap, repairBreathingItems } from "../scripts/breath-migration.mjs";

const canonicalForm = {
  type: "equippableItem",
  name: "Chamas — 2º Estilo Céu em Chamas Ascendentes",
  img: "icons/magic/fire/flame-burning-yellow.webp",
  system: {
    template: "NABreathTpl00001",
    props: {
      inventario_categoria: "respiracao",
      forma_id: "chamas_02",
      forma_ordem: 2,
      nome_forma: "Céu em Chamas Ascendentes",
      nome_jp: "Guren",
      respiracao_nome: "Chamas",
      tipo_manobra: "estilo",
      tipo_dano_base: "fogo",
      nivel_req: 6,
      tem_nvl1: 1,
      nvl1_custo: 4,
      nvl1_dano: "2d8",
      tem_nvl2: 0,
    },
  },
};

describe("breath-migration", () => {
  it("constrói o mapa canônico por nome e forma_id", () => {
    const map = buildCanonicalBreathMap([canonicalForm, { name: "Não Forma", type: "item" }]);
    assert.ok(map.byName.get("chamas2estiloceuemchamasascendentes"));
    assert.ok(map.byId.get("chamas_02"));
    assert.equal(map.byName.size, 1);
  });

  it("gera patch completo para item legado sem inventario_categoria", () => {
    const legacy = {
      id: "leg1",
      name: "Chamas — 2º Estilo Céu em Chamas Ascendentes",
      img: "icons/misc/placeholder.svg",
      flags: { "custom-system-builder": { unique: true } },
      system: {
        template: "NABreathTpl00001",
        props: { nome_forma: "Céu em Chamas Ascendentes", respiracao_nome: "Chamas" },
      },
    };
    const patch = breathingItemPatch(legacy, canonicalForm);
    assert.ok(patch);
    assert.equal(patch._id, "leg1");
    assert.equal(patch.name, canonicalForm.name);
    assert.equal(patch.img, canonicalForm.img);
    assert.equal(patch.system.template, "NABreathTpl00001");
    assert.equal(patch.system.props.inventario_categoria, "respiracao");
    assert.equal(patch.system.props.forma_id, "chamas_02");
    assert.equal(patch.system.props.nvl1_dano, "2d8");
    assert.ok(patch.flags["night-assassins-csb-automation"].breathRepaired);
  });

  it("é idempotente: item já canônico não gera patch", () => {
    assert.equal(breathingItemPatch(canonicalForm, canonicalForm), null);
  });

  it("corrige categoria de forma sem correspondência canônica", () => {
    const homebrew = {
      id: "hb1",
      name: "Forma Criativa",
      system: { template: "NABreathTpl00001", props: { forma_id: "hb_01", nome_forma: "Forma Criativa" } },
    };
    const patch = breathingItemPatch(homebrew, null);
    assert.ok(patch);
    assert.equal(patch["system.props.inventario_categoria"], "respiracao");
  });

  it("ignora itens não relacionados a respiração", () => {
    assert.equal(breathingItemPatch({ id: "x", name: "Erva", system: { props: { inventario_categoria: "item" } } }, null), null);
  });

  it("contabiliza Actors corrigidos e itens atualizados", async () => {
    let calls = 0;
    const actors = [{
      items: [
        { id: "leg2", name: canonicalForm.name, system: { template: "NABreathTpl00001", props: { nome_forma: "Céu em Chamas Ascendentes" } } },
        { id: "y", name: "Erva", system: { props: { inventario_categoria: "item" } } },
      ],
      updateEmbeddedDocuments(type, updates) {
        calls += 1;
        assert.equal(type, "Item");
        assert.ok(updates.some((u) => u._id === "leg2"));
        return Promise.resolve(updates);
      },
    }];
    globalThis.game = { packs: { get: () => ({ getDocuments: () => Promise.resolve([canonicalForm]) }) } };
    const result = await repairBreathingItems({ actors });
    assert.equal(result.actors, 1);
    assert.equal(result.items, 1);
    assert.equal(calls, 1);
    delete globalThis.game;
  });

  it("retorna vazio sem Actors no ambiente de testes", async () => {
    globalThis.game = { packs: { get: () => ({ getDocuments: () => Promise.resolve([canonicalForm]) }) } };
    const result = await repairBreathingItems();
    assert.deepEqual(result, { actors: 0, items: 0 });
    delete globalThis.game;
  });
});