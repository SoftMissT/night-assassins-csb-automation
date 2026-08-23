---
title: "Respiração da Água como Items CSB"
created: "2026-08-08"
last_updated: "2026-08-08"
status: active
type: spec
tags:
  - "#foundry/csb"
  - "#night-assassins/respiracao"
---

# Respiração da Água como Items CSB

## Objetivo

Distribuir a [[Respiração da Água]] como conteúdo oficial do módulo: um template `_equippableItemTemplate`, onze `equippableItem`, um Compêndio de Items e um Item Displayer rolável na ficha Slayer. O arquivo `respiracao_da_agua.json` é a fonte editorial canônica; o catálogo mecânico continua em `scripts/water-breathing-data.mjs`.

## Contrato dos Items

- Template: `NA Respiração - Forma`.
- Cada linha do Item Displayer possui `USAR`, chamando `useBreathForm` com `linkedEntity.uuid` e `entity.uuid`.
- Cada Forma possui `forma_id`, nomes, tipo de manobra, nível mínimo, descrição, requisito e dados dos níveis 1 a 4.
- A macro do Item chama `useBreathForm({ itemUuid: entity.uuid, actorUuid: entity.parent?.uuid })`.
- Items são únicos e clonados no Actor ao arrastar do Compêndio.

## Formas obrigatórias

1. Barra de Superfície da Água: bônus de dano no próximo ataque bem-sucedido.
2. Roda D'Água: DEX CD 12 antes de custo, Vantagem e dano adicional.
3. Dança da Corrente Rápida: até três alvos distintos e bônus por nível.
4. Maré Impressionante: trigger de finalização/crítico e ataque imediato próximo.
5. Chuva Misericordiosa: alvo rendido/atordoado, crítico automático e recuperação ao finalizar.
6. Torção de Hidromassagem: ataque em área, bônus submerso e risco para aliados.
7. Gota de Chuva Penetrante: reação de Bloqueio com INT e combo com a 6ª Forma.
8. Força da Cascata: dano, supressão de resistência, teste de VIT, Atordoamento e recarga.
9. Respingos de Água: Esquiva, deslocamento, pulo automático da 2ª Forma e extensão aliada.
10. O Dragão da Mudança: carregamento por turno, dano acumulado, combo e Exaustão.
11. Calmaria: reação, usos diários por nível e anulação do ataque.

## Persistência

O estado transitório usa as keys `resp_*` já presentes no Slayer e um JSON versionado `resp_agua_estado`. Contadores avançam no `updateCombat` pelo GM primário. Descanso/novo dia restaura usos diários em integração posterior com o descanso completo.

## Compêndio

- Pack: `night-assassins-respiracoes`.
- Tipo Foundry: `Item`.
- O workflow cria o pack antes do `module.zip`.
- O ZIP deve conter template e onze Formas.

## Aceite

- Doze documentos no pack: um template e onze Items.
- Todas as Formas apontam para o template por ID estável de 16 caracteres.
- A ficha mostra somente Items cuja categoria seja `respiracao`.
- `nvl_respiracao_num` é a fonte canônica do nível.
- Suíte completa aprovada e pacote reproduzível.

## Conexões

- [[../../ROADMAP|Roadmap do módulo]]
- [[../../../MACRO-NA-FOUNDRY/Versao-Oficial-Night-Assassins-V25.1/Respirações/Respiração da Água|Respiração da Água]]
