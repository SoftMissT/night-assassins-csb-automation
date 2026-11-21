# Night Assassins CSB Automation

[![Última release](https://img.shields.io/github/v/release/SoftMissT/night-assassins-csb-automation?display_name=tag&sort=semver&label=release)](https://github.com/SoftMissT/night-assassins-csb-automation/releases/latest)
[![Release Foundry Module](https://github.com/SoftMissT/night-assassins-csb-automation/actions/workflows/release.yml/badge.svg)](https://github.com/SoftMissT/night-assassins-csb-automation/actions/workflows/release.yml)
![Foundry VTT](https://img.shields.io/badge/Foundry_VTT-v14-ff6400)
![Custom System Builder](https://img.shields.io/badge/Custom_System_Builder-%E2%89%A55.2.1-5965f2)
![Dice So Nice](https://img.shields.io/badge/Dice_So_Nice!-obrigat%C3%B3rio-8a2be2)

![Night Assassins CSB Automation](assets/media/module-cover.webp)

Módulo de automação para o sistema **Night Assassins** no **Foundry VTT v14**, construído sobre o **Custom System Builder**. Ele distribui os templates oficiais, compêndios e macros usados para atributos, progressão, combate, Respirações, Kekkijutsus e manutenção dos dados do mundo.

Versão declarada no manifesto: **0.13.5**.

## Imagem do módulo

A capa da instalação (tela de Setup do Foundry) e a imagem deste README são o mesmo arquivo:

```text
assets/media/module-cover.webp
```

Para trocar pela arte definitiva, substitua **esse arquivo** mantendo o nome e o caminho — o `module.json` aponta para ele em `media` e o `module.zip` publica a pasta `assets/media/`. Arte atual: WebP 1672×941 (16:9), 367 KB. O card do Setup usa `object-fit: cover`; conforme a largura da janela ele recorta as laterais ou o topo/base, então mantenha o assunto principal centralizado e evite texto grande nas bordas. Nenhum outro arquivo precisa mudar.

## Requisitos

| Dependência              |            Versão |
| ------------------------ | ----------------: |
| Foundry Virtual Tabletop |               v14 |
| Custom System Builder    | 5.2.1 ou superior |
| Dice So Nice!            |       Obrigatório |

## Instalação

### Pelo Foundry (recomendado)

1. Na tela inicial do Foundry, abra **Módulos de Jogo**.
2. Clique em **Instalar Módulo** e cole a URL do manifesto:

```text
https://github.com/SoftMissT/night-assassins-csb-automation/releases/latest/download/module.json
```

3. Instale o módulo.
4. No mundo Night Assassins, abra **Gerenciar Módulos** e ative:
    - Night Assassins CSB Automation;
    - Dice So Nice!.
5. Salve e recarregue o mundo.

### Instalação manual

1. Baixe o `module.zip` da [release mais recente](https://github.com/SoftMissT/night-assassins-csb-automation/releases/latest).
2. Extraia o conteúdo em `{FoundryUserData}/Data/modules/night-assassins-csb-automation/`.
3. Confirme que `module.json` está diretamente nessa pasta.
4. Reinicie o Foundry e ative o módulo no mundo.

## Uso e macros

Ao entrar no mundo como GM, o módulo sincroniza **Night Assassins Controle GM**, **Night Assassins Criar Arma** e **Night Assassins Criar Forma de Respiração** na pasta **Night Assassins** do Diretório de Macros. O compêndio **Macros Night Assassins** preserva os UUIDs usados pelos templates.

- Controle GM, Criar Arma e Criar Forma de Respiração;
- Gerenciar Ações, Status, Resistências, Descanso, Vida e Morte e Estados Avançados;
- Teste de Atributo, Rolagem de Acerto e Rolagem de Dano;
- Usar Forma de Respiração, Respiração da Recuperação e Marca do Caçador.

**Criar Arma** salva uma arma normal no diretório de Itens ou na ficha do token selecionado. Na **Rolagem de Dano**, Slayer e NPC podem selecionar Formas de dano portadas e liberadas pelo nível de Respiração. Confirmar a rolagem desconta o PDR da ficha que rolou. Para condições e efeitos completos da técnica, use **Usar Forma de Respiração**.

**Criar Forma de Respiração** abre o mesmo formulário do Controle GM. Use o token selecionado ou escolha uma ficha de destino. O Item usa o ícone da Respiração escolhida.

As demais ferramentas do GM (Regeneração Oni, Dupla Alma, Interlúdio, diagnóstico, correções e armas duplicadas) não são macros soltas: ficam no botão **Ferramentas do GM**, dentro do **Controle GM**.

As configurações ficam em **Configurações do Jogo → Night Assassins CSB Automation**.

> A sincronização automática não apaga cópias antigas nem altera hotbars. Ela também não redesenha ou reconecta componentes e botões dos templates CSB existentes no mundo.

## Estado das fichas

| Ficha          | Estado atual                                                                                                                                                                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Slayer**     | Abas Combate, Perícias, Habilidades e Config/Dados. Habilidades reúne as escolhas Vanilla e Homebrew. Bônus Fixos ficam recolhidos em Combate. Regras da Mesa fica na configuração do GM. |
| **Oni**        | Combate e Configurações/Dados; Combate na mesma ordem (PDV/PDK, atributos, combate, Bônus Fixos, lista de **Kekkijutsu** com botão Usar, Status). Criação N1, progressão N1–N20, Regeneração, Origens e resistências. A Ferida desconta do PDV. |
| **Oni Minion** | Ficha enxuta com tipos, pacotes de atributos, ataques, traços, fraquezas e PDV/PDK próprios.                                                                                                                                                                       |
| **NPC**        | Combate com PDV/PDR, atributos, ações, armas, formas e Bônus Fixos recolhidos. Os bônus de ação ficam na configuração do GM. Usa os recursos da ficha ao executar Formas e seus efeitos secundários. |

### Estado de validação

- Slayer N1–N20: validado no Foundry.
- Vida e Morte do Slayer: validado no Foundry.
- Oni N1–N20: validado no Foundry; ajustes mecânicos adicionais continuam em desenvolvimento.
- Gate de desempenho: aprovado após a remoção das varreduras pesadas do caminho crítico.
- Armas normais Slayer/NPC: contrato e testes automatizados concluídos; validação runtime no Foundry ainda pendente.
- Armas especiais: os dados ficam num catálogo interno do módulo (`catalogs/`), usado pela Dupla Alma; o compêndio de armas guarda só armas normais e o template de arma normal. Validação runtime ainda pendente.
- Tela de erro do CSB: o template NPC e o Slayer protegem o filtro de `inventario_categoria`; mundos antigos precisam reimportar o template para receber a fórmula corrigida.
- v0.11.93 (Bônus Fixos, Kekkijutsu no Oni, Ferida no PDV do Oni e fichas reorganizadas): testes automatizados concluídos; validação no Foundry pendente. Reimporte as quatro fichas de ator.

## Respirações publicadas

O Compêndio `night-assassins-respiracoes` publica o template, as pastas, os hubs e as Formas das 11 Respirações aprovadas. `catalogs/breathing-items.json` permanece como espelho interno para o reparo de Items e a importação sob demanda na ficha.

| Respirações publicadas |
| ---------------------- |
| **Água**, **Chamas**, **Eclipse**, **Metal**, **Neve**, **Névoa**, **Pedra**, **Raposa**, **Som**, **Sonhos** e **Vento** |

### NPC, habilidades e passivas

O NPC tem os seletores **Habilidade Especial** e **Metal / Cor da lâmina** na aba Combate. Os textos evoluem nos níveis 1, 6 e 12. Os bônus numéricos usam o nível do NPC. Constituição de Ferro, de Tsuyoi, aumenta VIT, FOR e PDV máximo. Marechi e Oketsu aumentam o PDR máximo. A Marca do Destino solicita o atributo e evolui no nível 6. Esses ganhos são somados às bases editáveis.

As cores usam os mesmos bônus do Slayer. Formas, Água, Burizado, cura de Vento e sinergia do Martelo leem e alteram o PDV/PDR da própria ficha. Pelo **Controle GM → Ferramentas → Descanso**, o NPC também pode consolidar os ganhos de Sangue Especial na Recuperação Profunda. A passiva concede 1 Cicatriz por 30 de dano cortante ou perfurante, sem limite. A cada 25 de dano por Sangramento ou Infecção, concede +1 em testes de VIT, até +4.

**Raposa — Olhos Escarlate** concede +1 PDR máximo e −1 em Acerto. Para receber +2 em percepção visual de SAB/INT pelo botão de atributo, marque **Percepção visual** no diálogo. A prévia inclui todos os bônus visuais. Em Acerto, marque **Ataque surpresa físico** para que alvos da Raposa ignorem a vantagem da surpresa e o ataque siga normalmente.

**Sonhos — Troca Equivalente** oferece confirmação ao chegar a 0 PDV ou menos. Aceitar restaura exatamente 1 PDV atual e aplica 2 níveis de Exaustão. A perda de uma memória importante é resolvida na mesa. A oferta fica indisponível se o custo alcançar Exaustão 8. O NPC recebe a oferta no cliente do GM ativo.

Os textos das Habilidades Especiais incluem efeitos que dependem de decisão da mesa. A presença da descrição não significa que todo poder ativo tenha um botão automático. Estas correções acrescentam a paridade dos seletores e dos efeitos numéricos existentes, além das passivas descritas acima. Para receber os novos campos, atualize os templates NPC e Slayer pelo procedimento de importação do CSB. A conferência visual no Foundry deve ser feita separadamente dos testes automatizados.

## Sistemas e automações

- **Atributos e progressão:** criação e distribuição de atributos, snapshots por nível e progressões específicas de Slayer e Oni.
- **Combate:** Acerto, Bloqueio, Esquiva, Dano, Cura, ações e recursos.
- **Críticos de armas:** o limiar vem do perfil/Item da arma; não é fixado globalmente em 20.
- **Dano entre atores:** relay genérico para Slayer, Oni, Oni Minion e NPC, com aprovação do GM quando aplicável.
- **Dice So Nice!:** rolagens mecânicas devem aguardar e exibir os dados 3D antes da mensagem final de resultado.
- **Bônus derivados:** resolvedor central para atributos, Metal/Cor, Respiração, Status e Habilidades Especiais.
- **Bônus Fixos da ficha:** Slayer, Oni, Oni Minion e NPC têm campos de Acerto (todo Acerto), Dano (toda rolagem de dano) e Defesa/Testes (Bloqueio, Esquiva e testes de atributo), mostrados como "Bônus da ficha". Fichas antigas precisam reimportar o template para ganhar os campos.
- **Oni:** progressão, Regeneração, Origens, Kekkijutsus, Classes, Especializações e painel do GM.
- **Diagnóstico:** Journal exclusivo do GM, filtrado para eventos atribuídos ao módulo.

### Classes na ficha

O GM escolhe a variante de **Classes** em **Regras da Mesa** e recarrega o mundo. A classe Vanilla é escolhida nesse menu. O seletor de classe Homebrew fica na ficha.

- **Kakushi** abre as ações da classe. Marque o aliado no mapa antes de abrir a ficha. O GM pode aplicar a habilidade quando o jogador não pode editar a ficha do aliado.
- **Companheiro de Oni** permite ao GM vincular um Oni pela ficha do Slayer. Na Defesa, informe o atacante e a CD para resolver a interceptação.
- **Duas Respirações** usa a secundária escolhida na ficha. O GM informa a compatibilidade para pares que exigem decisão da mesa.
- No Homebrew, o menu da Respiração oferece **Registrar Variação** ao GM e lista as técnicas aprovadas para uso. **Forma Intermediária** aparece a partir do Rank S em combate, e **Forma Composta** aparece no Rank SS. O módulo cobra os recursos e aplica os limites de uso. O efeito híbrido descrito no registro é resolvido na mesa.
- **Mestre de Batalha:** a Pressão de Combate acompanha o próximo ataque básico contra o mesmo alvo. Críticos com arma proficiente oferecem Crítico Brutal. No Homebrew, confirme o tipo do golpe em **Aparar Instintivo** e marque corpo a corpo para oferecer o Contra-ataque após um erro confirmado.
- **Manobras de Combate** ficam disponíveis com **Ações Homebrew**.
- **Especialização Oni** reúne as ações de Titan e Mestre da Recuperação no perfil Vanilla. Os efeitos passivos entram nos fluxos de acerto, dano e regeneração.

## Compêndios

| Compêndio                                | Conteúdo                                             |
| ---------------------------------------- | ---------------------------------------------------- |
| **Macros Night Assassins**               | Macros chamadas pelos templates (por UUID)           |
| **Night Assassins Templates de Ficha**   | Slayer, Oni, Oni Minion e NPC                        |
| **Night Assassin's Respirações**         | Template de Respiração; as Formas são importadas do catálogo pelo hub da ficha |
| **Night Assassin's Armas dos Caçadores** | Armas normais e template de Arma normal |
| **Night Assassin's Arte**                | Assets e ícones distribuídos pelo módulo             |
| **Night Assassins Regras**               | Jornal com as opções, CDs e tabela da Respiração da Recuperação |

Os geradores consomem as fontes versionadas do projeto. Arquivos gerados em `build/` não são fonte de verdade e não devem ser editados manualmente. O `release.yml` reempacota os compêndios a partir de `src/` e `macros/` antes de publicar.

## Reparo de dados legados

Mundos antigos podem conter Items cujos IDs de template foram remapeados pelo CSB ou cujas propriedades mecânicas foram apagadas durante um reload.

Todas ficam em **Controle GM → Ferramentas do GM → Manutenção do mundo**:

- **Corrigir armas:** reconhece armas pelos dados reais do Item e reidrata categoria, crítico, perfis e propriedades mecânicas a partir do catálogo canônico.
- **Corrigir Respirações:** sincroniza Items de Respiração com o catálogo interno, preservando IDs remapeados pelo CSB.
- **Diagnóstico de erros:** cria, abre e exporta o Journal operacional do módulo para o GM.
- **Armas duplicadas:** lista armas repetidas do personagem selecionado e exclui só o Item que você confirmar.

Os reparos são idempotentes: executar novamente sobre um documento já corrigido não deve gerar alterações adicionais.

## Troubleshooting

| Sintoma                               | Ação recomendada                                                                                                                 |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Arma não aparece ou não possui perfil | Execute **Corrigir armas** (Controle GM → Ferramentas do GM), feche e reabra a ficha. Use um Item novo do compêndio para comparar. |
| Respiração ou Forma perdeu dados      | Execute **Corrigir Respirações** (Ferramentas do GM) e reabra a ficha.                                                           |
| Journal não abre ou não exporta       | Confirme que está conectado como GM e use **Diagnóstico de erros** em Ferramentas do GM.                                         |
| Fórmula CSB mostra `ERROR`            | Reimporte o template oficial do compêndio; Actors antigos podem manter fórmulas de versões anteriores.                           |
| Erros `compareText`/`equalText` no console | Reimporte o template do compêndio (NPC ou Slayer). A fórmula antiga fica salva no mundo até o template ser recarregado.      |
| Asset retorna 404                     | Confirme que `module.zip` contém `assets/icons/`, `assets/fonts/` e `assets/media/`, e que a instalação não criou pasta duplicada. |
| Mundo fica lento após ativar o módulo | Desative temporariamente a automação afetada, exporte o Journal de diagnóstico e informe versão do Foundry, CSB e módulo.        |

## Desenvolvimento

O fluxo de contribuição, geração dos compêndios e validação de release será documentado separadamente. Para executar a suíte atual:

```powershell
node --version
node --test
git diff --check
```

Não edite manualmente conteúdo gerado em `build/` ou nos diretórios de packs. A capa do módulo é a exceção de asset: troque somente `assets/media/module-cover.webp`.

## Licença

MIT.
