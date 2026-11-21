import assert from 'node:assert/strict';
import test from 'node:test';
import { setupFoundryMocks } from './fixtures/foundry-mock.mjs';
import {
    METAL_FORGE_KEY, parseMetalForge, reduceMetalForge, metalForgeBonuses,
    activateMetalForge, openMetalForgeManager,
} from '../scripts/metal-forge-passive.mjs';

const context = (round = 1, turn = 0) => ({ combatId: 'Combat.forge', round, turn,
    actorTurnKey: `Combat.forge:${round}:${turn}`, props: { npc_nome: 'NPC', npc_vit_base: 5 } });
const event = (state, input, round = 1, turn = 0) => reduceMetalForge(state, input, context(round, turn));
const ready = () => ({ ...parseMetalForge(null), combatId: 'Combat.forge', temperature: 6 });
const white = () => ({ ...ready(), temperature: 0, whiteUsed: true, whiteTurns: 3,
    whiteLastTurnKey: 'Combat.forge:1:0' });

function actor(npc = true) {
    const props = { ...(npc ? { npc_nome: 'NPC', npc_vit_base: 5 } : { nome_slayer: 'Slayer', atr_vit_valor_config: 5 }),
        resp_slayer_display: 'resp_slayer_metal', [METAL_FORGE_KEY]: JSON.stringify(ready()),
        npc_pdr_gasto_valor: 3, pdr_slayer_gasto_valor: 4 };
    const updates = [];
    return { uuid: npc ? 'Actor.npc' : 'Actor.slayer', isOwner: true, system: { props }, updates,
        async update(patch) {
            updates.push(patch);
            for (const [path, value] of Object.entries(patch)) props[path.replace('system.props.', '')] = value;
        } };
}
function setup() {
    setupFoundryMocks();
    game.combat = { uuid: 'Combat.forge', started: true, round: 1, turn: 0 };
    foundry.applications.api.DialogV2.confirm = async () => true;
}

test('Forja Viva normaliza estado inválido sem mutar dados de origem', () => {
    assert.deepEqual(parseMetalForge('corrompido'), parseMetalForge(null));
    assert.deepEqual(parseMetalForge([]), parseMetalForge(null));
    const original = { temperature: 50, gained: { block: true }, whiteTurns: -2 };
    assert.equal(parseMetalForge(original).temperature, 6);
    assert.equal(original.temperature, 50);
    assert.equal(parseMetalForge({ whiteTurns: 9, temperature: 6 }).temperature, 0);
    assert.equal(parseMetalForge({ whiteTurns: 9 }).whiteTurns, 3);
});

test('Forja Viva concede cada um dos três gatilhos uma vez por rodada e limita a 6', () => {
    let state = event(null, { type: 'combatStart' }).state;
    const events = [{ type: 'defense', defenseType: 'bloqueio', success: true },
        { type: 'physicalSave', success: true }, { type: 'damageTaken', amount: 4, conscious: true }];
    for (const input of events) {
        state = event(state, input).state;
        state = event(state, input).state;
    }
    assert.equal(state.temperature, 3);
    for (const input of events) state = event(state, input, 2).state;
    assert.equal(state.temperature, 6);
    for (const input of events) state = event(state, input, 3).state;
    assert.equal(state.temperature, 6);
});

test('Forja Viva ignora falhas, Esquiva, dano zero e eventos fora de combate', () => {
    let state = event(null, { type: 'combatStart' }).state;
    for (const input of [{ type: 'defense', defenseType: 'bloqueio', success: false },
        { type: 'defense', defenseType: 'esquiva', success: true }, { type: 'physicalSave', success: false },
        { type: 'damageTaken', amount: 0, conscious: true }, { type: 'damageTaken', amount: 8 }]) {
        state = event(state, input).state;
    }
    assert.equal(state.temperature, 0);
    assert.equal(reduceMetalForge(ready(), { type: 'physicalSave', success: true }).state.temperature, 6);
    assert.equal(event(ready(), { type: 'damageTaken', amount: 8, conscious: false }).state.temperature, 0);
    assert.equal(event(ready(), { type: 'statusApplied', condition: 'inconsciente' }).state.temperature, 0);
});

test('limiares de Bloqueio substituem anteriores e Metal Branco mantém +3', () => {
    for (let temperature = 0; temperature <= 6; temperature++) {
        const props = { resp_slayer_display: 'resp_slayer_metal', [METAL_FORGE_KEY]: { temperature } };
        assert.equal(metalForgeBonuses(props).bloqueio, Math.floor(temperature / 2));
    }
    const bonuses = metalForgeBonuses({ npc_nome: 'NPC', npc_vit_base: 5,
        resp_slayer_display: 'resp_slayer_metal', [METAL_FORGE_KEY]: white() });
    assert.equal(bonuses.bloqueio, 3);
    assert.equal(bonuses.concussionResistance, true);
    assert.deepEqual(bonuses.physicalImmunities, ['derrubado', 'restricao_movimentos']);
    assert.deepEqual(bonuses.physicalSaveAdvantage, ['fratura', 'atordoamento']);
    assert.equal(bonuses.firstHitDamageFormula, '1d8');
    assert.equal(bonuses.reflectionDamage, 5);
    assert.equal(metalForgeBonuses({ [METAL_FORGE_KEY]: white() }).bloqueio, 0);
});

test('Metal Branco usa apenas o primeiro acerto do turno e a primeira reflexão da rodada', () => {
    let state = white();
    const first = event(state, { type: 'hit', success: true });
    assert.deepEqual(first.bonusDamage, { formula: '1d8', types: ['concussao'], source: 'Metal Branco' });
    assert.equal(event(first.state, { type: 'hit', success: true }).bonusDamage, null);
    assert.equal(event(first.state, { type: 'hit', success: false }, 2).bonusDamage, null);
    assert.ok(event(first.state, { type: 'hit', success: true }, 2).bonusDamage);
    state = first.state;
    const block = { type: 'defense', defenseType: 'bloqueio', success: true, melee: true, targetUuid: 'Actor.enemy' };
    const reflected = event(state, block);
    assert.equal(reflected.reflectionDamage, 5);
    assert.equal(reflected.reflectionTargetUuid, 'Actor.enemy');
    assert.equal(event(reflected.state, block).reflectionDamage, 0);
    assert.equal(event(reflected.state, block, 2).reflectionDamage, 5);
    assert.equal(event(state, { ...block, melee: false }).reflectionDamage, 0);
    assert.equal(event(state, { ...block, success: false }).reflectionDamage, 0);
    assert.equal(event(state, { ...block, targetUuid: '' }).reflectionDamage, 0);
    assert.equal(event(state, { type: 'physicalSave', success: true }).state.temperature, 0);
});

test('Metal Branco dura ativação e dois próximos turnos e emite Exaustão uma vez', () => {
    let result = event(white(), { type: 'turnStart' });
    assert.equal(result.state.whiteTurns, 3);
    result = event(result.state, { type: 'turnStart' }, 2);
    assert.equal(result.state.whiteTurns, 2);
    result = event(result.state, { type: 'turnStart' }, 2);
    assert.equal(result.state.whiteTurns, 2);
    result = event(result.state, { type: 'turnStart' }, 3);
    assert.equal(result.state.whiteTurns, 1);
    result = event(result.state, { type: 'turnStart' }, 4);
    assert.equal(result.state.whiteTurns, 0);
    assert.equal(result.exhaustionGain, 1);
    assert.equal(event(result.state, { type: 'turnStart' }, 4).exhaustionGain, 0);
    assert.equal(result.state.whiteUsed, true);
});

test('fim e troca de combate limpam estado e encerram Metal Branco com custo único', () => {
    const ended = event(white(), { type: 'combatEnd' });
    assert.equal(ended.exhaustionGain, 1);
    assert.deepEqual(ended.state, parseMetalForge(null));
    assert.equal(event(ended.state, { type: 'combatEnd' }).exhaustionGain, 0);
    const next = reduceMetalForge(white(), { type: 'combatStart' }, { ...context(), combatId: 'Combat.next' });
    assert.equal(next.state.combatId, 'Combat.next');
    assert.equal(next.state.whiteUsed, false);
    assert.equal(next.state.temperature, 0);
    assert.equal(next.exhaustionGain, 1);
});

test('ativação atômica consome Ação Única e 6 Temperatura no NPC e Slayer sem PDR', async () => {
    setup();
    for (const npc of [true, false]) {
        const user = actor(npc);
        const result = await activateMetalForge(user);
        assert.equal(result.ok, true);
        assert.equal(user.updates.length, 1);
        assert.equal(JSON.parse(user.system.props.acoes_slayer_dados).round.unica, 1);
        assert.equal(result.state.temperature, 0);
        assert.equal(result.state.whiteTurns, 3);
        assert.equal(result.state.whiteUsed, true);
        assert.equal(user.system.props.npc_pdr_gasto_valor, 3);
        assert.equal(user.system.props.pdr_slayer_gasto_valor, 4);
        assert.equal((await activateMetalForge(user)).ok, false);
    }
});

test('cancelamento, ação indisponível, requisito e permissão negados não consomem recursos', async () => {
    setup();
    const user = actor();
    const initial = JSON.stringify(user.system.props);
    foundry.applications.api.DialogV2.confirm = async () => false;
    assert.equal((await activateMetalForge(user)).cancelled, true);
    assert.equal(JSON.stringify(user.system.props), initial);
    foundry.applications.api.DialogV2.confirm = async () => true;
    user.system.props.acoes_slayer_dados = JSON.stringify({ round: { unica: 1 } });
    assert.equal((await activateMetalForge(user)).ok, false);
    assert.equal(user.updates.length, 0);
    user.isOwner = false;
    assert.equal((await activateMetalForge(user)).ok, false);
    user.isOwner = true;
    game.combat.started = false;
    assert.equal((await activateMetalForge(user)).ok, false);
    game.combat.started = true;
    user.system.props.resp_slayer_display = 'resp_slayer_agua';
    assert.equal((await activateMetalForge(user)).ok, false);
    assert.equal(user.updates.length, 0);
});

test('ativação revalida Temperatura, combate e permissão depois da confirmação', async () => {
    setup();
    for (const change of [user => { user.system.props[METAL_FORGE_KEY] = JSON.stringify({ ...ready(), temperature: 5 }); },
        () => { game.combat.uuid = 'Combat.other'; }, user => { user.isOwner = false; }]) {
        const user = actor();
        game.combat.uuid = 'Combat.forge';
        foundry.applications.api.DialogV2.confirm = async () => { change(user); return true; };
        assert.equal((await activateMetalForge(user)).ok, false);
        assert.equal(user.updates.length, 0);
    }
});

test('ativação simultânea confirma e consome uma vez e falha de persistência libera lock', async () => {
    setup();
    const user = actor();
    let release;
    let confirmations = 0;
    foundry.applications.api.DialogV2.confirm = () => {
        confirmations++;
        return new Promise(resolve => { release = resolve; });
    };
    const first = activateMetalForge(user);
    assert.equal((await activateMetalForge(user)).ok, false);
    release(true);
    assert.equal((await first).ok, true);
    assert.equal(confirmations, 1);
    assert.equal(user.updates.length, 1);
    const failed = actor(false);
    failed.update = async () => { throw new Error('persistência'); };
    await assert.rejects(activateMetalForge(failed, { confirm: false }), /persistência/);
    failed.update = async () => {};
    assert.equal((await activateMetalForge(failed, { confirm: false })).ok, true);
});

test('gerenciador fecha sem alterações e oferece ativação com custo explícito', async () => {
    setup();
    const user = actor();
    foundry.applications.api.DialogV2.wait = async ({ content, buttons }) => {
        assert.match(content, /Temperatura 6\/6/);
        assert.match(content, /Ação Única/);
        return buttons.find(button => button.action === 'close').callback();
    };
    assert.equal((await openMetalForgeManager(user)).cancelled, true);
    assert.equal(user.updates.length, 0);
    foundry.applications.api.DialogV2.wait = async ({ buttons }) => buttons.find(button => button.action === 'activate').callback();
    foundry.applications.api.DialogV2.confirm = async () => { throw new Error('Não deve confirmar duas vezes'); };
    assert.equal((await openMetalForgeManager(user)).ok, true);
});
