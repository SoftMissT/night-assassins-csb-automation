# Night Assassins CSB Automation

![Night Assassins CSB Automation](assets/nigh%20assassin%27s.png)

## Estado das fichas

| Ficha | Versão | Estado |
| --- | ---: | --- |
| **Caçador humano** | **2.0** | Versão principal em uso |
| **Oni** | **Alpha 0.01** | Desenvolvimento inicial; mecânicas, keys e automações ainda podem mudar |

> A ficha de Oni ainda não deve ser considerada estável ou completa.

## Conteúdo do módulo

- Compendium `Macros Night Assassins` com nove macros canônicas, incluindo Controle GM, Gerenciar Resistências, Gerenciar Status e Gerenciar Ações.
- Automação de atributos e progressão da ficha do Custom System Builder.
- Relay de dano do GM para atualizar `pdv_oni_dano_tomado` com segurança.
- Configurações de mundo para ativar ou desativar a automação e o relay.

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

Os templates prontos ficam nos Compêndios **Night Assassin's Slayer** e **Night Assassin's Onis**. Importe o template desejado do Compêndio para o diretório de Actors e use-o como template no CSB.

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
```

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
