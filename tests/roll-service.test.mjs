import { setupFoundryMocks } from './fixtures/foundry-mock.mjs';
setupFoundryMocks();

import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import { makeActor } from './fixtures/actor.mjs';

// Stub DialogV2 para roll-service
let _dialogReturn = null;
foundry.applications.api.DialogV2.wait = async () => _dialogReturn;

let _rollResult = {
    total: 15,
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

import { rollTest } from '../scripts/roll-service.mjs';

describe('roll-service', () => {
    before(() => {
        foundry.applications.api.DialogV2.confirm = async () => true;
    });
    it('cancela quando dialog retorna null', async () => {
        _dialogReturn = null;
        const actor = makeActor();
        let called = false;
        _rollResult = {
            total: 15,
            toMessage: async () => {
                called = true;
            },
            dice: [{ results: [{ result: 1, active: true }] }],
        };
        await rollTest({ actor, test: 'Teste', attr: 'FOR', value: 5 });
        assert.strictEqual(called, false);
    });

    it('rola normal quando dialog retorna dados', async () => {
        _dialogReturn = {
            mode: 'normal',
            rollMode: 'publicroll',
            secVal: 0,
            bonusRaw: '',
            cdVal: 0,
        };
        const actor = makeActor({
            props: { for_display: '<span>7</span>', atr_for_valor: '<span>99</span>' },
        });
        let called = false;
        _rollResult = {
            total: 15,
            toMessage: async () => {
                called = true;
            },
            dice: [{ results: [{ result: 1, active: true }] }],
        };
        await rollTest({ actor, test: 'Teste', attr: 'FOR', value: 5 });
        assert.strictEqual(called, true);
        assert.match(_formula, /\+ 7$/);
    });

    it('soma Habilidade Especial e Metal em Bloqueio', async () => {
        _dialogReturn = {
            mode: 'normal',
            rollMode: 'publicroll',
            secVal: 0,
            bonusRaw: '',
            cdVal: 0,
        };
        const actor = makeActor({
            props: { for_display: '4', hab_bloqueio_bonus: 3, metal_bloqueio_bonus: 4 },
        });
        await rollTest({ actor, test: 'Bloqueio', attr: 'FOR' });
        assert.match(_formula, /^1d20 \+ 4 \+ 7$/);
    });

    it('aplica Desvantagem de Fadiga Mental e Cegueira Parcial em Percepção', async () => {
        _dialogReturn = {
            mode: 'normal',
            rollMode: 'publicroll',
            secVal: 0,
            bonusRaw: '',
            cdVal: 0,
        };
        const actor = makeActor({
            props: {
                sab_display: '4',
                status_slayer_dados: JSON.stringify({
                    active: ['fadiga_mental', 'cegueira_parcial'],
                    exhaustion: 0,
                }),
            },
        });
        await rollTest({ actor, test: 'Percepção', attr: 'SAB' });
        assert.match(_formula, /^2d20kl1 \+ 4$/);
    });

    it('aplica Vantagem persistida pelo CSB até a fórmula final', async () => {
        _dialogReturn = {
            mode: 'normal',
            rollMode: 'publicroll',
            secVal: 0,
            bonusRaw: '',
            cdVal: 0,
        };
        const actor = makeActor({
            props: {
                for_display: '4',
                status_slayer_dados:
                    '<span>{&quot;version&quot;:2,&quot;active&quot;:[&quot;vantagem&quot;],&quot;exhaustion&quot;:0}</span>',
            },
        });
        await rollTest({ actor, test: 'Atletismo', attr: 'FOR' });
        assert.match(_formula, /^2d20kh1 \+ 4$/);
    });

    it('Dalgona soma +2 em SAB durante a cena registrada', async () => {
        _dialogReturn = {
            mode: 'normal',
            rollMode: 'publicroll',
            secVal: 0,
            bonusRaw: '',
            cdVal: 0,
        };
        globalThis.canvas.scene = { id: 'honmoon-scene' };
        const actor = makeActor({ props: { sab_display: '4' } });
        actor.getFlag = () => ({ sceneId: 'honmoon-scene', bonus: 2 });
        await rollTest({ actor, test: 'Percepção', attr: 'SAB' });
        assert.match(_formula, /^1d20 \+ 4 \+ 2$/);
    });

    it('avisa quando actor não é encontrado', async () => {
        let warned = false;
        ui.notifications.warn = () => {
            warned = true;
        };
        await rollTest({ actorUuid: 'Actor.inexistente' });
        assert.strictEqual(warned, true);
    });

    it('crítico natural em Defesa recupera 1 Fôlego', async () => {
        _dialogReturn = {
            mode: 'normal',
            rollMode: 'publicroll',
            secVal: 0,
            bonusRaw: '',
            cdVal: 0,
        };
        _rollResult = {
            total: 24,
            toMessage: async () => {},
            dice: [{ results: [{ result: 20, active: true }] }],
        };
        const actor = makeActor({
            props: {
                nome_slayer: 'Slayer',
                pdv_slayer_total_valor: 20,
                for_display: '4',
                fdv_display: '4',
                folego_slayer_atual: 2,
            },
        });
        actor.update = async (patch) => {
            actor.system.props.folego_slayer_atual = patch['system.props.folego_slayer_atual'];
        };
        await rollTest({ actor, test: 'Bloqueio', attr: 'FOR' });
        assert.equal(actor.system.props.folego_slayer_atual, 3);
    });

    it('não consome Reflexão da Pedra quando a Defesa falha', async () => {
        _dialogReturn = {
            mode: 'normal',
            rollMode: 'publicroll',
            secVal: 0,
            bonusRaw: '',
            cdVal: 20,
        };
        _rollResult = {
            total: 12,
            toMessage: async () => {},
            dice: [{ results: [{ result: 8, active: true }] }],
        };
        const state = JSON.stringify({ reflection: { blockBonus: 2, counterAttack: true } });
        const actor = makeActor({ props: { for_display: '4', resp_pedra_estado: state } });
        let updated = false;
        actor.update = async () => {
            updated = true;
        };
        await rollTest({ actor, test: 'Bloqueio', attr: 'FOR' });
        assert.equal(updated, false);
    });

    it('Shi no Kata: Aisu Hato N4: +2 em teste com CD que não é Bloqueio/Esquiva', async () => {
        _dialogReturn = {
            mode: 'normal',
            rollMode: 'publicroll',
            secVal: 0,
            bonusRaw: '',
            cdVal: 15,
        };
        const actor = makeActor({
            props: {
                sab_display: '4',
                resp_neve_estado: JSON.stringify({
                    iceHeart: { turns: 2, testBonus: 2, hitBonus: 2, dodgeBonus: 2, blockBonus: 2 },
                }),
            },
        });
        await rollTest({ actor, test: 'Percepção', attr: 'SAB' });
        assert.match(
            _formula,
            /\+ 4 \+ 2$/,
            'bônus de +2 do Coração de Gelo N4 deve somar em teste com CD'
        );
    });

    it('Shi no Kata: Aisu Hato N4: NÃO soma em Bloqueio/Esquiva (já cobertos por blockBonus/dodgeBonus específicos)', async () => {
        _dialogReturn = {
            mode: 'normal',
            rollMode: 'publicroll',
            secVal: 0,
            bonusRaw: '',
            cdVal: 15,
        };
        const actor = makeActor({
            props: {
                for_display: '4',
                resp_neve_estado: JSON.stringify({
                    iceHeart: { turns: 2, testBonus: 2, hitBonus: 2, dodgeBonus: 2, blockBonus: 2 },
                }),
            },
        });
        await rollTest({ actor, test: 'Bloqueio', attr: 'FOR' });
        assert.match(
            _formula,
            /\+ 4 \+ 2$/,
            'Bloqueio já soma blockBonus=2 pelo caminho específico, não deve duplicar via testBonus'
        );
    });

    it('Shi no Kata: Aisu Hato N4: não soma sem CD definido (teste livre, sem dificuldade)', async () => {
        _dialogReturn = {
            mode: 'normal',
            rollMode: 'publicroll',
            secVal: 0,
            bonusRaw: '',
            cdVal: 0,
        };
        const actor = makeActor({
            props: {
                sab_display: '4',
                resp_neve_estado: JSON.stringify({ iceHeart: { turns: 2, testBonus: 2 } }),
            },
        });
        await rollTest({ actor, test: 'Percepção', attr: 'SAB' });
        assert.match(_formula, /\+ 4$/, "sem CD (cdVal=0) o bônus 'contra CD' não deve se aplicar");
    });

    it('pede confirmação quando a Defesa não possui CD', async () => {
        _dialogReturn = {
            mode: 'normal',
            rollMode: 'publicroll',
            secVal: 0,
            bonusRaw: '',
            cdVal: 0,
        };
        _rollResult = {
            total: 18,
            toMessage: async () => {},
            dice: [{ results: [{ result: 14, active: true }] }],
        };
        const state = JSON.stringify({ reflection: { blockBonus: 2, counterAttack: true } });
        const actor = makeActor({ props: { for_display: '4', resp_pedra_estado: state } });
        let confirmations = 0;
        foundry.applications.api.DialogV2.confirm = async () => {
            confirmations += 1;
            return false;
        };
        await rollTest({ actor, test: 'Bloqueio', attr: 'FOR' });
        assert.equal(confirmations, 1);
    });
});
