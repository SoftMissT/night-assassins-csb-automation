---
title: "Recursos numéricos e fundação da ficha Oni"
created: "2026-08-12"
last_updated: "2026-08-12"
status: active
type: spec
tags:
  - "#foundry/csb"
  - "#night-assassins/oni"
---

# Recursos numéricos e fundação da ficha Oni

## Objetivo

Corrigir PDV/PDR/PDK e as barras de token sem usar Labels HTML como fonte numérica, e substituir a progressão Slayer copiada para o template Oni por uma base 1–20 própria.

## Contrato de recursos

- Slayer usa exclusivamente `pdv_slayer_*` e `pdr_slayer_*`.
- Oni usa exclusivamente `pdv_oni_*` e `pdk_oni_*`.
- Labels visuais podem conter Orbitron e HTML, mas barras sempre apontam para Hidden Attributes numéricos.
- Ferida reduz o máximo; dano comum reduz apenas o atual.
- Valores atuais são limitados entre zero e o máximo efetivo.
- PDV/PDR/PDK extra aumenta máximo e atual; cura nunca ultrapassa o máximo.

## Hidden Attributes canônicos

### Slayer

- `pdv_slayer_maximo_num`
- `pdv_slayer_atual_num`
- `pdr_slayer_maximo_num`
- `pdr_slayer_atual_num`

### Oni

- `pdv_oni_maximo_num`
- `pdv_oni_atual_num`
- `pdk_oni_maximo_num`
- `pdk_oni_atual_num`

## Progressão Oni

- O nível vai de 1 a 20.
- A origem usa as opções `origem_oni_*` já presentes no export editorial.
- PDV e PDK iniciais são calculados pela origem Oni, nunca pela tabela de origens Slayer.
- Ganhos aleatórios de PDV precisam ser persistidos; não podem rerrolar ao renderizar a ficha.
- O módulo deve guardar uma parcela por nível (`pdv_oni_ganho_nvl2` até `pdv_oni_ganho_nvl12`) e somá-la somente quando o nível correspondente estiver alcançado.
- Ganhos fixos de PDK são calculados por nível. O Pulso de Sangue Superior do nível 9 acrescenta os 10 PDK adicionais uma única vez.
- A progressão de atributos Oni será um serviço próprio; não reutiliza os snapshots Slayer 1/3/7.

## Organização inicial da ficha Oni

- Perfil: nome, nível 1–20, patente Oni, origem e especialização.
- Combate: PDV, PDK, Fôlego, Acerto, Defesa, Dano e ações de chefe.
- Poderes: Origem, Kekkijutsu, Especialização e capacidades demoníacas.
- Inventário: armas, equipamentos e itens.
- Dados: parcelas persistidas da progressão, dano, Ferida, cura e gasto.

## Aceite

- As quatro barras Slayer/ONI referenciam somente Hidden Attributes numéricos.
- Nenhuma referência `pdr_oni` permanece no template distribuído.
- O Oni possui níveis 1–20 e origens próprias.
- O PDV máximo Oni muda com origem, nível, Ferida e extras sem produzir `ERROR`.
- O PDK máximo/atual usa keys `pdk_oni_*` e respeita gasto, cura e extras.
- Testes de template, distribuição e dano aprovados antes de Release.

## Conexões

- [[../../ROADMAP|Roadmap do módulo]]
- [[oni-damage-integration-v1|Integração de dano Oni]]
- [[../../../MACRO-NA-FOUNDRY/Mecânicas para fazer na ficha/Onis/Progressao_dos_Onis_1-20_corrigida|Progressão Oni 1–20]]
