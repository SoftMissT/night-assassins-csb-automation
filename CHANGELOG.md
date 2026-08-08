# Changelog

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
