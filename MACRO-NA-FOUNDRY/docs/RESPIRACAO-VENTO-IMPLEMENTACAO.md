# Respiração do Vento — Implementação

Data: 2026-08-23 · Missão de fechamento sobre working tree pós-v0.11.2
Fontes: `Respiração do Vento.md` > `respiracao_vento.json` (transcrição) > decisões da missão > runtime.
Baseline antes: **716/716** → Depois: **734/734** (+18 testes próprios).

---

## Arquitetura

```
Item/Estilo (compêndio night-assassins-respiracoes)
→ na-resp-usar-forma.js / rollMessage
  → api.useBreathForm({ actorUuid, itemUuid })
    → collectWindChoices (Redemoinho: pdrInvested)
    → buildWindBreathingPlan(formId, level, props, choices)  [wind-breathing-service.mjs]
      → CONTRATO OBRIGATÓRIO: state.pendingDamage / state.nextHit
        (mesmo shape de Chamas/Água/Pedra/Névoa/Neve/Metal)
    → COMMITMENT: ação + PDR (Redemoinho cobra o investido)
  → hit-service consome nextHit (bônus/count por ataque)
  → damage-service consome pendingDamage:
    specs por tipo · Garras transformam a arma · Ciclone oposto ·
    ignoreResistance suprime resistências · Ventania/Vufão branches
```

**Nenhum damage engine novo.** Nenhuma macro por Estilo.

## Estado Persistido (`resp_vento_estado`)

```jsonc
{
  "version": 1,
  "scars": 3,                    // cicatrizes consolidadas (Sangue Especial)
  "vitBonus": 1,                 // Resistência Vital consolidada
  "battleDamage": { "cutPierce": 0, "bleedInfection": 0 }, // pool da batalha atual
  "pendingDamage": { /* slot do contrato comum */ },
  "nextHit": { /* idem */ }
}
```

## Sangue Especial

```
dano recebido (Cortante/Perfurante e Sangramento/Infecção)
→ status-engine.applySlayerDamage → registerWindBattleDamage (pool da batalha)
→ Descanso Longo (rest-service, tier deep) → consolidateWindScars
   · floor(cutPierce/30) = cicatrizes (cap +4, +1 CAR por cicatriz via catálogo/display)
   · floor(bleedInfection/25) = Resistência Vital (cap +4, +1 VIT)
   · pools zerados após consolidar (idempotente — testado)
combatEnd NÃO consolida (não há hook nele).
```

## 1º Estilo — Redemoinho de Poeira
- **Escalável:** custo variável `pdrInvested` (1..2×DEX); acima do máximo **bloqueia sem cobrar**; N1–3 `1d6/PDR`, N4 `2d6/PDR`; distância mínima 5m é checagem manual (runtime não mede — limitação documentada).
- **Ciclone Penetrante:** 3 PDR · 5d6 Cortante · máx 3 alvos · oposição Esquiva×Acerto por alvo (metade no sucesso). Rolagem ofensiva única compartilhada (ver Pendência A).

## 2º Estilo — Garras do Vento Puro
N2 ×3 / N3 ×4 / N4 (arma+DEX)×4 — transformação aplicada ao primeiro spec de arma dentro do damage-service (`garras.multiplier/addDex`). Prepara pendente; não causa dano ao ativar. Consumo no primeiro dano resolvido (ver Pendência B para erro).

## 3º Estilo — Árvore Balançando ao Vapor da Montanha
Uso 1 Ataque 3d10/3 PDR · Uso 2 Reação 2d8 (N1–2)/2d12 (N3–4)/2 PDR — **não anula** o ataque recebido. Crítico na reação cura +1 PDV por aliado compatível (`WIND_SYNERGY_BREATHINGS`: Insetos/Névoa/Grama/Areia, por `respiracao_nome`, exclui o usuário), limitado ao PDV máximo.

## 4º Estilo — Tempestade Crescente de Poeira
+1 ataque no turno (`nextHit.count`). Acerto aplica flags no alvo: `windHealBlock` (sem cura de PDV até o próximo turno do usuário) e, em N3/N4, `kekkijutsuSurcharge: 2`.

## 5º Estilo — Vendaval de Inverno
**3 ataques reais** (`nextHit.count=3`, `pendingDamage.uses=3`) com fórmulas N1–N4 (`2d4+FDV` … `2d8+FDV+DEX`), bônus de acerto 0/0/+1/+2, `ignoreResistance: true` por instância. Exaustão +1 **uma única vez pelo uso** em N3+ (patch no commitment).

## 6º Estilo — Fumaça Escurecedora
N1 indisponível. 8d6 Cortante (+2d6/+4d6 Perfurante N3/N4, tipos preservados). `blockPenaltyVsBlock: -2` — penalidade só na defesa por Bloqueio (Esquiva sem penalidade). Crítico → flag `windRegenBlock` (1 turno sem regeneração de vida).

## 7º Estilo — Ventania Rajadas Repentinas
Fortalece os ataques do turno; cada inimigo ATINGIDO testa VIT vs DC (9/10/10/12 + DEX) **uma vez por alvo por turno** (flag `windVentaniaSave[round:turn]`). Falha: dano de queda Concussão 2d6/3d6 + flag `windProne` (levantar exige Ação Especial).

## 8º Estilo — Corte da Primeira Ventania
Completa, N3+, alcance 18m, 6 PDR. Dano usa **cicatrizes consolidadas**: N3 `4d12 × max(1, scars)` · N4 `6d12 × scars`. Pools não consolidados não aumentam o dano.

## 9º Estilo — Tufão Idaten
Requer N4 + DEX ≥4. Fórmula `10d10 + scars×(2d10) + DEX×(2d10)`. Sangramento no alvo: VIT vs `12+FOR` → FOR de dano/3 turnos (status engine existente). Cura 5 PDV se dano líquido ≥ 10% do PDV máximo do alvo (uma vez). Exaustão +1 no uso bem-sucedido.

## Combos
A/B/C/D/E da missão suportados pela composição de estados independentes + fila de pendentes (mesmo padrão de Chamas/Metal).

## Hooks
choices → `collectCuratedChoices(metal_06-like)` · afterHit → consumo nextHit/sinergia · afterDamage → consumo pendingDamage/Garras/Ciclone/Ventania/Tufão/flags · turnEnd → `tickWindBreathing` · longRest → `consolidateWindScars` · combatEnd → limpa pool de batalha (sem consolidar).

## Compatibilidade
Estados antigos (ex.: `battleDamage.blunt`, ausência de fila) carregam via `parseWindBreathingState` — teste dedicado.

## Testes
`tests/wind-breathing.test.mjs` — 18 testes: passiva (29/30/60/caps/idempotência/limpeza), Redemoinho (níveis/máx/zero), Ciclone, Garras, Árvore, Tempestade, Vendaval, Fumaça, Ventania, 8º (incl. mínimo garantido), Tufão (DEX/fórmula/exaustão/campos), consumo da fila, estado legado.

## Divergências encontradas
- Catálogo tinha `tipo_manobra: "Não informada"` e `nivel_req: 1` universal — corrigido (32 campos, `tools/fix-wind-catalog.mjs`).
- Plano anterior retornava `damage` solto (fantasma) — substituído pelo contrato `pendingDamage`.
- Exaustão do Tufão movida do commit incondicional para uso bem-sucedido (interpretação "após o uso").

## Decisões Pendentes
- **A. Ciclone:** implementado com UMA rolagem ofensiva compartilhada comparada às Esquivas individuais. Operador pode mudar para uma rolagem por alvo.
- **B. Garras com erro:** implementado como consumido no primeiro dano resolvido (independe de acertar, conforme texto “primeiro ataque após conjurar”). Se quiser “mantém até acertar”, ajustar consumo.
- **D. Ventania:** implementado 1 teste VIT por alvo atingido por turno.
- **E. Tufão — PDR em falha no DEX:** cobrados no commitment (não devolvidos); Exaustão só no sucesso. Fluxo de diálogo do teste DEX ainda não automatizado (testDc exposto no plano).
