import assert from 'node:assert/strict';
import test from 'node:test';
import { MODULE_ID } from '../scripts/constants.mjs';
import { SETTINGS } from '../scripts/settings.mjs';
import {
    dualBreathingVariations,
    openDualBreathingRegistry,
    registerDualBreathingVariation,
} from '../scripts/slayer/dual-breathing-registry.mjs';

function setup(level) {
    let id = 0;
    const settings = { classes: 'homebrew' };
    const warnings = [];
    let registry = {};
    globalThis.game = {
        user: { isGM: true },
        settings: {
            get: (_module, key) => {
                if (key === SETTINGS.rulesSelection) return JSON.stringify(settings);
                if (key === SETTINGS.dualBreathingVariations) return registry;
            },
            async set(_module, key, value) {
                assert.equal(key, SETTINGS.dualBreathingVariations);
                registry = structuredClone(value);
            },
        },
    };
    globalThis.foundry = { utils: { randomID: () => String(++id).padStart(16, '0') } };
    globalThis.ui = { notifications: { warn: reason => warnings.push(reason), info: () => {} } };
    const props = {
        nome_slayer: 'Caçador', nvl_num: level, classe_escolhida: 'classe_usuario_de_duas_resp',
        resp_slayer_display: 'resp_slayer_agua', resp_slayer_display_2: 'resp_slayer_pedra',
        slayer_class_duas_resp_compatibility: 'compatible',
    };
    const item = (id, formId, breathing, extra = {}) => ({
        id, name: '<Forma>', system: { props: {
            forma_id: formId, respiracao_nome: breathing, inventario_categoria: 'respiracao', ...extra,
        } },
    });
    const actor = {
        uuid: 'Actor.slayer',
        system: { props }, flags: { [MODULE_ID]: {} },
        items: [
            item('base', 'agua_01', 'Água'),
            item('influence', 'pedra_05', 'Pedra'),
            item('other', 'chamas_01', 'Chamas'),
            item('tooHigh', 'custom_advanced', 'Pedra', { nivel_req: 3, tem_nvl3: true }),
            item('hub', 'hub_pedra', 'Pedra'),
        ],
    };
    const draft = {
        kind: 'minor', baseItemId: 'base', influenceItemId: 'influence', name: 'Arco de Pedra',
        traits: ['form'], action: 'Ataque', extraPdr: 1, target: 'Um alvo em arco',
        effect: 'Altera a geometria', limitation: 'Exige adjacência', description: 'Forma da Água em arco',
    };
    return { actor, props, draft, settings, warnings, registry: () => registry };
}

test('apenas GM aprova, com limites cumulativos C, B e A conferidos pelo nível atual', async () => {
    const { actor, props, draft, registry } = setup(4);
    const register = input => registerDualBreathingVariation(actor, { ...draft, ...input });
    game.user.isGM = false;
    assert.match((await register()).reason, /GM/u);
    assert.deepEqual(registry(), {});
    game.user.isGM = true;
    assert.equal((await register()).ok, true);
    assert.match((await register()).reason, /Limite/u);
    assert.match((await register({ kind: 'derived' })).reason, /Rank/u);
    props.nvl_num = 6;
    assert.equal((await register()).ok, true);
    assert.match((await register()).reason, /Limite/u);
    props.nvl_num = 8;
    assert.equal((await register({ kind: 'derived', traits: ['defense', 'rhythm'] })).ok, true);
    assert.match((await register({ kind: 'derived' })).reason, /Limite/u);
    assert.equal(dualBreathingVariations(actor).length, 3);
    props.nvl_num = 4;
    assert.equal(dualBreathingVariations(actor).length, 1);
});

test('aprovação recusa Forms externas, da mesma Respiração, atalhos e Secundária bloqueada', async () => {
    const { actor, draft, registry } = setup(8);
    for (const influenceItemId of ['missing', 'base', 'other', 'tooHigh', 'hub']) {
        const result = await registerDualBreathingVariation(actor, { ...draft, influenceItemId });
        assert.match(result.reason, /Forma disponível/u);
    }
    for (const patch of [{ extraPdr: -1 }, { traits: ['form', 'form'] }, { traits: ['defense'] }, { limitation: '' }]) {
        assert.equal((await registerDualBreathingVariation(actor, { ...draft, ...patch })).ok, false);
    }
    assert.deepEqual(registry(), {});
});

test('registros manuais preservam texto e só ficam ativos no perfil e nas Formas que o GM aprovou', async () => {
    const { actor, draft, settings, registry } = setup(8);
    const result = await registerDualBreathingVariation(actor, { ...draft, formula: '20d6', effect: '<texto>' });
    assert.equal(result.record.effect, '<texto>');
    assert.equal(result.record.formula, undefined);
    assert.equal(result.record.manual, true);
    assert.deepEqual(dualBreathingVariations(actor), [result.record]);
    actor.flags[MODULE_ID].dualBreathingVariations = [{ ...result.record, id: 'player-copy' }];
    game.user.isGM = false;
    assert.deepEqual(dualBreathingVariations(actor), [result.record]);
    assert.deepEqual(dualBreathingVariations({ ...actor, uuid: 'Actor.other' }), []);
    game.user.isGM = true;
    settings.classes = 'vanilla';
    assert.equal((await registerDualBreathingVariation(actor, draft)).ok, false);
    assert.deepEqual(dualBreathingVariations(actor), []);
    settings.classes = 'homebrew';
    actor.items[0].system.props.forma_id = 'agua_02';
    assert.deepEqual(dualBreathingVariations(actor), []);
    assert.equal(registry()[actor.uuid].length, 1);
});

test('diálogo GM escapa opções e cancelamento não grava', async () => {
    const { actor, registry } = setup(4);
    foundry.applications = { api: { DialogV2: { wait: async dialog => {
        assert.match(dialog.content, /&lt;Forma&gt;/u);
        assert.doesNotMatch(dialog.content, /<Forma>|value="hub"|value="tooHigh"|value="derived"/u);
        return dialog.buttons.at(-1).callback();
    } } } };
    assert.equal(await openDualBreathingRegistry(actor), null);
    assert.deepEqual(registry(), {});
});

test('formas personalizadas passam a valer no nível liberado e aprovação concorrente preserva o limite', async () => {
    const { actor, props, draft } = setup(10);
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const set = game.settings.set;
    game.settings.set = async (...args) => {
        await gate;
        await set(...args);
    };
    const approved = registerDualBreathingVariation(actor, { ...draft, influenceItemId: 'tooHigh' });
    assert.match((await registerDualBreathingVariation(actor, draft)).reason, /em andamento/u);
    release();
    assert.equal((await approved).ok, true);
    assert.equal(dualBreathingVariations(actor).length, 1);
    props.nvl_num = 8;
    assert.equal(dualBreathingVariations(actor).length, 0);
});
