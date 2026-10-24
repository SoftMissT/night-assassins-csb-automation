import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

function collectFilters(node, filters = []) {
    if (!node || typeof node !== 'object') return filters;
    if (typeof node.itemFilterFormula === 'string') filters.push(node.itemFilterFormula);
    for (const value of Object.values(node)) collectFilters(value, filters);
    return filters;
}

test('filtros de inventário não chamam equalText com categoria ausente', async () => {
    const actorDirectory = new URL('../src/templates/actors/', import.meta.url);
    const names = (await readdir(actorDirectory)).filter((name) => name.endsWith('.json'));
    for (const name of names) {
        const document = JSON.parse(await readFile(new URL(name, actorDirectory), 'utf8'));
        for (const formula of collectFilters(document)) {
            if (!formula.includes('equalText(item.inventario_categoria')) continue;
            assert.match(
                formula,
                /^item\.inventario_categoria \? equalText\(item\.inventario_categoria,/u,
                `${name}: ${formula}`
            );
        }
    }
});

test('geradores preservam a guarda de inventario_categoria', async () => {
    for (const file of ['adopt-official-slayer-template.mjs', 'clean-oni-template.mjs']) {
        const source = await readFile(new URL(`../tools/${file}`, import.meta.url), 'utf8');
        assert.doesNotMatch(
            source,
            /(?<!\? )equalText\(item\.inventario_categoria/gu,
            file
        );
    }
});
