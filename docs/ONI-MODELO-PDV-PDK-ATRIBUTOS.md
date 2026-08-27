---
title: 'Modelo Oni PDV, PDK e Atributos por Origem'
created: '2026-08-25'
last_updated: '2026-08-25'
status: active
maturity: seed
type: auditoria
lead_agent: '@TANG-ROU'
tags:
    - night-assassins
    - onis
    - progressao
    - auditoria
aliases:
    - 'Auditoria Origens Oni'
---

# Modelo Oni PDV, PDK e Atributos por Origem

> Fonte: `MACRO-NA-FOUNDRY/Mecânicas para fazer na ficha/Onis/` (Progressão corrigida + pasta Origens/).
> Objetivo: provar o entendimento antes de mexer nos atributos do template.

---

## 1. Fórmula Geral

```txt
PDV Máximo = PDV da Origem          + ganhos acumulados de nível
             (fixo + VIT)            (dados rolados 1x por nível)

PDK Máximo = PDK da Origem          + ganhos acumulados de nível
             (fixo + FDV × mult)
```

**Multiplicador de FDV (`mult`):**

- `×4` → origens escritas como `N + FDV + (FDV×3)`: **Passado Triste, Personalidade Maligna, Rastreador de Sangue, Gênio do Mal, Adepto das Trevas**
- `×3` → todas as demais, escritas como `N + (FDV×3)`

---

## 2. Tabela por Origem (exemplo com VIT = 3, FDV = 3)

|   # | Origem                       | PDV da Origem | Exemplo | PDK da Origem | mult | Exemplo |
| --: | ---------------------------- | ------------- | ------: | ------------- | ---: | ------: |
|  01 | Passado Triste               | `22 + VIT`    |      25 | `2 + FDV×4`   |    4 |      14 |
|  02 | Personalidade Maligna        | `16 + VIT`    |      19 | `3 + FDV×4`   |    4 |      15 |
|  03 | Rastreador de Sangue         | `20 + VIT`    |      23 | `1 + FDV×4`   |    4 |      13 |
|  04 | Gênio do Mal                 | `20 + VIT`    |      23 | `2 + FDV×4`   |    4 |      14 |
|  05 | Adepto das Trevas            | `19 + VIT`    |      22 | `4 + FDV×4`   |    4 |      16 |
|  06 | Comum                        | `18 + VIT`    |      21 | `8 + FDV×3`   |    3 |      17 |
|  07 | Oni da Corte Pálida          | `18 + VIT`    |      21 | `18 + FDV×3`  |    3 |      27 |
|  08 | Maré Negra                   | `20 + VIT`    |      23 | `17 + FDV×3`  |    3 |      26 |
|  09 | Raiz Podre                   | `23 + VIT`    |      26 | `16 + FDV×3`  |    3 |      25 |
|  10 | Realidade Distorcida         | `17 + VIT`    |      20 | `20 + FDV×3`  |    3 |      29 |
|  11 | Tela do Submundo             | `18 + VIT`    |      21 | `20 + FDV×3`  |    3 |      29 |
|  12 | Oni de Outras Terras         | `18 + VIT`    |      21 | `19 + FDV×3`  |    3 |      28 |
|  13 | Transfigurado                | `24 + VIT`    |      27 | `16 + FDV×3`  |    3 |      25 |
|  14 | Eco Eterno                   | `18 + VIT`    |      21 | `19 + FDV×3`  |    3 |      28 |
|  15 | Chama Negra                  | `20 + VIT`    |      23 | `19 + FDV×3`  |    3 |      28 |
|  16 | Demônio de Linhagem Infernal | `21 + VIT`    |      24 | `20 + FDV×3`  |    3 |      29 |
|  17 | Espírito Ceifador            | `20 + VIT`    |      23 | `18 + FDV×3`  |    3 |      27 |
|  18 | Monarca Demoníaco            | `22 + VIT`    |      25 | `20 + FDV×3`  |    3 |      29 |
|  19 | Vampiro de Linhagem          | `19 + VIT`    |      22 | `20 + FDV×3`  |    3 |      29 |

### Caso especial Exterminador Corrompido (nº 20)

Não usa fórmula padrão. Usa os recursos da vida anterior como Caçador:

```txt
PDV = 30 + (VIT × 3) + (10 × Nível do Personagem no momento da Queda)
PDK = PDR Máximo anterior + (Nível no momento da Queda × 2) + (FDV × 3)
```

Exemplo (VIT 3, FDV 3, Nível na Queda 6, PDR Máx anterior 18):

```txt
PDV = 30 + 9 + 60 = 99
PDK = 18 + 12 + 9 = 39
```

Campos manuais na ficha: `oni_nivel_na_queda`, `oni_pdr_maximo_antes_queda`.

> [!warning] `vit_nvl1` / `fdv_nvl1`
> As fórmulas usam os valores de VIT/FDV **no nível 1** (snapshot da criação), não o valor atual. Já implementado assim no template.

---

## 3. Ganhos Acumulados por Nível (além da Origem)

|  Nv | Ganho PDV do nível | Acumulado        |  Ganho PDK do nível | Acumulado |
| --: | ------------------ | ---------------- | ------------------: | --------: |
|   1 |                    | 0                |                     |         0 |
|   2 | `1d4`              | `1d4`            |                  +4 |        +4 |
|   3 | `1d4`              | `2d4`            |                  +4 |        +8 |
|   4 | `1d6`              | `2d4+1d6`        |                  +6 |       +14 |
|   5 | `1d6`              | `2d4+2d6`        |                  +6 |       +20 |
|   6 | `1d6`              | `2d4+3d6`        |                  +6 |       +26 |
|   7 | `2d4`              | `4d4+3d6`        |                  +8 |       +34 |
|   8 | `2d4`              | `6d4+3d6`        |                  +8 |       +42 |
|   9 | `2d4`              | `8d4+3d6`        | **+10 +10 (Pulso)** |   **+62** |
|  10 | `2d6`              | `8d4+5d6`        |                 +10 |       +72 |
|  11 | `2d6`              | `8d4+7d6`        |                 +10 |       +82 |
|  12 | `2d6`              | `8d4+9d6`        |                 +12 |       +94 |
|  13 | `30+VIT`           | `…+30+(VIT)`     |                 +12 |      +106 |
|  14 | `30+VIT`           | `…+60+(VIT×2)`   |                 +14 |      +120 |
|  15 | `30+VIT`           | `…+90+(VIT×3)`   |                 +14 |      +134 |
|  16 | `40+VIT`           | `…+130+(VIT×4)`  |                 +16 |      +150 |
|  17 | `40+VIT`           | `…+170+(VIT×5)`  |                 +16 |      +166 |
|  18 | `40+VIT`           | `…+210+(VIT×6)`  |                 +18 |      +184 |
|  19 | `40+VIT`           | `…+250+(VIT×7)`  |                 +20 |      +204 |
|  20 | `50+(VIT×5)`       | `…+300+(VIT×12)` |                 +50 |      +254 |

Confirmado pelo Operador (2026-08-25): **NVL 9 = +20 PDK total** (10 do nível + 10 do Pulso de Sangue Superior).

O dado de PDV dos níveis 2–12 é **rolado uma vez** e persistido no campo `pdv_oni_ganho_nvlX` da aba Config/Dados.

---

## 4. Atributos Por Que Oni ≠ Slayer

### Slayer (modelo atual)

```txt
atributo_display = valor_config + bônus_de_origem + temporário
```

A origem do Slayer **concede bônus permanente de atributo** na criação.

### Oni (modelo oficial)

As Origens Oni **NÃO concedem bônus permanente de atributo**. Nenhum documento de Origem dá "+1 FOR" etc. na criação. Os únicos modificadores são situacionais (ex.: Vampiro +1 em testes de CAR contra quem viu sua forma).

Todo ganho de atributo Oni vem da **progressão por nível**, por escolha:

| Nível | Ganho de atributo                                                               |
| ----: | ------------------------------------------------------------------------------- |
|     3 | +1 à escolha                                                                    |
|     4 | +1 à escolha                                                                    |
|     6 | +1 à escolha                                                                    |
|     8 | +1 à escolha                                                                    |
|    11 | +1 à escolha                                                                    |
|    12 | +1 em **dois** atributos (Aprimoramento Amplo)                                  |
|    13 | +2 num destes: VIT / FOR / DEX ou +1 em dois deles (Aumento de Corpo Demoníaco) |
|    16 | +2 FDV **fixo**                                                                 |

Total possível por escolha livre: até **+6 espalhados** (níveis 3–11) + **+2 duplos** (12) + **corpo demoníaco** (13). O +2 FDV do 16 é automático.

> [!danger] Divergência encontrada no código
> O template atual aplica `ONI_ORIGIN_BONUSES` (bônus permanente por origem: ex. Comum +1 VIT, Raiz Podre +2 VIT, Eco Eterno +2 FDV). **Isso não existe nos documentos oficiais.** Parece herança do modelo Slayer.
>
> **Decisão necessária do Operador:** remover `origem_oni_bonus_*` e migrar para ganho por progressão?

### Arquitetura proposta para atributos Oni

```txt
atributo_display = atr_X_valor_config      ← base distribuída na criação (manual)
                 + atr_X_ganho_progressao  ← acumulado das escolhas de nível (Number Field)
                 + bonus_atr_X_valor_temp  ← temporários
```

- `atr_X_ganho_progressao`: um Number Field por atributo (VIT/DEX/FOR/CAR/FDV/INT/SAB) na aba Config/Dados, incrementado manualmente a cada nível que dá escolha.
- O `+2 FDV` do NVL 16 pode ser automático: `(nvl_num>=16?2:0)` somado ao `fdv_display`.
- Zero bônus de origem. Zero fallback.

---

## 5. Checklist de Decisões Pendentes

1. [ ] Remover `ONI_ORIGIN_BONUSES` do template? (recomendado: sim, docs não suportam)
2. [ ] Criar campos `atr_X_ganho_progressao` (7 Number Fields) na aba Config/Dados?
3. [ ] `+2 FDV` do NVL 16: automático via fórmula ou manual?
4. [ ] Validar visualmente painel "Origem Recursos Iniciais" no Foundry após publicar.

---

## Conexões

- [[Progressao_dos_Onis_1-20_corrigida]]
- `MACRO-NA-FOUNDRY/Mecânicas para fazer na ficha/Onis/Origens/`
- `tools/migrate-oni-template.mjs` implementação atual
