# Night Assassins CSB Automation

[![Última release](https://img.shields.io/github/v/release/SoftMissT/night-assassins-csb-automation?display_name=tag&sort=semver&label=release)](https://github.com/SoftMissT/night-assassins-csb-automation/releases/latest)
[![Release Foundry Module](https://github.com/SoftMissT/night-assassins-csb-automation/actions/workflows/release.yml/badge.svg)](https://github.com/SoftMissT/night-assassins-csb-automation/actions/workflows/release.yml)
![Foundry VTT](https://img.shields.io/badge/Foundry_VTT-v14-ff6400)
![Custom System Builder](https://img.shields.io/badge/Custom_System_Builder-%E2%89%A55.2.1-5965f2)
![Dice So Nice](https://img.shields.io/badge/Dice_So_Nice!-obrigat%C3%B3rio-8a2be2)

![Night Assassins CSB Automation](assets/nigh%20assassin%27s.png)

Módulo de automação para o sistema **Night Assassins** no **Foundry VTT v14**, construído sobre o **Custom System Builder**. Ele distribui os templates oficiais, compêndios e macros usados para atributos, progressão, combate, Respirações, Kekkijutsus e manutenção dos dados do mundo.

## Requisitos

| Dependência | Versão |
| --- | ---: |
| Foundry Virtual Tabletop | v14 |
| Custom System Builder | 5.2.1 ou superior |
| Dice So Nice! | Obrigatório |

Versão declarada no manifesto: **0.11.65**.

## Instalação

### Pelo Foundry (recomendado)

1. Na tela inicial do Foundry, abra **Módulos de Jogo**.
2. Clique em **Instalar Módulo**.
3. Cole a URL do manifesto:

```text
https://github.com/SoftMissT/night-assassins-csb-automation/releases/latest/download/module.json
```

1. Instale o módulo.
2. No mundo Night Assassins, abra **Gerenciar Módulos** e ative:
   - Night Assassins CSB Automation;
   - Dice So Nice!.
3. Salve e recarregue o mundo.

### Instalação manual

1. Baixe o `module.zip` da [release mais recente](https://github.com/SoftMissT/night-assassins-csb-automation/releases/latest).
2. Extraia o conteúdo em `{FoundryUserData}/Data/modules/night-assassins-csb-automation/`.
3. Confirme que `module.json` está diretamente nessa pasta.
4. Reinicie o Foundry e ative o módulo no mundo.

## Uso e macros

Ao entrar no mundo como GM, o módulo cria ou atualiza a pasta **Night Assassins** no Diretório de Macros. Entre as macros distribuídas estão:

- Controle GM;
- Gerenciar Ações, Status, Resistências, Descanso e Vida e Morte;
- Rolagens de Acerto e Dano;
- Respiração, Kekkijutsu e Marca do Caçador;
- Regeneração Oni;
- Diagnóstico e exportação do Journal de erros;
- Correção de Armas e Respirações legadas.

As configurações ficam em **Configurações do Jogo → Night Assassins CSB Automation**.

> A sincronização automática atualiza as macros gerenciadas no Diretório de Macros. Ela não redesenha nem reconecta componentes e botões dos templates CSB existentes no mundo.

## Estado das fichas

| Ficha | Estado atual |
| --- | --- |
| **Slayer** | Abas Perícias, Combate, Habilidades e Config/Dados; progressão N1–N20, PDV/PDR, atributos, ações, Vida e Morte, Respirações e inventário. O fluxo compartilhado de armas normais está implementado e aguarda o gate final no Foundry para Acerto → crítico → Dano. |
| **Oni** | Combate e Configurações/Dados; progressão N1–N20, PDV/PDK, Regeneração, Origens, Kekkijutsus, ações e resistências. Não recebe Vida e Morte de Slayer. |
| **Oni Minion** | Ficha enxuta com tipos, pacotes de atributos, ataques, traços, fraquezas e PDV/PDK próprios. |
| **NPC** | Ficha para NPCs com dados próprios. Participa do relay genérico e do mesmo motor de Acerto/Dano por armas normais usado pelo Slayer quando possui uma arma válida. |

### Estado de validação

- Slayer N1–N20: validado no Foundry.
- Vida e Morte do Slayer: validado no Foundry.
- Oni N1–N20: validado no Foundry; ajustes mecânicos adicionais continuam em desenvolvimento.
- Gate de desempenho: aprovado após a remoção das varreduras pesadas do caminho crítico.
- Armas normais Slayer/NPC: contrato e testes automatizados concluídos; validação runtime no Foundry ainda pendente.
- Armas especiais: fora do fluxo atual e ainda não publicadas como mecânica concluída.

## Respirações publicadas

Somente Respirações com serviço de estado dedicado, testes e auditoria contra a fonte oficial entram no compêndio final.

| Respiração | Conteúdo publicado | Estado |
| --- | --- | --- |
| **Chamas** | 9 Estilos + Esquentar | Auditada |
| **Pedra** | 5 Estilos | Auditada |
| **Névoa** | 8 Formas + 3 Padrões | Auditada |
| **Metal** | 5 Formas + Martelo do Julgamento | Auditada |
| **Neve** | 7 Formas + Congelar | Auditada |
| **Vento** | 9 Estilos + Sangue Especial | Auditada |

O catálogo de trabalho contém outras Respirações, mas elas não são publicadas até receberem motor, auditoria e testes equivalentes.

## Sistemas e automações

- **Atributos e progressão:** criação e distribuição de atributos, snapshots por nível e progressões específicas de Slayer e Oni.
- **Combate:** Acerto, Bloqueio, Esquiva, Dano, Cura, ações e recursos.
- **Críticos de armas:** o limiar vem do perfil/Item da arma; não é fixado globalmente em 20.
- **Dano entre atores:** relay genérico para Slayer, Oni, Oni Minion e NPC, com aprovação do GM quando aplicável.
- **Dice So Nice!:** rolagens mecânicas devem aguardar e exibir os dados 3D antes da mensagem final de resultado.
- **Bônus derivados:** resolvedor central para atributos, Metal/Cor, Respiração, Status e Habilidades Especiais.
- **Oni:** progressão, Regeneração, Origens, Kekkijutsus, Classes, Especializações e painel do GM.
- **Diagnóstico:** Journal exclusivo do GM, filtrado para eventos atribuídos ao módulo.

## Compêndios

| Compêndio | Conteúdo |
| --- | --- |
| **Macros Night Assassins** | Macros canônicas e ferramentas de reparo/diagnóstico |
| **Night Assassins Templates de Ficha** | Slayer, Oni, Oni Minion e NPC |
| **Night Assassin's Respirações** | Respirações publicadas e suas Formas |
| **Night Assassin's Armas dos Caçadores** | Armas normais disponíveis para Slayer/NPC |
| **Night Assassin's Arte** | Assets e ícones distribuídos pelo módulo |

Os geradores consomem as fontes versionadas do projeto. Arquivos gerados em `build/` não são fonte de verdade e não devem ser editados manualmente.

## Reparo de dados legados

Mundos antigos podem conter Items cujos IDs de template foram remapeados pelo CSB ou cujas propriedades mecânicas foram apagadas durante um reload.

- **Corrigir Armas dos Caçadores:** reconhece armas pelos dados reais do Item e reidrata categoria, crítico, perfis e propriedades mecânicas a partir do catálogo canônico.
- **Corrigir Respirações dos Caçadores:** sincroniza Items de Respiração com o compêndio canônico, preservando IDs remapeados pelo CSB.
- **Diagnóstico de Erros:** cria, abre e exporta o Journal operacional do módulo para o GM.

Os reparos são idempotentes: executar novamente sobre um documento já corrigido não deve gerar alterações adicionais.

## Troubleshooting

| Sintoma | Ação recomendada |
| --- | --- |
| Arma não aparece ou não possui perfil | Execute **Corrigir Armas dos Caçadores**, feche e reabra a ficha. Use um Item novo do compêndio para comparar com Items legados. |
| Respiração ou Forma perdeu dados | Execute **Corrigir Respirações dos Caçadores** e reabra a ficha. |
| Journal não abre ou não exporta | Confirme que está conectado como GM e use a macro **Diagnóstico de Erros** atualizada. |
| Fórmula CSB mostra `ERROR` | Reimporte o template oficial do compêndio; Actors antigos podem manter fórmulas de versões anteriores. |
| Asset retorna 404 | Confirme que `module.zip` contém `assets/icons/` e que a instalação não criou uma pasta duplicada. |
| Mundo fica lento após ativar o módulo | Desative temporariamente a automação afetada, exporte o Journal de diagnóstico e informe versão do Foundry, CSB e módulo. |

## Desenvolvimento

O fluxo de contribuição, geração dos compêndios e validação de release será documentado separadamente. Para executar a suíte atual:

```powershell
node --version
node --test
git diff --check
```

Não edite manualmente conteúdo gerado em `build/` ou nos diretórios de packs.

## Licença

MIT
