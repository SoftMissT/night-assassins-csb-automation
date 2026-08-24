import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { useNativeCsbPresentation } from "./native-csb-style.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = [
  "src/templates/items/slayer-weapon-template.json",
  "src/templates/items/breathing-form-template.json",
  "src/templates/items/kekkijutsu-item-template.json",
];

for (const relativePath of files) {
  const absolutePath = path.join(root, relativePath);
  const document = JSON.parse(await readFile(absolutePath, "utf8"));
  const converted = useNativeCsbPresentation(document);
  await writeFile(absolutePath, `${JSON.stringify(document, null, 2)}\n`);
  console.info(`${relativePath}: ${converted} rótulos convertidos para apresentação nativa.`);
}
