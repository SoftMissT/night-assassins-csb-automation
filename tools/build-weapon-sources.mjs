import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath = path.join(root, "catalogs", "slayer-weapons.json");
const outputDirectory = path.join(root, "build", "compendium", "armas-slayer");
const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
if (catalog.format !== 1 || !Array.isArray(catalog.documents)) throw new Error("Catálogo mecânico de armas Slayer inválido.");

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
await Promise.all(catalog.documents.map((document, index) => {
  const id = document._id ?? `document-${index}`;
  return writeFile(path.join(outputDirectory, `${String(index).padStart(3, "0")}-${id}.json`), `${JSON.stringify(document, null, 2)}\n`);
}));

const itemCount = catalog.documents.filter((document) => document._key?.startsWith("!items!") && !String(document.type).startsWith("_")).length;
console.info(`Preparados ${itemCount} Items de armas Slayer.`);
