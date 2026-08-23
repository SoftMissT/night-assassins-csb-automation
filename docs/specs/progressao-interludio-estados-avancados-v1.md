---
title: Progressao de interludio e estados avancados v1
status: implementing
date: 2026-08-14
---

# Progressao de interludio e estados avancados v1

## Objetivo

Substituir campos decorativos da ficha Slayer por fluxos executaveis e persistentes no Foundry VTT, seguindo [[Interludio Treino e Reabilitacao]], [[Lamina Carmesim]], [[Mundo Transparente]] e [[Estado Altruista]].

## Contrato

- A ficha apenas exibe estado e oferece botoes; regras ficam nos servicos do modulo.
- Toda execucao recebe `actorUuid` da entidade CSB que originou o clique.
- Testes usam os atributos finais `*_display` e publicam o `Roll` no chat.
- Alteracoes permanentes usam `Actor.update` e sobrevivem ao fechamento da sessao.
- Cabaças exigem tres sucessos consecutivos; uma falha zera a sequencia.
- Copo de Cha exige tres vitorias totais e nao perde progresso por falha.
- Desbloqueios e bonus sao derivados automaticamente, nunca marcados manualmente pelo jogador.
- Estados avancados validam nivel, rank, respiracao, recursos e economia de acoes antes de ativar.

## Entrega incremental

1. Gerenciador funcional de Cabaças e Copo de Cha.
2. Gerenciadores de Mundo Transparente, Estado Altruista e Lamina Carmesim.
3. Integracao dos bonus com acerto, dano, defesa, turnos e descanso.
4. Testes unitarios e validacao no Foundry VTT 14 + CSB 6.0.2.

## Fora desta entrega

Treino de arma, Dupla Alma, Forma, Hashiras, Treinamento Repetitivo e Reabilitacao permanecem ocultos ate seus fluxos completos serem implementados. Eles nao devem aparecer como checkboxes livres.
