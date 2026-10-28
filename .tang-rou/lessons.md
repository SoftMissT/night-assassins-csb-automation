# Lições do projeto

## 2026-10-28 — DialogV2 devolve a ação quando o callback retorna null

- **Erro:** cancelar o diálogo de Teste de Atributo ainda chamava a rolagem.
- **Causa:** no Foundry 14.367, `DialogV2` usa o identificador da ação quando o callback retorna `null` ou `undefined`; o serviço recebia a string `cancel`.
- **Correção:** o botão retorna `false`, e `rollTest` recusa tanto falso quanto a ação legada `cancel` antes de criar o Roll.
- **Regra preventiva:** callbacks de cancelamento do DialogV2 devem retornar um valor falso explícito; cobrir também o identificador da ação no serviço compartilhado.

## 2026-10-28 — skin visual do Actor sem gate renderizado

- **Erro:** a pele Manhwa Dark do Actor alterou fichas funcionais sem validação visual no Foundry.
- **Causa:** hooks de render aplicavam `.na-sheet` a toda ficha Night Assassins, enquanto o CSS forçava fundo, inputs, painéis, medidores e tipografia.
- **Correção:** skin do Actor desligada; classes de texto ficaram escopadas a `.na-sheet`; skin de Item permanece independente.
- **Regra preventiva:** qualquer skin de ficha precisa passar pelo gate renderizado antes de ser registrada nos hooks de Actor.
