import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = async (name) =>
    JSON.parse(
        await readFile(new URL(`../src/templates/actors/${name}-template.json`, import.meta.url), 'utf8')
    );
const keys = (nodes) => nodes.flatMap((node) => [node.key, ...keys(node.contents ?? [])]);
const isSpacer = (node) => node.type === 'panel' && !node.key && (node.contents ?? []).length === 0;

// Ordem de uso na mesa: recursos → atributos → combate → bônus → itens → estado.
describe('Layout das fichas de ator', () => {
    it('Slayer: recursos no topo, combate antes das listas e perícias em aba própria', async () => {
        const tabs = (await read('slayer')).system.body.contents[0].contents;
        assert.deepEqual(
            tabs.map((tab) => tab.key),
            ['combat_slayer_tab', 'pericias_slayer_tab', 'habilidades_slayer_tab', 'configs_tab']
        );
        const combat = tabs[0].contents;
        assert.ok(!combat.some(isSpacer), 'sem painéis espaçadores vazios');
        assert.ok(keys([combat[0]]).includes('pdv_slayer_atual_valor_display'));
        assert.ok(keys([combat[0]]).includes('pdr_slayer_atual_valor_display'));
        const order = combat.map((node) => node.key).filter(Boolean);
        assert.deepEqual(order, [
            'combat_slayer_panel',
            'inventario_slayer_armas',
            'skills_slayer_respiracoes',
            'acoes_slayer_panel',
        ]);
        assert.equal(tabs[1].contents[1].contents.length, 18, 'as 18 perícias foram para a aba nova');
        assert.ok(keys([combat[2]]).includes('bonus_atr_vit_valor_temp'), 'temporários na linha dos atributos');
    });

    it('Oni: recursos no topo, Kekkijutsu depois do combate', async () => {
        const combat = (await read('oni')).system.body.contents[0].contents[0].contents;
        assert.ok(!combat.some(isSpacer));
        assert.ok(keys([combat[0]]).includes('pdk_oni_atual_valor_display'));
        assert.deepEqual(
            combat.map((node) => node.key).filter(Boolean),
            ['combat_oni_table', 'inventario_oni_kekkijutsus', 'acoes_oni_panel']
        );
    });

    it('NPC: recursos no topo e combate antes das armas', async () => {
        const body = (await read('npc')).system.body.contents;
        assert.ok(!body.some(isSpacer));
        assert.ok(keys([body[0]]).includes('pdv_npc_atual_valor_display'));
        const order = body.map((node) => node.key).filter(Boolean);
        assert.ok(order.indexOf('npc_combat') < order.indexOf('inventario_npc_armas'));
    });
});
