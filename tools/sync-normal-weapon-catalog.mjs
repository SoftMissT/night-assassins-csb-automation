import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeNormalWeaponProps } from '../scripts/weapon-catalog-normalization.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDirectory = path.join(root, 'data', 'catalog-source', 'weapons');
const catalogPath = path.join(root, 'catalogs', 'slayer-weapons.json');
const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
const sourceFiles = (await readdir(sourceDirectory)).filter((file) => file.endsWith('.json'));
const sources = await Promise.all(
    sourceFiles.map(async (file) => JSON.parse(await readFile(path.join(sourceDirectory, file), 'utf8')))
);
const sourceByName = new Map(sources.map((source) => [source.name, source]));
const VISUAL_KEYS = Object.freeze([
    'arma_alcance',
    'arma_propriedades',
    'arma_requisito',
    'arma_tipo',
    'descricao',
    'arma_regra_completa',
]);
let synchronized = 0;

catalog.documents = catalog.documents.map((document) => {
    if (document.type !== 'equippableItem') return document;
    const source = sourceByName.get(document.name);
    if (!source) return document;
    synchronized += 1;
    const currentProps = document.system?.props ?? {};
    const sourceProps = source.system?.props ?? {};
    const visualOverrides = Object.fromEntries(
        VISUAL_KEYS.filter((key) => Object.hasOwn(sourceProps, key)).map((key) => [key, sourceProps[key]])
    );
    const mergedProps = { ...currentProps, ...visualOverrides };
    return {
        ...document,
        system: {
            ...document.system,
            props: normalizeNormalWeaponProps(mergedProps),
        },
    };
});

await writeFile(catalogPath, `${JSON.stringify(catalog, null, 4)}\n`);
console.info(`Sincronizadas ${synchronized} armas normais no catálogo.`);
