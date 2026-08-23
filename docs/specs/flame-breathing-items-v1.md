---
title: "Respiração das Chamas como Items CSB"
created: "2026-08-14"
last_updated: "2026-08-14"
status: active
type: spec
tags:
  - "#foundry/csb"
  - "#night-assassins/respiracao"
---

# Respiração das Chamas como Items CSB

## Objetivo

Transformar as nove entradas da Respiração das Chamas em Items roláveis com regras próprias, integrados aos serviços de ação, acerto, dano, status e turnos do módulo.

## Fonte e limites

- A regra editorial é [[../../../MACRO-NA-FOUNDRY/Versao-Oficial-Night-Assassins-V25.1/Respirações/Respiração das Chamas|Respiração das Chamas]].
- O código executável vive apenas neste módulo.
- `nvl_respiracao_num` é o nível canônico (1–4).
- Pontos de Fogo Fátuo e Brasas Ardentes ficam limitados a 60.
- Calor e marcos disparados são zerados ao encerrar o combate.
- Efeitos de limiar são aplicados uma vez quando o valor cruza 5, 10, 20, 30, 40 ou 50 no mesmo combate.

## Persistência

- Usuário: `system.props.resp_chamas_estado`, JSON versionado.
- Resumo numérico: `resp_chamas_calor_arma`, `resp_chamas_bonus_acerto`, `resp_chamas_bonus_dano`, `resp_chamas_bonus_dado`, `resp_chamas_resumo`.
- Alvo: flag `night-assassins-csb-automation.flameHeat`, mapa indexado pelo ID do usuário de Chamas. Isso permite fontes independentes sem criar keys dinâmicas no CSB.

## Passiva — 3º Estilo Esquentar

- Usar uma técnica soma o calor de arma da técnica mesmo quando ela erra.
- Um ataque ou técnica confirmado contra um alvo soma 1 Brasa base, mais o calor específico da forma.
- Patamares da arma substituem o anterior: acerto +1/+1/+2/+2/+2/+3/+3; dano de arma +1/+2/+2/+2/+3/+3/+3; a partir de 30, técnicas com dano recebem +1d6.
- A 60, o usuário sofre 2 de dano Concussivo no início do turno e danos de ataques/técnicas são multiplicados por 1,5 após os demais cálculos.

## Formas ativas

1. Fogo Desconhecido: Ação Especial, calor +2, prepara dano e ataques adicionais conforme o nível.
2. Céu em Chamas: Ação de Ataque, calor +3, +2 Brasas no acerto, bônus de acerto, crítico e redução de Bloqueio.
3. Ondulação: Reação, calor +2, bônus de Bloqueio e interceptação a 30+.
4. Tigre Ardente: Ação de Ataque, calor +3, +3 Brasas, uma rolagem de acerto, dano 4d10–6d10 e Exaustão condicional.
5. Tormenta: Ação de Ataque apenas nos níveis 3–4, calor +4, +4 Brasas por atingido, área de 10m e Esquiva CD 16.
6. Cauterizar: Ação Especial, requer calor 5, cura 1d6–4d6 e remove Sangramento nos níveis 3–4.
7. Ignição: Ação Especial apenas nos níveis 3–4, dura 3 turnos, causa 5 de dano próprio por turno e concede +5/+8 dano.
8. Rengoku: Ação de Ataque a partir do nível 2, calor +4, +4 Brasas, teste de FDV, vulnerabilidade, bônus +4 no acerto e Exaustão no nível 4.

## Integrações

- `useBreathForm` prepara o estado e consome ação/PDR atomicamente.
- `rollHit` consome o próximo modificador de Chamas somente depois de uma tentativa realmente rolada.
- `rollDamage` aplica os bônus pendentes, o patamar da arma e Brasas aos alvos atualizados.
- O GM primário processa Ignição, calor 60 e expiração no avanço do turno.
- O término do combate limpa estados transitórios e flags de calor.

## Aceite

- As nove entradas de Chamas usam dados mecânicos canônicos, sem depender do texto importado.
- Cancelar um diálogo não gasta ação, PDR ou calor.
- Técnicas indisponíveis no nível atual não podem ser usadas.
- Calor da arma é somado ao declarar a forma; calor do inimigo somente após dano confirmado/aplicado.
- Testes unitários cobrem níveis, custos, patamares, calor e expiração.

## Conexões

- [[water-breathing-items-v1|Respiração da Água como Items CSB]]
- [[../../ROADMAP|Roadmap do módulo]]
