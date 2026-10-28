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

    it('cancela quando DialogV2 devolve a ação legada cancel', async () => {
        _dialogReturn = 'cancel';
        let called = false;
        _rollResult = {
            total: 15,
            toMessage: async () => {
                called = true;
            },
            dice: [{ results: [{ result: 1, active: true }] }],
        };
        await rollTest({ actor: makeActor(), test: 'Teste', attr: 'FOR', value: 5 });
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

    it('Bloqueio sem CD só pergunta "defendeu?" quando a interceptação de Chamas está pronta', async () => {
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
        let confirmations = 0;
        foundry.applications.api.DialogV2.confirm = async () => {
            confirmations += 1;
            return false;
        };
        await rollTest({ actor: makeActor({ props: { for_display: '4' } }), test: 'Bloqueio', attr: 'FOR' });
        await rollTest({ actor: makeActor({ props: { dex_display: '4' } }), test: 'Esquiva', attr: 'DEX' });
        assert.equal(confirmations, 0, 'sem Chamas a resposta não muda nada');
        const flame = makeActor({
            props: { for_display: '4', resp_chamas_estado: JSON.stringify({ block: { intercept: true } }) },
        });
        await rollTest({ actor: flame, test: 'Bloqueio', attr: 'FOR' });
        assert.equal(confirmations, 1);
    });
});

describe('roll-service: bônus visíveis antes e depois da rolagem', () => {
    const dialogReturn = (extra = {}) => ({
        mode: 'normal',
        rollMode: 'publicroll',
        secVal: 0,
        secKey: '',
        bonusRaw: '',
        cdVal: 0,
        ...extra,
    });

    it('o diálogo lista cada bônus automático com a origem e a prévia já soma todos', async () => {
        let content = '';
        foundry.applications.api.DialogV2.wait = async (config) => {
            content = config.content;
            return null;
        };
        const actor = makeActor({
            props: { for_display: '4', hab_bloqueio_bonus: 3, metal_bloqueio_bonus: 4 },
        });
        await rollTest({ actor, test: 'Bloqueio', attr: 'FOR' });
        foundry.applications.api.DialogV2.wait = async () => _dialogReturn;
        assert.match(content, /Bônus automáticos/u);
        assert.match(content, /\+3/u);
        assert.match(content, /\+4/u);
        assert.match(content, /1d20 \+ 4 \+ 7/u);
    });

    it('sem bônus o diálogo diz isso em vez de ficar vazio', async () => {
        let content = '';
        foundry.applications.api.DialogV2.wait = async (config) => {
            content = config.content;
            return null;
        };
        await rollTest({ actor: makeActor({ props: { int_display: '2' } }), test: 'História', attr: 'INT' });
        foundry.applications.api.DialogV2.wait = async () => _dialogReturn;
        assert.match(content, /Nenhum bônus automático/u);
    });

    it('o chat nomeia o secundário escolhido e separa o bônus manual dos derivados', async () => {
        _dialogReturn = dialogReturn({ secVal: 2, secKey: 'dex', bonusRaw: '1d4' });
        let flavor = '';
        _rollResult = {
            total: 15,
            toMessage: async (data) => {
                flavor = data.flavor;
            },
            dice: [{ results: [{ result: 9, active: true }] }],
        };
        const actor = makeActor({
            props: { for_display: '4', dex_display: '2', hab_bloqueio_bonus: 3 },
        });
        await rollTest({ actor, test: 'Bloqueio', attr: 'FOR' });
        assert.match(flavor, /\+ DEX = 2/u);
        assert.match(flavor, /Bônus: 1d4(?! \+)/u);
        assert.match(flavor, /Derivados: [^|]*\+3/u);
        assert.match(_formula, /^1d20 \+ 4 \+ 2 \+ 1d4 \+ 3$/u);
    });
});

describe('roll-service: visibilidade v14', () => {
    for (const [legacy, expected] of [
        ['publicroll', 'public'],
        ['gmroll', 'gm'],
        ['blindroll', 'blind'],
        ['selfroll', 'self'],
        ['gm', 'gm'],
    ]) {
        it(`teste de atributo em "${legacy}" chega ao core como messageMode "${expected}"`, async () => {
            _dialogReturn = {
                mode: 'normal',
                rollMode: legacy,
                secVal: 0,
                bonusRaw: '',
                cdVal: 0,
            };
            let data;
            let options;
            _rollResult = {
                total: 15,
                toMessage: async (messageData, messageOptions) => {
                    data = messageData;
                    options = messageOptions;
                },
                dice: [{ results: [{ result: 1, active: true }] }],
            };
            await rollTest({ actor: makeActor(), test: 'Teste', attr: 'FOR', value: 5 });
            assert.equal(options?.messageMode, expected);
            assert.equal('rollMode' in data, false);
            assert.equal('messageMode' in data, false);
        });
    }
});

describe('roll-dialog e macro Teste de Atributo', async () => {
    const { previewFormula, autoBonusMarkup } = await import('../scripts/dialogs/roll-dialog.mjs');
    const { readFile } = await import('node:fs/promises');

    it('prévia: secundário, bônus automáticos (com sinal) e manual na mesma ordem da rolagem', () => {
        assert.equal(previewFormula({ value: 4 }), '1d20 + 4');
        assert.equal(previewFormula({ value: 4, secVal: 2, autoModifier: -2, bonusRaw: '+1d4' }), '1d20 + 4 + 2 - 2 + 1d4');
    });

    it('rótulo de bônus é escapado (sem HTML injetado)', () => {
        const html = autoBonusMarkup(['<img src=x onerror=alert(1)> +2'], ['<b>nota</b>']);
        assert.doesNotMatch(html, /<img|<b>/u);
        assert.match(html, /&lt;img/u);
    });

    it('a macro só delega ao rollTest, sem diálogo nem rolagem própria', async () => {
        const macro = await readFile(new URL('../macros/na-roll-mode.js', import.meta.url), 'utf8');
        assert.ok(macro.split('\n').length < 30);
        assert.match(macro, /moduleApi\.rollTest\(/u);
        assert.doesNotMatch(macro, /DialogV2|Roll\.create|toMessage/u);
    });
});
