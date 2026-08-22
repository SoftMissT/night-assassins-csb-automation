import { readFileSync, writeFileSync } from "node:fs";

const path = "src/templates/actors/npc-template.json";
const npc = JSON.parse(readFileSync(path, "utf8"));

const ATTRS = [
  { key: "vit", label: "VIT", test: "TESTE DE VITALIDADE", color: "#36D67A" },
  { key: "dex", label: "DEX", test: "TESTE DE DESTREZA", color: "#28D7FF" },
  { key: "for", label: "FOR", test: "TESTE DE FORCA", color: "#C1000C" },
  { key: "car", label: "CAR", test: "TESTE DE CARISMA", color: "#FF9100" },
  { key: "fdv", label: "FDV", test: "TESTE DE FORCA DE VONTADE", color: "#BB97F9" },
  { key: "int", label: "INT", test: "TESTE DE INTELIGENCIA", color: "#F8EB4D" },
  { key: "sab", label: "SAB", test: "TESTE DE SABEDORIA", color: "#D45CA4" },
];

function makeButton(a) {
  return {
    key: `npc_${a.key}_rolar`,
    colSpan: 1, rowSpan: 1, cssClass: "", role: 0, editRole: 0, permission: 0,
    tooltip: "", visibilityFormula: "", editableFormula: "", escapeHTML: false,
    type: "label", size: "full-size", icon: "",
    value: `<span class="na-sheet-text na-sheet-label na-sheet-btn na-sheet-role-${a.key}">${a.label}</span>`,
    prefix: "", suffix: "",
    rollMessage: `%{return await (await fromUuid('Compendium.night-assassins-csb-automation.night-assassins-macros.Macro.NARollMode000001'))?.execute({actorUuid:entity.uuid,test:'${a.test}',attr:'${a.label}',color:'${a.color}'}); return '';}%`,
    altRollMessage: "", rollMessageToChat: true, altRollMessageToChat: false, style: "label",
  };
}

function makeDisplay(a) {
  return {
    key: `atr_${a.key}_valor`,
    colSpan: 1, rowSpan: 1, cssClass: "", role: 0, editRole: 0, permission: 0,
    tooltip: "", visibilityFormula: "", editableFormula: "", escapeHTML: false,
    type: "label", size: "full-size", icon: "",
    value: `<span class="na-sheet-text na-sheet-label na-sheet-role-${a.key}">\${${a.key}_display}$</span>`,
    prefix: "", suffix: "", rollMessage: "", altRollMessage: "",
    rollMessageToChat: false, altRollMessageToChat: false, style: "label",
  };
}

function makeTemp(a) {
  return {
    key: `bonus_atr_${a.key}_valor_temp`,
    colSpan: 1, rowSpan: 1, cssClass: "", role: 0, editRole: 0, permission: 0,
    tooltip: "", visibilityFormula: "", editableFormula: "", escapeHTML: false,
    type: "numberField", size: "full-size", label: a.label, defaultValue: 0, min: null, max: null, step: null,
  };
}

const title = {
  key: "npc_atributos_titulo", colSpan: 1, rowSpan: 1, cssClass: "", role: 0, editRole: 0, permission: 0,
  tooltip: "", visibilityFormula: "", editableFormula: "", escapeHTML: false,
  type: "label", size: "full-size", icon: "",
  value: '<span class="na-sheet-text na-sheet-label na-sheet-size-lg">ATRIBUTOS</span>',
  prefix: "", suffix: "", rollMessage: "", altRollMessage: "",
  rollMessageToChat: false, altRollMessageToChat: false, style: "label",
};

const botoesPanel = {
  key: "npc_atributos_botoes", colSpan: 1, rowSpan: 1, cssClass: "", role: 0, editRole: 0, permission: 0,
  tooltip: "", visibilityFormula: "", editableFormula: "", escapeHTML: false,
  type: "panel", flow: "grid-7", contents: ATTRS.map(makeButton),
};

const displayPanel = {
  key: "npc_atributos_display", colSpan: 1, rowSpan: 1, cssClass: "", role: 0, editRole: 0, permission: 0,
  tooltip: "", visibilityFormula: "", editableFormula: "", escapeHTML: false,
  type: "panel", flow: "grid-7", contents: ATTRS.map(makeDisplay),
};

const tempPanel = {
  key: "npc_bonus_temp", colSpan: 1, rowSpan: 1, cssClass: "", role: 0, editRole: 0, permission: 0,
  tooltip: "", visibilityFormula: "", editableFormula: "", escapeHTML: false,
  type: "panel", flow: "grid-7", contents: ATTRS.map(makeTemp),
};

const hidden = ATTRS.map((a) => ({
  name: `${a.key}_display`,
  formula: `atr_${a.key}_valor_config + bonus_atr_${a.key}_valor_temp`,
}));

const hiddenConfig = ATTRS.map((a) => ({
  name: `atr_${a.key}_valor_config`,
  formula: "0",
}));

npc.system.body.contents.unshift(tempPanel, displayPanel, botoesPanel, title);
npc.system.hidden = [...hidden, ...hiddenConfig];

writeFileSync(path, JSON.stringify(npc, null, 2) + "\n", "utf8");
console.log("NPC template atualizado:");
console.log("  Body contents:", npc.system.body.contents.length);
console.log("  Hidden formulas:", npc.system.hidden.length);
console.log("  Attributes:", ATTRS.length);
