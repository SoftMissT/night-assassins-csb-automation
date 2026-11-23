---
title: "Passivas e variantes — trabalho em andamento"
created: "2026-11-19"
status: implementing
type: handoff
---

# Trabalho ativo

Checkout `D:/GIthub/night-assassins-csb-automation`, branch main, base publicado v0.13.5. Nenhum commit/release/instalação novo autorizado para este escopo. Preservar alterações antigas acumuladas de lessons.md. Sessão Hive não abrir/fechar automaticamente.

Operador confirmou implementar integralmente versões atuais de passivas em docs/Sistema. Esclareceu configuração global vanilla/homebrew para metal, Habilidades Especiais, Origens, Status. Perguntou por Classes; root confirmou que ainda não foram revisadas nesta rodada e incluiu sua separação no escopo. Constituição Forte foi nome errado, correto Constituição de Ferro (Tsuyoi). Não alterar números silenciosamente; fonte homebrew tabela nível12 +4 conflita com anotação posterior +3 e fórmula atual +3. Vanilla PDF não tem Tsuyoi.

## Fontes verificadas

KIRITO skill lida integralmente, catálogo/divergências lidos. Fontes oficiais vanilla em `C:/Users/monge/.codex/plugins/cache/created-by-me-remote/kirito-night-assassins/1.0.1/skills/kirito-night-assassins/references/fontes/lote-002/pdf/`. pypdf instalado APENAS em build/qa-python. Textos extraídos em build/qa-rules-source, índices identificam book1 BeginningHour (41p), book2 base (80p). Alguns arquivos não extraídos se sem hits, usar pypdf para páginas faltantes. Base p9 origens7, p10 habilidades6, p11 classes/especializações, p16 origensOni7, p23 metais6+preto, p24–25 status. BeginningHour p9 UsuárioDuasResp e p10–11 sinergias.

Vanilla metais p23 Alvorada +1acerto técnicasdano; Despertar +1malcancearma; Entardecer +1bloqueio; Coração +1danoenvenenamento/sangramentocontato; Espírito +1acerto técnicas semdano; Serenidade +2rolagens técnicasReação/proteção; Preto sóDescendente +1PDRmáx/+1bloqueio. Não mapear silenciosamente cores homebrew. Habilidades vanilla Olfato+1olfato,Tato+1defesascontraSurpresa,Audição+1CAR,Visão+1acerto,Transformação mordida+1atributotemp,Marechi+1PDR/nível. Nenhum catálogo/perfil/setting vanilla foi escrito ainda.

## Alterações locais e estado

Paridade NPC recursos/seletores, sonhos, Neve e bugs diversos já alterados com testes. Sonhos primeiro implementado por fonte antiga erroneamente SAB/dia/3usos, depois CORRIGIDO para fonte docs/Sistema atual 1PDV+2Exaustão+memória narrativa, bloqueio>=6. Resolver e fórmulas já retiraram perdaSAB antiga. README/CHANGELOG atualizados para o texto atual (1 PDV + 2 Exaustão, oferta indisponível quando o custo alcança Exaustão 8).

Vento cicatrizes corrigidas ilimitadas, semCAR. VITbonus apenas testes (cap4), via roll-service; fórmulas atributos restabelecidas a HEAD e NPC preserva habilidades. Testes novos npc-passive-integration6 passam. Raposa anti-surpresa agora permite ataque normal removendo vantagem manual declarada surpresa; preserva outras vantagens de estado.

Novos módulos prontos por workers, NÃO integrados ao fluxo real ainda.
- fox-passive-service.mjs e tests9, Véus/Nona/finisher6PDR. FX_KEY resp_raposa_passiva. reducer/gains/lifecycle, callback execute nofinisher. Em hit false consome firstadvantage. miss é INIMIGO errando contraRaposa, não erro do próprio usuário.
- metal-forge-passive.mjs e tests12, Temperatura/MetalBranco3turnos/1combate/+1Exaust fim, refleteVIT, firsthit1d8. StateKEY resp_metal_forja_passiva.
- wind-current-passive.mjs e tests20, Corrente unlimited/controlado/descontrolado, reserve/heal50% min(damageTaken,damageDealt), planspending; WindKEY resp_vento_corrente_estado. Gatehostile/technique/executionId, pooldice distribuído uma vez, stale dialogs corrigidos.
- sound-passive-service.mjs criado 24KB após worker usage limit, SEM testes novos ainda. APIs SOUND_PASSIVE_KEY, parse/reduce/getBonuses/activate/openManager. Verificar código inteiro e escrever testes.
- breathing-combat-passives.mjs root NOVO INCOMPLETO. Imports todos4módulos existentes, dispatcher serial, queued damage, turnhooks, socketmiss e manager. NÃO importado em main, NÃO chamado por hit/roll/damage/status ainda. Import dinâmico combat-passive-execution.mjs NÃO EXISTE. Não considerar integrado. Precisa review edgecases e teste.

Chamas worker parou usage limit no meio. Dados flameWeaponTier e calor ganhosFormas já atualizados para source atual. Novo processFlameEmbers em flame-breathing-service com testes7patamares/dedupe/nativeNPC; root NÃO chamou no status-engineprocessCurrentTurn ainda. Worker consertou selfdamageNPC e flags fimcombate. Root removeu dano antigo5 imediato emdamage-relay10/30. Acerto sem dano ainda não ganhaBrasas, pois relay sóaplica quando dano>0; precisa mover ganhoheat parahit semduplicar no damage. Alguns danosFormas antiquados fora passiva não revistos.

Neve releaseSnowRestriction helper já integrado root em applySlayerDamage e tickNPC no status-engine. Worker integrou damage-relay+damage-service+escape; nativasNPC e statusrealrestricaomovimentos. 5regressões novas. Ainda avaliar condição re-aplicar restrição apósquebra com5congelar, e cleanup fimcombate.

Root corrigiu reconcileSlayerExhaustion NPC para HP/cha​ve nativas eflatupdates. Precisa teste novo específico.

## Verificação atual

Última suíte completa `node --test` teve 3341 testes, 3341 pass, 0 fail (inclui `tests/` 1729). O antigo `build/update-npc-contract-test.mjs` era script descartável já aplicado e foi renomeado para `build/update-npc-contract.applied.mjs` para não ser coletado como teste. `git diff --check` limpo. GitNexus `detect_changes --scope all`: 294 símbolos/55 arquivos, risco critical pelo escopo acumulado, sem `partial`/`truncated`. Não houve QA Foundry renderizado.

2524 fórmulas verificadas com Math.js instalado do CSB em D:/FoundryData-Test/Data/systems/custom-system-builder/lib/math.js via build/qa-template-formulas.mjs (script ainda contém antigo propSAB ignorado, ajustar). Pack templates construído em build/qa-parity-packs ANTES das últimas mudanças, precisa regenerar e desempacotar conferir. Buildcmd node tools/build-template-sources.mjs + npx --offline @foundryvtt/foundryvtt-cli@3.0.4 package pack. Nada instalado no mundo.

GitNexus MCP tools funcionam, CLI pode DBheldporMCP. Usar impact ID exato Function:path:symbol quando nome retornar UNKNOWN; conferir literal callers antes de editar. Muitos riscos CRITICAL foram anunciados (derived, attributes, damage,flameTier,windStatePatch). Antes de entregar detect_changes all SEMpartial/truncated e diffcheck. Novos arquivos não indexados, reindex se necessário.

Workers review_parity, visual_perception_fix, wind_damage_fix, metal_live_forge atingiram usage limit e pararam. Não confiar trabalho futuro em subagentes sem verificar execução atual. Continuar root. Opções de perfil e source ainda não implementadas.

## Integração a fazer

1. Completar/revisar common event dispatcher, filtrar miss incomingFox vs outgoingSound. Canon ctx combatId uuid??id e turnKey consistente. Sóloop turnStart no atorpróprio paraMetal/Som/Wind, Raposa precisa todoturno comisActorTurn.
2. Derived bônus permanentesFoxhit/dodge, Metalblock, Soundblock/dodge/movement/RD. Bônus primeiroacertoSound e gastoControladoVento só UMA rolagem, não replicar sequência.
3. Hit eventos confirmados comexecutionId estável, firsthitqueue1d8Metal/1d6Som, crit/gains/misses; mapear sourceformId/actionType do pipeline. Incoming misses paraRaposa viaGMproxyvalidado.
4. Defense rollTest deve pedirconfirmarresultado quandoqualquerpassivaprecisa, não sóinterceptaçãoChamas. classificar perfeito/reaçãodefensiva/melee explicitamente seminventar. PhysicalSave flag/context paraMetal.
5. Damage events native PDV perdidohostil (semoverkill/vidaextra) paraWind/Som/Metal; root normalizer atualmente descarta sourceActorUuid metadata, adicionar whitelist validada. Firsthitqueue casarexecutionId entre hit eattack-follow-up/rollConfirmedBreathDamage/rollWeaponItem. RD/resistimmunity aplicar nos serviços GM autoritativos.
6. Manager/API/menu e botão acessível jogadorNPC/Slayer; engine chama arquivoexecutor inexistente. Implementar ativos dos planos via pipeline real comcancel/rollbackpartialexecution, noPDRduplo, extraNightcore metade-2semcontato/BPM, Tomorrowland6hits+explosãosave, Requiem2dadosmax eBis. Não declarar botão se executor nãofunciona.
7. Fonte vanilla/profile global UI/dados/mecânicas todas5categorias, preservando escolhas por variante. Toggle registrado (world, requiresReload) e lido por damage/derived/sheet/class/status. `na_rules_vanilla`/`na_vanilla_*` NÃO são keys de template: CSB "Reload Template" apaga props fora de `_getProperties()` — `na_rules_vanilla` ressincroniza no render, mas seleções `na_vanilla_*` do diálogo se perdem. Pack publicado em `packs/` continua sem as fórmulas `na_rules_vanilla` (o mundo não vê a UI da variante até repack + importar o template). Pack de validação regenerado em `build/qa-toggle-pack` (conferido por unpack). Classes atuais untouched.
8. Bugs auditados: RESOLVIDOS nesta sessão — Pedra Quebra acompanha o usuário (`stone.breakStacks` global com fallback legado `breakByWeapon`) e só concede com Concussão efetiva (`appliedTargets[].concussionDamage > 0`); Martelo usa metade da NOVA rolagem, sem crítico de técnica nem rearmPending/refund indevido; Ferida não aparece mais em dobro na notificação/chat. Testes atualizados.
9. README/CHANGELOG/SPEC e resultado final honestos; build/fulltests/graphdiff/independentreview e QA Foundry separado. Semrelease/commit desteescopo ainda.

## Relações

- [[2026-11-19-paridade-npc-passivas]]
- [[2026-11-03-item-hud-dano-classes]]
