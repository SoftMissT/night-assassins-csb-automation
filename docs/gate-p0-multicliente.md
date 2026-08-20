---
title: "Gate P0 Multicliente — v0.9.13"
created: "2026-08-20"
last_updated: "2026-08-20"
status: active
type: spec
tags:
  - "#stage/active"
  - "#projeto/night-assassins-csb-automation"
  - "#gate/p0"
  - "#foundry/v14"
---

# Gate P0 Multicliente — v0.9.13

> [!important] Regra canônica
> Executar o gate completo e registrar falhas observáveis **antes** de escolher a próxima implementação (Active Effects, Classes ou custo final da Marca). Fonte: [[../CURRENT_CONTEXT|Contexto canônico]], [[../ROADMAP|Roadmap]] P0.

## Ambiente alvo

- **Foundry VTT:** v14 (estável)
- **Sistema:** Custom System Builder 6.0.2
- **Módulo:** night-assassins-csb-automation `v0.9.13` (commit `81b4925`)
- **Clientes:** 1 GM + 1 jogador conectados simultaneamente
- **Compendium unificado:** `night-assassins-templates-de-ficha` (Slayer, Oni, Oni Minion, NPC)

## Pré-requisitos do operador

- [ ] Foundry VTT v14 instalado e rodando localmente
- [ ] CSB 6.0.2 instalado como sistema ativo
- [ ] Módulo night-assassins atualizado para v0.9.13 (Setup → Add-on Modules → Update)
- [ ] Dois usuários configurados: 1 GM, 1 jogador
- [ ] Console do navegador aberto (F12) em ambos os clientes para capturar erros/latência
- [ ] Este documento aberto para preencher a tabela de falhas

---

## Fase 1 — Preparação e reimportação

### 1.1 Atualizar módulo e reimportar templates

- [ ] Confirmar em `module.json` que a versão instalada é `0.9.13`
- [ ] Abrir o Compendium `night-assassins-templates-de-ficha`
- [ ] Reimportar o template **Slayer** (`Slayer_template_atual`) para um Actor de teste novo
- [ ] Reimportar o template **Oni** (`oni_template`) para um Actor de teste novo
- [ ] Reimportar o template **Oni Minion** para um Actor de teste novo
- [ ] Reimportar o template **NPC** para um Actor de teste novo
- [ ] Abrir cada ficha importada e confirmar que renderiza sem erro no console

### 1.2 Verificar Actors legados

- [ ] Abrir um Actor Slayer pré-existente (ex.: Rebellion) e confirmar que o auto-repair de armas/respirações rodou no `ready` (ver chat ou `flags.<module>.breathRepaired`/`weaponRepaired`)
- [ ] Confirmar que o container `skills_slayer_respiracoes` renderiza as Formas com botão **USAR**
- [ ] Confirmar que o container de armas do Inventário renderiza os perfis sem aviso de "perfil ausente"

---

## Fase 2 — Mecânicas de combate (GM + jogador)

> Cada teste: marcar `[x]` se passou, ou registrar falha na tabela abaixo com ID `GATE-###`.

### 2.1 Acerto sequencial

- [ ] Jogador seleciona token Slayer, executa macro de Acerto com quantidade 3
- [ ] Confirmar: cada Acerto é publicado individualmente no chat
- [ ] Confirmar: a tentativa seguinte só ocorre após confirmar `Acertou`/`Errou`
- [ ] Confirmar: `Encerrar a sequência` para antes do limite sem rolagem adicional
- [ ] Confirmar: resumo final informa tentativas/acertos/erros/interrupção
- [ ] Confirmar: Dice So Nice anima cada Acerto (se instalado)

### 2.2 Dano dividido

- [ ] GM marca um alvo Oni com `T` (token alvo)
- [ ] Jogador executa macro de Dano com múltiplas parcelas (arma + Respiração)
- [ ] Confirmar: cada parcela mostra tipo + subtotal no chat
- [ ] Confirmar: Marca do Caçador aparece como Dano de Ferida separado
- [ ] Confirmar: total final é somado corretamente antes da resistência
- [ ] Confirmar: resistência do alvo reduz o total correto
- [ ] Confirmar: dano é persistido em `pdv_*_dano_tomado` no alvo correto

### 2.3 Ferida

- [ ] Aplicar dano de Ferida a um Slayer
- [ ] Confirmar: acumula em `pdv_slayer_dano_ferida` (não em `dano_tomado`)
- [ ] Confirmar: PDV máximo é reduzido pelo montante de Ferida
- [ ] Confirmar: cura normal não restaura PDV máximo perdido por Ferida

### 2.4 Resistências

- [ ] Abrir macro **Gerenciar Resistências** em um Slayer
- [ ] Confirmar: seleção múltipla dos 18 tipos oficiais funciona
- [ ] Confirmar: resumo legível é persistido em `status_slayer_resistencias_resumo`
- [ ] Confirmar: resistência escolhida reduz dano do tipo correspondente no teste de Dano

### 2.5 Recursos Slayer (PDR) e Oni (PDK)

- [ ] Confirmar: gasto de PDR é persistido em `pdr_slayer_gasto_valor` após Dano/Acerto
- [ ] Confirmar: painel GM exibe PDR para Slayer e PDK para Oni
- [ ] Confirmar: Ataques Naturais Oni consomem PDK corretamente
- [ ] Confirmar: atacante Oni não recebe Marca/Respiração/passivas exclusivas do Slayer

### 2.6 Autorização GM

- [ ] Jogador solicita dano em um Actor Oni sem ownership
- [ ] Confirmar: GM recebe modal `DialogV2` de autorização em até 60s
- [ ] Confirmar: GM pode autorizar ou recusar
- [ ] Confirmar: dano só é aplicado após autorização explícita
- [ ] Confirmar: recusa cancela o dano sem aplicar nada

---

## Fase 3 — Combat Tracker Dock

- [ ] Iniciar um combate nativo (GM)
- [ ] Confirmar: ações do Slayer são restauradas no início do combate (Movimento/Ataque/Especial)
- [ ] Confirmar: 1 Fôlego é recuperado no início de cada turno do Slayer (limitado ao máximo)
- [ ] Confirmar: ticks de Exaustão aplicam efeitos progressivos nos níveis corretos
- [ ] Confirmar: durações de status (Sangramento, Hemorragia, Envenenamento, etc.) decrementam 1/turno
- [ ] Confirmar: status expiram ao chegar a zero duração
- [ ] Confirmar: dano contínuo é aplicado no início do turno pelo GM autoritativo
- [ ] Confirmar: fim de turno processa uma única vez (sem duplicação com Combat Tracker Dock)

---

## Fase 4 — Painéis e interfaces

- [ ] **Controle GM:** abre, lista combatentes, exibe PDV/PDR (Slayer) e PDK (Oni), minimizar/restaurar funciona
- [ ] **Status:** macro **Gerenciar Status** abre, Exaustão acumula 0→8, persiste em `status_slayer_dados`
- [ ] **Descanso:** macro **Gerenciar Descanso** — Campo/Completo/Recuperação Profunda aplicam recursos corretamente
- [ ] **Economia de Ações:** consumo manual e restauração funcionam, Ação Completa desconta Movimento+Ataque
- [ ] **Estados Avançados:** botão **GERENCIAR ESTADOS AVANÇADOS** na tab Skills do Slayer abre o `DialogV2` (Ler Alvo, Foco, Ignição, Altruísta/Corte Sem Ego)
- [ ] **Skin Manhwa Dark:** fichas Slayer/Oni renderizam com a classe `.na-sheet` (fundo, tabs, painéis, Orbitron)

---

## Fase 5 — Latência das escritas autoritativas

> Medir com `performance.now()` no console ou timestamp dos logs do GM. Os 387 testes locais não substituem benchmark multicliente.

| Escrita | Esperado | Observado (GM) | Observado (Jogador) | Falha? |
|---------|----------|-----------------|---------------------|--------|
| Dano em Actor sem ownership (relay) | < 500ms | | | |
| Autorização GM → aplicar dano | < 1000ms | | | |
| Reset de ações no início do combate | < 200ms | | | |
| Recuperação de Fôlego no turno | < 200ms | | | |
| Dano contínuo no início do turno | < 300ms | | | |
| Persistência de status (save) | < 300ms | | | |

---

## Tabela de falhas observáveis

> Registrar cada falha reproduzível aqui. Após o gate, transformar cada falha em teste local antes de corrigir código.

| ID | Fase | Descrição | Console (GM/Jogador) | Reprodutível? | Status |
|----|------|-----------|----------------------|---------------|--------|
| — | — | *Nenhuma falha registrada ainda* | — | — | — |

### Formato de registro

```
| GATE-001 | 2.2 | Dano dividido não soma Marca do Caçador | `TypeError: ...` no GM | Sim (3/3) | Aberto |
```

---

## Conclusão do gate

- [ ] Todas as fases executadas
- [ ] Tabela de falhas preenchida
- [ ] Falhas reproduzíveis transformadas em testes locais
- [ ] Decisão registrada: qual próxima implementação (Active Effects / Classes / Custo final da Marca)

> [!note] Pós-gate
> Atualizar [[../CURRENT_CONTEXT|Contexto canônico]] com o resultado do gate e mover as pendências resolvidas para o histórico antes de iniciar a próxima implementação.

---

## Conexões

- [[../CURRENT_CONTEXT|Contexto canônico]]
- [[../ROADMAP|Roadmap]] — seção P0
- [[../tasks/todo|Todo da próxima sessão]]
- [[../erros|Console cru do Foundry]] — dumps não estruturados para referência
