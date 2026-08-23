---
title: "SPEC — NA Action HUD"
aliases:
  - "Action HUD"
  - "HUD de Combate"
created: "2026-08-22"
status: draft
maturity: spec
type: spec
module: night-assassins-csb-automation
---

# SPEC — NA Action HUD

> HUD operacional para jogador, focado em ações rápidas do ator selecionado.
> Não substitui a ficha. Não duplica regras. Chama APIs existentes.

---

## 1. Objetivo

Um painel colapsável que expõe as ações mais usadas do Slayer/Oni durante combate, sem abrir a ficha completo. Cada botão invoca uma API já existente do módulo.

---

## 2. Princípios

| Princípio | Regra |
|-----------|-------|
| **Não substituir ficha** | HUD éatalho, não interface primária |
| **Não duplicar regra** | HUD chama `api.rollHit`, `api.rollDamage`, etc. |
| **Independente** | Sem dependência de GlitchSmith ou outros módulos |
| **Escopado** | CSS dentro de `.na-action-hud`, sem tocar em Foundry base |
| **Por cliente** | Posição/escala salva por usuário, não por mundo |
| **Favoritos** | Jogador pode fixar ações frequentes no topo |

---

## 3. Arquitetura

```
scripts/
  action-hud/
    action-hud-app.mjs        # ApplicationV2 singleton
    action-hud-data.mjs       # Builder de categorias/ações por ator
    action-hud-settings.mjs   # Settings registradas
    action-hud-favorites.mjs  # Favoritos por usuário

styles/
  na-action-hud.css           # CSS escopado
```

---

## 4. Categorias

### 4.1 Slayer

| Categoria | Ações |
|-----------|-------|
| **Ataque** | Acerto, Dano |
| **Defesa** | Bloqueio, Esquiva |
| **Respiração** | Usar Forma de Respiração (abre seletor) |
| **Arma** | Definir Arma Atual, Trocar Arma Offhand |
| **Classe** | Abrir Estados Avançados |
| **Status** | Abrir Status, Abrir Resistências, Abrir Descanso |
| **Telefone** | Abrir Telefone |
| **GM** | (somente GM) Abrir GM Dashboard |

### 4.2 Oni

| Categoria | Ações |
|-----------|-------|
| **Ataque** | Acerto, Dano |
| **Kekkijutsu** | Usar Kekkijutsu (abre seletor) |
| **Dom do Sangue** | (se aplicável) |
| **Status** | Abrir Status, Abrir Resistências |
| **Telefone** | Abrir Telefone (se ator tiver acesso) |

---

## 5. API

### 5.1 Abertura

```js
api.hud.openActionHud({ actorUuid })    // Abre/foca o HUD
api.hud.refreshActionHud({ actorUuid }) // Força refresh
api.hud.closeActionHud()                // Fecha
```

### 5.2 Favoritos

```js
api.hud.setFavoriteAction({ actorUuid, actionId })
api.hud.clearFavoriteAction({ actorUuid, actionId })
api.hud.getFavorites({ actorUuid }) // => string[]
```

### 5.3 Layout

```js
api.hud.setHudLayout({ userId, layout }) // { position, scale, collapsedCategories }
api.hud.getHudLayout({ userId })
```

### 5.4 Ações internas (chamadas pelo HUD)

```js
api.rollHit({ actorUuid })
api.rollDamage({ actorUuid })
api.useBreathForm({ actorUuid })
api.slayer.setCurrentWeapon({ actorUuid, weaponUuid, slot })
api.slayer.getCurrentWeapon({ actorUuid })
api.slayer.openAdvancedStatesManager({ actorUuid })
api.openPhoneChat({})
api.openStatusManager({ actorUuid })
api.openResistanceManager({ actorUuid })
api.openRestManager({ actorUuid })
api.oni.kekkijutsu({ actorUuid }) // abre seletor
```

---

## 6. Dados

### 6.1 Flags por usuário (layout)

```js
actor.flags["night-assassins-csb-automation"].actionHudLayout = {
  position: { top: 100, left: 200 },
  scale: 1,
  collapsedCategories: ["status", "telefone"],
}
```

### 6.2 Favoritos por ator

```js
actor.flags["night-assassins-csb-automation"].actionHudFavorites = [
  "hit",
  "damage",
  "breath-form",
  "current-weapon",
]
```

---

## 7. CSS

### 7.1 Escopo obrigatório

```css
.na-action-hud {}           /* Container principal */
.na-action-hud__header {}   /* Título + botão fechar */
.na-action-hud__category {} /* Categoria colapsável */
.na-action-hud__action {}   /* Botão de ação */
.na-action-hud__favorites {} /* Seção de favoritos */
.na-action-hud__weapon {}   /* Arma atual display */
.na-action-hud__resource {} /* Barra de recurso (PDR, PDV) */
```

### 7.2 Proibido

```css
button {} /* global */
input {} /* global */
.hotbar {}
.compendium {}
```

---

## 8. Settings

```js
enableActionHud          // Boolean, default true
actionHudDefaultScale    // Number, default 1
actionHudShowOnCombat    // Boolean, default true — abre automaticamente em combate
```

---

## 9. Comportamento

### 9.1 Abertura

- **Jogador**: abre via macro ou atalho
- **GM**: abre para o ator selecionado no token
- **Em combate**: abre automaticamente se `actionHudShowOnCombat` true
- **Fora de combate**: opcional

### 9.2 Arma atual

- HUD exibe arma atual do Slayer (se existir)
- Exibe munição se aplicável
- Exibe propriedades principais
- Botão "Trocar" abre seletor de armas
- Se arma foi deletada, exibe aviso

### 9.3 Colapsar categorias

- Categorias colapsam por clique no header
- Estado salvo por usuário

### 9.4 Favoritos

- Botão ★ em cada ação
- Favoritos aparecem no topo do HUD
- Máximo 8 favoritos

---

## 10. Testes

| Teste | O que valida |
|-------|-------------|
| `action-hud-data.test.mjs` | Builder de categorias por tipo de ator |
| `action-hud-favorites.test.mjs` | CRUD de favoritos |
| `action-hud-settings.test.mjs` | Registro de settings |
| `css-scope.test.mjs` | CSS não Seleciona globais |

---

## 11. Entregáveis

- [ ] `scripts/action-hud/action-hud-app.mjs`
- [ ] `scripts/action-hud/action-hud-data.mjs`
- [ ] `scripts/action-hud/action-hud-settings.mjs`
- [ ] `scripts/action-hud/action-hud-favorites.mjs`
- [ ] `styles/na-action-hud.css`
- [ ] `tests/action-hud-data.test.mjs`
- [ ] `tests/action-hud-favorites.test.mjs`
- [ ] `tests/action-hud-settings.test.mjs`
- [ ] Integrar em `main.mjs` (api.hud)
- [ ] Integrar em `module.json` (CSS)
- [ ] Macro no compendium
