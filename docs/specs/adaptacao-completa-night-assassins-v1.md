---
title: Adaptacao completa Night Assassins v1
status: planned
date: 2026-08-14
---

# Adaptacao completa Night Assassins v1

## Objetivo

Transformar o modulo em uma adaptacao mecanica completa do Night Assassins para Foundry VTT 14 e Custom System Builder 6.0.2. Campos, Labels, Items e texto de regra nao contam como implementacao enquanto a regra nao validar requisitos, consumir recursos e acoes, resolver alvos, persistir estado, respeitar turnos e produzir resultado observavel no chat e na ficha.

Fontes canônicas: [[MACRO-NA-FOUNDRY]], [[foundry]] e [[custom-system-builder]]. O codigo novo pertence somente a este modulo.

## Diagnostico confirmado

- Slayer possui infraestrutura horizontal, mas Origens, Classes, boa parte dos Dons, Mundo Transparente, Estado Altruista e Lamina Carmesim ainda nao possuem motores completos.
- Oni possui apenas a fundacao de Actor, PDV/PDK, dano recebido, status e resistencias. Progressao 1-20, 20 Origens, 10 Especializacoes, regeneracao, combate desarmado, Kekkijutsu, Metamorfose e Julgamento estao ausentes.
- O catalogo de Respiracoes contem 44 pastas e 300 Items, mas apenas Agua e Chamas possuem motores especificos relevantes. Oito pastas estao vazias e as demais formas usam principalmente o executor generico.
- O catalogo de armas possui 43 Items e perfis de dano rolaveis, mas propriedades, municao, estados, tecnicas, habilidades e despertares continuam majoritariamente em texto.
- O template Oni contem dados antigos e blocos Slayer copiados. Os arquivos individuais de Origem Oni devem prevalecer sobre consolidados divergentes ate reconciliacao explicita.

## Regra arquitetural

Toda acao mecanica deve usar uma definicao estruturada e um contexto comum. Nenhum dominio pode criar seu proprio fluxo incompatível de acerto, dano, resistencia ou duracao.

### Definicao mecanica comum

```text
TechniqueDefinition
  identidade: id, sourceFamily, sourceItemUuid, ownerKind
  requisitos: nivel, rank, classe, origem, respiracao, arma, estados
  custos: acao, PDR/PDK, Folego, cargas, pagamento e reembolso
  alvo: modo, quantidade, alcance, area, aliados/inimigos
  acerto: atributo, quantidade sequencial, bonus, modo, critico
  defesa: defesa permitida, CD, atributo, efeito em sucesso
  dano: parcelas, formula, atributos, tipos, critico, resistencia, Ferida
  status: stacks, duracao, tick, salvaguarda e remocao
  efeitos: timing, alvo, modificadores e estado persistente
  ciclo: turno, rodada, combate, missao, sessao e permanente
  chat: resumo, resultados, custos e alteracoes aplicadas
```

### Pipeline unico

1. Resolver Actor, Item, arma/perfil, combate e alvos.
2. Validar requisitos, disponibilidade e limites temporais.
3. Reservar acao e recursos sem persistir parcialmente.
4. Executar acertos sequenciais, permitindo parar/cancelar sem rolagem extra.
5. Resolver defesa, salvaguarda e resultado parcial.
6. Resolver parcelas de dano, critico, resistencia, Ferida e vulnerabilidades.
7. Aplicar status, efeitos, duracoes e estados derivados.
8. Persistir o lote autoritativo pelo GM.
9. Publicar chat Foundry e registro de auditoria.

## Entregas

### Fase 0 - Estabilizacao

- Finalizar ou reverter conscientemente as passivas parciais de Nevoa, Pedra, Neve e Metal; nao liberar estado intermediario.
- Congelar contratos das keys Slayer e Oni e adicionar migracoes idempotentes.
- Corrigir contaminacao Slayer no template Oni e reconciliar PDV/PDK das 20 Origens pelos arquivos individuais.
- Criar testes de distribuicao para templates, packs, macros, manifest e ZIP.

### Fase 1 - Nucleo compartilhado

- Criar contexto de combate, schema de definicao, executor e registro de regras.
- Integrar action-service, hit-service, damage-service, damage-relay, status-engine e GM authority ao pipeline.
- Suportar turno, rodada, combate, missao e sessao com resets idempotentes.
- Tornar dano, cura e gasto de recurso transacionais por Actor.

### Fase 2 - Slayer completo

- Progressao 1-14 com ranks, nivel de Respiracao, concessao de Items e derivados.
- Doze Origens Slayer e suas 24 habilidades com gatilhos e limites.
- Cinco Classes C/B/A/S/SS, incluindo Mestre de Batalha no nivel 11 e Duas Respiracoes.
- Todos os Dons, conclusao da Marca do Cacador, Mundo Transparente, Estado Altruista e Lamina Carmesim.
- Interludio completo, Respiração da Recuperacao, Vida e Morte e Descanso integrados.

### Fase 3 - Armas e equipamentos

- Converter propriedades de armas em dados estruturados executaveis.
- Implementar municao, recarga, perfis, critico por perfil, duas maos, duas armas, aparar e tecnicas.
- Implementar armas especiais, habilidades, despertares e estados por Item.
- Separar armas Slayer, armas Oni e ataques naturais sem herdar regras Nichirin indevidas.

### Fase 4 - Respiracoes

- Migrar cada Forma do executor generico para definicoes mecanicas por familia de regra.
- Implementar passivas, multiplos acertos, areas, alvos, defesas, cura, combos, estados e duracoes.
- Completar primeiro Chamas, Neve, Nevoa, Pedra e Metal; depois migrar as demais Respiracoes em lotes testaveis.
- Nao publicar pasta vazia como conteudo completo. As oito Respiracoes sem fonte individual ficam bloqueadas ate existir regra canonica.

### Fase 5 - Oni completo

- Progressao 1-20: atributos, PDV/PDK, regeneracao, mordida, alimentacao, dano desarmado, acoes lendarias e morte.
- Vinte Origens Oni com passivas e habilidades executaveis.
- Dez Especializacoes com progressao completa 1-20.
- Kekkijutsu como Item rolavel no executor comum.
- Metamorfose, Julgamento do Sangue, conversao Slayer-Oni e estados de compulsao.
- Minions e dificuldade de missao como ferramentas GM separadas.

### Fase 6 - Fichas, Compendios e UX

- Fichas Slayer e Oni exibem somente recursos e controles que possuem mecanica.
- Compendios separados para templates, armas, Respiracoes, Kekkijutsu, Origens e Especializacoes.
- Controle GM lista participantes do combate pela identidade real do Actor e permite dano, cura, recursos, status e abertura da ficha.
- UI ApplicationV2, Orbitron local/fallback, layout compacto e minimizavel.

## Estrutura alvo

```text
scripts/core/          contexto, executor, regras, tempo e transacoes
scripts/slayer/        progressao, origens, classes e estados Slayer
scripts/oni/           progressao, origens, especializacoes e regeneracao Oni
scripts/items/         armas, Respiracoes, Kekkijutsu e equipamentos
catalogs/              definicoes estruturadas canônicas
src/templates/         apresentacao CSB e campos persistentes
tools/                 builders e migracoes reproduziveis
tests/                 unidade, integracao, contrato e distribuicao
```

## Sequencia de releases

1. Core de combate e contratos.
2. Slayer progressao, Origens e Classes.
3. Armas e propriedades.
4. Respiracoes em lotes completos.
5. Oni Core e 20 Origens.
6. Oni Especializacoes, Kekkijutsu e Metamorfose.
7. Compendios, UX e validacao multicliente.

Cada release exige: testes locais verdes, `detect_changes`, build reproduzivel, `module.zip` valido, manifest atualizado, Release publicado e checklist Foundry GM+jogador. Nao criar release apenas porque texto foi adicionado ao Compendium.

## Definition of Done

- Toda regra em escopo possui definicao estruturada, servico executavel e teste de comportamento.
- Slayer e Oni usam identidades, keys, recursos e regras separadas onde o sistema exige.
- Items carregam mecanica; descricoes HTML sao apresentacao, nao fonte de parsing em runtime.
- Acerto, critico, dano, resistencia, Ferida, status, recursos e duracoes atravessam um unico pipeline.
- Turnos e rodadas funcionam com o Combat Tracker e sao idempotentes.
- GM e jogador funcionam em clientes separados sem permissao manual indevida.
- Fichas importadas, Compendios, manifest e ZIP correspondem ao mesmo codigo/versionamento.

