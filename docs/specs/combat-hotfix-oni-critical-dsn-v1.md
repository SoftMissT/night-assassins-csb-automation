---
title: "Hotfix de combate — Oni, crítico e Dice So Nice"
created: "2026-08-30"
status: in-progress
type: spec
tags: ["#projeto/night-assassins-csb-automation", "#spec/combat", "#stage/in-progress"]
---

# Hotfix de combate — Oni, crítico e Dice So Nice

Estado operacional em [[../../system/STATE|STATE]] e fila em [[../../tasks/backlog-completo-v0.11.38|backlog completo]].

## Contrato

- Ataque desarmado Oni segue os patamares oficiais N1/4/7/10/13/16/20: `2`, `1d6`, `2d6`, `2d8`, `3d8`, `4d10`, `6d10`, somando FOR no marcial e DEX em garras/mordida.
- Regeneração ativa Oni exige teste de VIT CD 12, uma vez por turno: N2 cura `1d4 + VIT` e consome Ação Especial; N5 cura `1d6 + VIT`; N9 cura `2d4 + VIT` e pode consumir Ação Única ou Especial.
- Dano Solar, Glicínia ou Nichirin desde o último turno bloqueia a regeneração. No N13+, um Oni não bloqueado recupera VIT automaticamente no início do turno.
- Reanexar membros no N9 e fazê-los crescer novamente no turno seguinte no N17 permanecem contratos mecânicos próprios; não devem ser simulados apenas como cura numérica.
- Oni comum não recebe o diálogo `Encadear Forma?`; somente a origem `origem_oni_exterminador_corrompido` pode encadear Respiração.
- Crítico rola cada parcela uma vez e duplica o dano final, após bônus e penalidades e antes da resistência.
- Dice So Nice é dependência obrigatória do módulo. Rolagens de Acerto e Dano com dados chamam `game.dice3d.showForRoll` explicitamente antes do resultado no chat.
- Falhas do relay Slayer→Oni não podem ser engolidas por `Promise.allSettled`; o jogador recebe erro acionável e o console registra a causa.

## Gate

- Testes Node de Oni, encadeamento, crítico, relay, distribuição e integração DSN verdes.
- No Foundry: Oni comum não abre o diálogo; Corrompido abre; dano Slayer→Oni atualiza a ficha; crítico dobra o total final; dados 3D aparecem antes do resultado; regeneração ativa consome a ação correta e a automática acontece somente no início do turno elegível.
- Nenhum commit ou release sem autorização explícita do operador.
