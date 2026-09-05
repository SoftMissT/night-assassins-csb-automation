import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { bloodPactPayment } from '../scripts/blood-pact-core.mjs';
import { resetDualSoulBond } from '../scripts/dual-soul-reset-service.mjs';
import { awakenSpecialWeapon } from '../scripts/special-weapon-awakening-service.mjs';
import { openDualSoulCeremony } from '../scripts/dual-soul-ceremony-service.mjs';
import { MODULE_ID } from '../scripts/constants.mjs';

const globals = ['game', 'ui', 'foundry', 'ChatMessage', 'Roll'];
const saved = Object.fromEntries(globals.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
afterEach(() => {
    for (const key of globals) {
        if (saved[key]) Object.defineProperty(globalThis, key, saved[key]);
        else delete globalThis[key];
    }
});

function fixture({ gm = true, confirm = true, completed = true, wait = 'close', rollTotals = [5, 40, 23] } = {}) {
    const writes = [], warnings = [], dialogs = [], chats = [];
    const actor = {
        documentName: 'Actor', name: 'Slayer', uuid: 'Actor.test', isOwner: true,
        system: { props: { pdv_slayer_atual: 80, pdv_slayer_dano_tomado: 20,
            pdv_slayer_total_conta: 40, nvl_14_bonus_choice: 'pdv_vit3', atr_vit_valor_config: 20 } },
        async update(patch, options) {
            writes.push({ target: 'actor', patch, options });
            const before = this.system.props.pdv_slayer_dano_tomado;
            this.system.props.pdv_slayer_dano_tomado = patch['system.props.pdv_slayer_dano_tomado'];
            this.system.props.pdv_slayer_atual -= this.system.props.pdv_slayer_dano_tomado - before;
        },
    };
    const ceremonyDefinition = {
        version: 1,
        test1: { formula: '1d20' },
        teste_1_lado_dominante: { '1-8': 'Demônio', '9-12': 'Equilíbrio', '13-20': 'Entidade' },
        teste_2_intensidade_vinculo: { '3-60': 'Vínculo' },
        teste_3_gatilho_lado_adormecido: { '3-60': 'Gatilho canônico' },
        teste_de_despertar: { 'Vínculo Forte': 17 },
    };
    const ceremony = { ...ceremonyDefinition, ...(completed ? { runtime: {
        completed: true, dominance: { dominantKind: 'entidade', display: 'Entidade' },
        intensity: { name: 'Forte', awakeningCd: 17 }, trigger: { publicText: 'Gatilho' },
    } } : {}) };
    const flags = {};
    const item = {
        id: 'one', uuid: 'Actor.test.Item.one', name: 'Arma de teste', parent: actor,
        documentName: 'Item', isOwner: true, type: 'equippableItem',
        system: { props: {
            arma_categoria: 'especial', arma_entidade: 'Entidade', arma_demonio: 'Demônio',
            arma_especial_estado_atual: 'Selada', arma_especial_integracao: 'Dualidade',
            arma_marcas_demonio: 3, arma_lado_dominante: 'Entidade',
            dupla_alma_cerimonia_json: JSON.stringify(ceremony),
            dupla_alma_vinculo_json: JSON.stringify({ version: 1, runtime: { value: 4 }, intensidade: 'Forte', valor: 4 }),
            arma_ritual: { nome: 'Sangue da arma', passos: ['Banhar a arma'], pacto_completo: 'Acorda.' },
        } },
        getFlag: (_module, key) => flags[key],
        async setFlag(_module, key, value) { flags[key] = value; },
        async update(patch, options) {
            writes.push({ target: 'item', patch, options });
            for (const [key, value] of Object.entries(patch)) {
                if (key.startsWith('system.props.')) this.system.props[key.slice(13)] = value;
                if (key.startsWith(`flags.${MODULE_ID}.`)) flags[key.slice(`flags.${MODULE_ID}.`.length)] = value;
            }
        },
    };
    actor.items = [item];
    const pack = { getIndex: async () => [{ _id: 'canonical', name: item.name }],
        getDocument: async () => ({ system: { props: { ...item.system.props } } }) };
    globalThis.game = { user: { id: 'gm', isGM: gm },
        packs: new Map([[`${MODULE_ID}.night-assassins-armas-slayer`, pack]]),
        combat: { id: 'combat', started: true, round: 2 },
        settings: { get: () => 'publicroll' }, dice3d: null };
    globalThis.ui = { notifications: { warn: text => { warnings.push(text); }, error: text => { warnings.push(text); }, info: () => {} } };
    let confirmIndex = 0;
    globalThis.foundry = { applications: { api: { DialogV2: {
        confirm: async data => { dialogs.push(data); return typeof confirm === 'function' ? confirm(data, confirmIndex++) : confirm; },
        wait: async data => { dialogs.push(data); return typeof wait === 'function' ? wait(data) : wait; },
    } } } };
    const totals = [...rollTotals];
    globalThis.Roll = class {
        constructor(formula) { this.formula = formula; this.total = totals.shift(); }
        async evaluate() { return this; }
        async toMessage() { return { id: `roll-${this.formula}` }; }
    };
    globalThis.ChatMessage = { getSpeaker: () => ({}), create: async data => { chats.push(data); return { id: `chat-${chats.length}` }; } };
    return { actor, item, writes, warnings, flags, dialogs, chats, ceremony };
}

test('sangue usa o hidden atual, preserva N14 e soma somente o custo ao dano tomado', () => {
    for (const [current, remaining] of [[100, 10], [80, 8], [55, 6], [37, 4], [21, 3], [10, 1], [101, 11], [1, 1]]) {
        const result = bloodPactPayment({ pdv_slayer_atual: String(current), pdv_slayer_dano_tomado: '20', pdv_slayer_total_conta: 999 });
        assert.equal(result.remaining, remaining);
        assert.equal(result.damageAfter, 20 + current - remaining);
    }
});

test('sangue recusa PDV ausente/inválido sem reconstruir uma fórmula diferente', () => {
    for (const value of [undefined, null, '', 'não calculado', Infinity, NaN, true, {}]) {
        assert.throws(() => bloodPactPayment({ pdv_slayer_atual: value, pdv_slayer_dano_tomado: 0 }));
        assert.throws(() => bloodPactPayment({ pdv_slayer_atual: 50, pdv_slayer_dano_tomado: value }));
    }
    assert.equal(bloodPactPayment({ pdv_slayer_atual: 0, pdv_slayer_dano_tomado: 20 }).cost, 0);
});

test('Primeiro Despertar usa o sangue já pago na Cerimônia e não cobra PDV novamente', async () => {
    const f = fixture();
    const result = await awakenSpecialWeapon({ actor: f.actor, item: f.item });
    assert.equal(result.ok, true);
    assert.equal(f.actor.system.props.pdv_slayer_atual, 80);
    assert.equal(f.writes.filter(w => w.target === 'actor').length, 0);
    assert.equal(f.chats.length, 1);
    assert.match(f.dialogs[0].content, /Cerimônia concluída/);
    assert.deepEqual(f.dialogs[0].classes, ['na-dual-soul-dialog']);
    assert.match(f.chats[0].content, /já foi oferecido na Cerimônia/);
    await awakenSpecialWeapon({ actor: f.actor, item: f.item });
    assert.equal(f.writes.filter(w => w.target === 'actor').length, 0);
});

test('cancelar o Primeiro Despertar não altera a ficha', async () => {
    const f = fixture({ confirm: false });
    assert.equal(await awakenSpecialWeapon({ actor: f.actor, item: f.item }), null);
    assert.equal(f.writes.length, 0);
});

test('Cerimônia aplica 90% do PDV atual em Dano Tomado antes de gravar o vínculo', async () => {
    const f = fixture({ completed: false, wait: true });
    const result = await openDualSoulCeremony({ actor: f.actor, item: f.item });
    assert.equal(result.ok, true);
    assert.equal(f.actor.system.props.pdv_slayer_atual, 8);
    const payment = f.writes.find(w => w.target === 'actor');
    assert.deepEqual(payment.patch, { 'system.props.pdv_slayer_dano_tomado': 92 });
    assert.equal(payment.options.naLifeDeath, true);
    assert.equal(payment.options.naBloodPact, true);
    assert.equal(JSON.parse(f.item.system.props.dupla_alma_cerimonia_json).runtime.bloodPact.cost, 72);
    assert.match(f.dialogs.at(-1).content, /Após a Cerimônia/);
    assert.match(f.dialogs.at(-1).content, /Sangue da arma/);
    assert.match(f.chats.at(-1).content, /80 →\s*<strong>8 PDV<\/strong>/);
});

test('cancelar a oferta final não cobra sangue nem grava a Cerimônia', async () => {
    const f = fixture({ completed: false, wait: true, confirm: (_data, index) => index === 0 });
    assert.equal(await openDualSoulCeremony({ actor: f.actor, item: f.item }), null);
    assert.equal(f.writes.length, 0);
    assert.equal(JSON.parse(f.item.system.props.dupla_alma_cerimonia_json).runtime, undefined);
});

test('mudança de PDV na confirmação da Cerimônia aborta sem cobrança obsoleta', async () => {
    const f = fixture({ completed: false, wait: true, confirm: (_data, index) => {
        if (index === 1) f.actor.system.props.pdv_slayer_atual = 70;
        return true;
    } });
    await openDualSoulCeremony({ actor: f.actor, item: f.item });
    assert.equal(f.writes.length, 0);
    assert.match(f.warnings[0], /PDV mudou/);
});

test('falha de persistência do sangue impede a gravação da Cerimônia', async () => {
    const f = fixture({ completed: false, wait: true });
    f.actor.update = async (patch, options) => {
        f.writes.push({ target: 'actor', patch, options });
    };
    await assert.rejects(
        openDualSoulCeremony({ actor: f.actor, item: f.item }),
        /não foi persistido em Dano Tomado/
    );
    assert.equal(f.writes.filter(w => w.target === 'item').length, 0);
    assert.equal(f.chats.length, 0);
});

test('falha ao gravar o vínculo estorna o Sangue de Pacto da Cerimônia', async () => {
    const f = fixture({ completed: false, wait: true });
    const originalUpdate = f.item.update.bind(f.item);
    f.item.update = async (patch, options) => {
        if (Object.hasOwn(patch, 'system.props.dupla_alma_cerimonia_json')) {
            throw new Error('falha simulada no Item');
        }
        return originalUpdate(patch, options);
    };

    await assert.rejects(
        openDualSoulCeremony({ actor: f.actor, item: f.item }),
        /falha simulada no Item/
    );
    assert.equal(f.actor.system.props.pdv_slayer_dano_tomado, 20);
    assert.equal(f.actor.system.props.pdv_slayer_atual, 80);
    assert.equal(f.writes.filter(w => w.target === 'actor').length, 2);
    assert.equal(f.writes.filter(w => w.options.naBloodPactRollback).length, 1);
    assert.equal(f.chats.length, 0);
});

test('reset GM arquiva vínculo da arma escolhida e preserva Marcas, integração, vida e uso', async () => {
    const f = fixture();
    f.flags.specialWeaponAwakeningUsedCombat = 'combat';
    const actorBefore = structuredClone(f.actor.system.props);
    await resetDualSoulBond(f.item);
    const props = f.item.system.props;
    assert.equal(props.arma_marcas_demonio, 3);
    assert.equal(props.arma_especial_integracao, 'Dualidade');
    assert.deepEqual(f.actor.system.props, actorBefore);
    assert.equal(f.flags.specialWeaponAwakeningUsedCombat, 'combat');
    assert.equal(JSON.parse(props.dupla_alma_cerimonia_json).runtime, undefined);
    assert.deepEqual(JSON.parse(props.dupla_alma_cerimonia_json).test1, { formula: '1d20' });
    assert.deepEqual(JSON.parse(props.dupla_alma_vinculo_json), { version: 1 });
    assert.deepEqual(f.flags.dualSoulBondResetHistory[0].ceremony, f.ceremony);
    assert.equal(f.writes.length, 1);
    assert.equal(f.writes[0].target, 'item');
    await assert.rejects(resetDualSoulBond(f.item), /não possui vínculo/);
});

test('reset recusa jogador mesmo com ownership e cancelar não altera nada', async () => {
    const f = fixture({ gm: false });
    await assert.rejects(resetDualSoulBond(f.item), /Somente o GM/);
    assert.equal(f.dialogs.length, 0);
    game.user.isGM = true;
    foundry.applications.api.DialogV2.confirm = async () => false;
    assert.equal(await resetDualSoulBond(f.item), null);
    assert.equal(f.writes.length, 0);
});

test('reset bloqueia despertar, resistência pendente e todas as fases de possessão/empréstimo', async () => {
    const f = fixture();
    for (const state of ['active', 'pending', 'waiting_turn', 'manual_turn', 'in_turn']) {
        f.item.system.props.dupla_alma_despertar_runtime_json = JSON.stringify({ pending: false, consequence: { state } });
        await assert.rejects(resetDualSoulBond(f.item), /Encerre o despertar/);
    }
    f.item.system.props.dupla_alma_despertar_runtime_json = '{"pending":true}';
    await assert.rejects(resetDualSoulBond(f.item), /Encerre o despertar/);
    f.item.system.props.dupla_alma_despertar_runtime_json = '{}';
    f.item.system.props.arma_especial_estado_atual = 'Primeiro Despertar';
    await assert.rejects(resetDualSoulBond(f.item), /Encerre o despertar/);
    assert.equal(f.writes.length, 0);
});

test('reset revalida permissão após confirmar e escapa nome editável', async () => {
    const f = fixture({ confirm: () => { game.user.isGM = false; return true; } });
    f.item.name = '<img src=x>';
    await assert.rejects(resetDualSoulBond(f.item), /Somente o GM/);
    assert.match(f.dialogs[0].content, /&lt;img src=x&gt;/);
    assert.equal(f.dialogs[0].defaultYes, false);
    assert.equal(f.writes.length, 0);
});

test('Cerimônia concluída só oferece reset ao GM e informa que o sangue já foi pago', async () => {
    for (const gm of [false, true]) {
        const f = fixture({ gm });
        await openDualSoulCeremony({ actor: f.actor, item: f.item });
        assert.equal(f.dialogs[0].buttons.some(b => b.action === 'reset'), gm);
        assert.ok(f.dialogs[0].classes.includes('na-dual-soul-completed-dialog'));
        assert.match(f.dialogs[0].content, /Sangue de Pacto já foi oferecido/);
        assert.match(f.dialogs[0].content, /Primeiro Despertar não cobra/);
        assert.equal(f.writes.length, 0);
        assert.equal(f.chats.length, 0);
    }
});
