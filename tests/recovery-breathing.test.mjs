import { setupFoundryMocks } from './fixtures/foundry-mock.mjs';
setupFoundryMocks();

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    recoveryFormDefinition,
    recoveryOutcome,
} from '../scripts/recovery-breathing-service.mjs';
import { getRollStatusEffects, getStatusCapabilities } from '../scripts/status-effects.mjs';
import { applySlayerDamage } from '../scripts/status-engine.mjs';

/** Slayer com 30 PDV e 20 PDR máximos; o resto vem por `extra`. */
const slayer = (extra = {}, status = { active: [], exhaustion: 0, effects: {} }) => ({
    nvl_respiracao_num: 3,
    vit_display: 4,
    fdv_display: 3,
    pdv_slayer_total_conta: 30,
    pdv_slayer_dano_tomado: 10,
    pdv_slayer_curado: 0,
    pdr_slayer_total_conta: 20,
    pdr_slayer_gasto_valor: 15,
    pdr_slayer_curado: 0,
    status_slayer_dados: JSON.stringify(status),
    ...extra,
});
const stateOf = (patch) => JSON.parse(patch['system.props.status_slayer_dados']);

describe('Recuperação: tabela das Formas', () => {
    it('CD de FDV cai com o nível: 14, 12, 10, 8', () => {
        assert.deepEqual(
            [1, 2, 3, 4].map((level) => recoveryFormDefinition('coagulação', level).dc),
            [14, 12, 10, 8]
        );
        assert.equal(recoveryFormDefinition('choque', 1).dc, 0);
    });

    it('Expurgo só a partir do Nível 2 e Sinfonia só a partir do 3', () => {
        assert.equal(recoveryFormDefinition('expurgo', 1).available, false);
        assert.equal(recoveryFormDefinition('expurgo', 2).available, true);
        assert.equal(recoveryFormDefinition('sinfonia', 2).available, false);
        assert.equal(recoveryFormDefinition('sinfonia', 3).available, true);
        assert.equal(recoveryFormDefinition('sinfonia', 3).attrMultiplier, 2);
    });
});

describe('Recuperação: resultado', () => {
    it('Coagulação cura até o máximo, recupera PDR e estanca Sangramento e Hemorragia', () => {
        const props = slayer({}, { active: ['sangramento', 'hemorragia', 'encorajado'], exhaustion: 0, effects: {} });
        const { patch } = recoveryOutcome({ formId: 'coagulação', props, success: true, pdvRoll: 99, pdrRoll: 8 });
        assert.equal(patch['system.props.pdv_slayer_curado'], 10, 'só o que falta (30 - 20)');
        assert.equal(patch['system.props.pdr_slayer_curado'], 8);
        assert.deepEqual(stateOf(patch).active, ['encorajado']);
    });

    it('falha não cura, não recupera e não remove nada', () => {
        const props = slayer({}, { active: ['sangramento'], exhaustion: 0, effects: {} });
        const { patch, summary } = recoveryOutcome({ formId: 'coagulação', props, success: false });
        assert.equal(patch['system.props.pdv_slayer_curado'], undefined);
        assert.deepEqual(stateOf(patch).active, ['sangramento']);
        assert.match(summary[0], /falhou/u);
    });

    it('20 natural soma 2 PDR por nível; Fadiga Espiritual corta o PDR pela metade', () => {
        let { patch } = recoveryOutcome({ formId: 'coagulação', props: slayer(), success: true, pdrRoll: 4, naturalTwenty: true });
        assert.equal(patch['system.props.pdr_slayer_curado'], 10, '4 + 2×3');
        ({ patch } = recoveryOutcome({
            formId: 'coagulação',
            props: slayer({}, { active: ['fadiga_espiritual'], exhaustion: 0, effects: {} }),
            success: true,
            pdrRoll: 9,
        }));
        assert.equal(patch['system.props.pdr_slayer_curado'], 4, 'metade de 9, para baixo');
    });

    it('Expurgo dá PDV temporário (o maior fica) e remove Fadiga Espiritual e o status do reteste', () => {
        const props = slayer(
            { nvl_respiracao_num: 2, pdv_slayer_extra: 3 },
            { active: ['fadiga_espiritual', 'paralisia'], exhaustion: 0, effects: {} }
        );
        const { patch } = recoveryOutcome({
            formId: 'expurgo',
            props,
            success: true,
            pdvRoll: 9,
            alsoRemove: ['paralisia'],
        });
        assert.equal(patch['system.props.pdv_slayer_extra'], 9);
        assert.equal(patch['system.props.pdv_slayer_curado'], undefined, 'temporário não é cura');
        assert.deepEqual(stateOf(patch).active, []);
        const smaller = recoveryOutcome({ formId: 'expurgo', props, success: true, pdvRoll: 2 });
        assert.equal(smaller.patch['system.props.pdv_slayer_extra'], undefined, 'temporário menor não substitui');
    });

    it('Choque deixa com exatamente 1 PDV mesmo com dano além do zero e marca a imunidade à Exaustão', () => {
        const props = slayer({ nvl_respiracao_num: 4, pdv_slayer_dano_tomado: 42 });
        const { patch } = recoveryOutcome({ formId: 'choque', props, success: true, pdrRoll: 5 });
        const pdv = 30 + patch['system.props.pdv_slayer_curado'] - 42;
        assert.equal(pdv, 1);
        const state = stateOf(patch);
        assert.ok(state.active.includes('choque_adrenergico'));
        assert.equal(state.effects.choque_adrenergico.remainingTurns, 2, 'Nível 4: 2 rodadas');
    });

    it('Sinfonia zera a Exaustão, tira as Fadigas e deixa Ofegante; falha também deixa Ofegante', () => {
        const props = slayer(
            { status_slayer_exaustao: 3 },
            { active: ['fadiga_corporal', 'fadiga_mental'], exhaustion: 3, effects: {} }
        );
        const { patch } = recoveryOutcome({ formId: 'sinfonia', props, success: true, pdvRoll: 5, pdrRoll: 5 });
        assert.equal(patch['system.props.status_slayer_exaustao'], 0);
        assert.equal(stateOf(patch).exhaustion, 0);
        assert.deepEqual(stateOf(patch).active, ['ofegante']);
        const failed = recoveryOutcome({ formId: 'sinfonia', props, success: false });
        assert.ok(stateOf(failed.patch).active.includes('ofegante'));
        assert.equal(stateOf(failed.patch).exhaustion, 3);
    });
});

describe('Recuperação: efeitos no resto do sistema', () => {
    it('Choque Adrenérgico ignora as penalidades de Exaustão nos testes e no deslocamento', () => {
        const exhausted = { active: [], exhaustion: 3, effects: {} };
        const before = slayer({}, exhausted);
        assert.ok(getRollStatusEffects(before, { test: 'Acrobacia', attr: 'DEX' }).reasons.some((r) => /Exaustão/u.test(r)));
        assert.equal(getStatusCapabilities(before).movementAllowed, false);
        const during = slayer({}, { ...exhausted, active: ['choque_adrenergico'] });
        assert.ok(!getRollStatusEffects(during, { test: 'Acrobacia', attr: 'DEX' }).reasons.some((r) => /Exaustão/u.test(r)));
        assert.equal(getStatusCapabilities(during).movementAllowed, true);
    });

    it('Autocontrole Celular: Vantagem em VIT enquanto Envenenado ou com Hemorragia', () => {
        const poisoned = slayer({}, { active: ['envenenamento'], exhaustion: 0, effects: {} });
        assert.equal(getRollStatusEffects(poisoned, { test: 'Resistência', attr: 'VIT' }).mode, 'advantage');
        assert.equal(getRollStatusEffects(poisoned, { test: 'Atletismo', attr: 'FOR' }).mode, 'normal');
        assert.equal(getRollStatusEffects(slayer(), { test: 'Resistência', attr: 'VIT' }).mode, 'normal');
        const oni = { status_slayer_dados: poisoned.status_slayer_dados };
        assert.equal(getRollStatusEffects(oni, { test: 'Resistência', attr: 'VIT' }).mode, 'normal', 'só quem tem a Respiração');
    });

    it('PDV temporário absorve o dano antes do PDV', async () => {
        const updates = [];
        const actor = {
            name: 'S',
            system: { props: slayer({ pdv_slayer_extra: 6 }) },
            update: async (patch) => updates.push(patch),
        };
        const result = await applySlayerDamage(actor, 10, { isAttack: false });
        assert.equal(result.temporaryAbsorbed, 6);
        assert.equal(updates[0]['system.props.pdv_slayer_extra'], 0);
        assert.equal(updates[0]['system.props.pdv_slayer_dano_tomado'], 10 + 4);
    });

    it('dano menor que o temporário não toca o PDV', async () => {
        const updates = [];
        const actor = {
            name: 'S',
            system: { props: slayer({ pdv_slayer_extra: 6 }) },
            update: async (patch) => updates.push(patch),
        };
        await applySlayerDamage(actor, 4, { isAttack: false });
        assert.equal(updates[0]['system.props.pdv_slayer_extra'], 2);
        assert.equal(updates[0]['system.props.pdv_slayer_dano_tomado'], 10);
    });
});
