import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultSource = path.join(root, "oni.json");
const defaultTarget = path.join(root, "src", "templates", "actors", "oni-template.json");

const PDV_DICE_LEVELS = Object.freeze({
  2: "1d4", 3: "1d4", 4: "1d6", 5: "1d6", 6: "1d6",
  7: "2d4", 8: "2d4", 9: "2d4", 10: "2d6", 11: "2d6", 12: "2d6",
});

const PDK_LEVEL_GAINS = Object.freeze({
  2: 4, 3: 4, 4: 6, 5: 6, 6: 6, 7: 8, 8: 8, 9: 20,
  10: 10, 11: 10, 12: 12, 13: 12, 14: 14, 15: 14, 16: 16,
  17: 16, 18: 18, 19: 20, 20: 50,
});

function replaceOniResourceNames(value) {
  if (typeof value === "string") {
    return value
      .replaceAll("pdr_oni", "pdk_oni")
      .replaceAll("PDR / PDK", "PDK")
      .replaceAll("PDR", "PDK");
  }
  if (Array.isArray(value)) return value.map(replaceOniResourceNames);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [
    key.replaceAll("pdr_oni", "pdk_oni"),
    replaceOniResourceNames(child),
  ]));
}

function walk(value, visitor) {
  if (!value || typeof value !== "object") return;
  visitor(value);
  for (const child of Object.values(value)) walk(child, visitor);
}

function collectKeys(document) {
  const keys = new Set();
  walk(document.system, (value) => {
    if (typeof value.key === "string") keys.add(value.key);
    if (typeof value.name === "string" && value.value !== undefined) keys.add(value.name);
  });
  return keys;
}

function orbitron(text, color, size = 16) {
  return `<div class="custom-orbitron-wrapper"><span style="font-family:'Orbitron','Times New Roman',serif;font-size:${size}px;font-weight:700;color:${color};text-transform:uppercase;letter-spacing:.12em;">${text}</span></div>`;
}

function upsertHidden(template, name, value) {
  const hidden = template.system?.hidden;
  if (!Array.isArray(hidden)) throw new Error("system.hidden do Oni não é uma lista.");
  const existing = hidden.find((entry) => entry.name === name);
  if (existing) existing.value = value;
  else hidden.push({ name, value });
}

function findByKey(template, key) {
  let found = null;
  walk(template.system, (node) => {
    if (!found && node.key === key) found = node;
  });
  return found;
}

function makeNumberField(key, label, tooltip) {
  return {
    key,
    colSpan: 1,
    rowSpan: 1,
    cssClass: "",
    role: 0,
    editRole: 0,
    permission: 0,
    tooltip,
    visibilityFormula: "",
    editableFormula: "",
    type: "numberField",
    size: "small",
    label,
    allowDecimal: false,
    minVal: "0",
    maxVal: "9999",
    defaultValue: "0",
    allowRelative: false,
    showControls: true,
    controlsStyle: "hover",
  };
}

function makePanel(key, contents, cssClass = "") {
  return {
    key,
    colSpan: 1,
    rowSpan: 1,
    cssClass,
    role: 0,
    editRole: 0,
    permission: 0,
    tooltip: "",
    visibilityFormula: "",
    editableFormula: "",
    type: "panel",
    flow: "row",
    align: "center",
    contents,
  };
}

function configureOniLevelAndRank(template) {
  const level = findByKey(template, "nvl_pj");
  if (!level) throw new Error("Dropdown nvl_pj não encontrado no template Oni.");
  level.options = Array.from({ length: 21 }, (_, value) => ({ key: `nvl_${value}`, value: String(value) }));
  level.defaultValue = "nvl_0";

  const ranks = [
    "Não definido", "Oni Recém-Transformado", "Oni Faminto", "Oni Sanguinário", "Oni Predador",
    "Oni Notório", "Oni Aberrante", "Candidato às Doze Kizuki", "Lua Inferior Seis",
    "Lua Inferior Cinco", "Lua Inferior Quatro", "Lua Inferior Três", "Lua Inferior Dois",
    "Lua Inferior Um", "Lua Superior Seis", "Lua Superior Cinco", "Lua Superior Quatro",
    "Lua Superior Três", "Lua Superior Dois", "Lua Superior Um", "Rei dos Onis",
  ];
  const args = ranks.flatMap((rank, index) => [`'nvl_${index}'`, `'${rank}'`]).join(",\n  ");
  upsertHidden(template, "rank_atual", `\${switchCase(nvl_pj,\n  ${args},\n  'Desconhecido'\n)}$`);
}

// Valores oficiais auditados contra MACRO-NA-FOUNDRY/Mecânicas para fazer na ficha/Onis/Origens/
// Sessão 2026-08-25: 9 correções de PDV e 7 de PDK sobre os valores antigos.
const ONI_ORIGIN_PDV_FIXO = Object.freeze({
  passado_triste: 22, personalidade_maligna: 16,
  rastreador_de_sangue: 20, genio_do_mal: 20,
  adepto_das_trevas: 19, comum: 18,
  corte_palida: 18, mare_negra: 20, raiz_podre: 23,
  realidade_distorcida: 17, tela_do_submundo: 18,
  oni_de_outras_terras: 18, transfigurado: 24,
  eco_eterno: 18, chama_negra: 20,
  demonio_de_linhagem_infernal: 21, espirito_ceifador: 20,
  monarca_demoniaco: 22, vampiro_de_linhagem: 19,
});

const ONI_ORIGIN_PDK_FIXO = Object.freeze({
  passado_triste: 2, personalidade_maligna: 3,
  rastreador_de_sangue: 1, genio_do_mal: 2,
  adepto_das_trevas: 4, comum: 8,
  corte_palida: 18, mare_negra: 17, raiz_podre: 16,
  realidade_distorcida: 20, tela_do_submundo: 20,
  oni_de_outras_terras: 19, transfigurado: 16,
  eco_eterno: 19, chama_negra: 19,
  demonio_de_linhagem_infernal: 20, espirito_ceifador: 18,
  monarca_demoniaco: 20, vampiro_de_linhagem: 20,
});

// Origens cuja regra é "N + FDV + (FDV×3)" usam multiplicador 4; as demais são "(FDV×3)".
const ONI_ORIGIN_PDK_FDV_MULT = Object.freeze({
  passado_triste: 4, personalidade_maligna: 4, rastreador_de_sangue: 4,
  genio_do_mal: 4, adepto_das_trevas: 4,
});

function configureOniOrigins(template) {
  const origin = findByKey(template, "origem_oni_dropdown") ?? findByKey(template, "origem_dropdown");
  if (!origin || !Array.isArray(origin.options)) throw new Error("Dropdown de origem Oni não encontrado.");
  origin.defaultValue = "origem_oni_escolha";
  const keys = new Set(origin.options.map((option) => option.key));
  if ([...keys].some((key) => !String(key).startsWith("origem_oni_"))) {
    throw new Error("O dropdown Oni contém origem que não usa o namespace origem_oni_.");
  }

  const originSwitchCase = (table, fallbackValue) => {
    const args = Object.entries(table).flatMap(([key, value]) => [`'origem_oni_${key}'`, value]).join(",\n  ");
    return `\${switchCase(origem_oni_dropdown,\n  ${args},\n  ${fallbackValue}\n)}$`;
  };

  // Camada 1 — constantes por origem (dados puros, sem fórmula embutida).
  upsertHidden(template, "origem_pdv_fixo", originSwitchCase(ONI_ORIGIN_PDV_FIXO, 0));
  upsertHidden(template, "origem_pdk_fixo", originSwitchCase(ONI_ORIGIN_PDK_FIXO, 0));
  upsertHidden(template, "origem_pdk_fdv_mult", originSwitchCase(ONI_ORIGIN_PDK_FDV_MULT, 3));

  // Camada 2 — conta única; Exterminador Corrompido é o único caso especial.
  upsertHidden(
    template,
    "origem_oni_pdv_inicial",
    "${(origem_oni_dropdown=='origem_oni_exterminador_corrompido')?(30+(vit_oni_nvl1*3)+(10*oni_nivel_na_queda)):(origem_pdv_fixo+vit_oni_nvl1)}$",
  );
  upsertHidden(
    template,
    "origem_oni_pdk_inicial",
    "${(origem_oni_dropdown=='origem_oni_exterminador_corrompido')?(oni_pdr_maximo_antes_queda+(oni_nivel_na_queda*2)+(fdv_oni_nvl1*3)):(origem_pdk_fixo+(fdv_oni_nvl1*origem_pdk_fdv_mult))}$",
  );
}

function configureOniProgression(template) {
  const pdvTerms = ["origem_oni_pdv_inicial"];
  for (const level of Object.keys(PDV_DICE_LEVELS).map(Number)) {
    pdvTerms.push(`(nvl_num>=${level}?pdv_oni_ganho_nvl${level}:0)`);
  }
  for (let level = 13; level <= 20; level += 1) {
    const gain = level <= 15 ? "30+vit_display" : level <= 19 ? "40+vit_display" : "50+(vit_display*5)";
    pdvTerms.push(`(nvl_num>=${level}?(${gain}):0)`);
  }
  upsertHidden(template, "pdv_oni_total_conta", `\${${pdvTerms.join("+")}}$`);

  const pdkTerms = ["origem_oni_pdk_inicial"];
  for (const [level, gain] of Object.entries(PDK_LEVEL_GAINS)) {
    pdkTerms.push(`(nvl_num>=${level}?${gain}:0)`);
  }
  upsertHidden(template, "pdk_oni_total_conta", `\${${pdkTerms.join("+")}}$`);

  upsertHidden(template, "pdv_oni_maximo_num", "${max(0,pdv_oni_total_conta-pdv_oni_dano_ferida+pdv_oni_extra)}$");
  upsertHidden(template, "pdv_oni_atual_num", "${min(pdv_oni_maximo_num,max(0,pdv_oni_total_conta-pdv_oni_dano_ferida+pdv_oni_curado+pdv_oni_extra-pdv_oni_dano_tomado))}$");
  upsertHidden(template, "pdk_oni_maximo_num", "${max(0,pdk_oni_total_conta+pdk_oni_extra)}$");
  upsertHidden(template, "pdk_oni_atual_num", "${min(pdk_oni_maximo_num,max(0,pdk_oni_total_conta+pdk_oni_curado+pdk_oni_extra-pdk_oni_gasto_valor))}$");
}

const ONI_ORIGIN_BONUSES = Object.freeze({
  vit: { exterminador_corrompido: 1, comum: 1, raiz_podre: 2, transfigurado: 1, canibal: 1, chama_negra: 1 },
  dex: { mare_negra: 1, transfigurado: 1 },
  for: { chama_negra: 1 },
  car: { passado_triste: 1, personalidade_maligna: 1, corte_palida: 1 },
  fdv: { adepto_das_trevas: 1, corte_palida: 1, mare_negra: 1, realidade_distorcida: 1, tela_do_submundo: 1, oni_de_outras_terras: 1, eco_eterno: 2, chama_negra: 1 },
  int: { genio_do_mal: 1, realidade_distorcida: 1, tela_do_submundo: 1, oni_de_outras_terras: 1 },
  sab: { rastreador_de_sangue: 1, tela_do_submundo: 1, eco_eterno: 1 },
});

function originBonusSwitchCase(attr) {
  const table = ONI_ORIGIN_BONUSES[attr] ?? {};
  const args = Object.entries(table).flatMap(([origin, bonus]) => [`'origem_oni_${origin}'`, bonus]).join(",");
  return `\${switchCase(origem_oni_dropdown,${args},0)}$`;
}

function configureOniOriginBonuses(template) {
  for (const attr of Object.keys(ONI_ORIGIN_BONUSES)) {
    upsertHidden(template, `origem_oni_bonus_${attr}`, originBonusSwitchCase(attr));
  }
}

function configureOniAttributes(template) {
  const formulas = {
    vit_display: "${fallback(atr_vit_oni_valor_config,0)+fallback(bonus_atr_vit_oni_valor_temp,0)}$",
    dex_display: "${fallback(atr_dex_oni_valor_config,0)+fallback(bonus_atr_dex_oni_valor_temp,0)}$",
    for_display: "${fallback(atr_for_oni_valor_config,0)+fallback(bonus_atr_for_oni_valor_temp,0)}$",
    car_display: "${fallback(atr_car_oni_valor_config,0)+fallback(bonus_atr_car_oni_valor_temp,0)}$",
    fdv_display: "${fallback(atr_fdv_oni_valor_config,0)+fallback(bonus_atr_fdv_oni_valor_temp,0)}$",
    int_display: "${fallback(atr_int_oni_valor_config,0)+fallback(bonus_atr_int_oni_valor_temp,0)}$",
    sab_display: "${fallback(atr_sab_oni_valor_config,0)+fallback(bonus_atr_sab_oni_valor_temp,0)}$",
  };
  for (const [name, formula] of Object.entries(formulas)) upsertHidden(template, name, formula);
}

function configureOniBarsAndLabels(template) {
  template.system.attributeBar = {
    pdv_oni_barra: { value: "${pdv_oni_atual_num}$", max: "${pdv_oni_maximo_num}$", editable: false },
    pdk_oni_barra: { value: "${pdk_oni_atual_num}$", max: "${pdk_oni_maximo_num}$", editable: false },
  };
  walk(template.system, (node) => {
    if (node.type !== "label") return;
    if (node.key === "pdv_oni_total_valor") node.value = orbitron("${pdv_oni_maximo_num}$", "#C1000C", 18);
    if (node.key === "pdv_oni_atual_valor_display") node.value = orbitron("${pdv_oni_atual_num}$", "#C1000C", 18);
    if (node.key === "pdk_oni_total_valor") node.value = orbitron("${pdk_oni_maximo_num}$", "#B36CFF", 18);
    if (node.key === "pdk_oni_atual_valor_display") node.value = orbitron("${pdk_oni_atual_num}$", "#B36CFF", 18);
  });
}

function configureOniProgressionFields(template) {
  const dataTab = findByKey(template, "dados_tab") ?? findByKey(template, "configs_tab");
  if (!dataTab || !Array.isArray(dataTab.contents)) return;
  dataTab.contents = dataTab.contents.filter((node) => node.key !== "progressao_oni_recursos_panel");
  const fields = Object.entries(PDV_DICE_LEVELS).map(([level, dice]) => makeNumberField(
    `pdv_oni_ganho_nvl${level}`,
    `PDV ganho Nv. ${level} (${dice})`,
    `Resultado persistido do ganho de PDV do nível ${level}. Role uma vez e salve aqui.`,
  ));
  fields.push(
    makeNumberField("oni_nivel_na_queda", "Nível na Queda", "Somente Exterminador Corrompido."),
    makeNumberField("oni_pdr_maximo_antes_queda", "PDR máximo antes da Queda", "Somente Exterminador Corrompido."),
  );
  dataTab.contents.push(makePanel("progressao_oni_recursos_panel", [
    { ...makePanel("progressao_oni_titulo_panel", [], ""), type: "label", value: orbitron("PROGRESSÃO DE RECURSOS ONI", "#C1000C", 14), style: "label", size: "full-size" },
    ...fields,
  ], "grid-4"));

  dataTab.contents = dataTab.contents.filter((node) => node.key !== "origem_oni_recursos_panel");
  const origemLabel = (text) => ({
    ...makePanel(`origem_label_${text.replace(/[^a-z_]/gi, "")}`, [], ""),
    type: "label",
    value: `<span class="na-sheet-text na-sheet-size-md">${text}</span>`,
    style: "label",
    size: "full-size",
  });
  dataTab.contents.push(makePanel("origem_oni_recursos_panel", [
    { ...makePanel("origem_oni_titulo_panel", [], ""), type: "label", value: orbitron("ORIGEM — RECURSOS INICIAIS", "#B36CFF", 14), style: "label", size: "full-size" },
    origemLabel("PDV fixo da Origem: ${origem_pdv_fixo}$"),
    origemLabel("PDK fixo da Origem: ${origem_pdk_fixo}$"),
    origemLabel("Multiplicador de FDV do PDK: x${origem_pdk_fdv_mult}$"),
    origemLabel("PDV inicial da Origem: ${origem_oni_pdv_inicial}$"),
    origemLabel("PDK inicial da Origem: ${origem_oni_pdk_inicial}$"),
  ], "grid-2"));
}

export function migrateOniTemplate(source) {
  const migrated = replaceOniResourceNames(structuredClone(source));
  migrated.name = "oni_template";
  migrated.type = "_template";
  migrated._id = "PQR15WSdSqBcN15w";
  migrated.prototypeToken = { ...(migrated.prototypeToken ?? {}), name: "oni_template" };
  if (migrated.flags?.["custom-system-builder"]) {
    delete migrated.flags["custom-system-builder"].templateHistory;
    delete migrated.flags["custom-system-builder"].templateHistoryRedo;
  }

  configureOniLevelAndRank(migrated);
  configureOniOrigins(migrated);
  configureOniOriginBonuses(migrated);
  configureOniAttributes(migrated);
  configureOniProgression(migrated);
  configureOniBarsAndLabels(migrated);
  configureOniProgressionFields(migrated);

  // Remove hidden attributes that are Slayer-only (should not exist in Oni template)
  const hidden = migrated.system?.hidden;
  if (Array.isArray(hidden)) {
    migrated.system.hidden = hidden.filter((h) =>
      h.name !== "origem_oni_pdv_val" && h.name !== "origem_oni_pdr_val"
    );
  }

  const keys = collectKeys(migrated);
  const required = [
    "pdv_oni_maximo_num", "pdv_oni_atual_num", "pdk_oni_maximo_num", "pdk_oni_atual_num",
  ];
  const missing = required.filter((key) => !keys.has(key));
  if (missing.length) throw new Error(`Template ONI sem keys obrigatórias: ${missing.join(", ")}`);
  if (JSON.stringify(migrated).includes("pdr_oni")) throw new Error("Migração ONI deixou referências pdr_oni.");
  return migrated;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const sourcePath = path.resolve(process.argv[2] ?? defaultSource);
  const targetPath = path.resolve(process.argv[3] ?? defaultTarget);
  const source = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
  fs.writeFileSync(targetPath, `${JSON.stringify(migrateOniTemplate(source), null, 2)}\n`, "utf8");
  console.log(`Export de Actor ONI: ${targetPath}`);
}
