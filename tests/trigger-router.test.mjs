import { setupFoundryMocks } from "./fixtures/foundry-mock.mjs";
setupFoundryMocks();

import { describe, it } from "node:test";
import assert from "node:assert";
import { makeActor } from "./fixtures/actor.mjs";

foundry.applications.api.DialogV2.wait = async () => null;

import { handleActorUpdate } from "../scripts/trigger-router.mjs";

describe("trigger-router", () => {
  it("ignora updates com naCsbAutomation", async () => {
    const actor = makeActor();
    let updated = false;
    actor.update = async () => { updated = true; };
    await handleActorUpdate(actor, { system: { props: { nvl_pj: 1 } } }, { naCsbAutomation: true }, game.user.id);
    assert.strictEqual(updated, false);
  });

  it("ignora updates de outros usuários", async () => {
    const actor = makeActor();
    let updated = false;
    actor.update = async () => { updated = true; };
    await handleActorUpdate(actor, { system: { props: { nvl_pj: 1 } } }, {}, "outro");
    assert.strictEqual(updated, false);
  });

  it("ignora updates sem ownership", async () => {
    const actor = makeActor({ isOwner: false });
    let updated = false;
    actor.update = async () => { updated = true; };
    await handleActorUpdate(actor, { system: { props: { nvl_pj: 1 } } }, {}, game.user.id);
    assert.strictEqual(updated, false);
  });

  it("ignora quando não há mudança de nível nem habilidade", async () => {
    const actor = makeActor();
    let updated = false;
    actor.update = async () => { updated = true; };
    await handleActorUpdate(actor, { system: { props: { outro: 1 } } }, {}, game.user.id);
    assert.strictEqual(updated, false);
  });

  it("dispara criação de nível 1 quando nível muda para 1 e snapshot incompleto", async () => {
    const actor = makeActor({ props: { vit_nvl1: undefined, nvl_pj: 1 } });
    let updated = false;
    actor.update = async () => { updated = true; };
    await handleActorUpdate(actor, { system: { props: { nvl_pj: 1 } } }, {}, game.user.id);
    // Como o dialog é mockado para null, a criação não deve aplicar update
    assert.strictEqual(updated, false);
  });

  it("dispara ganho de nível 3 quando nível muda para 3 e snapshot incompleto", async () => {
    const actor = makeActor({ props: { vit_nvl3: undefined, nvl_pj: 3 } });
    let updated = false;
    actor.update = async () => { updated = true; };
    await handleActorUpdate(actor, { system: { props: { nvl_pj: 3 } } }, {}, game.user.id);
    assert.strictEqual(updated, false);
  });

  it("dispara evolução da Marca no nível 6 quando condições são atendidas", async () => {
    const actor = makeActor({
      props: {
        nvl_pj: 6,
        hab_escolhida: "hab_escolhida_marca_destino",
        hab_marca_destino_bonus: 2,
        hab_marca_destino_atributo: "vit",
        vit_nvl6: undefined,
      },
    });
    let patch = null;
    actor.update = async (p, opts) => { patch = p; };
    await handleActorUpdate(actor, { system: { props: { nvl_pj: 6 } } }, {}, game.user.id);
    // Como o dialog de upgrade não é necessário quando atributo está guardado, o update deve ocorrer
    assert.strictEqual(patch !== null, true);
    assert.strictEqual(patch["system.props.hab_marca_destino_bonus"], 3);
  });

  it("dispara Marca inicial quando habilidade muda para marca e bônus < 2", async () => {
    const actor = makeActor({
      props: {
        hab_escolhida: "hab_escolhida_marca_destino",
        hab_marca_destino_bonus: 0,
        vit_nvl1: 4,
      },
    });
    let updated = false;
    actor.update = async () => { updated = true; };
    await handleActorUpdate(actor, { system: { props: { hab_escolhida: "hab_escolhida_marca_destino" } } }, {}, game.user.id);
    // Dialog mockado retorna null, então não aplica
    assert.strictEqual(updated, false);
  });

  it("no Oni, nível 3 dispara snapshot Oni e não Marca Slayer", async () => {
    const actor = makeActor({
      name: "oni_template",
      props: {
        nome_oni: "Akuma",
        nvl_pj: 3,
        pdv_oni_ganho_nvl2: 2,
        pdv_oni_ganho_nvl3: 3,
        hab_escolhida: "hab_escolhida_marca_destino",
        hab_marca_destino_bonus: 2,
      },
    });
    let patch = null;
    actor.update = async (p) => { patch = p; };
    await handleActorUpdate(actor, { system: { props: { nvl_pj: 3 } } }, {}, game.user.id);
    assert.strictEqual(patch, null);
  });
});
