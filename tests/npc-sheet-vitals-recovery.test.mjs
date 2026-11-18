import { setupFoundryMocks } from './fixtures/foundry-mock.mjs';
setupFoundryMocks();

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import {
    currentRecoveryResources,
    hasRecoveryBreathing,
    recoveryBreathingLevel,
    recoveryOutcome,
} from '../scripts/recovery-breathing-service.mjs';
import { parseVitalAmount } from '../scripts/npc-vitals-service.mjs';

const template = JSON.parse(
    await readFile(new URL('../src/templates/actors/npc-template.json', import.meta.url), 'utf8')
);

function components(node, found = []) {
    if (!node || typeof node !== 'object') return found;
    if (Array.isArray(node)) {
        for (const child of node) components(child, found);
        return found;
    }
    if (node.type) found.push(node);
    for (const value of Object.values(node)) if (value && typeof value === 'object') components(value, found);
    return found;
}
const all = components(template.system);
const byKey = new Map(all.filter((node) => node.key).map((node) => [node.key, node]));
const text = (html) => String(html ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

const npcProps = (extra = {}) => ({
    npc_pdv_base: 30,
    npc_pdv_dano: 12,
    npc_pdv_curado: 0,
    npc_pdr_base: 20,
    npc_pdr_gasto_valor: 15,
    npc_pdr_recuperado: 0,
    npc_nivel: 7,
    vit_display: 4,
    fdv_display: 3,
    status_slayer_dados: JSON.stringify({ active: [], exhaustion: 0, effects: {} }),
    ...extra,
});

describe('ficha de NPC: layout', () => {
    it('abre a Marca canônica e usa seus bônus nos sete atributos do NPC', () => {
        const mark = byKey.get('npc_marca_gerenciar');
        assert.equal(mark?.style, 'button');
        assert.match(mark.rollMessage, /Macro\.NAHunterMark0001/);
        const hidden = new Map(template.system.hidden.map(({ name, value }) => [name, value]));
        assert.equal(hidden.get('nvl_respiracao_num'), '${nvl_respiracao}$');
        for (const key of ['vit', 'dex', 'for', 'car', 'fdv', 'int', 'sab'])
            assert.ok(hidden.get(`${key}_display`).includes(`${key}_marca_temp`), key);
    });

    it('não tem mais Personalidade, Tom nem História, e ganha NOTAS vazio', () => {
        for (const key of ['npc_personalidade', 'npc_personalidade_copy1', 'npc_personalidade_copy1_copy2'])
            assert.equal(byKey.has(key), false, key);
        const titles = all.map((node) => text(node.title || node.label || node.value).toLowerCase());
        for (const old of ['personalidade', 'tom / maneira de falar', 'história / contexto'])
            assert.ok(!titles.includes(old), old);
        const notes = byKey.get('npc_notas');
        assert.equal(notes?.type, 'textArea');
        assert.equal(notes.defaultValue, '');
    });

    it('não repete key em nenhum componente', () => {
        const counts = new Map();
        for (const node of all) if (node.key) counts.set(node.key, (counts.get(node.key) ?? 0) + 1);
        assert.deepEqual([...counts].filter(([, count]) => count > 1), []);
    });

    it('abas Combate, Configuração (GM) e Notas; nada essencial recolhido', () => {
        const tabs = template.system.body.contents[0];
        assert.equal(tabs.type, 'tabbedPanel');
        assert.deepEqual(
            tabs.contents.map((tab) => [tab.key, tab.name]),
            [['npc_ficha_tab', 'Combate'], ['npc_config_tab', 'Configuração'], ['npc_notas_tab', 'Notas']]
        );
        assert.equal(tabs.contents[1].role, 4);
        assert.deepEqual(tabs.contents[2].contents.map((node) => node.key), ['npc_notas']);
        assert.deepEqual(all.filter((node) => node.collapsible).map((node) => node.key), []);
        const ficha = new Set(components(tabs.contents[0]).map((node) => node.key));
        for (const key of ['npc_pdv_dano', 'npc_pdv_curado', 'npc_pdr_gasto_valor', 'npc_pdr_recuperado'])
            assert.ok(ficha.has(key), `${key} editável na aba Ficha`);
    });

    it('cabeçalho tem Nível (1–14) e só linhas completas de array', () => {
        const nivel = byKey.get('npc_nivel');
        assert.equal(nivel?.type, 'numberField');
        assert.equal(nivel.label, 'Nível');
        assert.equal(nivel.minVal, '1');
        assert.equal(nivel.maxVal, '14');
        const rows = template.system.header.contents[0].contents;
        assert.ok(rows.every((row) => Array.isArray(row) && row.length === 2 && row.every(Boolean)));
        const manage = components(byKey.get('npc_acoes_panel')).map((node) => node.key);
        assert.ok(manage.includes('acerto_label'), 'Escolha como Acerta fica junto dos gerenciadores');
    });

    it('GERENCIAR AÇÕES usa a macro e o contrato de ações do Slayer', () => {
        assert.match(byKey.get('npc_acoes_gerenciar').rollMessage, /NAActionManage01/);
        assert.match(byKey.get('npc_acoes_display').value, /acoes_slayer_resumo/);
        for (const key of ['acoes_slayer_dados', 'acoes_slayer_resumo', 'acoes_slayer_ataque_bonus'])
            assert.ok(byKey.has(key), `${key} guardado na aba Combate`);
    });

    it('configuração tem as bases e o nível, visível na sua aba', () => {
        const panel = byKey.get('npc_configuracao');
        assert.equal(panel?.type, 'panel');
        assert.ok(!panel.collapsible);
        assert.equal(panel.role, 4);
        const inside = new Set(components(panel).map((node) => node.key));
        for (const key of [
            'npc_vit_base', 'npc_dex_base', 'npc_for_base', 'npc_car_base', 'npc_fdv_base',
            'npc_int_base', 'npc_sab_base', 'npc_pdv_base', 'npc_pdr_base', 'nvl_respiracao',
        ])
            assert.ok(inside.has(key), `${key} deve estar na configuração`);
    });

    it('Bônus Fixos e bônus de ação ficam na aba Combate, visíveis como no Slayer', () => {
        const ficha = new Set(components(template.system.body.contents[0].contents[0]).map((node) => node.key));
        for (const key of ['npc_bonus_acerto', 'npc_bonus_dano', 'npc_bonus_teste',
            'npc_bonus_bloqueio', 'npc_bonus_esquiva', 'npc_bonus_percepcao_visual',
            'npc_bonus_percepcao_auditiva', 'npc_bonus_social_voz', 'npc_bonus_iniciativa',
            'npc_bonus_pdr_maximo', 'acoes_slayer_ataque_bonus', 'acoes_slayer_movimento_bonus',
            'acoes_slayer_especial_bonus', 'acoes_slayer_reacao_bonus'])
            assert.ok(ficha.has(key), `${key} deve estar na aba Combate`);
        assert.equal(byKey.get('npc_dados_combate').role, 0);
        for (const key of ['acoes_slayer_ataque_bonus', 'acoes_slayer_movimento_bonus',
            'acoes_slayer_especial_bonus', 'acoes_slayer_reacao_bonus']) {
            assert.equal(byKey.get(key).role, 0, `${key} visível`);
            assert.equal(byKey.get(key).editRole, 0, `${key} editável`);
        }
        for (const key of ['acoes_slayer_dados', 'acoes_slayer_resumo'])
            assert.equal(byKey.get(key).role, 4, `${key} continua interno ao GM`);
    });

    it('expõe os sete bônus temporários logo abaixo dos atributos do NPC', () => {
        const ficha = template.system.body.contents[0].contents[0];
        const grid = components(ficha).find((node) =>
            Array.isArray(node.contents) &&
            node.contents.some((field) => field?.key === 'npc_for_display_label')
        );
        assert.ok(grid);
        const attributes = ['vit', 'dex', 'for', 'car', 'fdv', 'int', 'sab'];
        for (const [index, attr] of attributes.entries()) {
            const key = `bonus_atr_${attr}_valor_temp`;
            const field = grid.contents[index + 14];
            assert.equal(grid.contents[index + 7].key, `npc_${attr}_display_label`);
            assert.equal(field.key, key);
            assert.equal(field.type, 'numberField');
            assert.equal(field.role, 0);
            assert.equal(field.editRole, 0);
            assert.equal(field.defaultValue, '0');
            assert.equal(template.system.hidden.find((node) => node.name === `${attr}_display`).value,
                '${' + `npc_${attr}_base+(${attr}_marca_temp ? ${attr}_marca_temp : 0)+(${key} ? ${key} : 0)` + '}$');
        }
    });

    it('mantém as keys de contrato (vida, status, hidden)', () => {
        for (const key of [
            'npc_pdv_dano', 'npc_pdv_curado', 'npc_pdr_gasto_valor', 'npc_pdr_recuperado',
            'npc_roll_acerto', 'npc_roll_dano', 'npc_roll_bloqueio', 'npc_roll_esquiva',
            'npc_status_gerenciar', 'npc_status_display', 'inventario_npc_armas',
            'pdv_slayer_atual_titulo', 'pdr_slayer_atual_valor_display',
        ])
            assert.ok(byKey.has(key), key);
        const hidden = new Map(template.system.hidden.map((entry) => [entry.name, entry.value]));
        assert.match(hidden.get('npc_pdv_atual'), /npc_pdv_base\+npc_pdv_curado\)-npc_pdv_dano/);
        assert.equal(hidden.get('status_slayer_resumo'), 'Nenhum status');
    });

    it('os rótulos não têm erro de caixa', () => {
        const labels = all.filter((node) => node.type === 'label').map((node) => text(node.value));
        assert.ok(!labels.includes('RECUPERADo'));
        assert.ok(!labels.includes('BLoqueio'));
    });
});

describe('ficha de NPC: painel de vida e Recuperação', () => {
    it('Nível de Respiração (1–4) e Formas de Respiração como no Slayer', () => {
        assert.equal(byKey.has('npc_recuperacao_nivel'), false);
        const breath = byKey.get('nvl_respiracao');
        assert.equal(breath?.type, 'numberField');
        assert.equal(breath.minVal, '1');
        assert.equal(breath.maxVal, '4');
        const forms = byKey.get('npc_respiracoes');
        assert.equal(forms?.type, 'itemContainer');
        assert.deepEqual(forms.templateFilter, ['NABreathTpl00001']);
        assert.match(JSON.stringify(forms.rowLayout), /NARespFormUse001/);
    });

    it('não tem botões DANO/CURAR: dano chega pelo fluxo de ataque com aceite do GM', () => {
        assert.equal(byKey.has('npc_vida_dano'), false);
        assert.equal(byKey.has('npc_vida_curar'), false);
    });

    it('RECUPERAÇÃO chama a macro com o ator da ficha', () => {
        assert.match(byKey.get('npc_roll_recuperacao').rollMessage, /NARecovery000001/);
        assert.match(byKey.get('npc_roll_recuperacao').rollMessage, /actorUuid:entity\.uuid/);
    });

    it('o nível da Recuperação é o Nível do NPC (1–14), como nvl_num no Slayer', () => {
        assert.equal(recoveryBreathingLevel(npcProps()), 7);
        assert.equal(recoveryBreathingLevel(npcProps({ npc_nivel: 20 })), 14);
        assert.equal(recoveryBreathingLevel(npcProps({ npc_nivel: '' })), 1);
        assert.equal(hasRecoveryBreathing({ type: 'npc', system: { props: npcProps() } }), true);
    });

    it('recursos do NPC vêm das keys npc_*', () => {
        assert.deepEqual(currentRecoveryResources(npcProps()), {
            pdvMax: 30, pdvRaw: 18, pdv: 18, pdrMax: 20, pdr: 5,
        });
    });

    it('nível 7: cura PDV e PDR nas keys do NPC, respeitando os máximos', () => {
        const result = recoveryOutcome({ props: npcProps(), success: true, pdvRoll: 99, pdrRoll: 99, currentCombatId: 'c1' });
        assert.equal(result.def.level, 7);
        assert.equal(result.def.dc, 17);
        assert.equal(result.patch['system.props.npc_pdv_curado'], 12);
        assert.equal(result.patch['system.props.npc_pdr_recuperado'], 15);
        assert.equal(result.patch['system.props.pdv_slayer_curado'], undefined);
        assert.equal(JSON.parse(result.patch['system.props.resp_recuperacao_estado']).succeeded, true);
    });

    it('crítico entra no ganho reduzido e Fadiga Espiritual corta o PDR pela metade', () => {
        const normal = recoveryOutcome({ props: npcProps({ npc_pdr_gasto_valor: 20 }), success: true, pdrRoll: 4, naturalTwenty: true, currentCombatId: 'c1' });
        assert.equal(normal.patch['system.props.npc_pdr_recuperado'], 13);
        const tired = recoveryOutcome({
            props: npcProps({
                npc_pdr_gasto_valor: 20,
                status_slayer_dados: JSON.stringify({ active: ['fadiga_espiritual'], exhaustion: 0, effects: {} }),
            }),
            success: true, pdrRoll: 4, naturalTwenty: true, currentCombatId: 'c1',
        });
        assert.equal(tired.patch['system.props.npc_pdr_recuperado'], 6);
    });
});

describe('painel de vida: valor digitado', () => {
    it('aceita inteiro positivo e rejeita o resto', () => {
        assert.equal(parseVitalAmount('12'), 12);
        assert.equal(parseVitalAmount(' 7 '), 7);
        assert.equal(parseVitalAmount(5), 5);
        for (const bad of ['', 'abc', '0', '-3', '2.5', null, undefined, NaN])
            assert.equal(parseVitalAmount(bad), null, String(bad));
    });
});
