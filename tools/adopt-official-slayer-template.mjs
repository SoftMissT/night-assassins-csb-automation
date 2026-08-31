import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const officialPath = path.resolve(
    repoRoot,
    process.argv[2] ?? 'eu fiz esse template aki atualizado de slayer.json'
);
const templatePath = path.join(repoRoot, 'src', 'templates', 'actors', 'slayer-template.json');
const importPath = path.join(repoRoot, 'src', 'imports', 'csb-import-slayer-template.json');

const official = JSON.parse(await readFile(officialPath, 'utf8'));
if (official.name !== 'slayer_template' || official.type !== '_template') {
    throw new Error('O export oficial não é o template Slayer esperado.');
}

official._id = 'NASlayerTpl00001';

const csbImport = {
    isCustomSystemExport: true,
    actors: [
        {
            id: 'NASlayerTpl00001',
            type: official.type,
            name: official.name,
            data: structuredClone(official.system),
            flags: structuredClone(official.flags ?? {}),
        },
    ],
    items: [],
};

await writeFile(templatePath, `${JSON.stringify(official, null, 2)}\n`, 'utf8');
await writeFile(importPath, `${JSON.stringify(csbImport, null, 2)}\n`, 'utf8');

console.log(`Template Slayer adotado de: ${officialPath}`);
console.log('Layout oficial preservado integralmente; somente o ID técnico foi normalizado.');
console.log(`Template do módulo: ${templatePath}`);
console.log(`Import CSB: ${importPath}`);
