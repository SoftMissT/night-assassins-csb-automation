---
title: Night Assassins - contrato mecanico de status Slayer v1
status: accepted-for-implementation
updated: 2026-08-07
tags:
  - foundry-vtt
  - night-assassins
  - status
---

# Contrato mecânico de status Slayer v1

Este documento transforma cada entrada de [[Tipos de Status]] em comportamento executável do módulo. Nenhum status pode ser considerado pronto apenas por aparecer no gerenciador ou no resumo da ficha. Integra-se a [[Tipos de ação]], dano, cura, alvo, movimento e turnos.

## Regra de completude

Cada status precisa declarar e executar, conforme aplicável:

1. aplicação e reaplicação;
2. fonte (`sourceActorUuid`) e alvo;
3. pilhas e teto;
4. duração e momento do tick;
5. efeito em rolagem, ação, dano, cura, alvo ou movimento;
6. salvaguarda e CD;
7. forma de remoção;
8. mensagem de chat e teste automatizado.

## Persistência nativa do Foundry

O documento autoritativo de cada condição é um `ActiveEffect` embutido no Actor. Os 35 status do Night Assassins devem ser registrados durante `init` em `CONFIG.statusEffects` e aplicados com `Actor#toggleStatusEffect`, `ActiveEffect.fromStatusEffect` ou criação embutida equivalente.

`status_slayer_dados`, `status_slayer_resumo` e `status_slayer_exaustao` ficam somente como espelho de compatibilidade para componentes do CSB durante a migração. Macros e serviços não podem tratá-los como fonte principal quando os Active Effects nativos estiverem disponíveis.

Cada Active Effect usa `flags.night-assassins-csb-automation` para os dados mecânicos específicos:

```json
{
  "statusKey": "sangramento",
  "stacks": 1,
  "damageFormula": "1d4",
  "saveAttr": "VIT",
  "saveDc": 12,
  "sourceActorUuid": "Actor.x",
  "sourceName": "Nome",
  "distanceMeters": 0,
  "blockedDistanceMeters": 0
}
```

Turnos e rodadas usam a duração nativa do Active Effect (`duration.rounds`, `duration.turns`, início de combate/rodada/turno). Campos não usados por um status ficam vazios; isso não elimina sua regra fixa.

## Integração Foundry obrigatória

- `CONFIG.statusEffects`: catálogo nativo com IDs e ícones próprios do Night Assassins.
- `Actor#statuses` e `Actor#appliedEffects`: leitura dos status efetivamente ativos.
- `Actor#toggleStatusEffect`: ativação/desativação comum.
- `Actor#createEmbeddedDocuments("ActiveEffect", ...)`: aplicação com fonte, pilhas, fórmula, CD e duração.
- Hooks `combatStart`, `combatTurn`, `combatRound` e eventos de Active Effect: ticks, salvaguardas e expiração.
- `TokenDocument` e Token HUD: ícones e bloqueios ligados ao Token real.
- `game.user.targets`: atacante e alvos reais das macros de acerto/dano/técnica.
- socket do módulo e GM primário: atualizações em Actors que o jogador não possui.
- `DialogV2`/`ApplicationV2`: qualquer escolha manual exigida pela regra.

O Combat Tracker Dock não recebe um sistema paralelo: ele observa os mesmos Combatants, Tokens, Active Effects e Hooks nativos do Foundry.

## Matriz mecânica obrigatória

| Status | Mecânica executável |
|---|---|
| Vantagem | `2d20kh1`; anula Desvantagem. |
| Desvantagem | `2d20kl1`; anula Vantagem. |
| Sangramento | Dano configurado no início do turno; duração da fonte. |
| Hemorragia | Dano configurado no início do turno; duração da fonte. |
| Envenenamento | Dano configurado no início do turno; duração da fonte. |
| Corroído | Dano por pilha no início do turno; novo Ácido soma uma pilha e reduz RD em 1. |
| Em Chamas | `1d4` no início do turno; reaplicar reinicia duração; ação escolhida apaga; Água/Congelante remove. |
| Invisível/Inalvejável | Não pode ser escolhido como alvo de ataque. |
| Vulnerável | Dobra dano de ataque acertado depois da defesa. |
| Restrição de Movimentos | Movimento e Ação Completa indisponíveis. |
| Hipotermia | `-3m`, depois `-1,5m` por pilha adicional, mínimo de deslocamento `1,5m`; VIT no fim do turno ou calor remove. |
| Atordoamento | Perde o turno, mas pode defender. |
| Paralisia | Falha FOR/DEX não defensiva; ataques recebidos com Vantagem; corpo a corpo crítico; golpes variáveis no máximo; salvaguarda da fonte ao receber ataque indefensável. |
| Colapso | Bloqueia ações; remover consome Ação Completa e exige VIT CD 15; reaplicar reinicia duração. |
| Derrubado | `-2` no ataque corpo a corpo próprio; atacante adjacente com Vantagem e distante com Desvantagem; levantar consome metade do Movimento. |
| Confuso | `1d4` no início do turno e executa/consome o resultado; dano ou ajuda remove. |
| Fratura | `-2 FOR`; metade do deslocamento; remoção manual por tratamento/descanso. |
| Sonhando | Incapacitado; corpo a corpo recebido é crítico; dano ou ação de aliado remove. |
| Amedrontado | `-1` no acerto somente contra a fonte; crítico da fonte aplica Atordoamento por um turno. |
| Frenesi | Imune a medo/psicológico; soma FOR ao dano corpo a corpo; sem Reação; deve atacar alvo mais próximo; CAR/FDV CD 15 de aliado remove. |
| Desequilibrado | `-2` na próxima defesa; consumido pelo próximo ataque recebido ou início do turno. |
| Desorientado | `-2` Ataque; sem Reação; expira ao fim da duração. |
| Distraído | Sem Reação; ataques recebidos com Vantagem; dano ou início do turno remove. |
| Empurrado | FOR evita deslocamento; obstáculo causa `1d6` Concussão por 3m não percorridos. |
| Flanqueado | Ataques recebidos com Vantagem; `-2` Defesa; remoção quando a geometria deixar de existir. |
| Cegueira Parcial | `-2` Ataque/Defesa; Desvantagem em SAB visual. |
| Surdez Parcial | `-2` SAB auditiva; Desvantagem em Reação sonora. |
| Corrupção | Cura pela metade; `-1 FDV` por pilha; `+2` dano demoníaco recebido. |
| Regeneração Suprimida | Toda cura pela metade. |
| Silenciado | Proíbe Respiração e poderes espirituais; FDV no início do turno conforme CD da fonte. |
| Suprimido | Perde turno; FDV no início do turno conforme CD da fonte. |
| Fadiga Corporal | Impede crítico e Disparada. |
| Fadiga Espiritual | Técnicas de Respiração custam `+1 PDR`; `-2` resistência FDV. |
| Fadiga Mental | Desvantagem em Iniciativa/SAB; falha em resistência FDV aplica Distraído. |
| Encorajado | `+2` Ataque/FDV resistência; `+1` Iniciativa/Esquiva; suspende Amedrontado/Confuso. |
| Exaustão | Executa níveis 1-8 cumulativamente; regra de morte no 8 é exclusiva de Slayer. |

Resistência permanece em `status_slayer_resistencias_dados`, pois exige tipos de dano. Ferida permanece em `pdv_slayer_dano_ferida`, pois reduz PDV máximo e não é uma condição duplicada.

## Contextos obrigatórios

Os serviços devem receber contexto suficiente para não inventar regras globais:

- ataque: atacante, alvo, distância, corpo a corpo, fonte e crítico;
- dano: componentes tipados, origem demoníaca e se foi ataque;
- movimento: distância pretendida, distância impedida e obstáculo;
- salvaguarda: atributo, CD, fonte e sucesso/falha;
- técnica: Respiração ou não, custo PDR, quantidade variável de golpes e tipo de ação.

Sem contexto obrigatório, o módulo deve pedir a informação ao usuário/GM ou recusar a automação com mensagem clara; nunca aplicar silenciosamente uma suposição errada.

## Critério de aceite

- Todos os 35 status existem como Active Effects nativos, aparecem no Token e têm ao menos um teste de sua regra principal.
- Status dependentes do alvo são testados com atacante e alvo diferentes.
- Status com duração são processados pelo Combat Tracker.
- Remoções que gastam ação passam pela economia de ações.
- Técnicas de Respiração consomem Fadiga Espiritual somente quando marcadas como Respiração.
- Nenhum status oficial fica apenas como checkbox ou texto de resumo.
- O espelho CSB é reconstruído a partir dos Active Effects e nunca diverge da coleção nativa do Actor.
