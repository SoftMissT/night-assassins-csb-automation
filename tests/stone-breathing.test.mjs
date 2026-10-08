import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { STONE_FORMS, stoneFormById } from '../scripts/stone-breathing-data.mjs';
import {
    applyStonePassiveAfterDamage,
    clearStoneBreathingState,
    parseStoneBreathingState,
    stoneStatePatch,
    tickStoneBreathing,
} from '../scripts/stone-breathing-service.mjs';

describe('Respiração da Pedra — dado canônico', () => {
    it('publica as cinco Formas no shape canônico', () => {
        assert.equal(STONE_FORMS.length, 5);
        assert.equal(stoneFormById('pedra_01').acao, 'unica');
        assert.equal(stoneFormById('pedra_01').semAcerto, true);
        assert.equal(stoneFormById('pedra_02').acao, 'ataque');
        assert.equal(stoneFormById('pedra_03').acao, 'reacao');
        assert.equal(stoneFormById('pedra_04').acao, 'ataque');
        assert.deepEqual(stoneFormById('pedra_04').acoes, ['ataque', 'especial']);
        assert.equal(stoneFormById('pedra_05').acao, 'especial');
        assert.equal(stoneFormById('pedra_02').nome, 'Tenmen Kudaki / Hyōmen Kurasshu / Kyoseki');
        assert.equal(stoneFormById('pedra_05').ptName, 'Resiliência');
        assert.equal(stoneFormById('nao_existe'), null);
    });

    it('Serpentino escala Ferida/Concussão e registra a exigência em texto', () => {
        const form = stoneFormById('pedra_01');
        assert.deepEqual(
            form.niveis.map((entry) => entry?.dano),
            ['1d4', '1d6', '2d4', '2d4 + @for']
        );
        assert.deepEqual(form.niveis.map((entry) => entry?.custo), [1, 2, 2, 3]);
        assert.deepEqual(form.niveis[3].tiposDano, ['ferida', 'concussao']);
        for (const level of form.niveis)
            assert.match(level.texto, /acerto anterior/u, 'exigência vira texto');
    });

    it('Quebra Superior carrega o Sangramento por nível como primitiva stack', () => {
        const form = stoneFormById('pedra_02');
        assert.deepEqual(
            form.niveis.map((entry) => entry.dano),
            ['3d10', '3d10', '4d10', '5d10']
        );
        assert.deepEqual(
            form.niveis.map((entry) => entry.primitivas[0].formula),
            ['4', '5', '6', '7']
        );
        for (const level of form.niveis) {
            const primitive = level.primitivas[0];
            assert.equal(primitive.tipo, 'aplicaStatus');
            assert.equal(primitive.status, 'sangramento');
            assert.equal(primitive.turnos, 2);
            assert.equal(primitive.tick, 'start');
            assert.equal(primitive.stack, true);
            assert.equal(primitive.sourceName, 'Tenmen Kudaki');
        }
    });

    it('Riólito só existe nos níveis 3 e 4 e declara dois ataques', () => {
        const form = stoneFormById('pedra_04');
        assert.equal(form.niveis[0], null);
        assert.equal(form.niveis[1], null);
        assert.deepEqual(
            form.niveis[2].primitivas,
            [{ tipo: 'ataques', n: 2 }]
        );
        assert.deepEqual(
            form.niveis.slice(2).map((entry) => entry.dano),
            ['6d6', '8d6']
        );
    });

    it('Reflexão e Resiliência ficam como texto (sem automação)', () => {
        for (const id of ['pedra_03', 'pedra_05']) {
            const form = stoneFormById(id);
            for (const level of form.niveis) {
                assert.ok(!level.dano, 'Forma cortada não tem dado de dano');
                assert.match(level.texto, /na mesa|deixou de ser automatizada/u);
            }
        }
    });
});

describe('Respiração da Pedra — passiva', () => {
    it('parse aceita objeto e JSON, sem compartilhar referência', () => {
        const source = { bleeding: { amount: 4, turns: 2 } };
        const parsed = parseStoneBreathingState(source);
        assert.equal(parsed.version, 1);
        parsed.bleeding.amount = 9;
        assert.equal(source.bleeding.amount, 4, 'structuredClone evita mutação por referência');
        assert.equal(parseStoneBreathingState('{"bleeding":{"amount":5}}').bleeding.amount, 5);
        assert.deepEqual(parseStoneBreathingState('{{{'), { version: 1 });
        assert.deepEqual(parseStoneBreathingState(null), { version: 1 });
    });

    it('patch escreve o resumo da passiva e zera resiliência por compatibilidade', () => {
        const idle = stoneStatePatch({});
        assert.equal(idle['system.props.resp_pedra_resumo'], 'Pedra · sem efeito ativo');
        assert.equal(idle['system.props.resp_pedra_resiliencia_turnos'], 0);

        const bleeding = stoneStatePatch({ bleeding: { amount: 6, turns: 2 } });
        assert.match(bleeding['system.props.resp_pedra_resumo'], /Sangramento 6 por 2 turno/u);
        assert.equal(bleeding['system.props.resp_pedra_resiliencia_turnos'], 0);
        assert.equal(
            JSON.parse(bleeding['system.props.resp_pedra_estado']).bleeding.amount,
            6
        );
    });

    it('tick decresce o Sangramento legado e limpa os campos de Forma', () => {
        const legacy = {
            activeForm: { id: 'pedra_02', level: 1 },
            nextHit: { count: 2 },
            pendingDamage: { formula: '3d10' },
            serpentine: { saveDc: 15 },
            bleeding: { amount: 4, turns: 2 },
            reflection: { blockBonus: 1 },
            resilience: { turns: 3 },
            resilienceUsed: true,
        };
        const tick = tickStoneBreathing(legacy);
        assert.equal(tick.state.bleeding.turns, 1);
        for (const key of [
            'activeForm',
            'nextHit',
            'pendingDamage',
            'serpentine',
            'reflection',
            'resilience',
            'resilienceUsed',
        ])
            assert.equal(tick.state[key], undefined, `${key} deve ser limpo`);
        assert.equal(
            legacy.bleeding.turns,
            2,
            'tickStoneBreathing não muta o estado recebido por referência'
        );
        const exhausted = tickStoneBreathing(tick.state);
        assert.equal(exhausted.state.bleeding, undefined);
    });

    it('clear limpa todas as chaves legadas e devolve o resumo neutro', () => {
        const cleared = clearStoneBreathingState(
            JSON.stringify({
                activeForm: { id: 'pedra_04' },
                nextHit: {},
                pendingDamage: {},
                serpentine: {},
                bleeding: { amount: 4, turns: 2 },
                reflection: {},
                resilience: { turns: 3 },
                resilienceUsed: true,
            })
        );
        const state = JSON.parse(cleared['system.props.resp_pedra_estado']);
        assert.deepEqual(Object.keys(state), ['version']);
        assert.equal(cleared['system.props.resp_pedra_resumo'], 'Pedra · sem efeito ativo');
    });

    it('applyStonePassiveAfterDamage registra dano confirmado e concede uma Quebra', async () => {
        const updates = [];
        const actor = {
            id: 'actor_001',
            uuid: 'Actor.actor_001',
            name: 'Slayer',
            system: {
                props: {
                    nome_slayer: 'Slayer',
                    resp_passivas_estado: JSON.stringify({ version: 1, lastWeapon: { id: 'w1' } }),
                },
            },
            items: [{ system: { props: { respiracao_nome: 'Pedra' } } }],
            update: async (patch) => updates.push(patch),
        };
        await applyStonePassiveAfterDamage({
            actor,
            appliedTargets: [{ actor: { uuid: 'Actor.oni' }, name: 'Oni', amount: 12, wound: 3 }],
            damageRequests: [{ negated: false, components: [{ types: ['concussao'] }] }],
            actionId: 'act-1',
            strength: 5,
            hasAttackDamage: true,
        });
        assert.equal(updates.length, 1);
        const state = JSON.parse(updates[0]['system.props.resp_passivas_estado']);
        assert.equal(state.stone.lastConfirmedDamageByTarget['Actor.oni'].damage, 15);
        assert.equal(state.stone.breakByWeapon.w1, 1);
        assert.equal(state.stone.lastBreakActionId, 'act-1');
    });

    it('applyStonePassiveAfterDamage não quebra com Concussão anulada e ignora dano zero', async () => {
        const updates = [];
        const actor = {
            id: 'actor_002',
            uuid: 'Actor.actor_002',
            name: 'Slayer',
            system: {
                props: {
                    nome_slayer: 'Slayer',
                    resp_passivas_estado: JSON.stringify({ version: 1, lastWeapon: { id: 'w1' } }),
                },
            },
            items: [{ system: { props: { respiracao_nome: 'Pedra' } } }],
            update: async (patch) => updates.push(patch),
        };
        await applyStonePassiveAfterDamage({
            actor,
            appliedTargets: [{ actor: { uuid: 'Actor.oni' }, name: 'Oni', amount: 0, wound: 0 }],
            damageRequests: [{ negated: true, components: [{ types: ['concussao'] }] }],
            actionId: 'act-2',
            strength: 5,
            hasAttackDamage: true,
        });
        const state = JSON.parse(updates[0]['system.props.resp_passivas_estado']);
        assert.equal(state.stone?.breakByWeapon, undefined, 'anulado não concede Quebra');
        assert.equal(
            state.stone?.lastConfirmedDamageByTarget,
            undefined,
            'alvo sem dano não registra origem'
        );
    });

    it('applyStonePassiveAfterDamage não escreve sem arma/Pedra ou sem dano de ataque', async () => {
        const makeActor = (props, items) => ({
            id: 'actor_003',
            uuid: 'Actor.actor_003',
            name: 'Slayer',
            system: { props },
            items,
            update: async () => {
                throw new Error('não deveria atualizar');
            },
        });
        const semPedra = makeActor({ nome_slayer: 'Slayer' }, []);
        await applyStonePassiveAfterDamage({
            actor: semPedra,
            appliedTargets: [{ actor: { uuid: 'Actor.oni' }, amount: 10, wound: 0 }],
            damageRequests: [],
            hasAttackDamage: true,
        });
        const semAtaque = makeActor(
            { nome_slayer: 'Slayer' },
            [{ system: { props: { respiracao_nome: 'Pedra' } } }]
        );
        await applyStonePassiveAfterDamage({
            actor: semAtaque,
            appliedTargets: [{ actor: { uuid: 'Actor.oni' }, amount: 10, wound: 0 }],
            damageRequests: [],
            hasAttackDamage: false,
        });
    });
});
