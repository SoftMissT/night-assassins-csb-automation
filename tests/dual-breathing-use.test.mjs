import assert from 'node:assert/strict';
import test from 'node:test';
import { useBreathForm } from '../scripts/breath-service.mjs';
import { mitigateBreathingPassiveDamage } from '../scripts/breathing-defense.mjs';
import { listChainableBreathForms } from '../scripts/attack-follow-up.mjs';
import { MODULE_ID } from '../scripts/constants.mjs';
import { SETTINGS } from '../scripts/settings.mjs';
import { approveDualBreathingComposite, registerDualBreathingVariation } from '../scripts/slayer/dual-breathing-registry.mjs';
import { openDualBreathingPosture, useDualBreathingComposite } from '../scripts/slayer/dual-breathing-posture.mjs';
import { setupFoundryMocks } from './fixtures/foundry-mock.mjs';

const dualClass = 'classe_usuario_de_duas_resp';

function setup({ profile = 'homebrew', breath = 'Pedra', formId = 'pedra_05', props = {} } = {}) {
    setupFoundryMocks();
    foundry.utils = {
        deepClone: structuredClone,
        getProperty: (object, key) => key.split('.').reduce((value, part) => value?.[part], object),
    };
    game.settings = { get: (_module, key) => key === SETTINGS.rulesSelection
        ? JSON.stringify({ classes: profile })
        : undefined };
    game.combat = { id: 'combat', started: true, round: 1, turn: 0, combatant: { id: 'combatant' } };
    const warnings = [];
    ui.notifications.warn = reason => { warnings.push(reason); };
    ChatMessage.create = async () => {};
    const patches = [];
    const actor = {
        uuid: 'Actor.dual',
        id: 'dual',
        isOwner: true,
        flags: { [MODULE_ID]: {} },
        system: { props: {
            nome_slayer: 'Duas Respirações',
            nvl_num: 2,
            nvl_respiracao_num: 4,
            resp_slayer_display: 'resp_slayer_agua',
            resp_slayer_display_2: `resp_slayer_${breath.toLowerCase()}`,
            classe_escolhida: dualClass,
            na_vanilla_class: dualClass,
            slayer_class_duas_resp_compatibility: 'incompatible',
            pdr_slayer_total: 20,
            pdv_slayer_total: 20,
            ...props,
        } },
        async update(patch) {
            patches.push(patch);
            for (const [key, value] of Object.entries(patch)) {
                const parts = key.split('.');
                const property = parts.pop();
                parts.reduce((object, part) => object[part], this)[property] = value;
            }
        },
    };
    const item = {
        uuid: 'Actor.dual.Item.form',
        actor,
        name: 'Forma',
        system: { props: {
            forma_id: formId,
            respiracao_nome: breath,
            tipo_manobra: 'livre',
            tem_nvl1: 1,
            tem_nvl2: 1,
            nvl1_custo: 3,
            nvl2_custo: 5,
        } },
    };
    actor.items = [item];
    game.combat.combatant.actor = actor;
    fromUuid = async uuid => uuid === item.uuid ? item : null;
    const dialogs = [];
    foundry.applications.api.DialogV2.wait = async config => {
        dialogs.push(config);
        return { level: 1, damage: null };
    };
    return { actor, item, patches, warnings, dialogs, use: () => useBreathForm({ itemUuid: item.uuid }) };
}

test('Forma canônica Secundária cobra PDR e PDV, usa nível próprio e limita um uso por turno Homebrew', async () => {
    const { actor, patches, warnings, dialogs, use } = setup();
    assert.equal((await use()).ok, true);
    assert.equal(dialogs.length, 1);
    assert.doesNotMatch(dialogs[0].content, /Nível 2 /u);
    assert.match(dialogs[0].content, /PDR \+ 2 PDV/u);
    assert.equal(patches[0]['system.props.pdr_slayer_gasto_valor'], 7);
    assert.equal(patches[0]['system.props.pdv_slayer_dano_tomado'], 2);
    assert.equal(actor.flags[MODULE_ID].dualBreathingTurn, 'combat:1:0:combatant');
    assert.equal(listChainableBreathForms(actor).length, 0);
    await use();
    assert.match(warnings.at(-1), /já foi usada neste turno/u);
    assert.equal(patches.length, 1);
    game.combat.turn = 1;
    assert.equal(listChainableBreathForms(actor).length, 1);
});

test('Variação Derivada aprovada usa a base e compartilha o limite da Secundária', async () => {
    const { actor, item, patches, warnings, dialogs, use } = setup({ props: { nvl_num: 8 } });
    item.id = 'stone';
    actor.items.push({
        id: 'water', uuid: 'Actor.dual.Item.water',
        system: { props: { forma_id: 'agua_01', respiracao_nome: 'Água' } },
    });
    const stored = new Map();
    const readRule = game.settings.get;
    game.settings = {
        get: (module, key) => stored.get(key) ?? readRule(module, key),
        set: async (_module, key, value) => { stored.set(key, value); },
    };
    game.user.isGM = true;
    foundry.utils.randomID = () => 'approved';
    const approval = await registerDualBreathingVariation(actor, {
        kind: 'derived', name: 'Variação registrada', baseItemId: 'stone', influenceItemId: 'water',
        traits: ['form', 'rhythm'], extraPdr: 1, action: 'Livre', target: 'Próprio',
        effect: 'Ajustar a forma em mesa', limitation: 'Só na postura aprovada', description: 'Treinada.',
    });
    assert.equal(approval.ok, true, approval.reason);
    game.user.isGM = false;
    const variation = () => useBreathForm({ itemUuid: item.uuid, variationId: approval.record.id });
    const choose = foundry.applications.api.DialogV2.wait;
    foundry.applications.api.DialogV2.wait = async () => null;
    await variation();
    assert.equal(patches.length, 0);
    foundry.applications.api.DialogV2.wait = choose;
    assert.equal((await variation()).ok, true);
    assert.match(dialogs.at(-1).content, /Variação registrada/u);
    assert.match(dialogs.at(-1).content, /Limitação: Só na postura aprovada/u);
    assert.equal(patches[0]['system.props.pdr_slayer_gasto_valor'], 9);
    assert.equal(patches[0]['system.props.pdv_slayer_dano_tomado'], 2);
    await use();
    assert.match(warnings.at(-1), /já foi usada neste turno/u);
    assert.equal(patches.length, 1);
});

test('Forma Intermediária permite duas Variações com ações diferentes e cobra a Sobrecarga', async () => {
    const { actor, item, patches, warnings } = setup({ formId: 'custom_stone', props: { nvl_num: 11 } });
    item.id = 'stone';
    Object.assign(item.system.props, { inventario_categoria: 'respiracao', tipo_manobra: 'Ação Especial' });
    const water = { actor, id: 'water', uuid: 'Actor.dual.Item.water',
        system: { props: { ...item.system.props, forma_id: 'custom_water', respiracao_nome: 'Água',
            tipo_manobra: 'Ação Única' } } };
    actor.items.push(water);
    fromUuid = async uuid => actor.items.find(entry => entry.uuid === uuid);
    actor.setFlag = async (_module, key, value) => { actor.flags[MODULE_ID][key] = value; };
    const stored = new Map();
    const readRule = game.settings.get;
    game.settings = { get: (module, key) => stored.get(key) ?? readRule(module, key),
        set: async (_module, key, value) => { stored.set(key, value); } };
    game.user.isGM = true;
    let counter = 0;
    foundry.utils.randomID = () => String(++counter);
    const details = { kind: 'minor', traits: ['form'], extraPdr: 0, action: 'Da base', target: 'Próprio',
        effect: 'Muda a geometria', limitation: 'Apenas no alcance da base', description: 'Treino.' };
    const first = await registerDualBreathingVariation(actor, { ...details, name: 'Pedra híbrida', baseItemId: 'stone', influenceItemId: 'water' });
    const second = await registerDualBreathingVariation(actor, { ...details, name: 'Água híbrida', baseItemId: 'water', influenceItemId: 'stone' });
    assert.ok(first.ok && second.ok);
    const choose = foundry.applications.api.DialogV2.wait;
    foundry.applications.api.DialogV2.wait = async () => ({ mode: 'overload' });
    assert.equal((await openDualBreathingPosture(actor)).ok, true);
    foundry.applications.api.DialogV2.wait = choose;
    assert.equal((await useBreathForm({ itemUuid: item.uuid, variationId: first.record.id })).ok, true);
    assert.equal((await useBreathForm({ itemUuid: water.uuid, variationId: second.record.id })).ok, true);
    assert.equal(actor.system.props.pdv_slayer_dano_tomado, 6);
    assert.deepEqual(actor.flags[MODULE_ID].dualBreathingPosture.uses.map(use => use.action), ['especial', 'unica']);
    const before = patches.length;
    await useBreathForm({ itemUuid: water.uuid, variationId: second.record.id });
    assert.match(warnings.at(-1), /Limite compartilhado/u);
    assert.equal(patches.length, before);
});

test('Forma Composta registrada paga a maior base, compatibilidade e preço uma vez por combate', async () => {
    const { actor, item, patches } = setup({ formId: 'custom_stone', props: { nvl_num: 12 } });
    item.id = 'stone';
    item.system.props.inventario_categoria = 'respiracao';
    actor.items.push({
        id: 'water', name: 'Água', system: { props: { ...item.system.props,
            forma_id: 'custom_water', respiracao_nome: 'Água', nvl2_custo: 6 } },
    });
    const stored = new Map();
    const readRule = game.settings.get;
    game.settings = { get: (module, key) => stored.get(key) ?? readRule(module, key),
        set: async (_module, key, value) => { stored.set(key, value); } };
    game.user.isGM = true;
    const approval = await approveDualBreathingComposite(actor, {
        primary: 'water:2', secondary: 'stone:1', mixType: 'form', price: 'internal-damage',
        name: 'Composta', target: 'Um inimigo', effect: 'Mudar a área', description: 'Combinação aprendida',
    }, 4);
    assert.equal(approval.ok, true, approval.reason);
    game.user.isGM = false;
    assert.equal((await useDualBreathingComposite(actor, 4)).ok, true);
    assert.equal(actor.system.props.pdr_slayer_gasto_valor, 10);
    assert.equal(actor.system.props.pdv_slayer_dano_tomado, 4);
    assert.equal(JSON.parse(actor.system.props.acoes_slayer_dados).turn.especial, 1);
    game.combat.round += 1;
    assert.match((await useDualBreathingComposite(actor, 4)).reason, /já foi usada neste combate/);
    assert.equal(patches.length, 1);
});

test('Forma da rota legada usa a sinergia Vanilla Água–Neve e não marca limite Homebrew', async () => {
    const { actor, patches, use } = setup({
        profile: 'vanilla', breath: 'Neve', formId: 'custom_neve',
        props: { slayer_class_duas_resp_compatibility: '' },
    });
    assert.equal((await use()).ok, true);
    assert.equal((await use()).ok, true);
    assert.equal(patches.length, 2);
    assert.equal(patches[0]['system.props.pdr_slayer_gasto_valor'], 4);
    assert.equal(patches[1]['system.props.pdr_slayer_gasto_valor'], 8);
    assert.equal(actor.flags[MODULE_ID].dualBreathingTurn, undefined);
});

test('Sinergia Vanilla de Água e Neve cobra a opção uma vez e soma INT ao mesmo dano', async () => {
    for (const useSynergy of [false, true]) {
        const { actor, use } = setup({
            profile: 'vanilla', breath: 'Água', formId: 'agua_01',
            props: { resp_slayer_display_2: 'resp_slayer_neve', int_display: 4 },
        });
        foundry.applications.api.DialogV2.confirm = async ({ window }) => {
            assert.equal(window.title, 'Sinergia Água e Neve');
            return useSynergy;
        };
        assert.equal((await use()).ok, true);
        assert.equal(actor.system.props.pdr_slayer_gasto_valor, useSynergy ? 2 : 1);
        assert.equal(JSON.parse(actor.system.props.resp_agua_estado).pendingDamage.formula,
            useSynergy ? '(1d6) + (4)' : '1d6');
    }
});

test('Sinergia Vanilla de Pedra e Metal cobra a opção e reduz VIT uma vez por ataque durante Metalizado', async () => {
    const { actor, use } = setup({
        profile: 'vanilla', breath: 'Metal', formId: 'metal_01',
        props: { resp_slayer_display: 'resp_slayer_pedra', vit_display: 4 },
    });
    foundry.applications.api.DialogV2.confirm = async ({ window }) => {
        assert.equal(window.title, 'Sinergia Pedra e Metal');
        return true;
    };
    assert.equal((await use()).ok, true);
    const props = actor.system.props;
    assert.equal(props.pdr_slayer_gasto_valor, 4);
    const components = [{ types: ['cortante'], subtotal: 2 }, { types: ['concussao'], subtotal: 6 }];
    assert.deepEqual(
        mitigateBreathingPassiveDamage(props, 8, 0, { isAttack: true, components }),
        { normalDamage: 4, woundDamage: 0, concussionDamage: 4 },
    );
    assert.equal(mitigateBreathingPassiveDamage(props, 8, 0, { isAttack: false }).normalDamage, 8);
    const state = JSON.parse(props.resp_metal_estado);
    state.metalized.turns = 0;
    props.resp_metal_estado = JSON.stringify(state);
    assert.equal(mitigateBreathingPassiveDamage(props, 8, 0, { isAttack: true }).normalDamage, 8);
});

test('secundária sem nível liberado, classificada pelo perfil errado ou sem vida para pagar não consome', async () => {
    for (const [props, reason] of [
        [{ nvl_num: 1 }, /nível 2/u],
        [{ classe_escolhida: 'classe_mb' }, /exige a classe/u],
        [{ slayer_class_duas_resp_compatibility: '' }, /classificar a compatibilidade/u],
        [{ pdv_slayer_dano_tomado: 19 }, /2 PDV disponíveis/u],
    ]) {
        const { patches, warnings, dialogs, use } = setup({ props });
        await use();
        assert.match(warnings.at(-1), reason);
        assert.equal(dialogs.length, 0);
        assert.equal(patches.length, 0);
    }
});

test('cancelar Acerto na rota canônica preserva recursos e o uso da Secundária', async () => {
    const { patches, use } = setup({ formId: 'pedra_02' });
    foundry.applications.api.DialogV2.wait = async config => config.content.includes('na-breath-level')
        ? { level: 1, damage: null }
        : null;
    assert.deepEqual(await use(), { ok: false, reason: 'Acerto cancelado.' });
    assert.equal(patches.length, 0);
});

test('cancelar Acerto de Forma legada não aplica o custo de PDV que derrubaria o ator', async () => {
    const { actor, patches, use } = setup({
        formId: 'neve_01', breath: 'Neve',
        props: { pdv_slayer_dano_tomado: 18, pdr_slayer_gasto_valor: 0 },
    });
    foundry.applications.api.DialogV2.wait = async config => config.content.includes('na-breath-level')
        ? { level: 1, damage: null }
        : null;
    assert.equal(await use(), undefined);
    assert.equal(patches.length, 2, 'preparação seguida de estorno');
    assert.equal(actor.system.props.pdr_slayer_gasto_valor, 0);
    assert.equal(actor.system.props.pdv_slayer_dano_tomado, 18);
    assert.equal(actor.flags[MODULE_ID].dualBreathingTurn, undefined);
    assert.ok(patches.every(patch => !Object.hasOwn(patch, 'system.props.pdv_slayer_dano_tomado')));
});
