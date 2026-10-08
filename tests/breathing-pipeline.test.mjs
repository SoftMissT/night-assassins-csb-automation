import assert from 'node:assert/strict';
import test, { describe } from 'node:test';

import { isMigrated, resolveForm } from '../scripts/breathing-contract.mjs';
import { runCanonicalBreathingForm } from '../scripts/breathing-pipeline.mjs';

function makeActor(props = {}) {
    return {
        id: 'actor_001',
        uuid: 'Actor.actor_001',
        name: 'Slayer Teste',
        system: { props: { pdr_slayer_gasto_valor: 5, ...props } },
    };
}

function fakeRuntime(overrides = {}) {
    const calls = {
        actions: [],
        patches: [],
        hits: [],
        damages: [],
        statuses: [],
        postUsages: [],
    };
    const warns = [];
    const target = { uuid: 'Actor.oni', name: 'Oni' };
    const runtime = {
        calls,
        warns,
        notify: {
            warns,
            warn(message) {
                this.warns.push(message);
            },
        },
        getBreathLevel: () => 4,
        getPdrCurrent: () => 9,
        getProps: (actor) => actor.system.props,
        consumeActions: async (_actor, types) => {
            calls.actions.push(types);
            return { ok: true, patch: { 'system.props.acao_teste': 1 } };
        },
        applyPatch: async (_actor, patch) => calls.patches.push(patch),
        resolveCardTargets: () => [target],
        rollHit: async (options) => {
            calls.hits.push(options);
            return {
                hits: 1,
                attempts: [{ hit: true, critical: false }],
                weapon: { id: 'wpn_1', profileIndex: 0 },
            };
        },
        weaponEntriesFor: async () => [
            { tipoAcao: 'ataque', dado: '2d6', fixo: 0, attrs: [], tiposDano: ['cortante'] },
        ],
        rollDamage: async (options) => calls.damages.push(options),
        applyStatus: async () => {},
        applyStackingStatus: async (_target, key, effect) =>
            calls.statuses.push({ target: _target, key, effect }),
        postUsage: async (options) => calls.postUsages.push(options),
        ...overrides,
    };
    return runtime;
}

const run = (runtime, options = {}) =>
    runCanonicalBreathingForm({
        actor: makeActor(),
        respiracao: 'Pedra',
        formaId: 'pedra_02',
        level: 1,
        runtime,
        ...options,
    });

describe('breathing-pipeline — rota canônica', () => {
    test('CT-009/CT-014: uso canônico consome ação+PDR, rola 3d10, aplica Sangramento e registra chat', async () => {
        const runtime = fakeRuntime();
        const result = await run(runtime);
        assert.deepEqual(result, { ok: true });

        // Ação + custo (3 PDR) no mesmo patch, com o patch da economia de ações.
        assert.deepEqual(runtime.calls.actions, [['ataque']]);
        assert.equal(runtime.calls.patches.length, 1);
        assert.deepEqual(runtime.calls.patches[0], {
            'system.props.acao_teste': 1,
            'system.props.pdr_slayer_gasto_valor': 8,
        });

        // Acerto forçado como a ação da Forma; dano da arma + técnica juntos.
        assert.equal(runtime.calls.hits.length, 1);
        assert.equal(runtime.calls.hits[0].forceActionType, 'ataque');
        assert.equal(runtime.calls.damages.length, 1);
        assert.equal(runtime.calls.damages[0].entradas.length, 2, 'arma + técnica na mesma rolagem');
        assert.equal(runtime.calls.damages[0].entradas[0].dado, '2d6');
        assert.equal(runtime.calls.damages[0].entradas[1].dado, '3d10');
        assert.deepEqual(runtime.calls.damages[0].entradas[1].tiposDano, ['concussao']);
        assert.equal(runtime.calls.damages[0].forceAttackDamage, true);
        assert.equal(runtime.calls.damages[0].skipBreathingInjection, true);

        // Primitiva do nível: Sangramento 4 por 2 turnos com stack no alvo marcado.
        assert.equal(runtime.calls.statuses.length, 1);
        assert.equal(runtime.calls.statuses[0].key, 'sangramento');
        assert.equal(runtime.calls.statuses[0].effect.damageFormula, '4');
        assert.equal(runtime.calls.statuses[0].effect.remainingTurns, 2);

        // Chat de uso.
        assert.equal(runtime.calls.postUsages.length, 1);
        assert.equal(runtime.calls.postUsages[0].level, 1);
        assert.equal(runtime.calls.postUsages[0].custo, 3);
    });

    test('CT-010: recusa por PDR insuficiente sem consumir nada', async () => {
        const runtime = fakeRuntime({ getPdrCurrent: () => 2 });
        const result = await run(runtime);
        assert.equal(result.ok, false);
        assert.match(result.reason, /PDR insuficiente/u);
        assert.match(runtime.warns[0], /PDR insuficiente/u);
        assert.deepEqual(runtime.calls.actions, []);
        assert.deepEqual(runtime.calls.patches, []);
        assert.deepEqual(runtime.calls.hits, []);
        assert.deepEqual(runtime.calls.damages, []);
        assert.deepEqual(runtime.calls.postUsages, []);
    });

    test('CT-010: recusa por Nível de Respiração insuficiente sem consumir nada', async () => {
        const runtime = fakeRuntime({ getBreathLevel: () => 1 });
        const result = await run(runtime, { level: 2 });
        assert.equal(result.ok, false);
        assert.match(result.reason, /Requer Nível de Respiração 2/u);
        assert.deepEqual(runtime.calls.actions, []);
        assert.deepEqual(runtime.calls.patches, []);
    });

    test('recusa nível indisponível e Forma desconhecida antes de qualquer consumo', async () => {
        const runtime = fakeRuntime();
        // pedra_04 N1 é null → recusa pelo contrato (nenhum nível).
        const nivelIndisponivel = await run(runtime, { level: 1, formaId: 'pedra_04' });
        assert.equal(nivelIndisponivel.ok, false);
        const desconhecida = await run(runtime, { formaId: 'pedra_99' });
        assert.equal(desconhecida.ok, false);
        assert.match(runtime.warns.join(' '), /Forma desconhecida/u);
        assert.deepEqual(runtime.calls.patches, []);
    });

    test('ataque errado não rola dano nem primitivas, mas registra o chat', async () => {
        const runtime = fakeRuntime({
            rollHit: async () => ({ hits: 0, attempts: [{ hit: false }] }),
        });
        const result = await run(runtime);
        assert.equal(result.ok, true);
        assert.deepEqual(runtime.calls.damages, []);
        assert.deepEqual(runtime.calls.statuses, []);
        assert.equal(runtime.calls.postUsages.length, 1);
    });

    test('cancelar o Acerto não consome ação, PDR nem feeds', async () => {
        const runtime = fakeRuntime({ rollHit: async () => undefined });
        const result = await run(runtime);
        assert.equal(result.ok, false);
        assert.deepEqual(runtime.calls.patches, []);
        assert.deepEqual(runtime.calls.damages, []);
    });

    test('Fadiga Espiritual soma ao custo e ao patch', async () => {
        const runtime = fakeRuntime({ getPdrSurcharge: () => 2 });
        const result = await run(runtime);
        assert.equal(result.ok, true);
        assert.equal(runtime.calls.patches[0]['system.props.pdr_slayer_gasto_valor'], 10);
        assert.equal(runtime.calls.postUsages[0].custo, 5);
    });

    test('CT-016: pedra_01 não rola acerto, rola o dano direto e registra o texto da exigência', async () => {
        const runtime = fakeRuntime();
        const result = await run(runtime, { formaId: 'pedra_01', level: 1 });
        assert.equal(result.ok, true);
        assert.deepEqual(runtime.calls.hits, [], 'semAcerto pula o diálogo de Acerto');
        assert.equal(runtime.calls.damages.length, 1);
        assert.equal(runtime.calls.damages[0].entradas[0].dado, '1d4');
        assert.deepEqual(runtime.calls.damages[0].entradas[0].tiposDano, ['ferida']);
        assert.equal(runtime.calls.damages[0].skipActionConsumption, true);
        assert.equal(runtime.calls.damages[0].forceAttackDamage, true);
        assert.match(runtime.calls.postUsages[0].dados.texto, /acerto anterior/u);
    });

    test('pedra_04 consome as duas ações e envia duas entradas de dano', async () => {
        const runtime = fakeRuntime();
        runtime.rollHit = async (options) => {
            runtime.calls.hits.push(options);
            return { hits: 1, attempts: [{ hit: true, critical: false }] };
        };
        const result = await run(runtime, { formaId: 'pedra_04', level: 3 });
        assert.equal(result.ok, true);
        assert.deepEqual(runtime.calls.actions, [['ataque', 'especial']]);
        assert.equal(runtime.calls.damages.length, 1);
        assert.equal(runtime.calls.damages[0].entradas.length, 2);
        assert.equal(runtime.calls.damages[0].entradas[0].dado, '6d6');
        assert.equal(runtime.calls.damages[0].entradas[1].tipoAcao, 'ataque');
    });
});

describe('breathing-pipeline — roteamento canônico/legado', () => {
    test('CT-011: só Pedra está migrada; Chamas segue no contrato legado', () => {
        assert.equal(isMigrated('Pedra'), true);
        assert.equal(isMigrated('pedra'), true);
        assert.equal(isMigrated('Chamas'), false);
        assert.equal(isMigrated('Névoa'), false);
        const flame = resolveForm('Chamas', 'chamas_02');
        assert.ok(flame, 'Forma não migrada continua resolvendo pelo contrato');
        assert.equal(flame.niveis[0].custo, 2);
    });
});
