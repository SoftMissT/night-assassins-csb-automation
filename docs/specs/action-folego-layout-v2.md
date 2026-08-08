---
title: "Night Assassins - Acoes, Folego e organizacao Slayer v2"
created: "2026-08-07"
status: active
type: spec
tags: ["#foundry", "#csb", "#slayer", "#acoes", "#folego"]
---

# Acoes, Folego e organizacao Slayer v2

## Fonte visual

O export `arrumei umas coisas oq vc acha.json` e a nova base visual da ficha Slayer. A migracao do modulo deve aceitar esse layout em paineis sem recriar a ficha antiga em tabelas.

## Tipos oficiais

- Contadores do Slayer: Movimento, Ataque e Especial por turno; Unica e Reacao por rodada.
- Completa consome Movimento e Ataque atomicamente.
- Defesa e ilimitada; Livre e limitada pelo Mestre. Nenhuma das duas usa contador.
- Epica usa fluxo proprio com 5 de Folego e autorizacao do Mestre.
- Lendaria, Covil e Vilao pertencem ao controle de Oni/GM e nao aparecem como contador do Slayer, mas permanecem no catalogo oficial do modulo.

## Folego automatico

- Maximo: `2 + fdv_display`.
- Comeca cheio no inicio do combate.
- Recupera 1 no inicio do turno do Slayer, limitado ao maximo.
- Recupera 1 em critico positivo confirmado de Acerto e em critico natural de Bloqueio/Esquiva.
- Toda alteracao persiste em `folego_slayer_atual`.

## Organizacao visual

- A aba Combate concentra Testes de Combate, Economia de Acoes, Marca, Status/Resistencias e Descanso.
- Configuracoes guarda somente campos tecnicos e persistencia.
- Titulos visuais usam Orbitron 700, uppercase, `letter-spacing: .12em` e tamanho 16px; a cor segue a identidade do bloco.
- Componentes criados pelo migrador precisam funcionar tanto em `panel` quanto em `table`.

## Validacao

- Migrar o export do operador sem perda de paineis.
- Ausencia de keys duplicadas.
- Testes de Folego no combate e em criticos.
- Catalogo cobre todos os tipos descritos em `Tipos de acao.md`.

## Conexoes

- [[rest-mechanics-v1]]
- [[advanced-slayer-states-v1]]
