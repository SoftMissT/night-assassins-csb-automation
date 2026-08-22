# Night Assassins CSB Automation

![Night Assassins CSB Automation](assets/nigh%20assassin%27s.png)

## Estado das fichas

| Ficha | Versão | Estado |
| --- | ---: | --- |
| **Caçador humano** | **2.0** | Versão principal em uso |
| **Oni completo** | **0.10.0** | Progressão, Origens, Regeneração, Kekkijutsus, Classes, Especializações e Painel GM completos |
| **Oni Minion** | **0.10.0** | Template e construtor distribuídos com 3 tipos, 6 pacotes, 4 ataques, 14 traços e 10 fraquezas |

## Estado mecânico atual

O módulo está na versão **0.10.0**. Funcionalidades implementadas:

- **Oni completo:** atributos Oni (7), progressão 1–20, Origens (21), Regeneração, Mordida/PDK, Kekkijutsus (29 técnicas), Classes (5 ranks), Especializações (10 × 20 graus), Painel GM.
- **Oni Minion:** ficha separada com 3 tipos, 6 pacotes de atributos, 4 ataques, 14 traços, 10 fraquezas e escala por cena.
- **Slayer:** 9 abas (Perfil/Bio, Perícias, Combate, Skills, Inventário, Interlúdios, Notas/Diário, Configurações, Dados), Respirações (prioritárias Chamas/Pedra/Névoa/Metal/Neve), Estados Avançados (Mundo Transparente, Lâmina Carmesim, Estado Altruísta), Marca do Caçador, Vida e Morte, Descanso, Ações.
- **Macros:** 15+ wrappers limpos para API do módulo (Controle GM, Gerenciar Status, Gerenciar Ações, Descanso, Respiração, Kekkijutsu, Dom do Sangue, Marca do Caçador, Telefone/Chat).

Uma funcionalidade só será marcada como concluída quando tiver comportamento executável, persistência, testes e validação no Foundry.

## Conteúdo do módulo

- Compendium `Macros Night Assassins` com 15+ macros canônicas.
- Automação de atributos e progressão da ficha do Custom System Builder.
- Relay de dano do GM para atualizar `pdv_oni_dano_tomado` com segurança.
- Configurações de mundo para ativar ou desativar a automação e o relay.
- Compêndio **Night Assassin's Respirações** com 44 pastas e Items de Formas utilizáveis pela macro universal.
- Compêndio **Night Assassin's Armas dos Caçadores** com 26 armas básicas e 17 armas especiais como Items CSB.
- Compêndio **Night Assassin's Kekkijutsus** com 29 técnicas canônicas das Origens Oni.
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

## Desenvolvimento

Testes:

```bash
node --test tests/*.test.mjs
```

## Licença

MIT
