// Reorganização das abas do template Actor Slayer (2026-08-23).
// 10 abas -> 6 abas: PERÍCIAS | COMBATE | SKILLS | INVENTÁRIO | NOTAS | CONFIG / DADOS
// Fonte canônica: src/templates/actors/slayer-template.json (usada por tools/build-template-sources.mjs).
// Regras: nenhuma key apagada/renomeada; rollMessage/fromUuid/macros preservados; só layout.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const templatePath = path.join(root, "src", "templates", "actors", "slayer-template.json");

const template = JSON.parse(await readFile(templatePath, "utf8"));

// 1. Nome do template
template.name = "slayer_template";
if (template.prototypeToken?.name) template.prototypeToken.name = "slayer_template";

// 2. Localizar o tabbedPanel principal
let main = null;
(function walk(node) {
  if (!node || typeof node !== "object" || main) return;
  if (Array.isArray(node)) { node.forEach(walk); return; }
  if (node.type === "tabbedPanel" && Array.isArray(node.contents) && node.contents.length >= 8) main = node;
  Object.values(node).forEach(walk);
})(template.system.body);
if (!main) throw new Error("tabbedPanel principal não encontrado");

const byKey = (key) => {
  const tab = main.contents.find((entry) => entry.key === key);
  if (!tab) throw new Error(`aba ${key} não encontrada`);
  return tab;
};

const findComponentByKey = (node, wanted) => {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const child of node) { const hit = findComponentByKey(child, wanted); if (hit) return hit; }
    return null;
  }
  if ((node.type === "itemContainer" || node.type === "panel") && node.key === wanted) return node;
  for (const value of Object.values(node)) { const hit = findComponentByKey(value, wanted); if (hit) return hit; }
  return null;
};

const findLabelWithValue = (node, needle) => {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const child of node) { const hit = findLabelWithValue(child, needle); if (hit) return hit; }
    return null;
  }
  if (node.type === "label" && String(node.value ?? "").includes(needle)) return node;
  for (const value of Object.values(node)) { const hit = findLabelWithValue(value, needle); if (hit) return hit; }
  return null;
};

const findTextAreaByKey = (node, wanted) => {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const child of node) { const hit = findTextAreaByKey(child, wanted); if (hit) return hit; }
    return null;
  }
  if (node.type === "textArea" && node.key === wanted) return node;
  for (const value of Object.values(node)) { const hit = findTextAreaByKey(value, wanted); if (hit) return hit; }
  return null;
};

// 3. Referências às abas antigas
const pericias = byKey("pericias_tab");
const combate = byKey("combat_slayer_tab");
const skills = byKey("skills_slayer_tab");
const inventario = byKey("inventario_slayer_tab");
const notas = byKey("notas_slayer_tab");
const configs = byKey("configs_tab");
const perfilAntigo = byKey("perfil_slayer_tab");
const condicoesAntiga = byKey("status_slayer_tab");
const interludiosAntigo = byKey("interludios_slayer_tab");
const dadosAntiga = byKey("dados_tab");

// 4. Mover componentes (referências movidas, nunca copiadas — keys preservadas)
// 4a. COMBATE recebe Resistências + Status (da aba Condições)
combate.contents.push(...condicoesAntiga.contents.filter((c) => c.key !== "status_slayer_titulo"));

// 4b. COMBATE recebe o container único de armas
const armasContainer = findComponentByKey(inventario, "inventario_slayer_armas");
if (!armasContainer) throw new Error("container inventario_slayer_armas não encontrado");
inventario.contents = inventario.contents.filter((entry) => entry !== armasContainer);
combate.contents.push(armasContainer);

// 4c. NOTAS recebe os campos do Perfil/Bio (painel inteiro, keys intactas)
const perfilPanel = findComponentByKey(perfilAntigo, "perfil_slayer_resumo_panel");
if (!perfilPanel) throw new Error("painel perfil_slayer_resumo_panel não encontrado");
notas.contents.push(perfilPanel);

// 4c'. O campo Biografia fica fora do resumo_panel — mover também
const bioField = findTextAreaByKey(perfilAntigo, "perfil_slayer_bio");
if (!bioField) throw new Error("campo perfil_slayer_bio não encontrado");
perfilAntigo.contents = perfilAntigo.contents.filter((entry) => entry !== bioField);
notas.contents.push(bioField);

// 4d. NOTAS recebe os Interlúdios
for (const key of ["interludio_semana_panel", "interludio_cabacas_panel", "interludio_reflexo_panel"]) {
  const painel = findComponentByKey(interludiosAntigo, key);
  if (!painel) throw new Error(`painel ${key} não encontrado`);
  notas.contents.push(painel);
}

// 5. Novos componentes visuais mínimos (clonagem de schema existente)
const labelModelo = findLabelWithValue(notas, "NOTAS") ?? findLabelWithValue(perfilAntigo, "Perfil") ?? findLabelWithValue(main, "Rank:");
const bioModelo = bioField; // já removido da aba antiga acima; serve como modelo de textArea
if (!labelModelo || !bioModelo) throw new Error("modelos de label/textArea não encontrados");

// key sempre explicitamente definida ("") para não herdar a key do modelo clonado
const novoLabel = (key, value) => ({ ...structuredClone(labelModelo), key: key ?? "", value });
const novaTextArea = (key, label) => ({ ...structuredClone(bioModelo), key, label });

const novoPanel = (key, title, children) => ({
  ...structuredClone(perfilPanel),
  key,
  title,
  contents: [[children]],
});

// 5a. Painel de Acúmulos em COMBATE (exibe estados já persistidos pelos serviços)
const ESTADOS = [
  ["Água", "resp_agua_estado"],
  ["Chamas", "resp_chamas_estado"],
  ["Pedra", "resp_pedra_estado"],
  ["Névoa", "resp_nevoa_estado"],
  ["Metal", "resp_metal_estado"],
  ["Neve", "resp_neve_estado"],
];
combate.contents.push(novoPanel("combate_acumulos_slayer_panel", "Acúmulos de Respiração", [
  novoLabel("", '<span class="na-sheet-text na-sheet-label na-sheet-size-lg na-sheet-role-lime">ACÚMULOS DE RESPIRAÇÃO</span>'),
  ...ESTADOS.map(([nome, key]) => novoLabel("", `<span class="na-sheet-text na-sheet-size-md"><strong>${nome}:</strong><br>\${${key}}$</span>`)),
]));

// 5b. Painel Nichirin/Metais/Alma da Lâmina em SKILLS (só texto livre, sem automação nova)
skills.contents.push(novoPanel("alma_lamina_slayer_panel", "Nichirin / Metais / Alma da Lâmina", [
  novoLabel("", '<span class="na-sheet-text na-sheet-label na-sheet-size-lg na-sheet-role-gold">NICHIRIN / METAIS / ALMA DA LÂMINA</span>'),
  novaTextArea("alma_lamina_slayer_notas", "Alma da Lâmina"),
]));

// 5c. Notas livres em NOTAS
notas.contents.push(novaTextArea("notas_slayer_livres", "Notas"));

// 6. CONFIG / DADOS: fusão das abas Configurações + Dados
configs.contents.push(...dadosAntiga.contents);

// 7. Renomear e montar a ordem final
pericias.name = "PERÍCIAS";
combate.name = "COMBATE";
skills.name = "SKILLS";
inventario.name = "INVENTÁRIO";
notas.name = "NOTAS";
configs.name = "CONFIG / DADOS";

main.contents = [pericias, combate, skills, inventario, notas, configs];

await writeFile(templatePath, `${JSON.stringify(template, null, 2)}\n`);
console.log("Abas finais:", main.contents.map((t) => `${t.name} (${t.key})`).join(" | "));
console.log("Nome do template:", template.name);
