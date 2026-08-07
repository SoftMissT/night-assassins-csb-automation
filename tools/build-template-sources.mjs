import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const templates = [
  {
    file: "fvtt-Actor-slayer_template_atual-xif9qdBXTkeL1BXW.json",
    id: "NASlayerTpl00001",
    output: "slayer",
  },
  {
    file: "fvtt-Actor-oni_template-PQR15WSdSqBcN15w.json",
    id: "NAOniTemplate001",
    output: "onis",
  },
];

for (const template of templates) {
  if (template.id.length !== 16) throw new Error(`ID inválido para ${template.file}: ${template.id}`);
  const source = JSON.parse(await readFile(path.join(root, template.file), "utf8"));
  const outputDirectory = path.join(root, "build", "compendium", template.output);
  await rm(outputDirectory, { recursive: true, force: true });
  await mkdir(outputDirectory, { recursive: true });

  source._id = template.id;
  source._key = `!actors!${template.id}`;
  source.folder = null;
  source.prototypeToken = { ...(source.prototypeToken ?? {}), name: source.name };
  source._stats = {
    ...(source._stats ?? {}),
    systemId: "custom-system-builder",
    systemVersion: "6.0.2",
    coreVersion: "14",
    createdTime: 0,
    modifiedTime: 0,
    lastModifiedBy: null,
  };

  await writeFile(path.join(outputDirectory, `01-${template.output}.json`), `${JSON.stringify(source, null, 2)}\n`);
}

console.log("Preparados os templates Slayer e Oni para os Compêndios.");
