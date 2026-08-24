# Night Assassins CSB Automation

![Night Assassins CSB Automation](assets/nigh%20assassin%27s.png)

## Estado das fichas

| Ficha | Estado |
| --- | --- |
| **Caçador (Slayer)** | 6 abas (Perícias, Combate, Skills, Inventário, Notas, Configurações). Combate expõe armas (Item) e Formas de Respiração; Skills restrita a Mundo Transparente, Estado Altruísta, Marca do Caçador e Lâmina Carmesim. |
| **Oni completo** | 2 abas (Combate; Configurações/Dados). Combate: Acerto/Bloqueio/Esquiva/Dano, Perícias, Ações, Status/Resistências, Vida e Morte, e o itemContainer de Kekkijutsu. Config: Especialização, Origem/Progressão, Identidade/Inventário e os dados administrativos de GM (ledger de PDV por nível, PDK, atributos). |
| **Oni Minion** | Acerto/Dano/Bloqueio/Esquiva já operacionais; recebe dano automaticamente do relay genérico quando alvo de um ataque. |
| **NPC** | Acerto/Dano/Bloqueio/Esquiva e as 7 rolagens de atributo puro (VIT/DEX/FOR/CAR/FDV/INT/SAB), mesmo padrão do Slayer; recebe dano automaticamente do relay genérico. |

## Estado mecânico atual

- **Respirações com service dedicado:** Água, Chamas, Pedra, Névoa, Metal, Neve e Vento (9 Estilos, Sangue Especial) — cada uma com dados curados (`scripts/*-breathing-data.mjs`), lógica de estado e testes próprios.
- **Dano e cura entre atores:** o relay de dano (`damage-relay.mjs`) já é genérico entre Slayer/Oni/Oni Minion/NPC — qualquer ataque contra qualquer um desses tipos aplica dano automaticamente (com aprovação de GM quando quem ataca não é dono do alvo). Um relay de cura equivalente (`heal-relay.mjs`) foi adicionado; o botão de Dano do Slayer sempre abre um modal "Dano ou Cura?" antes de resolver contra o alvo.
- **Pipeline de Acerto → Dano:** rolar Acerto já dispara automaticamente a rolagem de Dano usando a arma correta (sem precisar clicar na arma manualmente), e o sistema oferece encadear a próxima Forma de Respiração após um acerto confirmado.
- **Oni:** progressão 1–20, Origens (21, incluindo Exterminador Corrompido com conversão PDR→PDK), Regeneração, Kekkijutsus, Classes, Especializações e Painel GM. Ledger de ganho de PDV por nível (`pdv_oni_ganho_nvl2..12`) é preenchido automaticamente (roll-once, nunca rerrola) ao carregar o mundo e reativamente por mudança de nível.
- **Oni Minion:** ficha separada com 3 tipos, 6 pacotes de atributos, 4 ataques, 14 traços, 10 fraquezas e escala por cena.
- **Macros:** wrappers para API do módulo (Controle GM, Gerenciar Status, Gerenciar Ações, Descanso, Respiração, Kekkijutsu, Marca do Caçador, correção de Respirações/Armas legadas).

Uma funcionalidade só será marcada como concluída quando tiver comportamento executável, persistência, testes e validação no Foundry.

## Conteúdo do módulo

- Compendium **Macros Night Assassins** com as macros canônicas (Controle GM, Gerenciar Status/Ações, Descanso, Kekkijutsu, Marca do Caçador, correção de Respirações/Armas legadas, entre outras).
- Compendium **Night Assassin's Respirações** com os Items de Forma das 7 Respirações com service dedicado (Água, Chamas, Pedra, Névoa, Metal, Neve, Vento).
- Compendium **Night Assassin's Armas dos Caçadores** com armas básicas e especiais como Items CSB.
- Compendium **Night Assassin's Arte** com os ícones de compêndio.
- Compendium **Night Assassins Templates de Ficha** com 4 templates (Slayer, Oni, Oni Minion, NPC).
- Automação de atributos e progressão da ficha do Custom System Builder.
- Relay de dano e cura genéricos entre Slayer/Oni/Oni Minion/NPC, com aprovação de GM quando aplicável.
- Configurações de mundo para ativar ou desativar a automação e os relays.
- As Formas usam automaticamente os ícones locais disponíveis em `assets/icons/`.

Os geradores usam somente os catálogos mecânicos versionados em `catalogs/`.

Ao entrar no mundo como GM, o módulo cria ou atualiza automaticamente no Diretório de Macros a pasta **Night Assassins** com todas as macros canônicas.

> **Importante:** o módulo não cria, altera nem reconecta componentes, Labels ou botões dentro do template do Custom System Builder. A sincronização automática alcança apenas as macros gerenciadas no Diretório de Macros.

As configurações ficam em `Configurações do Jogo` → `Night Assassins CSB Automation`.

Módulo Foundry VTT v14 para Custom System Builder que automatiza atributos, progressão e Habilidades Especiais do sistema Night Assassins.

## Instalação

### Instalação pelo Foundry recomendada

1. Na tela inicial do Foundry VTT, abra **Módulos de Jogo**.
2. Clique em **Instalar Módulo**.
3. Cole este endereço no campo **URL do Manifesto**:

   ```text
   https://github.com/SoftMissT/night-assassins-csb-automation/releases/latest/download/module.json
   ```

4. Clique em **Instalar** e aguarde o download.
5. Entre no mundo e abra **Gerenciar Módulos**.
6. Ative **Night Assassins CSB Automation**, salve e recarregue o mundo.

### Instalação manual

1. Baixe o arquivo `module.zip` da [release mais recente](https://github.com/SoftMissT/night-assassins-csb-automation/releases/latest).
2. Extraia seu conteúdo em `{FoundryUserData}/Data/modules/night-assassins-csb-automation/`.
3. Confirme que `module.json` está diretamente dentro dessa pasta, sem uma pasta duplicada no meio.
4. Reinicie o Foundry, entre no mundo e ative o módulo em **Gerenciar Módulos**.

O módulo exige **Foundry VTT v14** e o sistema **Custom System Builder**.

## Reparo de dados legados

Documentos (Actors/Items) criados em mundos com versões antigas do módulo podem carregar dados que não seguem mais o contrato atual do template. O módulo aplica reparos idempotentes automaticamente ao entrar no mundo como GM (`Hooks.once("ready")`):

- **Armas**: `repairSlayerWeaponItems` normaliza perfis de ataque e garante `inventario_categoria: "arma"` em qualquer Item de arma que tenha sido criado fora do fluxo de catálogo (ex.: botão "Create Item" direto na ficha).
- **Respirações**: `repairBreathingItems` sincroniza Formas de Respiração dos Actors com o Compendium canônico.

Ambos são idempotentes rodar de novo em um documento já corrigido não gera nenhuma mudança. Se precisar forçar manualmente, use as macros **Corrigir Armas dos Caçadores** e **Corrigir Respirações dos Caçadores** no Diretório de Macros.

## Troubleshooting

| Sintoma | Causa | Correção |
| --- | --- | --- |
| `wind.svg 404` / `oni.webp 404` | Template referenciava um ícone de core do Foundry ou path de asset que não existe no módulo. | Corrigido nos templates/geradores para usar `assets/icons/...` do próprio módulo. Se reaparecer, confira se o `module.zip` instalado inclui a pasta `assets/icons/`. |
| `Custom System Builder \| Value expected (char N)` ao abrir uma ficha | Um campo de fórmula CSB (`visibilityFormula`, `editableFormula`, `itemFilterFormula`, etc.) contém um operador lógico JavaScript (`&&`/`\|\|`) em vez da sintaxe do math.js (`and`/`or`). Comparações (`==`) são válidas e não são a causa. | O template fonte é validado por `tests/csb-formula-operators.test.mjs` (falha se qualquer template usar `&&`/`\|\|`). Se o erro aparecer mesmo com o template fonte limpo, o **documento (Actor/Item) já existente no mundo** ainda carrega a fórmula antiga reimporte o template do Compendium **Night Assassins Templates de Ficha** nesse documento. |
| Phone Chat lança `TypeError: Cannot read properties of undefined (reading 'id')` | `PhoneChatApp._initializeApplicationOptions` não retornava as opções processadas, então o `ApplicationV2` do core recebia `undefined`. | Corrigido a macro "Night Assassins Telefone" deve abrir sem erro. Se voltar a acontecer, confirme que nenhum código externo está sobrescrevendo `_initializeApplicationOptions` sem `return`. |
| Botão de Phone Chat aparece numa ficha | Regressão proibida Phone Chat é exclusivamente macro/hotbar. | Não existe nenhum hook de render de ficha vinculado ao Phone Chat no código atual. Se reaparecer, é uma regressão: remova qualquer `Hooks.on("renderActorSheet"/"renderActorSheetV2"/"renderApplicationV2", ...)` que chame `openPhoneChat`. |
| Uma Forma de Respiração acerta mas não causa dano | O caminho de dano que passa por confirmação de acerto (`rollConfirmedBreathDamage`, usado por formas de Pedra/Névoa/Metal/Neve que exigem `rollHit` antes) não recebia a fórmula de dano da Forma selecionada. | Corrigido o dano agora vem sempre da Forma usada (nunca do Nível de Respiração, que é apenas o cap de acesso 1–4). Coberto por `tests/breath-damage-pipeline.test.mjs`. |
| Arma não aparece no inventário / ficha trava ao soltar uma arma nela | `equalText(item.inventario_categoria, 'arma')` (usado pelo `itemContainer` de armas) lança `TypeError` quando o campo está `undefined` o que derruba o cálculo do container inteiro, não só do item problemático. Acontece com Items de arma criados fora do fluxo de catálogo/compêndio. | O template de arma (`NAWeaponTpl00001`) agora sempre nasce com `inventario_categoria: "arma"` (campo `hidden` do template). Itens legados sem o campo são corrigidos automaticamente pelo reparo de armas no `ready`. |

## Desenvolvimento

Testes:

```bash
node --test tests/*.test.mjs
```

## Licença

MIT
