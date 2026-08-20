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

function configureOniOrigins(template) {
  const origin = findByKey(template, "origem_dropdown");
  if (!origin || !Array.isArray(origin.options)) throw new Error("Dropdown de origem Oni não encontrado.");
  origin.defaultValue = "origem_oni_escolha";
  const keys = new Set(origin.options.map((option) => option.key));
  if ([...keys].some((key) => !String(key).startsWith("origem_oni_"))) {
    throw new Error("O dropdown Oni contém origem que não usa o namespace origem_oni_.");
  }

  const pdvBase = {
    passado_triste: "22+vit_nvl1", personalidade_maligna: "16+vit_nvl1",
    rastreador_de_sangue: "20+vit_nvl1", genio_do_mal: "20+vit_nvl1",
    adepto_das_trevas: "19+vit_nvl1", comum: "18+vit_nvl1",
    corte_palida: "22+vit_nvl1", mare_negra: "28+vit_nvl1", raiz_podre: "30+vit_nvl1",
    realidade_distorcida: "28+vit_nvl1", tela_do_submundo: "30+vit_nvl1",
    oni_de_outras_terras: "20+vit_nvl1", transfigurado: "28+vit_nvl1",
    eco_eterno: "26+vit_nvl1", chama_negra: "32+vit_nvl1",
    demonio_de_linhagem_infernal: "21+vit_nvl1", espirito_ceifador: "20+vit_nvl1",
    monarca_demoniaco: "22+vit_nvl1", vampiro_de_linhagem: "19+vit_nvl1",
    exterminador_corrompido: "30+(vit_nvl1*3)+(10*oni_nivel_na_queda)",
  };
  const pdkBase = {
    passado_triste: "2+(fdv_nvl1*4)", personalidade_maligna: "3+(fdv_nvl1*4)",
    rastreador_de_sangue: "1+(fdv_nvl1*4)", genio_do_mal: "2+(fdv_nvl1*4)",
    adepto_das_trevas: "4+(fdv_nvl1*4)", comum: "8+(fdv_nvl1*3)",
    corte_palida: "18+(fdv_nvl1*3)", mare_negra: "18+(fdv_nvl1*3)",
    raiz_podre: "14+(fdv_nvl1*3)", realidade_distorcida: "20+(fdv_nvl1*3)",
    tela_do_submundo: "24+(fdv_nvl1*3)", oni_de_outras_terras: "16+(fdv_nvl1*3)",
    transfigurado: "14+(fdv_nvl1*3)", eco_eterno: "22+(fdv_nvl1*3)",
    chama_negra: "20+(fdv_nvl1*3)", demonio_de_linhagem_infernal: "20+(fdv_nvl1*3)",
    espirito_ceifador: "18+(fdv_nvl1*3)", monarca_demoniaco: "20+(fdv_nvl1*3)",
    vampiro_de_linhagem: "20+(fdv_nvl1*3)",
    exterminador_corrompido: "oni_pdr_maximo_antes_queda+(oni_nivel_na_queda*2)+(fdv_nvl1*3)",
  };
  const switchFormula = (table) => {
    const args = Object.entries(table).flatMap(([key, formula]) => [`'origem_oni_${key}'`, formula]).join(",\n  ");
    return `\${switchCase(origem_dropdown,\n  ${args},\n  0\n)}$`;
  };
  upsertHidden(template, "origem_oni_pdv_inicial", switchFormula(pdvBase));
  upsertHidden(template, "origem_oni_pdk_inicial", switchFormula(pdkBase));
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

function configureOniAttributes(template) {
  const formulas = {
    vit_display: "${fallback(atr_vit_valor_config,0)+fallback(bonus_atr_vit_valor_temp,0)}$",
    dex_display: "${fallback(atr_dex_valor_config,0)+fallback(bonus_atr_dex_valor_temp,0)}$",
    for_display: "${fallback(atr_for_valor_config,0)+fallback(bonus_atr_for_valor_temp,0)}$",
    car_display: "${fallback(atr_car_valor_config,0)+fallback(bonus_atr_car_valor_temp,0)}$",
    fdv_display: "${fallback(atr_fdv_valor_config,0)+fallback(bonus_atr_fdv_valor_temp,0)}$",
    int_display: "${fallback(atr_int_valor_config,0)+fallback(bonus_atr_int_valor_temp,0)}$",
    sab_display: "${fallback(atr_sab_valor_config,0)+fallback(bonus_atr_sab_valor_temp,0)}$",
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
    if (node.key === "pdk_oni_total_valor") node.value = orbitron("${pdk_oni_maximo_num}$", "#0EF5FF", 18);
    if (node.key === "pdk_oni_atual_valor_display") node.value = orbitron("${pdk_oni_atual_num}$", "#0EF5FF", 18);
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
  configureOniAttributes(migrated);
  configureOniProgression(migrated);
  configureOniBarsAndLabels(migrated);
  configureOniProgressionFields(migrated);

  const keys = collectKeys(migrated);
  const required = [
    "pdv_oni_total_valor", "pdv_oni_atual_valor_display", "pdv_oni_dano_tomado",
    "pdv_oni_dano_ferida", "pdk_oni_total_valor", "pdk_oni_atual_valor_display",
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
