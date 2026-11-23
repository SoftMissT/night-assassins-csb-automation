import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { npcBreathingChoiceForItem, recognizeNpcBreathing } from '../scripts/npc-breathing-recognition.mjs';

const form = (name) => ({ system: { props: { inventario_categoria: 'respiracao', respiracao_nome: name } } });
const npc = (props = {}) => ({ isOwner: true, system: { props: { npc_nome: 'NPC', ...props } }, updates: [],
    async update(patch) { this.updates.push(patch); } });

test('primeira Forma de uma Respiração escolhe o seletor do NPC', () => {
    assert.equal(npcBreathingChoiceForItem(npc(), form('Chamas')), 'resp_slayer_chamas');
    assert.equal(npcBreathingChoiceForItem(npc({ resp_slayer_display: 'resp_slayer_base' }), form('Vento')), 'resp_slayer_vento');
    assert.equal(npcBreathingChoiceForItem(npc({ resp_slayer_display: '' }), form('Sonhos')), 'resp_slayer_sonhos');
});

test('escolha já feita, item que não é Forma e Respiração desconhecida não mudam nada', () => {
    assert.equal(npcBreathingChoiceForItem(npc({ resp_slayer_display: 'resp_slayer_agua' }), form('Chamas')), null);
    assert.equal(npcBreathingChoiceForItem(npc(), { system: { props: { inventario_categoria: 'arma' } } }), null);
    assert.equal(npcBreathingChoiceForItem(npc(), form('Respiração Inventada')), null);
    assert.equal(npcBreathingChoiceForItem(npc({ resp_slayer_display_2: 'resp_slayer_chamas' }), form('Chamas')), null);
});

test('Slayer não é tocado: ele escolhe a Respiração no cabeçalho', () => {
    const slayer = { system: { props: { nome_slayer: 'S', nvl_num: 3 } } };
    assert.equal(npcBreathingChoiceForItem(slayer, form('Chamas')), null);
});

test('recognizeNpcBreathing grava só o seletor, sem render extra de automação', async () => {
    const actor = npc();
    const item = { ...form('Raposa'), parent: actor };
    assert.equal(await recognizeNpcBreathing(item), true);
    assert.deepEqual(actor.updates, [{ 'system.props.resp_slayer_display': 'resp_slayer_raposa' }]);
    assert.equal(await recognizeNpcBreathing({ ...form('Raposa'), parent: { ...actor, isOwner: false } }), false);
});

test('ficha do NPC mostra Respiração, Respiração Secundária e Nível no cabeçalho, e só uma vez', async () => {
    const template = JSON.parse(await readFile(new URL('../src/templates/actors/npc-template.json', import.meta.url), 'utf8'));
    const found = [];
    (function walk(node, path) {
        if (Array.isArray(node)) return node.forEach((child) => walk(child, path));
        if (!node || typeof node !== 'object') return;
        if (['resp_slayer_display', 'resp_slayer_display_2', 'nvl_respiracao'].includes(node.key)) found.push({ key: node.key, path });
        const next = node.key ? [...path, node.key] : path;
        Object.values(node).forEach((child) => walk(child, next));
    })(template, []);
    for (const key of ['resp_slayer_display', 'resp_slayer_display_2', 'nvl_respiracao']) {
        const hits = found.filter((entry) => entry.key === key);
        assert.equal(hits.length, 1, `${key} aparece uma vez`);
        assert.ok(hits[0].path.includes('npc_cabecalho'), `${key} fica no cabeçalho`);
    }
});
