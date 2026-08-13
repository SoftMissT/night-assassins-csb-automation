---
title: Integração de dano Slayer para ONI v1
date: 2026-08-12
tags:
  - night-assassins
  - foundry-vtt
  - csb
  - damage
status: implemented
---

# Integração de dano Slayer para ONI v1

## Objetivo

Garantir que a rolagem de dano de um Slayer aplique dano no ONI selecionado, preserve dano de Ferida separado, peça autorização ao GM quando necessário e informe o resultado ao jogador.

## Contratos

- Slayer usa `pdv_slayer_*` e `pdr_slayer_*`.
- ONI usa `pdv_oni_*` e `pdk_oni_*`.
- Dano comum do ONI acumula em `pdv_oni_dano_tomado`.
- Dano de Ferida do ONI acumula em `pdv_oni_dano_ferida`.
- A ficha ONI importável vem de `oni.json` e é normalizada para o compêndio.
- Fórmulas textuais do CSB usam `equalText`, nunca igualdade matemática com strings.
- Foundry VTT v14 usa `core.messageMode`.

## Aceitação

1. Um ONI selecionado recebe dano comum e Ferida nas keys corretas.
2. O solicitante recebe uma notificação com alvo e dano efetivamente aplicado.
3. A mensagem de chat registra sucesso, falha ou ausência de alvo.
4. Mais de uma entrada no diálogo gera parcelas independentes.
5. A segunda Respiração é renderizada somente para `classe_usuario_de_duas_resp`, sem erro matemático.
6. Armas no inventário oferecem uma ação de rolagem usando o serviço de dano.

## Relações

- [[Tipos de Dano]]
- [[Progressao_dos_Onis_1-20_corrigida]]
- [[Custom System Builder]]
