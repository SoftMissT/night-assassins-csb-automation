import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WATER_BREATHING_FORMS, WATER_BREATH_TEMPLATE_ID } from "../scripts/water-breathing-data.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const exportPath = path.join(root, "csb-respiracao-forma-export.json");
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

function formProps(form) {
  const props = {
    inventario_categoria: "respiracao",
    forma_id: form.id,
    forma_ordem: form.order,
    nome_forma: form.name,
    nome_jp: form.jp,
    respiracao_nome: "Água",
    tipo_manobra: actionLabels[form.action] ?? form.action,
    nivel_req: form.minLevel,
    descricao: form.description,
    tem_requisito: form.requirement ? 1 : 0,
    requisito_texto: form.requirement ?? "",
  };
  for (let level = 1; level <= 4; level += 1) {
    const data = form.levels[level - 1];
    props[`tem_nvl${level}`] = data ? 1 : 0;
    props[`nvl${level}_custo`] = data?.cost ?? 0;
    props[`nvl${level}_dano`] = data?.damage ?? "";
    props[`nvl${level}_efeito`] = data?.effect ?? "Indisponível";
    props[`nvl${level}_status`] = "";
    props[`nvl${level}_buff`] = "";
  }
  return props;
}

function formDocument(form) {
  return {
    id: form.documentId,
    type: "equippableItem",
    name: `Água — ${form.order}º Estilo: ${form.name}`,
    img: "icons/magic/water/elemental-water.webp",
    data: { template: WATER_BREATH_TEMPLATE_ID, props: formProps(form) },
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
const previousTemplate = previous.items?.find((item) => item.type === "_equippableItemTemplate");
if (!previousTemplate?.data?.body) throw new Error("Template-base de Forma de Respiração não encontrado.");
const template = normalizeTemplateNode(structuredClone(previousTemplate));
template.id = WATER_BREATH_TEMPLATE_ID;
template.name = "NA Respiração - Forma";
const documents = [template, ...WATER_BREATHING_FORMS.map(formDocument)];

await writeFile(exportPath, `${JSON.stringify({ isCustomSystemExport: true, items: documents }, null, 2)}\n`);
await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
await Promise.all(documents.map((document, index) => writeFile(
  path.join(outputDirectory, `${String(index).padStart(2, "0")}-${document.id}.json`),
  `${JSON.stringify(compendiumDocument(document, index), null, 2)}\n`,
)));

console.log(`Preparados ${documents.length} documentos de Respiração para o Compêndio.`);
