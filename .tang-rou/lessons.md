# Lições do projeto

## 2026-10-28 - a ficha de Item lê o template do pack, não o body do Item

- **Erro:** migrei o `system.body` de 15 Formas e o erro da fórmula continuou; o pack ainda tinha a fórmula velha.
- **Causa:** o `TemplateSystem` resolve o corpo pelo template (`NABreathTpl00001`) no Compêndio; o `body` do Item é cópia secundária.
- **Correção:** corrigi a fonte e o pack, publiquei a 0.11.97; o `body` dos itens foi migrado como cinto de segurança.
- **Regra preventiva:** antes de migrar `body` de Item, conferir de onde a ficha lê; template do pack manda.

## 2026-10-28 - `visibilityFormula` é mathjs, não JavaScript

- **Erro:** `tem_requisito != true && tem_requisito != 1` derrubava o campo Requisito com `Value expected`.
- **Causa:** o parser do CSB é mathjs; `&&` e `||` não existem. O operador é `and`/`or`.
- **Correção:** fórmula passou a `tem_requisito != true and tem_requisito != 1`; teste novo proíbe `&&`/`||` em `visibilityFormula`/`editableFormula`.
- **Regra preventiva:** fórmula de visibilidade/edição usa a sintaxe do mathjs; o teste `tests/csb-formula-syntax.test.mjs` é o gate.

## 2026-10-28 - `HTMLElement` não é jQuery: `form[0]` é o primeiro input

- **Erro:** a pele das fichas de Item nunca aplicava; `na-sheet`/`na-item` iam para o primeiro input do form.
- **Causa:** `tagItemSheet` fazia `html?.[0] ?? html` e `app.element?.[0] ?? app.element`. `HTMLFormElement` expõe `[0]` como o primeiro controle, então o `instanceof HTMLElement` aprovava o input.
- **Correção:** `sheetElement()` usa o `HTMLElement` direto e só desembrulha objeto indexável (jQuery); regressão com form falso.
- **Regra preventiva:** ao aceitar jQuery ou HTMLElement, testar `instanceof HTMLElement` antes de indexar; em `<form>`, índice numérico é controle, não filho.

## 2026-10-28 - rollback da pele derrubou os textos dos templates

- **Erro:** desligar a pele do Actor tirou também `.na-sheet-text` e as cores dos templates; a ficha inteira perdeu a tipografia, não só o chrome.
- **Causa:** as classes de texto dos templates foram escopadas a `.na-sheet` no mesmo release em que o hook que aplicava a classe saiu.
- **Correção:** `tagNightAssassinsSheet` religado nos hooks de Actor; CSS intacto.
- **Regra preventiva:** rollback de skin separa chrome de tipografia — ou mantém a classe e desliga só o bloco de chrome.

## 2026-10-28 - DialogV2 devolve a ação quando o callback retorna null

- **Erro:** cancelar o diálogo de Teste de Atributo ainda chamava a rolagem.
- **Causa:** no Foundry 14.367, `DialogV2` usa o identificador da ação quando o callback retorna `null` ou `undefined`; o serviço recebia a string `cancel`.
- **Correção:** o botão retorna `false`, e `rollTest` recusa tanto falso quanto a ação legada `cancel` antes de criar o Roll.
- **Regra preventiva:** callbacks de cancelamento do DialogV2 devem retornar um valor falso explícito; cobrir também o identificador da ação no serviço compartilhado.

## 2026-10-28 — skin visual do Actor sem gate renderizado

- **Erro:** a pele Manhwa Dark do Actor alterou fichas funcionais sem validação visual no Foundry.
- **Causa:** hooks de render aplicavam `.na-sheet` a toda ficha Night Assassins, enquanto o CSS forçava fundo, inputs, painéis, medidores e tipografia.
- **Correção:** skin do Actor desligada; classes de texto ficaram escopadas a `.na-sheet`; skin de Item permanece independente.
- **Regra preventiva:** qualquer skin de ficha precisa passar pelo gate renderizado antes de ser registrada nos hooks de Actor.

## 2026-11-01 — interpolação de escapes ao registrar sessão

- **Erro:** o primeiro bloco de abertura escrito no L0 transformou barra-t em tab e barra-zero em NUL.
- **Causa:** o comando PowerShell foi montado em template literal JavaScript, que interpretou as barras invertidas antes de chegar ao shell.
- **Correção:** o bloco recém-adicionado foi substituído por escrita literal com String.raw/here-string; o L0 foi relido e ficou sem NUL/tab.
- **Regra preventiva:** ao escrever Markdown via functions.exec, usar payload literal sem escapes interpretáveis e sempre fazer read-back procurando caracteres de controle.

## 2026-11-01 — escopo corrigido pelo operador para bônus, recuperação e manobras

- **Erro:** o escopo inicial tratava os bônus manuais como Acerto/Testes e a Respiração da Recuperação como uma extensão das quatro Formas existentes.
- **Causa:** a implementação atual foi tomada como limite do pedido antes de fixar a regra de mesa fornecida pelo operador.
- **Correção:** o operador confirmou todos os canais derivados para edição manual, substituição pela tabela de nível de personagem 1–14 e gerenciador completo das 27 Manobras de Combate.
- **Regra preventiva:** quando o operador fornece uma regra de mesa completa, separar o contrato desejado da compatibilidade atual e confirmar o escopo antes de fechar a SPEC.

## 2026-11-01 — ficha de NPC também precisa de Status

- **Erro:** os bônus manuais foram adicionados ao template de NPC, mas o painel/estado de Status não entrou na ficha.
- **Causa:** o escopo foi verificado para os canais numéricos e não para a paridade funcional da ficha.
- **Correção:** adicionar ao NPC o painel de Status usando o contrato existente do módulo, sem alterar IDs ou ownership.
- **Regra preventiva:** ao ampliar uma ficha, conferir campos, ações, status e integração visual contra os templates equivalentes antes de fechar a mudança.

## 2026-11-03 — NPC bloqueado como incapacitado

- **Erro:** fichas de NPC não conseguiam rolar Acerto, Dano e Testes; o serviço avisava que o personagem estava incapacitado.
- **Causa:** o guard compartilhado de Status confiava em `vida_morte_slayer_dados` mesmo quando um Actor NPC importado carregava essa key legada; a reprodução real foi `CHAERI · ESCONDENDO-SE DE PAPARAZZI` com `dying=true`, embora o Actor fosse classificado como `npc`.
- **Correção:** `lifeDeathBlocked` ignora essa key somente quando o contrato identifica NPC; Status explícito (`atordoamento`, etc.) continua sendo respeitado. Regressão cobre rolagem e dano.
- **Regra preventiva:** guards de mecânicas específicas devem validar o contrato do template antes de interpretar keys legadas; não remover o bloqueio de Status legítimo.

## 2026-11-03 — cobertura incompleta das armas normais

- **Erro:** o escopo anterior tratou as quatro armas normais publicadas como se fossem o conjunto completo do sistema; as 22 restantes existiam na fonte e no catálogo, mas não chegavam ao Compêndio distribuído.
- **Causa:** `tools/build-weapon-sources.mjs` mantinha uma allowlist manual de quatro nomes (`PUBLISHED_WEAPONS`) sem um teste que comparasse a saída contra `data/catalog-source/weapons/`.
- **Correção:** ampliar a publicação para todas as 26 armas normais canônicas e congelar o contrato com teste de contagem/nomes e template.
- **Regra preventiva:** inventariar fonte, catálogo, build e pack como camadas separadas; nenhuma allowlist parcial pode representar “todas” sem teste de cobertura.

## 2026-11-16 — botões DANO/CURAR na ficha de NPC sem pedido

- **Erro:** a v0.12.3 pôs na ficha de NPC um painel Vida com botões DANO e CURAR (openNpcVitals); o operador reclamou que isso não pertence à ficha.
- **Causa:** "reorganizar a ficha" foi lido como licença para criar ações novas; o dano já chega pelo fluxo de ataque com aceite do GM.
- **Correção:** remover os botões do template de NPC; manter o serviço só se outro chamador usar.
- **Regra preventiva:** redesenho de ficha reorganiza o que existe; ação nova na ficha só com pedido explícito do operador.

## 2026-11-16 — ficha de NPC complicada: colapsáveis e caixas duplicadas

- **Erro:** a ficha de NPC escondia o ajuste de vida e a Configuração em painéis colapsados, duplicava PDV/PDR (display + campo) e deixava Notas no fim da página.
- **Causa:** usei colapsável e painel extra para "organizar" em vez de reduzir; o operador quer ver e editar direto.
- **Correção:** Notas em aba própria, Configuração visível, campos de vida editáveis no próprio bloco de vida, sem colapsáveis.
- **Regra preventiva:** em ficha de jogo, nada essencial fica colapsado; um dado aparece uma vez; menos caixas vence mais caixas.

## 2026-11-16 — layout próprio no NPC em vez do padrão da ficha de Slayer

- **Erro:** redesenhei o NPC com linhas e cartões novos; o operador achou o visual ruim e faltou o Gerenciar Ações.
- **Causa:** tratei o NPC como projeto novo em vez de copiar o sistema visual da ficha de Slayer, que é a referência do operador.
- **Correção:** remontar o NPC com os mesmos componentes, classes e ordem da ficha de Slayer exportada do mundo, incluindo Gerenciar Ações.
- **Regra preventiva:** sistema de design existente vence; em ficha nova, começar copiando a ficha de referência e só remover o que não se aplica.

## 2026-11-16 — NPC com nível separado da Recuperação e sem Respirações

- **Erro:** a Recuperação do NPC dependia de um seletor próprio (npc_recuperacao_nivel) e a ficha não tinha Formas de Respiração; o operador esperava o mesmo modelo do Slayer.
- **Causa:** a v0.12.3 modelou o NPC como caso especial em vez de reaproveitar o contrato do Slayer (nível do personagem + container de Respirações).
- **Correção:** o campo Nível do NPC alimenta a Recuperação como nvl_num no Slayer; a ficha ganha o container de Formas de Respiração.
- **Regra preventiva:** NPC é um Slayer simplificado; toda mecânica do Slayer usada pelo NPC lê o mesmo tipo de dado, sem seletor paralelo.

## 2026-11-16 — Respirações migradas recusavam toda Forma no Foundry

- **Erro:** Pedra, Som, Sonhos, Raposa e Eclipse respondiam "Forma desconhecida: ." ao usar qualquer Forma, desde a v0.11.85.
- **Causa:** useBreathForm passava formaId: props.forma_id, mas props era a ficha do ator; os testes do pipeline injetam formaId direto e nunca passavam pelo useBreathForm.
- **Correção:** formaId lido de item.system.props.forma_id, com teste de regressão; o pipeline grava o PDR na key do ator (pdrSpentKey).
- **Regra preventiva:** toda rota nova testada com fake precisa de pelo menos um uso real no Foundry (ou um teste que passe pela função pública) antes de virar "migrada".

## 2026-11-16 — Respirações ausentes no Compêndio
- **Erro:** o operador informou que as Respirações de Som, Chamas, Vento, Neve, Metal, Pedra, Água, Raposa e Eclipse não aparecem no Compêndio.
- **Causa:** o build passou a filtrar `packDocuments` para somente `NABreathTpl00001`; os testes e o pack LevelDB perpetuaram essa decisão, embora os Items existissem no catálogo interno.
- **Correção:** o gerador voltou a materializar `catalog.documents` inteiro no pack; o catálogo interno continua como espelho de runtime, e os testes agora verificam o Compêndio real.
- **Regra preventiva:** toda Respiração deve ser conferida em fonte, catálogo, gerador, pack e manifesto; testes estáticos não substituem confirmar o Compêndio no Foundry.

## 2026-11-16 — Armas Especiais fora do Compêndio
- **Erro:** o operador reforçou que Armas Especiais também devem permanecer fora do Compêndio.
- **Causa:** a fronteira entre armas normais publicadas e dados especiais internos precisa ser conferida no gerador e no pack, não apenas na ficha visual.
- **Correção:** auditar `build-weapon-sources.mjs`, o catálogo interno e os testes; remover qualquer publicação especial sem tocar nas armas normais.
- **Regra preventiva:** o pack de armas publica somente armas normais canônicas; Armas Especiais ficam no catálogo interno e precisam de teste explícito de ausência no pack.

## 2026-11-16 — Respirações confirmadas antes do release
- **Erro:** a entrega das Armas Especiais podia deixar dúvida sobre as Respirações publicadas no mesmo release.
- **Causa:** os packs são gerados por pipelines separados, e validar um não prova a presença do outro.
- **Correção:** conferir o pack de Respirações independentemente, com as 11 Respirações e suas Formas, antes do commit e do release.
- **Regra preventiva:** nenhum release é declarado pronto sem verificar cada pack alterado, seus nomes publicados e os assets do manifesto.
