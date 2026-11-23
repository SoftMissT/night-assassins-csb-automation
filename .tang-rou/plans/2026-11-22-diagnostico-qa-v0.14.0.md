---
title: "Diagnóstico no QA isolado — v0.14.0"
created: "2026-11-22"
status: diagnostico
type: plan
---

# Diagnóstico no QA isolado — v0.14.0

Ambiente: `foundry-teste.bat` (dataPath `D:\FoundryData-Test`, porta 30001), mundo `qa-csb-na`, Foundry 14.367, CSB 6.1.2, módulo 0.14.0, usuário `LLM` (GM; credencial em `.env`, fora do Git). Playwright MCP.

Alterações feitas no mundo de QA para testar: templates de ator e de item da 0.14.0 importados ou atualizados e recarregados nas fichas QA; Regras da Mesa com Origens, Metal e Habilidades em Vanilla; escolhas Vanilla do QA npc (Descendente, Metal Preto, Visão Aguçada); tokens de QA npc e QA slayer na cena e um combate criado. Backup dos usuários em `D:\FoundryData-Test\Backups\qa-csb-na-users-20261122`.

## Matriz

| Relato do operador | Resultado no QA | Classe |
|---|---|---|
| Fichas não mostram o que a 0.14.0 trouxe | Fichas usavam templates antigos (NPC `3061281920` × pack `1795234800005`; Slayer `…597` × `…614`; Oni `…727` × `…734`). Atualizar o módulo não toca nos templates do mundo nem na cópia guardada em cada ator. | **Causa raiz comum** — falta sincronizar templates |
| Erro 1: Origem, Metal e Habilidade Vanilla não aparecem | Com template novo, Regras da Mesa em Vanilla e escolha salva: cartões aparecem com o texto do livro. Antes de escolher, a aba fica vazia, só com o botão **Escolhas Vanilla**. Com a mesa em Homebrew, nada Vanilla aparece (correto pelo desenho). | Funciona após reimportar + **bug de UX** (estado vazio, seletor escondido) |
| Bônus de Metal e Habilidade não registra | Metal Preto: PDR total do NPC 10 → 11 após salvar. Bônus de Visão no Acerto e +1 Bloqueio **não testados em rolagem**. | Parcial — falta rolagem real |
| Perícias no NPC | Aba **Perícias** presente no template 0.14.0. Rolagem não testada. | Funciona após reimportar |
| Erro 2: falta macro de criação de itens | **Night Assassins Criar Item** está no compêndio e no Diretório de Macros. Fluxo ponta a ponta não testado. | Funciona após atualizar (não exercitado) |
| Erro 3: ações não resetam | Tracker nativo via API: ATAQUE 0/1 voltou a 1/1 no início do combate (NPC) e no turno do Slayer. Não testado: gasto pelo fluxo do módulo + botão do tracker; Combat Tracker Dock (não instalado no QA). | Não reproduzido — falta teste fiel |
| Armas têm que funcionar | 168 erros `Uncomputable formula "item.arma_habilidade_resumo"` por re-render do Slayer. Persistem com templates de item da 0.14.0 recarregados: Woldo e Adagas não têm a prop. A key existe em `src/templates/items/slayer-weapon-template.json:537`. | **Bug real** — template/container de armas |
| Acúmulos de passiva não aparecem (Cicatrizes, Brasas…) | Slayer: painel "ACÚMULOS DE RESPIRAÇÃO" imprime JSON cru e só cobre Água, Chamas, Pedra, Névoa, Metal e Neve. Faltam Vento, Som, Raposa, Sonhos, Eclipse. NPC não tem painel. `resp_vento_estado` não existe nas props do QA slayer. Os motores existem e são importados (`breathing-combat-passives.mjs`, `combat-passive-execution.mjs`). | **Bug real** — exibição |
| CSS demora / ficha lenta / estilo some e volta | Uma mudança de Dano Tomado no Slayer → 2 gravações + 2 renders completos, ~520 ms de long tasks (223 + 298). A 2ª gravação é o snapshot de `reconcileActor` (life-death-service), sem mudança visível. Re-render do Slayer: 368 ms (4.871 nós), NPC 108 ms, Oni 78 ms. Erros de fórmula das armas somam custo a cada render. Coletor de diagnóstico **descartado** (não grava esse erro). Sem ciclo de gravação ao abrir. | **Bug real** — cascata de updates + render pesado |
| Bônus Fixos acima da Respiração | Na aba Combate, **Bônus Fixos** é só um título recolhido acima de Ações e Status; o bloco Respiração fica embaixo. | Ajuste de layout pedido |
| Ficha de Oni | Abre (re-render 78 ms). Acerto/Dano não testados. | Não testado |

## Acúmulos por Respiração (fonte `docs/Sistema/03 - Respirações`, Homebrew)

| Respiração | Acúmulo | Escopo | Fonte |
|---|---|---|---|
| Som | BPM (até 200), estágios da Partitura | praticante | `Respiração do Som.md` — Passiva Partitura Musical |
| Chamas | Fogo Fátuo (pontos na arma); Brasas Ardentes (por inimigo, Queimando a partir de 5) | arma / alvo | `Respiração da Chamas.md` — Esquentar |
| Vento | Cicatrizes (permanentes, sem teto); bônus de VIT por Sangramento/Infecção; Corrente do Vendaval (Controlado/Descontrolado) | praticante | `Respiração do Vento.md` — Sangue Especial, Corrente do Vendaval |
| Raposa | Véus (0–9, começa em 0) | praticante | `Respiração da Raposa.md` — Véus da Raposa |
| Sonhos | Memórias sacrificadas (Troca Equivalente); Mar de Memórias ativo | praticante | `Respiração do Sonhos.md` |
| Água | estado `resp_agua_estado` no código | praticante | fonte não localizada nesta pasta — **confirmar** |
| Eclipse | Conceptáculo Penumbral / Eclipse Verdadeiro | praticante | `Respiração do Eclipse.md` — confirmar se há contador |

## Hipóteses descartadas por medição

- Ciclo de `syncSheetRulesProfile` ao abrir: 0 gravações na abertura.
- Coletor de diagnóstico gravando Journal a cada erro: nenhum Journal criado; o erro do CSB não passa no filtro do módulo.

## Correções aplicadas (2026-11-22, sem commit)

| Item | Arquivos | Evidência |
|---|---|---|
| Sincronizar templates após atualizar o módulo (pergunta ao GM + botão no Controle GM) | `scripts/template-sync-service.mjs`, `scripts/main.mjs`, `scripts/settings.mjs`, `scripts/gm-tools.mjs` | QA: diálogo apareceu sozinho; 5 templates atualizados (incluindo cópias antigas por nome); fichas recarregadas; plano vazio depois; setting `0.14.0` |
| Erro `item.arma_habilidade_resumo` | `src/templates/actors/{slayer,npc}-template.json` | QA: 0 erros (antes 12 por render) |
| Render extra do snapshot de Vida e Morte | `scripts/life-death-service.mjs` (`render: false`) | core v14 `foundry.mjs:36596`; teste unitário. No QA desta rodada o snapshot não foi gravado, então a queda de render não é atribuível só a isso |
| Linha ACÚMULOS (Slayer e NPC) | `scripts/passive-summary-service.mjs`, templates | QA: Slayer "Fogo Fátuo 3/60 · Adagas…"; NPC "Véus 4/9" em 1 gravação |
| Bônus Fixos acima da Respiração | templates | QA: captura da aba Combate |
| Estado vazio Vanilla | templates | testes de template; **visual não conferido no QA** |
| Criar Arma Especial duplicava o template | `scripts/item-creator.mjs` | QA: reaproveitou a cópia; 4 → 4 |

Medidas no QA depois: re-render do Slayer 368 → 197 ms; dano editado 2 gravações + 2 renders → 1 + 1.

Gate: `node --test` 3.480/3.480. Templates Slayer `2720657615`, NPC `1795234800006`.

## Ainda aberto

- Woldo e Adagas apagadas do QA slayer às 15:55:02/04 pelo caminho de exclusão de item (log do servidor); nenhuma chamada do agente nesse minuto — confirmar com o operador.
- Template "NA Arma Especial - Slayer" com id inválido (`NASpecialWeaponTpl00001`, 23 caracteres): o reaproveitamento por nome contorna a duplicação; trocar o id exige migrar as armas existentes.
- QA: 4 cópias do template especial no mundo de QA (uma criada pelo diagnóstico); limpar só com aval.
- Não testados: bônus Vanilla em rolagem real (Visão +1 Acerto, Metal Preto +1 Bloqueio), Perícias do NPC, Criar Item ponta a ponta, reset de ações gasto pelo módulo + botão do tracker, Combat Tracker Dock, ficha de Oni (Acerto/Dano), Água/Sonhos/Eclipse sem contador no código.
- Redesenho dos mockups: fase própria.

## Rodada 2 (pedidos do operador, mesmo dia)

- Ações e Status redesenhado (pares comando → estado), Bônus Fixos com título e aberto, avisos Vanilla retirados, Fôlego com gate `not ref('na_regras_respiracao', 0)`, contadores da Respiração do personagem sempre visíveis. Templates Slayer `2720657617`, NPC `1795234800007`. Gate 3.482/3.482.
- QA: Vento com 6 Cicatrizes → "Cicatrizes 6 · Corrente do Vendaval 0 (Controlado)"; com Respirações e Ações em Vanilla, Fôlego e Manobras somem.
- Armas do sistema (Compêndio Armas dos Caçadores): Katana e Kusarigama no QA slayer, Katana no QA npc. Diálogo de Modo de uso salvou `nitoryu`. ROLAR da Katana → dano 5 + 5 (Cortante/Perfurante) no chat, 0 erros. Acerto, Kusarigama e Katana do NPC não rolados.
- Woldo/Adagas: excluídas pelo operador (confirmado).
- Regra da Mesa é global (setting de mundo propagado a todas as fichas); a ficha só guarda a escolha do personagem.

## Rodada 3 — chat e Ryōtō

- Chat de dano: uma linha por entrada (tipos + valor), sem divisão por tipo, caixas do core escondidas por `.chat-message:has(.na-damage-chat)`; QA: Katana Nitoryu → 2 linhas "Cortante · Perfurante: 5", 0 caixas visíveis, 2 rolls na mensagem.
- Chat de Forma: descrição recolhida em `<details>` "Descrição da Forma" — **não exercitado no QA** (exige usar uma Forma).
- Reset de ações (erro 3): volta completa com o jogo pausado → ATAQUE 0/1 → 1/1 no turno seguinte do Slayer. Tentativa anterior "sem reset" era falha do script de teste (não houve troca de turno).
- Ryōtō: regra já estava em `PROPRIEDADES DAS ARMAS.md` (linhas 105–107); acrescentada a justificativa confirmada pelo autor. Código segue desde a 0.13.6.
- Gate: `node --test` 3.482/3.482.

## Rodada 4 — combate simulado com alvo

Combate ativo, turno do QA slayer, alvo marcado no token do QA npc.

- Katana (Nitoryu) com `startWithHit`: Acerto 1/2 `1d20+3=8` (confirmado acertou), Acerto 2/2 `1d20-2=1` (errou) → diálogo de dano com 1 entrada (5) → "Autorizar dano no inimigo" → QA npc PDV 14 → 9, Dano Tomado 5; chat "Katana · Ação de Ataque Cortante · Perfurante: 5 · Total 5 · Aplicado em: QA npc (5)", sem caixas.
- Forma Chamas 5º Tigre Ardente nível 1: sincronizar arma → Acerto com vantagem `2d20kh1+3+2=21` → dano 26 (Katana 5 + Respiração 18 + Fogo Fátuo 3) autorizado → QA npc 9 → −17, "Brasas Ardentes 6 (Queimando)" no resumo do NPC; Slayer PDR 14 → 11, Fogo Fátuo 3 → 11/60. Cartão da Forma curto (sem descrição).
- A conferir com o operador/KIRITO: Tigre Ardente diz "uma única rolagem de acerto", mas com a Katana em Nitoryu a sequência ofereceu 2 tentativas; o cartão da Forma sai depois do dano no chat; `nome`/`jp` da Forma aparecem como "Go no Kata Enko · Tigre Ardente".

## Decisão do operador (2026-11-22)

- Forma com "uma única rolagem de acerto" usada com arma em Nitoryu: **o Nitoryu vale** (2 tentativas de Acerto). Comportamento atual mantido; sem mudança de código.

## Rodada 5 — cartão da Forma junto do dano

- Pedido: "sai junto caso seja uma forma". `executeBreathForm` guarda o id da última mensagem ao começar; `postBreathChat` procura a mensagem de dano do mesmo ator depois dela (`pickDamageMessageForForm`) e põe o cartão no topo dela. Sem dano, o cartão sai sozinho. Marcador por id, não por relógio (clientes remotos).
- QA com alvo: Tigre Ardente → uma mensagem "Go no Kata Enko · Tigre Ardente / Chamas · ataque · Nível 1 · −3 PDR" + Katana 5 + Respiração 19 + Fogo Fátuo 4 = Total 28, Aplicado em: QA npc (28); 0 cartões soltos. Gate 3.485/3.485.
