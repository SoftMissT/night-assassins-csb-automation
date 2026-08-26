---
title: "Oni — contrato de keys PDV, PDK e atributos"
created: "2026-08-26"
last_updated: "2026-08-26"
status: active
type: contrato
lead_agent: "@TANG-ROU"
tags:
  - night-assassins
  - onis
  - progressao
  - keys
  - csb
---

# Oni — contrato de keys

Fonte: `Progressao_dos_Onis_1-20_corrigida.md` + `Origens de Onis.md`.

```txt
Nível 1:  PDV Máximo = PDV da Origem
          PDK Máximo = PDK da Origem

Nível 2+: PDV Máximo = PDV da Origem + ganhos acumulados
          PDK Máximo = PDK da Origem + ganhos acumulados
```

Origem primeiro. Nível soma depois.

CSB: cada key vira `actor.system.props.<key>`. Fórmulas `${}$` leem a key direto. Snapshot grava Number Field — não fórmula.

---

## 1. Origem (já existem)

| Key | Tipo | Função |
|---|---|---|
| `origem_dropdown` | dropdown | origem escolhida |
| `origem_pdv_fixo` | hidden | parcela fixa de PDV |
| `origem_pdk_fixo` | hidden | parcela fixa de PDK |
| `origem_pdk_fdv_mult` | hidden | `4` se a origem já tem `+ FDV` na fórmula; senão `3` |
| `origem_oni_pdv_inicial` | hidden | PDV da Origem no nvl 1 |
| `origem_oni_pdk_inicial` | hidden | PDK da Origem no nvl 1 |
| `vit_nvl1` | number | VIT congelada na criação (PDV da Origem usa esta, não a atual) |
| `fdv_nvl1` | number | FDV congelada na criação (PDK da Origem usa esta) |
| `oni_nivel_na_queda` | number | só Exterminador Corrompido |
| `oni_pdr_maximo_antes_queda` | number | só Exterminador Corrompido |

---

## 2. PDK — table por nível (você monta agora)

Ganho **fixo**. Default no Number Field = valor da tabela. Macro de snapshot **não** escreve PDK.

| Nvl | Key | Default |
|---:|---|---:|
| 2 | `pdk_oni_ganho_nvl2` | 4 |
| 3 | `pdk_oni_ganho_nvl3` | 4 |
| 4 | `pdk_oni_ganho_nvl4` | 6 |
| 5 | `pdk_oni_ganho_nvl5` | 6 |
| 6 | `pdk_oni_ganho_nvl6` | 6 |
| 7 | `pdk_oni_ganho_nvl7` | 8 |
| 8 | `pdk_oni_ganho_nvl8` | 8 |
| 9 | `pdk_oni_ganho_nvl9` | **20** |
| 10 | `pdk_oni_ganho_nvl10` | 10 |
| 11 | `pdk_oni_ganho_nvl11` | 10 |
| 12 | `pdk_oni_ganho_nvl12` | 12 |
| 13 | `pdk_oni_ganho_nvl13` | 12 |
| 14 | `pdk_oni_ganho_nvl14` | 14 |
| 15 | `pdk_oni_ganho_nvl15` | 14 |
| 16 | `pdk_oni_ganho_nvl16` | 16 |
| 17 | `pdk_oni_ganho_nvl17` | 16 |
| 18 | `pdk_oni_ganho_nvl18` | 18 |
| 19 | `pdk_oni_ganho_nvl19` | 20 |
| 20 | `pdk_oni_ganho_nvl20` | 50 |

Nível 9 = `+10` do nível + `+10` Pulso de Sangue Superior = **20 numa key só**.

Fórmula sugerida (`pdk_oni_total_conta`):

```txt
${fallback(origem_oni_pdk_inicial,0)
+(nvl_num>=2?fallback(pdk_oni_ganho_nvl2,0):0)
+(nvl_num>=3?fallback(pdk_oni_ganho_nvl3,0):0)
+(nvl_num>=4?fallback(pdk_oni_ganho_nvl4,0):0)
+(nvl_num>=5?fallback(pdk_oni_ganho_nvl5,0):0)
+(nvl_num>=6?fallback(pdk_oni_ganho_nvl6,0):0)
+(nvl_num>=7?fallback(pdk_oni_ganho_nvl7,0):0)
+(nvl_num>=8?fallback(pdk_oni_ganho_nvl8,0):0)
+(nvl_num>=9?fallback(pdk_oni_ganho_nvl9,0):0)
+(nvl_num>=10?fallback(pdk_oni_ganho_nvl10,0):0)
+(nvl_num>=11?fallback(pdk_oni_ganho_nvl11,0):0)
+(nvl_num>=12?fallback(pdk_oni_ganho_nvl12,0):0)
+(nvl_num>=13?fallback(pdk_oni_ganho_nvl13,0):0)
+(nvl_num>=14?fallback(pdk_oni_ganho_nvl14,0):0)
+(nvl_num>=15?fallback(pdk_oni_ganho_nvl15,0):0)
+(nvl_num>=16?fallback(pdk_oni_ganho_nvl16,0):0)
+(nvl_num>=17?fallback(pdk_oni_ganho_nvl17,0):0)
+(nvl_num>=18?fallback(pdk_oni_ganho_nvl18,0):0)
+(nvl_num>=19?fallback(pdk_oni_ganho_nvl19,0):0)
+(nvl_num>=20?fallback(pdk_oni_ganho_nvl20,0):0)}$
```

Acumulado oficial: 0 / 4 / 8 / 14 / 20 / 26 / 34 / 42 / **62** / 72 / 82 / 94 / 106 / 120 / 134 / 150 / 166 / 184 / 204 / 254.

---

## 3. PDV — ledger por nível

Dado **rolado 1×** nos níveis 2–12. Já existem `pdv_oni_ganho_nvl2` … `pdv_oni_ganho_nvl12`. Nunca rerrolar.

| Nvl | Key | Dado / valor |
|---:|---|---|
| 2 | `pdv_oni_ganho_nvl2` | 1d4 |
| 3 | `pdv_oni_ganho_nvl3` | 1d4 |
| 4 | `pdv_oni_ganho_nvl4` | 1d6 |
| 5 | `pdv_oni_ganho_nvl5` | 1d6 |
| 6 | `pdv_oni_ganho_nvl6` | 1d6 |
| 7 | `pdv_oni_ganho_nvl7` | 2d4 |
| 8 | `pdv_oni_ganho_nvl8` | 2d4 |
| 9 | `pdv_oni_ganho_nvl9` | 2d4 |
| 10 | `pdv_oni_ganho_nvl10` | 2d6 |
| 11 | `pdv_oni_ganho_nvl11` | 2d6 |
| 12 | `pdv_oni_ganho_nvl12` | 2d6 |
| 13 | `pdv_oni_ganho_nvl13` | `30 + vit_display` |
| 14 | `pdv_oni_ganho_nvl14` | `30 + vit_display` |
| 15 | `pdv_oni_ganho_nvl15` | `30 + vit_display` |
| 16 | `pdv_oni_ganho_nvl16` | `40 + vit_display` |
| 17 | `pdv_oni_ganho_nvl17` | `40 + vit_display` |
| 18 | `pdv_oni_ganho_nvl18` | `40 + vit_display` |
| 19 | `pdv_oni_ganho_nvl19` | `40 + vit_display` |
| 20 | `pdv_oni_ganho_nvl20` | `50 + (vit_display × 5)` |

Níveis 13–20 podem ser Label/hidden com fórmula, não Number Field.

`pdv_oni_total_conta` = `origem_oni_pdv_inicial` + soma dos ganhos com `nvl_num>=N`. Cada nível entra **uma vez**.

---

## 4. Atributos — snapshot por nível

Padrão Slayer: `{attr}_nvl{N}` = **total** naquele nível, não o ganho.

Attrs: `vit` `dex` `for` `car` `fdv` `int` `sab`

Snapshots Oni: **1, 3, 4, 6, 8, 11, 12, 13, 16**

Não usar `nvl7` no Oni (leftover Slayer).

| Nvl | Keys | Macro |
|---:|---|---|
| 1 | `vit_nvl1` … `sab_nvl1` | criação (pool) |
| 3 | `vit_nvl3` … | +1 à escolha |
| 4 | `vit_nvl4` … | +1 à escolha |
| 6 | `vit_nvl6` … | +1 à escolha |
| 8 | `vit_nvl8` … | +1 à escolha |
| 11 | `vit_nvl11` … | +1 à escolha |
| 12 | `vit_nvl12` … | +1 em **dois** |
| 13 | `vit_nvl13` … | +2 VIT/FOR/DEX **ou** +1 em dois desses |
| 16 | `vit_nvl16` … | +2 FDV automático |

Também grava `atr_{attr}_valor_config` = último snapshot.

Table na ficha: uma linha por nível de snapshot, 7 Number Fields.

---

## 5. Recursos vivos (já existem)

| Key | Função |
|---|---|
| `nvl_pj` | dropdown de nível (dispara trigger) |
| `nvl_num` | número derivado |
| `pdv_oni_total_conta` / `pdk_oni_total_conta` | máximos calculados |
| `pdv_oni_maximo_num` / `pdv_oni_atual_num` | barra PDV |
| `pdk_oni_maximo_num` / `pdk_oni_atual_num` | barra PDK |
| `pdv_oni_dano_tomado` `pdv_oni_curado` `pdv_oni_extra` `pdv_oni_dano_ferida` | ledger PDV |
| `pdk_oni_gasto_valor` `pdk_oni_curado` `pdk_oni_extra` | ledger PDK |

Toda fórmula de recurso usa `fallback()` / `max()` / `min()`.

---

## 6. Macro

`na-attribute-level-snapshot` chama `api.runAttributeSnapshot(actor, nvl_pj)`.

Roll Message CSB:

```txt
%{return await game.macros.getName('na-attribute-level-snapshot').execute({actorUuid:entity.uuid,level:entity.system.props.nvl_pj});}%
```
