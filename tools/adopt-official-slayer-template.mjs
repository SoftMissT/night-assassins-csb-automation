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

function findComponentByKey(node, key) {
    if (!node || typeof node !== 'object') return null;
    if (node.key === key) return node;
    for (const value of Object.values(node)) {
        if (!value || typeof value !== 'object') continue;
        const found = findComponentByKey(value, key);
        if (found) return found;
    }
    return null;
}

function patchWeaponItemContainer(template) {
    const container = findComponentByKey(template?.system, 'inventario_slayer_armas');
    if (!container || !Array.isArray(container.rowLayout)) {
        throw new Error('ItemContainer inventario_slayer_armas não encontrado.');
    }

    container.templateFilter = [];
    container.itemFilterFormula = "equalText(item.inventario_categoria, 'arma')";

    const formulas = {
        arma_perfis_resumo: '${item.arma_perfis_resumo}$',
        arma_tipos_dano_resumo: '${item.arma_tipos_dano_resumo}$',
        arma_alcance: '${item.arma_alcance}$',
        arma_propriedades: '${item.arma_propriedades}$',
    };

    for (const component of container.rowLayout) {
        if (formulas[component?.key]) component.value = formulas[component.key];
    }

    if (!container.rowLayout.some((component) => component?.key === 'arma_habilidade_resumo')) {
        const source = container.rowLayout.find(
            (component) => component?.key === 'arma_propriedades'
        );
        if (!source) throw new Error('Coluna arma_propriedades não encontrada.');

        const ability = {
            ...structuredClone(source),
            key: 'arma_habilidade_resumo',
            colName: 'Habilidade',
            value: '${item.arma_habilidade_resumo}$',
            tooltip: 'Resumo da habilidade ou regra especial da arma.',
        };

        container.rowLayout.splice(container.rowLayout.indexOf(source) + 1, 0, ability);
    }
}

patchWeaponItemContainer(official);

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
