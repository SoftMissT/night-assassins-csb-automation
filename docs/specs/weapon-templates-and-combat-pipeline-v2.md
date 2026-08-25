---
title: "Templates e pipeline de armas Slayer v2"
created: "2026-08-24"
last_updated: "2026-08-24"
status: approved
type: spec
tags:
  - "#foundry/csb"
  - "#night-assassins/armas"
  - "#night-assassins/combate"
---

# Templates e pipeline de armas Slayer v2

## Escopo aprovado

Esta tranche publica somente **Katana**, **Double Blade** e **Manoplas / Soqueiras**. As demais armas normais e todas as armas especiais permanecem como fonte de backlog fora do Compêndio distribuído até receberem mecânica individual auditada.

O módulo possui dois contratos de Item distintos:

- `NAWeaponTpl00001`: arma normal oficial, sem progressão de dano por Rank;
- `NASpecialWeaponTpl00001`: arma especial de campanha, com progressão, entidade e regras próprias.

## Requisitos funcionais

- **RF-001** — Quando uma arma normal for compilada, o sistema deve preservar somente o dano declarado pela arma, sem acrescentar dado evolutivo de Rank.
- **RF-002** — Quando Katana estiver em Nitoryu, o sistema deve executar dois Acertos sequenciais, com `-2` e sem FOR/DEX no segundo Acerto, causando `5` de dano em cada golpe confirmado.
- **RF-003** — Quando Katana estiver em Morote, o sistema deve executar um Acerto e causar `7` de dano.
- **RF-004** — Quando Double Blade estiver em Ryōtō, o sistema deve executar dois Acertos sequenciais; o segundo não soma FOR/DEX no Acerto, mas ambos causam `5` de dano.
- **RF-005** — Quando Manoplas estiver em Nitoryu, o sistema deve executar dois Acertos sequenciais; o primeiro causa `3 + floor(max(DEX, FOR) / 2)` e o segundo causa `3`.
- **RF-006** — Quando Manoplas estiver em Ryōtō, o sistema deve executar dois Acertos sequenciais; o segundo não soma FOR/DEX no Acerto, mas ambos causam `3 + floor(max(DEX, FOR) / 2)`.
- **RF-007** — Quando um golpe de Manoplas for crítico, o sistema deve conceder `+1` cumulativo ao próximo Acerto da mesma barragem e criar outro Acerto sequencial. Cada golpe extra causa `1 + max(DEX, FOR)`. A barragem termina em golpe não crítico, cancelamento ou interrupção do jogador.
- **RF-008** — Quando uma arma com múltiplos modos for adicionada ao Actor ou sincronizada para uso, o sistema deve pedir o modo e persistir a escolha no Item embutido.
- **RF-009** — Quando um Acerto usar arma, o limiar de crítico deve vir do perfil da arma e respeitar o piso mundial configurado pelo GM.
- **RF-010** — Quando uma Forma de Respiração usar uma arma, a arma deve fornecer atributo de Acerto, crítico, modo e dano-base; a Forma deve fornecer apenas suas parcelas, bônus e efeitos declarados.
- **RF-011** — Quando um golpe não for confirmado, nenhuma parcela de dano daquele golpe deve ser rolada ou aplicada.
- **RF-012** — Quando o usuário cancelar qualquer diálogo antes da confirmação, nenhuma ação, recurso, munição ou dano deve ser consumido.

## Contrato de dados

Cada Item de arma normal usa:

```text
arma_categoria = basica
arma_modo_uso = nitoryu | morote | ryoto | vazio quando não aplicável
arma_perfis_ataque[]
  modo
  ataques
  dano_segundo_golpe = normal | fixo
  acerto_segundo_sem_atributo
  penalidade_segundo_acerto
  cadeia_critica (somente Manoplas)
```

Armas normais mantêm `arma_formulas_por_rank = {}`. Apenas Items com template especial podem consumir fórmulas por Rank.

## Pipeline

```text
Item / Forma / Ação
  -> resolver arma embutida e modo persistido
  -> escolher atributo de Acerto permitido
  -> calcular crítico efetivo da arma com piso mundial do GM
  -> rolar Acerto sequencial
  -> confirmar Acerto ou encerrar
  -> montar somente os golpes confirmados
  -> separar dano da arma e bônus da Forma
  -> resistência / anulação por parcela
  -> Ferida, cura e status
  -> update do Actor
  -> ChatMessage
  -> tick de turno / rodada
```

## Configuração mundial

O GM dispõe de um Number setting de Mundo que define o menor limiar de crítico positivo alcançável por reduções dos jogadores. O valor é aplicado globalmente, inclusive à Quebra da Respiração da Pedra, sem alterar o crítico-base da arma.

## Critérios de aceite

- **CT-001** — Katana Nitoryu produz dois danos fixos `5`, sem atributo e sem Rank.
- **CT-002** — Katana Morote produz um dano fixo `7`, sem atributo e sem Rank.
- **CT-003** — Double Blade produz dois danos fixos `5`; somente o segundo Acerto remove FOR/DEX.
- **CT-004** — Manoplas diferencia corretamente Nitoryu e Ryōtō no dano do segundo golpe.
- **CT-005** — Críticos consecutivos de Manoplas acumulam `+1` no Acerto e continuam a barragem.
- **CT-006** — O Compêndio distribuído contém dois templates e somente os três Items desta tranche.
- **CT-007** — Armas normais compiladas não possuem fórmulas de Rank.
- **CT-008** — O piso mundial impede reduções abaixo do valor definido pelo GM.
- **CT-009** — Respirações continuam resolvendo a arma sincronizada sem regressão.
- **CT-010** — Cancelamento não gera rolagem, gasto nem update.

## Conexões

- [[breathing-and-slayer-weapons-compendiums-v1|Compêndios de Respirações e Armas v1]]
- [[attack-builder-v1|Montador de Ataque v1]]
- [[flame-breathing-items-v1|Respiração das Chamas]]
