---
title: Montador de Ataque Night Assassins v1
created: 2026-08-14
status: active
maturity: budding
type: projeto
tags:
  - foundry-vtt/night-assassins
  - combate/montador-ataque
agents_allowed: ["ALL"]
---

# Montador de Ataque Night Assassins v1

## Objetivo

Conectar o botao geral de dano aos Items portados pelo Actor. O jogador escolhe uma arma, um perfil e opcionalmente uma Forma de Respiracao; o modulo monta as parcelas de dano sem exigir redigitacao. O formulario manual permanece como fallback e editor final.

Relacionados: [[adaptacao-completa-night-assassins-v1]] e [[flame-breathing-items-v1]].

## Requisitos funcionais

- RF-001: resolver o Actor explicitamente pelo contexto recebido da ficha.
- RF-002: listar somente Items de arma portados que possuam perfil mecanico executavel.
- RF-003: listar somente Formas de Respiracao portadas, ativas e com dano no nivel selecionado.
- RF-004: calcular o perfil da arma com Rank e atributos finais `*_display`.
- RF-005: converter arma e Forma em parcelas independentes, preservando tipos de dano.
- RF-006: somar o custo de PDR da Forma ao formulario de dano.
- RF-007: manter Marca, passivas e bonus pendentes no `damage-service`, evitando duplicacao.
- RF-008: permitir Arma sem Forma, Forma sem Arma e Dano Manual.
- RF-009: cancelar o montador sem gastar acao, PDR ou realizar rolagem.
- RF-010: permitir revisar, remover ou adicionar parcelas no dialogo de dano existente.

## Pipeline

```text
Botao Rolar Dano
  -> resolve Actor
  -> Montador de Ataque
  -> arma/perfil opcional
  -> Forma de Respiracao opcional
  -> parcelas e custo pre-preenchidos
  -> dialogo de dano existente
  -> acao, recursos, critico, resistencias, Ferida e relay GM
```

## Limites desta entrega

- O montador nao inventa mecanicas ausentes nos Items.
- Efeitos sem representacao estruturada continuam sob seus motores especificos.
- O executor unificado de acerto + defesa + dano permanece uma fase posterior; esta entrega conecta fontes ao dano sem quebrar os botoes existentes.

## Criterios de aceitacao

- CA-001: um Actor com uma arma recebe ao menos uma parcela pre-preenchida.
- CA-002: uma Forma com dano adiciona parcela e custo corretos.
- CA-003: a combinacao arma + Forma preserva duas parcelas separadas.
- CA-004: cancelar retorna sem ChatMessage e sem update do Actor.
- CA-005: o modo manual continua abrindo uma entrada vazia.
- CA-006: a suite completa permanece verde.
