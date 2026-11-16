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
    it('Slayer: organização da ficha do operador, sem espaçadores nem painéis recolhidos', async () => {
        const tabs = (await read('slayer')).system.body.contents[0].contents;
        assert.deepEqual(
            tabs.map((tab) => tab.key),
            ['combat_slayer_tab', 'pericias_slayer_tab', 'habilidades_slayer_tab', 'configs_tab']
        );
        const combat = tabs[0].contents;
        assert.ok(!combat.some(isSpacer), 'sem painéis espaçadores vazios');
        assert.ok(!combat.some((node) => node.collapsible), 'nada recolhido na aba de combate');
        assert.ok(keys([combat[1]]).includes('bonus_atr_vit_valor_temp'), 'temporários na linha dos atributos');
        assert.ok(keys(combat.slice(2, 4)).includes('pdv_slayer_atual_valor_display'));
        assert.ok(keys(combat.slice(2, 4)).includes('pdr_slayer_atual_valor_display'));
        const order = combat.map((node) => node.key).filter(Boolean);
        assert.deepEqual(order, [
            'combat_slayer_panel',
            'acoes_slayer_panel',
            'inventario_slayer_armas',
            'skills_slayer_respiracoes',
        ]);
        const manage = combat.find((node) => node.key === 'acoes_slayer_panel').contents;
        assert.deepEqual(
            manage.slice(0, 6).map((node) => node.key),
            [
                'acoes_slayer_gerenciar', 'acoes_slayer_display',
                'resistencia_slayer_gerenciar', 'status_slayer_resistencias_display',
                'status_slayer_gerenciar', 'status_slayer_display',
            ],
            'gerenciadores em pares botão | resumo'
        );
        assert.equal(manage.at(-1).key, 'armas_proficientes');
        assert.equal(tabs[1].contents[1].contents.length, 18, 'as 18 perícias ficam na aba própria');
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
        const ficha = body[0].contents[0].contents;
        assert.ok(keys(ficha.slice(0, 4)).includes('pdv_npc_atual_valor_display'));
        const order = ficha.map((node) => node.key).filter(Boolean);
        assert.ok(order.indexOf('npc_combat') > -1);
        assert.ok(order.indexOf('npc_combat') < order.indexOf('inventario_npc_armas'));
    });
});
