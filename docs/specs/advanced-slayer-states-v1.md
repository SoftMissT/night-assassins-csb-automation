---
title: "Night Assassins - Estados avançados Slayer v1"
created: "2026-08-07"
status: planned
type: spec
tags: [foundry, night-assassins, slayer, mundo-transparente, estado-altruista]
---

# Estados avançados Slayer v1

## Dependências

Esta implementação depende de [[status-mechanics-v1|Status]], economia de ações, acerto sequencial, defesa, dano dividido e [[rest-mechanics-v1|Descanso]]. Estado Altruísta e Mundo Transparente não podem ser reduzidos a checkboxes do template.

## Fôlego de Combate

- Máximo: `2 + fdv_display`.
- Persistência: `folego_slayer_atual`; máximo derivado em `folego_slayer_maximo`.
- Começa cheio no início de cada combate e volta ao máximo fora de combate ou em qualquer descanso.
- Recupera 1 no início do turno e em Crítico Positivo de ataque ou defesa, sem ultrapassar o máximo.
- Apenas uma manobra pode modificar o mesmo ataque, defesa, movimento ou situação.
- Ação Épica consome 5 Fôlego e terá confirmação própria do GM; não deve ser embutida silenciosamente na rolagem comum.

## Estado Altruísta

### Despertar e ativação

- Requisitos: Slayer nível 11+, patente Kinoe, Respiração 3+, cena adequada.
- Despertar: `1d20 + FDV` contra CD 16, ou CD 18 definida pelo GM.
- Ativação: Ação Especial, 4 PDR, 3 rodadas, uma vez por combate.
- Persistência proposta: `altruista_slayer_despertado`, `altruista_slayer_ativo`, `altruista_slayer_rodadas`, `altruista_slayer_usado_combate`, `altruista_slayer_primeiro_ataque_rodada` e `altruista_slayer_corte_sem_ego_usado`.

### Efeitos

- Remove Amedrontado ao ativar e impede nova aplicação enquanto ativo.
- Primeiro ataque de cada rodada não admite Reação inimiga; contra alvo que lê intenção, recebe +2 no acerto mediante confirmação do GM/alvo.
- Corte Limpo: +1d6 físico no primeiro acerto bem-sucedido do turno; dobra no crítico e não copia dano não físico.
- Corte Sem Ego: uma vez por personagem, custa 8 PDR, torna a ação ofensiva inteira Indefensável e adiciona +3d6 físico apenas ao primeiro acerto bem-sucedido. Depois zera PDR, soma 2 Exaustão, encerra o estado e trava nova ativação até Descanso Completo nível 1.

## Mundo Transparente

### Despertar e graus

- Requisitos: Slayer nível 7+, patente Tsuchinoe e INT, SAB ou FDV 5+.
- O jogador escolhe um atributo de leitura persistente: INT, SAB ou FDV.
- Grau I no nível 7, Grau II no nível 10 e Grau III no nível 11.
- Persistência proposta: `mundo_slayer_despertado`, `mundo_slayer_atributo_leitura`, `mundo_slayer_alvos_lidos`, `mundo_slayer_foco_alvo_uuid`, `mundo_slayer_foco_ativo`, `mundo_slayer_foco_usos`, `mundo_slayer_foco_extras`, `mundo_slayer_pdr_recuperado_foco` e marcadores por ação/turno.

### Alvo Lido e Foco

- Um alvo é lido ao atacar, ser atacado, defender contra ele ou concluir Observação Transparente; o estado dura até o fim do combate e deve ser armazenado por UUID do Actor/Token.
- Foco Transparente: Ação Especial, 3 PDR, uma vez por rodada, dura até o início do próximo turno.
- Usos seguros: `max(1, floor(atributo de leitura / 2))` por combate.
- Uso extra testa `1d20 + FDV` contra `12 + quantidade de usos extras já feitos`; o primeiro uso extra é CD 13.

### Integração de combate

- Grau I: +1 acerto/esquiva/bloqueio contra Alvo Lido; com Foco, +2. Um acerto focado recupera 1 PDR uma vez por ativação.
- Grau II: crítico melhora em 1, limitado a 17-20; Ponto Vital +1d6 físico uma vez por Ação de Ataque; Foco concede Vantagem no primeiro ataque do turno contra o alvo.
- Grau III: Vantagem em Esquiva ou Bloqueio contra Alvo Lido; defesa que superar o ataque por 3+ é Defesa Perfeita. A primeira Defesa Perfeita focada recupera 2 PDR.
- Corte Antecipado: Reação, 2 PDR, após Defesa Perfeita; Ataque Padrão com +1d6 físico. Defesa Perfeita com 20 natural torna o contra-ataque crítico automático se acertar.

## Regra de implementação

Os bônus devem ser resolvidos pelo módulo a partir do atacante, defensor e alvo, nunca por fórmulas globais no CSB. A ficha mostra somente estado resumido e botões; os hooks de combate controlam rodadas, usos, alvo UUID e limpeza ao encerrar combate.

## Fora do primeiro incremento

Esta SPEC não implementa ainda Forma Final nem Ação Épica completa. Elas dependem das técnicas de Respiração e de autorização do GM.
