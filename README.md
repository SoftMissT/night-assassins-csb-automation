# Night Assassins CSB Automation

![Night Assassins CSB Automation](assets/nigh%20assassin%27s.png)

## Estado das fichas

| Ficha | Versão | Estado |
| --- | ---: | --- |
| **Caçador humano** | **2.0** | Versão principal em uso |
| **Oni completo** | **Alpha 0.1** | Fundação de recursos/progressão presente; recuperação, Origens, Especializações e Kekkijutsus ainda não formam um ciclo completo |
| **Oni Minion** | **Planejado** | Template e construtor rápido ainda não distribuídos |

> A ficha de Oni ainda não deve ser considerada estável ou completa. PDV/PDK, barras, dano e parte da progressão possuem fundação técnica, mas isso não significa que todas as regras 1–20 estejam automatizadas.

## Estado mecânico atual

O módulo está na versão **0.9.12**. O foco atual de desenvolvimento é transformar as fundações já existentes em ciclos realmente jogáveis:

- **Oni completo:** separar definitivamente os atributos Oni dos atributos Slayer; concluir progressão, recuperação, mordida/PDK, Origens, Especializações e ações de chefe.
- **Oni Minion:** criar uma ficha própria e um construtor rápido baseado em escala da cena, tipo, pacote de atributos, ataque, um traço e uma fraqueza.
- **Classes Slayer:** conectar os cinco catálogos de classe ao runtime de combate; hoje a maior parte dessas regras ainda é declarativa.
- **Kekkijutsus:** criar template Item, Compendium e execução integrada a acerto, dano, status, ações e gasto de PDK.

Uma funcionalidade só será marcada como concluída quando tiver comportamento executável, persistência, testes e validação no Foundry. Dropdowns, descrições e catálogos isolados não contam como automação completa.

### Ordem de implementação

1. Estabilizar a baseline e separar o trabalho pendente de Respirações.
2. Corrigir identidade, atributos, PDV/PDK e recuperação do Oni completo.
3. Entregar a ficha e o construtor de Oni Minion.
4. Tornar as cinco Classes Slayer executáveis.
5. Entregar Kekkijutsus como Items e completar Origens/Especializações Oni.
6. Validar tudo com GM e jogadores antes de publicar uma nova release.

## Conteúdo do módulo

- Compendium `Macros Night Assassins` com nove macros canônicas, incluindo Controle GM, Gerenciar Resistências, Gerenciar Status e Gerenciar Ações.
- Automação de atributos e progressão da ficha do Custom System Builder.
- Relay de dano do GM para atualizar `pdv_oni_dano_tomado` com segurança.
- Configurações de mundo para ativar ou desativar a automação e o relay.
- Compêndio **Night Assassin's Respirações** com 44 pastas e Items de Formas utilizáveis pela macro universal.
- Compêndio **Night Assassin's Armas dos Caçadores** com 26 armas básicas e 17 armas especiais como Items CSB; ataques com distância, forma ou empunhadura própria oferecem perfis selecionáveis.
- As Formas usam automaticamente os ícones locais disponíveis em `assets/icons/`; Respirações sem arte própria mantêm o fallback do Foundry.

Os geradores usam somente os catálogos mecânicos versionados em `catalogs/`. Os documentos editoriais permanecem exclusivamente na base de conhecimento `MACRO-NA-FOUNDRY` e não são distribuídos no módulo.

As oito Respirações sem arquivo editorial individual no vault (Ameixeira, Estrelas, Macaco, Nevasca, Tartaruga, Tinta, Tormenta e Tubarão) já possuem pasta reservada, mas não recebem Formas inventadas. Quando suas fontes oficiais forem adicionadas, seus Items deverão ser compilados novamente para o catálogo mecânico.

Ao entrar no mundo como GM, o módulo cria ou atualiza automaticamente no Diretório de Macros a pasta **Night Assassins** com as nove macros canônicas. A macro **Controle GM** permanece exclusiva do GM; as demais ficam disponíveis aos jogadores.

Também é possível consultar as cópias originais em `Compêndios` → `Macros Night Assassins`.

> **Importante:** o módulo não cria, altera nem reconecta componentes, Labels ou botões dentro do template do Custom System Builder. A sincronização automática alcança apenas as macros gerenciadas no Diretório de Macros. Cada botão ou Label da ficha precisa ser configurado manualmente no editor do template CSB.

O Compendium **Night Assassin's Slayer** fornece o template canônico atualizado. Na v0.3.0 ele inclui **Gerenciar Resistências**, **Gerenciar Status**, Exaustão acumulativa e separação entre dano comum e Dano de Ferida. Fichas já existentes não são sobrescritas automaticamente.

Na v0.5.10, o template Slayer também possui Fôlego de Combate: máximo `2 + FDV final`, preenchimento automático no início do combate e recuperação de 1 no início do turno. O deslocamento base continua sendo `7m + DEX atual`. Estado Altruísta e Mundo Transparente já possuem contrato técnico, mas a automação completa deles ainda será implementada sobre acerto, defesa, dano e turnos.

Na v0.4.0, **Gerenciar Status** também configura fórmula, quantidade de turnos, pilhas, salvaguarda e fonte. O GM ativo processa automaticamente dano contínuo, expiração, Confuso, salvaguardas e Exaustão pelo Combat nativo. O módulo continua compatível com Combat Tracker Dock porque não depende da interface do tracker.

As configurações ficam em `Configurações do Jogo` → `Night Assassins CSB Automation`.

Módulo Foundry VTT v14 para Custom System Builder que automatiza atributos, progressão e Habilidades Especiais do sistema Night Assassins depois que o template CSB estiver configurado com as keys e chamadas exigidas.

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

## Uso

### Relay automático de dano em inimigos

Ao carregar o mundo, `scripts/main.mjs` registra automaticamente o relay de dano em todos os clientes. Não é necessário executar uma macro de GM.

- O jogador marca o token inimigo como alvo e usa `na_roll_damage.js`.
- A macro chama `game.modules.get("night-assassins-csb-automation").api.applyOniDamage(...)`.
- Se o jogador não possuir o Actor, o módulo encaminha o pedido ao primeiro GM ativo.
- O GM escolhe resistência e tipos de dano antes de autorizar a atualização.
- O GM separa o valor autorizado: dano comum em `system.props.pdv_oni_dano_tomado` e Ferida em `system.props.pdv_oni_dano_ferida`.

### Controle GM

Importe do Compendium a macro **Night Assassins Controle GM**. Ela lista os Actors Night Assassins usando `nome_slayer` para Caçadores e `nome_oni` para Onis, com barras de PDV/PDR do Slayer. O painel é somente leitura e exclusivo do GM.

Após instalar ou atualizar os arquivos do módulo, GM e jogadores devem recarregar o mundo.

### Configuração manual dos botões e Labels CSB

Ativar ou atualizar o módulo **não modifica o template da ficha**. Abra o template no Custom System Builder e configure manualmente cada componente que deve executar uma macro.

Os templates prontos ficam no Compêndio **Night Assassins — Templates de Ficha**. Ele reúne as fichas Slayer, Oni, Oni Minion e NPC. Importe o template desejado para o diretório de Actors do mundo antes de associá-lo a uma ficha no CSB.

Contrato visual dos templates: ficha `1200 × 1200`, retrato `250 × 400` e redimensionamento permitido. O Oni Minion é uma ficha separada e simplificada; não usa Origem Oni completa nem progressão 1–20.

O template **NPC** é narrativo: use a imagem do próprio Actor como foto e preencha nome, papel, afiliação, localização, personalidade, tom de voz, aparência, contexto e notas do GM. Ele não contém combate nem automações.

Os botões dos templates chamam diretamente o UUID estável da macro no Compêndio do módulo. Exemplo para Arremesso com FOR:

```js
%{return await (await fromUuid('Compendium.night-assassins-csb-automation.night-assassins-macros.Macro.NARollMode000001'))?.execute({actorUuid:entity.uuid,test:'Arremesso',attr:'FOR',color:'#C0392B'});}%
```

O parâmetro `actorUuid:entity.uuid` é obrigatório para que a macro saiba qual ficha chamou o teste. Não é necessário passar `val`: a macro lê `for_display` diretamente do Actor.

Exemplos das outras entradas públicas:

```js
// Acerto
%{return await (await fromUuid('Compendium.night-assassins-csb-automation.night-assassins-macros.Macro.NAHitRoll0000001'))?.execute({actorUuid:entity.uuid});}%

// Dano
%{return await (await fromUuid('Compendium.night-assassins-csb-automation.night-assassins-macros.Macro.NADamageRoll0001'))?.execute({actorUuid:entity.uuid});}%

// Atributos por nível
%{return await (await fromUuid('Compendium.night-assassins-csb-automation.night-assassins-macros.Macro.NAAttrLevel00001'))?.execute({actorUuid:entity.uuid,level:entity.system.props.nvl_pj});}%

// Marca do Caçador
%{return await (await fromUuid('Compendium.night-assassins-csb-automation.night-assassins-macros.Macro.NAHunterMark0001'))?.execute({actorUuid:entity.uuid});}%

// Gerenciar Status
%{await (await fromUuid('Compendium.night-assassins-csb-automation.night-assassins-macros.Macro.NAStatusManage01'))?.execute({actorUuid:entity.uuid}); return '';}%

%{await (await fromUuid('Compendium.night-assassins-csb-automation.night-assassins-macros.Macro.NAActionManage01'))?.execute({actorUuid:entity.uuid}); return '';}%

// Descanso
%{await (await fromUuid('Compendium.night-assassins-csb-automation.night-assassins-macros.Macro.NARestManage0001'))?.execute({actorUuid:entity.uuid}); return '';}%
```

O botão **DESCANSO** solicita ao GM um Descanso de Campo (2h), Descanso Completo (8h) ou Recuperação Profunda (24h+). O benefício somente é gravado após a confirmação antiabuso do GM. Descanso Completo também oferece a remoção autorizada das Fadigas da Respiração da Recuperação.

`actorUuid:entity.uuid` é o UUID do Actor que clicou; o UUID em `fromUuid(...)` é o UUID permanente da macro fornecida pelo módulo.

## Template CSB

O template precisa conter as seguintes keys:

- `nvl_pj` (dropdown)
- `hab_escolhida` (dropdown)
- `atr_vit_valor_config`, `atr_dex_valor_config`, `atr_for_valor_config`, `atr_car_valor_config`, `atr_fdv_valor_config`, `atr_int_valor_config`, `atr_sab_valor_config` (number fields, podem estar ocultos)
- Snapshots ocultos: `vit_nvl1`, `dex_nvl1`, `for_nvl1`, `car_nvl1`, `fdv_nvl1`, `int_nvl1`, `sab_nvl1` (e equivalentes para níveis 3, 6 e 7)
- `hab_marca_destino_atributo` (text field oculto)
- `hab_marca_destino_bonus` (number field oculto)
- `na_automacao_versao_dados` (number field oculto)
- `pdv_oni_dano_tomado` (number field do inimigo)
- `pdv_oni_dano_ferida` (number field do inimigo; perda permanente acumulada do PDV máximo)

No template do Oni, subtraia `pdv_oni_dano_ferida` na fórmula que produz `pdv_total_valor`. A fórmula de PDV atual deve continuar usando o PDV total já reduzido menos `pdv_oni_dano_tomado`; assim Ferida reduz o máximo e dano comum reduz apenas a vida atual.

## Desenvolvimento

Testes:

```bash
node --test tests/*.test.mjs
```

## Licença

MIT
