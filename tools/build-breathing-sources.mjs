import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { breathingIconPath } from "../scripts/breathing-icons.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath = path.join(root, "catalogs", "breathing.json");
const outputDirectory = path.join(root, "build", "compendium", "respiracoes");

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

const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
if (catalog.format !== 1 || !Array.isArray(catalog.documents)) throw new Error("Catálogo mecânico de Respirações inválido.");

for (const document of catalog.documents) {
  if (document.type !== "equippableItem") continue;
  const icon = breathingIconPath(document.system?.props?.respiracao_nome);
  if (icon) document.img = icon;
}

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
await Promise.all(catalog.documents.map((document, index) => {
  const id = document._id ?? `document-${index}`;
  const kind = document.type === "Item" ? "folder" : "item";
  return writeFile(path.join(outputDirectory, `${String(index).padStart(4, "0")}-${kind}-${id}.json`), `${JSON.stringify(document, null, 2)}\n`);
}));

const folderCount = catalog.documents.filter((document) => document.type === "Item").length;
const itemCount = catalog.documents.filter((document) => document._key?.startsWith("!items!") && document.type !== "Item").length - 1;
console.info(`Preparados ${itemCount} Items em ${folderCount} pastas de Respiração.`);
