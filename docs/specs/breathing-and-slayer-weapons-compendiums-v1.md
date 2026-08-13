---
title: "Compêndios completos de Respirações e Armas Slayer"
created: "2026-08-13"
last_updated: "2026-08-13"
status: active
type: spec
tags:
  - "#foundry/csb"
  - "#night-assassins/respiracao"
  - "#night-assassins/armas"
---

# Compêndios completos de Respirações e Armas Slayer

## Objetivo

Substituir o catálogo especial da Água por um pipeline reproduzível de Items CSB. O Compêndio de Respirações deve conter uma pasta para cada Respiração oficial solicitada e Items para todas as técnicas com fonte editorial disponível. O Compêndio de Armas Slayer deve conter um template e um Item rolável para cada arma de `Armas.md`.

Os arquivos editoriais permanecem na base de conhecimento `MACRO-NA-FOUNDRY`. O repositório do módulo versiona apenas os documentos mecânicos compilados em `catalogs/`, necessários para reconstruir os Compêndios no GitHub Actions.

## Respirações

- Um único template `_equippableItemTemplate`: `NA Respiração - Forma`.
- Uma pasta Foundry `Item` por Respiração, inclusive quando a fonte individual ainda não existe no vault.
- Cada cabeçalho de técnica de nível 2 (`##`) vira um `equippableItem` na pasta correspondente.
- O Item preserva o texto oficial completo em `descricao` e expõe o contrato já consumido por `useBreathForm`.
- Água mantém os onze Items mecânicos curados de `water-breathing-data.mjs`; as demais técnicas usam extração conservadora de custo, dano, nível e ação, sem inventar regras ausentes.
- IDs de pastas e Items são determinísticos para que novas Releases atualizem o mesmo conteúdo.
- Quando existir arte em `assets/icons/`, todas as Formas daquela Respiração usam o asset local do módulo. Respirações sem arte própria mantêm o fallback do Foundry; nenhum ícone é inventado.

## Armas Slayer

- Novo pack `night-assassins-armas-slayer`.
- Template `_equippableItemTemplate`: `NA Arma - Slayer`.
- Uma pasta para as armas básicas de `Armas.md` e outra para as armas especiais descritas nos arquivos individuais de `Mecânicas para fazer na ficha/Armas/`.
- Um Item por entrada numerada de `Armas.md` e um Item por arma especial individual.
- Props obrigatórias: `inventario_categoria=arma`, dano fixo, dados, atributos, tipos de dano, crítico, alcance, propriedades, requisito, `arma_imagem_vertical` e descrição integral.
- `img` guarda a miniatura quadrada 1:1; `arma_imagem_vertical` guarda a arte expandida 9:16 em `assets/weapons/vertical/`.
- O template editável da arma fica em `src/templates/items/slayer-weapon-template.json`; somente o Compêndio compilado em `packs/` entra no pacote do Foundry.
- O Item Displayer existente na ficha Slayer chama a macro canônica de dano usando essas props.
- Armas especiais não podem ser reduzidas ao ataque-base: devem preservar entidade, demônio, lado dominante, gatilho, reação, estados de despertar, dano por Rank, técnicas, ritual, vínculo e regras de crítico.
- Armas com múltiplos modos, alcances ou fórmulas devem expor perfis de ataque selecionáveis; nunca somar todos os perfis na mesma rolagem.
- Modificadores como “metade de DEX/FOR” devem ser representados explicitamente e não convertidos em atributo inteiro.

## Fontes incompletas

As Respirações Ameixeira, Estrelas, Macaco, Nevasca, Tartaruga, Tinta, Tormenta e Tubarão aparecem no catálogo solicitado, mas não possuem arquivo individual na pasta oficial atual. Suas pastas são distribuídas vazias e sinalizadas no build; nenhuma Forma é fabricada.

## Aceite

- Todas as 44 pastas solicitadas existem no pack.
- Todas as técnicas dos 36 arquivos individuais existentes viram Items.
- Água continua com 11 Formas curadas e roláveis.
- Todas as armas numeradas de `Armas.md` viram Items na pasta `Armas dos Caçadores`.
- O release workflow recompila ambos os packs antes de criar `module.zip`.
- Testes verificam cobertura, IDs, folders, template e props mecânicas mínimas.

## Conexões

- [[water-breathing-items-v1|Respiração da Água como Items CSB]]
- [[../../ROADMAP|Roadmap do módulo]]
