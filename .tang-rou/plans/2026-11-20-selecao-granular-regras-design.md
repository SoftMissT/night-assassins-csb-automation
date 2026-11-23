---
title: "Seleção granular de regras — design aprovado"
created: "2026-11-20"
status: design-approved
type: plan
---

# Seleção granular de regras (vanilla / homebrew / extras)

## Objetivo

Substituir o toggle binário `vanilla | homebrew` por uma seleção granular de mundo: o GM marca, por grupo de regras, qual versão a mesa usa. Extras que só existem na mesa viram liga/desliga. Propriedades de Arma são selecionadas por propriedade. A mudança aplica após reload e nada apaga dados existentes.

## Decisões confirmadas pelo operador (2026-11-20)

- **Granularidade (C):** por categoria; Propriedades de Arma vira por propriedade.
- **Alcance (A):** mundo inteiro, sem exceção por ficha. O GM pode voltar e mudar quando quiser.
- **Estados (A):** `vanilla | homebrew` onde há as duas versões; `ativa | desativa` nos extras da mesa. Regras de base nunca desligam a automação — só trocam a versão.
- **Aplicação (A):** `requiresReload`, como o toggle atual.
- **Ritmo (B):** tudo de uma vez, plano único cobrindo todos os grupos + extras.

## Modelo de dados

Novo setting de mundo `rulesSelection` (String com JSON), GM-only, `requiresReload: true`, substitui `rulesProfile`. Exemplo:

```json
{
  "metal": "homebrew", "habilidades": "vanilla", "origens": "homebrew",
  "status": "homebrew", "classes": "vanilla",
  "propriedades": { "nitoryu": "homebrew", "ryoto": "vanilla", "morote": "homebrew",
                    "acuidade": "homebrew", "concussao": "homebrew", "manejavel": "homebrew",
                    "municiada": "homebrew", "precisao": "homebrew", "sojutsu": false },
  "acoes": "homebrew", "dano": "homebrew", "vida_morte": "homebrew",
  "respiracao": "homebrew", "progressao": "homebrew",
  "sonhos": true, "raposa": true, "forja_viva": true, "corrente": true,
  "brasas": true, "veus": true, "extras_pedra": true, "extras_nevoa": true,
  "extras_neve": true, "troca_equivalente": true, "olhos_escarlate": true
}
```

- Grupos com as duas versões: metal, habilidades, origens, status, classes, propriedades (por propriedade), acoes, dano, vida_morte, respiracao, progressao.
- Extras só homebrew: sojutsu + as passivas da mesa (sonhos, raposa, forja_viva, corrente, brasas, veus, extras de pedra/névoa/neve, troca_equivalente, olhos_escarlate).
- **Migração:** `rulesProfile === 'homebrew'` → todos os grupos `homebrew` e extras `true`; `rulesProfile === 'vanilla'` → grupos com catálogo vanilla `vanilla`, extras `true` (preservar comportamento atual; o GM desliga depois). O toggle antigo sai de `registerSettings` após a migração.

## API e propagação

- `scripts/rules-profile.mjs`: `getRuleSelection(grupo)` e `ruleVariant(grupo)` (`'vanilla' | 'homebrew' | null`) + `isHomebrewExtra(chave)` para extras. `getRulesProfile()` vira alias deprecado enquanto houver chamador legado.
- Cada serviço consulta só os grupos que usa: damage-service (dano, propriedades, classes, metal), derived-bonus-service (metal, habilidades, origens), sheet-attributes (habilidades), class-contracts/runtime (classes), catálogo de status (status), weapon-service/hit-service (propriedades), status-engine/life-death/breathing (seus grupos).
- **Fichas:** `syncSheetRulesProfile` grava flag por grupo no ator (`na_regras_<grupo>` 0/1, mesmas regras de sync de hoje) e as `visibilityFormula` dos 4 templates trocam `na_rules_vanilla` pela flag do grupo correspondente. Escolhas vanilla por ficha (`na_vanilla_metal/ability/origin/class`) continuam valendo quando o grupo está em vanilla; `openRulesProfileManager` mostra só os grupos em vanilla.
- **Extras:** engines de passivas checam `isHomebrewExtra` ao registrar hooks e nos pontos de entrada; extra desligado = botões/painéis ocultos e hooks não registrados. Dados persistidos (estado das passivas) não são apagados — ficam preservados para religar.

## UI do GM

- Diálogo "Regras da Mesa" (DialogV2, GM-only): seção por grupo (radio vanilla/homebrew), sub-seção de Propriedades (radio por propriedade) e seção de extras (checkbox). Aberto pelo botão da ficha (hoje "Regras Vanilla") e pelo Controle GM.
- Aviso no diálogo: "A mudança vale para o mundo e aplica após recarregar."

## Inventário e fontes

| Grupo | Vanilla (fonte) | Homebrew (fonte) |
|---|---|---|
| Metal | Livro base p. 23 | `docs/Sistema` (metais/catálogos) |
| Habilidades | Livro base p. 10 | `docs/Sistema` |
| Origens | Livro base p. 9 e 16 | `docs/Sistema` |
| Status | Livro base p. 24–25 | `docs/Sistema` |
| Classes | Livro base p. 11 | `docs/Sistema` |
| Propriedades | Livro base p. 19–21 | `docs/Sistema/05 - Armas e Pactos/PROPRIEDADES DAS ARMAS.md` |
| Ações | Livro base p. 26 | `docs/Sistema` |
| Dano | Livro base p. 27 | `docs/Sistema` |
| Vida e Morte | Livro base p. 28 | `docs/Sistema` |
| Respirações | Beginning Hour p. 10–12, 17+ | `docs/Sistema/03 - Respirações` |
| Progressão | Livro base p. 13, 18; BH | `docs/Sistema/08 - Progressão` |

Extratos vanilla em `build/qa-rules-source/` (book-1 = Beginning Hour, book-2 = base, índices em `book-*-index.json`).

## Riscos

- Grupos base (acoes, dano, vida_morte, respiracao, progressao) hoje **não têm implementação vanilla** — cada variante é trabalho novo com catálogo extraído do PDF e testes próprios. É a maior parte do plano.
- Diff gigante nos 4 templates: `tests/sheet-layout.test.mjs` e `tests/sheet-bonus.test.mjs` travam ordem/keys; `templateSystemUniqueVersion` sobe.
- Preservar: IDs de 16 caracteres, UUIDs de compêndio, flags, ownership e contratos CSB. Nada de apagar dados ao alternar versão.
- Pack de templates precisa regenerar e o mundo reimportar o template para ver as novas flags (lição de 2026-11-20).
- Nenhum QA renderizado no Foundry até agora; validar no mundo antes de declarar pronto.

## Ordem de execução (plano único, B)

1. Infra: `settings.mjs` (`rulesSelection` + migração), `rules-profile.mjs` (API por grupo + alias), testes.
2. Flags por grupo no ator + `syncSheetRulesProfile` + `visibilityFormula` nos 4 templates.
3. Grupos com catálogo pronto (metal, habilidades, origens, status, classes, propriedades) — trocar leituras nos serviços.
4. Propriedades por propriedade (weapon-service, hit-service, damage-service) com variantes vanilla de Nitoryu/Ryoto/Morote.
5. Grupos base: acoes, dano, vida_morte, progressao — variantes vanilla + gates.
6. Respiracao: formas vanilla vs mesa.
7. Extras on/off — gates nas engines de passivas.
8. Diálogo "Regras da Mesa" + Controle GM.
9. README/CHANGELOG/SPEC, pack regenerado, suíte completa, `git diff --check`, `detect_changes --scope all` sem partial/truncated, QA Foundry.

## Relações

### Contratos conferidos para Metal

- Nichirin Vanilla, livro base p. 23. Despertar acrescenta 1 m à arma. Coração acrescenta 1 ao dano de contato que aplica Sangramento ou Envenenamento. O bônus deve entrar na aplicação do efeito, uma vez por contato confirmado.
- Respiração do Metal, 5ª Forma. Vanilla usa Ataque (livro base p. 55). Homebrew usa Especial para preparar o Ataque Padrão, que conserva seu custo de Ataque. Ambos pagam 4 PDR e mantêm os estágios de acertos. O seletor de Metal da Nichirin é independente.

- [[2026-11-19-passivas-perfis-em-andamento]]
- [[2026-11-19-paridade-npc-passivas]]
