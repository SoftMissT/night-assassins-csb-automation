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
    it('Slayer: combate direto, com apenas os bônus fixos recolhidos', async () => {
        const tabs = (await read('slayer')).system.body.contents[0].contents;
        assert.deepEqual(
            tabs.map((tab) => tab.key),
            ['combat_slayer_tab', 'pericias_slayer_tab', 'habilidades_slayer_tab', 'configs_tab']
        );
        const combat = tabs[0].contents;
        assert.ok(!combat.some(isSpacer), 'sem painéis espaçadores vazios');
        // Pedido do operador (2026-11-22): Bônus Fixos visível, com título, logo após o Combate e acima das Respirações.
        const combatAt = combat.findIndex((node) => node.key === 'combat_slayer_panel');
        assert.match(combat[combatAt + 1].value, /Bônus Fixos/i, 'título de seção do Bônus Fixos');
        const fixed = combat[combatAt + 2];
        assert.equal(fixed.collapsible, false, 'Bônus Fixos aberto, sem seta');
        assert.ok(combat.indexOf(fixed) < combat.findIndex((node) => node.key === 'skills_slayer_respiracoes'));
        assert.equal(fixed.role, 0);
        assert.ok(keys([fixed]).includes('bonus_acerto_slayer'));
        assert.ok(keys([combat[1]]).includes('bonus_atr_vit_valor_temp'), 'temporários na linha dos atributos');
        assert.ok(keys(combat.slice(2, 4)).includes('pdv_slayer_atual_valor_display'));
        assert.ok(keys(combat.slice(2, 4)).includes('pdr_slayer_atual_valor_display'));
        const order = combat.map((node) => node.key).filter(Boolean);
        assert.deepEqual(order, [
            'combat_slayer_panel',
            'acoes_slayer_panel',
            'inventario_slayer_armas',
            'inventario_slayer_itens',
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
        const config = tabs.find((tab) => tab.key === 'configs_tab');
        const skills = tabs.find((tab) => tab.key === 'habilidades_slayer_tab');
        assert.ok(!keys(config.contents).includes('slayer_rules_vanilla'), 'Regras da Mesa só nas configurações do módulo');
        for (const key of ['bonus_derivados_slayer_auditar']) {
            assert.ok(!keys(combat).includes(key));
            assert.equal(config.contents[0].contents.find((node) => node.key === key)?.role, 4);
        }
        assert.ok(keys(skills.contents).includes('armas_proficientes'));
        const flameDisplay = manage.find((node) => node.key === 'resp_chamas_display');
        assert.ok(flameDisplay, 'acúmulos (inclui o Fogo Fátuo) visíveis na aba de combate');
        assert.equal(flameDisplay.role, 0, 'acúmulos visíveis para jogadores');
        assert.match(flameDisplay.value, /ref\('resp_acumulos_resumo', 'Nenhum acúmulo ativo'\)/);
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

    it('Oni Minion: gerenciador de ações visível e dados na aba GM', async () => {
        const body = (await read('oni-minion')).system.body.contents;
        const panel = body.find((node) => node.key === 'acoes_oni_panel');
        assert.ok(panel, 'painel de ações presente na área visível');
        assert.equal(panel.role, 0);
        assert.equal(panel.collapsible, false);
        assert.deepEqual(
            panel.contents.map((node) => node.key),
            ['acoes_oni_gerenciar', 'acoes_oni_display']
        );
        const tab = body.find((node) => node.type === 'tabbedPanel').contents[0];
        const tabKeys = keys(tab.contents);
        for (const key of ['acoes_oni_dados', 'acoes_oni_resumo', 'acoes_oni_ataque_bonus',
            'acoes_oni_movimento_bonus', 'acoes_oni_especial_bonus', 'acoes_oni_reacao_bonus'])
            assert.ok(tabKeys.includes(key), `${key} na aba GM`);
    });

    it('NPC: recursos no topo e combate antes das armas', async () => {
        const body = (await read('npc')).system.body.contents;
        assert.ok(!body.some(isSpacer));
        const ficha = body[0].contents[0].contents;
        assert.ok(keys(ficha.slice(0, 4)).includes('pdv_npc_atual_valor_display'));
        const order = ficha.map((node) => node.key).filter(Boolean);
        assert.ok(order.indexOf('npc_combat') > -1);
        assert.ok(order.indexOf('npc_combat') < order.indexOf('inventario_npc_armas'));
        const npcCombatAt = ficha.findIndex((node) => node.key === 'npc_combat');
        assert.match(ficha[npcCombatAt + 1].value, /Bônus Fixos/i, 'título de seção do Bônus Fixos');
        const fixed = ficha[npcCombatAt + 2];
        assert.equal(fixed.collapsible, false, 'Bônus Fixos aberto, sem seta');
        assert.ok(ficha.indexOf(fixed) < ficha.findIndex((node) => node.key === 'npc_respiracoes'));
        assert.equal(fixed.role, 0);
        assert.ok(keys([fixed]).includes('npc_bonus_acerto'));
        const config = body[0].contents.find(node => node.key === 'npc_config_tab').contents;
        assert.ok(!keys(config).includes('npc_rules_vanilla'), 'Regras da Mesa só nas configurações do módulo');
        for (const key of ['npc_dados_combate', 'acoes_slayer_ataque_bonus']) {
            assert.ok(!keys(ficha).includes(key));
            assert.ok(keys(config).includes(key));
        }
    });

    it('Slayer e NPC exibem o inventário de itens gerais', async () => {
        for (const name of ['slayer', 'npc']) {
            const containers = [];
            const visit = (node) => {
                if (!node || typeof node !== 'object') return;
                if (Array.isArray(node)) return node.forEach(visit);
                if (node.type === 'itemContainer') containers.push(node);
                Object.values(node).forEach(visit);
            };
            visit((await read(name)).system);
            const generic = containers.find((node) =>
                String(node.itemFilterFormula ?? '').includes("'item'")
            );
            assert.ok(generic, `${name} sem inventário de itens gerais`);
            assert.equal(generic.nameLabel, 'Item');
            assert.deepEqual(
                generic.rowLayout.map((row) => row.key),
                ['item_efeito', 'item_quantidade', 'item_espacos']
            );
        }
    });
});

it('Slayer: Fôlego some quando Respirações está em Vanilla (regra só do Homebrew)', async () => {
    const template = await read('slayer');
    const gated = [];
    (function walk(node) {
        if (!node || typeof node !== 'object') return;
        if (node.type && (node.key === 'folego_slayer_atual' || /FÔLEGO: \$\{folego_slayer_maximo\}\$/.test(String(node.value ?? ''))))
            gated.push(node.visibilityFormula);
        Object.values(node).forEach(walk);
    })(template);
    assert.equal(gated.length, 2);
    for (const formula of gated) assert.match(formula, /not ref\('na_regras_respiracao', 0\)/);
});
