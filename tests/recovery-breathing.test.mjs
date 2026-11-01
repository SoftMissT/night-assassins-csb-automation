import { setupFoundryMocks } from './fixtures/foundry-mock.mjs';
setupFoundryMocks();

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    currentRecoveryResources,
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
            ['2d8', '1d6', 14], ['3d8', '2d6', 14], ['4d8', '2d6', 14], ['4d10', '3d6', 12],
            ['5d10', '3d6', 12], ['6d10', '4d6', 12], ['7d10', '4d6', 12], ['7d12', '5d8', 10],
            ['8d12', '5d8', 10], ['9d12', '6d8', 10], ['10d12', '6d8', 10], ['11d12', '7d8', 8],
            ['12d12', '8d8', 8], ['14d12', '9d8', 8],
        ];
        assert.deepEqual(expected.map((_, index) => {
            const def = recoveryFormDefinition('recuperacao', index + 1);
            return [def.pdv, def.pdr, def.dc];
        }), expected);
    });
});

describe('Respiração da Recuperação — resultado', () => {
    it('cura PDV/PDR até os máximos e marca um sucesso por combate', () => {
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

    it('20 natural soma 2 PDR por nível antes do teto e Fadiga Espiritual reduz o total', () => {
        const normal = recoveryOutcome({ props: baseProps({ nvl_num: 3 }), success: true, pdrRoll: 4, naturalTwenty: true, currentCombatId: 'c1' });
        assert.equal(normal.patch['system.props.pdr_slayer_curado'], 10);
        const tired = recoveryOutcome({
            props: baseProps({ nvl_num: 3 }, { active: ['fadiga_espiritual'], exhaustion: 0, effects: {} }),
            success: true,
            pdrRoll: 9,
            currentCombatId: 'c1',
        });
        assert.equal(tired.patch['system.props.pdr_slayer_curado'], 4);
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
        const result = recoveryOutcome({
            props: baseProps({ nvl_num: 12 }, { active: ['fadiga_mental'], exhaustion: 0, effects: {} }),
            success: true,
            pdvRoll: 1,
            pdrRoll: 1,
            currentCombatId: 'c1',
        });
        assert.equal(result.patch['system.props.resp_recuperacao_fadiga_suspensa'], 1);
        assert.ok(result.summary.some((line) => line.includes('fadiga_mental')));
    });

    it('estado de outro combate começa limpo e os máximos incluem bônus de PDR', () => {
        assert.equal(parseRecoveryState(JSON.stringify({ combatId: 'old', succeeded: true }), 'new').succeeded, false);
        assert.deepEqual(currentRecoveryResources(baseProps({ bonus_pdr_maximo_slayer: 3 })).pdrMax, 23);
    });
});
