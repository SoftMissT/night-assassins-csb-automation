---
title: Passivas de Nevoa Pedra Neve e Metal v1
status: implementation
date: 2026-08-14
---

# Passivas de Nevoa, Pedra, Neve e Metal

## Objetivo

Transformar as regras de [[Respiração da Névoa]], [[Respiração da Pedra]], [[Respiração da Neve]] e [[Respiração do Metal]] em estado executável do módulo, sem tratar texto narrativo como automação.

## Contratos

- O crítico-base vem de `arma_critico` da arma escolhida no diálogo de Acerto.
- Pedra mantém Quebra por arma. Cada acúmulo reduz em 1 o limiar de crítico da arma, limitado pela FOR final.
- Metal — Martelo do Julgamento é disparado por crítico confirmado: libera um ataque adicional e marca o próximo dano como metade, arredondada para cima, ignorando resistências.
- Neve — Congelar é acumulado por alvo; a 1ª Forma e os críticos da 2ª/5ª aplicam um acúmulo. Cinco acúmulos liberam Restrição de Movimentos.
- Névoa mantém separadamente os padrões Ciclone, Estigma e Reflexão. A 6ª Forma consome a combinação sem confundir os três gatilhos.
- Itens de passiva não gastam ação nem PDR quando clicados; apenas informam o estado automático.

## Persistência

O estado fica no Actor em `system.props.resp_passivas_estado`, como JSON versionado. Nenhum estado depende da sessão do navegador.

## Aceitação

1. O diálogo de Acerto lista as armas do Actor e mostra o crítico efetivo.
2. Um crítico não é mais fixado em 20 natural.
3. Quebra é isolado por arma.
4. `metal_05` e `neve_08` não executam como formas comuns.
5. Os estados são legíveis por testes puros e pelo motor de Acerto/Dano.

Relacionados: [[PROPRIEDADES DAS ARMAS]] e [[Tipos de Dano]].
