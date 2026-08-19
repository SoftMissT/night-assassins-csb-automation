# Changelog

## 0.9.8 — 2026-08-19

- Corrige as Formas de Respiração existentes nos Caçadores: itens legados sem `inventario_categoria` quebravam o filtro do container `skills_slayer_respiracoes` (`equalText(item.inventario_categoria, 'respiracao')`), impedindo a seção e o botão **USAR** de renderizar.
- Adiciona a migração idempotente `repairBreathingItems`, que sincroniza os itens legados com o Compendium canônico `night-assassins-respiracoes` (por `forma_id` ou nome normalizado) e roda automaticamente no GM ready, junto ao reparo de armas.
- Adiciona a macro **Night Assassins — Corrigir Respirações dos Caçadores** (`NABreathRepair01`), que executa a migração sob demanda e reporta no chat.
- Cobre a migração com testes unitários: mapa canônico, patch completo, idempotência, formas sem correspondência e contabilização de Actors.
- Validação: `node --test` com a suíte completa aprovada (273/273).

## 0.9.7 — 2026-08-19

- Adiciona a macro **Night Assassins — Corrigir Armas dos Caçadores**, que executa sob demanda a migração idempotente `repairSlayerWeaponItems` em todos os Caçadores do mundo e reporta no chat quantos itens foram atualizados.
- Cobre a migração com testes unitários: geração do patch de resumos, idempotência, itens não-armas e contabilização de Actors.
- Validação: `node --test` com a suíte completa aprovada.

## 0.9.6 — 2026-08-16

- Corrige a perda de perfis de ataque de armas quando o CSB serializa Arrays como JSON textual ou descarta campos não declarados no template.
- Adiciona migração idempotente para Items de armas já existentes nos Actors, reconstruindo perfil, fórmula, tipo de dano, atributos e mecânicas.
- Faz o acerto reconhecer as armas portadas e aplicar os atributos finais do Actor Slayer.
- Exibe na ficha o perfil/dano, tipo de dano, alcance e propriedades das armas.
- Adiciona botão USAR para Formas de Respiração, vinculando o Item e o Actor ao motor `useBreathForm`.
- Normaliza rótulos como `concussivo` para a chave canônica `concussao`.
- Validação: 260 testes aprovados, 0 falhas; sintaxe e diff check aprovados.
- O arquivo `06 - Guia de Arcos Longos.md` não faz parte deste release.

## 0.9.5 — 2026-08-16

- Corrige a leitura de perfis de armas Slayer em Items antigos ou serializados como JSON pelo CSB.
- Reconstrói o perfil Ataque Base a partir dos campos legados de dano quando `arma_perfis_ataque` não está disponível como Array.
- Alinha a listagem da ficha Slayer, o normalizador de técnicas e o montador de ataques ao mesmo contrato de perfis.
- Adiciona suporte a proficiência, atributos por propriedade, perfis Nitoryu/Ryōtō, munição e recarga no fluxo de armas.
- Validação: 257 testes aprovados, 0 falhas; 43 Items de armas reconstruídos.

## 0.9.4 — 2026-08-16

- Corrige vulnerabilidade de XSS (Cross-Site Scripting) no módulo de Vida e Morte dos Slayers.
- Sanitiza o nome do Actor e o motivo de morte/reviver com escape de entidades HTML antes da publicação no chat via `ChatMessage.create`.

## 0.9.3 — 2026-08-14

- Unifica os templates Slayer e Oni no Compêndio `Night Assassins — Templates de Ficha`.
- Adiciona o template narrativo NPC com foto do Actor e informações básicas.
- Preserva os IDs internos de Slayer e Oni; UUIDs completos antigos mudam por causa do novo nome do pack.

## 0.9.2 — 2026-08-14

- Integra Onis ao Montador de Ataque sem reutilizar as chaves de recurso do Slayer.
- Adiciona Ataque Marcial, Garras e Mordida com progressão natural dos níveis 1–20 e atributos finais `*_display`.
- Persiste custos Oni em `pdk_oni_gasto_valor` e ações em `acoes_oni_*`.
- Mostra PDR para Slayer e PDK para Oni no diálogo de dano.
- Impede Marca, Respirações e passivas exclusivas do Slayer de vazarem para atacantes Oni.
- Rejeita alvos sem identidade Slayer/Oni em vez de tratá-los automaticamente como Oni.

### Validação

- `node --test`: 246 testes aprovados, 0 falhas.
- Testes focados do builder, dano e ações Oni: 14 aprovados, 0 falhas.

## 0.9.1 — 2026-08-14

- Conecta o botão geral de dano aos Items de arma e Formas de Respiração portados pelo Slayer.
- Monta parcelas independentes para arma e Respiração usando Rank, nível de Respiração e atributos finais `*_display`.
- Transporta tipo de ação, tipos de dano e custo de PDR para o diálogo de dano existente.
- Mantém o dano manual como fallback e não executa Formas passivas.
- Evita cobrar Ação de Ataque separada quando uma Forma ativa já define a ação da técnica.

### Validação

- `node --test`: 243 testes aprovados, 0 falhas.
- GitNexus: impacto final classificado como MEDIUM em quatro fluxos existentes de `rollWeaponItem`.

## 0.9.0 — 2026-08-14

- Introduz o contrato canônico `TechniqueDefinition` para armas, Respirações, Kekkijutsu e equipamentos.
- Adiciona contexto de combate e transações que consolidam custos e efeitos em uma escrita por Actor.
- Estrutura a progressão Slayer 1–14, as 12 Origens, as cinco Classes e o Mestre de Batalha no nível 11.
- Estrutura a progressão Oni 1–20, ranks, PDV/PDK, regeneração, ataques naturais e ações lendárias.
- Integra crítico por arma e as passivas iniciais de Pedra, Metal, Neve e Névoa aos serviços de acerto/dano.
- Corrige o fluxo de Acerto sequencial para cancelar sem criar uma rolagem adicional.
- Mantém dano em múltiplas parcelas e inclui `catalogs/` no pacote publicado.

### Validação

- `node --test`: 241 testes aprovados, 0 falhas.
- GitNexus reindexado com PDG: 8.578 nós, 19.044 relações, 86 clusters e 300 fluxos.
- Alterações centrais de acerto/dano/Respiração classificadas como CRITICAL pelo conjunto de fluxos afetados e cobertas por testes focados e regressivos.

## 0.8.4 — 2026-08-14

- Adiciona o gerenciador funcional de Interlúdio para Cabaças e Copo de Chá Medicinal.
- Persiste sucessos, zera sequências de Cabaça em falha e desbloqueia benefícios no terceiro sucesso.
- Integra Cabaça Pequena ao PDV máximo e Concentração Total Constante a VIT e movimento.
- Remove da aba os treinamentos e estados avançados que ainda não possuem motor completo, evitando controles decorativos.
- Atualiza o Compêndio com a macro `Night Assassins — Gerenciar Interlúdio`.

### Validação

- `node --test`: 208 testes aprovados, 0 falhas.
- GitNexus reindexado com PDG: 7.552 nós, 16.951 relações, 70 clusters e 291 fluxos.

## 0.8.3 — 2026-08-14

- Converte Markdown dos catálogos de Respirações e armas em HTML enriquecível pelo Foundry VTT durante o build.
- Impede que a mesma arma apareça novamente em Equipamentos e Itens usando filtros exclusivos por template CSB.
- Marca formas passivas explicitamente e oculta sua aba de ativação manual; `Esquentar` permanece automática, sem custo de ação ou PDR.
- Adiciona testes de conversão, isolamento dos contêineres e publicação de passivas.

## 0.8.2 — 2026-08-14

- Corrige a resolução do Item de arma no CSB: a ficha passa `linkedEntity` ao motor em vez de confundir o Actor com a arma.
- Faz o botão da linha do Inventário e o botão do Item aberto usarem o mesmo `rollWeaponItem` especializado.
- Impede que um Actor recebido como `itemUuid` produza falsamente “Esta arma não possui perfil de ataque configurado”.
- Padroniza “Rolar Dano da Arma” com o wrapper Orbitron da ficha.

## 0.8.1 — 2026-08-14

- Implementa Vida e Morte Slayer: À Beira da Morte, Marcas, Queda Repetida, Teste de Morte, Determinação Final, cura em 0 PDV e estabilização por INT/SAB.
- Bloqueia ataques, defesas, dano, Respiração, movimento e Reação enquanto o Slayer está À Beira da Morte ou morto.
- Remove da ficha o botão incompleto de execução das Formas e o painel técnico de Respiração no Combate; permanece apenas o espaço de Items em Skills.
- Separa Status e Resistências em uma aba própria de Condições.
- Normaliza todos os Labels roláveis para o wrapper Orbitron.

## [0.8.0] - 2026-08-14

- Implementa a Respiração das Chamas como motor mecânico próprio, preservando os nove Items do Compêndio.
- Automatiza Fogo Fátuo na arma, Brasas Ardentes por alvo, patamares de Acerto/dano, dano próprio e limpeza no fim do combate.
- Integra Fogo Desconhecido, Céu em Chamas, Ondulação, Tigre Ardente, Tormenta, Cauterizar, Ignição e Rengoku com ação, PDR, Acerto, dano, cura, status e turnos.
- Encaminha Brasas e seus limiares pelo relay autorizado do GM para funcionar em fichas de Oni e Slayer sem ownership do jogador.
- Adiciona estado visível e armazenamento CSB da Respiração das Chamas à ficha Slayer.
- Corrige as ações e os níveis indisponíveis dos Items de Chamas durante a geração do Compêndio.

### Validação

- `node --test`: 194 testes aprovados, 0 falhas.
- Teste de integração cobre Brasas no Oni pelo mesmo caminho autorizado do dano.
- GitNexus identificou alto alcance nos fluxos de combate; todos os testes de acerto, dano, relay, status, armas e templates permaneceram aprovados.

## [0.7.6] - 2026-08-13

- Conecta 14 artes verticais WebP às respectivas armas especiais pelo campo `arma_imagem_vertical`.
- Usa os ícones próprios de Cérbero, Rebellion, Red Queen e Yamato no diretório e no Compêndio de Items.
- Mantém o ícone genérico apenas nas armas que ainda não possuem um ícone próprio.
- Substitui as artes PNG anteriores pelas versões WebP organizadas em `assets/weapons/vertical/`.

### Validação

- Catálogo reconstruído com 43 Items de armas Slayer.
- Caminhos locais validados para 14 artes verticais e quatro ícones.
- `node --test`: 181 testes aprovados, 0 falhas.

## [0.7.5] - 2026-08-13

- Move as cinco fontes JSON de template/importação da raiz para `src/imports/` e `src/templates/`.
- Renomeia os exports do Foundry para nomes estáveis e legíveis, preservando os IDs internos dos documentos.
- Atualiza builders, migrações e testes para os novos caminhos.
- Adiciona `arma_imagem_vertical` ao Item de arma e cria `assets/weapons/vertical/` para artes 9:16.
- Mantém `src/` fora do `module.zip` e inclui `assets/weapons/` no pacote distribuído.

### Validação

- Builders: 2 templates de Actor, 43 armas e 300 Formas de Respiração preparados.
- `node --test`: 180 testes aprovados, 0 falhas.

## [0.7.4] - 2026-08-13

- Substitui o template de Respiração reutilizado indevidamente por um `_equippableItemTemplate` exclusivo de armas Slayer.
- Preenche no Item nome, tipo, crítico, alcance, propriedades, requisito, perfis, atributos, tipos de dano e fórmulas evolutivas D–SS.
- Adiciona `rollWeaponItem`, que identifica o Actor portador e calcula o dano com `for_display`, `dex_display`, `fdv_display` e o Rank atual.
- Corrige `FOR ou DEX` para usar o maior valor aplicável sem descartar atributos adicionais como FDV.

### Validação

- `node --test`: 180 testes aprovados, 0 falhas.
- Foundry CLI 3.0.4: template e 43 Items empacotados com sucesso.

## [0.7.3] - 2026-08-13

- Aplica os onze ícones locais disponíveis às 87 Formas correspondentes no Compêndio de Respirações.
- Expande o Compêndio de armas de 26 básicas para 43 Items, incluindo as 17 armas especiais descritas na base de regras.
- Preserva nas armas especiais entidade, demônio, despertar, dano por Rank, técnicas e texto mecânico integral.
- Adiciona perfis de ataque selecionáveis e cálculo explícito de metade de atributo, corrigindo armas com distância, forma ou empunhadura variável.
- Corrige o botão de arma da ficha Slayer para passar arrays sem aninhamento acidental.

### Validação

- `node --test`: 172 testes aprovados, 0 falhas.

## [0.7.2] - 2026-08-13

- Corrige o teste do catálogo de armas para executar seu próprio builder em ambientes limpos, removendo a dependência acidental de resíduos locais em `build/`.

## [0.7.1] - 2026-08-13

- Torna a geração dos Compêndios de Respirações e Armas reproduzível no GitHub Actions por meio de catálogos mecânicos compilados, sem distribuir os documentos editoriais da base de conhecimento.
- Corrige o release que dependia incorretamente da pasta irmã local `MACRO-NA-FOUNDRY`.

## [0.7.0] - 2026-08-13

- O Compêndio de Respirações agora possui 44 pastas, 300 técnicas extraídas das 36 fontes oficiais disponíveis e preserva as 11 Formas mecânicas da Água.
- Técnicas fora da Água podem consumir ação/PDR e rolar a fórmula catalogada pelo lançador universal.
- Adicionado o Compêndio `Night Assassin's Armas dos Caçadores` com 26 armas oficiais como Items CSB roláveis.
- Oito Respirações sem arquivo individual no vault são distribuídas como pastas vazias, sem inventar regras.

## [Unreleased]

## [0.6.2] - 2026-08-13

- Recria `module.zip` do zero em cada release para impedir resíduos de pacotes antigos.
- Substitui a distribuição inválida `v0.6.1`, cujo ZIP remoto não continha `module.json` nem todos os scripts atuais.

### Validação

- O pacote só é publicado se `module.json` for a primeira entrada do ZIP.

## [0.6.1] - 2026-08-13

- Corrige VIT e FOR da ficha ONI removendo dependências de bônus exclusivos do Slayer das sete fórmulas finais.
- Introduz identificação canônica de Actor com precedência ONI, mesmo em fichas antigas que ainda carreguem keys Slayer herdadas.
- Corrige o despacho de dano para atualizar `pdv_oni_dano_tomado` e `pdv_oni_dano_ferida` no alvo correto.
- Faz o Controle GM classificar corretamente todos os combatentes e habilita minimizar/restaurar sem fechar o painel.
- Moderniza as mensagens das Formas de Respiração para `core.messageMode` no Foundry v14.

### Validação

- `node --test`: 166 testes aprovados, 0 falhas.
- Templates Slayer/ONI e os 12 documentos da Respiração da Água regenerados.

## [0.6.0] - 2026-08-12

- Reestrutura a fundação da ficha ONI com níveis 0–20, ranks, origens ONI e progressão cumulativa de PDV/PDK.
- Salva separadamente os ganhos rolados de PDV dos níveis 2–12 para impedir novas rolagens ao renderizar a ficha.
- Corrige as barras de recursos do Slayer e do ONI para consumirem Hidden Attributes estritamente numéricos, sem Labels Orbitron/HTML.
- Separa máximo e atual de PDV/PDR/PDK, com limites inferiores e superiores para dano, Ferida, cura, extras e gasto.
- Regenera o template Slayer de forma idempotente, preservando nove abas, Inventário, Skills, Respiração, movimento e Fôlego.
- Corrige múltiplas parcelas no dano, usa `core.messageMode` no Foundry v14 e informa quando o dano foi aplicado ao alvo.
- Faz o nível de Respiração aceitar somente 1–4, evitando que o nível do personagem seja usado por engano.

### Validação

- `node --test`: 161 testes aprovados, 0 falhas.
- Templates de Actor e pacote global CSB regenerados.

## [0.5.20] - 2026-08-08

- Liga os botões de usar Forma de Respiração à macro `NARespFormUse001` (lançador universal) pelo UUID estável do Compendium, substituindo a chamada direta à API nos quatro pontos: template do item (aba "Usar"), container de Respirações do template Slayer, pacote de importação CSB e o migrador que gera esses botões.
- O botão do item vazio do Actor captura `itemUuid: linkedEntity.uuid` + `actorUuid: entity.uuid`; o botão da ficha do Item captura `itemUuid: entity.uuid` + `actorUuid: entity.parent?.uuid`, preservando a resolução defensiva da macro.

### Validação

- `node --test`: 157 testes aprovados, 0 falhas.

## [0.5.19] - 2026-08-08

- Adiciona tipo de dano às Formas de Respiração: as Formas da Água passam a carregar `cortante` (padrão) por `tipo_dano_base` e `nvlN_tipos_dano` em cada item, resolvendo a resistência cega que mantinha o dano da Respiração como "Sem tipo".
- O motor agora persiste `types` no `pendingDamage` de toda Forma que rola dano (1ª, 2ª, 3ª, 5ª, 6ª, 8ª e 10ª), via `resolveWaterDamageTypes` no catálogo, com ajuste individual por nível quando necessário.
- O serviço de dano passa a propagar o tipo da Respiração para o relé de dano e o diálogo de autorização do GM, em vez de `types: []`.
- Adiciona macro canônica `na-resp-usar-forma` no Compendium: lançador universal que resolve o item da técnica com fallback por `forma_id`, nome do item e seletor de Formas quando há mais de uma.
- Reforça a suíte de testes com a regressão dos tipos de dano nas Formas (piso, níveis) e sobre os props gerados no export do Compendium.

### Validação

- `node --test`: 157 testes aprovados, 0 falhas.

## [0.5.18] - 2026-08-08

- Cria o Compendium de Arte `Night Assassin's Arte`, um pack de Items CSB que cataloga os ícones das Respirações disponíveis em `assets/icons` por caminho `modules/<id>/assets/icons/*.webp`.
- Move os ícones para `assets/icons/` e inclui a pasta no `module.zip` do release, garantindo que as imagens cheguem ao Foundry.
- Usa o ícone `resp_agua.webp` como arte das onze Formas da Respiração da Água no Compêndio de Items.
- Adiciona `tools/build-asset-sources.mjs` para gerar o Compendium de Arte na pipeline de release.

## [0.5.17] - 2026-08-08

- Torna cada Forma de Respiração rolável diretamente no Item Container da aba Skills, usando o Item vinculado e o Actor dono da ficha.
- Adota `respiracao_da_agua.json` como fonte editorial das onze Formas da Água no Compêndio CSB.
- Aumenta a legibilidade do Controle GM e remove os retratos dos combatentes.

## [0.5.16] - 2026-08-08

- Adiciona o template CSB equipável de Forma de Respiração e as onze Formas oficiais da Respiração da Água como Items reais.
- Publica o Compendium `Night Assassin's Respirações` e inclui sua construção automática no release.
- Adiciona à aba Skills um Item Container dedicado às Formas de Respiração, filtrado pelo template correto.
- Implementa níveis 1–4, requisitos, custos, ações, dano, estados, recargas, cargas, usos diários e encadeamentos das onze Formas.
- Integra os efeitos da Respiração da Água às rolagens de Acerto e Dano e ao avanço de turnos do combate.
- Faz `nvl_respiracao_num` controlar os níveis de Forma disponíveis.
- Torna a reorganização da ficha idempotente e restaura o botão e o estado textual da Marca do Caçador em migrações repetidas.

### Validação

- `node --test`: 155 testes aprovados, 0 falhas.
- O gerador produz 1 template e 11 Items, todos com IDs Foundry estáveis de 16 caracteres.

## [0.5.15] - 2026-08-08

- Reorganiza a ficha Slayer em nove abas: Perfil/Bio, Perícias, Combate, Skills, Inventário, Interlúdios, Notas/Diário, Configurações e Dados.
- Adiciona Item Containers separados para Armas, Equipamentos e Itens, além de Dinheiro e Moedas de Honra.
- Adiciona áreas nativas de texto rico para Biografia, Interlúdios e Diário, e preserva a aba Dados como área técnica.
- Agrupa Respiração, Habilidade Especial, Classe, Marca, Mundo Transparente, Estado Altruísta, Lâmina Carmesim e Habilidade de Origem na aba Skills.
- Adiciona o estado estrutural do Teste de Vida e Morte à aba Perícias sem simular uma mecânica ainda não implementada.
- Adiciona o estado persistente e o painel organizado das técnicas de Respiração ao template Slayer.
- Integra os sete bônus temporários de Respiração aos atributos finais `*_display`.
- Faz o Controle GM listar exclusivamente todos os Combatants da luta ativa e atualizar entradas e saídas em tempo real.
- Corrige o botão de adicionar múltiplas entradas no diálogo de dano sem alterar seu layout.
- Impede que resultados incompletos do diálogo causem `entradas.length` em valor indefinido.
- Torna o cancelamento da configuração de Acerto explícito e impede qualquer rolagem após cancelar.
- Exibe `marca_despertada` como `ATIVADA` ou `NÃO DESPERTADA` no template Slayer.
- Restaura aliases com travessão das Habilidades Especiais e a identificação restrita da macro de Controle GM.

## 0.5.14 - 2026-08-08

### Corrigido

- O teste de distribuição não fixa mais uma versão antiga do módulo.
- A validação agora exige SemVer e confirma que o download aponta para o mesmo tag declarado no manifesto.

## 0.5.13 - 2026-08-08

### Corrigido

- A macro de dano deixou de exibir dados em duplicidade no Dice So Nice.
- A chamada manual a `game.dice3d.showForRoll` foi removida; o `ChatMessage.create` com `rolls` já aciona as animações automaticamente no Foundry v14.

## 0.5.12 - 2026-08-07

- Adota o layout reorganizado pelo operador como base do template Slayer distribuído.
- Cataloga todos os tipos oficiais de ação, mantendo ações de chefe/GM fora dos contadores do Slayer.
- Automatiza recuperação de Fôlego no início do combate, início do turno e críticos positivos de Acerto/Defesa.
- Move Economia de Ações para a aba Combate e padroniza novos títulos visuais em Orbitron 16px.
- Torna o migrador compatível com componentes CSB organizados em painéis ou tabelas.

## [0.5.11] - 2026-08-07

### Adicionado

- Botão `DESCANSO` no template Slayer e macro canônica `Night Assassins — Gerenciar Descanso` no Compendium.
- Descanso de Campo, Descanso Completo e Recuperação Profunda com rebaixamento automático quando o repouso é interrompido.
- Confirmação obrigatória do GM e registro `descanso_slayer_dados` para aplicar a regra antiabuso.
- Atualização atômica de PDV, PDR, Fôlego, Exaustão e status autorizados.
- Recuperação Profunda com testes opcionais de Fratura e Corrupção e devolução explícita de PDV máximo perdido por Ferida.
- Integração da Respiração da Recuperação: Sono Completo pode remover Fadiga Corporal, Espiritual e Mental; `Ofegante` continua exigindo sua remoção própria.

### Corrigido

- Descanso de Campo usa literalmente `1d4 × VIT`, em vez de rolar vários d4.
- PDR restaurado considera `metal_slayer_pdr_bonus` e grava a key canônica `pdr_slayer_gasto_valor`.

### Validação

- Testes cobrem interrupção, recursos, Fôlego, Exaustão, Fadigas, tratamentos profundos, macro, UUID do Compendium e export do template.

## [0.5.10] - 2026-08-07

### Adicionado

- Fôlego de Combate do Slayer com máximo `2 + FDV final` e campo persistente `folego_slayer_atual` no template.
- O GM preenche o Fôlego de todos os Slayers ao iniciar o combate e recupera 1 no início de cada turno, limitado ao máximo.
- SPEC de Estado Altruísta e Mundo Transparente registra requisitos, ações, custos, duração, alvos por UUID e integrações com acerto, defesa e dano.

### Corrigido

- O ganho único de `2d6` PDV do Mestre de Batalha foi fixado pela regra canônica da mesa no nível 11, Rank S.

### Validação

- Testes cobrem fórmula do máximo, preenchimento no combate, recuperação por turno, export do Actor e pacote global CSB.

## [0.5.9] - 2026-08-07

### Adicionado

- Hidden Attribute `deslocamento_slayer` com a fórmula `${7+dex_display}$`.
- A aba Combate mostra `DESLOCAMENTO` e o valor em metros diretamente na ficha.
- O migrador do template passou a ser idempotente para as linhas de Status e aceita o template namespaced já migrado.
- SPECs iniciais de Descanso, Vida e Morte e Classes registram os contratos antes da implementação dos serviços.

### Validação

- Testes verificam DEX 4 = 11m, modificadores de Status e a presença do cálculo no Actor e no pacote global CSB.

## [0.5.8] - 2026-08-07

### Corrigido

- Sangramento, Hemorragia e Envenenamento agora exigem fórmula de dano e quantidade de turnos definidas pela fonte antes de serem salvos.
- O gerenciador mostra cabeçalhos explícitos para `Dano/turno`, `Turnos`, `Pilhas`, `Teste`, `CD` e `Fonte`, com largura suficiente para os campos mecânicos.
- Dano contínuo é aplicado no início do turno pelo GM autoritativo, reduz a duração uma vez por turno e expira exatamente ao chegar a zero.
- O chat informa o dano causado e quantos turnos permanecem.
- Estados antigos incompletos não causam dano nem consomem duração; o GM recebe um aviso para completar a configuração.

### Validação

- Testes cobrem validação obrigatória, progressão `3 → 2` e proteção contra Sangramento incompleto.

## [0.5.7] - 2026-08-07

### Corrigido

- Exaustão continua acumulativa nos níveis 1–8; o marco 5 agora deriva o PDV atual das parcelas numéricas canônicas e não de Labels/CSS contaminados.
- A rolagem de Acerto recuperou a seleção do tipo de ação, mantém uma tentativa por vez e ganhou `Encerrar sequência`, que nunca dispara uma rolagem adicional.
- As mensagens de Acerto deixaram o card CSS estreito e voltaram a usar o cartão nativo da rolagem com um resumo textual simples.
- A macro de dano do Compendium agora é apenas a entrada do serviço canônico do módulo, eliminando duas implementações concorrentes.
- Dano volta a ser rolado em parcelas separadas, preservando tipo de ação, tipos de dano, crítico, Marca do Caçador, Dice So Nice e total final.
- Dano/Ferida em Slayer sem ownership é encaminhado automaticamente ao GM; gasto de PDR e economia de ações continuam atualizados no atacante.
- O Controle do GM identifica Slayers pelas keys `*_slayer_*`, usa o nome do Actor como fallback e lê os campos numéricos de PDV/PDR antes dos Labels.
- O painel mantém compatibilidade com as keys antigas do Oni, mas exibe o recurso correto como PDK.

### Validação

- Suíte local ampliada para 120 testes, incluindo cancelamento do Acerto, Exaustão 5 com Label contaminado, fallback de Slayer no painel e dano automático no Slayer.

## [0.5.6] - 2026-08-07

### Corrigido

- A Marca do Caçador voltou a ler os sete atributos finais `vit_display`, `dex_display`, `for_display`, `car_display`, `fdv_display`, `int_display` e `sab_display`.
- A leitura usa `_display` primeiro, `_config` como fallback e `atr_*_valor` somente para fichas antigas.
- O parser interno da Marca remove blocos de estilo antes de extrair números, evitando interpretar `css2`, pesos e tamanhos de fonte como atributos.
- Adicionados testes garantindo a escrita dos sete `*_marca_temp` e a integração de cada temporário com seu respectivo `_display` no template Slayer.

## [0.5.5] - 2026-08-07

### Corrigido

- Exaustão 5 agora calcula metade do Hidden Attribute numérico `pdv_slayer_conta_atual`.
- O motor não usa mais diretamente o Label HTML `pdv_slayer_atual_valor_display`, cujo CSS podia fazer `css2` ser interpretado como PDV 2 e causar apenas 1 de dano.
- O fallback remove blocos `<style>` antes de interpretar Labels antigos.
- Adicionado teste com o HTML real da ficha: PDV atual 14 resulta em 7 de dano de Exaustão.

## [0.5.4] - 2026-08-07

### Acerto sequencial

- A quantidade informada agora representa o máximo de tentativas da técnica, não um lote de dados simultâneo.
- Cada Acerto é rolado e publicado individualmente; a tentativa seguinte só ocorre depois de o jogador confirmar `Acertou` ou `Errou`.
- O jogador pode marcar `Encerrar a sequência depois deste resultado` para parar antes do limite sem perder a classificação da tentativa atual.
- Ao final, o chat informa tentativas realizadas, acertos, erros e interrupção antecipada.
- O fluxo aguarda a animação do Dice So Nice quando a API correspondente está disponível.

### Interface

- O diálogo de Acerto foi reorganizado com leitura mais clara do atributo, fórmula, limite de tentativas, CD, bônus e visibilidade.
- A confirmação de cada tentativa usa um modal compacto com resultado destacado e somente duas decisões principais.

## [0.5.3] - 2026-08-07

### Corrigido

- O gerenciador deixou de apresentar campos de dano para condições que não causam dano periódico.
- Somente Sangramento, Hemorragia, Envenenamento, Corroído e Em Chamas são processados como dano no início do turno.
- Sangramento, Hemorragia e Envenenamento não inventam mais fórmula ou três turnos: ambos vêm da técnica que aplicou o status.
- Corroído mantém fórmula da fonte e empilhamento de dados; Em Chamas permanece fixo em `1d4` e não empilha.
- Ferida continua sendo tipo de dano que reduz o PDV máximo, sem checkbox de status duplicado.

## [0.5.2] - 2026-08-07

### Arquitetura documentada

- Adicionada a especificação completa das 35 condições do Slayer, exigindo aplicação, fonte, pilhas, duração, efeito, salvaguarda, remoção e teste automatizado.
- Definido que os status serão `ActiveEffect` nativos embutidos no Actor e registrados em `CONFIG.statusEffects` no Foundry v14.
- Os campos `status_slayer_*` do CSB passam a ser tratados como espelho de compatibilidade durante a futura migração, não como a autoridade final do estado.
- Documentadas as integrações obrigatórias com Token, Combat, Combatant, alvos, socket do GM e `DialogV2`/`ApplicationV2`.

### Importante

- Esta versão publica a especificação de migração. O motor existente ainda não foi convertido para Active Effects nativos e não deve ser apresentado como concluído.

## [0.5.1] - 2026-08-07

### Corrigido

- O modal de Acerto agora aceita entre 1 e 20 rolagens independentes para técnicas com múltiplos ataques dentro da mesma ação.
- Cada resultado é publicado separadamente como `Acerto 1/N`, sem consumir ações adicionais.
- A macro canônica de Acerto deixou de carregar a implementação antiga em `Dialog` V1 e agora chama o serviço `rollHit` em DialogV2 do módulo.

### Regra preservada

- Quantidade de Acertos não é quantidade de Ações. Uma técnica pode realizar múltiplos Acertos consumindo uma única Ação de Ataque, Especial, Única ou Completa.

## [0.5.0] - 2026-08-07

### Adicionado

- Economia de ações do Slayer com Movimento, Ataque e Especial por turno; Única e Reação por rodada; e bônus temporários configuráveis.
- Ação Completa consome Movimento e Ataque na mesma atualização; Ação Única mantém teto absoluto de uma por rodada.
- Hooks autoritativos do GM restauram ações no Combat nativo sem depender da interface do Combat Tracker Dock.
- Macro **Gerenciar Ações** no Compendium, com saldo, deslocamento derivado de `7 + DEX`, consumo manual e restauração.
- O modal de dano agora consome uma vez cada tipo de ação usado e agrupa o estado da ação com o gasto de PDR na atualização do atacante.
- Template Slayer e pacote global do CSB incluem botão, resumo e armazenamento oculto da economia de ações.

### Limites conhecidos

- Ação Épica terá um fluxo próprio com autorização do GM, custo de Fôlego, Forma Final, Marca e Colapso; não foi reduzida a um contador comum.
- Ações Lendária, de Covil e de Vilão pertencem ao futuro motor Oni/chefes.
- Escalada e outros movimentos que descontam metros conforme decisão do Mestre ainda exigem a futura camada de posicionamento.

## [0.4.1] - 2026-08-07

### Corrigido

- Vantagem e demais status agora são reconhecidos quando o Custom System Builder devolve `status_slayer_dados` envolvido em HTML ou com entidades `&quot;`.
- Teste de integração confirma que Vantagem persistida percorre o serviço de rolagem e produz a fórmula final `2d20kh1`.

## [0.4.0] - 2026-08-07

### Adicionado

- Contrato v2 de status com fórmula de dano, duração, pilhas, fonte e salvaguarda por condição.
- Motor autoritativo do GM ligado ao Combat nativo: início e fim de turno são processados uma única vez e continuam compatíveis com Combat Tracker Dock.
- Sangramento, Hemorragia, Envenenamento, Corroído e Em Chamas agora causam dano real no início do turno; duração é decrementada e o estado expira.
- Confuso rola `1d4` no início do turno; Distraído é removido no início do turno; Silenciado, Suprimido e Hipotermia executam salvaguarda quando configurada.
- Vulnerável e Exaustão 6 dobram dano recebido de ataques. Dano de Ferida do Slayer atualiza `pdv_slayer_dano_ferida` separadamente.
- Exaustão 3 bloqueia movimento, nível 5 retira metade do PDV atual uma única vez, nível 7 retira o turno sem bloquear Defesa e nível 8 mata o Slayer e impede cura.
- Corrupção e Regeneração Suprimida reduzem cura pela metade; Corrupção drena FDV por pilha. A API de dano aceita o contexto demoníaco para aplicar o bônus recebido.
- Paralisia causa falha automática em FOR/DEX fora da Defesa. Dados antigos de status são migrados de forma compatível ao salvar.

### Limites conhecidos

- Regras dependentes de geometria ou contexto do ataque — adjacência, corpo a corpo, fonte exata do medo e deslocamento em metros — exigem metadados da futura camada de ataque/posicionamento; o motor não inventa essas informações.
- Ações de tratamento, água, calor, meditação, ajuda de aliado e Sono Completo permanecem remoções explícitas pelo gerenciador até o sistema de descanso ser implementado.

## [0.3.1] - 2026-08-07

### Adicionado

- Efeitos reais de Vantagem, Desvantagem, Cegueira Parcial, Surdez Parcial, Fratura, Desequilibrado, Desorientado, Flanqueado e Encorajado nas rolagens aplicáveis.
- Fadiga Mental aplica Desvantagem em Iniciativa e SAB; Fadiga Espiritual aplica `-2` em resistências de FDV e `+1 PDR` nas técnicas com custo.
- Fadiga Corporal impede crítico; Frenesi, Desorientado e Distraído impedem Reações.
- Exaustão aplica progressivamente `-1 Ataque/Dano`, `-2 DEX`, Desvantagem no Acerto e incapacidade nos níveis severos já alcançados.
- Atordoamento, Suprimido e Sonhando impedem testes, ataques e dano enquanto ativos.

### Pendente

- Dano contínuo, duração e remoção por turno, Vulnerável no dano recebido, Confuso e salvaguardas serão ligados ao motor de combate na próxima etapa.

## [0.3.0] - 2026-08-07

### Adicionado

- Catálogo canônico dos 35 status aplicáveis ao Slayer, separado de Resistências e Dano de Ferida.
- Macro **Gerenciar Status** no Compendium, com seleção múltipla e Exaustão acumulativa de 0 a 8.
- Persistência atômica em `status_slayer_dados`, `status_slayer_resumo` e `status_slayer_exaustao`.
- Botão e resumo de status no template Slayer canônico e no pacote global do CSB.

### Observação

- Esta versão entrega o contrato e o gerenciamento manual. Gatilhos distintos de início/fim de turno serão implementados no motor de combate por regra específica de cada status.

## [0.2.7] - 2026-08-07

### Corrigido

- A macro **Gerenciar Resistências** agora lê o `scope` enviado por `Macro.execute`, resolvendo corretamente o Actor da própria ficha.
- O botão retorna texto vazio ao CSB depois de abrir o modal, impedindo `Uncomputable token "object"` no processamento da Label.

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
