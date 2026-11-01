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
