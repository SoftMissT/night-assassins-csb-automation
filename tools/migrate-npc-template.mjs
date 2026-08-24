import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { useNativeCsbPresentation } from "./native-csb-style.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = path.join(root, "src", "templates", "actors", "npc-template.json");

function walk(node, callback) {
  if (!node || typeof node !== "object") return;
  callback(node);
  for (const value of Object.values(node)) walk(value, callback);
}

function base(type, key, label = "") {
  return {
    key, colSpan: 1, rowSpan: 1, cssClass: "", role: 0, editRole: 0,
    permission: 0, tooltip: "", visibilityFormula: "", editableFormula: "",
    escapeHTML: false, type, size: "full-size", label,
  };
}

function numberField(key, label, defaultValue = 0) {
  return {
    ...base("numberField", key, label), defaultValue: String(defaultValue), allowDecimal: false,
    minVal: "0", maxVal: "", allowRelative: false, showControls: true, controlsStyle: "hover",
  };
}

function resourceLabel(key, value, color) {
  return {
    ...base("label", key), icon: "", prefix: "", suffix: "", style: "label",
    rollMessage: "", altRollMessage: "", rollMessageToChat: false, altRollMessageToChat: false,
    value: `<span class="na-sheet-text na-sheet-stat na-sheet-size-lg" style="color:${color}">${value}</span>`,
  };
}

export function migrateNpcTemplate(source) {
  const template = structuredClone(source);
  let resources = null;
  walk(template.system?.body, (node) => {
    if (node.key === "npc_recursos" && node.type === "panel") resources = node;
  });
  if (!resources) throw new Error("Painel npc_recursos não encontrado.");

  const pdrKeys = new Set(["npc_pdr_base", "npc_pdr_total_label", "npc_pdr_gasto", "npc_pdr_recuperado", "npc_pdr_extra"]);
  resources.contents = (resources.contents ?? []).filter((entry) => !pdrKeys.has(entry?.key));
  resources.contents.push(
    numberField("npc_pdr_base", "PDR base", 5),
    resourceLabel("npc_pdr_total_label", "PDR: ${npc_pdr_atual}$ / ${npc_pdr_total}$", "#0EF5FF"),
    numberField("npc_pdr_gasto", "PDR gasto", 0),
    numberField("npc_pdr_recuperado", "PDR recuperado", 0),
    numberField("npc_pdr_extra", "PDR extra", 0),
  );

  const formulas = new Map([
    ["npc_pdr_total", "${max(0,fallback(npc_pdr_base,0)+fallback(npc_pdr_extra,0))}$"],
    ["npc_pdr_atual", "${min(npc_pdr_total,max(0,npc_pdr_total-fallback(npc_pdr_gasto,0)+fallback(npc_pdr_recuperado,0)))}$"],
  ]);
  template.system.hidden ??= [];
  for (const [name, value] of formulas) {
    const existing = template.system.hidden.find((entry) => entry.name === name);
    if (existing) existing.value = value;
    else template.system.hidden.push({ name, value });
  }

  template.system.attributeBar = {
    ...(template.system.attributeBar ?? {}),
    npc_pdv_barra: { value: "${npc_pdv_atual}$", max: "${npc_pdv_total}$", editable: false },
    npc_pdr_barra: { value: "${npc_pdr_atual}$", max: "${npc_pdr_total}$", editable: false },
  };
  template.prototypeToken = {
    ...(template.prototypeToken ?? {}),
    bar1: { attribute: "npc_pdv_barra" },
    bar2: { attribute: "npc_pdr_barra" },
  };
  return template;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const source = JSON.parse(await readFile(target, "utf8"));
  const migrated = migrateNpcTemplate(source);
  useNativeCsbPresentation(migrated);
  await writeFile(target, `${JSON.stringify(migrated, null, 2)}\n`, "utf8");
  console.info(`Template NPC atualizado em ${target}`);
}
