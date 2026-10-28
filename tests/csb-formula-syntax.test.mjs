import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOTS = ['src/templates', 'catalogs'];
const FORMULA_KEYS = new Set(['visibilityFormula', 'editableFormula']);

function jsonFiles(dir, out = []) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) jsonFiles(full, out);
        else if (entry.name.endsWith('.json')) out.push(full);
    }
    return out;
}

function collect(node, file, out) {
    if (!node || typeof node !== 'object') return;
    for (const [key, value] of Object.entries(node)) {
        if (FORMULA_KEYS.has(key) && typeof value === 'string' && /&&|\|\|/u.test(value)) {
            out.push({ file, key, value });
        } else {
            collect(value, file, out);
        }
    }
}

test('fórmulas de visibilidade/edição usam sintaxe do CSB, não JavaScript', () => {
    const bad = [];
    for (const root of ROOTS) {
        for (const file of jsonFiles(root)) {
            const rel = relative(process.cwd(), file).replaceAll('\\', '/');
            collect(JSON.parse(readFileSync(file, 'utf8')), rel, bad);
        }
    }
    assert.deepEqual(bad, [], 'O parser do CSB é mathjs: use `and`/`or`, nunca && ou ||');
});
