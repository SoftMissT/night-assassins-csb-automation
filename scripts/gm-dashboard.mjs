import { parseNumber } from "./parsing.mjs";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function cleanText(value) {
  return String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function resourceFromValues(currentValue, maxValue) {
  const max = Math.max(0, parseNumber(maxValue));
  const current = Math.max(0, parseNumber(currentValue));
  const percent = max > 0 ? Math.min(100, Math.max(0, (current / max) * 100)) : 0;
  return { current, max, percent };
}

export function hunterData(actor) {
  const props = actor.system?.props ?? {};
  const name = cleanText(props.nome_slayer);
  if (!name) return null;

  return {
    actor,
    kind: "hunter",
    name,
    image: actor.img || "icons/svg/mystery-man.svg",
    pdv: resourceFromValues(props.pdv_slayer_atual_valor_display, props.pdv_slayer_total_valor),
    pdr: resourceFromValues(props.pdr_slayer_atual_valor_display, props.pdr_slayer_total_valor),
  };
}

export function oniData(actor) {
  const props = actor.system?.props ?? {};
  const hasOniData = Object.keys(props).some((key) => key.includes("oni"));
  if (!hasOniData || props.nome_slayer) return null;

  const name = cleanText(props.nome_oni) || cleanText(actor.name) || "Oni sem nome";
  const pdvMax = Math.max(0, parseNumber(props.pdv_oni_total_valor));
  const pdvCurrent = props.pdv_oni_atual_valor_display !== undefined
    ? props.pdv_oni_atual_valor_display
    : Math.max(0, pdvMax - parseNumber(props.pdv_oni_dano_tomado));
  const pdrMax = Math.max(0, parseNumber(props.pdr_oni_total_valor));
  const pdrCurrent = props.pdr_oni_atual_valor_display !== undefined
    ? props.pdr_oni_atual_valor_display
    : Math.max(0, pdrMax - parseNumber(props.pdr_oni_gasto_valor));

  return {
    actor,
    kind: "oni",
    name,
    image: actor.img || "icons/svg/mystery-man.svg",
    pdv: resourceFromValues(pdvCurrent, pdvMax),
    pdr: resourceFromValues(pdrCurrent, pdrMax),
  };
}

function resourceBar(label, data, tone) {
  const empty = data.current <= 0 ? " is-empty" : "";
  return `<div class="na-gm-mini-resource na-gm-mini-resource--${tone}${empty}">
    <div class="na-gm-mini-resource-line"><span>${label}</span><strong>${data.current}<small>/ ${data.max}</small></strong></div>
    <div class="na-gm-mini-track"><i style="width:${data.percent.toFixed(2)}%"></i></div>
  </div>`;
}

function combatantRow({ actor, kind, name, image, pdv, pdr }) {
  return `<article class="na-gm-mini-row na-gm-mini-row--${kind}" data-search="${escapeHtml(`${name} ${actor.name}`.toLocaleLowerCase("pt-BR"))}">
    <img src="${escapeHtml(image)}" alt="" />
    <div class="na-gm-mini-name"><small>${kind === "oni" ? "ONI" : "CAÇADOR"}</small><strong>${escapeHtml(name)}</strong></div>
    <div class="na-gm-mini-resources">${resourceBar("PDV", pdv, "pdv")}${resourceBar("PDR", pdr, "pdr")}</div>
    <button type="button" class="na-gm-open-sheet" data-actor-uuid="${escapeHtml(actor.uuid)}" title="Abrir ficha"><i class="fa-solid fa-arrow-up-right-from-square"></i></button>
  </article>`;
}

function section(title, icon, entries, kind) {
  const rows = entries.map(combatantRow).join("");
  const emptyLabel = kind === "oni" ? "Nenhum Oni identificado pelas keys *_oni*." : "Nenhum Slayer com nome_slayer.";
  return `<section class="na-gm-mini-section na-gm-mini-section--${kind}">
    <header><h3><i class="${icon}"></i>${title}</h3><span>${entries.length}</span></header>
    <div class="na-gm-mini-list">${rows || `<div class="na-gm-mini-empty">${emptyLabel}</div>`}</div>
  </section>`;
}

function loadDashboardData() {
  const actors = game.actors.contents;
  const hunters = actors.map(hunterData).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const onis = actors.map(oniData).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  return { hunters, onis };
}

function dashboardSections({ hunters, onis }) {
  return `${section("Caçadores", "fa-solid fa-user-shield", hunters, "hunter")}${section("Inimigos", "fa-solid fa-skull", onis, "oni")}`;
}

function renderDashboard(data) {
  return `<section class="na-gm-mini-board">
    <header class="na-gm-mini-hero">
      <div><small>VISÃO DO MESTRE</small><h2>Controle de Combate</h2></div>
      <div class="na-gm-mini-actions">
        <button type="button" class="na-gm-refresh" title="Atualizar"><i class="fa-solid fa-rotate"></i></button>
        <button type="button" class="na-gm-close" title="Fechar"><i class="fa-solid fa-xmark"></i></button>
      </div>
    </header>
    <label class="na-gm-mini-search"><i class="fa-solid fa-magnifying-glass"></i><input type="search" placeholder="Buscar personagem..." autocomplete="off" /></label>
    <div class="na-gm-mini-sections">${dashboardSections(data)}</div>
  </section>`;
}

function bindRowActions(root) {
  for (const button of root.querySelectorAll(".na-gm-open-sheet")) {
    button.addEventListener("click", async () => {
      const actor = await fromUuid(button.dataset.actorUuid);
      actor?.sheet?.render(true);
    });
  }
}

function filterRows(root) {
  const query = root.querySelector(".na-gm-mini-search input")?.value.trim().toLocaleLowerCase("pt-BR") ?? "";
  for (const row of root.querySelectorAll(".na-gm-mini-row")) {
    row.hidden = Boolean(query) && !row.dataset.search.includes(query);
  }
}

function refreshDashboard(root) {
  const container = root.querySelector(".na-gm-mini-sections");
  if (container) container.innerHTML = dashboardSections(loadDashboardData());
  bindRowActions(root);
  filterRows(root);
}

function bindDashboard(dialog, element) {
  const root = element instanceof HTMLElement ? element : element?.[0];
  if (!root) return;

  root.querySelector(".na-gm-mini-search input")?.addEventListener("input", () => filterRows(root));
  root.querySelector(".na-gm-refresh")?.addEventListener("click", () => refreshDashboard(root));
  root.querySelector(".na-gm-close")?.addEventListener("click", () => void dialog.close());
  bindRowActions(root);

  let refreshTimer = null;
  const updateHook = Hooks.on("updateActor", () => {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => refreshDashboard(root), 120);
  });
  Hooks.once("closeDialogV2", (app) => {
    if (app !== dialog) return;
    clearTimeout(refreshTimer);
    Hooks.off("updateActor", updateHook);
    if (window.__NAGmDashboard === dialog) window.__NAGmDashboard = null;
  });

  requestAnimationFrame(() => dialog.setPosition({ width: Math.min(680, window.innerWidth - 40), height: Math.min(640, window.innerHeight - 60) }));
}

export async function openGmDashboard() {
  if (!game.user?.isGM) return ui.notifications.error("Somente o GM pode abrir o Controle de Combate.");

  if (window.__NAGmDashboard) {
    try { await window.__NAGmDashboard.close(); } catch (_) { /* janela anterior já fechada */ }
  }

  const DialogV2 = foundry.applications.api.DialogV2;
  let dialog;
  dialog = new DialogV2({
    window: { title: "Controle GM — Night Assassins" },
    classes: ["na-gm-dashboard-window"],
    position: { width: Math.min(680, window.innerWidth - 40), height: Math.min(640, window.innerHeight - 60) },
    modal: false,
    content: renderDashboard(loadDashboardData()),
    buttons: [
      { action: "close", label: "Fechar", default: true, callback: () => void dialog.close() },
    ],
  });

  Hooks.once("renderDialogV2", (app, element) => {
    if (app === dialog) bindDashboard(dialog, element);
  });

  window.__NAGmDashboard = dialog;
  dialog.render({ force: true });
  return dialog;
}
