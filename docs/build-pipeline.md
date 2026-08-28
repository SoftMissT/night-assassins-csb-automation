---
title: 'Pipeline de Build — Geração de Packs e ZIP'
created: '2026-08-20'
last_updated: '2026-08-20'
status: active
type: doc
tags:
    - '#projeto/night-assassins-csb-automation'
    - '#foundry/build'
    - '#foundry/pipeline'
---

# Pipeline de Build — Geração de Packs e ZIP

> [!abstract] Escopo
> Como gerar templates, compendiums (packs LevelDB) e `module.zip` **sem publicar**. O CI da release (.github/workflows/release.yml) executa exatamente esta sequência; reproduzir localmente valida antes de taggear.

## Pré-requisitos

- Node.js 24+
- `npx` disponível (usa `@foundryvtt/foundryvtt-cli@3.0.4` on-demand)
- Sem `package.json`: os scripts em `tools/` são ESM standalone

## Estrutura de diretórios

```
src/templates/actors/*.json    → fontes de template (Slayer, Oni, Oni Minion, NPC)
src/imports/*.json             → fontes de importação CSB
catalogs/*.json                → catálogos mecânicos (Respirações, armas, Oni)
build/                         → saída dos builders (gitignored)
packs/                         → compendiums LevelDB empacotados (gitignored)
module.zip                     → ZIP de distribuição (gitignored)
```

> `build/` e `packs/` são artefatos — não commitados. O CI os regenera em cada release.

## Sequência de build

### 1. Testes (gate obrigatório)

```bash
node --test
```

Nenhuma build prossegue com testes falhando. O CI rejeita a tag se `fail > 0`.

### 2. Macros → `packs/night-assassins-macros`

```bash
node tools/build-macro-sources.mjs
rm -rf packs/night-assassins-macros
npx @foundryvtt/foundryvtt-cli@3.0.4 package pack \
  --type Module \
  --id night-assassins-csb-automation \
  --compendiumName night-assassins-macros \
  --inputDirectory build/compendium/macros \
  --outputDirectory packs
```

### 3. Templates → `packs/night-assassins-templates-de-ficha`

```bash
node tools/build-template-sources.mjs
rm -rf packs/night-assassins-templates-de-ficha
npx @foundryvtt/foundryvtt-cli@3.0.4 package pack \
  --type Module \
  --id night-assassins-csb-automation \
  --compendiumName night-assassins-templates-de-ficha \
  --inputDirectory build/compendium/templates-de-ficha \
  --outputDirectory packs
```

Gera o compendium unificado com: Slayer, Oni, Oni Minion, NPC.

### 4. Respirações → `packs/night-assassins-respiracoes`

```bash
node tools/build-breathing-sources.mjs
rm -rf packs/night-assassins-respiracoes
npx @foundryvtt/foundryvtt-cli@3.0.4 package pack \
  --type Module \
  --id night-assassins-csb-automation \
  --compendiumName night-assassins-respiracoes \
  --inputDirectory build/compendium/respiracoes \
  --outputDirectory packs
```

### 5. Armas → `packs/night-assassins-armas-slayer`

```bash
node tools/build-weapon-sources.mjs
rm -rf packs/night-assassins-armas-slayer
npx @foundryvtt/foundryvtt-cli@3.0.4 package pack \
  --type Module \
  --id night-assassins-csb-automation \
  --compendiumName night-assassins-armas-slayer \
  --inputDirectory build/compendium/armas \
  --outputDirectory packs
```

### 6. Arte → `packs/night-assassins-arte`

```bash
node tools/build-asset-sources.mjs
rm -rf packs/night-assassins-arte
npx @foundryvtt/foundryvtt-cli@3.0.4 package pack \
  --type Module \
  --id night-assassins-csb-automation \
  --compendiumName night-assassins-arte \
  --inputDirectory build/compendium/artes \
  --outputDirectory packs
```

### 7. ZIP de distribuição

```bash
# module.json DEVE ser a primeira entrada
zip -r module.zip module.json scripts/ lang/ styles/ assets/ packs/ -x "*.DS_Store"
```

> O CI cria o ZIP do zero em cada release para impedir resíduos de pacotes antigos.

## Validação local sem publicar

Após a sequência acima, validar sem taggear:

```bash
# 1. Confirmar que module.json é a primeira entrada do ZIP
unzip -l module.zip | head -3

# 2. Contar packs gerados
ls -1 packs/

# 3. Desempacotar e verificar um pack (ex.: templates)
npx @foundryvtt/foundryvtt-cli@3.0.4 package unpack \
  --type Module \
  --id night-assassins-csb-automation \
  --compendiumName night-assassins-templates-de-ficha \
  --inputDirectory packs/night-assassins-templates-de-ficha \
  --outputDirectory build/verify/templates-de-ficha

# 4. Confirmar que os 4 templates estão presentes
ls build/verify/templates-de-ficha/
# Esperado: slayer_template_atual.json, oni_template.json, oni_minion_template.json, npc_template.json
```

## Build tools disponíveis

| Tool                                     | Função                                              |
| ---------------------------------------- | --------------------------------------------------- |
| `tools/build-template-sources.mjs`       | Gera templates de Actor (Slayer/Oni/Oni Minion/NPC) |
| `tools/build-macro-sources.mjs`          | Gera fontes de macros do Compendium                 |
| `tools/build-breathing-sources.mjs`      | Gera Items de Respiração (300 técnicas)             |
| `tools/build-weapon-sources.mjs`         | Gera Items de armas (43 armas)                      |
| `tools/build-asset-sources.mjs`          | Gera Items de arte (catálogo de ícones)             |
| `tools/migrate-oni-template.mjs`         | Migra template Oni legado                           |
| `tools/clean-oni-template.mjs`           | Remove heranças Slayer do template Oni              |
| `tools/build-oni-minion-template.mjs`    | Gera template Oni Minion                            |
| `tools/snapshot-compendium-catalogs.mjs` | Snapshot de catálogos para verificação              |
| `tools/compendium-catalog-utils.mjs`     | Utilidades compartilhadas de catálogo               |
| `tools/adopt-official-slayer-template.mjs` | Adota integralmente o export Slayer oficial e remove somente o botão provisório |

## O que NÃO publicar

- `src/` — fontes internas, não distribuídas
- `build/` — artefatos temporários
- `system/` — roadmap privado e blueprints (gitignored)
- `graphify-out/` — grafo gerado (gitignored)
- Arquivos de contexto local (`CURRENT_CONTEXT.md` etc. ficam no repo mas não entram no ZIP)

## Conexões

- [[../CURRENT_CONTEXT|Contexto canônico]]
- [[../ARCHITECTURE|Arquitetura]]
- [[../ROADMAP|Roadmap]]
- `.github/workflows/release.yml` — pipeline canônica de CI
