import assert from 'node:assert/strict';
import test from 'node:test';
import { setupFoundryMocks } from './fixtures/foundry-mock.mjs';
import { attemptDreamExchange, registerDreamPassiveEngine } from '../scripts/dream-passive-service.mjs';
import { breathingPdvInfo } from '../scripts/actor-resources.mjs';
import { resolveSheetAttribute } from '../scripts/sheet-attributes.mjs';
import { resolveSlayerDerivedBonuses } from '../scripts/derived-bonus-service.mjs';
import { rollTest } from '../scripts/roll-service.mjs';
import { buildRestPatch, restContract } from '../scripts/rest-service.mjs';
import { parseStatusState } from '../scripts/status-service.mjs';

function character(npc = false) {
    const props = {
        ...(npc ? { npc_nome: 'NPC', npc_nivel: 8, npc_pdv_base: 30, npc_pdv_dano: 35, npc_sab_base: 6 } :
            { nome_slayer: 'Slayer', nvl_num: 8, pdv_slayer_total_conta: 30, pdv_slayer_dano_tomado: 35, atr_sab_valor_config: 6 }),
        resp_slayer_display: 'resp_slayer_sonhos',
    };
    return { uuid: 'Actor.passive', isOwner: true, system: { props }, async update(patch) {
        for (const [path, value] of Object.entries(patch)) props[path.replace('system.props.', '')] = value;
    } };
}

test('Troca Equivalente restaura 1 PDV após excesso de dano e cobra 2 Exaustão sem limitar dia ou usos', async () => {
    setupFoundryMocks();
    game.user.isGM = true;
    foundry.applications.api.DialogV2.confirm = async ({ content }) => {
        assert.match(content, /memória importante/);
        assert.match(content, /2 níveis de Exaustão/);
        assert.doesNotMatch(content, /SAB|dia|Uso/);
        return true;
    };
    for (const npc of [false, true]) {
        const actor = character(npc);
        actor.system.props[npc ? 'npc_sab_base' : 'atr_sab_valor_config'] = 0;
        actor.system.props.status_slayer_dados = JSON.stringify({ active: ['sangramento'], exhaustion: 0,
            effects: { sangramento: { remainingTurns: 2 } }, exhaustionMilestones: [] });
        for (let use = 1; use <= 3; use++) {
            actor.system.props[npc ? 'npc_pdv_dano' : 'pdv_slayer_dano_tomado'] += 10;
            assert.equal(await attemptDreamExchange(actor), true);
            assert.equal(breathingPdvInfo(actor.system.props).pdvCurrent, 1);
            const status = parseStatusState(actor.system.props.status_slayer_dados);
            assert.equal(status.exhaustion, use * 2);
            assert.equal(actor.system.props.status_slayer_exaustao, use * 2);
            assert.match(actor.system.props.status_slayer_resumo, new RegExp(`Exaustão ${use * 2}`));
            assert.equal(status.effects.sangramento.remainingTurns, 2);
            assert.ok(status.active.includes('sangramento'));
            assert.equal(await attemptDreamExchange(actor), false, 'não ativa sem dano letal');
        }
        actor.system.props[npc ? 'npc_pdv_dano' : 'pdv_slayer_dano_tomado'] += 2;
        assert.equal(await attemptDreamExchange(actor), false);
        actor.system.props.status_slayer_dados = '';
        actor.system.props.status_slayer_exaustao = 0;
        assert.equal(await attemptDreamExchange(actor), true, 'reduzir Exaustão permite nova Troca, sem limite de usos');
        assert.equal(actor.system.props.resp_sonhos_troca_usos, undefined);
        assert.equal(actor.system.props.resp_sonhos_troca_dia, undefined);
        assert.equal(actor.system.props.resp_sonhos_sab_perda, undefined);
        assert.equal(resolveSheetAttribute(actor, 'SAB'), 0);
    }
});

test('Troca Equivalente cancelada ou com Exaustão letal não altera a ficha', async () => {
    setupFoundryMocks();
    const actor = character(true);
    const initial = JSON.stringify(actor.system.props);
    foundry.applications.api.DialogV2.confirm = async () => false;
    assert.equal(await attemptDreamExchange(actor), false);
    assert.equal(JSON.stringify(actor.system.props), initial);
    for (const level of [6, 7, 8]) {
        actor.system.props.status_slayer_exaustao = level;
        const before = JSON.stringify(actor.system.props);
        foundry.applications.api.DialogV2.confirm = async () => { throw new Error('Não deveria oferecer'); };
        assert.equal(await attemptDreamExchange(actor), false);
        assert.equal(JSON.stringify(actor.system.props), before);
    }
});

test('Troca Equivalente revalida Exaustão após a confirmação e respeita o estado persistido', async () => {
    setupFoundryMocks();
    const actor = character(true);
    foundry.applications.api.DialogV2.confirm = async () => {
        actor.system.props.status_slayer_exaustao = 6;
        return true;
    };
    assert.equal(await attemptDreamExchange(actor), false);
    assert.equal(actor.system.props.npc_pdv_curado, undefined);
    actor.system.props.status_slayer_exaustao = 0;
    actor.system.props.status_slayer_dados = JSON.stringify({ exhaustion: 6 });
    foundry.applications.api.DialogV2.confirm = async () => { throw new Error('Não deveria oferecer'); };
    assert.equal(await attemptDreamExchange(actor), false);
});

test('Troca Equivalente permite chegar a Exaustão 7 sem cobrar SAB', async () => {
    setupFoundryMocks();
    const actor = character(true);
    actor.system.props.status_slayer_exaustao = 5;
    actor.system.props.status_slayer_dados = JSON.stringify({ exhaustion: 5, exhaustionMilestones: [5] });
    foundry.applications.api.DialogV2.confirm = async () => true;
    assert.equal(await attemptDreamExchange(actor), true);
    assert.equal(actor.system.props.status_slayer_exaustao, 7);
    assert.equal(breathingPdvInfo(actor.system.props).pdvCurrent, 1);
    assert.equal(resolveSheetAttribute(actor, 'SAB'), 6);
    assert.deepEqual(parseStatusState(actor.system.props.status_slayer_dados).exhaustionMilestones, [5]);
});

test('hook de dano no NPC oferece a Troca uma vez mesmo com atualizações simultâneas', async () => {
    setupFoundryMocks();
    game.user = { id: 'gm', isGM: true };
    game.users = [{ id: 'gm', isGM: true, active: true }];
    let handler;
    globalThis.Hooks = { on(name, callback) { assert.equal(name, 'updateActor'); handler = callback; } };
    let confirmations = 0;
    foundry.applications.api.DialogV2.confirm = async () => { confirmations++; return true; };
    registerDreamPassiveEngine();
    const actor = character(true);
    handler(actor, { 'system.props.npc_pdv_dano': 35 }, {});
    handler(actor, { system: { props: { npc_pdv_dano: 35 } } }, {});
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(confirmations, 1);
    assert.equal(breathingPdvInfo(actor.system.props).pdvCurrent, 1);
});

test('Olhos Escarlate aplica acerto, máximo e percepção visual pelo diálogo normal da ficha', async () => {
    setupFoundryMocks();
    const actor = character(true);
    actor.system.props.resp_slayer_display = 'resp_slayer_raposa';
    actor.system.props.npc_int_base = 4;
    assert.equal(resolveSlayerDerivedBonuses(actor.system.props).channels.acerto.total, -1);
    assert.equal(resolveSlayerDerivedBonuses(actor.system.props).channels.pdrMaximo.total, 1);
    const formulas = [];
    globalThis.Roll = { create(formula) { formulas.push(formula); return { async evaluate() { return { total: 15, async toMessage() {} }; } }; } };
    foundry.applications.api.DialogV2.wait = async ({ buttons, content }) => {
        assert.ok(content.includes('na-rm-visual-perception'));
        return buttons.find(button => button.action === 'normal').callback(null, { form: { elements: {
            'na-rm-secattr': { value: 0, selectedOptions: [] }, 'na-rm-rollmode': { value: 'publicroll' },
            'na-rm-bonus': { value: '' }, 'na-rm-cd': { value: '15' }, 'na-rm-visual-perception': { checked: true },
        } } });
    };
    await rollTest({ actor, test: 'TESTE DE INTELIGÊNCIA', attr: 'INT' });
    assert.match(formulas[0], /1d20 \+ 4 \+ 2/);
});

test('Percepção visual combina habilidade, metal e bônus fixos com prévia e sem duplicar Raposa', async () => {
    for (const [name, checked, expectedBonus, offersVisual] of [
        ['TESTE DE INTELIGÊNCIA', true, 12, true],
        ['TESTE DE INTELIGÊNCIA', false, 1, true],
        ['Percepção visual', true, 12, false],
        ['Percepção auditiva', true, 6, false],
    ]) {
        setupFoundryMocks();
        const actor = character(true);
        Object.assign(actor.system.props, { resp_slayer_display: 'resp_slayer_raposa', npc_int_base: 4,
            hab_escolhida: 'hab_escolhida_visao', metal_escolhido: 'metal_branca',
            npc_bonus_percepcao_visual: 4, npc_bonus_percepcao_auditiva: 5, npc_bonus_teste: 1 });
        let formula;
        let flavor;
        globalThis.Roll = { create(value) { formula = value; return { async evaluate() {
            return { total: 15, async toMessage(message) { flavor = message.flavor; } };
        } }; } };
        foundry.applications.api.DialogV2.wait = async ({ buttons, content, render }) => {
            assert.equal(content.includes('name="na-rm-visual-perception"'), offersVisual);
            const elements = {
                'na-rm-secattr': { value: 0, selectedOptions: [], addEventListener() {} },
                'na-rm-rollmode': { value: 'publicroll' },
                'na-rm-bonus': { value: '', addEventListener() {} }, 'na-rm-cd': { value: '15' },
            };
            if (offersVisual) {
                let update;
                const display = {};
                const automatic = {};
                elements['na-rm-visual-perception'] = { checked: false,
                    addEventListener(type, callback) { assert.equal(type, 'change'); update = callback; } };
                render(null, { element: { querySelector(selector) {
                    if (selector === '#na-rm-formula') return display;
                    if (selector === '#na-rm-auto-bonuses') return automatic;
                    if (selector === '[name="na-rm-visual-perception"]') return elements['na-rm-visual-perception'];
                    return elements[selector.slice(1)];
                } } });
                elements['na-rm-visual-perception'].checked = true;
                update();
                assert.equal(display.textContent, '1d20 + 4 + 12');
                assert.match(automatic.innerHTML, /Habilidade Especial \+2/);
                assert.match(automatic.innerHTML, /Metal \/ Cor \+3/);
                assert.match(automatic.innerHTML, /Olhos Escarlate \+2/);
                elements['na-rm-visual-perception'].checked = false;
                update();
                assert.equal(display.textContent, '1d20 + 4 + 1');
                assert.doesNotMatch(automatic.innerHTML, /Olhos Escarlate/);
                elements['na-rm-visual-perception'].checked = checked;
            }
            return buttons.find(button => button.action === 'normal').callback(null, { form: { elements } });
        };
        await rollTest({ actor, test: name, attr: 'INT' });
        assert.equal(formula, `1d20 + 4 + ${expectedBonus}`);
        assert.equal((flavor.match(/Olhos Escarlate \+2/g) ?? []).length, expectedBonus === 12 ? 1 : 0);
    }
});

test('Descanso do NPC usa recursos nativos e consolida Sangue Especial uma vez', () => {
    const props = { npc_nome: 'NPC', npc_pdv_base: 30, npc_pdv_dano: 10, npc_pdr_base: 20,
        npc_pdr_gasto_valor: 8, resp_vento_estado: JSON.stringify({ scars: 0, vitBonus: 0,
            battleDamage: { cutPierce: 60, bleedInfection: 25 } }) };
    assert.equal(restContract(props).kind, 'npc');
    const result = buildRestPatch(props, { tier: 'deep', record: {} });
    assert.equal(result.patch['system.props.npc_pdv_dano'], 0);
    assert.equal(result.patch['system.props.npc_pdr_gasto_valor'], 0);
    assert.equal(result.patch['system.props.pdv_slayer_dano_tomado'], undefined);
    const wind = JSON.parse(result.patch['system.props.resp_vento_estado']);
    assert.equal(wind.scars, 2);
    assert.equal(wind.vitBonus, 1);
});
