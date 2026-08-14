---
title: Conteudo de Items, filtros e passivas v1
status: implemented
date: 2026-08-14
---

# Conteudo de Items, filtros e passivas v1

## Objetivo

Garantir que os Items publicados pelo modulo sejam nativos do Foundry/CSB: texto rico em HTML, categorias sem duplicacao entre containers e formas passivas sem acao manual de uso.

## Contrato

- Markdown e convertido em HTML confiavel durante o build do compendio; o texto-fonte continua Markdown nos catalogos.
- Formas usam exclusivamente o template `NABreathTpl00001`.
- Armas usam exclusivamente o template `NAWeaponTpl00001`.
- Os espacos futuros de equipamento e item comum reservam templates distintos, impedindo que armas sejam repetidas neles.
- Uma forma passiva publica `forma_passiva = 1`, mostra sua regra como texto rico e nao oferece o botao `Usar Forma`.
- A passiva Esquentar continua sendo consumida automaticamente pelos servicos de Chamas; ela nao gasta acao nem PDR.

## Validacao

- Testes de conversao cobrem titulos, enfase, listas, citacoes, tabelas e wikilinks.
- Testes dos catalogos rejeitam Markdown cru nos campos publicados.
- Testes do template confirmam filtros exclusivos e a visibilidade do uso de passivas.

## Relacoes

- [[Night Assassins CSB Automation]]
- [[Custom System Builder]]
