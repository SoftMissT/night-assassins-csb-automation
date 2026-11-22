import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Armas criadas antes do campo `arma_habilidade_resumo` não têm a prop. Sem
// fallback, o CSB lança "Uncomputable formula" a cada render da ficha (QA
// 2026-11-22: 168 erros e render mais lento no Slayer).
const TEMPLATES = ['slayer-template.json', 'npc-template.json'];

function findColumn(node, key) {
    if (!node || typeof node !== 'object') return null;
    if (node.key === key && typeof node.value === 'string') return node;
    for (const child of Object.values(node)) {
        const found = findColumn(child, key);
        if (found) return found;
    }
    return null;
}

for (const file of TEMPLATES) {
    test(`${file}: resumo da habilidade da arma tolera arma antiga sem a prop`, async () => {
        const template = JSON.parse(
            await readFile(new URL(`../src/templates/actors/${file}`, import.meta.url), 'utf8')
        );
        const column = findColumn(template, 'arma_habilidade_resumo');
        assert.ok(column, 'coluna arma_habilidade_resumo ausente no container de armas');
        assert.equal(
            column.value,
            "${item.arma_habilidade_resumo ? item.arma_habilidade_resumo : ''}$"
        );
    });
}
