---
title: "Auditoria Vanilla contra os PDFs oficiais"
created: "2026-11-22"
status: em-andamento
type: plan
---

# Auditoria Vanilla contra os PDFs oficiais

Fonte: `Versao-Oficial-Night-Assassins-V25.1` (livro base, 80 p.) e `Night-Assassins-V25.1-Beginning-Hour-OFICIAL` (KIRITO, lote-002). Texto extraído em `build/qa-rules-source/book-2-page-NNN.txt` (livro base) e `book-1-*` (Beginning Hour).

Pedido do operador (2026-11-22): "tem muito errado ainda, leia os PDFs para saber o Vanilla". Áreas apontadas: coisa Homebrew aparecendo em Vanilla, Respirações Vanilla, Status e ações Vanilla, ficha do NPC Vanilla. Escopo: fichas de Slayer e NPC.

## Já conferido e correto

| Área | Página | Resultado |
|---|---|---|
| Origens (7) | p. 9 | texto, PDV/PDR iniciais e habilidades N1/N6 batem com `catalogs/rules-vanilla.json`; QA: Slayer Descendente PDV 13 (11+VIT 2) e PDR 7 (3+FDV 4) |
| Habilidades Especiais (6) | p. 10 | batem |
| Especializações (Mestre de Batalha, Veneno, Kakushi) | p. 11 | batem rank a rank |
| Metais (6 + Preto) | p. 23 | batem |

## Respirações: o Vanilla também tem passivas, com outras regras

| Respiração | Vanilla (livro base) | Homebrew (docs/Sistema) | Situação |
|---|---|---|---|
| Chamas p. 41 | Esquentar: Brasas (5→1 Exaustão, 10→5 dano, 20→+1 Exaustão, 30→5 dano, 40→+1 Exaustão, 50→atordoa 2 turnos, 60→Rengoku +FDV×FOR) e Fogo Fátuo (5→+1/+1, 10→+1/+2, 20→+2/+2, 30→+1d6 técnicas, 40→+2/+3, 50→+3/+3, 60→+50% e 2 concussão/turno). Pontos por Forma: 1º +2, 2º +3/+2, 4º +2, 5º +3/+3 (vantagem com 30+), 6º +4/+4, 9º +4/+4 | tabelas e pontos próprios (ex.: Tigre Ardente 7/9) | **verificar** se o motor usa a tabela Vanilla quando Respirações = Vanilla |
| Vento p. 50 | Sangue Especial: 1 Cicatriz a cada 30 de Cortante/Perfurante na última batalha; **+1 em testes de CAR por Cicatriz, máx. +4** | Cicatrizes sem CAR; VIT por Sangramento/Infecção; Corrente do Vendaval | **divergente**: bônus de CAR Vanilla; Corrente é só Homebrew |
| Sonhos p. 58 | Troca Equivalente: 1×/dia, custa **1 SAB permanente** | 1 PDV + 2 Exaustão + memória | **divergente** |
| Som p. 46 | Clones; Passiva do 6º estilo "O Canto dos Pássaros" | Partitura/BPM | BPM é **só Homebrew** |
| Raposa p. 65 | Passiva Olhos Escarlate | Véus da Raposa | Véus é **só Homebrew** |
| Água p. 40 | Máscara de Porcelana (opcional); sem acúmulo | estados próprios | verificar Formas |
| Eclipse | não está no livro base | Homebrew | só Homebrew |

Decisão pendente do operador: com Respirações em Vanilla, os extras Homebrew (BPM, Véus, Corrente, Forja Viva…) saem da ficha e da automação automaticamente? (O desenho de 2026-11-20 deixou esses extras como liga/desliga independente.)

## Próximas fases

1. **Coisa Homebrew aparecendo** — com a decisão acima, ocultar/desligar os extras Homebrew no Vanilla (linha ACÚMULOS, motores de passiva) e varrer Slayer/NPC por componentes Homebrew sem gate de variante.
2. **Respirações Vanilla** — passivas Vanilla de Chamas (tabelas), Vento (CAR), Sonhos (SAB), Som (Canto dos Pássaros), Raposa (Olhos Escarlate); depois Formas/custos/dano das Respirações usadas (Som, Chamas, Vento, Raposa, Sonhos, Água) contra pp. 40–65.
3. **Status e ações** — pp. 24–26 (Status, Tipos de Ação), p. 27 (Tipos de Dano), p. 6 (rolagem) contra os motores com `na_regras_status`/`na_regras_acoes`.
4. **Ficha do NPC Vanilla** — conferir o que o livro diz para NPC/inimigo humano (pp. 12–14 level up, p. 28 FAQ) contra a ficha.

Cada fase: teste com o número do livro, QA no `foundry-teste.bat` com alvo marcado, captura.

## Andamento

- **Decisão do operador:** com Respirações em Vanilla, os extras Homebrew saem automaticamente.
- **Fase 1 (parcial, commit `aa89da6` em `release/v0.15.1`):** `isHomebrewExtra` desliga Véus/raposa, Corrente, Forja Viva, extras de Pedra/Névoa/Neve, Sonhos e Troca Equivalente Homebrew com Respirações em Vanilla; Brasas e Olhos Escarlate seguem. Linha ACÚMULOS por variante. QA: Slayer "Fogo Fátuo 22/60 · … · Cicatrizes 6", NPC "Brasas Ardentes 11 (Queimando)". Gate 3.492/3.492.
- **Ainda na fase 1:** Marca do Caçador — o livro base tem Marca (p. 13: +2 em todas as características até o fim do combate; custo em anos de vida 1d10 + VIT; primeira ativação liberada pelo mestre). A Marca do módulo é a versão Homebrew; falta a versão Vanilla (grupo a definir: Progressão?). Varrer o resto de Slayer/NPC por componentes Homebrew sem gate.
- **Fase 2 — números do livro:** Fogo Fátuo usa a tabela Homebrew mesmo em Vanilla (QA: 22 pontos → +3/+4; o livro dá +2/+2 com 20). Tabelas Vanilla de Fogo Fátuo/Brasas e pontos por Forma (p. 41); Cicatrizes +1 CAR até +4 (p. 50); Troca Equivalente com 1 SAB permanente, 1×/dia (p. 58); Olhos Escarlate (p. 65) e Canto dos Pássaros (p. 46).
- **Fase 2 (parcial, feito):** Fogo Fátuo e Brasas Vanilla (p. 41) e Cicatrizes → CAR (p. 50). QA: 22 pontos → +2/+2; 10 pontos de Brasas → 5 de dano único no NPC alvo; 6 Cicatrizes → +4 CAR. Não exercitado em runtime: +50% do patamar 60 e o teste de CAR com rolagem (só teste unitário). Gate 3.495/3.495.
- **Fase 2, pendente:** pontos por Forma (p. 41: 1º +2, 2º +3/+2, 4º +2, 5º +3/+3, 6º +4/+4, 9º +4/+4), Troca Equivalente (1 SAB, p. 58), Olhos Escarlate (p. 65), Canto dos Pássaros (p. 46), Formas/custos/dano das demais Respirações.

### Andamento — Fase 2 (continuação, 2026-11-22)

- Troca Equivalente Vanilla (p. 58): código + testes + descanso zerando o uso do dia. Falta rodar no runtime (custo 1/2/3 de SAB).
- NPC: seletores Respiração / Secundária / Nível no cabeçalho e reconhecimento automático por Forma. Verificado no QA (Água preenche; Som depois não sobrescreve).
- Bônus temporários: os campos `resp_bonus_*_temp` existem só no Slayer, escondidos (GM, recolhidos) e escritos pelos motores; o NPC não os tem. Aguardando o operador dizer o que quer ver/digitar.
- Pendente: pontos de calor por Forma Vanilla de Chamas, 7º/8º estilo Chamas, Canto dos Pássaros, demais Respirações (pp. 40–65), Marca do Caçador Vanilla (p. 13), Fases 3 e 4.
- Bônus temporários (decidido: painel visível, editável por jogador): feito em Slayer e NPC (campos bonus_temp_*/npc_bonus_temp_*, agregador, dano). Verificado no QA com atores reais; rolagem completa de Acerto com o painel preenchido ainda não exercitada.
