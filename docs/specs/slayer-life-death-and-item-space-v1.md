---
title: "Slayer - Vida e Morte e espacos de Items v1"
created: "2026-08-14"
status: active
type: spec
tags: [foundry, custom-system-builder, slayer, vida-e-morte, items]
---

# Slayer - Vida e Morte e espaços de Items v1

## Decisão de escopo

A ficha Slayer não deve fingir que uma Forma de Respiração é executável enquanto o Item não possuir um contrato mecânico completo. A aba Skills mostra somente o `itemContainer` das Formas, sem botão `USAR` por linha e sem painel técnico de estado de Respiração na aba Combate.

O catálogo permanece disponível para composição futura. A implementação executável continua no módulo, nunca na base de conhecimento [[../../../../MACRO-NA-FOUNDRY/_index|MACRO-NA-FOUNDRY]].

## Vida e Morte

O estado persistente `vida_morte_slayer_dados` contém:

- `dying`, `stabilized`, `dead`;
- `deathMarks` de 0 a 3;
- `fallsThisCombat`;
- `finalDeterminationUsed` e `bondHelpUsed`;
- `combatId` e a última chave de turno processada.

Gatilhos:

1. PDV chega a 0: entra em À Beira da Morte e aplica Queda Repetida.
2. Início do turno: rola `1d20` sem atributo se não estiver estabilizado.
3. Dano recebido em 0 PDV: recebe uma Marca de Morte.
4. Cura acima de 0: sai do estado, limpa Marcas, recebe +1 Exaustão e Desequilibrado.
5. Três Marcas ou 20 natural: Determinação Final, uma vez por combate.
6. Quarta queda: morte, salvo intervenção do GM.

O motor é executado apenas pelo GM primário e usa chaves idempotentes de combate/turno. Onis ficam fora deste contrato, conforme [[life-and-death-mechanics-v1|Vida e Morte Slayer v1]].

## Interface

- Todo Label com `rollMessage` usa o wrapper `custom-orbitron-wrapper`.
- Movimento e Status são painéis distintos.
- O painel Vida e Morte exibe estado, Marcas e quedas, além de um botão de gerenciamento.

## Aceite

- Nenhum botão `respiracao_slayer_usar` no template Slayer.
- Nenhum `resp_slayer_panel` visível na aba Combate.
- O Item Container de Respirações continua presente e aceita Items do template canônico.
- Vida e Morte possui serviço, hook de combate, macro canônica e armazenamento no template.
- Testes unitários e estruturais passam antes do empacotamento.

