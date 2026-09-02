import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    collectCsbFieldSchema,
    findNumberFieldMismatches,
    sanitizeSpecialWeaponProps,
    validateSpecialWeaponProps,
} from '../scripts/special-weapon-schema.mjs';
import { normalizeNormalWeaponProps } from '../scripts/weapon-catalog-normalization.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const buildMode = process.argv.includes('--build');
const template = JSON.parse(
    await readFile(
        path.join(root, 'src', 'templates', 'items', 'special-slayer-weapon-template.json'),
        'utf8'
    )
);
const schema = collectCsbFieldSchema(template);
const sourceDirectory = buildMode
    ? path.join(root, 'build', 'compendium', 'armas-slayer')
    : path.join(root, 'data', 'catalog-source', 'weapons', 'especiais');
const files = (await readdir(sourceDirectory)).filter((file) => file.endsWith('.json')).sort();

let weapons = 0;
let rawIssueCount = 0;
let sanitizedIssueCount = 0;

console.log(buildMode ? '\n=== AUDIT: BUILD DE ARMAS ESPECIAIS ===\n' : '\n=== AUDIT: FONTES DE ARMAS ESPECIAIS ===\n');

for (const file of files) {
    const document = JSON.parse(await readFile(path.join(sourceDirectory, file), 'utf8'));
    const props = document.system?.props ?? {};
    if (
        document.type !== 'equippableItem' ||
        String(props.arma_categoria ?? '').toLocaleLowerCase('pt-BR') !== 'especial'
    ) {
        continue;
    }

    weapons += 1;
    if (buildMode) {
        const problems = validateSpecialWeaponProps(props, schema);
        for (const problem of problems) {
            console.error(`FAIL ${document.name}: ${problem.key} = ${JSON.stringify(problem.value)}`);
        }
        sanitizedIssueCount += problems.length;
        continue;
    }

    const normalized = normalizeNormalWeaponProps(props);
    const rawProblems = findNumberFieldMismatches(normalized, schema);
    for (const problem of rawProblems) {
        console.log(`SOURCE TYPE MISMATCH: ${document.name}`);
        console.log(`  ${problem.key} = ${JSON.stringify(problem.value)}`);
        if (problem.value === '/') console.log('  >>> ENCONTRADO VALOR "/" EM NUMBERFIELD <<<');
    }
    rawIssueCount += rawProblems.length;

    const sanitized = sanitizeSpecialWeaponProps(normalized, schema);
    const sanitizedProblems = validateSpecialWeaponProps(sanitized, schema);
    sanitizedIssueCount += sanitizedProblems.length;
}

console.log(`\nArmas auditadas: ${weapons}`);
console.log(`Incompatibilidades brutas encontradas: ${rawIssueCount}`);
console.log(`Incompatibilidades após sanitizer: ${sanitizedIssueCount}`);

if (weapons < 1 || sanitizedIssueCount > 0) process.exit(1);
console.log('PASS');
