import assert from 'node:assert/strict';
import test from 'node:test';
import { setupFoundryMocks } from './fixtures/foundry-mock.mjs';
import { rollHit } from '../scripts/hit-service.mjs';
import { rollDamage } from '../scripts/damage-service.mjs';
import { attemptSnowRestrictionEscape } from '../scripts/breath-service.mjs';
import { applyOniDamage } from '../scripts/damage-relay.mjs';
import { getStatusCapabilities } from '../scripts/status-effects.mjs';

function mutableActor(id, props = {}) {
    const flags = {};
    return { id, uuid: `Actor.${id}`, name: id, isOwner: true, items: [],
        system: { props: { npc_nome: id, npc_nivel: 8, npc_pdv_base: 30, npc_pdr_base: 15,
            npc_dex_base: 3, npc_for_base: 2, npc_car_base: 3, acerto_label: 'acerto_label_dex', ...props } },
        getFlag: (_module, key) => flags[key],
        setFlag: async (_module, key, value) => { flags[key] = value; },
        unsetFlag: async (_module, key) => { delete flags[key]; },
        async update(patch) {
            for (const [path, value] of Object.entries(patch)) this.system.props[path.replace('system.props.', '')] = value;
        },
    };
}

function setup({ recovery = '', restrict = false, five = false } = {}) {
    setupFoundryMocks();
    game.user.isGM = true;
    ChatMessage.create = async data => data;
    Roll.create = () => ({ evaluate: async () => ({ total: 12,
        dice: [{ results: [{ result: 10, active: true }] }], toMessage: async () => ({ id: 'roll' }) }) });
    const target = mutableActor('target');
    const actor = mutableActor('snow', {
        npc_pdv_dano: 10, npc_pdv_curado: 3, npc_pdr_gasto_valor: 5,
        pdv_slayer_curado: 99, pdr_slayer_gasto_valor: 99,
        resp_neve_estado: JSON.stringify({
            nextHit: { source: 'neve_01' }, pendingDamage: { freezeOnHit: 1 },
            freezeByTarget: { [target.uuid]: five ? 4 : 0 }, cooldowns: { neve_07: 2 },
            belowZero: { freezeRecovery: true },
        }),
    });
    globalThis.fromUuid = async uuid => uuid === actor.uuid ? actor : uuid === target.uuid ? target : null;
    game.user.targets = new Set([{ actor: target }]);
    foundry.applications.api.DialogV2.confirm = async () => restrict;
    foundry.applications.api.DialogV2.wait = async config => {
        if (config.window.title === 'Acerto') return { mode: 'normal', rollMode: 'publicroll',
            bonusRaw: '', cdVal: 0, rollCount: 1, actionType: 'ataque' };
        if (config.window.title.startsWith('Confirmar Acerto')) return { hit: true, continue: false };
        if (config.window.title.startsWith('Roku no Kata')) return recovery;
        if (config.window.title === 'Autorizar dano no inimigo')
            return config.buttons.find(button => button.action === 'approve').callback(null, null, {
                element: { querySelector: () => ({ value: 'normal' }),
                    querySelectorAll: () => [{ value: 'cortante' }] },
            });
        return { pdrGasto: 0, entradas: [{ dado: '1d6', tipoAcao: 'ataque', selTiposDano: ['cortante'] }] };
    };
    return { actor, target };
}

for (const recovery of ['pdv', 'pdr']) {
    test(`Abaixo de Zero recupera ${recovery.toUpperCase()} exclusivamente no recurso nativo do NPC`, async () => {
        const { actor } = setup({ recovery });
        const result = await rollHit({ actor, autoDamage: false });
        assert.equal(result.hits, 1);
        assert.equal(actor.system.props.npc_pdv_curado, recovery === 'pdv' ? 5 : 3);
        assert.equal(actor.system.props.npc_pdr_gasto_valor, recovery === 'pdr' ? 4 : 5);
        assert.equal(actor.system.props.pdv_slayer_curado, 99);
        assert.equal(actor.system.props.pdr_slayer_gasto_valor, 99);
    });
}

test('Congelar bloqueia movimento e dano libera o alvo sem apagar o estado do usuário da Neve', async () => {
    const { actor, target } = setup({ five: true, restrict: true });
    await rollHit({ actor, autoDamage: false });
    assert.equal(getStatusCapabilities(target.system.props).movementAllowed, false);
    assert.equal(target.getFlag('', 'snowRestriction').sourceActorUuid, actor.uuid);
    await rollDamage({ actor, nome: 'Golpe', skipActionConsumption: true,
        entradas: [{ dado: '1d6', tipoAcao: 'ataque', tiposDano: ['cortante'] }] });
    assert.equal(target.getFlag('', 'snowRestriction'), undefined);
    assert.equal(getStatusCapabilities(target.system.props).movementAllowed, true);
    const state = JSON.parse(actor.system.props.resp_neve_estado);
    assert.equal(state.restrictedTarget, undefined);
    assert.equal(state.freezeByTarget[target.uuid], 5);
    assert.deepEqual(state.cooldowns, { neve_07: 2 });
    assert.equal(state.belowZero.freezeRecovery, true);
});

test('escapar de Congelar remove a restrição e cobra a Ação de Ataque do NPC', async () => {
    const { actor, target } = setup({ five: true, restrict: true });
    await rollHit({ actor, autoDamage: false });
    const outcome = await attemptSnowRestrictionEscape({ actorUuid: target.uuid });
    assert.equal(outcome.escaped, true);
    assert.equal(getStatusCapabilities(target.system.props).movementAllowed, true);
    assert.equal(target.getFlag('', 'snowRestriction'), undefined);
    assert.equal(JSON.parse(target.system.props.acoes_slayer_dados).turn.ataque, 1);
    assert.deepEqual(JSON.parse(actor.system.props.resp_neve_estado).cooldowns, { neve_07: 2 });
});

test('dano integralmente resistido preserva a restrição de Congelar', async () => {
    const { actor, target } = setup({ five: true, restrict: true });
    await rollHit({ actor, autoDamage: false });
    foundry.applications.api.DialogV2.wait = async config =>
        config.buttons.find(button => button.action === 'approve').callback(null, null, {
            element: { querySelector: () => ({ value: 'resisted' }),
                querySelectorAll: () => [{ value: 'cortante' }] },
        });
    const result = await applyOniDamage(target, 1, { damageTypes: ['cortante'], requireApproval: true });
    assert.equal(result.appliedDamage, 0);
    assert.ok(target.getFlag('', 'snowRestriction'));
    assert.equal(getStatusCapabilities(target.system.props).movementAllowed, false);
});

test('o dono do alvo aplica dano e encerra Congelar sem editar o outro Actor', async () => {
    const { actor: source, target } = setup({ five: true, restrict: true });
    await rollHit({ actor: source, autoDamage: false });
    game.user.isGM = false;
    source.isOwner = false;
    source.update = async () => assert.fail('o jogador não pode editar a origem de Congelar');

    const result = await applyOniDamage(target, 4, { damageTypes: ['cortante'] });
    assert.equal(result.appliedDamage, 4);
    assert.equal(target.system.props.npc_pdv_dano, 4);
    assert.equal(target.getFlag('', 'snowRestriction'), undefined);
    assert.equal(getStatusCapabilities(target.system.props).movementAllowed, true);
});
