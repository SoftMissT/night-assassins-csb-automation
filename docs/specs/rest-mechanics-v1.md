---
title: "Night Assassins - Descanso Slayer v1"
created: "2026-08-07"
status: planned
type: spec
tags: [foundry, night-assassins, descanso, slayer]
---

# Descanso Slayer v1

## Escopo

Implementar [[status-mechanics-v1|Status]] e recursos namespaced do Slayer por uma macro `Gerenciar Descanso`, com autorização do GM e uma atualização atômica do Actor.

## Modal

- Descanso de Campo (2h): rola `1d4 × max(1, VIT)`, recupera metade do PDR máximo, restaura Fôlego e remove apenas estados leves escolhidos.
- Descanso Completo (8h): restaura PDV/PDR/Fôlego, reduz Exaustão em 2 e permite confirmar quais estados tratados serão removidos.
- Recuperação Profunda (24h+): restaura recursos, permite escolher remover toda Exaustão ou reduzir 4 e abre testes de Fratura/Corrupção/Silenciado.
- Interrupção deve rebaixar o benefício conforme a duração concluída.

## Persistência

`descanso_slayer_dados` guarda o último benefício, tipo, horário do mundo e marcador de cena. Um novo descanso exige liberação do GM quando não houve combate, missão, exploração ou avanço real de tempo.

PDV recuperado incrementa `pdv_slayer_curado`; PDR recuperado incrementa `pdr_slayer_curado`, sempre limitado pelos totais atuais. Ferida nunca é removida automaticamente.

## Integrações

- [[life-and-death-mechanics-v1|Vida e Morte]]: cura em 0 PDV acorda o Slayer e aplica suas consequências.
- Dano Necrótico da Marca exige a regra específica da Marca; descanso não o apaga genericamente.
- Regeneração Suprimida respeita sua própria duração.

