import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const officialPath = path.resolve(
    root,
    process.argv[2] ??
        path.join(
            '..',
            '..',
            '..',
            'wiki',
            'projects',
            'MACRO-NA-FOUNDRY',
            'templates',
            'template-armas-normais.json'
        )
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
        );
        if (!/return\s+'';/.test(node.rollMessage)) {
            node.rollMessage = node.rollMessage.replace(/;}%$/, ";return '';}%");
        }
    }
    for (const value of Object.values(node)) guardCsbRollResult(value);
}

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

function ensureWeaponRuntimeFields(template) {
    const runtime = findComponentByKey(template?.system, 'arma_runtime_data');
    if (!runtime || !Array.isArray(runtime.contents)) {
        throw new Error('Painel arma_runtime_data não encontrado no template oficial.');
    }

    const keys = new Set(runtime.contents.map((component) => component?.key).filter(Boolean));
    const textAreaSource = runtime.contents.find((component) => component?.type === 'textArea');
    const textFieldSource = runtime.contents.find((component) => component?.type === 'textField');

    if (!textAreaSource || !textFieldSource) {
        throw new Error('Componentes-base de runtime não encontrados no template oficial.');
    }

    for (const [key, defaultValue] of [
        ['arma_dano_por_rank_json', '{}'],
        ['arma_dado_evolutivo_por_rank_json', '{}'],
    ]) {
        if (keys.has(key)) continue;
        runtime.contents.push({
            ...structuredClone(textAreaSource),
            key,
            defaultValue,
            tooltip: '',
        });
        keys.add(key);
    }

    if (!keys.has('arma_habilidade_resumo')) {
        runtime.contents.push({
            ...structuredClone(textFieldSource),
            key: 'arma_habilidade_resumo',
            defaultValue: '',
            tooltip: 'Resumo curto da habilidade/regra da arma para exibição na ficha.',
        });
    }
}

// Única adaptação funcional: o CSB interpreta o retorno de objeto da macro como
// fórmula. O layout, as keys e a estrutura visual continuam sendo os oficiais.
guardCsbRollResult(official.system);
ensureWeaponRuntimeFields(official);

await writeFile(targetPath, `${JSON.stringify(official, null, 2)}\n`);
console.info(`Template oficial de armas normais adotado em ${targetPath}`);
