import assert from 'node:assert/strict';
import test from 'node:test';
import { setupFoundryMocks } from './fixtures/foundry-mock.mjs';
import { FOX_PASSIVE_KEY, activateFoxPassive, foxPassiveBonuses, openFoxPassiveManager,
    parseFoxPassive, reduceFoxPassive } from '../scripts/fox-passive-service.mjs';
import { parseActionState } from '../scripts/action-service.mjs';
import { parseStatusState } from '../scripts/status-service.mjs';

const context = { combatId: 'c1', round: 1, turn: 0, actorTurnKey: 'c1:1:0', actorUuid: 'Actor.fox' };
function initial(veils = 0) { return parseFoxPassive({ combatId: context.combatId, veils }); }
function gain(state, event, current = context) { return reduceFoxPassive(state, { success: true, eventId: 'event', ...event }, current); }
function actor(npc = false, veils = 9) {
    const props = { resp_slayer_display: 'resp_slayer_raposa', nvl_respiracao: 4,
        [FOX_PASSIVE_KEY]: JSON.stringify(initial(veils)),
        ...(npc ? { npc_nome: 'Raposa', npc_pdr_base: 10, npc_fdv_base: 2, npc_pdr_gasto_valor: 0 } :
            { nome_slayer: 'Raposa', pdr_slayer_total: 10, atr_fdv_valor_config: 2, pdr_slayer_gasto_valor: 0 }) };
    return { uuid: 'Actor.fox', isOwner: true, system: { props }, async update(patch) {
        for (const [path, value] of Object.entries(patch)) props[path.slice('system.props.'.length)] = value;
    } };
}
function setup() {
    setupFoundryMocks();
    game.combat = { id: 'c1', round: 1, turn: 0 };
    foundry.applications.api.DialogV2.confirm = async () => true;
}

test('Véus começam e terminam em zero, cap9 e normalização de dados legados', () => {
    assert.equal(parseFoxPassive('quebrado').veils, 0);
    assert.equal(parseFoxPassive({ veils: 42, gainedThisRound: 9 }).veils, 9);
    assert.equal(parseFoxPassive({ gainedThisRound: 9 }).gainedThisRound, 2);
    const html = '<span>{&quot;veils&quot;:4,&quot;combatId&quot;:&quot;c1&quot;}</span>';
    assert.equal(parseFoxPassive(html).veils, 4);
    let result = reduceFoxPassive(initial(8), { type: 'combatStart' }, context);
    assert.equal(result.state.veils, 0);
    assert.equal(result.state.combatId, 'c1');
    result = gain(initial(8), { type: 'defense', defenseType: 'esquiva', perfect: true });
    assert.equal(result.gained, 1);
    assert.equal(result.state.veils, 9);
    result = reduceFoxPassive(result.state, { type: 'combatEnd' }, context);
    assert.deepEqual(result.state, parseFoxPassive());
    assert.equal(gain(parseFoxPassive(), { type: 'defense', defenseType: 'esquiva', perfect: true }).gained, 0);
});

test('ganhos cobrem cada ocorrência, até2 por rodada e sem sobreposição de requisitos', () => {
    const perfect = gain(initial(), { type: 'defense', defenseType: 'esquiva', perfect: true, actionType: 'reacao' });
    assert.equal(perfect.gained, 2);
    const repeated = gain(perfect.state, { type: 'preventAllyDamage', targetUuid: 'Actor.ally', amount: 9 });
    assert.equal(repeated.gained, 0);
    assert.equal(gain(perfect.state, { eventId: 'second', type: 'statusApplied', condition: 'distraido' }).gained, 0);
    for (const event of [
        { type: 'statusApplied', condition: 'distraido' },
        { type: 'statusApplied', condition: 'desorientado' },
        { type: 'defense', defenseType: 'bloqueio', actionType: 'reacao' },
        { type: 'preventAllyDamage', targetUuid: 'Actor.ally', amount: 1 },
        { type: 'healAlly', targetUuid: 'Actor.ally', amount: 1, isTechnique: true },
    ]) {
        const first = gain(initial(), event);
        assert.equal(first.gained, 1, event.type);
        assert.equal(gain(first.state, { ...event, eventId: 'other' }).gained, 1);
        assert.equal(gain(first.state, { ...event, eventId: 'third' }, { ...context, round: 2 }).gained, 1);
        assert.equal(gain(first.state, { ...event, type: 'statusApplied', condition: 'desorientado' }).gained, 0);
    }
    for (const event of [
        { type: 'healAlly', targetUuid: 'Actor.fox', amount: 4, isTechnique: true },
        { type: 'healAlly', targetUuid: 'Actor.ally', amount: 0, isTechnique: true },
        { type: 'healAlly', targetUuid: 'Actor.ally', amount: 4, isTechnique: false },
        { type: 'defense', defenseType: 'bloqueio', success: false, actionType: 'reacao' },
        { type: 'statusApplied', condition: 'cego' },
        { type: 'statusApplied', condition: 'distraido', eventId: '' },
    ]) assert.equal(gain(initial(), event).gained, 0, event.type);
});

test('limiares1a9 somam Esquiva e Acerto e a primeira Vantagem se renova a cada turno', () => {
    for (let veils = 0; veils <= 9; veils++) {
        let state = reduceFoxPassive(initial(veils), { type: 'turnStart', isActorTurn: true }, context).state;
        const props = { resp_slayer_display: 'resp_slayer_raposa', [FOX_PASSIVE_KEY]: JSON.stringify(state) };
        let bonuses = foxPassiveBonuses(props);
        assert.equal(bonuses.esquiva, Math.min(3, veils));
        assert.equal(bonuses.acerto, Math.min(3, Math.max(0, veils - 3)));
        assert.equal(bonuses.attackAdvantage, veils >= 7);
        state = reduceFoxPassive(state, { type: 'hit', actionType: 'ataque', success: false }, context).state;
        props[FOX_PASSIVE_KEY] = JSON.stringify(state);
        assert.equal(foxPassiveBonuses(props).attackAdvantage, false, 'errar também consome primeiro ataque');
        state = reduceFoxPassive(state, { type: 'turnStart', isActorTurn: false }, { ...context, turn: 1 }).state;
        props[FOX_PASSIVE_KEY] = JSON.stringify(state);
        assert.equal(foxPassiveBonuses(props).attackAdvantage, veils >= 7);
    }
    assert.equal(foxPassiveBonuses({ [FOX_PASSIVE_KEY]: JSON.stringify(initial(9)) }).esquiva, 0);
});

test('Caudas Enganadoras oferecem Distraído uma vez por rodada e Caudas Ilusórias respeitam duração menor', () => {
    let result = reduceFoxPassive(initial(4), { type: 'miss', targetUuid: 'Actor.enemy' }, context);
    assert.equal(result.offerDistraction.targetUuid, 'Actor.enemy');
    result = reduceFoxPassive(result.state, { type: 'miss', targetUuid: 'Actor.enemy', activateDistraction: true }, context);
    assert.deepEqual(result.applyDistraction, { targetUuid: 'Actor.enemy', condition: 'distraido', untilTargetTurnStart: true });
    assert.equal(reduceFoxPassive(result.state, { type: 'miss', targetUuid: 'Actor.other' }, context).offerDistraction, undefined);
    assert.ok(reduceFoxPassive(result.state, { type: 'miss', targetUuid: 'Actor.other' }, { ...context, round: 2 }).offerDistraction);
    assert.equal(gain(initial(7), { type: 'statusApplied', condition: 'desorientado', duration: 3 }).desorientedTurns, 2);
    assert.equal(gain(initial(7), { type: 'statusApplied', condition: 'desorientado', duration: 1 }).desorientedTurns, 1);
    assert.equal(gain(initial(6), { type: 'statusApplied', condition: 'desorientado' }).desorientedTurns, undefined);
});

test('Nona Cauda valida nível,9Véus,FDV,permissão e uma ativação por combate', async () => {
    setup();
    const user = actor(true);
    user.isOwner = false;
    assert.equal((await activateFoxPassive(user, 'supreme')).ok, false);
    user.isOwner = true;
    user.system.props.nvl_respiracao = '';
    assert.equal((await activateFoxPassive(user, 'supreme')).ok, false);
    user.system.props.nvl_respiracao = 4;
    user.system.props.npc_fdv_base = 6;
    const result = await activateFoxPassive(user, 'supreme');
    assert.equal(result.ok, true);
    assert.equal(result.state.supreme.remaining, 3);
    assert.equal(result.state.veils, 0);
    assert.equal(user.system.props.npc_pdr_gasto_valor, 0);
    assert.equal(parseActionState(user.system.props.acoes_slayer_dados).turn.ataque, 0);
    user.system.props[FOX_PASSIVE_KEY] = JSON.stringify({ ...result.state, veils: 9, supreme: { active: false, used: true } });
    assert.equal((await activateFoxPassive(user, 'supreme')).ok, false);
});

test('Nona Cauda duraFDVturnos próprios, não concede novosVéus e termina contra dano semEsquiva', async () => {
    setup();
    const user = actor();
    let state = (await activateFoxPassive(user, 'supreme')).state;
    assert.equal(state.supreme.remaining, 2);
    const props = { ...user.system.props, [FOX_PASSIVE_KEY]: JSON.stringify(state) };
    assert.equal(foxPassiveBonuses(props).attackAdvantage, true);
    assert.equal(foxPassiveBonuses(props).incomingAttackDisadvantage, true);
    assert.equal(gain(state, { type: 'defense', defenseType: 'esquiva', perfect: true }).gained, 0);
    state = reduceFoxPassive(state, { type: 'turnStart', isActorTurn: false }, { ...context, turn: 1 }).state;
    assert.equal(state.supreme.remaining, 2);
    state = reduceFoxPassive(state, { type: 'turnStart', isActorTurn: true }, { ...context, round: 2, actorTurnKey: 'c1:2:0' }).state;
    assert.equal(state.supreme.remaining, 1);
    assert.equal(reduceFoxPassive(state, { type: 'turnStart', isActorTurn: true }, { ...context, round: 2, actorTurnKey: 'c1:2:0' }).state.supreme.remaining, 1);
    assert.equal(reduceFoxPassive(state, { type: 'turnStart', isActorTurn: true }, { ...context, round: 3, actorTurnKey: 'c1:3:0' }).state.supreme.active, false);
    assert.equal(reduceFoxPassive(state, { type: 'damageTaken', amount: 1, cannotDodge: true }, context).state.supreme.active, false);
    assert.equal(reduceFoxPassive(state, { type: 'damageTaken', amount: 0, cannotDodge: true }, context).state.supreme.active, true);
});

test('finalização cobra ação+6PDR nativos, maximiza arma, soma6d10+FDV e encerra com1Exaustão', async () => {
    setup();
    for (const npc of [false, true]) {
        const user = actor(npc);
        await activateFoxPassive(user, 'supreme');
        let plan;
        const result = await activateFoxPassive(user, 'finisher', { execute: async value => {
            plan = value;
            return { executed: true, hit: false };
        } });
        assert.equal(result.ok, true);
        assert.equal(plan.extraDamage, '6d10 + 2');
        assert.equal(plan.maximizeWeaponDice, true);
        assert.equal(plan.advantage, true);
        assert.deepEqual(plan.blockDefensiveReactionsWhen, ['distraido', 'desorientado']);
        assert.equal(user.system.props[npc ? 'npc_pdr_gasto_valor' : 'pdr_slayer_gasto_valor'], 6);
        assert.equal(parseActionState(user.system.props.acoes_slayer_dados).turn.ataque, 1);
        assert.equal(parseFoxPassive(user.system.props[FOX_PASSIVE_KEY]).supreme.active, false);
        assert.equal(parseStatusState(user.system.props.status_slayer_dados).exhaustion, 1);
        assert.equal(user.system.props.status_slayer_exaustao, 1);
    }
});

test('cancelamento,executor ausente,ação gasta e PDR insuficiente preservam estado e recursos', async () => {
    setup();
    const user = actor(true);
    foundry.applications.api.DialogV2.confirm = async () => false;
    const before = JSON.stringify(user.system.props);
    assert.equal((await activateFoxPassive(user, 'supreme')).cancelled, true);
    assert.equal(JSON.stringify(user.system.props), before);
    foundry.applications.api.DialogV2.confirm = async () => true;
    await activateFoxPassive(user, 'supreme');
    assert.equal((await activateFoxPassive(user, 'finisher')).ok, false);
    assert.equal((await activateFoxPassive(user, 'finisher', { execute: async () => false })).cancelled, true);
    assert.equal(user.system.props.npc_pdr_gasto_valor, 0);
    assert.equal(parseActionState(user.system.props.acoes_slayer_dados).turn.ataque, 0);
    assert.equal(parseFoxPassive(user.system.props[FOX_PASSIVE_KEY]).supreme.active, true);
    user.system.props.npc_pdr_gasto_valor = 9;
    assert.equal((await activateFoxPassive(user, 'finisher', { execute: async () => assert.fail('Não deve executar') })).ok, false);
    user.system.props.npc_pdr_gasto_valor = 0;
    user.system.props.acoes_slayer_dados = JSON.stringify({ turn: { ataque: 1 } });
    assert.equal((await activateFoxPassive(user, 'finisher', { execute: async () => assert.fail('Não deve executar') })).ok, false);
});

test('falha do executor reverte reserva e gerenciador cancelado não altera recursos', async () => {
    setup();
    const user = actor();
    await activateFoxPassive(user, 'supreme');
    await assert.rejects(() => activateFoxPassive(user, 'finisher', { execute: async () => { throw new Error('Falhou'); } }), /Falhou/);
    assert.equal(user.system.props.pdr_slayer_gasto_valor, 0);
    assert.equal(parseActionState(user.system.props.acoes_slayer_dados).turn.ataque, 0);
    foundry.applications.api.DialogV2.wait = async () => false;
    const before = JSON.stringify(user.system.props);
    assert.equal((await openFoxPassiveManager(user)).cancelled, true);
    assert.equal(JSON.stringify(user.system.props), before);
});
