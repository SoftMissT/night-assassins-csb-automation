import { setupFoundryMocks } from './fixtures/foundry-mock.mjs';
setupFoundryMocks();
import assert from 'node:assert/strict';
import test from 'node:test';
import { makeActor } from './fixtures/actor.mjs';
import { breathingPdrInfo, breathingPdvInfo } from '../scripts/actor-resources.mjs';
import { spendMetalHammerSynergyPdr, metalHammerSynergyAllies } from '../scripts/metal-runtime.mjs';
import { applyBreathingStatus, useBreathForm } from '../scripts/breath-service.mjs';
import { rollDamage } from '../scripts/damage-service.mjs';

function mutableActor(id, props) {
    const actor = makeActor({ id, uuid: `Actor.${id}`, props });
    const flags = {};
    actor.items = [];
    actor.getFlag = (_scope, key) => flags[key];
    actor.setFlag = async (_scope, key, value) => { flags[key] = value; };
    actor.unsetFlag = async (_scope, key) => { delete flags[key]; };
    actor.update = async (patch) => {
        for (const [path, value] of Object.entries(patch)) actor.system.props[path.replace('system.props.', '')] = value;
    };
    return actor;
}

function setupDamage() {
    setupFoundryMocks();
    game.user.isGM = true;
    game.user.targets = new Set();
    const formulas = [];
    const messages = [];
    globalThis.ChatMessage.create = async (message) => { messages.push(message); return message; };
    globalThis.Roll.create = (formula) => {
        formulas.push(formula);
        return { evaluate: async () => ({ total: 8, dice: [], toMessage: async () => {} }) };
    };
    foundry.applications.api.DialogV2.wait = async (config) => {
        if (config.window.title === 'Autorizar dano no inimigo') {
            return config.buttons.find(({ action }) => action === 'approve').callback(null, null, {
                element: {
                    querySelector: () => ({ value: 'normal' }),
                    querySelectorAll: () => [{ value: 'cortante' }],
                },
            });
        }
        return { pdrGasto: 0, entradas: [{ dado: '1d8', tipoAcao: 'ataque', selTiposDano: ['cortante'] }] };
    };
    return { formulas, messages };
}

test('Fantasia Final exibe a tabela atual em cópia antiga do NPC', async () => {
    setupFoundryMocks();
    const actor = mutableActor('npc', { npc_nome: 'NPC', nvl_respiracao: 4, npc_pdr_base: 30 });
    const form = { uuid: 'Item.fantasia', actor, system: { props: {
        forma_id: 'sonhos_10', respiracao_nome: 'Sonhos', nivel_req: 2,
        tem_nvl2: 1, tem_nvl3: 1, tem_nvl4: 1,
        nvl2_dano: '4d4', nvl3_dano: '4d4', nvl4_dano: '4d4',
    } } };
    globalThis.fromUuid = async () => form;
    let content;
    foundry.applications.api.DialogV2.wait = async (dialog) => { content = dialog.content; return null; };
    await useBreathForm({ itemUuid: form.uuid });
    assert.match(content, /Nível 2 7 PDR · Dano: 4d4/);
    assert.match(content, /Nível 3 9 PDR · Dano: 6d4/);
    assert.match(content, /Nível 4 10 PDR · Dano: 7d4/);
});

test('recursos do NPC incluem metal rosa e preservam gasto/recuperação próprios', () => {
    const props = { npc_nome: 'NPC', npc_nivel: 7, npc_pdr_base: 10, npc_pdr_gasto_valor: 5,
        npc_pdr_recuperado: 2, metal_escolhido: 'metal_rosa', nvl_respiracao: 2, npc_pdv_base: 30, npc_pdv_dano: 5 };
    assert.deepEqual(breathingPdrInfo(props), { pdrMax: 18, pdrCurrent: 15 });
    assert.deepEqual(breathingPdvInfo(props), { pdvMax: 30, pdvCurrent: 25, pdvRaw: 25 });
});

test('Martelo aceita aliado NPC e cobra exclusivamente seu PDR', () => {
    const ally = mutableActor('ally', { npc_nome: 'Aliado', npc_pdr_base: 10, npc_pdr_gasto_valor: 9 });
    ally.items.push({ system: { props: { respiracao_nome: 'Pedra' } } });
    const listed = metalHammerSynergyAllies({ uuid: 'Actor.user' }, [ally]);
    assert.equal(listed.length, 1);
    assert.equal(listed[0].pdrAvailable, 1);
    assert.deepEqual(spendMetalHammerSynergyPdr(ally).patch, { 'system.props.npc_pdr_gasto_valor': 10 });
    ally.system.props.npc_pdr_gasto_valor = 10;
    assert.equal(spendMetalHammerSynergyPdr(ally).ok, false);
});

test('status de Forma usa o contrato Slayer no NPC e Oni no Minion', async () => {
    for (const [id, props, key] of [
        ['npc', { npc_nome: 'NPC' }, 'status_slayer_dados'],
        ['minion', { oni_minion_tipo: 'minion' }, 'status_oni_dados'],
    ]) {
        const actor = mutableActor(id, props);
        await applyBreathingStatus(actor, 'invisivel_inalvejavel', { remainingTurns: 1 });
        assert.deepEqual(JSON.parse(actor.system.props[key]).active, ['invisivel_inalvejavel']);
        assert.equal(actor.system.props.status_npc_dados, undefined);
        assert.equal(actor.system.props.status_oni_minion_dados, undefined);
    }
});

test('Burizado pela Forma ativa recupera PDR e concede furtividade ao NPC', async () => {
    setupFoundryMocks();
    const owner = mutableActor('snow', { nome_slayer: 'Neve', resp_neve_estado: JSON.stringify({
        blizzard: { turns: 2, ownerUuid: 'Actor.snow', lastGrantRound: 0 },
    }) });
    const ally = mutableActor('npc', { npc_nome: 'NPC', npc_pdr_base: 10, npc_pdr_gasto_valor: 5,
        resp_slayer_display: 'resp_slayer_agua' });
    const form = { uuid: 'Item.snow', actor: owner, name: 'Burizado', system: { props: {
        forma_id: 'neve_03', respiracao_nome: 'Neve', tem_nvl1: 1, nvl1_custo: 2,
    } } };
    globalThis.fromUuid = async (uuid) => uuid === form.uuid ? form : owner;
    game.combat = { round: 1 };
    game.user.targets = new Set([{ actor: ally }]);
    await useBreathForm({ itemUuid: form.uuid });
    assert.equal(ally.system.props.npc_pdr_gasto_valor, 3);
    assert.equal(ally.system.props.pdr_slayer_gasto_valor, 0);
    assert.deepEqual(JSON.parse(ally.system.props.status_slayer_dados).active, ['invisivel_inalvejavel']);
});

for (const [key, state, label] of [
    ['resp_agua_estado', { pendingDamage: { source: 'agua_01', formula: '2d6', uses: 1 } }, 'Respiração da Água'],
    ['resp_nevoa_estado', { pendingDamage: { source: 'nevoa_01', formula: '2d6', uses: 1 } }, 'Respiração da Névoa'],
    ['resp_neve_estado', { pendingDamage: { source: 'neve_01', formula: '2d6', uses: 1 } }, 'Respiração da Neve'],
    ['resp_vento_estado', { pendingDamage: { source: 'vento_02', formula: '2d6', uses: 1 } }, 'Respiração do Vento'],
]) {
    test(`NPC injeta e consome dano preparado de ${label}`, async () => {
        const { formulas, messages } = setupDamage();
        const actor = mutableActor('npc', { npc_nome: 'NPC', [key]: JSON.stringify(state) });
        await rollDamage({ actor });
        assert.ok(formulas.includes('2d6'));
        assert.ok(messages.some((message) => message.flavor?.includes(label)));
        assert.equal(JSON.parse(actor.system.props[key]).pendingDamage, undefined);
    });
}

test('NPC soma metal vermelho e Bônus Fixo uma vez no dano', async () => {
    const { messages } = setupDamage();
    const actor = mutableActor('npc', { npc_nome: 'NPC', metal_escolhido: 'metal_vermelha', npc_bonus_dano: 3 });
    await rollDamage({ actor });
    const flavor = messages.at(-1).flavor;
    assert.match(flavor, /Bônus Derivado/);
    assert.equal((flavor.match(/Bônus da ficha/g) ?? []).length, 0);
});

for (const npc of [false, true]) {
    test(`Água 5 no ${npc ? 'NPC' : 'Slayer'} recupera PDR apenas ao finalizar o alvo`, async () => {
        for (const targetLife of [8, 20]) {
            setupDamage();
            const spentKey = npc ? 'npc_pdr_gasto_valor' : 'pdr_slayer_gasto_valor';
            const actor = mutableActor('attacker', {
                ...(npc ? { npc_nome: 'NPC' } : { nome_slayer: 'Slayer' }), [spentKey]: 5,
                resp_agua_estado: JSON.stringify({ pendingDamage: { source: 'agua_05', uses: 1, recoverPdrOnKill: 3 } }),
            });
            const target = mutableActor('target', { npc_nome: 'Alvo', npc_pdv_base: targetLife, npc_pdv_dano: 0 });
            game.user.targets = new Set([{ actor: target }]);
            await rollDamage({ actor });
            assert.equal(actor.system.props[spentKey], targetLife === 8 ? 2 : 5);
        }
    });
    test(`Vento 9 no ${npc ? 'NPC' : 'Slayer'} recupera 5 PDV depois do dano confirmado`, async () => {
        setupDamage();
        const healedKey = npc ? 'npc_pdv_curado' : 'pdv_slayer_curado';
        const actor = mutableActor('attacker', {
            ...(npc ? { npc_nome: 'NPC', npc_pdv_base: 30 } : { nome_slayer: 'Slayer', pdv_slayer_total_conta: 30 }),
            [healedKey]: 2,
            resp_vento_estado: JSON.stringify({ pendingDamage: {
                source: 'vento_09', formula: '2d6', uses: 1,
                tufao: { healThresholdPercent: 10, healOnBigHit: 5, bleedSaveDc: 1 },
            } }),
        });
        const target = mutableActor('target', { npc_nome: 'Alvo', npc_pdv_base: 100, npc_pdv_dano: 0 });
        game.user.targets = new Set([{ actor: target }]);
        await rollDamage({ actor });
        assert.equal(actor.system.props[healedKey], 7);
    });
}
