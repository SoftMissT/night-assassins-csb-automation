import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    buildWindBreathingPlan,
    clearWindBreathingState,
    consolidateWindScars,
    consumeWindPending,
    parseWindBreathingState,
    registerWindBattleDamage,
    tickWindBreathing,
} from '../scripts/wind-breathing-service.mjs';

const PROPS_BASE = {
    dex_display: 4,
    fdv_display: 3,
    vit_display: 5,
    for_display: 3,
    status_slayer_exaustao: 0,
};

describe('Respiração do Vento — Sangue Especial (passiva)', () => {
    it('Cortante/Perfurante: 29 não gera · 30 gera +1 cicatriz', () => {
        let state = registerWindBattleDamage(parseWindBreathingState({}), { cutPierce: 29 });
        state = registerWindBattleDamage(state, { cutPierce: 1 }); // 30 acumulado na batalha
        state = consolidateWindScars(state);
        assert.equal(state.scars, 1);
    });

    it('60 cortante = 2 cicatrizes · cap absoluto de +4', () => {
        let state = registerWindBattleDamage(parseWindBreathingState({}), { cutPierce: 60 });
        state = consolidateWindScars(state);
        assert.equal(state.scars, 2);
        state = registerWindBattleDamage(state, { cutPierce: 500 });
        state = consolidateWindScars(state);
        assert.equal(state.scars, 4);
    });

    it('Sangramento/Infecção: 24 não gera · 25 = +1 VIT · cap +4', () => {
        let state = registerWindBattleDamage(parseWindBreathingState({}), { bleedInfection: 24 });
        state = consolidateWindScars(state);
        assert.equal(state.vitBonus, 0);
        state = registerWindBattleDamage(state, { bleedInfection: 25 });
        state = consolidateWindScars(state);
        assert.equal(state.vitBonus, 1);
        state = registerWindBattleDamage(state, { bleedInfection: 500 });
        state = consolidateWindScars(state);
        assert.equal(state.vitBonus, 4);
    });

    it('consolidação zera os pools e é idempotente', () => {
        let state = registerWindBattleDamage(parseWindBreathingState({}), { cutPierce: 30 });
        state = consolidateWindScars(state);
        assert.deepEqual(state.battleDamage, { cutPierce: 0, bleedInfection: 0 });
        const again = consolidateWindScars(state);
        assert.equal(again.scars, state.scars);
    });

    it('fim de combate limpa apenas o pool da batalha — cicatrizes persistem', () => {
        const state = consolidateWindScars(
            registerWindBattleDamage(parseWindBreathingState({}), { cutPierce: 30 })
        );
        const cleared = parseWindBreathingState(
            JSON.parse(
                JSON.stringify(clearWindBreathingState(state)['system.props.resp_vento_estado'])
            )
        );
        assert.equal(cleared.scars, 1);
        assert.deepEqual(cleared.battleDamage, { cutPierce: 0, bleedInfection: 0 });
    });
});
describe('Respiração do Vento — P0: dano chega ao contrato pendingDamage', () => {
    it('Redemoinho Escalável: N1–N3 = 1d6/PDR · grava pendingDamage com o investimento', () => {
        const props = { ...PROPS_BASE };
        const plan = buildWindBreathingPlan('vento_02', 2, props, { pdrInvested: 4 });
        assert.equal(plan.ok, true);
        assert.equal(plan.cost, 4);
        assert.equal(plan.state.pendingDamage.source, 'vento_02');
        assert.equal(plan.state.pendingDamage.formula, '1d6 + 1d6 + 1d6 + 1d6');
        assert.equal(plan.state.pendingDamage.types[0], 'cortante');
    });

    it('Redemoinho N4 = 2d6 por PDR · acima de 2×DEX bloqueia sem cobrar', () => {
        const n4 = buildWindBreathingPlan('vento_02', 4, PROPS_BASE, { pdrInvested: 4 });
        assert.equal(n4.state.pendingDamage.formula, '2d6 + 2d6 + 2d6 + 2d6');
        const blocked = buildWindBreathingPlan('vento_02', 2, PROPS_BASE, { pdrInvested: 99 });
        assert.equal(blocked.ok, false); // clamp para 2×DEX=8... 99 > 8 → investe 8
        assert.notEqual(blocked.ok === false && blocked.reason, undefined);
        const zero = buildWindBreathingPlan('vento_02', 2, PROPS_BASE, { pdrInvested: 0 });
        assert.equal(zero.ok, false);
        assert.equal(zero.noCost, true);
    });

    it('Ciclone Penetrante: AoE oposto, máx 3 alvos, 5d6 Cortante', () => {
        const plan = buildWindBreathingPlan('vento_02_ciclone', 1, PROPS_BASE, {});
        assert.equal(plan.state.pendingDamage.cycloneOpposed, true);
        assert.equal(plan.state.pendingDamage.maxTargets, 3);
        assert.equal(plan.state.pendingDamage.formula, '5d6');
        assert.deepEqual(plan.state.pendingDamage.types, ['cortante']);
    });

    it('Garras do Vento Puro: prepara multiplicador, N1 indisponível, N4 soma DEX', () => {
        assert.equal(buildWindBreathingPlan('vento_03', 1, PROPS_BASE, {}).ok, false);
        const n2 = buildWindBreathingPlan('vento_03', 2, PROPS_BASE, {});
        assert.equal(n2.state.pendingDamage.garras.multiplier, 3);
        assert.equal(n2.state.pendingDamage.garras.addDex, false);
        const n4 = buildWindBreathingPlan('vento_03', 4, PROPS_BASE, {});
        assert.deepEqual(n4.state.pendingDamage.garras, { multiplier: 4, addDex: true });
        assert.equal(n4.cost, 5);
        // Sem dano imediato: pendente não tem fórmula própria
        assert.equal(n4.state.pendingDamage.formula, '');
    });

    it('Árvore: ataque 3d10/3 PDR · reação 2d8/2d12 + sinergia de crítico', () => {
        const attack = buildWindBreathingPlan('vento_04', 1, PROPS_BASE, {});
        assert.equal(attack.state.pendingDamage.formula, '3d10');
        assert.equal(attack.cost, 3);
        assert.equal(attack.state.pendingDamage.criticalSynergy, false);
        const reaction = buildWindBreathingPlan('vento_04', 3, PROPS_BASE, { secondUse: true });
        assert.equal(reaction.action, 'reacao');
        assert.equal(reaction.state.pendingDamage.formula, '2d12');
        assert.equal(reaction.state.pendingDamage.criticalSynergy, true);
        assert.equal(reaction.cost, 2);
    });

    it('Tempestade Crescente: trava de cura e sobretaxa de Kekkijutsu no N3+', () => {
        const n2 = buildWindBreathingPlan('vento_05', 2, PROPS_BASE, {});
        assert.equal(n2.state.pendingDamage.disablesHealing, true);
        assert.equal(n2.state.pendingDamage.kekkijutsuSurcharge, 0);
        assert.equal(n2.state.nextHit.count, 2);
        const n3 = buildWindBreathingPlan('vento_05', 3, PROPS_BASE, {});
        assert.equal(n3.state.pendingDamage.kekkijutsuSurcharge, 2);
        assert.equal(n3.cost, 5);
    });

    it('Vendaval: 3 ataques reais, ignora resistências, Exaustão única no N3+', () => {
        for (const [level, formula] of [
            [1, '2d4 + @fdv'],
            [2, '2d6 + @fdv'],
            [3, '2d8 + @fdv'],
            [4, '2d8 + @fdv + @dex'],
        ]) {
            const plan = buildWindBreathingPlan('vento_06', level, PROPS_BASE, {});
            assert.equal(plan.state.pendingDamage.formula, formula);
            assert.equal(plan.state.pendingDamage.ignoreResistance, true);
            assert.equal(plan.state.nextHit.count, 3);
        }
        assert.equal(
            buildWindBreathingPlan('vento_06', 1, PROPS_BASE, {}).state.pendingDamage.uses,
            3
        );
        const exhaustionN2 = buildWindBreathingPlan('vento_06', 2, PROPS_BASE, {}).patch[
            'system.props.status_slayer_exaustao'
        ];
        assert.equal(exhaustionN2, undefined);
        const exhaustionN3 = buildWindBreathingPlan('vento_06', 3, PROPS_BASE, {}).patch[
            'system.props.status_slayer_exaustao'
        ];
        assert.equal(exhaustionN3, 1); // uma única vez pelo uso, não por ataque
    });

    it('Fumaça Escurecedora: tipos separados, penalidade só no Bloqueio, crítico trava regeneração', () => {
        assert.equal(buildWindBreathingPlan('vento_07', 1, PROPS_BASE, {}).ok, false);
        const n2 = buildWindBreathingPlan('vento_07', 2, PROPS_BASE, {});
        assert.equal(n2.state.pendingDamage.formula, '8d6');
        assert.deepEqual(n2.state.pendingDamage.types, ['cortante']);
        const n4 = buildWindBreathingPlan('vento_07', 4, PROPS_BASE, {});
        assert.deepEqual(n4.state.pendingDamage.types, ['cortante', 'perfurante']);
        assert.equal(n4.state.pendingDamage.blockPenaltyVsBlock, -2);
        assert.equal(n4.state.pendingDamage.critBlocksRegenerationTurns, 1);
    });

    it('Ventania: CDs escaladas por DEX e dano de queda por nível', () => {
        const n1 = buildWindBreathingPlan('vento_08', 1, PROPS_BASE, {});
        assert.equal(n1.state.pendingDamage.ventania.dcFormula, '9+4');
        assert.equal(n1.state.pendingDamage.ventania.fallDamage, '2d6');
        const n4 = buildWindBreathingPlan('vento_08', 4, PROPS_BASE, {});
        assert.equal(n4.state.pendingDamage.ventania.dcFormula, '12+4');
        assert.equal(n4.state.pendingDamage.ventania.fallDamage, '3d6');
        assert.equal(n4.cost, 5);
    });

    it('Corte da Primeira Ventania: N1/N2 indisponíveis · cicatrizes consolidadas escalam', () => {
        assert.equal(buildWindBreathingPlan('vento_09', 1, PROPS_BASE, {}).ok, false);
        const noScarN3 = buildWindBreathingPlan(
            'vento_09',
            3,
            { ...PROPS_BASE, resp_vento_estado: JSON.stringify({ scars: 0 }) },
            {}
        );
        assert.equal(noScarN3.state.pendingDamage.formula, '4d12'); // mínimo garantido max(1, scars)
        const threeScars = buildWindBreathingPlan(
            'vento_09',
            3,
            { ...PROPS_BASE, resp_vento_estado: JSON.stringify({ scars: 3 }) },
            {}
        );
        assert.equal(threeScars.state.pendingDamage.formula, '4d12 + 4d12 + 4d12');
        const fourScarsN4 = buildWindBreathingPlan(
            'vento_09',
            4,
            { ...PROPS_BASE, resp_vento_estado: JSON.stringify({ scars: 4 }) },
            {}
        );
        assert.equal(fourScarsN4.state.pendingDamage.formula.split('+').length, 4);
        assert.equal(fourScarsN4.cost, 6);
    });

    it('Tufão Idaten: requer N4 + DEX ≥4 · dano composto · Exaustão e campos de sangramento', () => {
        assert.equal(
            buildWindBreathingPlan('vento_10', 4, { ...PROPS_BASE, dex_display: 3 }, {}).ok,
            false
        );
        const plan = buildWindBreathingPlan(
            'vento_10',
            4,
            { ...PROPS_BASE, dex_display: 5, resp_vento_estado: JSON.stringify({ scars: 3 }) },
            {}
        );
        assert.equal(plan.ok, true);
        assert.equal(plan.state.pendingDamage.formula, '10d10 + 3 * (2d10) + 5 * (2d10)');
        assert.equal(plan.state.pendingDamage.tufao.bleedSaveDc, '12+3'); // 12 + FOR
        assert.equal(plan.state.pendingDamage.tufao.healOnBigHit, 5);
        assert.equal(plan.patch['system.props.status_slayer_exaustao'], 1);
        assert.equal(plan.cost, 8);
    });

    it('consumeWindPending decrementa usos e consome ao esgotar', () => {
        const state = buildWindBreathingPlan('vento_06', 1, PROPS_BASE, {}).state;
        const afterFirst = consumeWindPending(state, { damage: true });
        assert.equal(afterFirst.pendingDamage.uses, 2);
        const afterSecond = consumeWindPending(afterFirst, { damage: true });
        assert.equal(afterSecond.pendingDamage.uses, 1);
        const afterThird = consumeWindPending(afterSecond, { damage: true });
        assert.equal(afterThird.pendingDamage, undefined);
    });

    it('estado legado (blunt/schemas antigos) carrega sem quebrar', () => {
        const legacy = JSON.stringify({ version: 1, scars: 2, battleDamage: { blunt: 10 } });
        const parsed = parseWindBreathingState(legacy);
        assert.equal(parsed.scars, 2);
        const consolidated = consolidateWindScars(parsed);
        assert.equal(consolidated.scars, 2);
        const ticked = tickWindBreathing(legacy);
        assert.ok(ticked.patch['system.props.resp_vento_estado']);
    });
});
