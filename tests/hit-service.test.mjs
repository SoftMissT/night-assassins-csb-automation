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

import { rollHit } from '../scripts/hit-service.mjs';

describe('hit-service', () => {
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

    it('Reflexão da Pedra: penaliza a próxima rolagem de Acerto e consome a penalidade em uso único (regressão)', async () => {
        _dialogReturn = { mode: 'normal', rollMode: 'publicroll', bonusRaw: '', cdVal: 0 };
        let called = false;
        _rollResult = {
            total: 14,
            toMessage: async () => {
                called = true;
            },
            dice: [{ results: [{ result: 1, active: true }] }],
        };
        let unsetCalls = 0;
        const actor = makeActor({ props: { acerto_label: 'acerto_label_for', for_display: '6' } });
        actor.getFlag = (moduleId, key) =>
            key === 'stoneReflectionPenalty' ? { value: -9, turns: 1 } : undefined;
        actor.unsetFlag = async (moduleId, key) => {
            if (key === 'stoneReflectionPenalty') unsetCalls += 1;
        };
        await rollHit({ actor });
        assert.strictEqual(called, true);
        // −9 da Reflexão aplicada à rolagem (bônus total: 6 (FOR) − 9)
        assert.match(_formula, /\+ 6 \+ -9$/);
        // uso único: a penalidade é consumida (unsetFlag) assim que aplicada a UMA rolagem —
        // não deve permanecer disponível para rolagens seguintes do mesmo inimigo.
        assert.equal(unsetCalls, 1);
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
            actor.system.props.folego_slayer_atual = patch['system.props.folego_slayer_atual'];
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
                    stone: { breakByWeapon: { w1: 8 } },
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

    it('Manoplas encadeiam um ataque extra e +1 de Acerto após crítico', async () => {
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
            { hit: true, continue: true },
            { hit: true, continue: false },
        ];
        const naturals = [20, 10, 10];
        const formulas = [];
        const previousCreate = Roll.create;
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
            assert.equal(result.maximum, 3);
            assert.equal(result.attempts.length, 3);
            assert.match(formulas[1], /\+ 1$/);
            assert.match(formulas[2], /\+ 1$/);
        } finally {
            Roll.create = previousCreate;
        }
    });

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
