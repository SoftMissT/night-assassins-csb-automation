---
title: "Identidade visual das 36 Respirações v1"
created: "2026-08-29"
last_updated: "2026-08-29"
status: draft
type: spec
tags:
  - "#foundry/csb"
  - "#night-assassins/respiracoes"
  - "#night-assassins/css"
---

# Identidade visual das 36 Respirações v1

## Estado e dependência

Esta SPEC registra o contrato visual futuro. A implementação fica bloqueada até o gate P0 de reimportação e validação runtime das fichas ser concluído. Ela não autoriza alterar o design oficial das fichas Oni ou Slayer.

## Objetivo

Cada Item de Respiração deve carregar a própria identidade cromática no Item avulso, no ItemContainer da ficha Slayer, nos cards de Forma, nos badges de PDR e, quando houver card próprio, no chat.

O dado canônico é um slug estável. A apresentação deriva o token `--breath-color`; texto mecânico, fórmulas e filtros não recebem HTML ou CSS.

## Slugs e cores canônicas

```css
.na-breath-agua       { --breath-color: #048ABF; }
.na-breath-chamas     { --breath-color: #CF4F25; }
.na-breath-vento      { --breath-color: #A4FE23; }
.na-breath-pedra      { --breath-color: #8D6027; }
.na-breath-trovao     { --breath-color: #F8EB4D; }
.na-breath-flores     { --breath-color: #D45CA4; }
.na-breath-inseto     { --breath-color: #A65B7E; }
.na-breath-serpente   { --breath-color: #BB97F9; }
.na-breath-nevoa      { --breath-color: #76B2B9; }
.na-breath-besta      { --breath-color: #1FA6A6; }
.na-breath-som        { --breath-color: #D9A834; }
.na-breath-amor       { --breath-color: #D23770; }
.na-breath-sol        { --breath-color: #F28E13; }
.na-breath-lua        { --breath-color: #DC9EF1; }
.na-breath-nevasca    { --breath-color: #52FF89; }
.na-breath-ameixeira  { --breath-color: #A6535A; }
.na-breath-lava       { --breath-color: #400101; }
.na-breath-tigre      { --breath-color: #DE5D04; }
.na-breath-aranha     { --breath-color: #0A011A; }
.na-breath-areia      { --breath-color: #E2B96A; }
.na-breath-tinta      { --breath-color: #2F2F2F; }
.na-breath-tubarao    { --breath-color: #224459; }
.na-breath-prodigios  { --breath-color: #6F3A9C; }
.na-breath-ferro      { --breath-color: #BF6E50; }
.na-breath-dragao     { --breath-color: #F7E57C; }
.na-breath-sonhos     { --breath-color: #B19CD9; }
.na-breath-sombras    { --breath-color: #3D3F46; }
.na-breath-macaco     { --breath-color: #591202; }
.na-breath-raposa     { --breath-color: #FF9100; }
.na-breath-tartaruga  { --breath-color: #57693E; }
.na-breath-sangue     { --breath-color: #FF1744; }
.na-breath-lobo       { --breath-color: #78909C; }
.na-breath-estrelas   { --breath-color: #7B2FBE; --breath-color-sec: #FFD700; }
.na-breath-cristal    { --breath-color: #F5FFFE; }
.na-breath-tormenta   { --breath-color: #47042A; }
.na-breath-veneno     { --breath-color: #0F7902; }
```

## Componentes visuais

- `.na-breath-card`: card escuro, borda lateral derivada de `--breath-color` e elevação discreta.
- `.na-breath-title`: título da Forma com a cor da Respiração.
- `.na-breath-pdr-badge`: custo PDR legível e derivado do mesmo token.
- `.na-breath-list`: escopo do ItemContainer; não pode atingir outros Items.
- `.na-breath-chat`: escopo opcional para mensagem de chat gerada pelo módulo.

## Contraste e fallback

- Slug ausente ou inválido usa `#FFD700` e registra diagnóstico somente quando o modo debug estiver ativo.
- Cores muito escuras, incluindo Aranha, Lava, Tinta, Sombras, Macaco e Tormenta, não podem ser usadas diretamente como texto sobre fundo escuro. O texto recebe um token de contraste separado; a cor canônica permanece na borda e no brilho.
- Cristal e outras cores claras devem manter contorno escuro suficiente.
- Não depender apenas da cor: nome, custo e tipo de ação continuam textuais.
- Respeitar `prefers-reduced-motion`; hover não pode deslocar layout nem esconder controles.

## Fluxo de dados

```text
respiracao_tipo/slug do Item
  -> classe na-breath-<slug> no contêiner visual
  -> --breath-color
  -> card, título e badge
```

O mecanismo que aplica a classe deve ser confirmado contra as capacidades reais do CSB antes da implementação. Não inserir `compareText` sem fallback e não duplicar o slug em campos numéricos.

## Critérios de aceite

- As 36 classes existem exatamente uma vez e os slugs são cobertos por teste estrutural.
- Item avulso, ItemContainer e chat exibem a mesma identidade.
- Slug inválido não quebra preparação do Item nem produz `undefined`.
- Contraste é validado para cores claras e escuras, com foco visível por teclado.
- O CSS fica isolado de Oni, Oni Minion, NPC, armas e Kekkijutsu.
- Validação visual ocorre no Foundry v14 com GM e jogador.

## Conexões

- [[breathing-and-slayer-weapons-compendiums-v1|Compêndios de Respirações e Armas v1]]
- [[weapon-templates-and-combat-pipeline-v2|Templates e pipeline de armas Slayer v2]]
