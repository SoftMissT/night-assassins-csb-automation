import { setupFoundryMocks } from "./fixtures/foundry-mock.mjs";
setupFoundryMocks();

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { makeActor } from "./fixtures/actor.mjs";
import { actionMaximums, consumeSlayerActions, parseActionState, recoverSlayerFolego, resetSlayerActions, slayerFolegoMaximum, slayerFolegoPatch, slayerMovementMeters } from "../scripts/action-service.mjs";
import { TIPOS_ACAO } from "../scripts/constants.mjs";

describe("action-service", () => {
  const makeSlayer = (props = {}) => makeActor({ props: { nome_slayer: "Teste", pdv_slayer_total_valor: 20, ...props } });

  it("cataloga todos os tipos de ação oficiais", () => {
    assert.deepEqual(TIPOS_ACAO.map(({ key }) => key), ["movimento", "ataque", "especial", "unica", "completa", "reacao", "defesa", "livre", "epica", "lendaria", "covil", "vilao"]);
  });

  it("consome Ataque e impede um segundo uso no mesmo turno", async () => {
    const actor = makeSlayer();
    actor.update = async (patch) => { actor.system.props.acoes_slayer_dados = patch["system.props.acoes_slayer_dados"]; };
    assert.equal((await consumeSlayerActions(actor, "ataque")).ok, true);
    const second = await consumeSlayerActions(actor, "ataque");
    assert.equal(second.ok, false);
    assert.match(second.reason, /Ataque indisponível/);
  });

  it("Ação Completa consome Movimento e Ataque atomicamente", async () => {
    const actor = makeSlayer();
    let writes = 0;
    actor.update = async (patch) => { writes += 1; actor.system.props.acoes_slayer_dados = patch["system.props.acoes_slayer_dados"]; };
    const result = await consumeSlayerActions(actor, "completa");
    assert.equal(result.ok, true);
    assert.deepEqual(result.state.turn, { movimento: 1, ataque: 1, especial: 0 });
    assert.equal(writes, 1);
  });

  it("Ação Única mantém teto 1 e bônus amplia as demais", () => {
    assert.deepEqual(actionMaximums({ acoes_slayer_unica_bonus: 9, acoes_slayer_ataque_bonus: 2, acoes_slayer_reacao_bonus: -1 }), {
      movimento: 1, ataque: 3, especial: 1, unica: 1, reacao: 0,
    });
  });

  it("reset por turno preserva os usos da rodada", async () => {
    const actor = makeSlayer({ acoes_slayer_dados: JSON.stringify({ version: 1, turn: { movimento: 1, ataque: 1, especial: 1 }, round: { unica: 1, reacao: 1 } }) });
    actor.update = async (patch) => { actor.system.props.acoes_slayer_dados = patch["system.props.acoes_slayer_dados"]; };
    await resetSlayerActions(actor, "turn");
    const state = parseActionState(actor.system.props.acoes_slayer_dados);
    assert.deepEqual(state.turn, { movimento: 0, ataque: 0, especial: 0 });
    assert.deepEqual(state.round, { unica: 1, reacao: 1 });
  });

  it("status de restrição impede Movimento e Ação Completa", async () => {
    const actor = makeSlayer({ status_slayer_dados: JSON.stringify({ version: 2, active: ["restricao_movimentos"], exhaustion: 0, effects: {} }) });
    assert.equal((await consumeSlayerActions(actor, "movimento")).ok, false);
    assert.equal((await consumeSlayerActions(actor, "completa")).ok, false);
  });

  it("calcula deslocamento por DEX e modificadores de status", () => {
    assert.equal(slayerMovementMeters({ dex_display: 4 }), 11);
    assert.equal(slayerMovementMeters({ dex_display: 4, status_slayer_dados: JSON.stringify({ version: 2, active: ["fratura"], exhaustion: 0, effects: {} }) }), 5.5);
  });

  it("calcula Fôlego máximo como 2 + FDV final", () => {
    assert.equal(slayerFolegoMaximum({ fdv_display: 4 }), 6);
    assert.equal(slayerFolegoMaximum({ fdv_display: "<span>7</span>" }), 9);
  });

  it("enche Fôlego no combate e recupera 1 no início do turno", () => {
    assert.deepEqual(slayerFolegoPatch({ fdv_display: 4, folego_slayer_atual: 2 }, { full: true }), {
      "system.props.folego_slayer_atual": 6,
    });
    assert.deepEqual(slayerFolegoPatch({ fdv_display: 4, folego_slayer_atual: 5 }), {
      "system.props.folego_slayer_atual": 6,
    });
    assert.deepEqual(slayerFolegoPatch({ fdv_display: 4, folego_slayer_atual: 6 }), {
      "system.props.folego_slayer_atual": 6,
    });
  });

  it("recupera Fôlego persistente sem ultrapassar o máximo", async () => {
    const actor = makeSlayer({ fdv_display: 4, folego_slayer_atual: 4 });
    actor.update = async (patch) => { actor.system.props.folego_slayer_atual = patch["system.props.folego_slayer_atual"]; };
    assert.deepEqual(await recoverSlayerFolego(actor), { changed: true, current: 5, maximum: 6 });
    await recoverSlayerFolego(actor, 10);
    assert.equal(actor.system.props.folego_slayer_atual, 6);
    assert.equal((await recoverSlayerFolego(actor)).changed, false);
  });
});
