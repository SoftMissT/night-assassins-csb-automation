import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultPath = path.join(root, "src", "templates", "actors", "oni-template.json");

// ─────────────────────────────────────────────────────────────────────────
// Reconstrução estrutural da ficha Oni (P0).
//
// Substitui o layout genérico herdado do Slayer (Biografia / Perícias /
// Combate / Inventário / Notas / Configurações + Fôlego + Marca) pela
// estrutura de domínio Oni aprovada pelo Operador — reduzida a 2 abas
// físicas (2026-08-24, redundância de 6 abas confirmada pelo Operador):
//   1. COMBATE (recursos, testes, ações, status/resistências, perícias,
//      vida e morte, Kekkijutsu)
//   2. CONFIGURAÇÕES/DADOS (Especialização, Origem & Progressão,
//      Identidade & Inventário, dados de combate e recursos administrativos)
//
// Regra de segurança: nenhuma key computacional usada por runtime
// (damage-relay.mjs, hit-service.mjs, migrate-oni-template.mjs,
// progression-service.mjs) é removida — apenas Fôlego, Marca Slayer e a
// aba antiga são eliminados; campos administrativos (dano tomado, curado,
// extra, gasto) são realocados para CONFIG em vez de apagados.
// ─────────────────────────────────────────────────────────────────────────

const FOLEGO_KEYS = new Set(["folego_oni_titulo", "folego_oni_atual", "folego_oni_maximo"]);
const MARCA_TEMP_KEYS = new Set([
  "vit_marca_temp", "dex_marca_temp", "for_marca_temp", "car_marca_temp",
  "fdv_marca_temp", "int_marca_temp", "sab_marca_temp",
]);
const ADMIN_LEDGER_KEYS = new Set([
  "pdv_oni_dano_tomado", "pdv_oni_curado", "pdv_oni_extra",
  "pdk_oni_gasto_valor", "pdk_oni_curado", "pdk_oni_extra",
]);
// Lixo de migração: switchCase morto com origens/keys do SLAYER
// (origem_civilizado, origem_corsario, origem_criado_ex_hashira...) que
// nunca casam com o dropdown Oni real (namespace origem_oni_*) e apontam
// para identificadores que não existem em lugar nenhum do template — a
// contaminação visual confirmada pelo Operador ("CÁLCULO DE VIDA" com
// Origens do Slayer). Não é exibido em nenhuma label; remoção segura.
const DEAD_LEGACY_HIDDEN = new Set(["origem_hab_1_display", "origem_hab_2_display"]);
// Labels legados exigidos por tools/migrate-oni-template.mjs (ferramenta de
// importação histórica, ainda em uso pelos testes de regressão daquele
// fluxo). Mantidos como campos ocultos de compatibilidade.
const LEGACY_DISPLAY_KEYS = new Set([
  "pdv_oni_total_valor", "pdv_oni_atual_valor_display",
  "pdk_oni_total_valor", "pdk_oni_atual_valor_display",
]);

function clone(value) {
  return structuredClone(value);
}

function findAll(value, predicate, out = []) {
  if (Array.isArray(value)) {
    for (const entry of value) findAll(entry, predicate, out);
    return out;
  }
  if (!value || typeof value !== "object") return out;
  if (predicate(value)) out.push(value);
  for (const child of Object.values(value)) findAll(child, predicate, out);
  return out;
}

function findOne(value, predicate) {
  return findAll(value, predicate)[0] ?? null;
}

function label(text, { color = "#f7f7f7", size = "na-sheet-size-lg", role = "" } = {}) {
  return {
    key: "", colSpan: 1, rowSpan: 1, cssClass: "", role: 0, editRole: 0, permission: 0,
    tooltip: "", visibilityFormula: "", editableFormula: "", escapeHTML: false,
    type: "label", size: "full-size", icon: "",
    value: `<span class="na-sheet-text na-sheet-title ${size}${role ? ` na-sheet-role-${role}` : ""}">${text}</span>`,
    prefix: "", suffix: "", rollMessage: "", altRollMessage: "",
    rollMessageToChat: false, altRollMessageToChat: false, style: "label",
  };
}

function resourceValueLabel(formula, cssRole) {
  return {
    key: "", colSpan: 1, rowSpan: 1, cssClass: "", role: 0, editRole: 0, permission: 0,
    tooltip: "", visibilityFormula: "", editableFormula: "", escapeHTML: false,
    type: "label", size: "full-size", icon: "",
    value: `<div class="custom-orbitron-wrapper na-oni-resource-${cssRole}"><span style="font-family:'Orbitron','Times New Roman',serif;font-size:18px;font-weight:700;">${formula}</span></div>`,
    prefix: "", suffix: "", rollMessage: "", altRollMessage: "",
    rollMessageToChat: false, altRollMessageToChat: false, style: "label",
  };
}

function panel(key, contents, { title = "", flow = "row", cssClass = "" } = {}) {
  return {
    key, colSpan: 1, rowSpan: 1, cssClass, role: 0, editRole: 0, permission: 0,
    tooltip: "", visibilityFormula: "", editableFormula: "", escapeHTML: false,
    type: "panel", flow, align: "left", verticalAlign: "top",
    ...(title ? { title, titleStyle: "bold" } : {}),
    contents,
  };
}

function tab(key, contents) {
  return {
    key, colSpan: 1, rowSpan: 1, cssClass: "", role: 0, editRole: 0, permission: 0,
    tooltip: "", visibilityFormula: "", editableFormula: "", escapeHTML: false,
    type: "tab", contents,
  };
}

function itemContainer(key, title, category, tooltip) {
  return {
    key, colSpan: 1, rowSpan: 3, cssClass: "", role: 0, editRole: 0, permission: 0,
    tooltip, visibilityFormula: "", editableFormula: "", escapeHTML: false,
    type: "itemContainer", contents: [], rowLayout: [], head: true, deleteWarning: true,
    title, hideEmpty: false, hiddenColumns: [], sortOption: "manual", headDisplay: true,
    showCreate: false, defaultTemplate: "", createItemDialogTitle: "",
    createItemDialogShowTemplateList: false, createItemDialogButton: "", newItemDefaultName: "",
    showDelete: true, statusIcon: true, nameAlign: "left", nameLabel: "Nome", templateFilter: [],
    itemFilterFormula: `equalText(item.inventario_categoria, '${category}')`, sortPredicates: [],
  };
}

const ESPECIALIZACAO_OPTIONS = [
  ["oni_especializacao_escolha", "Escolha sua Especialização"],
  ["oni_especializacao_artista_marcial", "Artista Marcial"],
  ["oni_especializacao_cacador_noturno", "Caçador Noturno"],
  ["oni_especializacao_espadachim_profano", "Espadachim Profano"],
  ["oni_especializacao_marionetista", "Marionetista"],
  ["oni_especializacao_mestre_recuperacao", "Mestre da Recuperação"],
  ["oni_especializacao_nobre_de_sangue", "Nobre de Sangue"],
  ["oni_especializacao_soberano_demonico", "Soberano Demoníaco"],
  ["oni_especializacao_tecelao_de_sangue", "Tecelão de Sangue"],
  ["oni_especializacao_titan", "Titan"],
  ["oni_especializacao_toxico", "Tóxico"],
];

/** Remove nós cujo `key` está no conjunto informado (busca recursiva, preserva o resto). */
function pruneByKeys(value, keys) {
  if (Array.isArray(value)) return value.map((entry) => pruneByKeys(entry, keys)).filter((entry) => entry !== null);
  if (!value || typeof value !== "object") return value;
  if (typeof value.key === "string" && keys.has(value.key)) return null;
  for (const [prop, child] of Object.entries(value)) value[prop] = pruneByKeys(child, keys);
  return value;
}

/** Extrai (e remove da árvore) os nós com as keys informadas, preservando os objetos originais. */
function extractByKeys(value, keys, out = []) {
  const kept = pruneByKeys(clone(value), new Set());
  findAll(value, (node) => typeof node.key === "string" && keys.has(node.key), out);
  return out;
}

const NEW_TAB_KEYS = ["combate_oni_tab", "configs_tab"];

function numberField(key, labelText, tooltip, { defaultValue = "0" } = {}) {
  return {
    key, colSpan: 1, rowSpan: 1, cssClass: "", role: 0, editRole: 0, permission: 0,
    tooltip, visibilityFormula: "", editableFormula: "", escapeHTML: false,
    type: "numberField", size: "full-size", label: labelText, defaultValue,
    allowDecimal: false, minVal: "0", maxVal: "", allowRelative: false,
    showControls: false, controlsStyle: "hover",
  };
}

/** Rank da Especialização Oni por nível — decisão fixada pelo Operador. */
const RANK_ESPECIALIZACAO_FORMULA = "${nvl_num>=19?'SS':nvl_num>=16?'S':nvl_num>=12?'A':nvl_num>=7?'B':nvl_num>=3?'C':''}$";

/**
 * Garante que toda propriedade referenciada por fórmula CSB do template
 * exista de fato (componente ou hidden) — guarda incondicional contra a
 * classe de bug que quebrou o PDV (`pdv_oni_ganho_nvl2..12` referenciados
 * sem existir). Idempotente: só adiciona o que falta.
 */
function ensureLedgerIntegrity(t) {
  const storagePanel = findOne(t.system.body, (n) => n.key === "status_oni_storage_panel");
  if (storagePanel) {
    const existingKeys = new Set(collectComponentKeys(t));
    for (let level = 2; level <= 12; level += 1) {
      const key = `pdv_oni_ganho_nvl${level}`;
      if (!existingKeys.has(key)) {
        storagePanel.contents.push(numberField(key, `PDV ganho Nv.${level} (auto)`, "Rolado automaticamente uma única vez ao atingir o nível."));
      }
    }
    for (const key of ["hab_esquiva_bonus", "hab_bloqueio_bonus", "hab_acerto_bonus"]) {
      if (!existingKeys.has(key)) {
        storagePanel.contents.push(numberField(key, `Bônus de ${key.replace("hab_", "").replace("_bonus", "")} (Especialização/Origem)`, "Bônus permanente somado ao teste correspondente."));
      }
    }
    if (!existingKeys.has("oni_nivel_na_queda")) {
      storagePanel.contents.push(numberField("oni_nivel_na_queda", "Nível na Queda", "Somente Exterminador Corrompido."));
    }
    // Nome Oni-nativo (nunca "PDR" — recurso exclusivo do Slayer). Guarda
    // o valor de defesa do Slayer no momento da Queda, para a origem
    // Exterminador Corrompido; renomeia qualquer referência legada em
    // `system.hidden` que ainda use o nome antigo contaminado.
    if (!existingKeys.has("oni_recurso_slayer_antes_queda")) {
      storagePanel.contents.push(numberField("oni_recurso_slayer_antes_queda", "Recurso do Slayer antes da Queda", "Somente Exterminador Corrompido — defesa que o Slayer tinha antes de cair."));
    }
    for (const entry of t.system.hidden ?? []) {
      if (typeof entry.value === "string") entry.value = entry.value.replaceAll("oni_pdr_maximo_antes_queda", "oni_recurso_slayer_antes_queda");
    }
  }

  const hiddenNames = new Set((t.system.hidden ?? []).map((h) => h.name));
  if (!hiddenNames.has("rank_especializacao_oni")) {
    t.system.hidden = [...(t.system.hidden ?? []), { name: "rank_especializacao_oni", value: RANK_ESPECIALIZACAO_FORMULA }];
  }
}

function collectComponentKeys(t) {
  return [
    ...findAll(t.system.body, (n) => typeof n.key === "string" && n.key !== ""),
    ...findAll(t.system.header, (n) => typeof n.key === "string" && n.key !== ""),
  ].map((n) => n.key);
}

export function cleanOniTemplate(source) {
  const t = clone(source);
  const body = t.system.body;
  const tabbedPanel = findOne(body, (n) => n.type === "tabbedPanel");
  if (!tabbedPanel) throw new Error("tabbedPanel não encontrado no template Oni.");

  // `system.hidden` sempre é higienizado, mesmo no ramo idempotente — Fôlego,
  // Marca e dead code de Origens Slayer (origem_hab_1/2_display) podem
  // reaparecer via edição manual do JSON sem mexer na estrutura de abas.
  const removedHiddenNames = new Set([...FOLEGO_KEYS, ...MARCA_TEMP_KEYS, ...DEAD_LEGACY_HIDDEN]);
  t.system.hidden = (t.system.hidden ?? []).filter((entry) => !removedHiddenNames.has(entry.name));

  // Guarda incondicional contra a classe exata do bug P0 original: qualquer
  // fórmula CSB referenciando uma propriedade que não existe em lugar nenhum
  // do template quebra a cadeia inteira (fallback(undefinedSymbol,0) ainda
  // falha porque o símbolo nunca foi registrado). Roda em TODO caminho —
  // idempotente ou não — porque edições concorrentes no restante da ficha
  // (Testes, Especialização) podem reintroduzir a mesma classe de bug sem
  // tocar na estrutura de abas.
  ensureLedgerIntegrity(t);

  // Idempotente: se o template já está na estrutura nova, não reaplica (evita
  // corromper um template já reconstruído em re-execuções/testes).
  const currentTabKeys = tabbedPanel.contents.map((tb) => tb.key);
  if (NEW_TAB_KEYS.every((key) => currentTabKeys.includes(key))) {
    t.system.templateSystemUniqueVersion = Math.max(1, Number(t.system.templateSystemUniqueVersion) || 0) + 1;
    return t;
  }

  const oldTabs = Object.fromEntries(tabbedPanel.contents.map((tb) => [tb.key, tb]));
  const { perfil_oni_tab: perfil, pericias_tab: pericias, combat_oni_tab: combat,
    inventario_oni_tab: inventario, notas_oni_tab: notas, configs_tab: configs } = oldTabs;
  for (const [name, node] of Object.entries({ perfil, pericias, combat, inventario, notas, configs })) {
    if (!node) throw new Error(`Aba original "${name}" não encontrada — layout inesperado, abortando.`);
  }

  // ── 1. Extrair admin ledger fields e destruir Fôlego/Marca antes de mover blocos ──
  const adminFields = extractByKeys(combat, ADMIN_LEDGER_KEYS);
  // Labels legados (pdv_oni_total_valor etc.) — mantidos ocultos por compat
  // com tools/migrate-oni-template.mjs (que exige essas keys existam em
  // algum lugar da árvore); a UI principal usa o novo `recursos_oni_barra_panel`.
  const legacyDisplayLabels = extractByKeys(combat, LEGACY_DISPLAY_KEYS).map((node) => ({ ...node, visibilityFormula: "false" }));
  combat.contents = pruneByKeys(combat.contents, new Set([...FOLEGO_KEYS]));
  configs.contents = pruneByKeys(configs.contents, MARCA_TEMP_KEYS);

  // ── 2. Simplificar tabela PDV/PDK -> barra de recurso legível ──
  const oldTable = findOne(combat, (n) => n.type === "table" && n.contents?.[0]?.[0]?.key === undefined);
  // A tabela de recursos é sempre o primeiro elemento de combat_oni_tab.
  combat.contents = combat.contents.filter((n) => n.type !== "table");
  const resourceBar = panel("recursos_oni_barra_panel", [
    panel("pdv_oni_barra_row", [
      label("PDV", { size: "na-sheet-size-md", role: "vit" }),
      resourceValueLabel("${pdv_oni_atual_num}$ / ${pdv_oni_maximo_num}$", "pdv"),
    ], { flow: "grid-2" }),
    panel("pdk_oni_barra_row", [
      label("PDK", { size: "na-sheet-size-md", role: "car" }),
      resourceValueLabel("${pdk_oni_atual_num}$ / ${pdk_oni_maximo_num}$", "pdk"),
    ], { flow: "grid-2" }),
  ], { title: "Recursos", flow: "vertical", cssClass: "na-oni-resource-bars" });
  combat.contents.unshift(resourceBar);

  // ── 3. Perícias: mover do próprio tab para dentro de COMBATE (seção compacta) ──
  const periciasPanel = findOne(pericias, (n) => n.type === "panel" && n.title === "Pericias");
  const vidaMortePanel = findOne(pericias, (n) => n.key === "vida_morte_oni_panel");
  if (periciasPanel) combat.contents.push(periciasPanel);
  if (vidaMortePanel) combat.contents.push(vidaMortePanel);

  // ── 4. Renomear Classe -> Especialização (dropdown do header) ──
  const classField = findOne(t.system.header, (n) => n.key === "classe_escolhida");
  if (classField) {
    classField.key = "oni_especializacao_id";
    classField.label = "Especialização:";
    classField.defaultValue = "oni_especializacao_escolha";
    classField.options = ESPECIALIZACAO_OPTIONS.map(([key, value]) => ({ key, value }));
  }

  // ── 5. Kekkijutsu: item container passa a viver dentro de COMBATE ──
  combat.contents.push(itemContainer("inventario_oni_kekkijutsus", "Kekkijutsu", "kekkijutsu", "Técnicas de sangue conhecidas pelo Oni."));

  // ── 6. Seção ESPECIALIZAÇÃO (dentro de CONFIG) ──
  const especializacaoSection = [
    label("ESPECIALIZAÇÃO", { size: "na-sheet-size-xl", role: "car" }),
    panel("especializacao_oni_resumo_panel", [
      label("Especialização atual: ${fallback(oni_especializacao_id,'oni_especializacao_escolha')}$", { size: "na-sheet-size-md" }),
      label("Rank da Especialização: ${fallback(rank_especializacao_oni,'—')}$", { size: "na-sheet-size-md" }),
    ], { title: "Resumo", flow: "vertical" }),
  ];
  // "especializacao_oni_habilidades_display" (textArea vazio, sem uso) e seu
  // painel/label de título são órfãos aprovados para remoção — não são
  // recriados na estrutura de 2 abas.

  // ── 7. Seção ORIGEM & PROGRESSÃO (dentro de CONFIG) ──
  const origemProgressaoSection = [
    label("ORIGEM & PROGRESSÃO", { size: "na-sheet-size-xl", role: "car" }),
    panel("origem_oni_resumo_panel", [
      label("Origem: ${fallback(origem_dropdown,'origem_oni_escolha')}$", { size: "na-sheet-size-md" }),
      label("PDV inicial da Origem: ${origem_oni_pdv_inicial}$", { size: "na-sheet-size-md" }),
      label("PDK inicial da Origem: ${origem_oni_pdk_inicial}$", { size: "na-sheet-size-md" }),
    ], { title: "Origem", flow: "vertical" }),
    panel("progressao_oni_resumo_panel", [
      label("Nível: ${nvl_num}$", { size: "na-sheet-size-md" }),
      label("Patente: ${rank_atual}$", { size: "na-sheet-size-md" }),
      label("PDV Máximo: ${pdv_oni_maximo_num}$", { size: "na-sheet-size-md" }),
      label("PDK Máximo: ${pdk_oni_maximo_num}$", { size: "na-sheet-size-md" }),
    ], { title: "Progressão", flow: "vertical" }),
  ];

  // ── 8. Seção IDENTIDADE & INVENTÁRIO (mescla perfil/bio + inventario + notas, dentro de CONFIG) ──
  const identidadeInventarioSection = [
    label("IDENTIDADE & INVENTÁRIO", { size: "na-sheet-size-xl", role: "car" }),
    ...(perfil.contents ?? []),
    ...(inventario.contents ?? []),
    ...(notas.contents ?? []),
  ];

  // ── 9. CONFIG / DADOS: seções movidas + campos administrativos (config renomeado) ──
  configs.contents = [
    ...especializacaoSection,
    ...origemProgressaoSection,
    ...identidadeInventarioSection,
    ...configs.contents,
    panel("recursos_oni_admin_panel", [...adminFields, ...legacyDisplayLabels], {
      title: "Recursos Administrativos (GM)", flow: "grid-3",
    }),
  ];

  // ── 10. Recompor tabbedPanel na ordem final (2 abas) ──
  tabbedPanel.contents = [
    tab("combate_oni_tab", combat.contents),
    tab("configs_tab", configs.contents),
  ];

  // (limpeza de system.hidden já aplicada incondicionalmente no topo da função)
  t.system.templateSystemUniqueVersion = Math.max(1, Number(t.system.templateSystemUniqueVersion) || 0) + 1;
  return t;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const sourcePath = path.resolve(process.argv[2] ?? defaultPath);
  const targetPath = path.resolve(process.argv[3] ?? sourcePath);
  const source = JSON.parse(await readFile(sourcePath, "utf8"));
  await writeFile(targetPath, `${JSON.stringify(cleanOniTemplate(source), null, 2)}\n`);
  console.log(`Template Oni reconstruído em ${targetPath}`);
}
