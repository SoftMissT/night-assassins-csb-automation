import { setupFoundryMocks } from './fixtures/foundry-mock.mjs';
setupFoundryMocks();

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    currentRecoveryResources,
    openRecoveryManager,
    parseRecoveryState,
    recoveryFormDefinition,
    recoveryOutcome,
} from '../scripts/recovery-breathing-service.mjs';

const baseProps = (extra = {}, status = { active: [], exhaustion: 0, effects: {} }) => ({
    nvl_num: 14,
    vit_display: 4,
    fdv_display: 4,
    pdv_slayer_total_conta: 30,
    pdv_slayer_dano_tomado: 10,
    pdv_slayer_curado: 0,
    pdr_slayer_total_conta: 20,
    pdr_slayer_gasto_valor: 15,
    pdr_slayer_curado: 0,
    status_slayer_dados: JSON.stringify(status),
    ...extra,
});

const statusOf = (patch) => JSON.parse(patch['system.props.status_slayer_dados']);
const recoveryOf = (patch) => JSON.parse(patch['system.props.resp_recuperacao_estado']);

describe('Respiração da Recuperação — tabela 1–14', () => {
    it('expõe exatamente os dados e CDs dos 14 níveis de personagem', () => {
        const expected = [
            ['2d8', '1d6', 16], ['3d8', '2d6', 16], ['4d8', '2d6', 16], ['4d10', '3d6', 17],
            ['5d10', '3d6', 17], ['6d10', '4d6', 17], ['7d10', '4d6', 17], ['7d12', '5d8', 18],
            ['8d12', '5d8', 18], ['9d12', '6d8', 18], ['10d12', '6d8', 18], ['11d12', '7d8', 19],
            ['12d12', '8d8', 19], ['14d12', '9d8', 19],
        ];
        assert.deepEqual(expected.map((_, index) => {
            const def = recoveryFormDefinition('recuperacao', index + 1);
            return [def.pdv, def.pdr, def.dc];
        }), expected);
    });
});

describe('Respiração da Recuperação — resultado', () => {
    it('cura PDV/PDR até os máximos e registra o sucesso para o fluxo de Última Chance', () => {
        const props = baseProps({ nvl_num: 4 }, { active: [], exhaustion: 0, effects: {} });
        const result = recoveryOutcome({ props, success: true, pdvRoll: 99, pdrRoll: 99, currentCombatId: 'c1' });
        assert.equal(result.patch['system.props.pdv_slayer_curado'], 10);
        assert.equal(result.patch['system.props.pdr_slayer_curado'], 15);
        assert.deepEqual(recoveryOf(result.patch), {
            version: 1, combatId: 'c1', attempted: true, succeeded: true, lastChanceUsed: false,
        });
    });

    it('falha gasta a ação mas permite nova tentativa normal', () => {
        const result = recoveryOutcome({ props: baseProps(), success: false, currentCombatId: 'c1' });
        assert.equal(result.patch['system.props.pdv_slayer_curado'], undefined);
        assert.equal(recoveryOf(result.patch).attempted, true);
        assert.equal(recoveryOf(result.patch).succeeded, false);
        assert.match(result.summary[0], /pode tentar novamente/u);
    });

    it('ganhos normais recebem o redutor, incluindo o crítico, e Última Chance mantém o ganho', () => {
        const props = baseProps({ nvl_num: 3 }, { active: ['fadiga_espiritual'], exhaustion: 0, effects: {} });
        const normal = recoveryOutcome({ props, success: true, pdrRoll: 4, naturalTwenty: true, currentCombatId: 'c1' });
        assert.equal(normal.patch['system.props.pdr_slayer_curado'], 7);
        assert.ok(normal.summary.includes('+7 PDR'));
        const reaction = recoveryOutcome({ props, success: true, pdvRoll: 9, pdrRoll: 4, naturalTwenty: true, currentCombatId: 'c1', lastChance: true });
        assert.equal(reaction.patch['system.props.pdv_slayer_curado'], 9);
        assert.equal(reaction.patch['system.props.pdr_slayer_curado'], 10);
    });

    it('Nível 4 remove Sangramento/Hemorragia e Nível 8 agenda um veneno ignorado', () => {
        const result = recoveryOutcome({
            props: baseProps({ nvl_num: 8 }, { active: ['sangramento', 'hemorragia', 'envenenamento'], exhaustion: 0, effects: {} }),
            success: true,
            pdvRoll: 1,
            pdrRoll: 1,
            currentCombatId: 'c1',
        });
        assert.deepEqual(statusOf(result.patch).active, ['envenenamento']);
        assert.equal(result.patch['system.props.resp_recuperacao_veneno_ignorar'], 1);
    });

    it('Nível 12 suspende uma fadiga até o início do próximo turno', () => {
        const props = baseProps({ nvl_num: 12 }, { active: ['fadiga_mental'], exhaustion: 0, effects: {} });
        const result = recoveryOutcome({ props, success: true, currentCombatId: 'c1' });
        assert.equal(result.patch['system.props.resp_recuperacao_fadiga_suspensa'], 1);
        assert.ok(result.summary.some((line) => line.includes('fadiga_mental')));
        const outside = recoveryOutcome({ props, success: true, currentCombatId: null });
        assert.equal(outside.patch['system.props.resp_recuperacao_fadiga_suspensa'], undefined);
    });

    it('Nível 12 não suspende Fadiga Espiritual de uma ficha antiga', () => {
        const props = baseProps({ nvl_num: 12 }, { active: ['fadiga_espiritual'], exhaustion: 0, effects: {} });
        const result = recoveryOutcome({ props, success: true, currentCombatId: 'c1' });
        assert.equal(result.patch['system.props.resp_recuperacao_fadiga_suspensa'], undefined);
        assert.deepEqual(statusOf(result.patch).active, ['fadiga_espiritual']);
    });

    it('estado de outro combate começa limpo e os máximos incluem bônus de PDR', () => {
        assert.equal(parseRecoveryState(JSON.stringify({ combatId: 'old', succeeded: true }), 'new').succeeded, false);
        assert.deepEqual(currentRecoveryResources(baseProps({ bonus_pdr_maximo_slayer: 3 })).pdrMax, 23);
    });
});

it('PDV e PDR pode ser usado repetidamente fora de combate enquanto a opção estiver disponível', async () => {
    const legacy = JSON.stringify({ combatId: 'fora-combate', attempted: true, succeeded: true });
    const props = baseProps({
        pdv_slayer_dano_tomado: 14, pdr_slayer_gasto_valor: 0, resp_recuperacao_estado: legacy,
    });
    const actor = {
        isOwner: true,
        system: { props },
        update: async (patch) => {
            for (const [key, value] of Object.entries(patch))
                props[key.replace('system.props.', '')] = value;
        },
    };
    game.user.character = actor;
    game.combat = { id: 'outra-luta', started: true, combatants: [] };
    let opened = 0;
    foundry.applications.api.DialogV2.wait = async (dialog) => {
        const button = dialog.buttons.find(({ action }) => action === 'both');
        if (button.disabled) return null;
        opened++;
        return button.callback();
    };
    globalThis.Roll = class {
        constructor(formula) {
            this.total = formula.startsWith('1d20 +') ? 19 : 4;
        }
        async evaluate() { return this; }
        async toMessage() {}
    };
    ChatMessage.create = async () => {};

    await openRecoveryManager();
    props.pdv_slayer_dano_tomado = 18;
    props.pdr_slayer_gasto_valor = 9;
    await openRecoveryManager();
    assert.equal(opened, 0);

    props.pdr_slayer_gasto_valor = 13;
    assert.equal((await openRecoveryManager()).success, true);
    assert.equal((await openRecoveryManager()).success, true);
    await openRecoveryManager();
    assert.equal(opened, 2);
    assert.equal(props.pdv_slayer_curado, 6);
    assert.equal(props.pdr_slayer_curado, 6);
    assert.equal(props.resp_recuperacao_estado, legacy);
    assert.equal(props.acoes_slayer_dados, undefined);
});

for (const mode of ['normal', 'lastChance']) {
    it(`${mode}: Recuperação lê VIT e FDV da ficha quando os displays estão em branco`, async () => {
        setupFoundryMocks();
        const props = mode === 'normal' ? {
            npc_nome: 'NPC de teste', npc_nivel: 1,
            npc_pdv_base: 105, npc_pdv_dano: 60,
            npc_pdr_base: 37, npc_pdr_gasto_valor: 20,
            npc_vit_base: 6, vit_marca_temp: 2,
            npc_fdv_base: 4, bonus_atr_fdv_valor_temp: 3,
        } : baseProps({
            nvl_num: 1, atr_vit_valor_config: 6, vit_marca_temp: 2,
            atr_fdv_valor_config: 4, bonus_atr_fdv_valor_temp: 3,
        });
        props.fdv_display = '';
        props.vit_display = '';
        game.user.character = { isOwner: true, system: { props }, update: async () => {} };
        foundry.applications.api.DialogV2.wait = async (dialog) =>
            dialog.buttons.find(({ action }) => action === 'both').callback();
        foundry.applications.api.DialogV2.confirm = async () => true;
        ChatMessage.create = async () => {};
        const formulas = [];
        globalThis.Roll = class {
            constructor(formula) {
                formulas.push(formula);
                this.total = 20;
            }
            static create(formula) { return new this(formula); }
            async evaluate() { return this; }
            async toMessage() {}
        };

        const result = await openRecoveryManager({ mode });
        assert.equal(result.success, true);
        assert.deepEqual(formulas, ['1d20 + 7', '2d8 + 8', '1d6 + 7']);
    });
}

const normalCases = [
    { label: '54 de 105 PDV e PDR cheio', damage: 51, spent: 0, choice: 'pdv', enabled: ['pdv'], pdv: 6 },
    { label: 'um único PDV perdido e 18 PDR gastos', damage: 1, spent: 18, choice: 'pdv', enabled: ['pdv'], pdv: 1 },
    { label: 'vida cheia e 19 PDR gastos', damage: 0, spent: 19, choice: 'pdr', enabled: ['pdr'], pdr: 7 },
    { label: 'ambas as condições em combate', damage: 51, spent: 19, choice: 'both', enabled: ['pdv', 'pdr', 'both'], pdv: 6, pdr: 7, inCombat: true },
    { label: '20 natural em Só PDV mesmo com ambos disponíveis', damage: 51, spent: 19, choice: 'pdv', enabled: ['pdv', 'pdr', 'both'], pdv: 6 },
    { label: 'recursos cheios', damage: 0, spent: 0, choice: 'cancel', enabled: [] },
    { label: 'mudança de PDR antes de confirmar', damage: 51, spent: 19, choice: 'both', enabled: ['pdv', 'pdr', 'both'], changed: true, inCombat: true },
    { label: 'falha no teste de FDV', damage: 51, spent: 19, choice: 'both', enabled: ['pdv', 'pdr', 'both'], fail: true },
];

for (const entry of normalCases) {
    it(`escolha de recuperação: ${entry.label}`, async () => {
        setupFoundryMocks();
        const props = {
            npc_nome: 'NPC', npc_nivel: 1,
            npc_pdv_base: 105, npc_pdv_dano: entry.damage,
            npc_pdr_base: 37, npc_pdr_gasto_valor: entry.spent,
            npc_vit_base: 4, npc_fdv_base: 3,
        };
        game.user.character = {
            isOwner: true, system: { props },
            update: async (patch) => {
                for (const [key, value] of Object.entries(patch))
                    props[key.replace('system.props.', '')] = value;
            },
        };
        if (entry.inCombat) game.combat = {
            id: 'combate', started: true, combatants: [{ actor: game.user.character }],
        };
        foundry.applications.api.DialogV2.wait = async ({ buttons, content }) => {
            assert.deepEqual(buttons.filter(b => b.action !== 'cancel' && !b.disabled).map(b => b.action), entry.enabled);
            assert.match(content, /de 19 exigidos/);
            if (entry.changed) props.npc_pdr_gasto_valor = 18;
            return buttons.find(({ action }) => action === entry.choice).callback();
        };
        ChatMessage.create = async () => {};
        const formulas = [];
        globalThis.Roll = class {
            constructor(formula) {
                formulas.push(formula);
                const test = formula.startsWith('1d20');
                this.total = test ? (entry.fail ? 7 : 23) : 8;
                this.dice = test ? [{ results: [{ result: entry.fail ? 4 : 20 }] }] : [];
            }
            async evaluate() { return this; }
            async toMessage() {}
        };
        const result = await openRecoveryManager();
        assert.equal(result?.patch?.['system.props.npc_pdv_curado'], entry.pdv);
        assert.equal(result?.patch?.['system.props.npc_pdr_recuperado'], entry.pdr);
        const actions = JSON.parse(props.acoes_slayer_dados ?? '{}');
        assert.equal(actions.turn?.especial ?? 0, entry.inCombat && !entry.changed ? 1 : 0);
        if (entry.fail) assert.equal(result.success, false);
        if (entry.changed || entry.choice === 'cancel') {
            assert.deepEqual(formulas, []);
        } else {
            assert.deepEqual(formulas, [
                '1d20 + 3',
                ...(entry.pdv ? ['2d8 + 4'] : []),
                ...(entry.pdr ? ['1d6 + 3'] : []),
            ]);
        }
    });
}
