import { readFileSync, writeFileSync } from "node:fs";

const path = "src/templates/actors/slayer-template.json";
const tpl = JSON.parse(readFileSync(path, "utf8"));
const tp = tpl.system.body.contents[4];
const combate = tp.contents.find((t) => t.key === "combat_slayer_tab");

// Idempotência: não adicionar se já existe
if (combate.contents.some((c) => c.key === "combat_slayer_armas_container")) {
  console.log("Container já existe — nada a fazer.");
  process.exit(0);
}

const armasContainer = {
  key: "combat_slayer_armas_container",
  colSpan: 1,
  rowSpan: 3,
  cssClass: "",
  role: 0,
  editRole: 0,
  permission: 0,
  tooltip: "Armas Items do personagem — operacional em Combate.",
  visibilityFormula: "",
  editableFormula: "",
  escapeHTML: false,
  type: "itemContainer",
  contents: [],
  rowLayout: [
    {
      key: "combate_armas_rolar",
      colSpan: 1,
      rowSpan: 1,
      cssClass: "",
      role: 0,
      editRole: 0,
      permission: 0,
      tooltip: "Rolar Acerto com a arma selecionada.",
      visibilityFormula: "",
      editableFormula: "",
      escapeHTML: false,
      type: "label",
      size: "full-size",
      icon: "fa-solid fa-crosshairs",
      value: '<span class="na-sheet-text" style="font-size:11px;font-weight:700;color:#28D7FF;text-transform:uppercase;">ROLAR</span>',
      prefix: "",
      suffix: "",
      rollMessage: "%{await game.modules.get('night-assassins-csb-automation')?.api?.rollHit({actorUuid:entity.uuid}); return '';}%",
      altRollMessage: "",
      rollMessageToChat: false,
      altRollMessageToChat: false,
      style: "button",
      align: "center",
      colName: "Rolar",
    },
  ],
  title: "ARMAS (Combate)",
  hideEmpty: true,
  hiddenColumns: [],
  sortOption: "manual",
  headDisplay: true,
  showCreate: false,
  showDelete: false,
  defaultTemplate: "",
  createItemDialogTitle: "",
  createItemDialogShowTemplateList: false,
  createItemDialogButton: "",
  newItemDefaultName: "",
  statusIcon: true,
  nameAlign: "left",
  nameLabel: "Arma",
  templateFilter: ["NAWeaponTpl00001"],
  itemFilterFormula: "equalText(item.inventario_categoria, 'arma')",
  sortPredicates: [],
};

const armasPanelIdx = combate.contents.findIndex(
  (c) => c.key === "combat_slayer_armas_panel",
);

if (armasPanelIdx >= 0) {
  combate.contents.splice(armasPanelIdx + 1, 0, armasContainer);
} else {
  combate.contents.push(armasContainer);
}

writeFileSync(path, JSON.stringify(tpl, null, 2) + "\n", "utf8");
console.log("itemContainer de armas adicionado em Combate. Índice:", armasPanelIdx + 1);
console.log("Combate agora tem", combate.contents.length, "itens");
