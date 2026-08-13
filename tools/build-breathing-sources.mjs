import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveWaterDamageTypes, WATER_BREATHING_FORMS, WATER_BREATH_TEMPLATE_ID } from "../scripts/water-breathing-data.mjs";
import {
  actionIn, costIn, damageTypesIn, firstDiceFormula, folderDocument,
  minimumBreathingLevel, splitLevelTwoSections, stableId, stripMarkdown,
} from "./compendium-catalog-utils.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const exportPath = path.join(root, "csb-respiracao-forma-export.json");
const waterSourcePath = path.join(root, "respiracao_da_agua.json");
const outputDirectory = path.join(root, "build", "compendium", "respiracoes");
const referencesDirectory = path.resolve(root, "..", "MACRO-NA-FOUNDRY", "Versao-Oficial-Night-Assassins-V25.1", "Respirações");

export const BREATHING_CATALOG = Object.freeze([
  "Água", "Ameixeira", "Amor", "Aranha", "Areia", "Besta", "Cerejeira", "Chamas", "Corvo", "Cristal", "Dragão",
  "Eclipse", "Estrelas", "Flores", "Grama", "Insetos", "Lobo", "Lua", "Luz", "Macaco", "Madeira", "Magma", "Metal",
  "Neve", "Nevasca", "Névoa", "Pedra", "Raposa", "Sangue", "Serpente", "Sol", "Som", "Sombras", "Sonhos", "Tartaruga",
  "Tempo", "Tigre", "Tinta", "Tormenta", "Trovão", "Tubarão", "Vagalume", "Veneno", "Vento",
]);

export const BREATHING_FOLDER_NAMES = Object.freeze([
  "Respiração da Água", "Respiração da Ameixeira", "Respiração do Amor", "Respiração da Aranha", "Respiração da Areia", "Respiração da Besta",
  "Respiração da Cerejeira", "Respiração das Chamas", "Respiração do Corvo", "Respiração do Cristal", "Respiração do Dragão", "Respiração do Eclipse",
  "Respiração das Estrelas", "Respiração das Flores", "Respiração da Grama", "Respiração dos Insetos", "Respiração do Lobo", "Respiração da Lua",
  "Respiração da Luz", "Respiração do Macaco", "Respiração da Madeira", "Respiração do Magma", "Respiração do Metal", "Respiração da Neve",
  "Respiração da Nevasca", "Respiração da Névoa", "Respiração da Pedra", "Respiração da Raposa", "Respiração do Sangue", "Respiração da Serpente",
  "Respiração do Sol", "Respiração do Som", "Respiração das Sombras", "Respiração dos Sonhos", "Respiração da Tartaruga", "Respiração do Tempo",
  "Respiração do Tigre", "Respiração da Tinta", "Respiração da Tormenta", "Respiração do Trovão", "Respiração do Tubarão", "Respiração do Vagalume",
  "Respiração do Veneno", "Respiração do Vento",
]);

const actionLabels = Object.freeze({ unica: "Única", ataque: "Ataque", especial: "Especial", completa: "Completa", reacao: "Reação", ataque_especial: "Ataque ou Especial" });

function normalize(value = "") {
  return String(value).normalize("NFD").replace(/[\u0300-\u036f]/gu, "").toLocaleLowerCase("pt-BR").trim();
}

function subjectFromFile(file) {
  return path.parse(file).name.replace(/^Respiração\s+(?:da|do|das|dos)\s+/iu, "").trim();
}

function normalizeTemplateNode(node) {
  if (!node || typeof node !== "object") return node;
  if (Array.isArray(node)) return node.map(normalizeTemplateNode);
  const normalized = Object.fromEntries(Object.entries(node).map(([key, value]) => [key, normalizeTemplateNode(value)]));
  if (normalized.type === "richTextArea") normalized.type = "textArea";
  if (normalized.type === "textArea" && normalized.style === "dialogEditor") normalized.style = "dialog";
  return normalized;
}

function sourceForWaterForm(sourceItems, form) {
  return sourceItems.find((item) => new RegExp(`^${form.order}º\\s+Estilo\\b`, "i").test(item.name));
}

function waterFormProps(form, source) {
  const sourceSystem = source?.system ?? {};
  const props = {
    inventario_categoria: "respiracao", forma_id: form.id, forma_ordem: form.order, nome_forma: form.name,
    nome_jp: sourceSystem.japaneseName || form.jp, respiracao_nome: "Água",
    tipo_manobra: sourceSystem.maneuverType || actionLabels[form.action] || form.action,
    tipo_dano_base: resolveWaterDamageTypes(form).join(","), nivel_req: form.minLevel,
    descricao: sourceSystem.description || form.description, tem_requisito: (sourceSystem.requirement || form.requirement) ? 1 : 0,
    requisito_texto: sourceSystem.requirement || form.requirement || "", gatilho_texto: sourceSystem.trigger || "",
    combo_texto: sourceSystem.combo || "", notas_texto: sourceSystem.notes || "",
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
    props[`nvl${level}_tipos_dano`] = data ? resolveWaterDamageTypes(form, data).join(",") : "";
  }
  return props;
}

function genericFormProps(breathing, section, order) {
  const text = `${section.heading}\n${section.body}`;
  const heading = section.heading.replace(/^\d+\s*[ºª]?\s*(?:Forma|Estilo|Presa|Pacto|Hora)?\s*/iu, "").trim();
  const cost = costIn(text);
  const damage = firstDiceFormula(text);
  const types = damageTypesIn(text);
  const props = {
    inventario_categoria: "respiracao", forma_id: `${normalize(breathing).replace(/\s+/gu, "_")}_${String(order).padStart(2, "0")}`,
    forma_ordem: order, nome_forma: heading, nome_jp: "", respiracao_nome: breathing,
    tipo_manobra: actionIn(text), tipo_dano_base: types.join(","), nivel_req: minimumBreathingLevel(text),
    descricao: stripMarkdown(section.body), tem_requisito: /requisito|condição|precisa|necessário/iu.test(text) ? 1 : 0,
    requisito_texto: "", gatilho_texto: "", combo_texto: "", notas_texto: "Fonte oficial integral preservada em Descrição.", sinergias_texto: "",
  };
  for (let level = 1; level <= 4; level += 1) {
    const available = level >= props.nivel_req;
    props[`tem_nvl${level}`] = available ? 1 : 0;
    props[`nvl${level}_custo`] = available ? cost : 0;
    props[`nvl${level}_dano`] = available ? damage : "";
    props[`nvl${level}_efeito`] = available ? stripMarkdown(section.body) : "Indisponível";
    props[`nvl${level}_status`] = "";
    props[`nvl${level}_buff`] = "";
    props[`nvl${level}_tipos_dano`] = available ? types.join(",") : "";
  }
  return props;
}

function formSource({ id, name, props, icon }) {
  return { id, type: "equippableItem", name, img: icon, data: { template: WATER_BREATH_TEMPLATE_ID, props } };
}

function compendiumDocument(source, index, folder = null) {
  return {
    _id: source.id, _key: `!items!${source.id}`, name: source.name, type: source.type, img: source.img,
    system: structuredClone(source.data ?? {}), effects: [], folder, sort: index * 100000, ownership: { default: 0 },
    flags: source.type === "equippableItem" ? { "custom-system-builder": { unique: true } } : {},
    _stats: { systemId: "custom-system-builder", systemVersion: "6.0.2", coreVersion: "14", createdTime: 0, modifiedTime: 0, lastModifiedBy: null },
  };
}

const previous = JSON.parse(await readFile(exportPath, "utf8"));
const waterSourceItems = JSON.parse(await readFile(waterSourcePath, "utf8"));
const previousTemplate = previous.items?.find((item) => item.type === "_equippableItemTemplate");
if (!previousTemplate?.data?.body) throw new Error("Template-base de Forma de Respiração não encontrado.");
const template = normalizeTemplateNode(structuredClone(previousTemplate));
template.id = WATER_BREATH_TEMPLATE_ID;
template.name = "NA Respiração - Forma";

const referenceFiles = (await readdir(referencesDirectory)).filter((file) => file.endsWith(".md"));
const sourceFiles = new Map(referenceFiles.map((file) => [normalize(subjectFromFile(file)), file]));
const folderIds = new Map(BREATHING_CATALOG.map((name) => [name, stableId("night-assassins-breath-folder", name)]));
const itemSources = [];

for (const breathing of BREATHING_CATALOG) {
  if (breathing === "Água") {
    for (const form of WATER_BREATHING_FORMS) {
      const source = sourceForWaterForm(waterSourceItems, form);
      itemSources.push({ breathing, source: formSource({ id: form.documentId, name: source?.name ? `Água — ${source.name}` : `Água — ${form.order}º Estilo: ${form.name}`, props: waterFormProps(form, source), icon: "modules/night-assassins-csb-automation/assets/icons/resp_agua.webp" }) });
    }
    continue;
  }
  const file = sourceFiles.get(normalize(breathing));
  if (!file) continue;
  const markdown = await readFile(path.join(referencesDirectory, file), "utf8");
  const sections = splitLevelTwoSections(markdown).filter(({ heading }) => /^(?:\d+\s*[ºª]?|Passiva|Estilo Final)/iu.test(heading) && !/^(?:Ideias|Regra de Sistema)/iu.test(heading));
  sections.forEach((section, index) => {
    const props = genericFormProps(breathing, section, index + 1);
    itemSources.push({ breathing, source: formSource({ id: stableId("night-assassins-breath-form", `${breathing}:${section.heading}`), name: `${breathing} — ${section.heading}`, props, icon: "icons/svg/wind.svg" }) });
  });
}

const waterDocuments = [template, ...itemSources.filter(({ breathing }) => breathing === "Água").map(({ source }) => source)];
await writeFile(exportPath, `${JSON.stringify({ isCustomSystemExport: true, items: waterDocuments }, null, 2)}\n`);
await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
let index = 0;
await writeFile(path.join(outputDirectory, `${String(index++).padStart(4, "0")}-${template.id}.json`), `${JSON.stringify(compendiumDocument(template, index), null, 2)}\n`);
for (const [sort, breathing] of BREATHING_CATALOG.entries()) {
  const id = folderIds.get(breathing);
  await writeFile(path.join(outputDirectory, `${String(index++).padStart(4, "0")}-folder-${id}.json`), `${JSON.stringify(folderDocument(id, BREATHING_FOLDER_NAMES[sort], sort * 100000), null, 2)}\n`);
}
await Promise.all(itemSources.map(({ breathing, source }, itemIndex) => writeFile(path.join(outputDirectory, `${String(index + itemIndex).padStart(4, "0")}-${source.id}.json`), `${JSON.stringify(compendiumDocument(source, itemIndex + 1, folderIds.get(breathing)), null, 2)}\n`)));

const missing = BREATHING_CATALOG.filter((name) => name !== "Água" && !sourceFiles.has(normalize(name)));
console.info(`Preparados ${itemSources.length} Items em ${BREATHING_CATALOG.length} pastas de Respiração. Fontes pendentes: ${missing.join(", ") || "nenhuma"}.`);
