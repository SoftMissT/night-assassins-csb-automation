import { parseNumber } from "./parsing.mjs";

const ABILITY_LABELS = Object.freeze({
  hab_escolhida_sem: "Sem Habilidade",
  hab_escolhida_tato: "Tato Sensitivo",
  hab_escolhida_audicao: "Audição Sobrenatural",
  hab_escolhida_visao: "Visão Aguçada",
  hab_escolhida_olfato: "Olfato Sobrenatural",
  hab_escolhida_metamorfose: "Metamorfose Carnívora",
  hab_escolhida_transfor: "Transformação Demoníaca",
  hab_escolhida_tsuyoi: "Tsuyoi",
  hab_escolhida_marechi: "Marechi",
  hab_escolhida_oketsu: "Oketsu",
  hab_escolhida_marca_destino: "Marca do Destino",
});

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function cleanText(value) {
  return String(value ?? "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim();
}

function cleanChoice(value, prefix, labels = {}) {
  const raw = cleanText(value);
  if (!raw) return "Não definido";
  if (labels[raw]) return labels[raw];
  return raw
    .replace(new RegExp(`^${prefix}_?`, "i"), "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function resource(props, currentKey, maxKey) {
  const max = Math.max(0, parseNumber(props[maxKey]));
  const current = Math.max(0, parseNumber(props[currentKey]));
  const percent = max > 0 ? Math.min(100, Math.max(0, (current / max) * 100)) : 0;
  return { current, max, percent };
}

export function hunterData(actor) {
  const props = actor.system?.props ?? {};
  const name = cleanText(props.nome_cacador);
  if (!name) return null;

  return {
    actor,
    name,
    image: actor.img || "icons/svg/mystery-man.svg",
    pdv: resource(props, "pdv_atual_valor_display", "pdv_total_valor"),
    pdr: resource(props, "pdr_atual_valor_display", "pdr_total_valor"),
    ability: cleanChoice(props.hab_escolhida, "hab_escolhida", ABILITY_LABELS),
    metal: cleanChoice(props.metal_escolhido, "metal"),
  };
}

function resourceBar(label, data, tone) {
  const empty = data.current <= 0 ? " is-empty" : "";
  return `<div class="na-gm-resource na-gm-resource--${tone}${empty}">
    <div class="na-gm-resource-line"><span>${label}</span><strong>${data.current}<small>/ ${data.max}</small></strong></div>
    <div class="na-gm-track"><i style="width:${data.percent.toFixed(2)}%"></i></div>
    <em>${Math.round(data.percent)}%</em>
  </div>`;
}

function hunterCard({ actor, name, image, pdv, pdr, ability, metal }) {
  const search = `${name} ${actor.name} ${ability} ${metal}`.toLocaleLowerCase("pt-BR");
  return `<article class="na-gm-card" data-search="${escapeHtml(search)}">
    <div class="na-gm-card-accent"></div>
    <header class="na-gm-card-head">
      <img src="${escapeHtml(image)}" alt="" />
      <div class="na-gm-identity"><small>CAÇADOR</small><h3>${escapeHtml(name)}</h3><span>${escapeHtml(actor.name)}</span></div>
      <button type="button" class="na-gm-open-sheet" data-actor-uuid="${escapeHtml(actor.uuid)}" title="Abrir ficha"><i class="fa-solid fa-user-pen"></i></button>
    </header>
    <div class="na-gm-resources">${resourceBar("PDV", pdv, "pdv")}${resourceBar("PDR", pdr, "pdr")}</div>
    <footer class="na-gm-card-meta">
      <div><small>HABILIDADE ESPECIAL</small><strong>${escapeHtml(ability)}</strong></div>
      <div><small>METAL / COR</small><strong>${escapeHtml(metal)}</strong></div>
    </footer>
  </article>`;
}

function renderDashboard(hunters) {
  const cards = hunters.map(hunterCard).join("");
  return `<section class="na-gm-board">
    <header class="na-gm-hero">
      <div><small>VISÃO TÁTICA DO MESTRE</small><h2>Controle dos Caçadores</h2><p>Recursos e identidade de combate em tempo real.</p></div>
      <div class="na-gm-count"><strong>${hunters.length}</strong><span>Caçadores</span></div>
    </header>
    <div class="na-gm-toolbar">
      <label><i class="fa-solid fa-magnifying-glass"></i><input type="search" class="na-gm-search" placeholder="Buscar caçador, habilidade ou metal..." autocomplete="off" /></label>
      <span class="na-gm-visible-count">${hunters.length} visíveis</span>
    </div>
    <div class="na-gm-grid">${cards || '<div class="na-gm-empty"><i class="fa-solid fa-user-slash"></i><strong>Nenhum Caçador encontrado</strong><span>Preencha a key nome_cacador nas fichas dos jogadores.</span></div>'}</div>
  </section>`;
}

function bindDashboard(dialog, element) {
  const root = element instanceof HTMLElement ? element : element?.[0];
  if (!root) return;

  const cards = [...root.querySelectorAll(".na-gm-card")];
  const visibleCount = root.querySelector(".na-gm-visible-count");
  root.querySelector(".na-gm-search")?.addEventListener("input", (event) => {
    const query = event.currentTarget.value.trim().toLocaleLowerCase("pt-BR");
    let visible = 0;
    for (const card of cards) {
      const show = !query || card.dataset.search.includes(query);
      card.hidden = !show;
      if (show) visible += 1;
    }
    if (visibleCount) visibleCount.textContent = `${visible} visíveis`;
  });

  for (const button of root.querySelectorAll(".na-gm-open-sheet")) {
    button.addEventListener("click", async () => {
      const actor = await fromUuid(button.dataset.actorUuid);
      actor?.sheet?.render(true);
    });
  }

  requestAnimationFrame(() => dialog.setPosition({ width: Math.min(1120, window.innerWidth - 80), height: Math.min(820, window.innerHeight - 80) }));
}

export async function openGmDashboard() {
  if (!game.user?.isGM) return ui.notifications.error("Somente o GM pode abrir o Controle dos Caçadores.");

  if (window.__NAGmDashboard) {
    try { await window.__NAGmDashboard.close(); } catch (_) { /* janela antiga já fechada */ }
  }

  const hunters = game.actors.contents.map(hunterData).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const DialogV2 = foundry.applications.api.DialogV2;
  const dialog = new DialogV2({
    window: { title: "Controle GM — Night Assassins" },
    classes: ["na-gm-dashboard-window"],
    position: { width: Math.min(1120, window.innerWidth - 80), height: Math.min(820, window.innerHeight - 80) },
    modal: false,
    content: renderDashboard(hunters),
    buttons: [
      { action: "close", label: "Fechar", callback: () => "close" },
      { action: "refresh", label: "Atualizar dados", default: true, callback: () => void openGmDashboard() },
    ],
  });

  Hooks.once("renderDialogV2", (app, element) => {
    if (app === dialog) bindDashboard(dialog, element);
  });

  window.__NAGmDashboard = dialog;
  dialog.render({ force: true });
  return dialog;
}
