---
title: "Night Assassins — TASK canônica"
created: 2026-08-30
last_updated: 2026-08-30
status: active
maturity: budding
type: tasks
tags: ["#projeto/night-assassins-csb-automation", "#tasks/canonica"]
agents_allowed: ["ALL"]
---

# TASK — fila canônica de execução

Este é o único arquivo usado para decidir a próxima tarefa. [[todo|todo.md]], [[backlog-completo-v0.11.38|backlog-completo]], [[TASKS_ATUAIS|TASKS_ATUAIS]] e os arquivos `TASK-*` são histórico, checklists ou especificações vinculadas.

## Estado atual

- Baseline publicada: `v0.11.46` (`49a3272`).
- Release confirmada no GitHub com `module.json` e `module.zip`; workflow oficial concluído com sucesso.
- Testes locais: `947/947`, `167` suítes, zero falhas.
- Aprovados pelo operador: Slayer N1–N20, Vida e Morte, Oni N1–N20 e desempenho.
- Bloqueio atual: validação real no Foundry das ações, Dice So Nice/chat, dano Slayer→Oni, crítico e regeneração Oni.

## Fila priorizada

| ID | Prioridade | Tarefa | Status | Depende de |
|---|---:|---|---|---|
| TASK-005 | P0 | Fluxo GM/jogador: ações, Acerto, Dano, Ferida, Resistência, cura, crítico e chat | EM TESTE NO FOUNDRY | — |
| TASK-004 | P0 | Triar console CSB: loops, `ERROR`, `[object Object]`, props não computadas | PENDENTE | TASK-005 |
| TASK-006 | P1 | Inventariar templates, IDs, filtros, Compendiums e consumidores | PENDENTE | TASK-004 |
| TASK-007 | P1 | Corrigir template Respiração/Forma oficial | PENDENTE | TASK-006 |
| TASK-012 | P1 | Corrigir pipeline Respiração/Forma | PENDENTE | TASK-007 |
| TASK-008 | P1 | Corrigir template e dano das armas normais | PENDENTE | TASK-006 |
| TASK-034 | P1 | Finalizar Katana, Double Blade, Manoplas e Cutelos Gêmeos | PENDENTE | TASK-008 |
| TASK-009 | P1 | Criar template separado de armas especiais | PENDENTE | TASK-034 |
| TASK-011 | P1 | Criar template de Kekkijutsu | PENDENTE | TASK-006 |
| TASK-013 | P1 | Criar pipeline de Kekkijutsu | PENDENTE | TASK-011 |
| TASK-015 | P2 | Validar PDV/PDK, ledger e regeneração Oni; membros N9/N17 | EM TESTE NO FOUNDRY | TASK-005 |
| TASK-016 | P2 | Corrigir cada Respiração individualmente | PENDENTE | TASK-012 |
| TASK-017 | P2 | Habilidades de Origem Slayer/Oni | PENDENTE | TASK-004 |
| TASK-018 | P2 | Habilidades de Classes por rank | PENDENTE | TASK-017 |
| TASK-019 | P2 | Marca do Caçador | PENDENTE | TASK-018 |
| TASK-020 | P2 | Mundo Transparente | PENDENTE | TASK-018 |
| TASK-021 | P2 | Estado Altruísta | PENDENTE | TASK-018 |
| TASK-022 | P2 | Lâmina Carmesim | PENDENTE | TASK-018 |
| TASK-023 | P2 | Interlúdio | PENDENTE | TASK-017 |
| TASK-025 | P3 | Corrigir key de traço do Oni Minion | PENDENTE | TASK-006 |
| TASK-026 | P3 | Auditar imagens das macros | PENDENTE | TASK-006 |
| TASK-028 | P3 | Validar Dice So Nice como dependência instalada | EM TESTE NO FOUNDRY | TASK-005 |
| TASK-029 | P3 | Auditar manifesto, build, pacote, tag e instalação GitHub | CONCLUÍDA EM v0.11.46 | TASK-028 |
| TASK-030 | P3 | Auditoria de segurança | PENDENTE | TASK-004 |
| TASK-032 | P3 | UX e acessibilidade dos diálogos | PENDENTE | TASK-005 |
| TASK-033 | P3 | Melhorar CSS preservando exports oficiais | PENDENTE | TASK-007/TASK-008 |

## Critério de avanço

Só fechar uma task com evidência. Tarefas de hooks, UI, permissões, Compendium ou rolagem exigem teste no Foundry; teste Node sozinho não fecha o gate.

## Próximo passo único

Executar no Foundry o checklist do TASK-005: uma ação por Acerto, uma animação por Roll, dano após o Acerto, atualização das duas fichas e nenhum consumo duplicado.

## Concluídas

- TASK-001: rotina de release/reimportação, não é implementação.
- TASK-002: Slayer N1–N20 e Vida e Morte.
- TASK-003: Oni N1–N20.
- TASK-031: gate de desempenho.
- TASK-029: manifesto, pacote, tag e release GitHub validados em `v0.11.46`.

## Lições consolidadas até v0.11.46

- O chat de dano só pode ser publicado depois que a única rolagem terminar e a animação do Dice So Nice for aguardada; chamar o dado manualmente e depois criar outra mensagem duplica a rolagem.
- O consumo de ações precisa passar pelo serviço canônico de ações. Fluxos internos que já consumiram ação devem declarar explicitamente que não haverá segundo consumo.
- Crítico positivo duplica o dano final depois de dados e bônus, antes da resistência; não duplica cada parcela separadamente.
- Rotinas de `ready` devem registrar motores e sincronizar macros, sem varrer e regravar todos os Actors/Items do mundo.
- Templates oficiais, fórmulas fornecidas pelo operador e repetições intencionais são contratos; não devem ser “normalizados” por inferência.
- Testes Node validam contratos locais, mas hooks, permissões, atualização de fichas, chat e Dice So Nice continuam exigindo Actor real no Foundry v14.
- Toda release só está concluída após confirmar commit, tag remota, workflow e os assets `module.json` e `module.zip`.
- O encerramento da sessão deve atualizar esta `TASK.md` canônica junto com STATE, MEMORY, CHANGELOG, decisões, erros e handoff.
