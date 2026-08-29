import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const officialPath = path.resolve(
    repoRoot,
    '..',
    '..',
    '..',
    'wiki',
    'projects',
    'MACRO-NA-FOUNDRY',
    'templates',
    'template-slayer-atualizado.json'
);
const templatePath = path.join(repoRoot, 'src', 'templates', 'actors', 'slayer-template.json');
const importPath = path.join(repoRoot, 'src', 'imports', 'csb-import-slayer-template.json');
const PROVISIONAL_MACRO_ID = 'NAAttrLevel00001';

function removeProvisionalAttributeButton(document) {
    let removed = 0;

    function prune(node) {
        if (!node || typeof node !== 'object') return node;
        if (Array.isArray(node)) {
            return node
                .filter((entry) => {
                    const provisional =
                        entry?.type === 'label' &&
                        typeof entry?.rollMessage === 'string' &&
                        entry.rollMessage.includes(PROVISIONAL_MACRO_ID);
                    if (provisional) removed += 1;
                    return !provisional;
                })
                .map(prune);
        }
        for (const [key, value] of Object.entries(node)) node[key] = prune(value);
        return node;
    }

    prune(document.system);
    if (removed !== 1) {
        throw new Error(`Esperado exatamente 1 botão provisório; encontrados ${removed}.`);
    }
}

const official = JSON.parse(await readFile(officialPath, 'utf8'));
if (official.name !== 'slayer_template' || official.type !== '_template') {
    throw new Error('O export oficial não é o template Slayer esperado.');
}

removeProvisionalAttributeButton(official);
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
console.log('Removido: 1 botão provisório de atributos.');
console.log(`Template do módulo: ${templatePath}`);
console.log(`Import CSB: ${importPath}`);
