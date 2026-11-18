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
        const normal = recoveryOutcome({ props: baseProps({ nvl_num: 3 }), success: true, pdrRoll: 4, naturalTwenty: true, currentCombatId: 'c1' });
        assert.equal(normal.patch['system.props.pdr_slayer_curado'], 7);
        const reaction = recoveryOutcome({ props: baseProps({ nvl_num: 3 }), success: true, pdvRoll: 9, pdrRoll: 4, naturalTwenty: true, currentCombatId: 'c1', lastChance: true });
        assert.equal(reaction.patch['system.props.pdv_slayer_curado'], 9);
        assert.equal(reaction.patch['system.props.pdr_slayer_curado'], 10);
        const tired = recoveryOutcome({
            props: baseProps({ nvl_num: 3 }, { active: ['fadiga_espiritual'], exhaustion: 0, effects: {} }),
            success: true,
            pdrRoll: 9,
            currentCombatId: 'c1',
        });
        assert.equal(tired.patch['system.props.pdr_slayer_curado'], 3);
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

    it('estado de outro combate começa limpo e os máximos incluem bônus de PDR', () => {
        assert.equal(parseRecoveryState(JSON.stringify({ combatId: 'old', succeeded: true }), 'new').succeeded, false);
        assert.deepEqual(currentRecoveryResources(baseProps({ bonus_pdr_maximo_slayer: 3 })).pdrMax, 23);
    });
});

it('uso normal pode repetir fora de combate e exige os dois limites de recursos', async () => {
    const legacy = JSON.stringify({ combatId: 'fora-combate', attempted: true, succeeded: true });
    const props = baseProps({ pdv_slayer_dano_tomado: 14, resp_recuperacao_estado: legacy });
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
    foundry.applications.api.DialogV2.wait = async () => {
        opened++;
        return 'use';
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
