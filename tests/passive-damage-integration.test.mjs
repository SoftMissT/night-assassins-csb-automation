import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupFoundryMocks } from './fixtures/foundry-mock.mjs';
import { applySlayerDamage, processActorStatusTiming } from '../scripts/status-engine.mjs';
import { applyOniDamage } from '../scripts/damage-relay.mjs';
import { rollDamage } from '../scripts/damage-service.mjs';
import { WIND_CURRENT_KEY } from '../scripts/wind-current-passive.mjs';
import { METAL_FORGE_KEY } from '../scripts/metal-forge-passive.mjs';
import { SOUND_PASSIVE_KEY } from '../scripts/sound-passive-service.mjs';
import { hasBreathingPassive } from '../scripts/breathing-passive-rules.mjs';
import { SETTINGS } from '../scripts/settings.mjs';

const combatId = 'Combat.passive';

test('secundária antiga preserva a seleção sem conceder passivas fora da classe e antes do nível 2', () => {
    setup();
    const props = { nome_slayer: 'Slayer', resp_slayer_display: 'resp_slayer_vento',
        resp_slayer_display_2: 'resp_slayer_som', classe_escolhida: 'classe_usuario_de_duas_resp', nvl_num: 1 };
    assert.equal(hasBreathingPassive(props, 'Som'), false);
    props.nvl_num = 2;
    assert.equal(hasBreathingPassive(props, 'Som'), true);
    game.settings = { get: (_module, key) => key === SETTINGS.rulesSelection ? '{"classes":"vanilla"}' : undefined };
    assert.equal(hasBreathingPassive(props, 'Som'), false);
    assert.equal(hasBreathingPassive({ ...props, na_vanilla_class: props.classe_escolhida }, 'Som'), true);
    assert.equal(hasBreathingPassive(props, 'Vento'), true);
});

function setup() {
    setupFoundryMocks();
    game.user.isGM = true;
    game.combat = { uuid: combatId, started: true, round: 1, turn: 0 };
    ChatMessage.create = async data => data;
}

function actor(id, props) {
    return { id, uuid: `Actor.${id}`, name: id, isOwner: true, items: [], system: { props },
        async update(patch) {
            for (const [path, value] of Object.entries(patch))
                props[path.replace('system.props.', '')] = value;
        } };
}

test('Som e Vento recebem apenas PDV real perdido após absorção, com limite de overkill', async () => {
    setup();
    const props = {
        nome_slayer: 'Slayer', pdv_slayer_total_conta: 10, pdv_slayer_extra: 5, pdv_slayer_dano_tomado: 8,
        classe_escolhida: 'classe_usuario_de_duas_resp', nvl_num: 2,
        resp_slayer_display: 'resp_slayer_vento', resp_slayer_display_2: 'resp_slayer_som',
        hab_escolhida: 'hab_escolhida_audicao',
        [SOUND_PASSIVE_KEY]: JSON.stringify({ combatId, bpm: 80 }),
    };
    const target = actor('target', props);
    const absorbed = await applySlayerDamage(target, 4, { hostile: true });
    assert.equal(absorbed.pdvLost, 0);
    assert.equal(props.pdv_slayer_extra, 1);
    assert.equal(JSON.parse(props[SOUND_PASSIVE_KEY]).bpm, 80);

    const loss = await applySlayerDamage(target, 25, { hostile: true, sourceActorUuid: 'Actor.other' });
    assert.equal(loss.temporaryAbsorbed, 1);
    assert.equal(loss.pdvLost, 2);
    assert.equal(JSON.parse(props[SOUND_PASSIVE_KEY]).bpm, 65);
    assert.equal(JSON.parse(props[WIND_CURRENT_KEY]).supportedDamage, 2);
});

test('Metal Branco reduz apenas Concussão e Sinfonia Perfeita desconta RD uma vez por golpe', async () => {
    setup();
    const props = {
        npc_nome: 'NPC', npc_pdv_base: 50,
        resp_slayer_display: 'resp_slayer_metal', resp_slayer_display_2: 'resp_slayer_som',
        hab_escolhida: 'hab_escolhida_audicao',
        [METAL_FORGE_KEY]: JSON.stringify({ combatId, whiteTurns: 2 }),
        [SOUND_PASSIVE_KEY]: JSON.stringify({ combatId, bpm: 170 }),
    };
    const target = actor('npc', props);
    const damage = await applyOniDamage(target, 20, {
        damageTypes: ['concussao', 'perfurante', 'fogo'],
        components: [
            { types: ['concussao'], subtotal: 10 },
            { types: ['perfurante'], subtotal: 4 },
            { types: ['fogo'], subtotal: 6 },
        ],
    });
    assert.equal(damage.appliedDamage, 12);
    assert.equal(damage.pdvLost, 12);
    assert.equal(props.npc_pdv_dano, 12);

    foundry.applications.api.DialogV2.wait = async config =>
        config.buttons.find(button => button.action === 'approve').callback(null, null, {
            element: {
                querySelector: () => ({ value: 'resisted' }),
                querySelectorAll: () => [{ value: 'concussao' }],
            },
        });
    const approved = await applyOniDamage(target, 20, { requireApproval: true, damageTypes: ['concussao'] });
    assert.equal(approved.appliedDamage, 7, 'a resistência manual não é repetida pelo Metal Branco');
});

test('Sangramento periódico alimenta Dano Suportado do NPC somente pelo PDV que restava', async () => {
    setup();
    const props = { npc_nome: 'NPC', npc_pdv_base: 5, npc_pdv_dano: 2, resp_slayer_display: 'resp_slayer_vento',
        status_slayer_dados: JSON.stringify({ active: ['sangramento'],
            effects: { sangramento: { damageFormula: '1d8', remainingTurns: 2 } } }) };
    const target = actor('npc', props);
    Roll.create = () => ({ evaluate: async () => ({ total: 8, toMessage: async () => {} }) });
    await processActorStatusTiming(target);
    assert.equal(props.npc_pdv_dano, 10);
    assert.equal(JSON.parse(props[WIND_CURRENT_KEY]).supportedDamage, 3);
});

test('dados de Corrente são aplicados uma vez e Fôlego recebe apenas dano direto que tirou PDV', async () => {
    setup();
    const props = { nome_slayer: 'Vento', pdv_slayer_total_conta: 30, pdv_slayer_dano_tomado: 15,
        resp_slayer_display: 'resp_slayer_vento',
        [WIND_CURRENT_KEY]: JSON.stringify({ combatId, round: 1, supportedDamage: 20,
            pendingDamage: { formId: 'vento_03', diceRemaining: 2 } }) };
    const source = actor('wind', props);
    const target = actor('target', { nome_slayer: 'Alvo', pdv_slayer_total_conta: 12 });
    game.user.targets = new Set([{ actor: target }]);
    foundry.applications.api.DialogV2.wait = async () => ({
        entradas: [{ dado: '1d8', tipoAcao: 'ataque', selTiposDano: ['cortante'] }],
    });
    const rolled = [];
    Roll.create = formula => ({ evaluate: async () => {
        rolled.push(formula);
        return { total: formula === '2d6' ? 10 : 8, toMessage: async () => {} };
    } });
    const options = { actor: source, forceAttackDamage: true, skipActionConsumption: true,
        passiveExecutionId: 'vento-golpe', passiveFormId: 'vento_03' };
    const first = await rollDamage(options);
    const state = JSON.parse(props[WIND_CURRENT_KEY]);
    assert.equal(first.finalDamage, 18);
    assert.equal(first.windDamageDealt, 12);
    assert.equal(state.pendingDamage, null);
    assert.equal(state.recoveryOffer.amount, 12);
    const second = await rollDamage(options);
    assert.equal(second.windDamageDealt, 0);
    assert.equal(rolled.filter(formula => formula === '2d6').length, 1);
});

test('Martelo usa um novo Acerto e metade da nova rolagem da arma, arredondada para cima', async () => {
    setup();
    const props = { nome_slayer: 'Metal', nvl_respiracao: 1, dex_display: '3',
        acerto_label: 'acerto_label_dex', resp_slayer_display: 'resp_slayer_metal',
        resp_passivas_estado: JSON.stringify({ metal: { hammerPending: true } }) };
    const source = actor('metal', props);
    const item = { id: 'hammer', name: 'Martelo', documentName: 'Item', parent: { ...source, documentName: 'Actor' },
        system: { props: { arma_nome: 'Martelo', arma_critico: 20,
            arma_perfis_ataque: [{ nome: 'Ataque Base', dano_dados: '1d6', tipos_dano: ['concussao'] }] } } };
    source.items = { [Symbol.iterator]: function* () { yield item; }, get: id => id === item.id ? item : undefined };
    item.parent = Object.assign(source, { documentName: 'Actor' });
    const target = actor('target', { nome_slayer: 'Alvo', pdv_slayer_total_conta: 100,
        resp_slayer_display: 'resp_slayer_metal',
        [METAL_FORGE_KEY]: JSON.stringify({ combatId, whiteTurns: 2 }) });
    game.user.targets = new Set([{ actor: target }]);
    foundry.applications.api.DialogV2.confirm = async config => config.window.title === 'Martelo do Julgamento';
    const dialogs = [
        { critical: true, entradas: [{ dado: '1d10', tipoAcao: 'ataque', selTiposDano: ['concussao'] }] },
        { mode: 'normal', rollMode: 'publicroll', bonusRaw: '', cdVal: 0, rollCount: 1, actionType: 'ataque',
            weaponId: item.id, weaponProfileIndex: 0 },
        { hit: true, continue: false },
        { critical: false, entradas: [{ dado: '1d6', tipoAcao: 'ataque', selTiposDano: ['concussao'] }] },
    ];
    foundry.applications.api.DialogV2.wait = async () => dialogs.shift();
    const rolled = [];
    Roll.create = formula => ({ evaluate: async () => {
        rolled.push(formula);
        return { total: formula.includes('1d20') ? 17 : formula.includes('1d10') ? 10 : 5,
            dice: [{ results: [{ result: 14, active: true }] }], toMessage: async () => {} };
    } });
    await rollDamage({ actor: source, weaponItem: item, classBasicAttack: true, critical: true,
        forceAttackDamage: true, skipActionConsumption: true });
    // 20 do primeiro golpe, reduzido a 10 pelo Metal Branco, mais ceil(5/2) do Martelo.
    assert.equal(target.system.props.pdv_slayer_dano_tomado, 13);
    assert.equal(JSON.parse(props.resp_passivas_estado).metal.hammerPending, undefined);
    assert.equal(rolled.length, 3);
    assert.equal(dialogs.length, 0);
});

test('Ataque Dilacerador no perfil vanilla adiciona +4 mesmo sem a seleção homebrew', async () => {
    setup();
    game.settings = { get: (_module, key) => key === 'rulesProfile' ? 'vanilla' : undefined };
    const source = actor('fighter', { nome_slayer: 'Lutador', nvl_num: 6, na_vanilla_class: 'classe_mb',
        classe_escolhida: 'classe_kakushi' });
    const target = actor('target', { nome_slayer: 'Alvo', pdv_slayer_total_conta: 50 });
    game.user.targets = new Set([{ actor: target }]);
    foundry.applications.api.DialogV2.wait = async () => ({
        entradas: [{ dado: '1d8', tipoAcao: 'ataque', selTiposDano: ['cortante'] }],
    });
    Roll.create = formula => ({ evaluate: async () => ({
        total: formula === '4' ? 4 : 8, toMessage: async () => {},
    }) });
    const result = await rollDamage({ actor: source, classBasicAttack: true, skipActionConsumption: true });
    assert.equal(result.finalDamage, 12);
    assert.deepEqual(result.components.find(component => component.label === 'Ataque Dilacerador'),
        { label: 'Ataque Dilacerador', types: [], subtotal: 4 });
});
