import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { planOniRepair, primitiveNumber, repairOniActors, ONI_REPAIR_VERSION } from "../scripts/oni/repair-service.mjs";

/** Fixture: Actor Oni criado sob o template ANTIGO (Fôlego + Marca + Classe). */
function legacyOniActorFixture() {
  const props = {
    nome_oni: "Kurodane",
    nvl_pj: "nvl_9",
    nvl_num: 9,
    origem_dropdown: "origem_oni_chama_negra",
    classe_escolhida: "classe_oni_titan",
    folego_oni_atual: 3,
    folego_oni_maximo: 5,
    folego_oni_titulo: "FÔLEGO",
    vit_marca_temp: 2,
    dex_marca_temp: 1,
    pdv_oni_total_conta: 140,
    pdv_oni_dano_tomado: 35,
    pdv_oni_curado: 0,
    pdv_oni_extra: 0,
    pdv_oni_atual_num: 105,
    pdk_oni_total_conta: 60,
    pdk_oni_gasto_valor: 12,
    pdk_oni_atual_num: 48,
    notas_oni_diario: "Diário do personagem — não pode ser perdido.",
  };
  const flags = {};
  const updates = [];
  return {
    name: "Kurodane",
    img: "actor.webp",
    system: { props, template: "oni_template" },
    update(patch) {
      updates.push(patch);
      for (const [key, value] of Object.entries(patch)) {
        const propKey = key.replace(/^system\.props\./, "");
        if (propKey !== key) props[propKey] = value;
      }
      return Promise.resolve();
    },
    getFlag(scope, key) { return flags[`${scope}.${key}`]; },
    setFlag(scope, key, value) { flags[`${scope}.${key}`] = value; return Promise.resolve(); },
    _props: props,
    _updates: updates,
  };
}

describe("repairOniActors — migração de Actors Oni legados (P0)", () => {
  it("converte wrappers legados de NumberField para número primitivo", () => {
    assert.equal(primitiveNumber({ value: 4 }), 4);
    assert.equal(primitiveNumber({ current: { value: "3" } }), 3);
    assert.equal(primitiveNumber("<span>2</span>"), 2);
    assert.equal(primitiveNumber({ quebrado: true }), 0);
  });

  it("normaliza atributos e ledger Oni persistidos como Object", () => {
    const actor = legacyOniActorFixture();
    actor._props.atr_vit_valor_config = { value: 5 };
    actor._props.bonus_atr_vit_valor_temp = { current: 2 };
    actor._props.pdv_oni_dano_tomado = { value: 35 };
    const { patch } = planOniRepair(actor);
    assert.equal(patch["system.props.atr_vit_valor_config"], 5);
    assert.equal(patch["system.props.bonus_atr_vit_valor_temp"], 2);
    assert.equal(patch["system.props.pdv_oni_dano_tomado"], 35);
  });
  it("planOniRepair migra classe_escolhida (Slayer-shaped) para oni_especializacao_id", () => {
    const actor = legacyOniActorFixture();
    const { needsRepair, patch, preserved } = planOniRepair(actor);
    assert.equal(needsRepair, true);
    assert.equal(patch["system.props.oni_especializacao_id"], "oni_especializacao_titan");
    assert.equal(preserved.especializacao, "oni_especializacao_titan");
  });

  it("não sobrescreve oni_especializacao_id se o jogador já escolheu na ficha nova", () => {
    const actor = legacyOniActorFixture();
    actor._props.oni_especializacao_id = "oni_especializacao_toxico";
    const { needsRepair, patch } = planOniRepair(actor);
    assert.equal(patch["system.props.oni_especializacao_id"], undefined);
    assert.equal(needsRepair, false);
  });

  it("nunca escreve PDV/PDK atual para o máximo — apenas registra o snapshot preservado", () => {
    const actor = legacyOniActorFixture();
    const { patch, preserved } = planOniRepair(actor);
    assert.equal(patch["system.props.pdv_oni_atual_num"], undefined);
    assert.equal(patch["system.props.pdk_oni_atual_num"], undefined);
    assert.equal(preserved.pdvAtual, 105);
    assert.equal(preserved.pdkAtual, 48);
  });

  it("repairOniActors aplica o patch, preserva nome/imagem/nível/notas/origem e marca a versão de repair", async () => {
    const actor = legacyOniActorFixture();
    const result = await repairOniActors(actor);
    assert.equal(result.repaired, true);
    assert.equal(actor.name, "Kurodane");
    assert.equal(actor.img, "actor.webp");
    assert.equal(actor._props.nvl_num, 9);
    assert.equal(actor._props.notas_oni_diario, "Diário do personagem — não pode ser perdido.");
    assert.equal(actor._props.origem_dropdown, "origem_oni_chama_negra");
    assert.equal(actor._props.oni_especializacao_id, "oni_especializacao_titan");
    assert.equal(actor.getFlag("night-assassins-csb-automation", "oniRepairVersion"), ONI_REPAIR_VERSION);
  });

  it("é idempotente — segunda chamada não produz novo update", async () => {
    const actor = legacyOniActorFixture();
    await repairOniActors(actor);
    const updatesAfterFirst = actor._updates.length;
    const second = await repairOniActors(actor);
    assert.equal(second.skipped, true);
    assert.equal(actor._updates.length, updatesAfterFirst);
  });

  it("Actor não-Oni é ignorado (skipped) sem tocar em nada", async () => {
    const actor = legacyOniActorFixture();
    actor.system.template = "slayer_template";
    actor.system.props = { nome_slayer: "Alguém", pdv_slayer_total_conta: 10 };
    const result = await repairOniActors(actor);
    assert.equal(result.skipped, true);
    assert.equal(actor._updates.length, 0);
  });

  it("Actor totalmente novo (sem classe legada) não gera patch de migração", () => {
    const actor = { system: { props: { nome_oni: "Novo Oni", nvl_num: 1 } } };
    const { needsRepair, patch } = planOniRepair(actor);
    assert.equal(patch["system.props.oni_especializacao_id"], undefined);
  });
});
