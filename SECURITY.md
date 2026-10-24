---
title: "Night Assassins CSB Automation — Política de Segurança"
created: "2026-10-24"
last_updated: "2026-10-24"
status: active
type: politica
---

# Política de Segurança

## Versões suportadas

Somente a versão mais recente publicada do módulo recebe correções de segurança. Versões anteriores devem ser atualizadas antes da triagem final.

## Como reportar

Não abra uma issue pública com detalhes de exploração, dados de mundo ou credenciais. Envie o relato por [GitHub Private Vulnerability Reporting](https://github.com/SoftMissT/night-assassins-csb-automation/security/advisories/new) com:

- versão do Foundry, Custom System Builder e módulo;
- módulos relevantes ativos;
- passos mínimos para reprodução;
- impacto observado e quem precisa estar autenticado;
- logs sanitizados e, se necessário, um mundo mínimo sem dados pessoais.

Não inclua tokens, cookies, chaves, backups de mundo ou dados privados de jogadores. Se o canal privado estiver indisponível, abra apenas uma issue pedindo um canal de contato, sem detalhes técnicos.

## Escopo de segurança

São tratados como segurança: bypass de ações exclusivas do GM; exposição ou alteração indevida de Actor/Item; execução arbitrária; HTML/script injetável; importações malformadas que alterem dados fora do alvo; vazamento de segredos; dependência de recurso remoto não documentado.

Os controles mínimos do projeto são:

- validar autoridade no serviço chamado, mesmo quando a UI já restringe o botão;
- escapar conteúdo de Actor, Item e usuário antes de inseri-lo em HTML;
- validar JSON/importações e preservar IDs, UUIDs, flags e ownership;
- manter ferramentas de diagnóstico e manutenção invisíveis para jogadores;
- evitar `eval`, `new Function`, código remoto e segredos em logs;
- não apagar macros, hotbars ou dados de mundo sem migração explícita e reversível.

## Riscos conhecidos

Estes pontos são anteriores à v0.11.86 e ficam registrados para não serem confundidos com garantia de controle:

- **Relay de cura sem aprovação explícita do GM** (`scripts/heal-relay.mjs`): o pedido de cura é aplicado no Actor alvo pelo cliente do GM sem diálogo de aprovação, e o `requesterId` vem da própria mensagem — o socket do Foundry não o autentica. Mitigação planejada: espelhar o fluxo de aprovação do relay de dano e/ou restringir o alvo ao Actor do requisitante. Até lá, use o relay de cura apenas em mesas com jogadores confiáveis.
- **Nomes de Actor em mensagens de status** (`scripts/status-engine.mjs`): o nome entra no chat sem escape neste arquivo; o saneamento do chat pelo core 14.367 ainda não foi validado em runtime. Correção prevista junto do gate visual.

## Processo

O mantenedor confirma o recebimento, reproduz em ambiente isolado, avalia impacto, corrige com teste de regressão e coordena a divulgação após uma versão corrigida. Prazos dependem da reprodutibilidade e da severidade; não há garantia pública de SLA.

## Fora do escopo

Falhas exclusivas de módulos terceiros, assets ausentes do mundo e problemas que exigem que o próprio administrador instale ou execute código não confiável são triados, mas podem ser encaminhados ao projeto responsável.
