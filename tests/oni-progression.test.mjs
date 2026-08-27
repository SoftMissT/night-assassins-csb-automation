import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    oniRank,
    oniSpecializationRank,
    oniKekkijutsuRank,
    oniUnarmedProfile,
    oniRegenerationProfile,
    oniLegendaryActions,
    oniRandomPdvRequirements,
    missingOniPdvGains,
    calculateOniResources,
    ensureOniProgression,
} from '../scripts/oni/progression-service.mjs';
import { handleActorUpdate } from '../scripts/trigger-router.mjs';

describe('Progressão Oni 1–20', () => {
    describe('Rank da Especialização — decisão do Operador (modelo 1B)', () => {
        const tabela = [
            [2, null],
            [3, 'C'],
            [6, 'C'],
            [7, 'B'],
            [11, 'B'],
            [12, 'A'],
            [15, 'A'],
            [16, 'S'],
            [18, 'S'],
            [19, 'SS'],
            [20, 'SS'],
        ];
        for (const [level, expected] of tabela) {
            it(`N${level} → ${expected ?? 'sem rank'}`, () => {
                assert.equal(oniSpecializationRank(level), expected);
            });
        }
    });

    describe('Patente automática', () => {
        it('faixas e nomes específicos', () => {
            assert.equal(oniRank(1).title, 'Oni Recém-Transformado');
            assert.equal(oniRank(6).band, 'oni');
            assert.equal(oniRank(7).title, 'Candidato às Doze Kizuki');
            assert.equal(oniRank(8).title, 'Lua Inferior Seis');
            assert.equal(oniRank(13).band, 'lua_inferior');
            assert.equal(oniRank(14).title, 'Lua Superior Seis');
            assert.equal(oniRank(19).band, 'lua_superior');
            assert.equal(oniRank(20).title, 'Rei dos Onis');
        });
    });

    describe('Dano desarmado por nível', () => {
        it('N1 sem dado, sobrenatural só a partir de N4', () => {
            assert.equal(oniUnarmedProfile(1).formula, '2+FOR');
            assert.equal(oniUnarmedProfile(1).supernatural, false);
            assert.equal(oniUnarmedProfile(4).formula, '1d6+FOR');
            assert.equal(oniUnarmedProfile(4).supernatural, true);
        });
        it('escalada marcial e garras/mordida', () => {
            assert.equal(oniUnarmedProfile(10).formula, '2d8+FOR');
            assert.equal(oniUnarmedProfile(13).formula, '3d8+FOR');
            assert.equal(oniUnarmedProfile(16).formula, '4d10+FOR');
            assert.equal(oniUnarmedProfile(20).formula, '6d10+FOR');
            const claw = oniUnarmedProfile(7, 'clawBite');
            assert.equal(claw.attribute, 'DEX');
            assert.equal(claw.formula, '2d6+DEX');
        });
    });

    describe('Regeneração por faixa', () => {
        it('gates e fórmulas', () => {
            assert.equal(oniRegenerationProfile(1).available, false);
            const n2 = oniRegenerationProfile(2);
            assert.deepEqual(n2.allowedActions, ['special']);
            assert.equal(n2.activeFormula, '1d4+VIT');
            assert.equal(oniRegenerationProfile(5).activeFormula, '1d6+VIT');
            const n9 = oniRegenerationProfile(9);
            assert.equal(n9.activeFormula, '2d4+VIT');
            assert.ok(n9.allowedActions.includes('unique'));
            assert.equal(n9.reattachAvailable, true);
            assert.equal(oniRegenerationProfile(13).automaticStartTurnFormula, 'VIT');
            assert.equal(oniRegenerationProfile(17).limbsRegrowNextTurn, true);
        });
    });

    describe('Ações Lendárias', () => {
        it('N12=0 · N13=1 · N17=2 · N19=3', () => {
            assert.equal(oniLegendaryActions(12), 0);
            assert.equal(oniLegendaryActions(13), 1);
            assert.equal(oniLegendaryActions(17), 2);
            assert.equal(oniLegendaryActions(19), 3);
        });
    });

    describe('Ledger de ganhos aleatórios de PDV (níveis 2–12)', () => {
        it('N1 não exige nenhum ganho', () => {
            const req = oniRandomPdvRequirements(1, {});
            assert.equal(req.complete, true);
            assert.equal(req.required.length, 0);
        });

        it('level jump N10 lista exatamente os ganhos 2..10 pendentes', () => {
            const missing = missingOniPdvGains(10, {});
            assert.deepEqual(
                missing.map((entry) => entry.level),
                [2, 3, 4, 5, 6, 7, 8, 9, 10]
            );
        });

        it('persistidos nunca rerrolam e somam uma única vez', () => {
            const persisted = { pdv_oni_ganho_nvl2: 3, pdv_oni_ganho_nvl3: 4 };
            const first = oniRandomPdvRequirements(5, persisted);
            assert.equal(first.missing.length, 2); // nvl4 e nvl5
            assert.equal(first.total, 7);
            assert.equal(oniRandomPdvRequirements(5, persisted).total, 7); // estável
        });

        it('reduzir nível preserva histórico dos níveis acima', () => {
            const history = { pdv_oni_ganho_nvl2: 3, pdv_oni_ganho_nvl9: 5 };
            const atEight = oniRandomPdvRequirements(8, history);
            assert.equal(atEight.total, 3); // nvl9 ignorado enquanto N8
            assert.equal(history.pdv_oni_ganho_nvl9, 5); // não apagado
        });

        it('aceita formato indexado legado', () => {
            const req = oniRandomPdvRequirements(3, { 2: 2 });
            assert.equal(req.total, 2);
            assert.equal(req.complete, false);
        });
    });

    describe('PDV/PDK máximos calculados', () => {
        it('N1: só origem', () => {
            const r = calculateOniResources({ level: 1, originPdv: 18, originPdk: 8, vitality: 3 });
            assert.equal(r.pdvMaximum, 18);
            assert.equal(r.pdkMaximum, 8);
            assert.equal(r.randomPdvComplete, true);
        });

        it('N5: origem + ganhos rolados 2..5 (sem fixo)', () => {
            const persisted = {
                pdv_oni_ganho_nvl2: 2,
                pdv_oni_ganho_nvl3: 3,
                pdv_oni_ganho_nvl4: 4,
                pdv_oni_ganho_nvl5: 5,
            };
            const r = calculateOniResources({
                level: 5,
                originPdv: 20,
                originPdk: 8,
                vitality: 4,
                persistedPdvGains: persisted,
            });
            assert.equal(r.breakdown.randomPdv, 14);
            assert.equal(r.pdvMaximum, 34);
            assert.equal(r.breakdown.pdkGained, 4 + 4 + 6 + 6); // níveis 2..5
            assert.equal(r.pdkMaximum, 8 + 20);
            assert.equal(r.randomPdvComplete, true);
        });

        it('N10 incompleto reporta faltantes sem quebrar o máximo parcial', () => {
            const r = calculateOniResources({
                level: 10,
                originPdv: 28,
                originPdk: 18,
                vitality: 5,
                persistedPdvGains: {},
            });
            assert.equal(r.randomPdvComplete, false);
            assert.equal(r.missingPdvGains.length, 9);
            assert.ok(r.pdvMaximum >= 28);
        });

        it('N15/N20 aplicam ganhos fixos com VIT', () => {
            const persistedAll12 = {};
            let sum = 0;
            for (let lvl = 2; lvl <= 12; lvl += 1) {
                persistedAll12[`pdv_oni_ganho_nvl${lvl}`] = 1;
                sum += 1;
            }
            const n15 = calculateOniResources({
                level: 15,
                originPdv: 30,
                originPdk: 24,
                vitality: 6,
                persistedPdvGains: persistedAll12,
            });
            // fixos 13,14,15 = 3 × (30+6)
            assert.equal(n15.breakdown.fixedPdv, 3 * 36);
            const n20 = calculateOniResources({
                level: 20,
                originPdv: 30,
                originPdk: 24,
                vitality: 6,
                persistedPdvGains: persistedAll12,
            });
            // 13..15 = 36 cada; 16..19 = 46 cada; 20 = 50+30
            assert.equal(n20.breakdown.fixedPdv, 3 * 36 + 4 * 46 + 80);
            assert.equal(n20.breakdown.randomPdv, sum);
        });
    });

    describe('Kekkijutsu rank (referência consolidada)', () => {
        it('marcos canônicos', () => {
            assert.equal(oniKekkijutsuRank(2), null);
            assert.equal(oniKekkijutsuRank(3), 'inicial');
            assert.equal(oniKekkijutsuRank(5), 'C');
            assert.equal(oniKekkijutsuRank(12), 'A');
            assert.equal(oniKekkijutsuRank(18), 'SS');
        });
    });
});

describe('Automação da vida do Oni (ledger runtime)', () => {
    function fakeActor(props = {}) {
        const patches = [];
        return {
            props,
            patches,
            name: 'Oni Teste',
            uuid: 'Actor.test',
            isOwner: true,
            system: { props },
            update(patch) {
                patches.push(patch);
                Object.assign(
                    props,
                    Object.fromEntries(
                        Object.entries(patch).map(([k, v]) => [
                            k.replace(/^system\.props\./, ''),
                            v,
                        ])
                    )
                );
                return Promise.resolve();
            },
        };
    }
    function mockRoll(total) {
        globalThis.Roll = { create: () => ({ evaluate: async () => ({ total }) }) };
    }
    function unmockRoll() {
        delete globalThis.Roll;
    }

    it('N1 não precisa de ledger', async () => {
        const actor = fakeActor({ nvl_num: 1 });
        mockRoll(3);
        try {
            const result = await ensureOniProgression(actor);
            assert.equal(result.needed, false);
            assert.equal(result.complete, true);
            assert.equal(actor.patches.length, 0);
        } finally {
            unmockRoll();
        }
    });

    it('criado direto em N5: rola exatamente os ganhos 2..5 uma única vez', async () => {
        const actor = fakeActor({ nvl_num: 5, pdv_oni_total_conta: 1 });
        mockRoll(4);
        try {
            const first = await ensureOniProgression(actor);
            assert.equal(first.needed, true);
            assert.deepEqual(
                first.rolled.map((entry) => entry.level),
                [2, 3, 4, 5]
            );
            assert.equal(first.total, 16);
            const keys = Object.keys(actor.props).filter((key) => key.startsWith('pdv_oni_ganho'));
            assert.equal(keys.length, 4);
            // Segunda chamada: nada rola de novo
            const second = await ensureOniProgression(actor);
            assert.equal(second.needed, false);
            assert.equal(actor.patches.length, 1); // nenhum patch novo
        } finally {
            unmockRoll();
        }
    });

    it('reduzir para N3 depois de N5 preserva histórico e não rerrola', async () => {
        const props = { nvl_num: 5 };
        for (let level = 2; level <= 5; level += 1) props[`pdv_oni_ganho_nvl${level}`] = 2;
        const actor = fakeActor(props);
        mockRoll(9);
        try {
            const result = await ensureOniProgression(actor, { level: 3 });
            assert.equal(result.needed, false); // 2..3 já existem
            assert.equal(props.pdv_oni_ganho_nvl4, 2); // histórico intacto
            assert.equal(props.pdv_oni_ganho_nvl5, 2);
            assert.equal(actor.patches.length, 0);
        } finally {
            unmockRoll();
        }
    });

    it('updateActor de Oni roteia para a automação sem rodar triggers Slayer', async () => {
        const calls = { update: 0 };
        const props = { pdv_oni_total_conta: 1, nvl_pj: 'nvl_2' };
        const actor = {
            name: 'Oni Roteado',
            uuid: 'Actor.oni',
            isOwner: true,
            system: { template: 'oni_template', props },
            update(patch) {
                calls.update += 1;
                Object.assign(
                    props,
                    Object.fromEntries(
                        Object.entries(patch).map(([k, v]) => [
                            k.replace(/^system\.props\./, ''),
                            v,
                        ])
                    )
                );
            },
        };
        globalThis.game = { user: { id: 'gm1' }, actors: { contents: [] } };
        globalThis.Roll = { create: () => ({ evaluate: async () => ({ total: 3 }) }) };
        globalThis.foundry = { applications: { api: { DialogV2: { wait: async () => null } } } };
        globalThis.ui = { notifications: { warn() {}, error() {}, info() {} } };
        try {
            await handleActorUpdate(actor, { system: { props: { nvl_pj: 'nvl_4' } } }, {}, 'gm1');
            assert.equal(props['pdv_oni_ganho_nvl2'], 3);
            assert.equal(props['pdv_oni_ganho_nvl3'], 3);
            assert.equal(props['pdv_oni_ganho_nvl4'], 3);
            assert.equal(calls.update, 1); // um único patch atômico
            // Nenhum campo Slayer contaminou o Oni
            for (const key of Object.keys(props))
                assert.doesNotMatch(key, /slayer|marca|hab_escolhida/i);
            // Update de outra pessoa não roda nada
            await handleActorUpdate(actor, { system: { props: { nvl_pj: 'nvl_9' } } }, {}, 'outro');
            assert.equal(props['pdv_oni_ganho_nvl9'], undefined);
        } finally {
            delete globalThis.game;
            delete globalThis.Roll;
            delete globalThis.foundry;
            delete globalThis.ui;
        }
    });
});
