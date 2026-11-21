import assert from 'node:assert/strict';
import test from 'node:test';
import { applyOniDamage } from '../scripts/damage-relay.mjs';
import {
    companionGuardKey,
    companionResistance,
    companionSocialBonus,
    consumeCompanionCoordination,
    consumeCompanionGuard,
    offerCompanionInterception,
    openCompanionOniManager,
    pendingCompanionInterception,
    pendingCompanionCoordination,
    registerCoordinatedHit,
} from '../scripts/slayer/companion-oni-service.mjs';
import { MODULE_ID } from '../scripts/constants.mjs';
import { SETTINGS } from '../scripts/settings.mjs';
import { parseStatusState } from '../scripts/status-service.mjs';

function setup(t, { profile = 'homebrew', level = 4, distance = 3, owner = true, gm = true } = {}) {
    const actor = (name, props, flags = {}) => ({
        name, uuid: 'Actor.' + name, documentName: 'Actor', isOwner: owner, system: { props },
        getFlag: (_module, key) => flags[key],
        async setFlag(_module, key, value) { flags[key] = value; },
        async update(patch) {
            for (const [key, value] of Object.entries(patch)) {
                if (key.startsWith('system.props.')) props[key.slice('system.props.'.length)] = value;
                if (key.startsWith('flags.' + MODULE_ID + '.')) flags[key.slice(('flags.' + MODULE_ID + '.').length)] = value;
            }
        },
    });
    const slayer = actor('Slayer', {
        nome_slayer: 'Slayer', nvl_num: level,
        classe_escolhida: 'classe_companheiro_oni', na_vanilla_class: 'classe_companheiro_oni',
    }, { companionOni: { oniUuid: 'Actor.Oni', resistance: 'fogo' } });
    const oni = actor('Oni', { nome_oni: 'Oni', pdk_oni_total_conta: 5, pdk_oni_gasto_valor: 0 });
    const attacker = actor('Enemy', { npc_nome: 'Enemy' });
    const actors = [slayer, oni, attacker];
    const tokens = actors.map(a => ({ actor: a, center: { x: 1, y: 1 }, checkCollision: () => false }));
    const turns = actors.map((a, index) => ({ id: String(index), actor: a, token: { object: tokens[index] } }));
    const combat = { id: 'combat', started: true, round: 2, turn: 2, turns, combatants: turns };
    const state = {
        game: { actors, combat, user: { isGM: gm }, settings: { get: (_id, key) =>
            key === SETTINGS.rulesSelection ? JSON.stringify({ classes: profile }) : undefined } },
        canvas: { tokens: { placeables: tokens }, grid: { measurePath: () => ({ distance }) } },
        ui: { notifications: { warn() {}, info() {} } },
        foundry: { applications: { api: { DialogV2: { wait: async () => 'Bloqueio' } } } },
        fromUuid: async uuid => actors.find(a => a.uuid === uuid),
        ChatMessage: { getSpeaker: () => ({}), create: async () => {} },
    };
    const previous = Object.fromEntries(Object.keys(state).map(key => [key, globalThis[key]]));
    Object.assign(globalThis, state);
    t.after(() => Object.assign(globalThis, previous));
    return { slayer, oni, attacker, combat, tokens };
}

test('Cercar & Proteger gasta uma Reação e 2 PDK e desvia apenas o acerto autorizado', async t => {
    const { slayer, oni, attacker, combat } = setup(t);
    const result = await offerCompanionInterception(slayer, {
        attackerUuid: attacker.uuid, dc: 19,
        async rollDefense(actor, type, dc, modifier) {
            assert.deepEqual([actor.uuid, type, dc, modifier], [oni.uuid, 'Bloqueio', 19, -2]);
            return { success: true };
        },
    });
    assert.equal(result.success, true);
    assert.equal(oni.system.props.pdk_oni_gasto_valor, 2);
    assert.equal(JSON.parse(oni.system.props.acoes_oni_dados).round.reacao, 1);
    const context = { isAttack: true, hostile: true, sourceActorUuid: attacker.uuid };
    assert.ok(pendingCompanionInterception(slayer, context));
    assert.equal(pendingCompanionInterception(slayer, { ...context, hostile: false }), null);
    assert.equal(pendingCompanionInterception(slayer, { ...context, sourceActorUuid: 'Actor.wrong' }), null);
    assert.equal(pendingCompanionInterception(slayer, { ...context, attackTotal: 20 }), null);
    const damage = { ...context, companionSlayerUuid: slayer.uuid, attackTotal: 19 };
    const applied = await applyOniDamage(oni, 7, damage);
    assert.equal(applied.appliedDamage, 7);
    assert.equal(oni.system.props.pdv_oni_dano_tomado, 7);
    assert.equal(pendingCompanionInterception(slayer, context), null);
    await assert.rejects(applyOniDamage(oni, 7, damage), /não está mais disponível/);
    combat.turn = 0;
    assert.equal(await offerCompanionInterception(slayer, {
        attackerUuid: attacker.uuid, dc: 19, rollDefense: assert.fail,
    }), null);
});

test('Vanilla mantém guarda base, sem penalidade no Rank B nem penalidade futura Homebrew', async t => {
    const { slayer, oni, attacker } = setup(t, { profile: 'vanilla', level: 6 });
    const result = await offerCompanionInterception(slayer, {
        attackerUuid: attacker.uuid, dc: 20,
        rollDefense: async (_actor, _test, _dc, modifier) => {
            assert.equal(modifier, 0);
            return { success: false };
        },
    });
    assert.equal(result.success, false);
    assert.equal(oni.system.props.pdk_oni_gasto_valor, 2);
    assert.equal(companionGuardKey(attacker, slayer), '');
    assert.equal(pendingCompanionInterception(slayer, {
        isAttack: true, hostile: true, sourceActorUuid: attacker.uuid,
    }), null);
});

test('Guarda Vinculada penaliza um só Acerto e Resistência Elemental reduz apenas o dano do seu tipo', async t => {
    const { slayer, oni, attacker } = setup(t, { level: 8 });
    assert.equal(companionResistance(oni), 'fogo');
    await offerCompanionInterception(slayer, {
        attackerUuid: attacker.uuid, dc: 20, rollDefense: async () => ({ success: true }),
    });
    const applied = await applyOniDamage(oni, 11, {
        isAttack: true, hostile: true, sourceActorUuid: attacker.uuid, companionSlayerUuid: slayer.uuid,
        components: [{ subtotal: 5, types: ['fogo'] }, { subtotal: 6, types: ['cortante'] }],
    });
    assert.equal(applied.appliedDamage, 8);
    const key = companionGuardKey(attacker, slayer);
    assert.ok(key);
    await consumeCompanionGuard(attacker, slayer, key);
    assert.equal(companionGuardKey(attacker, slayer), '');
});

test('distância, barreira, permissões e cancelamento impedem cobrança da interceptação', async t => {
    const { slayer, oni, attacker, tokens } = setup(t, { owner: false, gm: false });
    const options = { attackerUuid: attacker.uuid, dc: 17, rollDefense: assert.fail };
    assert.equal(await openCompanionOniManager({ actor: slayer }), undefined);
    assert.equal(await offerCompanionInterception(slayer, options), null);
    game.user.isGM = true;
    tokens[1].checkCollision = () => true;
    assert.equal(await offerCompanionInterception(slayer, options), null);
    tokens[1].checkCollision = () => false;
    canvas.grid.measurePath = () => ({ distance: 3.1 });
    assert.equal(await offerCompanionInterception(slayer, options), null);
    canvas.grid.measurePath = () => ({ distance: 3 });
    foundry.applications.api.DialogV2.wait = async () => null;
    assert.equal(await offerCompanionInterception(slayer, options), null);
    assert.equal(oni.system.props.pdk_oni_gasto_valor, 0);
});

test('Presença Intimidadora só oferece CAR social com o Oni presente fora de combate', t => {
    const { slayer, combat, tokens } = setup(t, { level: 11 });
    assert.equal(companionSocialBonus(slayer), 0);
    combat.started = false;
    assert.equal(companionSocialBonus(slayer), 2);
    tokens.splice(1, 1);
    assert.equal(companionSocialBonus(slayer), 0);
});

test('Oni com token desvinculado gasta os recursos do token e não da ficha base', async t => {
    const { slayer, oni, attacker, tokens, combat } = setup(t);
    const flags = {};
    const props = { ...oni.system.props };
    const tokenActor = {
        ...oni, uuid: 'Scene.s.Token.t.Actor.Oni', isToken: true,
        token: { baseActor: oni }, system: { props },
        getFlag: (_module, key) => flags[key],
        async update(patch) {
            props.pdk_oni_gasto_valor = patch['system.props.pdk_oni_gasto_valor'];
            flags.companionOniGuard = patch['flags.' + MODULE_ID + '.companionOniGuard'];
        },
    };
    tokens[1].actor = tokenActor;
    combat.combatants[1].actor = tokenActor;
    const result = await offerCompanionInterception(slayer, {
        attackerUuid: attacker.uuid, dc: 18,
        rollDefense: async (interceptor) => {
            assert.equal(interceptor, tokenActor);
            return { success: true };
        },
    });
    assert.equal(result.oni, tokenActor);
    assert.equal(props.pdk_oni_gasto_valor, 2);
    assert.equal(oni.system.props.pdk_oni_gasto_valor, 0);
});

test('Ataque Coordenado exige o mesmo alvo antes do novo turno do Oni e gasta a Abertura uma vez', async t => {
    const { slayer, oni, attacker, combat } = setup(t, { level: 12 });
    const { DialogV2 } = foundry.applications.api;
    let prompts = 0;
    DialogV2.wait = async () => { prompts++; return { mode: 'opening' }; };
    await registerCoordinatedHit(slayer, attacker, { breathing: true });
    assert.equal(prompts, 0);
    await registerCoordinatedHit(oni, attacker);
    combat.round += 1;
    await registerCoordinatedHit(slayer, attacker, { breathing: true });
    assert.equal(prompts, 0, 'O primeiro acerto expirou no turno do Oni');
    await registerCoordinatedHit(oni, attacker);
    await registerCoordinatedHit(slayer, attacker, { breathing: false });
    assert.equal(prompts, 0);
    await registerCoordinatedHit(slayer, attacker, { breathing: true });
    await registerCoordinatedHit(slayer, attacker, { breathing: true });
    assert.equal(prompts, 1);
    const opening = pendingCompanionCoordination('opening', oni, attacker.uuid);
    assert.ok(opening);
    assert.equal(pendingCompanionCoordination('opening', oni, 'Actor.other'), '');
    await consumeCompanionCoordination(oni, opening);
    assert.equal(pendingCompanionCoordination('opening', oni, attacker.uuid), '');
});

test('Rastro de Sangue estende o efeito selecionado uma vez e preserva a marca na leitura', async t => {
    const { slayer, oni, attacker, combat } = setup(t, { level: 12 });
    const { DialogV2 } = foundry.applications.api;
    attacker.system.props.status_slayer_dados = JSON.stringify({
        active: ['sangramento'], effects: { sangramento: { damageFormula: '1d4', remainingTurns: 2 } },
    });
    DialogV2.wait = async config => {
        assert.ok(config.buttons.some(button => button.action === 'trail'));
        return { mode: 'trail', effect: 'sangramento' };
    };
    await registerCoordinatedHit(oni, attacker);
    await registerCoordinatedHit(slayer, attacker, { breathing: true });
    const read = () => parseStatusState(attacker.system.props.status_slayer_dados).effects.sangramento;
    assert.equal(read().remainingTurns, 3);
    assert.equal(read().companionExtended, true);
    combat.round += 1;
    DialogV2.wait = async config => {
        assert.ok(config.buttons.every(button => button.action !== 'trail'));
        return { mode: 'pressure' };
    };
    await registerCoordinatedHit(oni, attacker);
    await registerCoordinatedHit(slayer, attacker, { breathing: true });
    const pressure = pendingCompanionCoordination('pressure', attacker, slayer.uuid);
    assert.ok(pressure);
    assert.equal(pendingCompanionCoordination('pressure', attacker, 'Actor.outro'), '');
    await consumeCompanionCoordination(attacker, pressure);
    assert.equal(pendingCompanionCoordination('pressure', attacker, oni.uuid), '');
});
