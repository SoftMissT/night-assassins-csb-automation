# Night Assassins — CSB Automation

## Conteúdo do módulo

- Compendium `Macros Night Assassins` com as cinco macros canônicas.
- Automação de atributos e progressão da ficha do Custom System Builder.
- Relay de dano do GM para atualizar `pdv_oni_dano_tomado` com segurança.
- Configurações de mundo para ativar ou desativar a automação e o relay.

Depois de ativar o módulo, abra `Compêndios` → `Macros Night Assassins` e arraste as macros desejadas para a hotbar ou importe-as para o mundo.

As configurações ficam em `Configurações do Jogo` → `Night Assassins — CSB Automation`.

Módulo Foundry VTT v14 para Custom System Builder 5.2.1 que automatiza atributos, progressão e Habilidades Especiais do sistema Night Assassins.

## Instalação

1. Clone ou copie este repositório para `{FoundryUserData}/Data/modules/night-assassins-csb-automation/`.
2. Confirme que `module.json` está na raiz da pasta.
3. Reinicie o Foundry e ative o módulo no mundo desejado.

## Uso

### Relay automático de dano em inimigos

Ao carregar o mundo, `scripts/main.mjs` registra automaticamente o relay de dano em todos os clientes. Não é necessário executar uma macro de GM.

- O jogador marca o token inimigo como alvo e usa `na_roll_damage.js`.
- A macro chama `game.modules.get("night-assassins-csb-automation").api.applyOniDamage(...)`.
- Se o jogador não possuir o Actor, o módulo encaminha o pedido ao primeiro GM ativo.
- O GM acumula o valor exclusivamente em `system.props.pdv_oni_dano_tomado`.
- Se o próprio GM rolar o dano, a atualização é direta.

Após instalar ou atualizar os arquivos do módulo, GM e jogadores devem recarregar o mundo.

Após ativado, os botões da ficha CSB chamam a API do módulo automaticamente:

```js
%{return await game.modules.get("night-assassins-csb-automation").api.rollTest({actor:entity,test:"TESTE DE FORÇA",attr:"FOR",value:entity.system.props.atr_for_valor,color:"#C1000C");}%
```

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

## Desenvolvimento

Testes:

```bash
node --test tests/*.test.mjs
```

## Licença

MIT
