---
title: "Night Assassins - Vida e Morte Slayer v1"
created: "2026-08-07"
status: planned
type: spec
tags: [foundry, night-assassins, vida, morte, slayer]
---

# Vida e Morte Slayer v1

## Estado persistente

`vida_morte_slayer_dados` guarda `dying`, `stabilized`, `deathMarks`, `fallsThisCombat`, `finalDeterminationUsed`, `bondHelpUsed` e o identificador do combate.

## Gatilhos autoritativos

- Ao chegar a 0 PDV: entrar em À Beira da Morte e aplicar a quantidade inicial de Marcas pela queda repetida.
- Início do turno: se não estabilizado, rolar Teste de Morte `1d20` sem atributo.
- Dano em 0 PDV: +1 Marca; crítico/Ferida/execução abre Determinação Final ou morte.
- Cura em 0 PDV: acordar, zerar Marcas, +1 Exaustão, Desequilibrado e sem Reação até o próximo turno.
- Três Marcas ou resultado 20 no Teste de Morte: abrir Determinação Final.

## Interação

Determinação Final usa DialogV2 para motivo, CD 15/18/20 ou personalizada pelo GM e Ajuda de Vínculo +2. Estabilizar consome Ação Única e usa INT ou SAB contra CD 12.

Todos os writes passam pelo GM primário e são idempotentes por `combatId:round:turn:combatantId`, seguindo [[status-mechanics-v1|Status]] e [[rest-mechanics-v1|Descanso]].

