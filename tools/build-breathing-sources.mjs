import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WATER_BREATHING_FORMS, WATER_BREATH_TEMPLATE_ID } from "../scripts/water-breathing-data.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const exportPath = path.join(root, "csb-respiracao-forma-export.json");
const sourcePath = path.join(root, "respiracao_da_agua.json");
const outputDirectory = path.join(root, "build", "compendium", "respiracoes");

const actionLabels = Object.freeze({
  unica: "Única", ataque: "Ataque", especial: "Especial", completa: "Completa",
  reacao: "Reação", ataque_especial: "Ataque ou Especial",
});

function normalizeTemplateNode(node) {
  if (!node || typeof node !== "object") return node;
  if (Array.isArray(node)) return node.map(normalizeTemplateNode);
  const normalized = Object.fromEntries(Object.entries(node).map(([key, value]) => [key, normalizeTemplateNode(value)]));
  if (normalized.type === "richTextArea") normalized.type = "textArea";
  if (normalized.type === "textArea" && normalized.style === "dialogEditor") normalized.style = "dialog";
  return normalized;
}

function sourceForForm(sourceItems, form) {
  return sourceItems.find((item) => new RegExp(`^${form.order}º\\s+Estilo\\b`, "i").test(item.name));
}

function formProps(form, source) {
  const sourceSystem = source?.system ?? {};
  const props = {
    inventario_categoria: "respiracao",
    forma_id: form.id,
    forma_ordem: form.order,
    nome_forma: form.name,
    nome_jp: sourceSystem.japaneseName || form.jp,
    respiracao_nome: "Água",
    tipo_manobra: sourceSystem.maneuverType || actionLabels[form.action] || form.action,
    nivel_req: form.minLevel,
    descricao: sourceSystem.description || form.description,
    tem_requisito: (sourceSystem.requirement || form.requirement) ? 1 : 0,
    requisito_texto: sourceSystem.requirement || form.requirement || "",
    gatilho_texto: sourceSystem.trigger || "",
    combo_texto: sourceSystem.combo || "",
    notas_texto: sourceSystem.notes || "",
    sinergias_texto: Array.isArray(sourceSystem.synergy) ? sourceSystem.synergy.join("\n") : "",
  };
  for (let level = 1; level <= 4; level += 1) {
    const data = form.levels[level - 1];
    const sourceLevel = sourceSystem.levels?.find((entry) => Number(String(entry.level).match(/\d+/)?.[0]) === level);
    props[`tem_nvl${level}`] = data ? 1 : 0;
    props[`nvl${level}_custo`] = data?.cost ?? 0;
    props[`nvl${level}_dano`] = data?.damage ?? "";
    props[`nvl${level}_efeito`] = sourceLevel?.effect || data?.effect || "Indisponível";
    props[`nvl${level}_status`] = "";
    props[`nvl${level}_buff`] = "";
  }
  return props;
}

function formDocument(form, source) {
  return {
    id: form.documentId,
    type: "equippableItem",
    name: source?.name ? `Água — ${source.name}` : `Água — ${form.order}º Estilo: ${form.name}`,
    img: "modules/night-assassins-csb-automation/assets/icons/resp_agua.webp",
    data: { template: WATER_BREATH_TEMPLATE_ID, props: formProps(form, source) },
  };
}

function compendiumDocument(source, index) {
  const id = source.id;
  if (id.length !== 16) throw new Error(`ID Foundry inválido (${id.length}): ${id}`);
  return {
    _id: id,
    _key: `!items!${id}`,
    name: source.name,
    type: source.type,
    img: source.img,
    system: structuredClone(source.data ?? {}),
    effects: [],
    folder: null,
    sort: index * 100000,
    ownership: { default: 0 },
    flags: source.type === "equippableItem" ? { "custom-system-builder": { unique: true } } : {},
    _stats: {
      systemId: "custom-system-builder", systemVersion: "6.0.2", coreVersion: "14",
      createdTime: 0, modifiedTime: 0, lastModifiedBy: null,
    },
  };
}

const previous = JSON.parse(await readFile(exportPath, "utf8"));
const sourceItems = JSON.parse(await readFile(sourcePath, "utf8"));
const previousTemplate = previous.items?.find((item) => item.type === "_equippableItemTemplate");
if (!previousTemplate?.data?.body) throw new Error("Template-base de Forma de Respiração não encontrado.");
const template = normalizeTemplateNode(structuredClone(previousTemplate));
template.id = WATER_BREATH_TEMPLATE_ID;
template.name = "NA Respiração - Forma";
const documents = [template, ...WATER_BREATHING_FORMS.map((form) => formDocument(form, sourceForForm(sourceItems, form)))];

await writeFile(exportPath, `${JSON.stringify({ isCustomSystemExport: true, items: documents }, null, 2)}\n`);
await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
await Promise.all(documents.map((document, index) => writeFile(
  path.join(outputDirectory, `${String(index).padStart(2, "0")}-${document.id}.json`),
  `${JSON.stringify(compendiumDocument(document, index), null, 2)}\n`,
)));

console.log(`Preparados ${documents.length} documentos de Respiração para o Compêndio.`);
