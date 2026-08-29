import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const officialPath = path.resolve(
    root,
    '..',
    '..',
    '..',
    'wiki',
    'projects',
    'MACRO-NA-FOUNDRY',
    'templates',
    'template-armas-normais.json'
);
const targetPath = path.join(root, 'src', 'templates', 'items', 'slayer-weapon-template.json');

const officialText = await readFile(officialPath, 'utf8');
const official = JSON.parse(officialText);

if (official?._id !== 'NAWeaponTpl00001') {
    throw new Error(`Template oficial inesperado: ${official?._id ?? 'sem _id'}`);
}
if (official?.system?.uniqueId !== 'NAWeaponTpl00001') {
    throw new Error(`uniqueId oficial inesperado: ${official?.system?.uniqueId ?? 'ausente'}`);
}

function guardCsbRollResult(node) {
    if (!node || typeof node !== 'object') return;
    if (typeof node.rollMessage === 'string' && node.rollMessage.includes('rollWeaponItem')) {
        node.rollMessage = node.rollMessage.replace(
            "return await game.modules.get('night-assassins-csb-automation')?.api?.rollWeaponItem",
            "await game.modules.get('night-assassins-csb-automation')?.api?.rollWeaponItem"
        ).replace(";}%", ";return '';}%");
    }
    for (const value of Object.values(node)) guardCsbRollResult(value);
}

// Única adaptação funcional: o CSB interpreta o retorno de objeto da macro como
// fórmula. O layout, as keys e a estrutura visual continuam sendo os oficiais.
guardCsbRollResult(official.system);

await writeFile(targetPath, `${JSON.stringify(official, null, 2)}\n`);
console.info(`Template oficial de armas normais adotado em ${targetPath}`);
