# Changelog

## [0.2.6] - 2026-08-07

### Adicionado

- Macro **Gerenciar Resistências** no Compendium, com seleção múltipla dos 18 tipos oficiais de dano.
- Serviço persistente que salva as keys canônicas e um resumo legível das Resistências no Actor Slayer.
- Campos `status_slayer_resistencias_dados`, `status_slayer_resistencias_resumo` e `pdv_slayer_dano_ferida` no template canônico.

### Corrigido

- Dano comum do Slayer padronizado como `pdv_slayer_dano_tomado` em ficha, serviço e testes.
- PDV máximo e atual agora descontam corretamente `pdv_slayer_dano_ferida`.
- Botão de Resistências conectado à macro do Compendium por UUID estável.
- Tabela provisória `tes` renomeada para `combat_slayer_table`.

## [0.2.5] - 2026-08-07

- Os botões do template Slayer agora executam as macros pelos UUIDs estáveis do Compêndio do módulo e enviam o UUID do Actor separadamente.
- Adicionados os Compêndios de Actor `Night Assassin's Slayer` e `Night Assassin's Onis` ao manifesto e ao build de release.
- Corrigidos todos os botões de atributo e perícia do Slayer, incluindo Acerto, Bloqueio, Esquiva e Investigação.
- Corrigido o pacote de importação do template para o formato oficial do CSB (`isCustomSystemExport`, `actors[]`, `items[]`); o export anterior era um Actor bruto e podia abrir a ficha sem montar `header` e `body`.
- O template de Caçador foi promovido para `Slayer_template_atual` e passou a usar `nome_slayer`, `pdv_slayer_*` e `pdr_slayer_*`.
- Corrigidos o Label numérico de PDV atual, barras de PDV/PDR, espaços em keys de dropdown, `vit_display`, `atr_fdv_valor`, `dex_nvl7`, `car_nvl7` e a duplicidade de `metal_esquiva_bonus`.
- Snapshots automáticos padronizados nos níveis 1, 3 e 7.
- Painel do GM, serviço de dano, macro standalone e Compendium atualizados para o contrato Slayer.
- A migração do Oni para `pdv_oni_*` e `pdk_oni_*` permanece para a próxima fase.
- Redesenhado o Controle GM como monitor compacto persistente, com atualização automática enquanto permanece aberto.
- O painel agora mostra somente nome, PDV e PDR, em divisórias separadas para Caçadores e Inimigos/Onis.
- Adicionado fechamento explícito pelo botão interno e pelo botão do DialogV2; tipografia migrada para Orbitron.
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
