import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ALTRIUSTA_CUSTO_PDR,
  ALTRIUSTA_DURACAO_RODADAS,
  LAMINA_ESTRESSE_MAX,
  LAMINA_RASTRO_MAX,
  alvoLido,
  altruistaActivation,
  altruistaAwakenDc,
  altruistaCorteSemEgo,
  altruistaFirstAttack,
  apagarLamina,
  ativarAltruista,
  ativarFoco,
  ativarLamina,
  corteSemEgo,
  defaultAdvancedStates,
  focoUsoExtra,
  formatStatesSummary,
  laminaCombustaoFinal,
  laminaIgnitionProfile,
  laminaPressaoResultado,
  laminaRastroEffects,
  lerAlvo,
  mundoBonuses,
  mundoFocusExtraDc,
  mundoSafeFocusUses,
  mundoTransparenteGrade,
  parseAdvancedStates,
  processarRodadaEstados,
  readAdvancedStates,
  resetPerCombate,
  saveAdvancedStates,
} from "../scripts/slayer/advanced-states.mjs";

function despertarMundo({ atributo = "INT", valor = 6, usosSeguros = 3 } = {}) {
  const state = defaultAdvancedStates();
  state.mundo.despertado = true;
  state.mundo.atributoLeitura = atributo;
  state.mundo.grau = mundoTransparenteGrade(7);
  state.mundo.usosSeguros = usosSeguros;
  return state;
}

describe("Mundo Transparente — regras puras", () => {
  it("resolve graus por nível", () => {
    assert.equal(mundoTransparenteGrade(6), 0);
    assert.equal(mundoTransparenteGrade(7), 1);
    assert.equal(mundoTransparenteGrade(10), 2);
    assert.equal(mundoTransparenteGrade(11), 3);
    assert.equal(mundoTransparenteGrade(20), 3);
  });

  it("calcula usos seguros de Foco como metade do atributo de leitura, mínimo 1", () => {
    assert.equal(mundoSafeFocusUses(5), 2);
    assert.equal(mundoSafeFocusUses(6), 3);
    assert.equal(mundoSafeFocusUses(7), 3);
    assert.equal(mundoSafeFocusUses(8), 4);
    assert.equal(mundoSafeFocusUses(10), 5);
    assert.equal(mundoSafeFocusUses(1), 1);
    assert.equal(mundoSafeFocusUses(0), 1);
  });

  it("calcula a CD crescente de usos extras do Foco", () => {
    assert.equal(mundoFocusExtraDc(0), 13);
    assert.equal(mundoFocusExtraDc(1), 14);
    assert.equal(mundoFocusExtraDc(2), 15);
    assert.equal(mundoFocusExtraDc(3), 16);
  });

  it("sem Alvo Lido não concede bônus", () => {
    const bonuses = mundoBonuses({ grade: 3, isRead: false, hasFocus: true });
    assert.deepEqual(bonuses, {
      attack: 0, dodge: 0, block: 0, critImprovement: 0,
      advantageFirstAttack: false, advantageDefense: false,
      perfectDefenseMargin: null, pontoVital: false,
    });
  });

  it("Grau I concede +1 contra Alvo Lido e +2 com Foco", () => {
    assert.equal(mundoBonuses({ grade: 1, isRead: true }).attack, 1);
    const focused = mundoBonuses({ grade: 1, isRead: true, hasFocus: true });
    assert.equal(focused.attack, 2);
    assert.equal(focused.dodge, 2);
    assert.equal(focused.block, 2);
  });

  it("Grau II melhora a margem de crítico em 1 e habilita Ponto Vital", () => {
    const bonuses = mundoBonuses({ grade: 2, isRead: true });
    assert.equal(bonuses.critImprovement, 1);
    assert.equal(bonuses.pontoVital, true);
    assert.equal(bonuses.advantageFirstAttack, false);
  });

  it("Grau II com Foco concede Vantagem no primeiro ataque", () => {
    const bonuses = mundoBonuses({ grade: 2, isRead: true, hasFocus: true });
    assert.equal(bonuses.advantageFirstAttack, true);
  });

  it("Grau III concede Vantagem em defesa e Defesa Perfeita com margem 3", () => {
    const bonuses = mundoBonuses({ grade: 3, isRead: true });
    assert.equal(bonuses.advantageDefense, true);
    assert.equal(bonuses.perfectDefenseMargin, 3);
    assert.equal(bonuses.pontoVital, true);
  });
});

describe("Lâmina Carmesim — regras puras", () => {
  it("descreve os três métodos de Ignição", () => {
    assert.deepEqual(laminaIgnitionProfile("sangue"), { method: "sangue", acao: "especial", custoPdv: "1d4", rastro: 1, estresseInicial: 1 });
    assert.deepEqual(laminaIgnitionProfile("atrito"), { method: "atrito", acao: "especial", custoPdr: 3, rastro: 2, estresseInicial: 1 });
    assert.deepEqual(laminaIgnitionProfile("pressao"), {
      method: "pressao", acao: "especial", custoPdr: 5, rastro: 2, estresseInicial: 2,
      teste: { atributo: "VIT", cd: 16 },
    });
    assert.equal(laminaIgnitionProfile("magia"), null);
  });

  it("escala o Rastro de Calor 1 a 4", () => {
    assert.deepEqual(laminaRastroEffects(1), { solarDice: "1d4", cauterizacao: "ateFimProximoTurnoOni" });
    assert.deepEqual(laminaRastroEffects(2), { solarDice: "1d6", cauterizacao: "2rodadas", movimento: { cd: 14, perdeMetros: 3 } });
    assert.deepEqual(laminaRastroEffects(3), { solarDice: "2d6", cauterizacao: "3rodadas", solarAoBloquear: "1d6" });
    assert.deepEqual(laminaRastroEffects(4), { solarDice: "3d6", cauterizacao: "ateFimCombate", ignoraMetadeRD: true });
    assert.equal(laminaRastroEffects(0).solarDice, "");
    assert.equal(laminaRastroEffects(9).solarDice, "3d6");
  });

  it("descreve a Combustão Final", () => {
    const combustao = laminaCombustaoFinal();
    assert.equal(combustao.criticoAutomatico, true);
    assert.equal(combustao.solarDice, "4d10");
    assert.equal(combustao.ignoraRD, true);
    assert.equal(combustao.colapsoAposAtaque, true);
    assert.equal(combustao.requisitoRastroMin, 3);
  });
});

describe("Estado Altruísta — regras puras", () => {
  it("define CD de despertar 16 ou 18", () => {
    assert.equal(altruistaAwakenDc(false), 16);
    assert.equal(altruistaAwakenDc(true), 18);
  });

  it("define ativação: Ação Especial, 4 PDR, 3 rodadas, 1x por combate", () => {
    assert.deepEqual(altruistaActivation(), {
      acao: "especial", custoPdr: ALTRIUSTA_CUSTO_PDR, duracaoRodadas: ALTRIUSTA_DURACAO_RODADAS, umaVezPorCombate: true,
    });
  });

  it("primeiro ataque por rodada: sem reação e +2 contra leitores de intenção", () => {
    assert.deepEqual(altruistaFirstAttack({ ativo: false }), { semReacao: false, bonusAcerto: 0 });
    assert.deepEqual(altruistaFirstAttack({ ativo: true, inimigoLeIntencao: false }), { semReacao: true, bonusAcerto: 0 });
    assert.deepEqual(altruistaFirstAttack({ ativo: true, inimigoLeIntencao: true }), { semReacao: true, bonusAcerto: 2 });
  });

  it("descreve o Corte Sem Ego e seus custos posteriores", () => {
    const corte = altruistaCorteSemEgo();
    assert.equal(corte.custoPdr, 8);
    assert.equal(corte.indefensavel, true);
    assert.equal(corte.danoExtra, "3d6");
    assert.deepEqual(corte.pos, { pdr: 0, exaustao: 2, fimEstado: true, travaAteDescansoN1: true });
  });
});

describe("persistência e normalização", () => {
  it("parse tolera lixo e devolve estado padrão", () => {
    const garbage = parseAdvancedStates("não é json {{{");
    assert.equal(garbage.mundo.despertado, false);
    assert.equal(garbage.lamina.ativa, false);
    assert.deepEqual(garbage, defaultAdvancedStates());
    assert.deepEqual(parseAdvancedStates(null), defaultAdvancedStates());
  });

  it("parse limpa campos inválidos e mantém os válidos", () => {
    const raw = {
      version: 1,
      mundo: {
        despertado: true, atributoLeitura: "int", grau: 2,
        alvosLidos: { "uuid-a": "Oni A" }, focoAtivo: true, usosSeguros: 3,
        penalidadeAcerto: 7,
      },
      lamina: { ativa: true, rastro: 99, estresse: -3 },
      altruista: { despertado: true, rodadasRestantes: 99 },
    };
    const state = parseAdvancedStates(JSON.stringify(raw));
    assert.equal(state.mundo.atributoLeitura, "INT");
    assert.equal(state.mundo.grau, 2);
    assert.equal(state.mundo.penalidadeAcerto, 3);
    assert.equal(state.lamina.rastro, LAMINA_RASTRO_MAX);
    assert.equal(state.lamina.estresse, 0);
    assert.equal(state.altruista.rodadasRestantes, ALTRIUSTA_DURACAO_RODADAS);
    assert.equal(state.mundo.alvosLidos["uuid-a"], "Oni A");
  });

  it("lerAlvo e alvoLido operam por UUID", () => {
    let state = lerAlvo(defaultAdvancedStates(), { alvoUuid: "Actor.abcd", alvoNome: "Oni Carmesim" });
    assert.equal(alvoLido(state, "Actor.abcd"), false);
    state.mundo.despertado = true;
    assert.equal(alvoLido(state, "Actor.abcd"), true);
    assert.equal(alvoLido(state, "Actor.xyz"), false);
  });

  it("formatStatesSummary reflete cada estado ativo", () => {
    let state = defaultAdvancedStates();
    assert.equal(formatStatesSummary(state), "Nenhum estado avançado");
    state.mundo.despertado = true;
    state.mundo.grau = 1;
    assert.match(formatStatesSummary(state), /Mundo Transparente Gr\.1/);
    state.lamina.ativa = true;
    state.lamina.rastro = 2;
    state.lamina.estresse = 1;
    assert.match(formatStatesSummary(state), /Lâmina Carmesim Rastro 2 · Estresse 1/);
    state.altruista.ativo = true;
    state.altruista.rodadasRestantes = 2;
    assert.match(formatStatesSummary(state), /Estado Altruísta \(2r\)/);
  });

  it("saveAdvancedStates persiste dados e resumo no Actor", async () => {
    const updates = {};
    const actor = {
      update(patch, options) { Object.assign(updates, patch); this.options = options; return Promise.resolve(this); },
    };
    const state = defaultAdvancedStates();
    state.mundo.despertado = true;
    state.mundo.grau = 1;
    const result = await saveAdvancedStates(actor, state);
    assert.equal(updates["system.props.estados_slayer_dados"].includes("despertado"), true);
    assert.match(updates["system.props.estados_slayer_resumo"], /Mundo Transparente/);
    assert.equal(actor.options.naCsbAutomation, true);
    assert.equal(result.summary.includes("Mundo Transparente"), true);
    assert.deepEqual(
      readAdvancedStates({ estados_slayer_dados: updates["system.props.estados_slayer_dados"] }),
      parseAdvancedStates(state),
    );
  });
});

describe("transições de estado", () => {
  it("ativarFoco exige Alvo Lido e grau, e consome uso seguro", () => {
    let state = despertarMundo();
    const semAlvo = ativarFoco(state, { alvoUuid: "Actor.nope", grau: 1 });
    assert.equal(semAlvo.ok, false);
    state = lerAlvo(state, { alvoUuid: "Actor.alvo", alvoNome: "Oni" });
    const ativado = ativarFoco(state, { alvoUuid: "Actor.alvo", alvoNome: "Oni", grau: 1 });
    assert.equal(ativado.ok, true);
    assert.equal(ativado.state.mundo.focoAtivo, true);
    assert.equal(ativado.state.mundo.usosFoco, 1);
    assert.equal(ativado.extraDc, undefined);
  });

  it("ativarFoco estoura usos seguros e exige uso extra com CD", () => {
    let state = despertarMundo({ usosSeguros: 1 });
    state = lerAlvo(state, { alvoUuid: "Actor.alvo" });
    state = ativarFoco(state, { alvoUuid: "Actor.alvo", grau: 1 }).state;
    assert.equal(state.mundo.usosFoco, 1);
    state.mundo.focoAtivo = false;
    state.mundo.focoUsadoRodada = false;
    const extra = ativarFoco(state, { alvoUuid: "Actor.alvo", grau: 1 });
    assert.equal(extra.ok, true);
    assert.equal(extra.extraDc, 13);
    assert.equal(extra.state.mundo.focoAtivo, false);
    assert.equal(extra.state.mundo.focoAlvoUuid, "Actor.alvo");
  });

  it("focoUsoExtra ativa no sucesso e aplica penalidades na falha", () => {
    let state = despertarMundo({ usosSeguros: 1 });
    state = lerAlvo(state, { alvoUuid: "Actor.alvo" });
    state = ativarFoco(state, { alvoUuid: "Actor.alvo", grau: 1 }).state;
    state.mundo.focoAtivo = false;
    state.mundo.focoUsadoRodada = false;
    const pendente = ativarFoco(state, { alvoUuid: "Actor.alvo", grau: 1 }).state;

    const sucesso = focoUsoExtra(pendente, { sucesso: true });
    assert.equal(sucesso.ativou, true);
    assert.equal(sucesso.state.mundo.focoAtivo, true);
    assert.equal(sucesso.state.mundo.usosExtras, 1);
    assert.equal(sucesso.state.mundo.focoAlvoUuid, "Actor.alvo");

    const falha = focoUsoExtra(pendente, { sucesso: false, margemFalha: 5 });
    assert.equal(falha.ativou, false);
    assert.equal(falha.state.mundo.penalidadeAcerto, 1);
    assert.equal(falha.state.mundo.penalidadeIntSab, true);
    assert.equal(falha.state.mundo.penalidadeDistancia, false);

    const falhaCritica = focoUsoExtra(pendente, { sucesso: false, margemFalha: 12 });
    assert.equal(falhaCritica.state.mundo.penalidadeDistancia, true);
  });

  it("ativarLamina valida nível, cena e recursos", () => {
    let state = defaultAdvancedStates();
    const baixoNivel = ativarLamina(state, { method: "atrito", cenaOk: true, pdr: 10, level: 9 });
    assert.equal(baixoNivel.ok, false);
    const semPdr = ativarLamina(state, { method: "atrito", cenaOk: true, pdr: 2, level: 11 });
    assert.equal(semPdr.ok, false);
    const pressaoSemCena = ativarLamina(state, { method: "pressao", cenaOk: false, pdr: 10, level: 11 });
    assert.equal(pressaoSemCena.ok, false);
    const atrito = ativarLamina(state, { method: "atrito", cenaOk: true, pdr: 10, level: 11 });
    assert.equal(atrito.ok, true);
    assert.equal(atrito.state.lamina.ativa, true);
    assert.equal(atrito.state.lamina.rastro, 2);
    assert.equal(atrito.state.lamina.estresse, 1);
  });

  it("Pressão devolve teste VIT CD 16 e trava o método na falha", () => {
    let state = defaultAdvancedStates();
    const pressao = ativarLamina(state, { method: "pressao", cenaOk: true, pdr: 10, level: 11 });
    assert.equal(pressao.ok, true);
    assert.deepEqual(pressao.teste, { atributo: "VIT", cd: 16 });
    const resultado = laminaPressaoResultado(state, { sucesso: false });
    assert.equal(resultado.ativou, false);
    assert.equal(resultado.danoSolarInterno, "1d6");
    assert.equal(resultado.state.lamina.pressaoTravada, true);
    const retry = ativarLamina(resultado.state, { method: "pressao", cenaOk: true, pdr: 10, level: 11 });
    assert.equal(retry.ok, false);
    const sucesso = laminaPressaoResultado(state, { sucesso: true });
    assert.equal(sucesso.ativou, true);
    assert.equal(sucesso.state.lamina.estresse, 2);
  });

  it("apagarLamina deixa a arma Superaquecida", () => {
    let state = defaultAdvancedStates();
    state.lamina.ativa = true;
    state.lamina.rastro = 3;
    const apagada = apagarLamina(state);
    assert.equal(apagada.lamina.ativa, false);
    assert.equal(apagada.lamina.rastro, 0);
    assert.equal(apagada.lamina.superaquecida, true);
  });

  it("ativarAltruista exige despertar, uso único por combate e PDR", () => {
    let state = defaultAdvancedStates();
    const semDespertar = ativarAltruista(state, { pdr: 10 });
    assert.equal(semDespertar.ok, false);
    state.altruista.despertado = true;
    const ativado = ativarAltruista(state, { pdr: 10 });
    assert.equal(ativado.ok, true);
    assert.equal(ativado.state.altruista.ativo, true);
    assert.equal(ativado.state.altruista.rodadasRestantes, 3);
    const repetido = ativarAltruista(ativado.state, { pdr: 10 });
    assert.equal(repetido.ok, false);
  });

  it("corteSemEgo é único por personagem, exige PDR 8 e trava até Descanso N1", () => {
    let state = defaultAdvancedStates();
    state.altruista.despertado = true;
    state.altruista.ativo = true;
    const semPdr = corteSemEgo(state, { pdr: 4 });
    assert.equal(semPdr.ok, false);
    const corte = corteSemEgo(state, { pdr: 8 });
    assert.equal(corte.ok, true);
    assert.equal(corte.state.altruista.corteSemEgoUsado, true);
    assert.equal(corte.state.altruista.ativo, false);
    assert.equal(corte.state.altruista.travadoDescansoN1, true);
    const repetido = corteSemEgo(corte.state, { pdr: 8 });
    assert.equal(repetido.ok, false);
  });
});

describe("processamento de rodada e combate", () => {
  it("início de turno sobe o Rastro, expira o Foco e reseta o Corte Limpo", () => {
    let state = defaultAdvancedStates();
    state.lamina.ativa = true;
    state.lamina.rastro = 2;
    state.mundo.focoAtivo = true;
    state.altruista.ativo = true;
    state.altruista.corteLimpoUsado = true;
    const inicio = processarRodadaEstados(state, "start");
    assert.equal(inicio.state.lamina.rastro, 3);
    assert.equal(inicio.state.mundo.focoAtivo, false);
    assert.equal(inicio.state.altruista.corteLimpoUsado, false);
    assert.equal(inicio.changed, true);
    assert.equal(inicio.messages.some((msg) => msg.includes("Rastro 3")), true);
  });

  it("fim de turno sobe o Estresse e decrementa as rodadas do Altruísta", () => {
    let state = defaultAdvancedStates();
    state.lamina.ativa = true;
    state.lamina.estresse = 1;
    state.altruista.ativo = true;
    state.altruista.rodadasRestantes = 2;
    const fim = processarRodadaEstados(state, "end");
    assert.equal(fim.state.lamina.estresse, 2);
    assert.equal(fim.state.altruista.rodadasRestantes, 1);
    assert.equal(fim.changed, true);
  });

  it("6 estresses provocam Colapso Carmesim no fim do turno", () => {
    let state = defaultAdvancedStates();
    state.lamina.ativa = true;
    state.lamina.estresse = LAMINA_ESTRESSE_MAX - 1;
    const fim = processarRodadaEstados(state, "end");
    assert.equal(fim.state.lamina.estresse, LAMINA_ESTRESSE_MAX);
    assert.equal(fim.state.lamina.ativa, false);
    assert.equal(fim.state.lamina.colapso, true);
    assert.equal(fim.state.lamina.rastro, 0);
    assert.equal(fim.messages.some((msg) => msg.includes("Colapso")), true);
  });

  it("Altruísta encerra ao zerar as rodadas", () => {
    let state = defaultAdvancedStates();
    state.altruista.ativo = true;
    state.altruista.rodadasRestantes = 1;
    const fim = processarRodadaEstados(state, "end");
    assert.equal(fim.state.altruista.ativo, false);
    assert.equal(fim.state.altruista.rodadasRestantes, 0);
  });

  it("resetPerCombate limpa marcadores e preserva o persistente", () => {
    let state = defaultAdvancedStates();
    state.mundo.despertado = true;
    state.mundo.grau = 3;
    state.mundo.alvosLidos = { "Actor.x": "Oni" };
    state.mundo.focoAtivo = true;
    state.lamina.estresse = 3;
    state.lamina.colapso = true;
    state.lamina.superaquecida = true;
    state.altruista.despertado = true;
    state.altruista.travadoDescansoN1 = true;
    state.altruista.corteSemEgoUsado = true;
    const reset = resetPerCombate(state);
    assert.deepEqual(reset.mundo.alvosLidos, {});
    assert.equal(reset.mundo.focoAtivo, false);
    assert.equal(reset.lamina.ativa, false);
    assert.equal(reset.lamina.rastro, 0);
    assert.equal(reset.lamina.estresse, 3);
    assert.equal(reset.lamina.colapso, true);
    assert.equal(reset.lamina.superaquecida, true);
    assert.equal(reset.altruista.ativo, false);
    assert.equal(reset.altruista.usadoCombate, false);
    assert.equal(reset.altruista.despertado, true);
    assert.equal(reset.altruista.travadoDescansoN1, true);
    assert.equal(reset.altruista.corteSemEgoUsado, true);
  });
});