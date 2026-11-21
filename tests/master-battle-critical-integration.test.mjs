import assert from 'node:assert/strict';
import test from 'node:test';

import { MASTER_BATTLE_BLEEDING, MODULE_ID } from '../scripts/constants.mjs';
import { applyOniDamage, registerDamageRelay } from '../scripts/damage-relay.mjs';
import { rollWeaponItem } from '../scripts/damage-service.mjs';
import { recoveryOutcome } from '../scripts/recovery-breathing-service.mjs';
import { restEligibleStatuses } from '../scripts/rest-service.mjs';
import { processActorStatusTiming } from '../scripts/status-engine.mjs';
import { openStatusManager, parseStatusState } from '../scripts/status-service.mjs';
import { setupFoundryMocks } from './fixtures/foundry-mock.mjs';

const injuryKey = 'masterBattleTacticalInjury';

function actor(id, props) {
    const flags = {};
    const items = [];
    items.get = id => items.find(item => item.id === id);
    return {
        id, uuid: `Actor.${id}`, documentName: 'Actor', name: id, items, isOwner: true, system: { props },
        getFlag: (_scope, name) => flags[name],
        async update(patch) {
            for (const [path, value] of Object.entries(patch)) {
                if (path.startsWith(`flags.${MODULE_ID}.`)) flags[path.split('.').at(-1)] = value;
                if (path.startsWith('system.props.')) props[path.slice('system.props.'.length)] = value;
            }
        },
    };
}

function setup({ vanilla = false, proficient = true, minion = false } = {}) {
    setupFoundryMocks();
    const source = actor('master', {
        nome_slayer: 'Mestre', nvl_num: 8, for_display: 9, dex_display: 5,
        armas_proficientes: proficient ? 'Katana' : 'Outra arma',
        [vanilla ? 'na_vanilla_class' : 'classe_escolhida']: 'classe_mb',
    });
    const weapon = {
        id: 'sword', name: 'Katana', parent: source,
        system: { props: {
            arma_nome: 'Katana', arma_categoria: 'basica', arma_tipos_dano: 'cortante',
            arma_perfis_ataque: [{ nome: 'Base', dano_fixo: 5, atributos: [], tipos_dano: ['cortante'] }],
        } },
    };
    source.items.push(weapon);
    const target = actor('target', minion ? { oni_minion_pdv_base: 100, oni_minion_pdv_dano: 0 } :
        { nome_slayer: 'Alvo', pdv_slayer_total_conta: 100, pdv_slayer_dano_tomado: 0 });
    game.user.isGM = true;
    game.user.targets = new Set([{ actor: target }]);
    game.combat = { uuid: 'Combat.test', started: true, round: 2, turn: 0, turns: [{ actor: source }, { actor: target }] };
    game.settings = { get: (_module, key) => key === 'rulesSelection' && vanilla ? '{"classes":"vanilla"}' : undefined };
    globalThis.fromUuid = async uuid => [source, target].find(entry => entry.uuid === uuid) ?? null;
    ChatMessage.create = async data => data;
    Roll.create = formula => ({ evaluate: async () => ({
        total: formula === '1d4' ? 3 : formula === '1d6' ? 4 : Number(formula), toMessage: async () => {},
    }) });
    return { source, weapon, target };
}

function chooseCritical(injury, attribute = 'DEX') {
    const titles = [];
    foundry.applications.api.DialogV2.wait = async config => {
        const title = config.window.title;
        titles.push(title);
        if (title === 'Crítico Brutal') {
            return config.buttons.find(button => button.action === 'confirm').callback(null, {
                form: { elements: { attribute: { value: attribute }, injury: injury && { value: injury } } },
            });
        }
        assert.match(title, /Rolar Dano/);
        return { critical: true, entradas: [{ fixo: 5, tipoAcao: 'ataque', selTiposDano: ['cortante'], selAttrs: [] }] };
    };
    return titles;
}

function criticalDamage(item, classBasicAttack = true, critical = true) {
    return rollWeaponItem({ item, classBasicAttack, critical, skipActionConsumption: true });
}

function statusOf(target) {
    const props = target.system.props;
    return parseStatusState(props.status_slayer_dados ?? props.status_oni_dados);
}

test('dano de arma crítico confirmado soma Impacto uma vez e renova 1d4 separado do Sangramento alheio', async () => {
    const { weapon, target } = setup();
    target.system.props.status_slayer_dados = JSON.stringify({ active: ['sangramento'], effects: {
        sangramento: { damageFormula: '1d6', sourceName: 'Outra técnica', remainingTurns: 5 },
    } });
    chooseCritical('deep-impact');
    const result = await criticalDamage(weapon);
    assert.equal(result.finalDamage, 20);
    assert.equal(result.components.find(component => component.label === 'Impacto Profundo').subtotal, 2);
    assert.equal(target.system.props.pdv_slayer_dano_tomado, 20);
    let state = statusOf(target);
    assert.equal(state.effects[MASTER_BATTLE_BLEEDING].damageFormula, '1d4');
    assert.equal(state.effects[MASTER_BATTLE_BLEEDING].remainingTurns, 3);
    assert.equal(state.effects.sangramento.remainingTurns, 5);
    await processActorStatusTiming(target, 'start');
    assert.equal(target.system.props.pdv_slayer_dano_tomado, 27);
    state = statusOf(target);
    assert.equal(state.effects[MASTER_BATTLE_BLEEDING].remainingTurns, 2);
    assert.equal(state.effects.sangramento.remainingTurns, 4);

    chooseCritical('open-guard', 'FOR');
    await criticalDamage(weapon);
    state = statusOf(target);
    assert.equal(state.effects[MASTER_BATTLE_BLEEDING].damageFormula, '1d4');
    assert.equal(state.effects[MASTER_BATTLE_BLEEDING].remainingTurns, 5);
    assert.equal(state.effects.sangramento.damageFormula, '1d6');
    assert.equal(state.effects.sangramento.sourceName, 'Outra técnica');
    assert.equal(state.effects.sangramento.remainingTurns, 4);
    assert.deepEqual(target.getFlag(MODULE_ID, injuryKey), {
        id: 'open-guard', combatKey: 'Combat.test', sourceActorUuid: 'Actor.master', expiresAt: null,
    });
});

test('Vanilla pede o atributo e aplica Sangramento, com Ferimento Tático restrito ao Homebrew', async () => {
    const { weapon, target } = setup({ vanilla: true });
    const titles = chooseCritical('deep-impact');
    const result = await criticalDamage(weapon);
    assert.ok(titles.includes('Crítico Brutal'));
    assert.equal(result.finalDamage, 18);
    assert.equal(statusOf(target).effects[MASTER_BATTLE_BLEEDING].remainingTurns, 3);
    assert.equal(target.getFlag(MODULE_ID, injuryKey), undefined);
});

test('arma não proficiente, técnica e crítico marcado somente no diálogo de dano não oferecem Crítico Brutal', async () => {
    for (const testCase of [{ proficient: false }, { basic: false }, { hitCritical: false }]) {
        const { weapon, target } = setup(testCase);
        const titles = chooseCritical('deep-impact');
        await criticalDamage(weapon, testCase.basic ?? true, testCase.hitCritical ?? true);
        assert.equal(titles.includes('Crítico Brutal'), false);
        assert.equal(statusOf(target).effects[MASTER_BATTLE_BLEEDING], undefined);
    }
});

test('relay do GM confirma dano antes de gravar Crítico Brutal e Tendão no alvo real', async () => {
    const { source, weapon, target } = setup({ minion: true });
    const rawContext = { critical: true, hostile: true, sourceActorUuid: source.uuid, requireApproval: true,
        masterBattleCritical: { attribute: 'DEX', injury: 'tendon', weaponId: weapon.id } };
    foundry.applications.api.DialogV2.wait = async () => ({ approved: false });
    await assert.rejects(applyOniDamage(target, 8, rawContext), /cancelado/);
    assert.equal(target.system.props.oni_minion_pdv_dano, 0);
    assert.equal(statusOf(target).effects[MASTER_BATTLE_BLEEDING], undefined);

    foundry.applications.api.DialogV2.wait = async config => {
        assert.match(config.content, /Inclui efeitos de Crítico Brutal/);
        return { approved: true, normalDamage: 8, woundDamage: 0, damageTypes: [] };
    };
    game.combat.turn = 1;
    await applyOniDamage(target, 8, rawContext);
    assert.equal(target.system.props.oni_minion_pdv_dano, 8);
    assert.deepEqual(target.getFlag(MODULE_ID, injuryKey), {
        id: 'tendon', combatKey: 'Combat.test', sourceActorUuid: 'Actor.master', expiresAt: { round: 3, turn: 1 },
    });
    await processActorStatusTiming(target, 'start');
    assert.equal(target.system.props.oni_minion_pdv_dano, 11);
});

test('Coração Vanilla soma ao Sangramento de contato, depois de o GM aplicar o golpe', async () => {
    const { source, weapon, target } = setup({ vanilla: true, minion: true });
    source.system.props.na_vanilla_metal = 'metal_coracao';
    game.settings.get = (_module, key) => key === 'rulesSelection' ? '{"classes":"vanilla","metal":"vanilla"}' : undefined;
    foundry.applications.api.DialogV2.wait = async () => ({ approved: true, normalDamage: 8, woundDamage: 0, damageTypes: [] });
    await applyOniDamage(target, 8, { critical: true, hostile: true, sourceActorUuid: source.uuid,
        requireApproval: true, masterBattleCritical: { attribute: 'DEX', weaponId: weapon.id } });
    assert.equal(target.system.props.oni_minion_pdv_dano, 8);
    assert.equal(statusOf(target).effects[MASTER_BATTLE_BLEEDING].damageFormula, '1d4 + 1');
});

test('relay de jogador verifica ownership da origem antes de aplicar o status de ataque hostil', async () => {
    const { source, weapon, target } = setup({ minion: true });
    const requester = { id: 'player', active: true, isGM: false, name: 'Player' };
    game.users = new Map([[requester.id, requester]]);
    source.testUserPermission = () => false;
    let receive;
    let finish;
    game.socket = { on: (_channel, handler) => { receive = handler; }, emit: (_channel, result) => finish(result) };
    foundry.applications.api.DialogV2.wait = async config => {
        assert.doesNotMatch(config.content, /Inclui efeitos de Crítico Brutal/);
        return { approved: true, normalDamage: 8, woundDamage: 0, damageTypes: [] };
    };
    registerDamageRelay();
    const result = await new Promise(resolve => {
        finish = resolve;
        receive({
            type: 'applyOniDamage', actorUuid: target.uuid, gmId: game.user.id, requesterId: requester.id, amount: 8,
            context: { critical: true, hostile: true, sourceActorUuid: source.uuid,
                masterBattleCritical: { attribute: 'DEX', injury: 'open-guard', weaponId: weapon.id } },
        });
    });
    assert.equal(result.ok, true);
    assert.equal(statusOf(target).effects[MASTER_BATTLE_BLEEDING], undefined);
    assert.equal(target.getFlag(MODULE_ID, injuryKey), undefined);
});

test('descanso completo e Recuperação nível 4 removem o Sangramento de Crítico Brutal', () => {
    const status = { active: [MASTER_BATTLE_BLEEDING], effects: {
        [MASTER_BATTLE_BLEEDING]: { damageFormula: '1d4', remainingTurns: 3 },
    } };
    const result = recoveryOutcome({ props: {}, level: 4, success: true, status, pdvRoll: 0, pdrRoll: 0 });
    assert.equal(restEligibleStatuses('complete').includes(MASTER_BATTLE_BLEEDING), true);
    assert.equal(parseStatusState(result.patch['system.props.status_slayer_dados']).active.includes(MASTER_BATTLE_BLEEDING), false);
});

test('gerenciador preserva ou remove Sangramento de Crítico Brutal ativo sem permitir ativá-lo manualmente', async () => {
    const { weapon, target } = setup({ vanilla: true });
    chooseCritical(null);
    await criticalDamage(weapon);
    const originalFormData = globalThis.FormData;
    let checked = [MASTER_BATTLE_BLEEDING];
    globalThis.FormData = class {
        get() { return null; }
        getAll(key) { return key === 'na-status' ? checked : []; }
    };
    try {
        let html = '';
        foundry.applications.api.DialogV2.wait = async config => {
            html = config.content;
            return config.buttons.find(button => button.action === 'save-statuses').callback(null, { form: {} });
        };
        await openStatusManager({ actorUuid: target.uuid });
        assert.match(html, /Sangramento de Crítico Brutal/);
        assert.equal(statusOf(target).effects[MASTER_BATTLE_BLEEDING].remainingTurns, 3);
        checked = [];
        await openStatusManager({ actorUuid: target.uuid });
        assert.equal(statusOf(target).effects[MASTER_BATTLE_BLEEDING], undefined);
        checked = [MASTER_BATTLE_BLEEDING];
        await openStatusManager({ actorUuid: target.uuid });
        assert.doesNotMatch(html, /Sangramento de Crítico Brutal/);
        assert.equal(statusOf(target).effects[MASTER_BATTLE_BLEEDING], undefined);
    } finally {
        globalThis.FormData = originalFormData;
    }
});
