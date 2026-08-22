import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const path = fileURLToPath(new URL("../src/templates/actors/npc-template.json", import.meta.url));
const npc = JSON.parse(readFileSync(path, "utf8"));

function base(key, extra = {}) {
  return {
    key,
    colSpan: 1,
    rowSpan: 1,
    cssClass: "",
    role: 0,
    editRole: 0,
    permission: 0,
    tooltip: "",
    visibilityFormula: "",
    editableFormula: "",
    escapeHTML: false,
    ...extra,
  };
}

const numberField = (key, label, defaultValue) => base(key, {
  type: "numberField",
  size: "full-size",
  label,
  defaultValue,
  allowDecimal: false,
  minVal: "0",
  maxVal: "",
  allowRelative: false,
  showControls: true,
  controlsStyle: "hover",
});

const vidaPanel = {
  key: "npc_vida",
  colSpan: 1,
  rowSpan: 1,
  cssClass: "",
  role: 0,
  editRole: 0,
  permission: 0,
  tooltip: "",
  visibilityFormula: "",
  editableFormula: "",
  escapeHTML: false,
  type: "panel",
  size: "full-size",
  label: "",
  contents: [
    numberField("npc_pdv_base", "PDV máximo", "10"),
    base("npc_pdv_total_label", {
      type: "label",
      size: "full-size",
      label: "",
      icon: "",
      prefix: "",
      suffix: "",
      style: "label",
      rollMessage: "",
      altRollMessage: "",
      rollMessageToChat: false,
      altRollMessageToChat: false,
      value: `<div class="custom-orbitron-wrapper"><span style="font-family:'Orbitron','Times New Roman',serif;font-size:16px;font-weight:700;color:#FF2B4A;text-transform:uppercase;letter-spacing:.12em;">PDV: \${npc_pdv_atual}$ / \${npc_pdv_total}$</span></div>`,
    }),
    numberField("npc_pdv_dano", "Dano tomado", "0"),
    numberField("npc_pdv_curado", "Curado", "0"),
  ],
};

const body = npc.system.body.contents;
if (!body.some((c) => c.key === "npc_vida")) {
  const insertAt = body.findIndex((c) => c.key === "npc_atributos_botoes");
  body.splice(insertAt + 1, 0, vidaPanel);
}

const hidden = npc.system.hidden;
if (!hidden.some((h) => h.name === "npc_pdv_total")) {
  hidden.push({ name: "npc_pdv_total", value: "${fallback(npc_pdv_base,0)}$" });
}
if (!hidden.some((h) => h.name === "npc_pdv_atual")) {
  hidden.push({ name: "npc_pdv_atual", value: "${max(0,npc_pdv_total-fallback(npc_pdv_dano,0)+fallback(npc_pdv_curado,0))}$" });
}

npc.system.attributeBar ??= {};
npc.system.attributeBar.npc_pdv_barra ??= {
  value: "${npc_pdv_atual}$",
  max: "${npc_pdv_total}$",
  editable: false,
};

writeFileSync(path, `${JSON.stringify(npc, null, 2)}\n`);
console.log("NPC template atualizado: painel npc_vida + hidden formulas + attributeBar.");
