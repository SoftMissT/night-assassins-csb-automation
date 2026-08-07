import { ATTRIBUTES } from "./constants.mjs";
import { parseLevel, parseNumber } from "./parsing.mjs";

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

function firstValue(props, keys, fallback = "") {
  for (const key of keys) {
    const value = props[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return fallback;
}

function numericLevel(value) {
  return Math.max(0, parseLevel(value));
}

export function hunterData(actor) {
  const props = actor.system?.props ?? {};
  const name = cleanText(props.nome_cacador);
  if (!name) return null;

  const attributes = Object.fromEntries(
    ATTRIBUTES.map(({ key }) => [key, parseNumber(props[`${key}_display`])])
  );

  const pdr = resource(props, "pdr_atual_valor_display", "pdr_total_valor");
  const pdrSpent = Math.max(0, parseNumber(props.pdr_gasto_valor));

  return {
    actor,
    name,
    image: actor.img || "icons/svg/mystery-man.svg",
    pdv: resource(props, "pdv_atual_valor_display", "pdv_total_valor"),
    pdr: { ...pdr, spent: pdrSpent },
    level: numericLevel(firstValue(props, ["nvl_num", "nvl_pj", "nvl_atual"])),
    breathLevel: numericLevel(props.nvl_respiracao_num),
    className: cleanChoice(props.classe_escolhida, "classe"),
    origin: cleanChoice(props.origem_dropdown, "origem"),
    breath: cleanChoice(firstValue(props, ["respiracao_escolhida", "respiracao", "resp_escolhida"]), "respiracao"),
    attributes,
    dodge: `1d20 + ${attributes.dex}`,
    block: `1d20 + ${attributes.for}`,
    ability: cleanChoice(props.hab_escolhida, "hab_escolhida", ABILITY_LABELS),
    metal: cleanChoice(props.metal_escolhido, "metal"),
  };
}

function resourceCell(data, tone) {
  const empty = data.current <= 0 ? " is-empty" : "";
  return `<div class="na-gm-table-resource na-gm-table-resource--${tone}${empty}">
    <div><strong>${data.current}</strong><small>/ ${data.max}</small></div>
    <div class="na-gm-track"><i style="width:${data.percent.toFixed(2)}%"></i></div>
  </div>`;
}

function hunterRow(data) {
  const { actor, name, image, pdv, pdr, level, breathLevel, className, origin, breath, attributes, dodge, block, ability, metal } = data;
  const search = `${name} ${actor.name} ${className} ${origin} ${breath} ${ability} ${metal}`.toLocaleLowerCase("pt-BR");
  const attrCells = ATTRIBUTES.map(({ key, label }) =>
    `<td class="na-gm-attr na-gm-attr--${key}" title="${label}">${attributes[key]}</td>`
  ).join("");

  return `<tr class="na-gm-row" data-search="${escapeHtml(search)}">
    <td class="na-gm-person-cell">
      <img src="${escapeHtml(image)}" alt="" />
      <div><strong>${escapeHtml(name)}</strong><small title="${escapeHtml(actor.name)}">${escapeHtml(actor.name)}</small></div>
      <button type="button" class="na-gm-open-sheet" data-actor-uuid="${escapeHtml(actor.uuid)}" title="Abrir ficha"><i class="fa-solid fa-arrow-up-right-from-square"></i></button>
    </td>
    <td class="na-gm-text-cell"><strong>${escapeHtml(className)}</strong><small>${escapeHtml(ability)}</small></td>
    <td class="na-gm-text-cell"><strong>${escapeHtml(origin)}</strong><small>${escapeHtml(metal)}</small></td>
    <td class="na-gm-level">${level || "—"}</td>
    <td class="na-gm-text-cell"><strong>${escapeHtml(breath)}</strong></td>
    <td class="na-gm-level na-gm-level--breath">${breathLevel || "—"}</td>
    ${attrCells}
    <td>${resourceCell(pdv, "pdv")}</td>
    <td>${resourceCell(pdr, "pdr")}</td>
    <td class="na-gm-spent">${pdr.spent}</td>
    <td class="na-gm-defense">${escapeHtml(dodge)}</td>
    <td class="na-gm-defense">${escapeHtml(block)}</td>
  </tr>`;
}

function hunterRows(hunters) {
  return hunters.map(hunterRow).join("") || `<tr><td colspan="18" class="na-gm-empty"><i class="fa-solid fa-user-slash"></i><strong>Nenhum Caçador encontrado</strong><span>Preencha a key nome_cacador nas fichas.</span></td></tr>`;
}

function loadHunters() {
  return game.actors.contents.map(hunterData).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

function renderDashboard(hunters) {
  return `<section class="na-gm-board">
    <header class="na-gm-hero">
      <div><small>MESA TÁTICA · CORPO DE EXTERMINADORES</small><h2>Controle de Campo</h2><p>Visão persistente dos Caçadores durante a sessão.</p></div>
      <div class="na-gm-count"><strong>${hunters.length}</strong><span>em campo</span></div>
    </header>
    <div class="na-gm-toolbar">
      <label><i class="fa-solid fa-magnifying-glass"></i><input type="search" class="na-gm-search" placeholder="Buscar nome, classe, origem, respiração..." autocomplete="off" /></label>
      <span class="na-gm-visible-count">${hunters.length} visíveis</span>
      <button type="button" class="na-gm-refresh"><i class="fa-solid fa-rotate"></i><span>Atualizar</span></button>
    </div>
    <div class="na-gm-table-wrap">
      <table class="na-gm-table">
        <thead>
          <tr class="na-gm-groups"><th colspan="3">Identidade</th><th colspan="3">Progressão</th><th colspan="7">Atributos</th><th colspan="3">Recursos</th><th colspan="2">Defesa</th></tr>
          <tr><th>Caçador</th><th>Classe</th><th>Origem</th><th>Nv.</th><th>Respiração</th><th>Nv. Resp.</th>${ATTRIBUTES.map(({ label }) => `<th>${label}</th>`).join("")}<th>PDV</th><th>PDR</th><th>PDR usado</th><th>Esquiva</th><th>Bloqueio</th></tr>
        </thead>
        <tbody class="na-gm-table-body">${hunterRows(hunters)}</tbody>
      </table>
    </div>
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
  const query = root.querySelector(".na-gm-search")?.value.trim().toLocaleLowerCase("pt-BR") ?? "";
  const rows = [...root.querySelectorAll(".na-gm-row")];
  let visible = 0;
  for (const row of rows) {
    const show = !query || row.dataset.search.includes(query);
    row.hidden = !show;
    if (show) visible += 1;
  }
  const visibleCount = root.querySelector(".na-gm-visible-count");
  if (visibleCount) visibleCount.textContent = `${visible} visíveis`;
}

function refreshDashboard(root) {
  const hunters = loadHunters();
  const tbody = root.querySelector(".na-gm-table-body");
  if (tbody) tbody.innerHTML = hunterRows(hunters);
  const total = root.querySelector(".na-gm-count strong");
  if (total) total.textContent = String(hunters.length);
  bindRowActions(root);
  filterRows(root);
}

function bindDashboard(dialog, element) {
  const root = element instanceof HTMLElement ? element : element?.[0];
  if (!root) return;

  root.querySelector(".na-gm-search")?.addEventListener("input", () => filterRows(root));
  root.querySelector(".na-gm-refresh")?.addEventListener("click", () => refreshDashboard(root));
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

  requestAnimationFrame(() => dialog.setPosition({ width: Math.min(1540, window.innerWidth - 40), height: Math.min(760, window.innerHeight - 60) }));
}

export async function openGmDashboard() {
  if (!game.user?.isGM) return ui.notifications.error("Somente o GM pode abrir o Controle dos Caçadores.");

  if (window.__NAGmDashboard) {
    try { await window.__NAGmDashboard.close(); } catch (_) { /* janela antiga já fechada */ }
  }

  const hunters = loadHunters();
  const DialogV2 = foundry.applications.api.DialogV2;
  const dialog = new DialogV2({
    window: { title: "Controle GM — Night Assassins" },
    classes: ["na-gm-dashboard-window"],
    position: { width: Math.min(1540, window.innerWidth - 40), height: Math.min(760, window.innerHeight - 60) },
    modal: false,
    content: renderDashboard(hunters),
    buttons: [
      { action: "close", label: "Fechar painel", default: true, callback: () => "close" },
    ],
  });

  Hooks.once("renderDialogV2", (app, element) => {
    if (app === dialog) bindDashboard(dialog, element);
  });

  window.__NAGmDashboard = dialog;
  dialog.render({ force: true });
  return dialog;
}
