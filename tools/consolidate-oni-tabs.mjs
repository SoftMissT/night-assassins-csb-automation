import { readFileSync, writeFileSync } from "node:fs";

const path = "src/templates/actors/oni-template.json";
const tpl = JSON.parse(readFileSync(path, "utf8"));

const tabbed = tpl.system.body.contents.find((c) => c.type === "tabbedPanel");

// Tab 0 = Perfil (Biografia)
const perfilTab = tabbed.contents[0]; // perfil_oni_tab
// Tab 1 = Combate
const combatTab = tabbed.contents[1]; // combat_oni_tab
// Tab 2 = Inventário
const inventarioTab = tabbed.contents[2]; // inventario_oni_tab
// Tab 3 = Notas (REMOVER)
// Tab 4 = Configurações (manter)

// Merge Biografia content into Combate tab (prepend)
const bioContent = perfilTab.contents || [];
const combatContent = combatTab.contents || [];
const inventarioContent = inventarioTab.contents || [];

// Build new Combate tab: [biografia_title] + bio + [separator] + combat + [separator] + inventario
const bioTitle = {
  key: "oni_secao_biografia",
  colSpan: 1, rowSpan: 1, cssClass: "", role: 0, editRole: 0, permission: 0,
  tooltip: "", visibilityFormula: "", editableFormula: "", escapeHTML: false,
  type: "label", size: "full-size", icon: "",
  value: '<span class="na-sheet-text na-sheet-label na-sheet-size-lg">BIOGRAFIA</span>',
  prefix: "", suffix: "", style: "label",
  rollMessage: "", altRollMessage: "", rollMessageToChat: false, altRollMessageToChat: false,
};

const inventarioTitle = {
  key: "oni_secao_inventario",
  colSpan: 1, rowSpan: 1, cssClass: "", role: 0, editRole: 0, permission: 0,
  tooltip: "", visibilityFormula: "", editableFormula: "", escapeHTML: false,
  type: "label", size: "full-size", icon: "",
  value: '<span class="na-sheet-text na-sheet-label na-sheet-size-lg">INVENTÁRIO</span>',
  prefix: "", suffix: "", style: "label",
  rollMessage: "", altRollMessage: "", rollMessageToChat: false, altRollMessageToChat: false,
};

// New Combate tab contents: bio + combat + inventario
combatTab.contents = [
  bioTitle,
  ...bioContent,
  ...combatContent,
  inventarioTitle,
  ...inventarioContent,
];

// Create Skills tab (placeholder for Oni abilities)
const skillsTab = {
  key: "skills_oni_tab",
  type: "tab",
  name: "",
  tooltip: "",
  role: 0,
  permission: 0,
  visibilityFormula: "",
  contents: [
    {
      key: "oni_habilidades_titulo",
      colSpan: 1, rowSpan: 1, cssClass: "", role: 0, editRole: 0, permission: 0,
      tooltip: "", visibilityFormula: "", editableFormula: "", escapeHTML: false,
      type: "label", size: "full-size", icon: "",
      value: '<span class="na-sheet-text na-sheet-label na-sheet-size-lg">HABILIDADES ONI</span>',
      prefix: "", suffix: "", style: "label",
      rollMessage: "", altRollMessage: "", rollMessageToChat: false, altRollMessageToChat: false,
    },
    {
      key: "oni_habilidades_area",
      colSpan: 1, rowSpan: 1, cssClass: "", role: 0, editRole: 0, permission: 0,
      tooltip: "", visibilityFormula: "", editableFormula: "", escapeHTML: false,
      type: "textArea", size: "full-size",
      defaultValue: "Dom do Sangue: (use /oni-blood-gift para rolar 1d100)\n\nHabilidades Especiais:\n",
      maxLength: null,
    },
  ],
};

// Config tab: add GM visibility formula
const configsTab = tabbed.contents[4]; // configs_tab

// Rebuild tabbed panel: Combate, Skills, Configs
tabbed.contents = [combatTab, skillsTab, configsTab];

writeFileSync(path, JSON.stringify(tpl, null, 2) + "\n", "utf8");
console.log("Oni template consolidado:");
console.log("  Tabs:", tabbed.contents.length, "(era 5)");
tabbed.contents.forEach((t, i) => console.log("  ", i, t.key));
console.log("  Combate contents:", combatTab.contents.length, "(era", combatContent.length, "+ bio/inventario)");
