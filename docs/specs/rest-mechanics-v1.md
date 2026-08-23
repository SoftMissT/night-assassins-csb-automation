---
title: "Night Assassins - Descanso Slayer v1"
created: "2026-08-07"
status: accepted-for-implementation
type: spec
tags: [foundry, night-assassins, descanso, slayer]
---

# Descanso Slayer v1

## Escopo

Implementar [[status-mechanics-v1|Status]] e recursos namespaced do Slayer por uma macro `Gerenciar Descanso`. O jogador solicita e configura o descanso; o GM primário confirma o benefício para cumprir a regra antiabuso. Recursos e estados são gravados em uma atualização atômica do Actor.

## Modal

- Descanso de Campo (2h): rola `1d4 × VIT`; com VIT 0 ou menor, rola no mínimo `1d4`. Recupera como quantidade até metade do PDR máximo, sem ultrapassar o máximo, restaura Fôlego e oferece somente os estados leves permitidos.
- Descanso Completo (8h): restaura PDV/PDR/Fôlego até o máximo, reduz Exaustão em 2 e oferece somente estados leves ou explicitamente tratados.
- Recuperação Profunda (24h+): restaura recursos; o GM escolhe remover toda Exaustão ou reduzir 4; tratamentos graves aparecem somente quando suas condições narrativas foram confirmadas.

## Interrupção

- Descanso de Campo exige completar as 2h; se interrompido antes disso, não existe categoria inferior e não concede benefício.
- Descanso Completo interrompido antes de 2h: nenhum benefício; com pelo menos 2h, recebe Descanso de Campo.
- Recuperação Profunda interrompida antes de completar um Descanso Completo: nenhum benefício; com pelo menos 8h em local seguro, recebe Descanso Completo.
- O modal mostra o benefício resultante antes da confirmação do GM.

## Persistência

`descanso_slayer_dados` guarda o último benefício, tipo, duração concluída, horário do mundo e marcador de cena. Todo novo benefício exige confirmação do GM, que confirma se houve combate, missão, exploração perigosa, desgaste ou avanço real de tempo desde o anterior.

PDV recuperado incrementa `pdv_slayer_curado`; PDR recuperado incrementa `pdr_slayer_curado`, sempre limitando o resultado atual ao máximo. Ferida nunca é removida automaticamente.

## Estados graves

- Fratura: Recuperação Profunda + tratamento; teste `1d20 + VIT` do alvo ou `1d20 + SAB` do tratador contra CD 14. Resultado 20 remove completamente; resultado 1 mantém e pode aplicar Fadiga Corporal por decisão do GM.
- Corrupção: só oferece teste de FDV se o GM confirmar ritual, purificação ou método narrativo e informar a CD.
- Silenciado: só remove automaticamente quando a fonte foi física ou exaustão respiratória; Kekkijutsu, maldição e técnica especial respeitam a fonte.
- Ferida: pode ser estabilizada narrativamente, mas não reduz `pdv_slayer_dano_ferida` sem tratamento importante ou autorização explícita do GM.
- Regeneração Suprimida nunca é removida pelo descanso antes de sua própria fonte terminar.

## Integrações

- [[life-and-death-mechanics-v1|Vida e Morte]]: cura em 0 PDV acorda o Slayer e aplica suas consequências.
- Dano Necrótico da Marca exige a regra específica da Marca; descanso não o apaga genericamente.
- Regeneração Suprimida respeita sua própria duração.
- Fôlego usa `folego_slayer_maximo = 2 + fdv_display` e o campo persistente `folego_slayer_atual`. Qualquer descanso restaura o atual ao máximo; o início de cada combate também começa cheio.

## Respiração da Recuperação

- Descanso Completo e Recuperação Profunda podem remover `Fadiga Corporal`, `Fadiga Espiritual` e `Fadiga Mental`, porque a regra dessas condições aceita Sono Completo. A remoção continua visível na confirmação do GM.
- Descanso de Campo não remove nenhuma das três Fadigas.
- `Ofegante` não é removido por descanso: sua remoção exige Ação Especial do próprio praticante ou ajuda de aliado adjacente.
- As quatro Formas da Respiração da Recuperação são técnicas de combate independentes. O gerenciador de descanso não rola, substitui nem simula essas Formas.

## Contrato executável

- O botão `DESCANSO` executa a macro `Night Assassins — Gerenciar Descanso` pelo UUID estável do Compendium e sempre envia `actorUuid: entity.uuid`.
- O jogador escolhe a modalidade e informa quantas horas foram realmente concluídas. Interrupções rebaixam o benefício conforme a tabela oficial.
- O GM primário recebe um `DialogV2` com o benefício calculado, a validação antiabuso, os status removíveis e os tratamentos graves aplicáveis.
- Sem GM ativo não existe alteração. Recusa, fechamento do modal ou falha de validação também não escrevem no Actor.
- A aprovação grava recursos, status e `descanso_slayer_dados` em um único `Actor#update`.
