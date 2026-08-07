import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultTemplate = path.join(repoRoot, "fvtt-Actor-slayer_template_atual-xif9qdBXTkeL1BXW.json");
const csbPackagePath = path.join(repoRoot, "csb-import-slayer-template.json");
const oniShellPath = path.join(repoRoot, "fvtt-Actor-oni_template-PQR15WSdSqBcN15w.json");

const directRenames = new Map([
  ["nome_cacador", "nome_slayer"],
  ["pdv_total_valor", "pdv_slayer_total_valor"],
  ["pdv_atual_valor_display", "pdv_slayer_atual_valor_display"],
  ["pdv_dano", "pdv_slayer_dano_tomado"],
  ["pdv_slayer_dano", "pdv_slayer_dano_tomado"],
  ["pdv_curado", "pdv_slayer_curado"],
  ["pdv_extra", "pdv_slayer_extra"],
  ["pdv_total_conta", "pdv_slayer_total_conta"],
  ["pdv_conta_atual", "pdv_slayer_conta_atual"],
  ["pdr_total_valor", "pdr_slayer_total_valor"],
  ["pdr_atual_valor_display", "pdr_slayer_atual_valor_display"],
  ["pdr_gasto_valor", "pdr_slayer_gasto_valor"],
  ["pdr_curado", "pdr_slayer_curado"],
  ["pdr_extra", "pdr_slayer_extra"],
  ["pdr_total_conta", "pdr_slayer_total_conta"],
  ["pdr_conta_atual", "pdr_slayer_conta_atual"],
  ["origem_val", "origem_slayer_pdv_val"],
  ["origem_pdr_val", "origem_slayer_pdr_val"],
  ["hab_pdv_bonus", "hab_slayer_pdv_bonus"],
  ["hab_pdr_bonus", "hab_slayer_pdr_bonus"],
  ["hab_pdr_por_nivel", "hab_slayer_pdr_por_nivel"],
  ["metal_pdr_bonus", "metal_slayer_pdr_bonus"],
  ["dex_nvl7dex_nvl7", "dex_nvl7"],
  ["car_nvl6", "car_nvl7"],
]);

for (let level = 1; level <= 14; level += 1) {
  directRenames.set(`pdv_nvl${level}`, `pdv_slayer_nvl${level}`);
  directRenames.set(`pdr_nvl${level}`, `pdr_slayer_nvl${level}`);
}

const tokenRenames = [...directRenames.entries()].sort((a, b) => b[0].length - a[0].length);

function renameString(value) {
  let result = value;
  for (const [from, to] of tokenRenames) {
    result = result.replace(new RegExp(`\\b${from}\\b`, "g"), to);
  }
  result = result.replace(/\borigem_(?!slayer_)([a-z_]+)_(pdv|pdr)_ini\b/g, "origem_slayer_$1_$2_ini");
  return result;
}

function visit(node) {
  if (typeof node === "string") return renameString(node);
  if (!node || typeof node !== "object") return node;
  if (Array.isArray(node)) return node.map(visit);

  for (const [key, value] of Object.entries(node)) {
    node[key] = visit(value);
  }

  if (typeof node.key === "string") node.key = node.key.trim();
  return node;
}

function walk(node, callback) {
  if (!node || typeof node !== "object") return;
  callback(node);
  if (Array.isArray(node)) node.forEach((entry) => walk(entry, callback));
  else Object.values(node).forEach((entry) => walk(entry, callback));
}

function fixCurrentPdvLabel(template) {
  let title = null;
  let numeric = null;
  walk(template.system?.header, (node) => {
    if (node.type !== "label") return;
    const value = String(node.value ?? "");
    if (value.includes(">PDV Atual<")) title = node;
    if (value.includes("${pdv_slayer_conta_atual}$")) numeric = node;
  });
  if (!title || !numeric) throw new Error("Labels de PDV atual não encontrados.");
  title.key = "pdv_slayer_atual_titulo";
  numeric.key = "pdv_slayer_atual_valor_display";
}

function fixKnownAttributeErrors(template) {
  walk(template, (node) => {
    if (node.key === "bonus_atr_fdv_valor") node.key = "atr_fdv_valor";
    if (node.name === "vit_display") {
      node.value = String(node.value).replace(/hab_tsuyoi_for_bonus/g, "hab_tsuyoi_vit_bonus");
    }
  });

  const hidden = template.system?.hidden;
  if (!Array.isArray(hidden)) throw new Error("system.hidden não é uma lista.");
  const seen = new Set();
  template.system.hidden = hidden.filter((entry) => {
    if (!entry?.name) return true;
    if (seen.has(entry.name)) return false;
    seen.add(entry.name);
    return true;
  });
}

function fixBars(template) {
  const bars = template.system?.attributeBar;
  const pdv = bars?.pdv_slayer_barra ?? bars?.pdv_barra;
  const pdr = bars?.pdr_slayer_barra ?? bars?.pdr_barra;
  if (!pdv || !pdr) throw new Error("Barras de PDV/PDR do Slayer não encontradas.");
  bars.pdv_slayer_barra = {
    ...pdv,
    value: "${pdv_slayer_atual_valor_display}$",
    max: "${pdv_slayer_total_valor}$",
  };
  bars.pdr_slayer_barra = {
    ...pdr,
    value: "${pdr_slayer_atual_valor_display}$",
    max: "${pdr_slayer_total_valor}$",
  };
  delete bars.pdv_barra;
  delete bars.pdr_barra;
}

const attributeButtons = new Map([
  ["VIT", ["TESTE DE VITALIDADE", "VIT", "#36D67A"]],
  ["DEX", ["TESTE DE DESTREZA", "DEX", "#28D7FF"]],
  ["FOR", ["TESTE DE FORÇA", "FOR", "#C1000C"]],
  ["CAR", ["TESTE DE CARISMA", "CAR", "#FF9100"]],
  ["FDV", ["TESTE DE FORÇA DE VONTADE", "FDV", "#BB97F9"]],
  ["INT", ["TESTE DE INTELIGÊNCIA", "INT", "#F8EB4D"]],
  ["SAB", ["TESTE DE SABEDORIA", "SAB", "#D45CA4"]],
  ["Arremesso", ["Arremesso", "FOR", "#C1000C"]],
  ["Foco", ["Concentração", "FDV", "#BB97F9"]],
  ["Adestramento", ["Adestramento", "CAR", "#FF9100"]],
  ["Atletismo", ["Atletismo", "FOR", "#C1000C"]],
  ["Bloqueio", ["Bloqueio", "FOR", "#C1000C"]],
  ["Esquiva", ["Esquiva", "DEX", "#28D7FF"]],
  ["Linguística", ["Linguística", "INT", "#F8EB4D"]],
  ["Arrombamento", ["Arrombamento", "FOR", "#C1000C"]],
  ["História", ["História", "INT", "#F8EB4D"]],
  ["Percepção", ["Percepção", "SAB", "#D45CA4"]],
  ["Sobrevivência", ["Sobrevivência", "SAB", "#D45CA4"]],
  ["Acrobacia", ["Acrobacia", "DEX", "#28D7FF"]],
  ["Intuição", ["Intuição", "SAB", "#D45CA4"]],
  ["Enganação", ["Enganação", "CAR", "#FF9100"]],
  ["Investigação", ["Investigação", "INT", "#F8EB4D"]],
  ["Corrida", ["Corrida", "DEX", "#28D7FF"]],
  ["Religião", ["Religião", "FDV", "#BB97F9"]],
  ["Presença", ["Presença", "CAR", "#FF9100"]],
  ["Etiqueta", ["Etiqueta", "CAR", "#FF9100"]],
]);

function labelText(value) {
  return String(value ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
    .replace(/^@import url\([^)]*\);\s*/i, "");
}

function attributeRoll(test, attr, color) {
  return `%{return await (await fromUuid('Compendium.night-assassins-csb-automation.night-assassins-macros.Macro.NARollMode000001'))?.execute({actorUuid:entity.uuid,test:'${test}',attr:'${attr}',color:'${color}'});}%`;
}

function fixRollButtons(template) {
  walk(template.system, (node) => {
    if (node.type !== "label" || !node.rollMessage) return;
    const text = labelText(node.value);
    const attribute = attributeButtons.get(text);
    if (attribute) {
      node.rollMessage = attributeRoll(...attribute);
      return;
    }
    if (text === "Acerto") {
      node.rollMessage = "%{return await (await fromUuid('Compendium.night-assassins-csb-automation.night-assassins-macros.Macro.NAHitRoll0000001'))?.execute({actorUuid:entity.uuid});}%";
    } else if (text === "Rolagem de dano") {
      node.rollMessage = "%{return await (await fromUuid('Compendium.night-assassins-csb-automation.night-assassins-macros.Macro.NADamageRoll0001'))?.execute({actorUuid:entity.uuid});}%";
    } else if (text === "Marca do Caçador") {
      node.rollMessage = "%{return await (await fromUuid('Compendium.night-assassins-csb-automation.night-assassins-macros.Macro.NAHunterMark0001'))?.execute({actorUuid:entity.uuid});}%";
    } else if (text === "Atributos") {
      node.rollMessage = "%{return await (await fromUuid('Compendium.night-assassins-csb-automation.night-assassins-macros.Macro.NAAttrLevel00001'))?.execute({actorUuid:entity.uuid,level:entity.system.props.nvl_pj});}%";
    }
  });
}

function removeDuplicateAttributeButton(template) {
  let foundSab = false;
  function prune(node) {
    if (!node || typeof node !== "object") return node;
    if (Array.isArray(node)) {
      return node.filter((entry) => {
        if (entry?.type !== "label" || !entry?.rollMessage || labelText(entry.value) !== "SAB") return true;
        if (foundSab) return false;
        foundSab = true;
        return true;
      }).map(prune);
    }
    for (const [key, value] of Object.entries(node)) node[key] = prune(value);
    return node;
  }
  prune(template.system?.body);
}

function textField(key, label, defaultValue = "") {
  return {
    key,
    colSpan: 1,
    rowSpan: 1,
    cssClass: "",
    role: 4,
    editRole: 4,
    permission: 0,
    tooltip: "Gerenciado automaticamente pelo módulo Night Assassins.",
    visibilityFormula: "",
    editableFormula: "",
    escapeHTML: false,
    type: "textField",
    size: "full-size",
    label,
    defaultValue,
    charList: "",
    maxLength: null,
    autocomplete: "",
  };
}

function fixResistanceAndWoundContract(template) {
  let resistanceButton = null;
  let resistanceDisplay = null;
  let combatTable = null;
  let configTab = null;
  let woundField = null;
  let totalLabel = null;

  walk(template.system, (node) => {
    const text = labelText(node.value);
    if (node.type === "label" && text === "GERENCIAR RESISTÊNCIAS") resistanceButton = node;
    if (node.key === "status_slayer_resistencias_display") resistanceDisplay = node;
    if (node.key === "tes" && node.type === "table") combatTable = node;
    if (node.key === "configs_tab" && node.type === "tab") configTab = node;
    if (node.key === "pdv_slayer_dano_ferida") woundField = node;
    if (node.key === "pdv_slayer_total_valor") totalLabel = node;
  });

  if (!resistanceButton || !resistanceDisplay || !combatTable || !configTab || !woundField || !totalLabel) {
    throw new Error("Componentes novos de Resistências/Ferida não encontrados no export Slayer.");
  }

  combatTable.key = "combat_slayer_table";
  resistanceButton.style = "button";
  resistanceButton.rollMessageToChat = false;
  resistanceButton.altRollMessageToChat = false;
  resistanceButton.rollMessage = "%{await (await fromUuid('Compendium.night-assassins-csb-automation.night-assassins-macros.Macro.NAResistance0001'))?.execute({actorUuid:entity.uuid,kind:'slayer'}); return '';}%";
  resistanceDisplay.value = "${status_slayer_resistencias_resumo}$";
  woundField.defaultValue = "0";
  woundField.minVal = "0";

  totalLabel.value = String(totalLabel.value).replace(
    "${pdv_slayer_total_conta}$",
    "${pdv_slayer_total_conta-pdv_slayer_dano_ferida}$",
  );

  const current = template.system.hidden?.find((entry) => entry.name === "pdv_slayer_conta_atual");
  if (!current) throw new Error("Hidden Attribute pdv_slayer_conta_atual não encontrado.");
  current.value = "${pdv_slayer_total_conta-pdv_slayer_dano_ferida+pdv_slayer_curado+pdv_slayer_extra-pdv_slayer_dano_tomado}$";

  const storageKeys = new Set();
  walk(configTab, (node) => { if (node.key) storageKeys.add(node.key); });
  const storage = [];
  if (!storageKeys.has("status_slayer_resistencias_dados")) {
    storage.push(textField("status_slayer_resistencias_dados", "Resistências (dados)", ""));
  }
  if (!storageKeys.has("status_slayer_resistencias_resumo")) {
    storage.push(textField("status_slayer_resistencias_resumo", "Resistências (resumo)", "Nenhuma resistência"));
  }
  if (storage.length > 0) {
    configTab.contents.push({
      key: "status_slayer_storage_panel",
      colSpan: 1,
      rowSpan: 1,
      cssClass: "",
      role: 4,
      editRole: 4,
      permission: 0,
      tooltip: "",
      visibilityFormula: "",
      editableFormula: "",
      escapeHTML: false,
      type: "panel",
      contents: storage,
      flow: "grid-2",
      align: "center",
      verticalAlign: "top",
      collapsible: true,
      defaultCollapsed: true,
      title: "Dados de Resistências",
      titleStyle: "default",
    });
  }
}

export function migrateSlayerTemplate(template) {
  const migrated = visit(structuredClone(template));
  fixCurrentPdvLabel(migrated);
  fixKnownAttributeErrors(migrated);
  fixBars(migrated);
  fixRollButtons(migrated);
  removeDuplicateAttributeButton(migrated);
  fixResistanceAndWoundContract(migrated);
  return migrated;
}

export function unwrapSlayerTemplate(document) {
  if (document?.isCustomSystemExport === true) {
    const actor = document.actors?.[0];
    if (!actor?.data) throw new Error("Pacote CSB sem template Slayer em actors[0].");
    return {
      _id: actor.id,
      name: actor.name,
      type: actor.type,
      system: actor.data,
      flags: actor.flags ?? {},
    };
  }
  return document;
}

export function wrapSlayerTemplate(template) {
  const system = structuredClone(template.system ?? {});
  delete system.props;
  const flags = structuredClone(template.flags ?? {});
  if (flags["custom-system-builder"]) {
    delete flags["custom-system-builder"].templateHistory;
    delete flags["custom-system-builder"].templateHistoryRedo;
  }
  return {
    isCustomSystemExport: true,
    actors: [{
      id: "NASlayerTpl00001",
      type: template.type,
      name: template.name,
      data: system,
      flags,
    }],
    items: [],
  };
}

export function buildActorExport(template, shell) {
  return {
    ...structuredClone(shell),
    name: template.name,
    type: template.type,
    img: template.img ?? "systems/custom-system-builder/img/template-logo.svg",
    system: structuredClone(template.system),
    prototypeToken: {
      ...structuredClone(shell.prototypeToken),
      name: template.name,
    },
    items: structuredClone(template.items ?? []),
    effects: structuredClone(template.effects ?? []),
    folder: null,
    ownership: structuredClone(template.ownership ?? { default: 0 }),
    flags: structuredClone(template.flags ?? {}),
    _id: "NASlayerTpl00001",
  };
}

export function validateSlayerTemplate(template) {
  const componentKeys = [];
  walk(template, (node) => {
    if (typeof node.key === "string" && node.key) componentKeys.push(node.key);
  });
  const hiddenNames = (template.system?.hidden ?? []).map((entry) => entry.name).filter(Boolean);
  const duplicates = [...componentKeys, ...hiddenNames].filter((key, index, all) => all.indexOf(key) !== index);
  const source = JSON.stringify(template);
  const forbidden = [
    "nome_cacador",
    "pdv_total_valor",
    "pdv_atual_valor_display",
    "pdv_dano",
    "pdv_slayer_dano",
    "pdv_curado",
    "pdv_extra",
    "pdr_total_valor",
    "pdr_atual_valor_display",
    "pdr_gasto_valor",
    "pdr_curado",
    "pdr_extra",
    "dex_nvl7dex_nvl7",
    "car_nvl6",
  ].filter((token) => new RegExp(`\\b${token}\\b`).test(source));
  return { duplicates: [...new Set(duplicates)], forbidden };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const sourcePath = path.resolve(process.argv[2] ?? defaultTemplate);
  const target = path.resolve(process.argv[3] ?? sourcePath);
  const source = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
  const template = unwrapSlayerTemplate(source);
  const migrated = migrateSlayerTemplate(template);
  const validation = validateSlayerTemplate(migrated);
  if (validation.duplicates.length || validation.forbidden.length) {
    throw new Error(`Migração inválida: ${JSON.stringify(validation)}`);
  }
  const shell = JSON.parse(fs.readFileSync(oniShellPath, "utf8"));
  fs.writeFileSync(target, `${JSON.stringify(buildActorExport(migrated, shell), null, 2)}\n`, "utf8");
  fs.writeFileSync(csbPackagePath, `${JSON.stringify(wrapSlayerTemplate(migrated), null, 2)}\n`, "utf8");
  console.log(`Export de Actor Slayer: ${target}`);
  console.log(`Pacote global CSB: ${csbPackagePath}`);
}
