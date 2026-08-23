---
title: "Identidade runtime e recursos ONI v1"
created: "2026-08-13"
status: implemented
type: spec
tags: [foundry, csb, oni, dashboard, damage]
---

# Identidade runtime e recursos ONI v1

## Objetivo

Eliminar a mistura entre fichas [[resource-bars-and-oni-foundation-v1|ONI]] e Slayer durante o combate. A identificação deve ser única e compartilhada pelo painel do GM e pelo serviço de [[oni-damage-integration-v1|dano]].

## Contratos

- ONI tem precedência quando há marcadores inequívocos: template `oni_template`, `classe_oni_escolha`, `nome_oni` ou recursos `pdk_oni_*`.
- Slayer tem precedência somente quando não houver marcador ONI e existirem `nome_slayer`, template Slayer ou recursos `pdv_slayer_*`/`pdr_slayer_*`.
- Chaves antigas herdadas de uma cópia de template não podem, sozinhas, mudar a espécie do Actor.
- Os sete atributos ONI são calculados apenas com campos existentes no template ONI. Bônus exclusivos do Slayer não entram nessas fórmulas.
- Dano comum aplicado ao ONI incrementa `pdv_oni_dano_tomado`; Ferida incrementa `pdv_oni_dano_ferida`.
- O painel GM lista todos os combatentes, usa PDR para Slayer, PDK para ONI e permite minimizar/restaurar sem fechar a janela.

## Aceitação

1. VIT, DEX, FOR, CAR, FDV, INT e SAB sempre produzem valor numérico.
2. ONI que ainda contenha chaves `_slayer_` herdadas continua classificado como ONI.
3. O dano em alvo ONI atualiza o Number Field correto e a barra derivada.
4. O painel GM agrupa cada combatente uma única vez e pode ser minimizado.
5. Respirações, armas e habilidades de classe permanecem exclusivas do Slayer até existir implementação ONI própria.

## Relações

- [[water-breathing-items-v1|Respirações como Item]]
- [[class-mechanics-v1|Classes Slayer]]
