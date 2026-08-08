---
title: "Night Assassins - Classes Slayer v1"
created: "2026-08-07"
status: blocked-design
type: spec
tags: [foundry, night-assassins, classes, slayer]
---

# Classes Slayer v1

## Contrato

O motor lê `classe_escolhida`, `nvl_pj`, `rank_atual` e os atributos finais `_display`. Cada classe terá estado namespaced `classe_slayer_<classe>_dados` e serviços próprios, sem fórmulas gigantes no template.

## Serviços previstos

- Mestre de Batalha: ataque básico/proficiência, bônus C/B, Sangramento crítico A, PDV 2d6 no S, aparar e contra-ataque.
- Usuário de Veneno: instâncias independentes, duração, limite 3, ataque adicional e Corta-Cura.
- Kakushi: cura/estabilização, retirada, PDR e Tatakaaaaeee.
- Companheiro de Oni: vínculo com Actor Oni, interceptação, resistência e sinergia.
- Usuário de Duas Respirações: secundária, compatibilidade, variações e limites por turno.

## Decisão bloqueante

O documento de Classes usa progressão `C → B → A → S → SS`, mas o template atual possui níveis 1–14 e ranks narrativos diferentes. É necessário definir a correspondência exata entre nível/rank do personagem e rank da especialização antes de automatizar bônus.

## Integrações

O motor deve consumir [[status-mechanics-v1|Status]], [[life-and-death-mechanics-v1|Vida e Morte]] e economia de ações existente. Efeitos que dependem de alcance, adjacência, arma proficiente ou identidade do alvo exigem metadados explícitos da rolagem.

