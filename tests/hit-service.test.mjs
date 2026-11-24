import { setupFoundryMocks } from './fixtures/foundry-mock.mjs';
setupFoundryMocks();

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { makeActor } from './fixtures/actor.mjs';

let _dialogReturn = null;
foundry.applications.api.DialogV2.wait = async () =>
    Array.isArray(_dialogReturn) ? _dialogReturn.shift() : _dialogReturn;
ChatMessage.create = async (data) => data;

let _rollResult = {
    total: 12,
    toMessage: async () => {},
    dice: [{ results: [{ result: 1, active: true }] }],
};
let _formula = '';
Roll.create = (formula) => {
    _formula = formula;
    return {
        evaluate: async () => _rollResult,
        dice: [{ results: [{ result: 1, active: true }] }],
    };
};

import { rollHit, attemptBonusFormula } from '../scripts/hit-service.mjs';
import { buildFlameBreathingPlan, flameTurnKey } from '../scripts/flame-breathing-service.mjs';
import { offerMasterBattleCounterattack } from '../scripts/slayer/master-battle-counterattack.mjs';

describe('hit-service', () => {
    it('Fantasia Final conta três erros cumulativos sem limitar a quantidade de golpes', async () => {
        const actor = makeActor({ props: { nome_slayer: 'Sonhos', acerto_label: 'acerto_label_dex' } });
        const previousWait = foundry.applications.api.DialogV2.wait;
        const decisions = ['miss', ...Array(21).fill('hit'), 'miss', 'hit', 'miss'];
        const missesBefore = [];
        const damages = [];
        let charges = 0;
        foundry.applications.api.DialogV2.wait = async dialog => {
            if (dialog.window.title === 'Acerto') return {
                mode: 'normal', rollMode: 'publicroll', bonusRaw: '', cdVal: 0,
                rollCount: 1, actionType: 'completa', weaponId: '',
            };
            missesBefore.push(Number(dialog.content.match(/ERROS (\d+)\/3/u)?.[1]));
            assert.equal(charges, 1);
            const action = decisions.shift();
            const button = dialog.buttons.find(entry => entry.action === action);
            assert.ok(button, 'a sequência encerra pelo terceiro erro');
            return button.callback(null, { form: { elements: {} } });
        };
        try {
            const result = await rollHit({ actor, isTechnique: true, autoDamage: false,
                skipActionConsumption: true, formId: 'sonhos_10',
                attackSequence: {
                    missLimit: 3,
                    beforeFirstRoll: async () => ++charges === 1,
                    onHit: async ({ executionId }) => damages.push(executionId),
                },
            });
            assert.equal(result.hits, 22);
            assert.equal(result.misses, 3);
            assert.equal(result.attempts.length, 25);
            assert.equal(damages.length, 22);
            assert.equal(new Set(damages).size, 22);
            assert.deepEqual(missesBefore, [0, ...Array(22).fill(1), 2, 2]);
            assert.deepEqual(decisions, []);
        } finally {
            foundry.applications.api.DialogV2.wait = previousWait;
        }
    });

    for (const scenario of [
        { label: 'Especial', choice: 'especial', initial: { round: { unica: 1 } }, offered: ['especial'], spent: ['ataque', 'especial'] },
        { label: 'Única', choice: 'unica', initial: {}, offered: ['especial', 'unica'], spent: ['ataque', 'unica'] },
        { label: 'cancelamento', choice: null, initial: {}, offered: ['especial', 'unica'], spent: ['ataque'] },
        { label: 'ações indisponíveis', initial: { turn: { especial: 1 }, round: { unica: 1 } }, spent: ['ataque'] },
        { label: 'turno encerrado', choice: 'especial', initial: {}, offered: ['especial', 'unica'], changedTurn: true, spent: ['ataque'] },
        { label: 'técnica já paga', initial: {}, skip: true, spent: [] },
    ]) {
        it(`Nitoryu Vanilla cobra apenas ações executadas · ${scenario.label}`, async () => {
            const actor = makeActor({ props: {
                nome_slayer: 'Teste Nitoryu', acoes_slayer_dados: JSON.stringify(scenario.initial),
            } });
            const item = { id: 'katana', name: 'Katana', system: { props: {
                arma_nome: 'Katana', arma_modo_uso: 'nitoryu', arma_propriedades: 'Acuidade / Nitoryu',
                arma_critico: 20, arma_perfis_ataque: [{ nome: 'Nitoryu', modo: 'nitoryu', ataques: 2,
                    penalidade_segundo_acerto: -2, dano_fixo: 5, tipos_dano: ['cortante'] }],
            } } };
            actor.items = Object.assign([item], { get: id => id === item.id ? item : null });
            const spent = [];
            actor.update = async patch => {
                const raw = patch['system.props.acoes_slayer_dados'];
                if (!raw) return;
                const previous = JSON.parse(actor.system.props.acoes_slayer_dados);
                const next = JSON.parse(raw);
                for (const scope of ['turn', 'round'])
                    for (const [key, value] of Object.entries(next[scope]))
                        if (value > (previous[scope]?.[key] ?? 0)) spent.push(key);
                actor.system.props.acoes_slayer_dados = raw;
            };
            const previous = { game, wait: foundry.applications.api.DialogV2.wait, create: Roll.create };
            const formulas = [];
            const actionType = scenario.skip ? 'especial' : '';
            const combatant = { id: 'start', actor };
            globalThis.game = { ...game, combat: { id: 'test', round: 1, turn: 0, started: true, combatant },
                settings: { get: (_module, key) => key === 'rulesSelection'
                    ? JSON.stringify({ propriedades: { nitoryu: 'vanilla' } }) : undefined } };
            let offered;
            foundry.applications.api.DialogV2.wait = async dialog => {
                if (dialog.window.title === 'Acerto') return { mode: 'normal', rollMode: 'publicroll', bonusRaw: '',
                    cdVal: 0, rollCount: 1, actionType, weaponId: item.id, weaponProfileIndex: 0 };
                if (dialog.window.title === 'Segundo golpe · Nitoryu') {
                    offered = dialog.buttons.filter(button => button.action !== 'cancel').map(button => button.action);
                    if (scenario.changedTurn) game.combat.turn = 1;
                    return scenario.choice;
                }
                return { hit: !scenario.skip, continue: true };
            };
            Roll.create = formula => {
                formulas.push(formula);
                return { evaluate: async () => ({ total: 12, toMessage: async () => {},
                    dice: [{ results: [{ result: 10, active: true }] }] }) };
            };
            try {
                const result = await rollHit({ actor, autoDamage: false, skipActionConsumption: scenario.skip,
                    isTechnique: scenario.skip });
                assert.deepEqual(spent, scenario.spent);
                assert.deepEqual(offered, scenario.offered);
                assert.equal(result.attempts.length, scenario.spent.length === 2 ? 2 : 1);
                if (scenario.spent.length === 2) {
                    assert.equal(result.attempts[1].actionType, scenario.choice);
                    assert.equal(formulas[1], '1d20');
                }
            } finally {
                globalThis.game = previous.game;
                foundry.applications.api.DialogV2.wait = previous.wait;
                Roll.create = previous.create;
            }
        });
    }

    it('Pressão de Combate entra só no segundo ataque proficiente contra o mesmo alvo', async () => {
        const previousGame = game;
        const previousCreate = Roll.create;
        const flags = {};
        const actor = makeActor({ uuid: 'Actor.mestre', props: {
            nome_slayer: 'Mestre', classe_escolhida: 'classe_mb', nvl_num: 6,
            acerto_label: 'acerto_label_dex', dex_display: 4,
        } });
        actor.items = [{
            id: 'w1', name: 'Nichirin', system: { props: { arma_nome: 'Nichirin', arma_critico: 20,
                arma_perfis_ataque: [{ nome: 'Corte', dano_dados: '1d6', tipos_dano: ['cortante'] }] } },
        }];
        actor.getFlag = (_module, key) => flags[key];
        actor.setFlag = async (_module, key, value) => { flags[key] = value; };
        const target = makeActor({ uuid: 'Actor.alvo' });
        const formulas = [];
        globalThis.game = { ...game, combat: { id: 'c', round: 1, turn: 0, started: true,
            combatant: { actor, id: 'mestre' }, combatants: [] }, user: { ...game.user } };
        Roll.create = formula => { formulas.push(formula); return previousCreate(formula); };
        try {
            _dialogReturn = [
                { mode: 'normal', rollMode: 'publicroll', bonusRaw: '', cdVal: 0, rollCount: 3,
                    actionType: 'ataque', weaponId: 'w1', weaponProfileIndex: 0 },
                { hit: true, continue: true }, { hit: true, continue: true }, { hit: true, continue: false },
            ];
            const result = await rollHit({ actor, targets: new Set([{ actor: target }]), autoDamage: false });
            assert.equal(result.hits, 3);
            assert.equal(formulas.length, 3);
            assert.equal(formulas[1], formulas[0] + ' + 1');
            assert.equal(formulas[2], formulas[0]);
            assert.equal(flags.masterBattlePressure.targetUuid, null);
        } finally {
            globalThis.game = previousGame;
            Roll.create = previousCreate;
            _dialogReturn = null;
        }
    });

    it('Contra-ataque Homebrew exige 17 natural e usa uma Reação mesmo quando erra', async () => {
        const previousGame = game;
        const previousGrid = canvas.grid;
        const previousRoll = _rollResult;
        const actor = makeActor({ uuid: 'Actor.mestre', props: {
            nome_slayer: 'Mestre', classe_escolhida: 'classe_mb', nvl_num: 12,
            acerto_label: 'acerto_label_dex', dex_display: 4,
        } });
        actor.items = [{ id: 'w1', name: 'Nichirin', system: { props: {
            arma_nome: 'Nichirin', arma_critico: 20, arma_alcance: '1,5m',
            arma_perfis_ataque: [{ nome: 'Corte', dano_dados: '1d6', tipos_dano: ['cortante'] }],
        } } }];
        const flags = {};
        const patches = [];
        actor.getFlag = (_module, key) => flags[key];
        actor.update = async patch => {
            patches.push(patch);
            if (patch['flags.night-assassins-csb-automation.masterBattleCounterattackRound'])
                flags.masterBattleCounterattackRound = patch['flags.night-assassins-csb-automation.masterBattleCounterattackRound'];
        };
        const attacker = makeActor({ uuid: 'Actor.atacante' });
        actor.getActiveTokens = () => [{ center: { x: 0, y: 0 } }];
        attacker.getActiveTokens = () => [{ center: { x: 1, y: 0 } }];
        globalThis.game = { ...game, combat: { id: 'c', round: 1, turn: 0, started: true,
            combatant: { actor: attacker, id: 'atacante' }, combatants: [] }, user: { ...game.user } };
        canvas.grid = { measurePath: () => ({ distance: 1.5 }) };
        _rollResult = { ..._rollResult, total: 25, dice: [{ results: [{ result: 16, active: true }] }] };
        const trigger = { enemyMissed: true, melee: true };
        try {
            _dialogReturn = [null];
            assert.equal(await offerMasterBattleCounterattack(actor, attacker, trigger), null);
            assert.equal(patches.length, 0);
            _dialogReturn = ['w1', {
                mode: 'normal', rollMode: 'publicroll', bonusRaw: '', cdVal: 0, rollCount: 4,
                actionType: 'reacao', weaponId: 'w1', weaponProfileIndex: 0,
            }];
            const result = await offerMasterBattleCounterattack(actor, attacker, trigger);
            assert.equal(result.attempts.length, 1);
            assert.equal(result.hits, 0);
            assert.equal(JSON.parse(patches.at(-1)['system.props.acoes_slayer_dados']).round.reacao, 1);
            assert.equal(await offerMasterBattleCounterattack(actor, attacker, trigger), null);
        } finally {
            globalThis.game = previousGame;
            canvas.grid = previousGrid;
            _rollResult = previousRoll;
            _dialogReturn = null;
        }
    });

    it('o primeiro Ataque Padrão consome Universo mesmo se errar e o segundo golpe acertar', async () => {
        const previousGame = game;
        const previousChat = ChatMessage.create;
        const combat = { id: 'c', started: true, round: 1, turn: 2, combatants: [] };
        globalThis.game = { ...game, combat, user: { ...game.user, targets: new Set() } };
        try {
            for (const firstHit of [false, true]) {
                const targetActor = makeActor({ id: 'alvo', uuid: 'Actor.alvo', props: {
                    nome_slayer: 'Alvo',
                    pdv_slayer_total_conta: 100,
                    atr_vit_valor_config: 3,
                } });
                delete targetActor.system.props.vit_display;
                const targetFlags = {};
                targetActor.getFlag = (_module, key) => targetFlags[key];
                targetActor.setFlag = async (_module, key, value) => { targetFlags[key] = value; };
                targetActor.update = async (patch) => {
                    for (const [key, value] of Object.entries(patch))
                        targetActor.system.props[key.replace('system.props.', '')] = value;
                };
                const target = { actor: targetActor };
                game.user.targets = new Set([target]);
                const item = {
                    id: 'w1',
                    name: 'Nichirin',
                    system: { props: {
                        arma_nome: 'Nichirin',
                        arma_critico: 20,
                        arma_perfis_ataque: [{ nome: 'Corte', dano_dados: '1d6', tipos_dano: ['cortante'] }],
                    } },
                };
                const state = buildFlameBreathingPlan('chamas_07', 1, {}, {
                    synchronizedWeapon: item,
                    turnKey: flameTurnKey(combat),
                }).state;
                const actor = makeActor({ props: {
                    nome_slayer: 'Slayer',
                    nvl_num: 7,
                    acerto_label: 'acerto_label_for',
                    atr_for_valor_config: 2,
                    for_marca_temp: 2,
                    resp_chamas_estado: JSON.stringify(state),
                } });
                delete actor.system.props.for_display;
                actor.items = { [Symbol.iterator]: [item][Symbol.iterator].bind([item]), get: () => item };
                actor.update = async (patch) => {
                    for (const [key, value] of Object.entries(patch))
                        actor.system.props[key.replace('system.props.', '')] = value;
                };
                const damageFlavors = [];
                const saveFormulas = [];
                const previousCreate = Roll.create;
                Roll.create = (formula) => {
                    if (formula === '1d20 + (3)') saveFormulas.push(formula);
                    return previousCreate(formula);
                };
                ChatMessage.create = async (data) => {
                    if (data.flavor?.includes('Nichirin')) damageFlavors.push(data.flavor);
                    return data;
                };
                const damage = {
                    nome: 'Nichirin', pdrGasto: 0,
                    entradas: [{ dado: '1d6', fixo: 4, selAttrs: [], selTiposDano: ['cortante'], tipoAcao: 'ataque' }],
                };
                _dialogReturn = [
                    { mode: 'normal', rollMode: 'publicroll', bonusRaw: '', cdVal: 0, rollCount: 2,
                        actionType: 'ataque', weaponId: 'w1', weaponProfileIndex: 0 },
                    { hit: firstHit, continue: true },
                    { hit: true, continue: false },
                    damage,
                    ...(firstHit ? [damage] : []),
                ];
                const result = await rollHit({ actor }).finally(() => { Roll.create = previousCreate; });
                assert.equal(result.attempts.length, 2);
                assert.equal(saveFormulas.length, firstHit ? 1 : 0);
                assert.deepEqual(result.attempts[0].flamingUniverse, firstHit
                    ? { formula: '2d10', enemyHeat: 2, knockdownDc: 15, target } : undefined);
                assert.equal(result.attempts[1].flamingUniverse, undefined);
                assert.equal(JSON.parse(actor.system.props.resp_chamas_estado).flamingUniverse, undefined);
                assert.equal(JSON.parse(actor.system.props.acoes_slayer_dados).turn.ataque, 1);
                assert.equal(damageFlavors.filter((flavor) => flavor.includes('Universo Flamejante')).length,
                    firstHit ? 1 : 0);
                assert.equal(targetFlags.flameHeat[actor.id].heat, firstHit ? 4 : 1);
                assert.equal(
                    JSON.parse(targetActor.system.props.status_slayer_dados ?? '{}').active?.includes('derrubado') === true,
                    firstHit,
                );
            }
        } finally {
            globalThis.game = previousGame;
            ChatMessage.create = previousChat;
            _dialogReturn = null;
        }
    });
    it('repete o bônus situacional em cada acerto da sequência', () => {
        assert.equal(attemptBonusFormula({ situational: '+3', secondary: '+1', chain: '+2' }), '+3 +1 +2');
        assert.equal(attemptBonusFormula({ situational: '+3' }), '+3');
    });
    it('avisa quando acerto_label é inválido', async () => {
        let warned = false;
        ui.notifications.warn = (msg) => {
            if (msg.includes('DEX ou FOR')) warned = true;
        };
        const actor = makeActor({ props: { acerto_label: 'invalido' } });
        await rollHit({ actor });
        assert.strictEqual(warned, true);
    });

    it('Cancelar a configuração não cria nenhuma rolagem', async () => {
        _dialogReturn = { cancelled: true };
        let rolls = 0;
        const previousCreate = Roll.create;
        Roll.create = () => {
            rolls += 1;
            return { evaluate: async () => _rollResult };
        };
        const actor = makeActor({ props: { acerto_label: 'acerto_label_dex', dex_display: '4' } });
        try {
            await rollHit({ actor });
            assert.equal(rolls, 0);
        } finally {
            Roll.create = previousCreate;
        }
    });

    it('rola para DEX', async () => {
        _dialogReturn = { mode: 'normal', rollMode: 'publicroll', bonusRaw: '', cdVal: 0 };
        let called = false;
        _rollResult = {
            total: 14,
            toMessage: async () => {
                called = true;
            },
            dice: [{ results: [{ result: 1, active: true }] }],
        };
        const actor = makeActor({
            props: {
                acerto_label: 'acerto_label_dex',
                dex_display: '<span>5</span>',
                atr_dex_valor: '<span>99</span>',
            },
        });
        await rollHit({ actor });
        assert.strictEqual(called, true);
        assert.match(_formula, /\+ 5$/);
    });

    it('rola para FOR', async () => {
        _dialogReturn = { mode: 'normal', rollMode: 'publicroll', bonusRaw: '', cdVal: 0 };
        let called = false;
        _rollResult = {
            total: 14,
            toMessage: async () => {
                called = true;
            },
            dice: [{ results: [{ result: 1, active: true }] }],
        };
        const actor = makeActor({
            props: {
                acerto_label: 'acerto_label_for',
                for_display: '<span>6</span>',
                atr_for_valor: '<span>99</span>',
            },
        });
        await rollHit({ actor });
        assert.strictEqual(called, true);
        assert.match(_formula, /\+ 6$/);
    });

    it('usa FOR base e Marca no Acerto de um NPC sem for_display', async () => {
        _dialogReturn = { mode: 'normal', rollMode: 'publicroll', bonusRaw: '', cdVal: 0 };
        const actor = makeActor({ props: {
            npc_nome: 'NPC',
            acerto_label: 'acerto_label_for',
            npc_for_base: 5,
            for_marca_temp: 2,
        } });
        delete actor.system.props.for_display;
        await rollHit({ actor, autoDamage: false });
        assert.match(_formula, /^1d20 \+ 7$/);
    });

    it('envia a visibilidade escolhida como options.messageMode do v14', async () => {
        _dialogReturn = [
            { mode: 'normal', rollMode: 'gmroll', bonusRaw: '', cdVal: 0, rollCount: 1 },
            { hit: false, continue: false },
        ];
        let messageData;
        let messageOptions;
        _rollResult = {
            total: 12,
            toMessage: async (data, options) => {
                messageData = data;
                messageOptions = options;
                return { id: 'mode-hit' };
            },
            dice: [{ results: [{ result: 8, active: true }] }],
        };
        const actor = makeActor({ props: { acerto_label: 'acerto_label_dex', dex_display: '4' } });

        await rollHit({ actor, autoDamage: false });

        assert.equal(messageOptions?.messageMode, 'gm');
        assert.equal('rollMode' in messageData, false);
    });

    it('consome e persiste a Ação de Ataque na ficha Slayer', async () => {
        _dialogReturn = [
            {
                mode: 'normal',
                rollMode: 'publicroll',
                bonusRaw: '',
                cdVal: 0,
                rollCount: 1,
                actionType: 'ataque',
            },
            { hit: true, continue: false },
        ];
        _rollResult = {
            total: 12,
            toMessage: async () => ({ id: 'slayer-hit' }),
            dice: [{ results: [{ result: 8, active: true }] }],
        };
        const actor = makeActor({ props: { nome_slayer: 'Slayer' } });
        let actionPatch = null;
        actor.update = async (patch) => {
            if (patch['system.props.acoes_slayer_dados']) actionPatch = patch;
        };

        await rollHit({ actor, autoDamage: false });

        assert.equal(JSON.parse(actionPatch['system.props.acoes_slayer_dados']).turn.ataque, 1);
    });

    it('consome e persiste a Ação de Ataque na ficha Oni', async () => {
        _dialogReturn = [
            {
                mode: 'normal',
                rollMode: 'publicroll',
                bonusRaw: '',
                cdVal: 0,
                rollCount: 1,
                actionType: 'ataque',
            },
            { hit: true, continue: false },
        ];
        _rollResult = {
            total: 12,
            toMessage: async () => ({ id: 'oni-hit' }),
            dice: [{ results: [{ result: 8, active: true }] }],
        };
        const actor = makeActor({ props: { nome_oni: 'Oni' } });
        let actionPatch = null;
        actor.update = async (patch) => {
            if (patch['system.props.acoes_oni_dados']) actionPatch = patch;
        };

        await rollHit({ actor, autoDamage: false });

        assert.equal(JSON.parse(actionPatch['system.props.acoes_oni_dados']).turn.ataque, 1);
    });

    it('aguarda o Dice So Nice terminar antes de publicar o resumo do Acerto', async () => {
        const order = [];
        game.dice3d = {
            waitFor3DAnimationByMessageID: async (messageId) => order.push(`dice:${messageId}`),
        };
        ChatMessage.create = async () => {
            order.push('summary');
            return {};
        };
        _dialogReturn = [
            { mode: 'normal', rollMode: 'publicroll', bonusRaw: '', cdVal: 0, rollCount: 1 },
            { hit: true, continue: false },
        ];
        _rollResult = {
            total: 12,
            toMessage: async () => ({ id: 'hit-message' }),
            dice: [{ results: [{ result: 8, active: true }] }],
        };

        await rollHit({ actor: makeActor(), autoDamage: false });

        assert.deepEqual(order, ['dice:hit-message', 'summary']);
        delete game.dice3d;
    });

    it('soma Habilidade Especial e Metal no Acerto', async () => {
        _dialogReturn = { mode: 'normal', rollMode: 'publicroll', bonusRaw: '', cdVal: 0 };
        _rollResult = {
            total: 14,
            toMessage: async () => {},
            dice: [{ results: [{ result: 1, active: true }] }],
        };
        const actor = makeActor({
            props: {
                acerto_label: 'acerto_label_for',
                for_display: '6',
                hab_acerto_bonus: 1,
                metal_acerto_bonus: 4,
            },
        });
        await rollHit({ actor, autoDamage: false });
        assert.match(_formula, /^1d20 \+ 6 \+ 5$/);
    });

    it('aplica Cegueira e Exaustão no Acerto', async () => {
        _dialogReturn = { mode: 'normal', rollMode: 'publicroll', bonusRaw: '', cdVal: 0 };
        const actor = makeActor({
            props: {
                acerto_label: 'acerto_label_dex',
                dex_display: '5',
                status_slayer_dados: JSON.stringify({
                    active: ['cegueira_parcial'],
                    exhaustion: 4,
                }),
                status_slayer_exaustao: 4,
            },
        });
        await rollHit({ actor });
        assert.match(_formula, /^2d20kl1 \+ 5 - 5$/);
    });

    it('rola um Acerto por vez e confirma antes do próximo', async () => {
        _dialogReturn = [
            { mode: 'normal', rollMode: 'publicroll', bonusRaw: '', cdVal: 0, rollCount: 3 },
            { hit: true, continue: true },
            { hit: false, continue: true },
            { hit: true, continue: false },
        ];
        let messages = 0;
        _rollResult = {
            total: 14,
            toMessage: async ({ flavor }) => {
                messages += 1;
                assert.match(flavor, new RegExp(`Acerto ${messages}/3`));
            },
        };
        const actor = makeActor({
            props: {
                nome_slayer: 'Slayer',
                pdv_slayer_total_valor: 20,
                acerto_label: 'acerto_label_dex',
                dex_display: '5',
                acoes_slayer_dados: JSON.stringify({
                    version: 1,
                    turn: { movimento: 0, ataque: 1, especial: 0 },
                    round: { unica: 0, reacao: 0 },
                }),
            },
        });
        let actorUpdates = 0;
        actor.update = async () => {
            actorUpdates += 1;
        };
        await rollHit({ actor });
        assert.equal(messages, 3);
        assert.equal(actorUpdates, 0);
    });

    it('Usuário de Veneno rank A ganha exatamente um ataque adicional na Ação de Ataque', async () => {
        _dialogReturn = [
            {
                mode: 'normal',
                rollMode: 'publicroll',
                bonusRaw: '',
                cdVal: 0,
                rollCount: 1,
                actionType: 'ataque',
            },
            { hit: true, continue: true },
            { hit: true, continue: false },
        ];
        let rolls = 0;
        _rollResult = {
            total: 14,
            toMessage: async () => {
                rolls += 1;
                return { id: `poison-extra-${rolls}` };
            },
        };
        const actor = makeActor({
            props: {
                nome_slayer: 'Veneficista',
                acerto_label: 'acerto_label_dex',
                dex_display: '5',
                classe_escolhida: 'classe_usuario_de_veneno',
                nvl_pj: 'nvl_8',
            },
        });
        actor.getFlag = () => null;
        await rollHit({ actor, autoDamage: false });
        assert.equal(rolls, 2);
    });

    it('Manopla dentro de Forma de sequência: crítico dá +1 de Acerto no golpe seguinte e os erros continuam contando', async () => {
        const item = {
            id: 'manoplas',
            uuid: 'Item.manoplas',
            name: 'Manoplas / Soqueiras',
            system: {
                template: 'NAWeaponTpl00001',
                props: {
                    arma_nome: 'Manoplas / Soqueiras',
                    arma_modo_uso: 'ryoto',
                    arma_propriedades: 'Acuidade / Ryoto / Nitoryu',
                    arma_perfis_ataque: [{
                        nome: 'Ryōtō', modo: 'ryoto', critico: 20, dano_fixo: 3,
                        atributos: [{ key: 'DEX', multiplicador: 0.5, escolha: true }, { key: 'FOR', multiplicador: 0.5, escolha: true }],
                        tipos_dano: ['concussao'], ataques: 2, dano_segundo_golpe: 'normal', acerto_segundo_sem_atributo: true,
                        cadeia_critica: { ativa: true, bonus_acerto: 1, dano_fixo: 1, atributo_inteiro: ['DEX', 'FOR'] },
                    }],
                },
            },
            update: async () => {},
        };
        const actor = makeActor({ props: { nome_slayer: 'Sonhos', acerto_label: 'acerto_label_dex', dex_display: '10', for_display: '6', folego_slayer_atual: 0 } });
        actor.items = { [Symbol.iterator]: [item][Symbol.iterator].bind([item]), get: (id) => (id === item.id ? item : null) };
        actor.update = async () => {};
        const previousWait = foundry.applications.api.DialogV2.wait;
        const previousCreate = Roll.create;
        const formulas = [];
        const decisions = ['hit', 'hit', 'miss', 'miss', 'miss'];
        let charges = 0;
        Roll.create = (formula) => {
            formulas.push(formula);
            return previousCreate(formula);
        };
        foundry.applications.api.DialogV2.wait = async dialog => {
            if (dialog.window.title === 'Acerto') return {
                mode: 'normal', rollMode: 'publicroll', bonusRaw: '', cdVal: 0,
                rollCount: 1, actionType: 'completa', weaponId: item.id,
            };
            const next = decisions.shift();
            const button = dialog.buttons.find(entry => entry.action === next);
            return button.callback(null, { form: { elements: {} } });
        };
        try {
            _rollResult = { ..._rollResult, total: 25, dice: [{ results: [{ result: 20, active: true }] }] };
            const result = await rollHit({ actor, isTechnique: true, autoDamage: false,
                skipActionConsumption: true, formId: 'sonhos_10',
                attackSequence: {
                    missLimit: 3,
                    beforeFirstRoll: async () => ++charges === 1,
                    onHit: async () => {},
                },
            });
            assert.equal(result.misses, 3);
            assert.equal(result.attempts.length, 5);
            // Exato, não por substring: "+ 10" contém "+ 1".
            assert.deepEqual(formulas.slice(0, 3), ['1d20 + 10', '1d20 + 10 + 1', '1d20 + 10 + 2']);
        } finally {
            Roll.create = previousCreate;
            foundry.applications.api.DialogV2.wait = previousWait;
        }
    });

    it('permite encerrar a sequência antes do limite', async () => {
        _dialogReturn = [
            { mode: 'normal', rollMode: 'publicroll', bonusRaw: '', cdVal: 0, rollCount: 5 },
            { hit: true, continue: true },
            { hit: false, continue: false },
        ];
        let messages = 0;
        _rollResult = {
            total: 11,
            toMessage: async () => {
                messages += 1;
            },
        };
        const actor = makeActor({ props: { acerto_label: 'acerto_label_for', for_display: '4' } });
        await rollHit({ actor });
        assert.equal(messages, 2);
    });

    it('Cancelar confirmação encerra sem rolar outro dado', async () => {
        _dialogReturn = [
            {
                mode: 'normal',
                rollMode: 'publicroll',
                bonusRaw: '',
                cdVal: 0,
                rollCount: 4,
                actionType: 'ataque',
            },
            { stop: true },
        ];
        let rolls = 0;
        _rollResult = {
            total: 12,
            toMessage: async () => {
                rolls += 1;
            },
        };
        const actor = makeActor({ props: { acerto_label: 'acerto_label_dex', dex_display: '4' } });
        await rollHit({ actor });
        assert.equal(rolls, 1);
    });

    it('crítico positivo confirmado recupera 1 Fôlego', async () => {
        _dialogReturn = [
            {
                mode: 'normal',
                rollMode: 'publicroll',
                bonusRaw: '',
                cdVal: 0,
                rollCount: 1,
                actionType: 'ataque',
            },
            { hit: true, continue: false },
        ];
        _rollResult = {
            total: 24,
            toMessage: async () => ({ id: 'crit' }),
            dice: [{ results: [{ result: 20, active: true }] }],
        };
        const actor = makeActor({
            props: {
                nome_slayer: 'Slayer',
                pdv_slayer_total_valor: 20,
                acerto_label: 'acerto_label_dex',
                dex_display: '4',
                fdv_display: '4',
                folego_slayer_atual: 2,
            },
        });
        actor.update = async (patch) => {
            if (Object.hasOwn(patch, 'system.props.folego_slayer_atual'))
                actor.system.props.folego_slayer_atual =
                    patch['system.props.folego_slayer_atual'];
        };
        await rollHit({ actor });
        assert.equal(actor.system.props.folego_slayer_atual, 3);
    });

    it('aplica o piso global de crítico da Iwa no Kokyū à arma selecionada', async () => {
        const previousSettings = game.settings;
        game.settings = {
            get: (namespace, key) =>
                namespace === 'night-assassins-csb-automation' && key === 'stoneCriticalFloor'
                    ? 15
                    : undefined,
        };
        const item = {
            id: 'w1',
            uuid: 'Item.w1',
            name: 'Nichirin',
            system: {
                props: {
                    arma_nome: 'Nichirin',
                    arma_critico: 19,
                    arma_perfis_ataque: [
                        {
                            nome: 'Ataque Base',
                            critico: 19,
                            dano_fixo: 4,
                            dano_dados: '1d6',
                            atributos: [],
                            tipos_dano: ['cortante'],
                        },
                    ],
                },
            },
        };
        const actor = makeActor({
            props: {
                acerto_label: 'acerto_label_for',
                for_display: '8',
                resp_passivas_estado: JSON.stringify({
                    version: 1,
                    stone: { breakStacks: 8 },
                }),
            },
        });
        actor.items = {
            [Symbol.iterator]: [item][Symbol.iterator].bind([item]),
            get: (id) => (id === 'w1' ? item : null),
        };
        actor.update = async () => {};
        _dialogReturn = [
            {
                mode: 'normal',
                rollMode: 'publicroll',
                bonusRaw: '',
                cdVal: 0,
                rollCount: 1,
                actionType: 'ataque',
                weaponId: 'w1',
                weaponProfileIndex: 0,
            },
            { hit: true, continue: false },
        ];
        _rollResult = {
            total: 22,
            toMessage: async () => ({ id: 'stone-floor' }),
            dice: [{ results: [{ result: 14, active: true }] }],
        };

        try {
            const result = await rollHit({ actor, autoDamage: false });
            assert.equal(result.weapon.effectiveCritical, 15);
            assert.equal(result.attempts[0].criticalThreshold, 15);
            assert.equal(result.attempts[0].critical, false);
        } finally {
            game.settings = previousSettings;
        }
    });

    for (const [variant, baseAttacks] of [['homebrew', 2], ['vanilla', 1]]) {
        it(`Manoplas em ${variant} mantêm a sequência crítica e +1 no Acerto`, async () => {
            const item = {
                id: 'manoplas',
                uuid: 'Item.manoplas',
                name: 'Manoplas / Soqueiras',
                system: {
                    template: 'NAWeaponTpl00001',
                    props: {
                        arma_nome: 'Manoplas / Soqueiras',
                        arma_modo_uso: 'ryoto',
                        arma_propriedades: 'Acuidade / Ryoto / Nitoryu',
                        arma_perfis_ataque: [
                            {
                                nome: 'Ryōtō',
                                modo: 'ryoto',
                                critico: 20,
                                dano_fixo: 3,
                                atributos: [
                                    { key: 'DEX', multiplicador: 0.5, escolha: true },
                                    { key: 'FOR', multiplicador: 0.5, escolha: true },
                                ],
                                tipos_dano: ['concussao'],
                                ataques: 2,
                                dano_segundo_golpe: 'normal',
                                acerto_segundo_sem_atributo: true,
                                cadeia_critica: {
                                    ativa: true,
                                    bonus_acerto: 1,
                                    dano_fixo: 1,
                                    atributo_inteiro: ['DEX', 'FOR'],
                                },
                            },
                        ],
                    },
                },
                update: async () => {},
            };
            const actor = makeActor({
                props: {
                    acerto_label: 'acerto_label_dex',
                    dex_display: '10',
                    for_display: '6',
                    folego_slayer_atual: 0,
                },
            });
            actor.items = {
                [Symbol.iterator]: [item][Symbol.iterator].bind([item]),
                get: (id) => (id === item.id ? item : null),
            };
            actor.update = async () => {};
            _dialogReturn = [
                {
                    mode: 'normal',
                    rollMode: 'publicroll',
                    bonusRaw: '',
                    cdVal: 0,
                    rollCount: 1,
                    actionType: 'ataque',
                    weaponId: item.id,
                    weaponProfileIndex: 0,
                    weaponAttribute: 'DEX',
                },
                { hit: true, continue: true },
                ...(baseAttacks === 2 ? [{ hit: true, continue: true }] : []),
                { hit: true, continue: false },
            ];
            const naturals = [20, ...Array(baseAttacks).fill(10)];
            const formulas = [];
            const previousCreate = Roll.create;
            const previousSettings = game.settings;
            game.settings = { ...previousSettings, get: (moduleId, key) =>
                key === 'rulesSelection' ? JSON.stringify({ propriedades: { ryoto: variant } })
                    : previousSettings?.get?.(moduleId, key) };
            Roll.create = (formula) => ({
                evaluate: async () => {
                    const natural = naturals.shift();
                    formulas.push(formula);
                    return {
                        total: natural + 10,
                        dice: [{ results: [{ result: natural, active: true }] }],
                        toMessage: async () => ({ id: `roll-${formulas.length}` }),
                    };
                },
            });
            try {
                const result = await rollHit({ actor, autoDamage: false });
                assert.equal(result.maximum, baseAttacks + 1);
                assert.equal(result.attempts.length, baseAttacks + 1);
                assert.match(formulas[1], /\+ 1$/);
                if (baseAttacks === 2) assert.match(formulas[2], /\+ 1$/);
            } finally {
                Roll.create = previousCreate;
                game.settings = previousSettings;
            }
        });
    }

    it('Inverno Sombrio (Neve, Área): Congelar crítico é aplicado a TODOS os inimigos marcados, não só ao primeiro', async () => {
        _dialogReturn = [
            {
                mode: 'normal',
                rollMode: 'publicroll',
                bonusRaw: '',
                cdVal: 0,
                rollCount: 1,
                actionType: 'especial',
            },
            { hit: true, continue: false },
        ];
        _rollResult = {
            total: 24,
            toMessage: async () => ({ id: 'crit' }),
            dice: [{ results: [{ result: 20, active: true }] }],
        };
        const snowState = {
            version: 1,
            freezeByTarget: {},
            cooldowns: {},
            nextHit: { source: 'neve_02', opposedBy: 'esquiva', criticalFreeze: 1 },
        };
        const actor = makeActor({
            props: {
                acerto_label: 'acerto_label_dex',
                dex_display: '4',
                resp_neve_estado: JSON.stringify(snowState),
            },
        });
        let lastPatch = {};
        actor.update = async (patch) => {
            lastPatch = { ...lastPatch, ...patch };
            Object.assign(actor.system.props, patch);
        };
        const enemyA = { uuid: 'Actor.EnemyA', name: 'Oni A' };
        const enemyB = { uuid: 'Actor.EnemyB', name: 'Oni B' };
        game.user.targets = new Set([{ actor: enemyA }, { actor: enemyB }]);
        try {
            await rollHit({ actor });
            const finalState = JSON.parse(lastPatch['system.props.resp_neve_estado']);
            assert.equal(finalState.freezeByTarget['Actor.EnemyA'], 1);
            assert.equal(finalState.freezeByTarget['Actor.EnemyB'], 1);
        } finally {
            game.user.targets = new Set();
        }
    });

    it('Problema 1 (regressão) Acerto confirmado com arma dispara o dano automaticamente, sem exigir clique manual na arma', async () => {
        game.user = { ...game.user, targets: new Set() };
        const item = {
            id: 'w1',
            uuid: 'Item.w1',
            name: 'Nichirin',
            system: {
                props: {
                    arma_nome: 'Nichirin',
                    arma_critico: 20,
                    arma_perfis_ataque: [
                        {
                            nome: 'Ataque Base',
                            dano_fixo: 4,
                            dano_dados: '1d6',
                            atributos: [],
                            tipos_dano: ['cortante'],
                        },
                    ],
                },
            },
        };
        const actor = makeActor({ props: { acerto_label: 'acerto_label_dex', dex_display: '5' } });
        actor.documentName = 'Actor';
        actor.items = {
            [Symbol.iterator]: [item][Symbol.iterator].bind([item]),
            get: (id) => (id === 'w1' ? item : null),
        };
        actor.update = async (patch) => {
            Object.assign(actor.system.props, patch);
        };
        _dialogReturn = [
            {
                mode: 'normal',
                rollMode: 'publicroll',
                bonusRaw: '',
                cdVal: 0,
                rollCount: 1,
                actionType: 'ataque',
                weaponId: 'w1',
                weaponProfileIndex: 0,
            }, // openHitDialog
            { hit: true, continue: false }, // openHitConfirmationDialog
            { chain: false }, // openChainFormDialog (encadear outra Forma? não)
            {
                nome: 'Nichirin',
                pdrGasto: 0,
                entradas: [
                    {
                        dado: '1d6',
                        fixo: 4,
                        selAttrs: [],
                        selTiposDano: ['cortante'],
                        tipoAcao: 'ataque',
                    },
                ],
            }, // openDamageDialog
        ];
        let damageFlavor = '';
        ChatMessage.create = async (data) => {
            if (data?.flavor && /Nichirin/.test(data.flavor)) damageFlavor = data.flavor;
            return data;
        };
        await rollHit({ actor });
        assert.match(
            damageFlavor,
            /Nichirin/,
            'o dano da arma deveria ter sido rolado automaticamente após o Acerto confirmado'
        );
    });

    it('autoDamage:false suprime a continuação automática (usada por useBreathForm / Martelo do Julgamento para não rolar dano em duplicidade)', async () => {
        game.user = { ...game.user, targets: new Set() };
        const actor = makeActor({ props: { acerto_label: 'acerto_label_dex', dex_display: '5' } });
        _dialogReturn = [
            {
                mode: 'normal',
                rollMode: 'publicroll',
                bonusRaw: '',
                cdVal: 0,
                rollCount: 1,
                actionType: 'ataque',
            },
            { hit: true, continue: false },
        ];
        let damageRolled = false;
        ChatMessage.create = async (data) => {
            if (data?.flavor && /Dano/.test(data?.flavor ?? '')) damageRolled = true;
            return data;
        };
        await rollHit({ actor, autoDamage: false });
        assert.strictEqual(damageRolled, false);
    });

    it('Fluxo de Neve (alvo único): Congelar só é aplicado ao primeiro alvo marcado, mesmo com múltiplos alvos selecionados', async () => {
        _dialogReturn = [
            {
                mode: 'normal',
                rollMode: 'publicroll',
                bonusRaw: '',
                cdVal: 0,
                rollCount: 1,
                actionType: 'especial',
            },
            { hit: true, continue: false },
        ];
        _rollResult = {
            total: 14,
            toMessage: async () => ({ id: 'hit' }),
            dice: [{ results: [{ result: 8, active: true }] }],
        };
        const snowState = {
            version: 1,
            freezeByTarget: {},
            cooldowns: {},
            pendingDamage: { source: 'neve_01', formula: '2d4', uses: 1, range: 5, freezeOnHit: 1 },
            nextHit: { source: 'neve_01' },
        };
        const actor = makeActor({
            props: {
                acerto_label: 'acerto_label_dex',
                dex_display: '4',
                resp_neve_estado: JSON.stringify(snowState),
            },
        });
        let lastPatch = {};
        actor.update = async (patch) => {
            lastPatch = { ...lastPatch, ...patch };
            Object.assign(actor.system.props, patch);
        };
        const enemyA = { uuid: 'Actor.EnemyA', name: 'Oni A' };
        const enemyB = { uuid: 'Actor.EnemyB', name: 'Oni B' };
        game.user.targets = new Set([{ actor: enemyA }, { actor: enemyB }]);
        try {
            await rollHit({ actor });
            const finalState = JSON.parse(lastPatch['system.props.resp_neve_estado']);
            assert.equal(finalState.freezeByTarget['Actor.EnemyA'], 1);
            assert.equal(finalState.freezeByTarget['Actor.EnemyB'], undefined);
        } finally {
            game.user.targets = new Set();
        }
    });

    it('Ni no Kata Sōsō Shinato Kaze (Vento N3+): Vantagem passiva uma vez por turno em qualquer ataque, sem ativar a técnica', async () => {
        _dialogReturn = [
            {
                mode: 'normal',
                rollMode: 'publicroll',
                bonusRaw: '',
                cdVal: 0,
                rollCount: 1,
                actionType: 'ataque',
            },
            { hit: true, continue: false },
        ];
        _rollResult = {
            total: 14,
            toMessage: async () => ({ id: 'wind-advantage' }),
            dice: [{ results: [{ result: 8, active: true }] }],
        };
        const windItem = { system: { props: { respiracao_nome: 'Vento' } } };
        const actor = makeActor({
            props: {
                acerto_label: 'acerto_label_dex',
                dex_display: '4',
                nvl_respiracao_num: 3,
            },
        });
        actor.items = { [Symbol.iterator]: [windItem][Symbol.iterator].bind([windItem]) };
        actor.update = async () => {};
        let flagSet = null;
        actor.getFlag = () => undefined;
        actor.setFlag = async (moduleId, key, value) => {
            flagSet = { key, value };
        };
        game.combat = { round: 2, turn: 1 };
        try {
            await rollHit({ actor, autoDamage: false });
            assert.match(
                _formula,
                /^2d20kh1\b/,
                'primeiro ataque do turno deve ter Vantagem automática'
            );
            assert.deepEqual(flagSet, { key: 'windGarrasAdvantage', value: { round: 2, turn: 1 } });
        } finally {
            game.combat = undefined;
        }
    });

    it('Ni no Kata Sōsō Shinato Kaze (Vento N3+): NÃO repete Vantagem no mesmo turno depois de já ter sido usada', async () => {
        _dialogReturn = [
            {
                mode: 'normal',
                rollMode: 'publicroll',
                bonusRaw: '',
                cdVal: 0,
                rollCount: 1,
                actionType: 'ataque',
            },
            { hit: true, continue: false },
        ];
        _rollResult = {
            total: 10,
            toMessage: async () => ({ id: 'wind-no-advantage' }),
            dice: [{ results: [{ result: 6, active: true }] }],
        };
        const windItem = { system: { props: { respiracao_nome: 'Vento' } } };
        const actor = makeActor({
            props: {
                acerto_label: 'acerto_label_dex',
                dex_display: '4',
                nvl_respiracao_num: 3,
            },
        });
        actor.items = { [Symbol.iterator]: [windItem][Symbol.iterator].bind([windItem]) };
        actor.update = async () => {};
        actor.getFlag = () => ({ round: 2, turn: 1 });
        let flagSetAgain = false;
        actor.setFlag = async () => {
            flagSetAgain = true;
        };
        game.combat = { round: 2, turn: 1 };
        try {
            await rollHit({ actor, autoDamage: false });
            assert.doesNotMatch(
                _formula,
                /^2d20kh1\b/,
                'Vantagem já usada neste turno não deve reaparecer'
            );
            assert.equal(flagSetAgain, false);
        } finally {
            game.combat = undefined;
        }
    });

    it('Ni no Kata Sōsō Shinato Kaze: sem a Respiração do Vento ou abaixo do Nível 3, nunca concede Vantagem automática', async () => {
        _dialogReturn = [
            {
                mode: 'normal',
                rollMode: 'publicroll',
                bonusRaw: '',
                cdVal: 0,
                rollCount: 1,
                actionType: 'ataque',
            },
            { hit: true, continue: false },
        ];
        _rollResult = {
            total: 10,
            toMessage: async () => ({ id: 'wind-ineligible' }),
            dice: [{ results: [{ result: 6, active: true }] }],
        };
        const actor = makeActor({
            props: {
                acerto_label: 'acerto_label_dex',
                dex_display: '4',
                nvl_respiracao_num: 2,
            },
        });
        actor.update = async () => {};
        actor.getFlag = () => undefined;
        let flagSetIneligible = false;
        actor.setFlag = async () => {
            flagSetIneligible = true;
        };
        game.combat = { round: 1, turn: 0 };
        try {
            await rollHit({ actor, autoDamage: false });
            assert.doesNotMatch(
                _formula,
                /^2d20kh1\b/,
                'Nível 2 não é elegível para a passiva do 2º Estilo'
            );
            assert.equal(flagSetIneligible, false);
        } finally {
            game.combat = undefined;
        }
    });

    it('7ª Forma Neblina (Névoa): bônus de Acerto só se aplica contra o inimigo que testou SAB-vs-SAB e falhou (por alvo, não global)', async () => {
        _dialogReturn = [
            {
                mode: 'normal',
                rollMode: 'publicroll',
                bonusRaw: '',
                cdVal: 0,
                rollCount: 1,
                actionType: 'ataque',
            },
            { hit: true, continue: false },
        ];
        _rollResult = {
            total: 14,
            toMessage: async () => ({ id: 'fog' }),
            dice: [{ results: [{ result: 8, active: true }] }],
        };
        const mistState = {
            version: 1,
            patterns: {},
            fog: { source: 'nevoa_07', turns: 3, bonus: 3, enemyUuid: 'Actor.EnemyA' },
        };
        const actor = makeActor({
            props: {
                acerto_label: 'acerto_label_dex',
                dex_display: '4',
                resp_nevoa_estado: JSON.stringify(mistState),
            },
        });
        actor.update = async () => {};
        const enemyA = { uuid: 'Actor.EnemyA', name: 'Alvo testado' };
        const enemyB = { uuid: 'Actor.EnemyB', name: 'Outro inimigo' };
        game.user.targets = new Set([{ actor: enemyB }]);
        try {
            await rollHit({ actor, autoDamage: false });
            assert.doesNotMatch(
                _formula,
                /\+\s*3\b/,
                'bônus da Neblina não deve somar contra alvo que não testou SAB'
            );
        } finally {
            game.user.targets = new Set();
        }

        _dialogReturn = [
            {
                mode: 'normal',
                rollMode: 'publicroll',
                bonusRaw: '',
                cdVal: 0,
                rollCount: 1,
                actionType: 'ataque',
            },
            { hit: true, continue: false },
        ];
        game.user.targets = new Set([{ actor: enemyA }]);
        try {
            await rollHit({ actor, autoDamage: false });
            assert.match(
                _formula,
                /\+\s*3\b/,
                'bônus da Neblina deve somar contra o alvo que testou SAB e falhou'
            );
        } finally {
            game.user.targets = new Set();
        }
    });
});
