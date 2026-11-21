import assert from 'node:assert/strict';
import test from 'node:test';
import { setupFoundryMocks } from './fixtures/foundry-mock.mjs';
import {
    WIND_CURRENT_KEY, activateWindCurrent, openWindCurrentManager, parseWindCurrent,
    planWindCurrentSpend, reduceWindCurrent, windCurrentBonuses,
} from '../scripts/wind-current-passive.mjs';

const PROPS = { npc_nome: 'Vento', npc_nivel: 8, npc_pdv_base: 200, npc_pdv_dano: 100,
    resp_slayer_display: 'resp_slayer_vento' };
const CONTEXT = { combatId: 'Combat.test', round: 1, turn: 0, actorTurnKey: 'test:1:0:vento', props: PROPS };
function start(extra = {}) {
    return { ...reduceWindCurrent(null, 'combatStart', CONTEXT).state, ...extra };
}
function event(type, executionId, formId = 'vento_02', extra = {}) {
    return { type, executionId, formId, isTechnique: true, hostile: true, success: true, ...extra };
}
function update(state, input, context = CONTEXT) { return reduceWindCurrent(state, input, context).state; }

test('estado tolera JSON inválido e combate novo ou encerrado limpa as duas reservas', () => {
    assert.equal(parseWindCurrent('{').current, 0);
    let state = start({ current: 100, supportedDamage: 200, mode: 'uncontrolled' });
    state = update(state, 'combatStart', { ...CONTEXT, combatId: 'Combat.new' });
    assert.equal(state.current, 0);
    assert.equal(state.supportedDamage, 0);
    state = update({ ...state, current: 100, supportedDamage: 100 }, 'combatEnd');
    assert.equal(state.combatId, '');
    assert.equal(state.current, 0);
    assert.equal(state.supportedDamage, 0);
});

test('execução ganha uma vez, alterna Formas e não multiplica por golpes, alvos ou Bloqueio e contra-ataque', () => {
    let state = update(start(), event('hit', 'attack1'));
    assert.equal(state.current, 1);
    state = update(state, event('hit', 'attack1'));
    state = update(state, event('damageDealt', 'attack1', 'vento_02', { amount: 60, direct: true }));
    assert.equal(state.current, 1);
    state = update(state, event('defense', 'counter1', 'vento_04', { channel: 'bloqueio' }));
    assert.equal(state.current, 3);
    state = update(state, event('hit', 'counter1', 'vento_04', { counterAttack: true }));
    assert.equal(state.current, 3);
    state = update(state, event('hit', 'sameForm', 'vento_04'));
    assert.equal(state.current, 4);
    state = update(state, event('hit', 'alternate', 'vento_02'));
    assert.equal(state.current, 6);
});

test('variações da mesma Forma não geram alternância e Corrente não tem limite', () => {
    let state = update(start({ current: 100 }), event('hit', 'a', 'vento_02'));
    state = update(state, event('hit', 'b', 'vento_02_ciclone'));
    assert.equal(state.current, 102);
    state = update(state, event('hit', 'c', 'vento_03'));
    assert.equal(state.current, 104);
});

test('erro, defesa malsucedida, Esquiva, ataque padrão e alvo aliado não geram Corrente', () => {
    for (const input of [event('miss', 'a'), event('defense', 'b', 'vento_04', { success: false, channel: 'bloqueio' }),
        event('defense', 'c', 'vento_04', { channel: 'esquiva' }), event('hit', 'd', 'vento_02', { isTechnique: false }),
        event('hit', 'e', 'vento_02', { hostile: false })]) assert.equal(update(start(), input).current, 0);
});

test('rodada inteira sem sucesso apaga só Corrente e reserva de dano permanece', () => {
    let state = update(start({ supportedDamage: 100 }), event('hit', 'a'));
    state = update(state, 'turnStart', { ...CONTEXT, round: 2, actorTurnKey: 'test:2:0:vento' });
    assert.equal(state.current, 1);
    state = update(state, 'turnStart', { ...CONTEXT, round: 3, actorTurnKey: 'test:3:0:vento' });
    assert.equal(state.current, 0);
    assert.equal(state.supportedDamage, 100);
    const jumped = update(update(start(), event('hit', 'a')), 'turnStart', { ...CONTEXT, round: 4 });
    assert.equal(jumped.current, 0);
});

test('estado muda uma vez no início do próprio turno, sem consumir pontos', () => {
    let state = update(start({ current: 9 }), 'turnStart');
    let result = reduceWindCurrent(state, { type: 'mode', mode: 'uncontrolled' }, CONTEXT);
    assert.equal(result.ok, true);
    assert.equal(result.state.current, 9);
    assert.equal(result.state.mode, 'uncontrolled');
    state = result.state;
    assert.equal(reduceWindCurrent(state, { type: 'mode', mode: 'controlled' }, CONTEXT).ok, false);
    state = update(state, 'turnStart');
    assert.equal(state.modeChosen, true);
    state = update(state, 'turnStart', { ...CONTEXT, round: 2, actorTurnKey: 'test:2:0:vento' });
    assert.equal(state.modeChosen, false);
    state = update(state, 'turnEnd');
    assert.equal(reduceWindCurrent(state, { type: 'mode', mode: 'controlled' }, CONTEXT).ok, false);
});

test('Furacão Descontrolado impõe -2 em Bloqueio e Esquiva mesmo sem gastar Corrente', () => {
    const bonuses = windCurrentBonuses({ ...PROPS, [WIND_CURRENT_KEY]: JSON.stringify(start({ mode: 'uncontrolled' })) });
    assert.equal(bonuses.acerto, 0);
    assert.equal(bonuses.bloqueio, -2);
    assert.equal(bonuses.esquiva, -2);
    assert.equal(bonuses.damageDice, 0);
});

test('declaração Controlada é pura, valida inteiros e concede +2 por ponto ao canal declarado', () => {
    const before = start({ current: 6 });
    const snapshot = JSON.stringify(before);
    const result = planWindCurrentSpend(before, { points: 3, channel: 'acerto', executionId: 'a' }, CONTEXT);
    assert.equal(JSON.stringify(before), snapshot);
    assert.equal(result.state.current, 3);
    assert.equal(result.bonus, 6);
    const bonuses = windCurrentBonuses({ ...PROPS, [WIND_CURRENT_KEY]: result.state });
    assert.equal(bonuses.acerto, 6);
    assert.equal(bonuses.bloqueio, 0);
    const miss = update(result.state, event('miss', 'a'));
    assert.equal(miss.pendingRoll, null);
    assert.equal(miss.current, 3);
    for (const points of [-1, 0, 1.5, 7, Infinity, 'oops'])
        assert.equal(planWindCurrentSpend(before, { points, channel: 'acerto' }, CONTEXT).ok, false);
    assert.equal(planWindCurrentSpend(before, { points: 2, channel: 'dano' }, CONTEXT).ok, false);
    const cancelled = planWindCurrentSpend(before, { points: 2, channel: 'acerto', confirmed: false }, CONTEXT);
    assert.equal(cancelled.ok, false);
    assert.deepEqual(cancelled.state, before);
});

test('Bloqueio Controlado da 3ª Forma transfere +1d6 por ponto ao mesmo contra-ataque', () => {
    const spent = planWindCurrentSpend(start({ current: 4 }), {
        points: 3, channel: 'bloqueio', formId: 'vento_04', executionId: 'counter',
    }, CONTEXT).state;
    const result = reduceWindCurrent(spent, event('defense', 'counter', 'vento_04', { channel: 'bloqueio' }), CONTEXT);
    assert.equal(result.state.current, 2);
    assert.equal(result.state.pendingDamage.diceRemaining, 3);
    assert.equal(result.state.pendingDamage.counterAttack, true);
    const failure = reduceWindCurrent(spent, event('defense', 'counter', 'vento_04', { channel: 'bloqueio', success: false }), CONTEXT);
    assert.equal(failure.state.current, 1);
    assert.equal(failure.state.pendingDamage, null);
    const other = planWindCurrentSpend(start({ current: 4 }), { points: 3, channel: 'bloqueio', formId: 'vento_05', executionId: 'block' }, CONTEXT).state;
    assert.equal(update(other, event('defense', 'block', 'vento_05', { channel: 'bloqueio' })).pendingDamage, null);
});

test('dados Descontrolados são um único pool distribuído entre golpes sem multiplicação por alvos', () => {
    let state = planWindCurrentSpend(start({ current: 10, mode: 'uncontrolled' }), {
        points: 3, channel: 'damage', isTechnique: true, executionId: 'multi', formId: 'vento_06',
    }, CONTEXT).state;
    assert.equal(state.current, 7);
    assert.equal(state.pendingDamage.diceRemaining, 6);
    let result = reduceWindCurrent(state, event('consumeDamageBonus', 'multi', 'vento_06', { dice: 2 }), CONTEXT);
    assert.equal(result.damageDice, 2);
    assert.equal(result.state.pendingDamage.diceRemaining, 4);
    state = result.state;
    assert.equal(reduceWindCurrent(state, event('consumeDamageBonus', 'other', 'vento_06', { dice: 4 }), CONTEXT).ok, false);
    result = reduceWindCurrent(state, event('consumeDamageBonus', 'multi', 'vento_06', { dice: 4 }), CONTEXT);
    assert.equal(result.damageDice, 4);
    assert.equal(result.state.pendingDamage, null);
    assert.equal(reduceWindCurrent(result.state, event('consumeDamageBonus', 'multi', 'vento_06', { dice: 6 }), CONTEXT).ok, false);
    const blocked = planWindCurrentSpend(start({ current: 4, mode: 'uncontrolled' }), { points: 2, channel: 'damage', isTechnique: false }, CONTEXT);
    assert.equal(blocked.ok, false);
});

test('pool declarado sem execução é vinculado ao primeiro uso e erro final descarta os dados restantes', () => {
    const pending = planWindCurrentSpend(start({ current: 5, mode: 'uncontrolled' }), {
        points: 2, channel: 'damage', isTechnique: true,
    }, CONTEXT).state;
    const used = update(pending, event('consumeDamageBonus', 'first', 'vento_06', { dice: 2 }));
    assert.equal(used.pendingDamage.executionId, 'first');
    assert.equal(reduceWindCurrent(used, event('consumeDamageBonus', 'second', 'vento_06', { dice: 2 }), CONTEXT).ok, false);
    assert.equal(update(used, event('miss', 'first', 'vento_06')).pendingDamage, null);
});

test('Dano Suportado recebe só dano hostil efetivamente sofrido, incluindo efeitos hostis', () => {
    let state = start();
    state = update(state, { type: 'damageTaken', hostile: true, amount: 100 });
    state = update(state, { type: 'damageTaken', hostile: true, amount: 5, periodic: true });
    assert.equal(state.supportedDamage, 105);
    for (const exclusion of [{ voluntary: true }, { selfInflicted: true }, { ally: true }, { hostile: false }])
        state = update(state, { type: 'damageTaken', hostile: true, amount: 99, ...exclusion });
    assert.equal(state.supportedDamage, 105);
});

test('Fôlego usa metade do menor valor, consome a parcela usada e só uma vez por rodada/execução', () => {
    const before = start({ supportedDamage: 100 });
    const dealt = event('damageDealt', 'a', 'vento_02', { amount: 80, direct: true });
    const preview = reduceWindCurrent(before, dealt, CONTEXT);
    assert.equal(preview.healAvailable, 40);
    assert.equal(preview.healAmount, 0);
    assert.equal(preview.state.supportedDamage, 100);
    const recovered = reduceWindCurrent(before, { ...dealt, recover: true }, CONTEXT);
    assert.equal(recovered.healAmount, 40);
    assert.equal(recovered.matchedDamage, 80);
    assert.equal(recovered.state.supportedDamage, 20);
    assert.equal(reduceWindCurrent(recovered.state, { ...dealt, recover: true }, CONTEXT).healAmount, 0);
    assert.equal(reduceWindCurrent(recovered.state, { ...dealt, executionId: 'b', recover: true }, CONTEXT).healAmount, 0);
    const nextRound = reduceWindCurrent(recovered.state, { ...dealt, executionId: 'b', recover: true }, { ...CONTEXT, round: 2 });
    assert.equal(nextRound.healAmount, 10);
    assert.equal(nextRound.state.supportedDamage, 0);
});

test('Fôlego arredonda para baixo, respeita máximo normal e não cura por Sangramento ou golpe padrão', () => {
    const input = event('damageDealt', 'a', 'vento_04', { amount: 7, direct: true, recover: true });
    for (const mode of ['controlled', 'uncontrolled']) {
        assert.equal(reduceWindCurrent(start({ supportedDamage: 5, mode }), input, CONTEXT).healAmount, 2);
        const capped = reduceWindCurrent(start({ supportedDamage: 100, mode }), input,
            { ...CONTEXT, props: { ...PROPS, npc_pdv_dano: 1 } });
        assert.equal(capped.healAmount, 1);
    }
    const temporary = { nome_slayer: 'Slayer', pdv_slayer_total_conta: 100, pdv_slayer_dano_tomado: 2,
        pdv_slayer_extra: 20, resp_slayer_display: 'resp_slayer_vento' };
    assert.equal(reduceWindCurrent(start({ supportedDamage: 100 }), input, { ...CONTEXT, props: temporary }).healAmount, 2);
    for (const exclusion of [{ direct: false }, { periodic: true }, { isTechnique: false }, { hostile: false }]) {
        const result = reduceWindCurrent(start({ supportedDamage: 100 }), { ...input, ...exclusion }, CONTEXT);
        assert.equal(result.healAmount, 0);
        assert.equal(result.state.supportedDamage, 100);
    }
    const zero = reduceWindCurrent(start({ supportedDamage: 1 }), input, CONTEXT);
    assert.equal(zero.healAmount, 0);
    assert.equal(zero.state.supportedDamage, 1);
});

function actorWith(state) {
    const actor = { uuid: 'Actor.wind', isOwner: true, system: { props: { ...PROPS, [WIND_CURRENT_KEY]: JSON.stringify(state) } },
        updates: [], async update(patch) {
            this.updates.push(patch);
            for (const [path, value] of Object.entries(patch)) this.system.props[path.replace('system.props.', '')] = value;
        } };
    return actor;
}
function setupRuntime() {
    setupFoundryMocks();
    game.combat = { uuid: CONTEXT.combatId, id: CONTEXT.combatId, started: true, round: 1, turn: 0 };
}

test('gasto cancelado não altera Corrente e confirmação revalida o saldo atual', async () => {
    setupRuntime();
    const actor = actorWith(start({ current: 5 }));
    foundry.applications.api.DialogV2.confirm = async () => false;
    const cancelled = await activateWindCurrent(actor, 'spend', { points: 3, channel: 'acerto' });
    assert.equal(cancelled.cancelled, true);
    assert.equal(actor.updates.length, 0);
    foundry.applications.api.DialogV2.confirm = async () => {
        actor.system.props[WIND_CURRENT_KEY] = JSON.stringify(start({ current: 1 }));
        return true;
    };
    assert.equal((await activateWindCurrent(actor, 'spend', { points: 3, channel: 'acerto' })).ok, false);
    assert.equal(actor.updates.length, 0);
});

test('Fôlego confirmado grava cura nativa do NPC e cancelar não consome a reserva', async () => {
    setupRuntime();
    const offer = reduceWindCurrent(start({ supportedDamage: 100 }), event('damageDealt', 'a', 'vento_02', { amount: 80, direct: true }), CONTEXT).state;
    const actor = actorWith(offer);
    foundry.applications.api.DialogV2.confirm = async () => false;
    assert.equal((await activateWindCurrent(actor, 'recover')).cancelled, true);
    assert.equal(actor.updates.length, 0);
    foundry.applications.api.DialogV2.confirm = async () => true;
    const result = await activateWindCurrent(actor, 'recover');
    assert.equal(result.healAmount, 40);
    assert.equal(actor.system.props.npc_pdv_curado, 40);
    assert.equal(actor.system.props.pdv_slayer_curado, undefined);
    assert.equal(parseWindCurrent(actor.system.props[WIND_CURRENT_KEY]).supportedDamage, 20);
});

test('Fôlego não consome reserva se a rodada mudar enquanto a confirmação está aberta', async () => {
    setupRuntime();
    const offer = update(start({ supportedDamage: 100 }), event('damageDealt', 'a', 'vento_02', { amount: 80, direct: true }));
    const actor = actorWith(offer);
    foundry.applications.api.DialogV2.confirm = async () => { game.combat.round = 2; return true; };
    const result = await activateWindCurrent(actor, 'recover');
    assert.equal(result.ok, false);
    assert.equal(actor.updates.length, 0);
    assert.equal(parseWindCurrent(actor.system.props[WIND_CURRENT_KEY]).supportedDamage, 100);
});

test('gerenciador aberto em outro turno não muda o estado do novo turno', async () => {
    setupRuntime();
    const actor = actorWith(update(start({ current: 5 }), 'turnStart'));
    foundry.applications.api.DialogV2.wait = async config => {
        game.combat.round = 2;
        const next = update(parseWindCurrent(actor.system.props[WIND_CURRENT_KEY]), 'turnStart',
            { ...CONTEXT, round: 2, actorTurnKey: 'test:2:0:vento' });
        actor.system.props[WIND_CURRENT_KEY] = JSON.stringify(next);
        return config.buttons.find(button => button.action === 'uncontrolled').callback();
    };
    const result = await openWindCurrentManager(actor);
    assert.equal(result.ok, false);
    assert.equal(actor.updates.length, 0);
    assert.equal(parseWindCurrent(actor.system.props[WIND_CURRENT_KEY]).mode, 'controlled');
});

test('gerenciador declara gasto e fechar preserva os recursos', async () => {
    setupRuntime();
    const actor = actorWith(start({ current: 6 }));
    foundry.applications.api.DialogV2.wait = async config => {
        assert.ok(config.content.includes('Pontos de Corrente'));
        return config.buttons.find(button => button.action === 'spend').callback(null,
            { form: { elements: { windPoints: { value: '2' }, windChannel: { value: 'esquiva' } } } });
    };
    const spent = await openWindCurrentManager(actor);
    assert.equal(spent.ok, true);
    assert.equal(spent.state.current, 4);
    assert.equal(spent.state.pendingRoll.channel, 'esquiva');
    foundry.applications.api.DialogV2.wait = async config => config.buttons.find(button => button.action === 'close').callback();
    const before = actor.system.props[WIND_CURRENT_KEY];
    assert.equal((await openWindCurrentManager(actor)).cancelled, true);
    assert.equal(actor.system.props[WIND_CURRENT_KEY], before);
});

test('serviço exige ownership, Vento e combate ativo', async () => {
    setupRuntime();
    const actor = actorWith(start({ current: 3 }));
    actor.isOwner = false;
    assert.equal((await activateWindCurrent(actor, 'spend', { points: 1, channel: 'acerto', confirmed: true })).ok, false);
    actor.isOwner = true;
    actor.system.props.resp_slayer_display = 'resp_slayer_agua';
    assert.equal((await activateWindCurrent(actor, 'spend', { points: 1, channel: 'acerto', confirmed: true })).ok, false);
    actor.system.props.resp_slayer_display = 'resp_slayer_vento';
    game.combat.started = false;
    assert.equal((await activateWindCurrent(actor, 'spend', { points: 1, channel: 'acerto', confirmed: true })).ok, false);
    assert.equal(actor.updates.length, 0);
});
