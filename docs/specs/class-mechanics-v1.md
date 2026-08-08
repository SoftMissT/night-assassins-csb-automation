---
title: "Night Assassins - Classes Slayer v1"
created: "2026-08-07"
status: planned
type: spec
tags: [foundry, night-assassins, classes, slayer]
---

# Classes Slayer v1

## Contrato

O motor lê `classe_escolhida`, `nvl_pj`, `rank_atual` e os atributos finais `_display`. Cada classe terá estado namespaced `classe_slayer_<classe>_dados` e serviços próprios, sem fórmulas gigantes no template.

## Progressão oficial

| Nível do personagem | Rank da especialização |
|---:|:---:|
| 1–3 | Sem especialização |
| 4–5 | C |
| 6–7 | B |
| 8–10 | A |
| 11 | S |
| 12–14 | SS |

A escolha ocorre no nível 4. O rank é derivado de `nvl_pj`; `rank_atual` continua sendo apenas a patente narrativa do Exterminador.

## Serviços previstos

- Mestre de Batalha: ataque básico/proficiência, bônus C/B, Sangramento crítico A, PDV 2d6 no S, aparar e contra-ataque.
- Usuário de Veneno: instâncias independentes, duração, limite 3, ataque adicional e Corta-Cura.
- Kakushi: cura/estabilização, retirada, PDR e Tatakaaaaeee.
- Companheiro de Oni: vínculo com Actor Oni, interceptação, resistência e sinergia.
- Usuário de Duas Respirações: secundária, compatibilidade, variações e limites por turno.

## Consistência pendente

`Regras de Level Up Exterminadores.md` lista Mestre de Batalha, Usuário de Veneno e Kakushi na escolha do nível 4, enquanto `Classes.md` também define Companheiro de Oni e Usuário de Duas Respirações. O motor preservará as cinco opções já existentes no dropdown, mas essa divergência documental deve permanecer registrada.

## Integrações

O motor deve consumir [[status-mechanics-v1|Status]], [[life-and-death-mechanics-v1|Vida e Morte]] e economia de ações existente. Efeitos que dependem de alcance, adjacência, arma proficiente ou identidade do alvo exigem metadados explícitos da rolagem.
