import test from 'node:test';
import assert from 'node:assert/strict';
import { setupFoundryMocks } from './fixtures/foundry-mock.mjs';
import { flameEmberFormula, flameFormById, flameWeaponTier } from '../scripts/flame-breathing-data.mjs';
import { FLAME_HEAT_FLAG, FLAME_EMBER_TURN_FLAG, buildFlameBreathingPlan, flameStatePatch,
    parseFlameBreathingState, processFlameEmbers } from '../scripts/flame-breathing-service.mjs';
import { registerBreathingEngine } from '../scripts/breath-service.mjs';
import { rollDamage } from '../scripts/damage-service.mjs';

function npc(props = {}, flags = {}) {
    const actor = { id: 'npc', uuid: 'Actor.npc', name: 'NPC', isOwner: true, documentName: 'Actor',
        system: { props: { npc_nome: 'NPC', npc_pdv_base: 200, npc_pdv_dano: 0, ...props } }, items: [],
        getFlag(_scope, key) { return flags[key]; }, async setFlag(_scope, key, value) { flags[key] = value; },
        async unsetFlag(_scope, key) { delete flags[key]; }, async update(patch) {
            for (const [path, value] of Object.entries(patch)) actor.system.props[path.slice('system.props.'.length)] = value;
        } };
    return actor;
}

function setup() {
    setupFoundryMocks();
    game.user = { id: 'gm', isGM: true, targets: new Set() };
    game.users = [{ id: 'gm', isGM: true, active: true }];
    ChatMessage.create = async value => value;
    Roll.create = () => ({ async evaluate() { return { total: 12, async toMessage() {} }; } });
}

test('sete patamares atuais de Fogo Fátuo e Brasas substituem os anteriores', () => {
    for (const [heat, hit, weaponDamage, techniqueDie, ember] of [
        [5, 1, 2, '', '4d10'], [10, 2, 3, '', '6d10'], [20, 3, 4, '', '10d10'],
        [30, 4, 5, '1d10', '14d10'], [40, 5, 6, '2d10', '18d10'],
        [50, 6, 7, '3d10', '24d10'], [60, 7, 8, '', '30d10'],
    ]) {
        const tier = flameWeaponTier(heat);
        assert.deepEqual([tier.hit, tier.weaponDamage, tier.techniqueDie], [hit, weaponDamage, techniqueDie]);
        assert.equal(flameEmberFormula(heat), ember);
    }
    assert.equal(flameEmberFormula(4), '');
    assert.match(flameStatePatch({ weaponHeat: 60 })['system.props.resp_chamas_resumo'], /Dano ×2/);
    for (const [id, weapon, additionalEmbers] of [
        ['chamas_02', 7, 0], ['chamas_03', 9, 6], ['chamas_04', 7, 0],
        ['chamas_05', 11, 8], ['chamas_06', 13, 10], ['chamas_07', 3, 2],
        ['chamas_08', 8, 0], ['chamas_09', 15, 12],
    ]) {
        assert.equal(flameFormById(id).weaponHeat, weapon);
        assert.equal(flameFormById(id).enemyHeat, additionalEmbers);
    }
    const immediate = buildFlameBreathingPlan('chamas_03', 1, { resp_chamas_estado: '{"weaponHeat":2}' });
    assert.equal(immediate.state.nextHit.bonus, 2, 'ganho da própria Forma já libera o bônus de Acerto');
});

test('Brasas rolam somente o maior patamar uma vez no turno e gravam dano nativoNPC', async () => {
    setup();
    for (const [heat, formula] of [[5, '4d10'], [10, '6d10'], [20, '10d10'], [30, '14d10'],
        [40, '18d10'], [50, '24d10'], [60, '30d10']]) {
        const formulas = [];
        Roll.create = value => ({ async evaluate() {
            formulas.push(value);
            return { total: 12, async toMessage() {} };
        } });
        const actor = npc({}, { [FLAME_HEAT_FLAG]: { source: { heat }, weaker: { heat: 5 } } });
        const results = await Promise.all([processFlameEmbers(actor, { turnKey: 'c:1:0' }), processFlameEmbers(actor, { turnKey: 'c:1:0' })]);
        assert.equal(results.filter(result => result.applied).length, 1);
        assert.deepEqual(formulas, [formula]);
        assert.equal(actor.system.props.npc_pdv_dano, 12);
        assert.equal(actor.system.props.pdv_slayer_dano_tomado, undefined);
        assert.equal(actor.system.props.pdv_oni_dano_tomado, undefined);
        assert.equal(actor.getFlag(null, FLAME_EMBER_TURN_FLAG), 'c:1:0');
        assert.equal((await processFlameEmbers(actor, { turnKey: 'c:1:0' })).duplicate, true);
        await processFlameEmbers(actor, { turnKey: 'c:2:0' });
        assert.equal(actor.system.props.npc_pdv_dano, 24);
    }
});

test('60 Fogo Fátuo causa2Concussão noNPC no início do turno e fimcombate limpa todos os estados', async () => {
    setup();
    const callbacks = new Map();
    globalThis.Hooks = { on(name, callback) { callbacks.set(name, [...(callbacks.get(name) ?? []), callback]); } };
    const flags = { [FLAME_HEAT_FLAG]: { enemy: { heat: 60 } }, flameEmberTurn: 'prior',
        flameInterception: { interceptorUuid: 'Actor.other' }, flameBlockPenalty: { turns: 2 } };
    const actor = npc({ resp_chamas_estado: JSON.stringify({ weaponHeat: 60, pendingEffects: [{ id: 'queued' }] }) }, flags);
    let complete;
    const finished = new Promise(resolve => { complete = resolve; });
    const setFlag = actor.setFlag;
    actor.setFlag = async (...args) => { await setFlag(...args); if (args[1] === 'flameSelfTurn') complete(); };
    registerBreathingEngine();
    const combat = { id: 'c', round: 2, turn: 0, combatant: { actor }, combatants: [{ actor }] };
    for (const callback of callbacks.get('updateCombat')) callback(combat, { round: 2 });
    for (const callback of callbacks.get('updateCombat')) callback(combat, { turn: 0 });
    await finished;
    assert.equal(actor.system.props.npc_pdv_dano, 2);
    assert.equal(actor.system.props.pdv_slayer_dano_tomado, undefined);
    for (const callback of callbacks.get('combatEnd')) await callback(combat);
    assert.equal(parseFlameBreathingState(actor.system.props.resp_chamas_estado).weaponHeat, 0);
    assert.equal(parseFlameBreathingState(actor.system.props.resp_chamas_estado).pendingEffects, undefined);
    for (const flag of [FLAME_HEAT_FLAG, FLAME_EMBER_TURN_FLAG, 'flameSelfTurn', 'flameInterception', 'flameBlockPenalty'])
        assert.equal(actor.getFlag(null, flag), undefined);
});

test('Fogo Fátuo60 duplicaAtaquePadrão preservando tipos e não vaza para arma fria', async () => {
    setup();
    ui.notifications.warn = message => { throw new Error(message); };
    ui.notifications.error = message => { throw new Error(message); };
    const messages = [];
    ChatMessage.create = async value => { messages.push(value); return value; };
    const actor = npc({ resp_slayer_display: 'resp_slayer_chamas',
        resp_chamas_estado: JSON.stringify({ weaponHeat: 60, synchronizedWeapon: { id: 'hot' }, weaponHeatById: { hot: 60 } }) });
    const target = npc();
    target.uuid = 'Actor.target';
    target.id = 'target';
    game.user.targets = new Set([{ actor: target }]);
    foundry.applications.api.DialogV2.wait = async config => {
        if (config.window.title === 'Autorizar dano no inimigo')
            return config.buttons.find(button => button.action === 'approve').callback(null, null, {
                element: { querySelector: () => ({ value: 'normal' }), querySelectorAll: () => [{ value: 'cortante' }] },
            });
        return { pdrGasto: 0, entradas: [{ dado: '1d8', tipoAcao: 'ataque', selTiposDano: ['cortante'] }] };
    };
    let result = await rollDamage({ actor, skipActionConsumption: true, weaponItem: { id: 'hot' } });
    assert.equal(result.finalDamage, 48, '12 de arma +12 do bônus fixo simulados, vezes2');
    const doubled = result.components.find(component => component.label.startsWith('Fogo Fátuo 60 +100%'));
    assert.deepEqual(doubled.types, ['cortante']);
    result = await rollDamage({ actor, skipActionConsumption: true, weaponItem: { id: 'cold' } });
    assert.equal(result.finalDamage, 12);
    assert.equal(result.components.some(component => component.label.startsWith('Fogo Fátuo')), false);
});
