import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { setupFoundryMocks } from "./fixtures/foundry-mock.mjs";
import { makeActor } from "./fixtures/actor.mjs";

setupFoundryMocks();

import { buildAttackSelection, createAttackBuilderModel } from "../scripts/items/attack-builder.mjs";

function weapon(actor) {
  return {
    id: "weapon-1",
    uuid: "Actor.slayer.Item.weapon-1",
    name: "Katana",
    parent: actor,
    system: { template: "NAWeaponTpl00001", props: {
      arma_nome: "Katana",
      arma_perfis_ataque: [{ nome: "Corte", dano_dados: "1d8", dano_fixo: 2, atributos: [{ key: "FOR", multiplicador: 1 }], tipos_dano: ["cortante"] }],
    } },
  };
}

function breath(actor) {
  return {
    id: "breath-1",
    uuid: "Actor.slayer.Item.breath-1",
    name: "Primeira Forma",
    parent: actor,
    system: { template: "NABreathTpl00001", props: {
      forma_id: "teste_01",
      respiracao_nome: "Teste",
      nome_forma: "Primeira Forma",
      tipo_manobra: "Ação Especial",
      nivel_req: 1,
      nvl2_dano: "2d6 + @dex",
      nvl2_custo: 3,
      nvl2_tipos_dano: ["fogo"],
    } },
  };
}

describe("attack-builder", () => {
  it("monta arma e Respiração em parcelas separadas com atributos finais", () => {
    const actor = makeActor({ props: { nome_slayer: "Slayer", nvl_respiracao_num: 2, for_display: 5, dex_display: 4 } });
    actor.items = [weapon(actor), breath(actor)];
    const model = createAttackBuilderModel(actor);
    const result = buildAttackSelection(model, { weaponKey: model.weapons[0].key, breathingKey: model.breathing[0].key });

    assert.equal(result.entradas.length, 2);
    assert.deepEqual(result.entradas[0], {
      sourceId: model.weapons[0].definition.id,
      sourceLabel: "Corte",
      tipoAcao: "",
      dado: "1d8",
      fixo: 7,
      attrs: [],
      tiposDano: ["cortante"],
    });
    assert.equal(result.entradas[1].dado, "2d6 + 4");
    assert.equal(result.entradas[1].tipoAcao, "especial");
    assert.deepEqual(result.entradas[1].tiposDano, ["fogo"]);
    assert.equal(result.resourceCost, 3);
  });

  it("oferece ataques desarmados escalonados para Oni", () => {
    const actor = makeActor({ props: { nome_oni: "Akuma", nvl_num: 10, for_display: 6, dex_display: 5 } });
    actor.items = [];
    const model = createAttackBuilderModel(actor);
    const result = buildAttackSelection(model, { innateKey: model.innate[0].key });
    assert.equal(model.ownerKind, "oni");
    assert.equal(model.breathing.length, 0);
    assert.equal(result.entradas[0].dado, "2d8");
    assert.equal(result.entradas[0].fixo, 6);
    assert.equal(result.resourceKey, "pdk");
  });

  it("ignora Formas passivas e preserva o modo manual", () => {
    const actor = makeActor({ props: { nvl_respiracao_num: 1 } });
    const passive = breath(actor);
    passive.system.props.forma_passiva = 1;
    passive.system.props.tipo_manobra = "Passiva";
    actor.items = [passive];
    const model = createAttackBuilderModel(actor);
    const result = buildAttackSelection(model, { manual: true });

    assert.equal(model.breathing.length, 0);
    assert.equal(result.manual, true);
    assert.deepEqual(result.entradas, []);
  });
});
