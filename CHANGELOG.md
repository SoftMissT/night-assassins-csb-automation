# Changelog

## Não publicado

- Redesenhado o Controle GM como mesa tática persistente em formato de tabela, com atualização automática enquanto permanece aberto.
- Adicionadas colunas de identidade, classe, origem, progressão, respiração, sete atributos, PDV, PDR, PDR usado, esquiva e bloqueio.
- Corrigida a documentação: o módulo sincroniza macros, mas não edita nem reconecta automaticamente botões, Labels ou componentes do template CSB.
- Adicionados exemplos manuais usando nomes canônicos das macros e `actorUuid: entity.uuid`.
- Documentadas a instalação pelo manifesto e a instalação manual pelo `module.zip`.
- Registrado o estado das fichas: Caçador 2.0 e Oni Alpha 0.01.

## [0.2.4] - 2026-08-06

- Unificada a leitura de atributos das rolagens em `vit_display`, `dex_display`, `for_display`, `car_display`, `fdv_display`, `int_display` e `sab_display`.
- Corrigidos os serviços internos de teste, acerto e dano, que ainda consultavam `atr_*_valor`.
- Dano de Ferida agora é separado do dano comum e acumulado em `pdv_oni_dano_ferida`, destinado à redução permanente do PDV máximo.
- Dano comum continua acumulado exclusivamente em `pdv_oni_dano_tomado`.

## [0.2.3] - 2026-08-06

- Restaurado o cartão nativo de rolagem do Foundry, agora com uma rolagem separada por componente de dano.
- Exibidos tipo e subtotal de cada componente, incluindo a Marca do Caçador como Dano de Ferida.
- Corrigido o total enviado ao relay e acumulado em `pdv_oni_dano_tomado` quando existe alvo marcado.
- Adicionado aviso explícito quando a rolagem é feita sem alvo marcado com `T`.
- O modal de autorização do GM agora mostra a divisão do dano por componente.
- A sincronização automática passa a atualizar macros gerenciadas já existentes no mundo.

## [0.2.2] - 2026-08-06

- Reconstruído o Controle GM com CSS externo compatível com a sanitização do `DialogV2`.
- Adicionados cards responsivos, retratos, barras reais de PDV/PDR, porcentagens, busca e abertura direta da ficha.
- Corrigidos os nomes legíveis das Habilidades Especiais.
- Removidos do painel NPCs que possuem recursos, mas não possuem `nome_cacador`.

## [0.2.1] - 2026-08-06

- Corrigida a expectativa de instalação: o GM agora importa automaticamente as seis macros canônicas do Compendium para uma pasta mundial **Night Assassins**.
- A macro **Controle GM** é criada com acesso exclusivo do GM.
- As cinco macros de jogador são criadas como observáveis e executáveis pelos jogadores.
- A sincronização cria somente macros ausentes e não duplica documentos existentes.

## [0.2.0] - 2026-08-06

- Adicionada confirmação manual de crítico à macro de dano; o total final é dobrado antes da resistência.
- Ampliado o relay GM com autorização, resistência e os 18 tipos de dano oficiais.
- Adicionada a macro **Night Assassins — Controle GM** ao Compendium, com barras de PDV/PDR e resumo dos Caçadores.
- Mantido o Dice So Nice sobre a rolagem original; o chat destaca o total pós-crítico.

## [0.1.2] - 2026-08-06

- Declarado o canal socket do módulo no manifesto.
- Adicionado modal `DialogV2` para o GM autorizar ou recusar dano solicitado por jogadores.
- Ampliado o tempo de resposta para 60 segundos enquanto o GM analisa o pedido.
- O dano só é aplicado depois da autorização explícita do GM.

## [0.1.1] - 2026-08-06

- Adicionado Compendium com cinco macros canônicas de Night Assassins.
- Adicionadas configurações de mundo para automação da ficha e relay de dano.
- Adicionado pipeline reproduzível para gerar o pack ClassicLevel na Release.
- Corrigida a distribuição que anteriormente publicava apenas o motor do módulo.

## 0.1.0 — 2026-08-04

- Migração das macros `na-roll-mode.js`, `na-acerto-roll.js`, `na_roll_damage.js` e `na-attribute-level-snapshot.js` para módulo ESM.
- Automação da Marca do Destino integrada ao `updateActor`.
- Suporte a DialogV2, ApplicationV2 e persistência em `actor.system.props`.
- Testes unitários com `node:test`.
## Unreleased

- Adicionado relay de GM para jogadores acumularem dano em `system.props.pdv_oni_dano_tomado` sem ownership do Actor inimigo.
- O relay passa a iniciar automaticamente no hook `ready`; a macro standalone do GM não é mais necessária.
- `na_roll_damage.js` consome a API pública `applyOniDamage` do módulo.
