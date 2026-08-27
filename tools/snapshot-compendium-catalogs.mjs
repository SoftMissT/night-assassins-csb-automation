import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalogsDirectory = path.join(root, 'catalogs');

async function snapshot(name, sourceDirectory) {
    const files = (await readdir(sourceDirectory)).filter((file) => file.endsWith('.json')).sort();
    const documents = await Promise.all(
        files.map(async (file) =>
            JSON.parse(await readFile(path.join(sourceDirectory, file), 'utf8'))
        )
    );
    await writeFile(
        path.join(catalogsDirectory, `${name}.json`),
        `${JSON.stringify({ format: 1, documents }, null, 2)}\n`
    );
    console.info(`Catálogo ${name}: ${documents.length} documentos.`);
}

await mkdir(catalogsDirectory, { recursive: true });
await snapshot('breathing', path.join(root, 'build', 'compendium', 'respiracoes'));
await snapshot('slayer-weapons', path.join(root, 'build', 'compendium', 'armas-slayer'));
