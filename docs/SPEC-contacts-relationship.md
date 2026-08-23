---
title: "SPEC — NA Contacts / Relationship / Dossier Layer"
aliases:
  - "Contacts"
  - "Relationship"
  - "Dossier"
  - "Contatos"
  - "Vínculos"
created: "2026-08-22"
status: draft
maturity: spec
type: spec
module: night-assassins-csb-automation
---

# SPEC — NA Contacts / Relationship / Dossier Layer

> Camada de contatos/vínculos para Night Assassins.
> Dados vivem no Actor. GM é autoridade. Integra com NA Phone.

---

## 1. Objetivo

Um sistema de dossiê vivo por ator onde:
- Cada Slayer/Oni pode ter contatos (NPCs, outros jogadores, facções)
- Cada contato tem vínculo/rank, retrato, bio, notas e event log
- GM controla autoria e visibilidade
- Phone consome contatos para exibir conversas

---

## 2. Princípios

| Princípio | Regra |
|-----------|-------|
| **Dados por Actor** | Flags no Actor, não em settings globais |
| **GM é autoridade** | Jogador não edita vínculos sem permissão |
| **Visibilidade granular** | pública / owner / gm / redacted / hidden |
| **Integra com Phone** | Contatos aparecem no app Contatos do Phone |
| **Sync por socket** | GM sincroniza com jogadores via socket |
| **Independente** | Sem dependência de GlitchSmith |

---

## 3. Arquitetura

```
scripts/
  contacts/
    contacts-service.mjs      # CRUD de contatos + vínculos
    contacts-dossier.mjs      # Dossiê (notas, eventos)
    contacts-permissions.mjs  # Visibilidade
    contacts-sync.mjs         # Sync via socket

styles/
  na-relationship.css         # CSS escopado
```

---

## 4. Flags no Actor

### 4.1 Contatos

```js
actor.flags["night-assassins-csb-automation"].contacts = [
  {
    id: "contact-001",
    actorUuid: "Actor.npc-yuko",          // vinculação opcional
    displayName: "Yuko",
    phoneAlias: "Yuko (Mestre)",          // nome exibido no Phone
    portrait: "systems/night-assassins-csb-automation/assets/portraits/yuko.webp",
    role: "mentora",                       // livre
    relationshipType: "mentor",            // livre
    rank: 3,                               // 0-5
    maxRank: 5,
    progress: 60,                          // 0-100
    visibility: "public",                  // public | owner | gm | redacted | hidden
    notes: "Mestra da Respiração da Água...",
    lastContactAt: 1724000000000,
  },
]
```

### 4.2 Eventos

```js
actor.flags["night-assassins-csb-automation"].relationshipEvents = [
  {
    id: "evt-001",
    contactId: "contact-001",
    dateLabel: "Dia 3 — Treinamento",
    title: "Primeira lição",
    rankLabel: "Rank 2 → Rank 3",
    quote: "A água não força, ela molda.",
    text: "Yuko ensinou a forma básica...",
    image: "",
    visibility: "public",
    createdBy: "gm",
    createdAt: 1724000000000,
  },
]
```

### 4.3 Notas do Dossiê

```js
actor.flags["night-assassins-csb-automation"].dossierNotes = [
  {
    id: "note-001",
    contactId: "contact-001",
    title: "Segredo de Yuko",
    text: "Ela conhece o verdadeiro nome do Oni...",
    visibility: "gm",     // somente GM vê
    createdAt: 1724000000000,
  },
]
```

---

## 5. API

### 5.1 Contatos

```js
api.contacts.getContacts({ actorUuid })           // => Contact[]
api.contacts.getContact({ actorUuid, contactId }) // => Contact | null
api.contacts.createContact({ actorUuid, data })   // => Contact
api.contacts.updateContact({ actorUuid, contactId, patch }) // => Contact
api.contacts.deleteContact({ actorUuid, contactId }) // => { ok }
```

### 5.2 Eventos

```js
api.contacts.getEvents({ actorUuid, contactId })  // => Event[]
api.contacts.createEvent({ actorUuid, contactId, data }) // => Event
api.contacts.deleteEvent({ actorUuid, eventId }) // => { ok }
```

### 5.3 Dossiê

```js
api.contacts.getNotes({ actorUuid, contactId })   // => Note[]
api.contacts.createNote({ actorUuid, contactId, data }) // => Note
api.contacts.updateNote({ actorUuid, noteId, patch })   // => Note
api.contacts.deleteNote({ actorUuid, noteId })   // => { ok }
```

### 5.4 Visibilidade

```js
api.contacts.filterVisible({ actorUuid, userId, isGM }) // => Contact[]
```

### 5.5 Sync

```js
api.contacts.syncContacts({ actorUuid }) // GM envia snapshot filtrado para jogadores
```

---

## 6. Visibilidade

| Valor | Quem vê | Uso |
|-------|---------|-----|
| `public` | Todos | Contato conhecido publicamente |
| `owner` | Somente owner do Actor | Contato pessoal |
| `gm` | Somente GM | Informação restrita |
| `redacted` | Ninguém (oculto) | Dados bloqueados |
| `hidden` | Nenhum (nem GM) | Removido temporariamente |

**Regras:**
- GM sempre vê tudo (exceto `hidden`)
- Jogador vê `public` + `owner` (se for owner)
- `gm` é oculto para jogadores
- `redacted` aparece como "[REDACTED]" para jogadores

---

## 7. Integração com Phone

### 7.1 Fluxo

```
Contato visível
→ aparece no app Contatos do Phone
→ pode abrir Dossiê
→ pode abrir conversa
→ conversa mostra alias/retrato
→ unread aparece por contato
```

### 7.2 Conversa vinculada

Cada contato pode ter uma conversa ativa no Phone:

```js
// Na conversa do Phone:
conversation.contactIds = ["contact-001"]
conversation.displayName = "Yuko" // ou contact.phoneAlias
```

### 7.3 GM cria conversa a partir de:

- Actor (NPC)
- Contato existente
- Remetente virtual (sem Actor)
- Grupo (múltiplos contatos)

---

## 8. GM Manager

### 8.1 O que o GM pode fazer

| Ação | Descrição |
|------|-----------|
| Criar contato | Com ou sem vinculação a Actor |
| Editar nome/retrato/role | Qualquer campo |
| Definir visibilidade | Qualquer valor |
| Criar evento | Com data, título, quote, texto |
| Criar nota de dossiê | Com visibilidade |
| Marcar redacted/hidden | Ocultar dados |
| Sincronizar com Phone | Envia snapshot filtrado |

### 8.2 O que o jogador pode fazer

| Ação | Descrição |
|------|-----------|
| Ver contatos liberados | `public` + `owner` |
| Abrir dossiê | Somente notas visíveis |
| Mandar mensagem | Se contato tiver conversa ativa |
| Ver eventos player-visible | `public` + `owner` |

### 8.3 O que o jogador NÃO pode fazer

| Ação | Descrição |
|------|-----------|
| Editar vínculos | Sem permissão |
| Ver notas GM-only | Bloqueado |
| Alterar rank | Sem autorização |

---

## 9. CSS

### 9.1 Escopo obrigatório

```css
.na-relationship-archive {}    /* Lista de contatos */
.na-relationship-manager {}    /* GM Manager */
.na-relationship-dossier {}    /* Dossiê de um contato */
.na-relationship-event {}      /* Evento individual */
.na-relationship-note {}       /* Nota individual */
.na-relationship-rank {}       /* Indicador de rank */
```

### 9.2 Proibido

```css
button {} /* global */
input {} /* global */
.window-app {}
.dialog {}
```

---

## 10. Settings

```js
enableContacts        // Boolean, default true
contactsDefaultView   // "list" | "grid", default "list"
contactsShowInPhone   // Boolean, default true — exibe aba Contatos no Phone
```

---

## 11. Testes

| Teste | O que valida |
|-------|-------------|
| `contacts-service.test.mjs` | CRUD de contatos |
| `contacts-dossier.test.mjs` | CRUD de eventos e notas |
| `contacts-permissions.test.mjs` | Filtragem por visibilidade |
| `contacts-sync.test.mjs` | Sync via socket |
| `contacts-integration.test.mjs` | Integração com Phone |

---

## 12. Entregáveis

- [ ] `scripts/contacts/contacts-service.mjs`
- [ ] `scripts/contacts/contacts-dossier.mjs`
- [ ] `scripts/contacts/contacts-permissions.mjs`
- [ ] `scripts/contacts/contacts-sync.mjs`
- [ ] `styles/na-relationship.css`
- [ ] `tests/contacts-service.test.mjs`
- [ ] `tests/contacts-dossier.test.mjs`
- [ ] `tests/contacts-permissions.test.mjs`
- [ ] Integrar em `main.mjs` (api.contacts)
- [ ] Integrar em `module.json` (CSS)
- [ ] Integrar com Phone (aba Contatos)
- [ ] Integrar com Phone (conversa vinculada)
