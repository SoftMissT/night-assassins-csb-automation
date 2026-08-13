import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  attributesIn, damageTypesIn, firstDiceFormula, firstFixedDamage, folderDocument,
  splitLevelTwoSections, stableId, stripMarkdown,
} from "./compendium-catalog-utils.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reference = path.resolve(root, "..", "MACRO-NA-FOUNDRY", "Versao-Oficial-Night-Assassins-V25.1", "Armas.md");
const outputDirectory = path.join(root, "build", "compendium", "armas-slayer");
const templateExport = JSON.parse(await readFile(path.join(root, "csb-respiracao-forma-export.json"), "utf8"));
const sourceTemplate = templateExport.items.find((item) => item.type === "_equippableItemTemplate");
if (!sourceTemplate) throw new Error("Template CSB base não encontrado.");

const TEMPLATE_ID = "NAWeaponTpl00001";
const FOLDER_ID = stableId("night-assassins-folder", "armas-slayer");
const markdown = await readFile(reference, "utf8");
const weapons = splitLevelTwoSections(markdown).filter(({ heading }) => /^\d+\.\s+/u.test(heading));

function templateDocument() {
  const source = structuredClone(sourceTemplate);
  source.id = TEMPLATE_ID;
  source.name = "NA Arma - Slayer";
  source.img = "icons/svg/sword.svg";
  return source;
}

function itemSource(section, index) {
  const name = section.heading.replace(/^\d+\.\s+/u, "").trim();
  const text = `${section.heading}\n${section.body}`;
  const damageTypes = damageTypesIn(text);
  return {
    id: stableId("night-assassins-weapon", name),
    type: "equippableItem",
    name,
    img: "icons/svg/sword.svg",
    data: {
      template: TEMPLATE_ID,
      props: {
        inventario_categoria: "arma",
        arma_nome: name,
        arma_dano_dados: firstDiceFormula(text),
        arma_dano_fixo: firstFixedDamage(text),
        arma_dano_atributo: attributesIn(text),
        arma_tipos_dano: damageTypes.length ? damageTypes : ["cortante"],
        arma_critico: Number(text.match(/Cr[ií]tico[^\n]*?\b(\d{2})\b/iu)?.[1] ?? 20),
        arma_alcance: text.match(/Alcance:\s*([^\n]+)/iu)?.[1]?.trim() ?? "",
        arma_propriedades: text.match(/Propriedades:\s*([^\n]+)/iu)?.[1]?.trim() ?? "",
        arma_requisito: text.match(/Requisito:\s*([^\n]+)/iu)?.[1]?.trim() ?? "",
        descricao: stripMarkdown(section.body),
        arma_ordem: index + 1,
      },
    },
  };
}

function compendiumDocument(source, index, folder = null) {
  return {
    _id: source.id,
    _key: `!items!${source.id}`,
    name: source.name,
    type: source.type,
    img: source.img,
    system: structuredClone(source.data ?? {}),
    effects: [], folder, sort: index * 100000,
    ownership: { default: 0 },
    flags: source.type === "equippableItem" ? { "custom-system-builder": { unique: true } } : {},
    _stats: { systemId: "custom-system-builder", systemVersion: "6.0.2", coreVersion: "14", createdTime: 0, modifiedTime: 0, lastModifiedBy: null },
  };
}

const template = templateDocument();
const items = weapons.map(itemSource);
await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
await writeFile(path.join(outputDirectory, `00-folder-${FOLDER_ID}.json`), `${JSON.stringify(folderDocument(FOLDER_ID, "Armas dos Caçadores"), null, 2)}\n`);
await writeFile(path.join(outputDirectory, `01-template-${TEMPLATE_ID}.json`), `${JSON.stringify(compendiumDocument(template, 0), null, 2)}\n`);
await Promise.all(items.map((item, index) => writeFile(path.join(outputDirectory, `${String(index + 2).padStart(3, "0")}-${item.id}.json`), `${JSON.stringify(compendiumDocument(item, index + 1, FOLDER_ID), null, 2)}\n`)));
console.info(`Preparados ${items.length} Items de armas Slayer.`);

