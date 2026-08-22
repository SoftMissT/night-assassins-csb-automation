import { readFileSync, writeFileSync } from "node:fs";

const path = "src/templates/actors/oni-minion-template.json";
const tpl = JSON.parse(readFileSync(path, "utf8"));

const ATTRS = [
  { key: "vit", label: "VIT", test: "TESTE DE VITALIDADE", color: "#36D67A" },
  { key: "dex", label: "DEX", test: "TESTE DE DESTREZA", color: "#28D7FF" },
  { key: "for", label: "FOR", test: "TESTE DE FORCA", color: "#C1000C" },
  { key: "car", label: "CAR", test: "TESTE DE CARISMA", color: "#FF9100" },
  { key: "fdv", label: "FDV", test: "TESTE DE FORCA DE VONTADE", color: "#BB97F9" },
  { key: "int", label: "INT", test: "TESTE DE INTELIGENCIA", color: "#F8EB4D" },
  { key: "sab", label: "SAB", test: "TESTE DE SABEDORIA", color: "#D45CA4" },
];

function makeRollButton(a) {
  return {
    key: `oni_minion_${a.key}_rolar`,
    colSpan: 1, rowSpan: 1, cssClass: "", role: 0, editRole: 0, permission: 0,
    tooltip: "", visibilityFormula: "", editableFormula: "", escapeHTML: false,
    type: "label", size: "full-size", icon: "",
    value: `<span class="na-sheet-text na-sheet-label na-sheet-btn na-sheet-role-${a.key}">${a.label}</span>`,
    prefix: "", suffix: "",
    rollMessage: `%{return await (await fromUuid('Compendium.night-assassins-csb-automation.night-assassins-macros.Macro.NARollMode000001'))?.execute({actorUuid:entity.uuid,test:'${a.test}',attr:'${a.label}',color:'${a.color}'}); return '';}%`,
    altRollMessage: "", rollMessageToChat: true, altRollMessageToChat: false, style: "label",
  };
}

const attrPanel = tpl.system.body.contents.find(c => c.key === "oni_minion_attributes");

// Insert roll buttons before each display label pair
// Current order: base, display, base, display, ...
// New order per attr: base, roll_button, display
const newContents = [];
for (let i = 0; i < attrPanel.contents.length; i += 2) {
  const base = attrPanel.contents[i];      // numberField
  const display = attrPanel.contents[i + 1]; // label
  const attrIdx = Math.floor(i / 2);
  newContents.push(base);
  newContents.push(makeRollButton(ATTRS[attrIdx]));
  newContents.push(display);
}
attrPanel.contents = newContents;
attrPanel.flow = "grid-7";

writeFileSync(path, JSON.stringify(tpl, null, 2) + "\n", "utf8");
console.log("Oni Minion template atualizado:");
console.log("  Attribute panel contents:", attrPanel.contents.length, "(era 14, agora 21)");
console.log("  Roll buttons:", ATTRS.length);
