import { setupFoundryMocks } from "./fixtures/foundry-mock.mjs";
setupFoundryMocks();

import { describe, it } from "node:test";
import assert from "node:assert";
import { makeActor } from "./fixtures/actor.mjs";

let _dialogReturn = null;
foundry.applications.api.DialogV2.wait = async () => Array.isArray(_dialogReturn) ? _dialogReturn.shift() : _dialogReturn;
ChatMessage.create = async (data) => data;
ChatMessage.applyMode = (data) => data;

let _rollResult = { total: 8, toMessage: async () => {}, dice: [{ results: [{ result: 1, active: true }] }] };
Roll.create = (formula) => ({
  evaluate: async () => _rollResult,
  dice: [{ results: [{ result: 1, active: true }] }],
});

import { rollDamage, rollWeaponItem } from "../scripts/damage-service.mjs";

describe("damage-service", () => {
  it("cancela quando dialog retorna null", async () => {
    _dialogReturn = null;
    const actor = makeActor();
    let rolled = false;
    ChatMessage.create = async (data) => { rolled = true; return data; };
    _rollResult = { total: 8, toMessage: async () => {} };
    await rollDamage({ actor, nome: "Golpe", entradas: [{ dado: "1d8", fixo: 2, attrs: ["for"], tiposDano: ["cortante"] }] });
    assert.strictEqual(rolled, false);
  });

  it("não quebra quando o diálogo retorna sem entradas", async () => {
    _dialogReturn = { nome: "Golpe", pdrGasto: 0 };
    const actor = makeActor();
    let warned = false;
    ui.notifications.warn = (message) => { if (message.includes("Adicione ao menos uma entrada")) warned = true; };
    await assert.doesNotReject(() => rollDamage({ actor }));
    assert.strictEqual(warned, true);
  });

  it("aplica PDR e dano em atacante e alvo diferentes", async () => {
    game.user.isGM = true;
    _dialogReturn = [
      { nome: "Golpe", pdrGasto: 3, entradas: [{ dado: "1d8", fixo: 2, selAttrs: ["for"], selTiposDano: ["cortante"], tipoAcao: "ataque" }] },
      { approved: true, normalDamage: 8, woundDamage: 0, appliedDamage: 8, resisted: false, damageTypes: ["cortante"] },
    ];
    const attacker = makeActor({ id: "atk", uuid: "Actor.atk" });
    const target = makeActor({ id: "tgt", uuid: "Actor.tgt", props: { nome_oni: "Oni", pdv_oni_dano_tomado: 0 } });

    let attackerUpdated = false;
    let targetUpdated = false;
    attacker.update = async (patch, options) => {
      assert.strictEqual(patch["system.props.pdr_slayer_gasto_valor"], 3);
      assert.strictEqual(options?.naCsbAutomation, true);
      attackerUpdated = true;
    };
    target.update = async (patch, options) => {
      assert.strictEqual(patch["system.props.pdv_oni_dano_tomado"], 8);
      assert.strictEqual(options?.naCsbAutomation, true);
      targetUpdated = true;
    };

    game.user.targets = new Set([{ actor: target }]);

    let rolled = false;
    ChatMessage.create = async (data) => { rolled = true; return data; };
    _rollResult = { total: 8, toMessage: async () => {} };
    await rollDamage({ actor: attacker, nome: "Golpe", entradas: [{ dado: "1d8", fixo: 2, attrs: ["for"], tiposDano: ["cortante"] }], pdrCusto: 3 });
    assert.strictEqual(attackerUpdated, true);
    assert.strictEqual(targetUpdated, true);
    assert.strictEqual(rolled, true);
  });

  it("combina PDR e dano quando atacante é alvo", async () => {
    game.user.isGM = true;
    _dialogReturn = [
      { nome: "Golpe", pdrGasto: 2, entradas: [{ dado: "1d6", fixo: 0, selAttrs: [], selTiposDano: [], tipoAcao: "" }] },
      { approved: true, normalDamage: 5, woundDamage: 0, appliedDamage: 5, resisted: false, damageTypes: [] },
    ];
    const actor = makeActor({ id: "self", uuid: "Actor.self", props: { nome_oni: "Oni", pdk_oni_gasto_valor: 1, pdv_oni_dano_tomado: 0 } });
    actor.system.props.pdr_slayer_gasto_valor = 1;

    let pdrUpdated = false;
    let damageUpdated = false;
    actor.update = async (patch, options) => {
      assert.strictEqual(options?.naCsbAutomation, true);
      if (patch["system.props.pdk_oni_gasto_valor"] !== undefined) {
        assert.strictEqual(patch["system.props.pdk_oni_gasto_valor"], 3);
        pdrUpdated = true;
      }
      if (patch["system.props.pdv_oni_dano_tomado"] !== undefined) {
        assert.strictEqual(patch["system.props.pdv_oni_dano_tomado"], 5);
        damageUpdated = true;
      }
    };

    game.user.targets = new Set([{ actor }]);

    let rolled = false;
    ChatMessage.create = async (data) => { rolled = true; return data; };
    _rollResult = { total: 5, toMessage: async () => {} };
    await rollDamage({ actor, nome: "Golpe", entradas: [{ dado: "1d6" }], pdrCusto: 2 });
    assert.strictEqual(pdrUpdated, true);
    assert.strictEqual(damageUpdated, true);
    assert.strictEqual(rolled, true);
  });

  it("consome a Ação de Ataque do Slayer junto com o gasto de PDR", async () => {
    game.user.isGM = true;
    _dialogReturn = [
      { nome: "Golpe", pdrGasto: 2, entradas: [{ dado: "1d6", fixo: 0, selAttrs: [], selTiposDano: ["cortante"], tipoAcao: "ataque" }] },
      { approved: true, normalDamage: 5, woundDamage: 0, appliedDamage: 5, resisted: false, damageTypes: ["cortante"] },
    ];
    const attacker = makeActor({ id: "slayer", uuid: "Actor.slayer", props: { nome_slayer: "Slayer", pdv_slayer_total_valor: 20 } });
    const target = makeActor({ id: "oni", uuid: "Actor.oni", props: { nome_oni: "Oni", pdv_oni_dano_tomado: 0 } });
    attacker.update = async (patch) => {
      assert.equal(patch["system.props.pdr_slayer_gasto_valor"], 2);
      const state = JSON.parse(patch["system.props.acoes_slayer_dados"]);
      assert.equal(state.turn.ataque, 1);
      attacker.system.props.acoes_slayer_dados = patch["system.props.acoes_slayer_dados"];
    };
    target.update = async () => {};
    game.user.targets = new Set([{ actor: target }]);
    _rollResult = { total: 5, toMessage: async () => {} };
    await rollDamage({ actor: attacker });
    assert.equal(JSON.parse(attacker.system.props.acoes_slayer_dados).turn.ataque, 1);
  });

  it("rola múltiplas parcelas, usa messageMode v14 e avisa o dano aplicado", async () => {
    game.user.isGM = true;
    game.settings = { get: (namespace, key) => namespace === "core" && key === "messageMode" ? "gm" : undefined };
    _dialogReturn = [
      {
        nome: "Golpe dividido",
        pdrGasto: 0,
        entradas: [
          { dado: "1d6", fixo: 0, selAttrs: [], selTiposDano: ["cortante"], tipoAcao: "ataque" },
          { dado: "1d4", fixo: 0, selAttrs: [], selTiposDano: ["ferida"], tipoAcao: "" },
        ],
      },
      { approved: true, normalDamage: 8, woundDamage: 8, appliedDamage: 16, resisted: false, damageTypes: ["cortante", "ferida"] },
    ];
    const attacker = makeActor({ id: "atk", uuid: "Actor.atk", props: { nome_slayer: "Slayer", pdv_slayer_total_valor: 20 } });
    const target = makeActor({ id: "oni", uuid: "Actor.oni", props: { nome_oni: "Oni", pdv_oni_dano_tomado: 0, pdv_oni_dano_ferida: 0 } });
    target.update = async () => {};
    game.user.targets = new Set([{ actor: target }]);
    const notices = [];
    ui.notifications.info = (message) => notices.push(message);
    let chatData;
    ChatMessage.create = async (data) => { chatData = data; return data; };
    _rollResult = { total: 8, toMessage: async () => {} };

    await rollDamage({ actor: attacker });

    assert.equal(chatData.rolls.length, 2);
    assert.equal(chatData.messageMode, "gm");
    assert.match(chatData.flavor, /Cortante/);
    assert.match(chatData.flavor, /Ferida/);
    assert.match(notices[0], /recebeu 16 de dano \(8 de Ferida\)/);
  });

  it("imunidade da Névoa remove o crítico antes da resistência", async () => {
    game.user.isGM = true;
    _dialogReturn = {
      nome: "Crítico cortante",
      pdrGasto: 0,
      critical: true,
      entradas: [{ dado: "1d8", fixo: 0, selAttrs: [], selTiposDano: ["cortante"], tipoAcao: "ataque" }],
    };
    const attacker = makeActor({ id: "atk-mist", uuid: "Actor.atk-mist", props: { nome_slayer: "Atacante", pdv_slayer_total_valor: 20 } });
    const target = makeActor({ id: "tgt-mist", uuid: "Actor.tgt-mist", props: {
      nome_slayer: "Protegido",
      pdv_slayer_total_valor: 20,
      pdv_slayer_dano_tomado: 0,
      resp_nevoa_estado: JSON.stringify({ dazzle: { turns: 2, criticalImmunity: true } }),
      resp_metal_estado: JSON.stringify({ unshakable: { turns: 2, resistances: ["cortante"] } }),
    } });
    let appliedDamage = null;
    let criticalOption = null;
    target.update = async (patch, options) => {
      if (patch["system.props.pdv_slayer_dano_tomado"] !== undefined) appliedDamage = patch["system.props.pdv_slayer_dano_tomado"];
      if (options?.naStatusDamage) criticalOption = options.naCritical;
    };
    game.user.targets = new Set([{ actor: target }]);
    _rollResult = { total: 18, toMessage: async () => {}, dice: [] };

    await rollDamage({ actor: attacker });

    assert.equal(appliedDamage, 4);
    assert.equal(criticalOption, false);
  });

  it("Shi no Kata Hagane no Yō ni Katai N4 (Duro como Aço): anula o dano e oferece contra-ataque real ao defensor", async () => {
    game.user.isGM = true;
    // A fila serve, em ordem: 1) openDamageDialog do ataque original; depois
    // que rollHit (contra-ataque) roda, ele consome mais 2 entradas próprias
    // (openHitDialog + openHitConfirmationDialog) — DialogV2.wait é
    // compartilhado por todos esses fluxos, então a fila precisa cobrir tudo.
    _dialogReturn = [
      { nome: "Golpe", pdrGasto: 0, entradas: [{ dado: "1d8", fixo: 4, selAttrs: [], selTiposDano: ["cortante"], tipoAcao: "ataque" }] },
      { cancelled: true },
    ];
    const attacker = makeActor({ id: "atk-steel", uuid: "Actor.atk-steel", props: { nome_slayer: "Atacante", pdv_slayer_total_valor: 20 } });
    const target = makeActor({ id: "tgt-steel", uuid: "Actor.tgt-steel", props: {
      nome_slayer: "Defensor de Aço",
      pdv_slayer_total_valor: 20,
      pdv_slayer_dano_tomado: 0,
      acerto_label: "acerto_label_dex", dex_display: "4",
      resp_metal_estado: JSON.stringify({ steelDefense: { negateAttack: true, counterAttack: true, uses: 1 } }),
    } });
    let appliedDamage = null;
    let steelStateAfter = null;
    target.update = async (patch) => {
      if (patch["system.props.pdv_slayer_dano_tomado"] !== undefined) appliedDamage = patch["system.props.pdv_slayer_dano_tomado"];
      if (patch["system.props.resp_metal_estado"] !== undefined) steelStateAfter = JSON.parse(patch["system.props.resp_metal_estado"]);
    };
    game.user.targets = new Set([{ actor: target }]);
    _rollResult = { total: 12, toMessage: async () => {}, dice: [{ results: [{ result: 8, active: true }] }] };

    let confirmCalled = false;
    const previousConfirm = foundry.applications.api.DialogV2.confirm;
    foundry.applications.api.DialogV2.confirm = async ({ window }) => {
      confirmCalled = true;
      assert.match(window.title, /Hagane/);
      return true;
    };
    try {
      await rollDamage({ actor: attacker });
    } finally {
      foundry.applications.api.DialogV2.confirm = previousConfirm;
    }

    assert.equal(appliedDamage, null, "dano não deve ter sido aplicado ao Defensor de Aço");
    assert.equal(steelStateAfter?.steelDefense, undefined, "steelDefense é consumido em uso único");
    assert.equal(confirmCalled, true, "deve perguntar se o defensor quer contra-atacar");
  });

  it("Duro como Aço sem counterAttack (N3): anula o dano mas nunca oferece contra-ataque", async () => {
    game.user.isGM = true;
    _dialogReturn = {
      nome: "Golpe",
      pdrGasto: 0,
      entradas: [{ dado: "1d8", fixo: 4, selAttrs: [], selTiposDano: ["cortante"], tipoAcao: "ataque" }],
    };
    const attacker = makeActor({ id: "atk-steel-n3", uuid: "Actor.atk-steel-n3", props: { nome_slayer: "Atacante", pdv_slayer_total_valor: 20 } });
    const target = makeActor({ id: "tgt-steel-n3", uuid: "Actor.tgt-steel-n3", props: {
      nome_slayer: "Defensor N3",
      pdv_slayer_total_valor: 20,
      pdv_slayer_dano_tomado: 0,
      resp_metal_estado: JSON.stringify({ steelDefense: { negateAttack: true, counterAttack: false, uses: 1 } }),
    } });
    let appliedDamage = null;
    target.update = async (patch) => {
      if (patch["system.props.pdv_slayer_dano_tomado"] !== undefined) appliedDamage = patch["system.props.pdv_slayer_dano_tomado"];
    };
    game.user.targets = new Set([{ actor: target }]);
    _rollResult = { total: 12, toMessage: async () => {}, dice: [] };

    let confirmCalled = false;
    const previousConfirm = foundry.applications.api.DialogV2.confirm;
    foundry.applications.api.DialogV2.confirm = async () => { confirmCalled = true; return true; };
    try {
      await rollDamage({ actor: attacker });
    } finally {
      foundry.applications.api.DialogV2.confirm = previousConfirm;
    }

    assert.equal(appliedDamage, null, "dano ainda deve ser anulado");
    assert.equal(confirmCalled, false, "N3 não tem contra-ataque; nunca deve perguntar");
  });

  it("seleciona um perfil de arma e aplica metade do atributo para baixo", async () => {
    game.user.targets = new Set();
    _dialogReturn = [
      1,
      { nome: "Arco", pdrGasto: 0, entradas: [{ dado: "", fixo: 6, selAttrs: [], selTiposDano: ["perfurante"], tipoAcao: "ataque" }] },
    ];
    const actor = makeActor({ props: { dex_display: 5, nome_slayer: "Slayer", pdv_slayer_total_valor: 20 } });
    let chatData;
    ChatMessage.create = async (data) => { chatData = data; return data; };
    _rollResult = { total: 6, toMessage: async () => {} };
    await rollDamage({
      actor,
      nome: "Arco",
      weaponProfiles: [
        { nome: "até 5m", dano_fixo: 3, atributos: [{ key: "DEX", multiplicador: 0.5 }], tipos_dano: ["perfurante"] },
        { nome: "até 10m", dano_fixo: 4, atributos: [{ key: "DEX", multiplicador: 0.5 }], tipos_dano: ["perfurante"] },
      ],
    });
    assert.equal(chatData.rolls.length, 1);
    assert.match(chatData.flavor, /Perfurante/);
  });

  it("rola o Item de arma com dado do Rank e atributo final do portador", async () => {
    game.user.targets = new Set();
    const actor = makeActor({ props: { nvl_num: 6, for_display: 7, dex_display: 3, nome_slayer: "Slayer", pdv_slayer_total_valor: 20 } });
    actor.documentName = "Actor";
    const item = {
      name: "Rebellion",
      parent: actor,
      system: { props: {
        arma_nome: "Rebellion",
        arma_perfis_ataque: [{ nome: "Espadão", dano_fixo: 7, dano_dados: "", atributos: [{ key: "FOR", multiplicador: 1 }], tipos_dano: ["cortante"] }],
        arma_formulas_por_rank: { B: ["7 + FOR + 1d10 / Cortante"] },
      } },
    };
    _dialogReturn = { nome: "Rebellion", pdrGasto: 0, entradas: [{ dado: "1d10", fixo: 14, selAttrs: [], selTiposDano: ["cortante"], tipoAcao: "ataque" }] };
    const formulas = [];
    Roll.create = (formula) => {
      formulas.push(formula);
      return { evaluate: async () => ({ total: 19, dice: [] }) };
    };
    await rollWeaponItem({ item });
    assert.deepEqual(formulas, ["1d10 + 14"]);
  });

  it("soma FDV ao maior valor entre metade de FOR ou DEX", async () => {
    game.user.targets = new Set();
    const actor = makeActor({ props: { nvl_num: 2, for_display: 7, dex_display: 4, fdv_display: 3, nome_slayer: "Slayer", pdv_slayer_total_valor: 20 } });
    actor.documentName = "Actor";
    const item = { name: "Gáe Bolg", parent: actor, system: { props: {
      arma_nome: "Gáe Bolg",
      arma_perfis_ataque: [{ formula_texto: "5 + metade de FOR ou DEX + FDV / Perfurante", dano_fixo: 5, atributos: [{ key: "FOR", multiplicador: 0.5 }, { key: "DEX", multiplicador: 0.5 }, { key: "FDV", multiplicador: 1 }], tipos_dano: ["perfurante"] }],
      arma_formulas_por_rank: { D: ["5 + metade de FOR ou DEX + FDV + 1d6 / Perfurante"] },
    } } };
    _dialogReturn = { nome: "Gáe Bolg", pdrGasto: 0, entradas: [{ dado: "1d6", fixo: 11, selAttrs: [], selTiposDano: ["perfurante"], tipoAcao: "ataque" }] };
    const formulas = [];
    Roll.create = (formula) => {
      formulas.push(formula);
      return { evaluate: async () => ({ total: 17, dice: [] }) };
    };
    await rollWeaponItem({ item });
    assert.deepEqual(formulas, ["1d6 + 11"]);
  });

  it("Água 5 (Chuva Misericordiosa): recupera PDR igual ao Nível de Respiração ao finalizar o alvo (regressão)", async () => {
    game.user.isGM = true;
    _dialogReturn = { nome: "Golpe", pdrGasto: 0, entradas: [{ dado: "1d8", fixo: 0, selAttrs: [], selTiposDano: ["cortante"], tipoAcao: "ataque" }] };
    const attacker = makeActor({
      id: "atk-water5", uuid: "Actor.atk-water5",
      props: {
        nome_slayer: "Atacante", pdv_slayer_total_valor: 20,
        pdr_slayer_gasto_valor: 5,
        resp_agua_estado: JSON.stringify({ pendingDamage: { source: "agua_05", critical: true, uses: 1, recoverPdrOnKill: 3 } }),
      },
    });
    const target = makeActor({
      id: "tgt-water5", uuid: "Actor.tgt-water5",
      props: { nome_slayer: "Alvo", pdv_slayer_total_conta: 8, pdv_slayer_dano_tomado: 0 },
    });
    let attackerPdrGasto = null;
    attacker.update = async (patch) => {
      if (patch["system.props.pdr_slayer_gasto_valor"] !== undefined) attackerPdrGasto = patch["system.props.pdr_slayer_gasto_valor"];
    };
    target.update = async (patch) => {
      if (patch["system.props.pdv_slayer_dano_tomado"] !== undefined) target.system.props.pdv_slayer_dano_tomado = patch["system.props.pdv_slayer_dano_tomado"];
    };
    game.user.targets = new Set([{ actor: target }]);
    _rollResult = { total: 8, toMessage: async () => {} };

    await rollDamage({ actor: attacker });

    assert.equal(attackerPdrGasto, 2, "5 PDR gastos - 3 de recuperação (recoverPdrOnKill) = 2");
  });

  it("Água 5: não recupera PDR se o alvo sobreviver ao dano", async () => {
    game.user.isGM = true;
    _dialogReturn = { nome: "Golpe", pdrGasto: 0, entradas: [{ dado: "1d8", fixo: 0, selAttrs: [], selTiposDano: ["cortante"], tipoAcao: "ataque" }] };
    const attacker = makeActor({
      id: "atk-water5b", uuid: "Actor.atk-water5b",
      props: {
        nome_slayer: "Atacante", pdv_slayer_total_valor: 20,
        pdr_slayer_gasto_valor: 5,
        resp_agua_estado: JSON.stringify({ pendingDamage: { source: "agua_05", critical: true, uses: 1, recoverPdrOnKill: 3 } }),
      },
    });
    const target = makeActor({
      id: "tgt-water5b", uuid: "Actor.tgt-water5b",
      props: { nome_slayer: "Alvo", pdv_slayer_total_conta: 100, pdv_slayer_dano_tomado: 0 },
    });
    let attackerUpdateCalled = false;
    attacker.update = async (patch) => {
      if (patch["system.props.pdr_slayer_gasto_valor"] !== undefined) attackerUpdateCalled = true;
    };
    target.update = async () => {};
    game.user.targets = new Set([{ actor: target }]);
    _rollResult = { total: 8, toMessage: async () => {} };

    await rollDamage({ actor: attacker });

    assert.equal(attackerUpdateCalled, false, "alvo com PDV restante não deve disparar recuperação de PDR");
  });
});
