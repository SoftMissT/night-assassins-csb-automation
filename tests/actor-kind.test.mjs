import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { actorKind, isOniActor, isSlayerActor, isOniMinionActor } from "../scripts/actor-kind.mjs";

describe("actor-kind", () => {
  it("classifica ONI antes de chaves Slayer herdadas", () => {
    assert.equal(actorKind({ system: { props: {
      classe_oni_escolha: "classe_oni_escolha",
      pdv_oni_total_conta: 40,
      pdv_slayer_total_valor: 20,
      pdr_slayer_total_valor: 10,
    } } }), "oni");
  });

  it("classifica Slayer sem marcador ONI", () => {
    assert.equal(actorKind({ system: { props: { nome_slayer: "Kwon", pdv_slayer_total_valor: 20 } } }), "slayer");
  });

  it("classifica Oni Minion pelo namespace oni_minion_*", () => {
    assert.equal(actorKind({ system: { props: {
      oni_minion_nome: "Lacaio",
      oni_minion_tipo: "Fraco",
      oni_minion_pdv_base: 10,
      oni_minion_pdk_base: 4,
    } } }), "oni_minion");
  });

  it("classifica Oni Minion pelo marcador de template oni_minion_template", () => {
    assert.equal(actorKind({ system: { template: "oni_minion_template", props: {} } }), "oni_minion");
  });

  it("Oni Minion tem precedência sobre chaves Oni herdadas", () => {
    assert.equal(actorKind({ system: { props: {
      oni_minion_nome: "Lacaio",
      oni_minion_pdv_base: 10,
      pdv_oni_total_conta: 40,
      pdk_oni_total_valor: 6,
    } } }), "oni_minion");
  });

  it("Oni Minion tem precedência sobre chaves Slayer herdadas", () => {
    assert.equal(actorKind({ system: { props: {
      oni_minion_nome: "Lacaio",
      nome_slayer: "Velho",
      pdv_slayer_total_valor: 20,
    } } }), "oni_minion");
  });

  it("retorna null para NPC sem marcadores Slayer/Oni/Minion", () => {
    assert.equal(actorKind({ system: { props: { nome_npc: "Taverneiro" } } }), null);
  });

  it("retorna null para Actor vazio", () => {
    assert.equal(actorKind({}), null);
    assert.equal(actorKind(null), null);
    assert.equal(actorKind(undefined), null);
  });

  it("isOniActor reconhece Oni completo, nao Minion", () => {
    assert.equal(isOniActor({ system: { props: { pdv_oni_total_conta: 40 } } }), true);
    assert.equal(isOniActor({ system: { props: { oni_minion_nome: "Lacaio" } } }), false);
  });

  it("isSlayerActor reconhece Slayer, nao Oni/Minion", () => {
    assert.equal(isSlayerActor({ system: { props: { nome_slayer: "Kwon" } } }), true);
    assert.equal(isSlayerActor({ system: { props: { pdv_oni_total_conta: 40 } } }), false);
    assert.equal(isSlayerActor({ system: { props: { oni_minion_nome: "Lacaio" } } }), false);
  });

  it("isOniMinionActor reconhece Minion, nao Oni/Slayer", () => {
    assert.equal(isOniMinionActor({ system: { props: { oni_minion_nome: "Lacaio" } } }), true);
    assert.equal(isOniMinionActor({ system: { props: { pdv_oni_total_conta: 40 } } }), false);
    assert.equal(isOniMinionActor({ system: { props: { nome_slayer: "Kwon" } } }), false);
  });
});
