# Changelog

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
