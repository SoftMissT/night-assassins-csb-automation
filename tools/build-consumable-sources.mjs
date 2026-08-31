import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = path.join(root, 'build', 'compendium', 'consumiveis');
const catalog = JSON.parse(await readFile(path.join(root, 'catalogs', 'consumables.json'), 'utf8'));
const template = JSON.parse(
    await readFile(path.join(root, 'src', 'templates', 'items', 'consumable-template.json'), 'utf8')
);
if (catalog.format !== 1 || !Array.isArray(catalog.documents))
    throw new Error('Catálogo de consumíveis inválido.');

const documents = [template, ...catalog.documents];
const ids = new Set();
for (const document of documents) {
    if (String(document._id ?? '').length !== 16)
        throw new Error(`ID inválido no catálogo de consumíveis: ${document._id}`);
    if (ids.has(document._id)) throw new Error(`ID duplicado: ${document._id}`);
    ids.add(document._id);
}

await mkdir(outputDirectory, { recursive: true });
const outputFiles = documents.map((document, index) =>
    `${String(index).padStart(3, '0')}-${document._id}.json`
);
await Promise.all(
    documents.map((document, index) =>
        writeFile(
            path.join(outputDirectory, outputFiles[index]),
            `${JSON.stringify(document, null, 2)}\n`
        )
    )
);
const expected = new Set(outputFiles);
await Promise.all(
    (await readdir(outputDirectory))
        .filter((file) => file.endsWith('.json') && !expected.has(file))
        .map((file) => rm(path.join(outputDirectory, file), { force: true }))
);

console.info('Preparados 6 consumíveis HonMoon e 1 template de Item.');
