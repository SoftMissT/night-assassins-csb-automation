import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "src", "templates", "actors", "oni-minion-template.json");

function base(type, key, label) {
  return {
    key, colSpan: 1, rowSpan: 1, cssClass: "", role: 0, editRole: 0,
    permission: 0, tooltip: "", visibilityFormula: "", editableFormula: "",
    escapeHTML: false, type, size: "full-size", label,
  };
}

function textField(key, label, defaultValue = "") {
  return { ...base("textField", key, label), defaultValue, charList: "", maxLength: null, autocomplete: "" };
}

function numberField(key, label, defaultValue = 0, minVal = 0, maxVal = null) {
  return {
    ...base("numberField", key, label), defaultValue: String(defaultValue), allowDecimal: false,
    minVal: String(minVal), maxVal: maxVal === null ? "" : String(maxVal), allowRelative: false,
    showControls: true, controlsStyle: "hover",
  };
}

function textArea(key, label) {
  return { ...base("textArea", key, label), rowSpan: 3, defaultValue: "", style: "sheet" };
}

function label(key, value, color = "#FF2B4A") {
  return {
    ...base("label", key, ""), icon: "", prefix: "", suffix: "", style: "label",
    rollMessage: "", altRollMessage: "", rollMessageToChat: false, altRollMessageToChat: false,
    value: `<div class="custom-orbitron-wrapper"><span style="font-family:'Orbitron','Times New Roman',serif;font-size:16px;font-weight:700;color:${color};text-transform:uppercase;letter-spacing:.12em;">${value}</span></div>`,
  };
}

function actionButton(key, value, script, color = "#FF2B4A") {
  return {
    ...label(key, value, color), style: "button", rollMessage: script,
    rollMessageToChat: false, altRollMessage: "", altRollMessageToChat: false,
  };
}

function panel(key, title, contents, flow = "grid-2") {
  return {
    ...base("panel", key, ""), contents, flow, align: "center", verticalAlign: "top",
    collapsible: true, defaultCollapsed: false, title, titleStyle: "default",
  };
}

const attributes = [
  ["vit", "VIT", "#2ED36F"], ["dex", "DEX", "#28D7FF"], ["for", "FOR", "#FF2B4A"],
  ["car", "CAR", "#FF9100"], ["fdv", "FDV", "#BB97F9"], ["int", "INT", "#F8EB4D"],
  ["sab", "SAB", "#D45CA4"],
];

const attributeFields = attributes.flatMap(([key, title, color]) => [
  numberField(`oni_minion_${key}_base`, `${title} base`, 0, 0, 20),
  label(`oni_minion_${key}_display_label`, `${title}: \${oni_minion_${key}_display}$`, color),
]);

const hidden = attributes.map(([key]) => ({
  name: `oni_minion_${key}_display`,
  value: `\${fallback(oni_minion_${key}_base,0)+fallback(oni_minion_${key}_temp,0)}$`,
}));
for (const [key] of attributes) hidden.push({ name: `oni_minion_${key}_temp`, value: "0" });
hidden.push(
  { name: "acerto_label", value: "acerto_label_for" },
  { name: "oni_minion_pdv_total", value: "${fallback(oni_minion_pdv_base,0)+fallback(oni_minion_nivel,1)+fallback(oni_minion_vit_display,0)}$" },
  { name: "oni_minion_pdk_total", value: "${fallback(oni_minion_pdk_base,0)+fallback(oni_minion_fdv_display,0)}$" },
  { name: "oni_minion_pdv_atual", value: "${max(0,oni_minion_pdv_total-fallback(oni_minion_pdv_dano,0)+fallback(oni_minion_pdv_curado,0))}$" },
  { name: "oni_minion_pdk_atual", value: "${max(0,oni_minion_pdk_total-fallback(oni_minion_pdk_gasto,0)+fallback(oni_minion_pdk_recuperado,0))}$" },
);

const template = {
  name: "oni_minion_template",
  type: "_template",
  img: "modules/night-assassins-csb-automation/assets/icons/templates/na-oni-minion-template_icon.webp",
  system: {
    body: {
      contents: [
        label("oni_minion_title", "ONI MINION", "#FF2B4A"),
        panel("oni_minion_identity", "Identidade", [
          textField("oni_minion_nome", "Nome"), textField("oni_minion_tipo", "Tipo (Fraco/Comum/Forte)", "Fraco"),
          numberField("oni_minion_nivel", "Nível", 1, 1, 6), textField("oni_minion_pacote", "Pacote"),
          textField("oni_minion_ataque", "Ataque"), textField("oni_minion_traco", "Traço (exatamente um)"),
          textField("oni_minion_fraqueza", "Fraqueza"), textField("oni_minion_comportamento", "Comportamento"),
        ]),
        panel("oni_minion_attributes", "Atributos", attributeFields, "grid-4"),
        panel("oni_minion_resources", "Recursos", [
          numberField("oni_minion_pdv_base", "PDV base", 8, 0),
          label("oni_minion_pdv_total_label", "PDV: ${oni_minion_pdv_atual}$ / ${oni_minion_pdv_total}$", "#FF2B4A"),
          numberField("oni_minion_pdv_dano", "Dano tomado", 0, 0), numberField("oni_minion_pdv_curado", "Curado", 0, 0),
          numberField("oni_minion_pdk_base", "PDK base", 2, 0),
          label("oni_minion_pdk_total_label", "PDK: ${oni_minion_pdk_atual}$ / ${oni_minion_pdk_total}$", "#28D7FF"),
          numberField("oni_minion_pdk_gasto", "PDK gasto", 0, 0), numberField("oni_minion_pdk_recuperado", "PDK recuperado", 0, 0),
        ]),
        panel("oni_minion_combat", "Combate", [
          actionButton("oni_minion_acerto", "ACERTO", "%{await game.modules.get('night-assassins-csb-automation').api.rollHit({actorUuid:entity.uuid}); return '';}%", "#28D7FF"),
          actionButton("oni_minion_dano", "DANO", "%{await game.modules.get('night-assassins-csb-automation').api.rollDamage({actorUuid:entity.uuid}); return '';}%", "#FF2B4A"),
        ]),
        textArea("oni_minion_resumo", "Resumo e observações"),
      ],
    },
    header: {}, tabs: [], hidden,
    attributeBar: {
      oni_minion_pdv_barra: { value: "${oni_minion_pdv_atual}$", max: "${oni_minion_pdv_total}$", editable: false },
      oni_minion_pdk_barra: { value: "${oni_minion_pdk_atual}$", max: "${oni_minion_pdk_total}$", editable: false },
    },
    display: { width: 1200, height: 1200, fix_size: false, pp_width: 250, pp_height: 400 },
    templateSystemUniqueVersion: 1,
  },
  prototypeToken: { name: "oni_minion_template", displayName: 20, displayBars: 20, actorLink: false, bar1: { attribute: "oni_minion_pdv_barra" }, bar2: { attribute: "oni_minion_pdk_barra" } },
  items: [], effects: [], flags: {}, folder: null,
};

await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(template, null, 2)}\n`);
console.log(`Template Oni Minion gerado em ${output}`);
