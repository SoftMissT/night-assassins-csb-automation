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
    npc_recuperacao_nivel: 'rec_nivel_7',
    vit_display: 4,
    fdv_display: 3,
    status_slayer_dados: JSON.stringify({ active: [], exhaustion: 0, effects: {} }),
    ...extra,
});

describe('ficha de NPC: layout', () => {
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

    it('configuração fica num painel recolhido por padrão, só para GM, com as bases e o nível', () => {
        const panel = byKey.get('npc_configuracao');
        assert.equal(panel?.type, 'panel');
        assert.equal(panel.collapsible, true);
        assert.equal(panel.defaultCollapsed, true);
        assert.equal(panel.role, 4);
        const inside = new Set(components(panel).map((node) => node.key));
        for (const key of [
            'npc_vit_base', 'npc_dex_base', 'npc_for_base', 'npc_car_base', 'npc_fdv_base',
            'npc_int_base', 'npc_sab_base', 'npc_pdv_base', 'npc_pdr_base',
            'npc_recuperacao_nivel', 'npc_bonus_acerto', 'npc_bonus_dano', 'npc_bonus_pdr_maximo',
        ])
            assert.ok(inside.has(key), `${key} deve estar na configuração`);
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
    it('tem o dropdown de nível 0–14 com padrão sem Respiração', () => {
        const select = byKey.get('npc_recuperacao_nivel');
        assert.equal(select?.type, 'select');
        assert.equal(select.defaultValue, 'rec_nivel_0');
        assert.deepEqual(
            select.options.map((option) => option.key),
            Array.from({ length: 15 }, (_, level) => `rec_nivel_${level}`)
        );
        assert.equal(select.options[0].value, 'Sem Respiração');
        assert.equal(select.options[14].value, 'Nível 14');
    });

    it('DANO, CURAR e RECUPERAÇÃO chamam o serviço certo com o ator da ficha', () => {
        assert.match(byKey.get('npc_vida_dano').rollMessage, /openNpcVitals/);
        assert.match(byKey.get('npc_vida_dano').rollMessage, /mode:\s*'damage'/);
        assert.match(byKey.get('npc_vida_dano').rollMessage, /actorUuid:\s*entity\.uuid/);
        assert.match(byKey.get('npc_vida_curar').rollMessage, /openNpcVitals/);
        assert.match(byKey.get('npc_vida_curar').rollMessage, /mode:\s*'heal'/);
        assert.match(byKey.get('npc_roll_recuperacao').rollMessage, /NARecovery000001/);
        assert.match(byKey.get('npc_roll_recuperacao').rollMessage, /actorUuid:entity\.uuid/);
    });

    it('o nível numérico sai da key do dropdown e 0 desliga a técnica', () => {
        assert.equal(recoveryBreathingLevel(npcProps()), 7);
        assert.equal(recoveryBreathingLevel(npcProps({ npc_recuperacao_nivel: 'rec_nivel_14' })), 14);
        assert.equal(recoveryBreathingLevel(npcProps({ npc_recuperacao_nivel: 'rec_nivel_0' })), 0);
        assert.equal(hasRecoveryBreathing({ type: 'npc', system: { props: npcProps() } }), true);
        assert.equal(
            hasRecoveryBreathing({ type: 'npc', system: { props: npcProps({ npc_recuperacao_nivel: 'rec_nivel_0' }) } }),
            false
        );
    });

    it('recursos do NPC vêm das keys npc_*', () => {
        assert.deepEqual(currentRecoveryResources(npcProps()), {
            pdvMax: 30, pdvRaw: 18, pdv: 18, pdrMax: 20, pdr: 5,
        });
    });

    it('nível 7: cura PDV e PDR nas keys do NPC, respeitando os máximos', () => {
        const result = recoveryOutcome({ props: npcProps(), success: true, pdvRoll: 99, pdrRoll: 99, currentCombatId: 'c1' });
        assert.equal(result.def.level, 7);
        assert.equal(result.def.dc, 12);
        assert.equal(result.patch['system.props.npc_pdv_curado'], 12);
        assert.equal(result.patch['system.props.npc_pdr_recuperado'], 15);
        assert.equal(result.patch['system.props.pdv_slayer_curado'], undefined);
        assert.equal(JSON.parse(result.patch['system.props.resp_recuperacao_estado']).succeeded, true);
    });

    it('crítico soma 2 PDR por nível e Fadiga Espiritual corta o PDR pela metade', () => {
        const normal = recoveryOutcome({ props: npcProps({ npc_pdr_gasto_valor: 20 }), success: true, pdrRoll: 4, naturalTwenty: true, currentCombatId: 'c1' });
        assert.equal(normal.patch['system.props.npc_pdr_recuperado'], 18);
        const tired = recoveryOutcome({
            props: npcProps({
                npc_pdr_gasto_valor: 20,
                status_slayer_dados: JSON.stringify({ active: ['fadiga_espiritual'], exhaustion: 0, effects: {} }),
            }),
            success: true, pdrRoll: 4, naturalTwenty: true, currentCombatId: 'c1',
        });
        assert.equal(tired.patch['system.props.npc_pdr_recuperado'], 9);
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
