import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { setupFoundryMocks } from './fixtures/foundry-mock.mjs';
import { handleActorUpdate } from '../scripts/trigger-router.mjs';
import { rollHit } from '../scripts/hit-service.mjs';
import { rollTest } from '../scripts/roll-service.mjs';
import { resolveSheetAttribute } from '../scripts/sheet-attributes.mjs';
import { applyStonePassiveAfterDamage } from '../scripts/stone-breathing-service.mjs';
import { buildMistBreathingPlan, resolveMistFormula } from '../scripts/mist-breathing-service.mjs';
import { windStatePatch } from '../scripts/wind-breathing-service.mjs';
import { currentRecoveryResources } from '../scripts/recovery-breathing-service.mjs';

function npc(props = {}) {
    const actor = { uuid: 'Actor.npc', isOwner: true, items: [], system: { props: {
        npc_nome: 'NPC', npc_nivel: 6, npc_vit_base: 4, npc_dex_base: 3, npc_for_base: 4, acerto_label: 'acerto_label_dex',
        npc_pdv_base: 30, npc_pdr_base: 12, ...props,
    } } };
    actor.update = async patch => {
        for (const [path, value] of Object.entries(patch)) actor.system.props[path.replace('system.props.', '')] = value;
    };
    return actor;
}

test('escolha da Marca no NPC passa pelo hook normal e evolui sem repetir o bônus', async () => {
    setupFoundryMocks();
    const actor = npc({ hab_escolhida: 'hab_escolhida_marca_destino' });
    let choices = 0;
    foundry.applications.api.DialogV2.wait = async () => { choices++; return 'vit'; };
    await handleActorUpdate(actor, { 'system.props.hab_escolhida': 'hab_escolhida_marca_destino' }, {}, game.user.id);
    assert.equal(choices, 1);
    assert.equal(resolveSheetAttribute(actor, 'VIT'), 7);
    await handleActorUpdate(actor, { system: { props: { npc_nivel: 6 } } }, {}, game.user.id);
    assert.equal(choices, 1);
    assert.equal(resolveSheetAttribute(actor, 'VIT'), 7);
    assert.equal(actor.system.props.npc_vit_base, 4);
});

test('surpresa física contra Raposa permite o ataque comum sem Vantagem de surpresa', async () => {
    setupFoundryMocks();
    const actor = npc();
    game.user.targets = new Set([{ actor: npc({ resp_slayer_display: 'resp_slayer_raposa' }) }]);
    let warned = false;
    ui.notifications.warn = () => { warned = true; };
    ui.notifications.error = message => { throw new Error(message); };
    const formulas = [];
    ChatMessage.create = async () => ({});
    Roll.create = formula => { formulas.push(formula); return { evaluate: async () => ({ total: 10, dice: [], toMessage: async () => ({}) }) }; };
    foundry.applications.api.DialogV2.wait = async ({ content, buttons }) => {
        if (!content.includes('na-ac-physical-surprise')) return { hit: false, continue: false };
        const elements = Object.fromEntries(['rollmode', 'bonus', 'cd', 'count', 'action', 'weapon', 'weapon-attribute']
            .map(key => [`na-ac-${key}`, { value: key === 'action' ? 'ataque' : '' }]));
        elements['na-ac-physical-surprise'] = { checked: true };
        return buttons.find(button => button.action === 'advantage').callback(null, { form: { elements } });
    };
    await rollHit({ actor, skipActionConsumption: true });
    assert.equal(warned, true);
    assert.match(formulas[0], /^1d20/);
});

test('Pedra registra dano confirmado e Quebra para NPC', async () => {
    setupFoundryMocks();
    const actor = npc({ resp_passivas_estado: JSON.stringify({ version: 1 }) });
    actor.items.push({ system: { props: { respiracao_nome: 'Pedra' } } });
    await applyStonePassiveAfterDamage({ actor,
        appliedTargets: [{ actor: { uuid: 'Actor.target' }, amount: 15, wound: 3, concussionDamage: 15 }],
        actionId: 'attack', strength: 5, hasAttackDamage: true,
    });
    const state = JSON.parse(actor.system.props.resp_passivas_estado);
    assert.equal(state.stone.lastConfirmedDamageByTarget['Actor.target'].damage, 15);
    assert.equal(state.stone.breakStacks, 1);
});

test('Névoa usa nível do NPC em vez de assumir nível 1', () => {
    const props = { npc_nivel: 12, sab_display: 4 };
    assert.equal(resolveMistFormula('1d6 + @level + @sab', props), '1d6 + 12 + 4');
    const plan = buildMistBreathingPlan('nevoa_03', 3, props);
    assert.equal(plan.state.incomingReduction.formula, '1d6 + 12 + 4');
});

test('Vento concede Resistência Vital apenas em testes, sem alterar VIT ou CAR', async () => {
    setupFoundryMocks();
    const wind = { scars: 3, vitBonus: 2 };
    const patch = windStatePatch(wind);
    assert.equal(patch['system.props.resp_vento_cicatrizes'], 3);
    assert.equal(patch['system.props.resp_vento_vit_bonus'], undefined);
    for (const props of [{ npc_nome: 'NPC', npc_vit_base: 4, npc_car_base: 2 },
        { nome_slayer: 'Slayer', atr_vit_valor_config: 4, atr_car_valor_config: 2 }]) {
        props.resp_vento_estado = JSON.stringify(wind);
        const actor = { system: { props } };
        assert.equal(resolveSheetAttribute(actor, 'VIT'), 4);
        assert.equal(resolveSheetAttribute(actor, 'CAR'), 2);
        actor.update = async () => {};
        const formulas = [];
        Roll.create = formula => { formulas.push(formula); return { evaluate: async () => ({ total: 10, toMessage: async () => {} }) }; };
        foundry.applications.api.DialogV2.wait = async () => ({ mode: 'normal', rollMode: 'publicroll', secVal: 0, bonusRaw: '', cdVal: 0 });
        await rollTest({ actor, test: 'Teste VIT', attr: 'VIT' });
        assert.match(formulas[0], /1d20 \+ 4 \+ 2/);
    }
});

test('Raposa aumenta PDR exibido do Slayer uma vez mesmo em duas escolhas', () => {
    const template = JSON.parse(fs.readFileSync(new URL('../src/templates/actors/slayer-template.json', import.meta.url)));
    assert.ok(template.system.hidden.find(field => field.name === 'pdr_slayer_total').value.includes('resp_slayer_raposa'));
    assert.equal(currentRecoveryResources({ nome_slayer: 'Slayer', pdr_slayer_total: 21,
        resp_slayer_display: 'resp_slayer_raposa', resp_slayer_display_2: 'resp_slayer_raposa' }).pdrMax, 21);
});
