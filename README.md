# Night Assassins — CSB Automation

## Conteúdo do módulo

- Compendium `Macros Night Assassins` com seis macros canônicas, incluindo o Controle GM.
- Automação de atributos e progressão da ficha do Custom System Builder.
- Relay de dano do GM para atualizar `pdv_oni_dano_tomado` com segurança.
- Configurações de mundo para ativar ou desativar a automação e o relay.

Depois de ativar o módulo, abra `Compêndios` → `Macros Night Assassins` e arraste as macros desejadas para a hotbar ou importe-as para o mundo.

Ao entrar no mundo como GM, o módulo também cria automaticamente no Diretório de Macros a pasta **Night Assassins** com as seis macros. A macro **Controle GM** permanece exclusiva do GM; as demais ficam disponíveis aos jogadores.

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
- O GM escolhe resistência e tipos de dano antes de autorizar a atualização.
- O GM separa o valor autorizado: dano comum em `system.props.pdv_oni_dano_tomado` e Ferida em `system.props.pdv_oni_dano_ferida`.

### Controle GM

Importe do Compendium a macro **Night Assassins — Controle GM**. Ela lista todos os Actors Night Assassins do mundo e mostra `nome_cacador`, Habilidade Especial, Metal/Cor e barras de PDV/PDR. O painel é somente leitura e exclusivo do GM.

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
- `pdv_oni_dano_ferida` (number field do inimigo; perda permanente acumulada do PDV máximo)

No template do Oni, subtraia `pdv_oni_dano_ferida` na fórmula que produz `pdv_total_valor`. A fórmula de PDV atual deve continuar usando o PDV total já reduzido menos `pdv_oni_dano_tomado`; assim Ferida reduz o máximo e dano comum reduz apenas a vida atual.

## Desenvolvimento

Testes:

```bash
node --test tests/*.test.mjs
```

## Licença

MIT
