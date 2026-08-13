import { parseNumber } from "./parsing.mjs";
import { actorKind } from "./actor-kind.mjs";

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

function firstDefined(props, keys) {
  for (const key of keys) if (props[key] !== undefined && props[key] !== null && props[key] !== "") return props[key];
  return 0;
}

function combatantsOf(combat) {
  if (!combat?.combatants) return [];
  if (Array.isArray(combat.combatants.contents)) return combat.combatants.contents;
  return [...combat.combatants];
}

function actorFromCombatant(combatant) {
  return combatant?.actor ?? combatant?.token?.actor ?? null;
}

function fallbackCombatantData(combatant, actor) {
  const hostile = Number(combatant?.token?.disposition ?? combatant?.disposition) < 0;
  const kind = hostile ? "oni" : "hunter";
  const name = cleanText(combatant?.name) || cleanText(actor?.name) || (hostile ? "Oni sem nome" : "Slayer sem nome");
  return {
    actor,
    kind,
    name,
    image: combatant?.img || combatant?.token?.texture?.src || actor?.img || "icons/svg/mystery-man.svg",
    pdv: resourceFromValues(0, 0),
    pdr: resourceFromValues(0, 0),
  };
}

export function hunterData(actor) {
  const props = actor.system?.props ?? {};
  if (actorKind(actor) !== "slayer") return null;
  const name = cleanText(props.nome_slayer) || cleanText(actor.name) || "Slayer sem nome";
  const pdvMax = firstDefined(props, ["pdv_slayer_total_conta", "pdv_slayer_total_valor"]);
  const pdvCurrent = firstDefined(props, ["pdv_slayer_conta_atual", "pdv_slayer_atual_valor_display"]);
  const pdrMax = firstDefined(props, ["pdr_slayer_total_conta", "pdr_slayer_total_valor"]);
  const pdrCurrent = firstDefined(props, ["pdr_slayer_conta_atual", "pdr_slayer_atual_valor_display"]);

  return {
    actor,
    kind: "hunter",
    name,
    image: actor.img || "icons/svg/mystery-man.svg",
    pdv: resourceFromValues(pdvCurrent, pdvMax),
    pdr: resourceFromValues(pdrCurrent, pdrMax),
  };
}

export function oniData(actor) {
  const props = actor.system?.props ?? {};
  if (actorKind(actor) !== "oni") return null;

  const name = cleanText(props.nome_oni) || cleanText(actor.name) || "Oni sem nome";
  const pdvMax = Math.max(0, parseNumber(firstDefined(props, ["pdv_oni_total_conta", "pdv_oni_total_valor", "pdv_total_valor"])));
  const pdvCurrent = firstDefined(props, ["pdv_oni_conta_atual", "pdv_oni_atual_valor_display", "pdv_atual_valor", "pdv_conta_prov"])
    || Math.max(0, pdvMax - parseNumber(props.pdv_oni_dano_tomado));
  const pdkMax = Math.max(0, parseNumber(firstDefined(props, ["pdk_oni_total_conta", "pdk_oni_total_valor", "pdr_oni_total_valor", "pdr_total_valor"])));
  const pdkCurrent = firstDefined(props, ["pdk_oni_conta_atual", "pdk_oni_atual_valor_display", "pdr_oni_atual_valor_display", "pdr_atual_valor", "pdr_conta_prov"])
    || Math.max(0, pdkMax - parseNumber(firstDefined(props, ["pdk_oni_gasto_valor", "pdr_oni_gasto_valor", "pdr_gasto_valor"])));

  return {
    actor,
    kind: "oni",
    name,
    image: actor.img || "icons/svg/mystery-man.svg",
    pdv: resourceFromValues(pdvCurrent, pdvMax),
    pdr: resourceFromValues(pdkCurrent, pdkMax),
  };
}

function resourceBar(label, data, tone) {
  const empty = data.current <= 0 ? " is-empty" : "";
  return `<div class="na-gm-mini-resource na-gm-mini-resource--${tone}${empty}">
    <div class="na-gm-mini-resource-line"><span>${label}</span><strong>${data.current}<small>/ ${data.max}</small></strong></div>
    <div class="na-gm-mini-track"><i style="width:${data.percent.toFixed(2)}%"></i></div>
  </div>`;
}

function combatantRow({ actor, kind, name, pdv, pdr }) {
  return `<article class="na-gm-mini-row na-gm-mini-row--${kind}" data-search="${escapeHtml(`${name} ${actor.name}`.toLocaleLowerCase("pt-BR"))}">
    <div class="na-gm-mini-name"><small>${kind === "oni" ? "ONI" : "CAÇADOR"}</small><strong>${escapeHtml(name)}</strong></div>
    <div class="na-gm-mini-resources">${resourceBar("PDV", pdv, "pdv")}${resourceBar(kind === "oni" ? "PDK" : "PDR", pdr, "pdr")}</div>
    <button type="button" class="na-gm-open-sheet" data-actor-uuid="${escapeHtml(actor.uuid)}" title="Abrir ficha"><i class="fa-solid fa-arrow-up-right-from-square"></i></button>
  </article>`;
}

function section(title, icon, entries, kind) {
  const rows = entries.map(combatantRow).join("");
  const emptyLabel = kind === "oni" ? "Nenhum Oni identificado pelas keys *_oni*." : "Nenhum Slayer identificado pelas keys *_slayer*.";
  return `<section class="na-gm-mini-section na-gm-mini-section--${kind}">
    <header><h3><i class="${icon}"></i>${title}</h3><span>${entries.length}</span></header>
    <div class="na-gm-mini-list">${rows || `<div class="na-gm-mini-empty">${emptyLabel}</div>`}</div>
  </section>`;
}

export function loadDashboardData(combat = game.combat) {
  const entries = combatantsOf(combat).map((combatant) => {
    const actor = actorFromCombatant(combatant);
    if (!actor) return null;
    return hunterData(actor) ?? oniData(actor) ?? fallbackCombatantData(combatant, actor);
  }).filter(Boolean);
  const hunters = entries.filter((entry) => entry.kind === "hunter").sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const onis = entries.filter((entry) => entry.kind === "oni").sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
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
        <button type="button" class="na-gm-minimize" title="Minimizar"><i class="fa-solid fa-window-minimize"></i></button>
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
  root.querySelector(".na-gm-minimize")?.addEventListener("click", () => void dialog.minimize());
  root.querySelector(".na-gm-close")?.addEventListener("click", () => void dialog.close());
  bindRowActions(root);

  let refreshTimer = null;
  const updateHook = Hooks.on("updateActor", () => {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => refreshDashboard(root), 120);
  });
  const combatHook = Hooks.on("updateCombat", () => {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => refreshDashboard(root), 50);
  });
  const combatantHook = Hooks.on("updateCombatant", () => {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => refreshDashboard(root), 50);
  });
  const createCombatantHook = Hooks.on("createCombatant", () => {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => refreshDashboard(root), 50);
  });
  const deleteCombatantHook = Hooks.on("deleteCombatant", () => {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => refreshDashboard(root), 50);
  });
  Hooks.once("closeDialogV2", (app) => {
    if (app !== dialog) return;
    clearTimeout(refreshTimer);
    Hooks.off("updateActor", updateHook);
    Hooks.off("updateCombat", combatHook);
    Hooks.off("updateCombatant", combatantHook);
    Hooks.off("createCombatant", createCombatantHook);
    Hooks.off("deleteCombatant", deleteCombatantHook);
    if (window.__NAGmDashboard === dialog) window.__NAGmDashboard = null;
  });

  requestAnimationFrame(() => dialog.setPosition({ width: Math.min(780, window.innerWidth - 40), height: Math.min(640, window.innerHeight - 60) }));
}

export async function openGmDashboard() {
  if (!game.user?.isGM) return ui.notifications.error("Somente o GM pode abrir o Controle de Combate.");

  if (window.__NAGmDashboard) {
    try { await window.__NAGmDashboard.close(); } catch (_) { /* janela anterior já fechada */ }
  }

  const DialogV2 = foundry.applications.api.DialogV2;
  let dialog;
  dialog = new DialogV2({
    window: { title: "Controle GM Night Assassins", minimizable: true },
    classes: ["na-gm-dashboard-window"],
    position: { width: Math.min(780, window.innerWidth - 40), height: Math.min(640, window.innerHeight - 60) },
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
