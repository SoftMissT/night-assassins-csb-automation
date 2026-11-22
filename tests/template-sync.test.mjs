import test from 'node:test';
import assert from 'node:assert/strict';
import { planTemplateSync } from '../scripts/template-sync-service.mjs';

const doc = (id, name, version, type = '_template') => ({ id, name, type, version: String(version) });

test('template do mundo importado com outro id é casado pelo nome e atualizado no lugar', () => {
    // Caso real do QA: npc_template_oficial no mundo (lf4A…) × NANpcTemplate001 no pack.
    const plan = planTemplateSync(
        [doc('lf4AJLFnp88jl7MI', 'npc_template_oficial', 3061281920)],
        [{ ...doc('NANpcTemplate001', 'npc_template_oficial', 1795234800005), collection: 'na.templates' }]
    );
    assert.deepEqual(plan, [
        { worldId: 'lf4AJLFnp88jl7MI', packId: 'NANpcTemplate001', name: 'npc_template_oficial', collection: 'na.templates' },
    ]);
});

test('template igual ao do compêndio não entra no plano', () => {
    assert.deepEqual(
        planTemplateSync([doc('NASlayerTpl00001', 'slayer_template', 7)], [doc('NASlayerTpl00001', 'slayer_template', 7)]),
        []
    );
});

test('cópias duplicadas com o mesmo nome são todas atualizadas, uma vez cada', () => {
    const plan = planTemplateSync(
        [doc('NASlayerTpl00001', 'slayer_template', 1), doc('xtxzCCaJzc0epvTa', 'slayer_template', 1)],
        [doc('NASlayerTpl00001', 'slayer_template', 2)]
    );
    assert.deepEqual(plan.map((step) => step.worldId), ['NASlayerTpl00001', 'xtxzCCaJzc0epvTa']);
});

test('template de item não é casado com template de ator de mesmo nome', () => {
    const plan = planTemplateSync(
        [doc('A', 'NA Arma - Slayer', 1, '_template')],
        [doc('B', 'NA Arma - Slayer', 2, '_equippableItemTemplate')]
    );
    assert.deepEqual(plan, []);
});

test('template que não existe no mundo não é criado sem o GM importar', () => {
    assert.deepEqual(planTemplateSync([], [doc('NAGenericItem001', 'NA Item Genérico', 1, '_equippableItemTemplate')]), []);
});
