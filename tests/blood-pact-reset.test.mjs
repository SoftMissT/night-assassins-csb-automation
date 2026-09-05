import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { bloodPactPayment } from '../scripts/blood-pact-core.mjs';
import { resetDualSoulBond } from '../scripts/dual-soul-reset-service.mjs';
import { awakenSpecialWeapon } from '../scripts/special-weapon-awakening-service.mjs';
import { openDualSoulCeremony } from '../scripts/dual-soul-ceremony-service.mjs';
import { MODULE_ID } from '../scripts/constants.mjs';

const globals = ['game', 'ui', 'foundry', 'ChatMessage'];
const saved = Object.fromEntries(globals.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
afterEach(() => {
    for (const key of globals) {
        if (saved[key]) Object.defineProperty(globalThis, key, saved[key]);
        else delete globalThis[key];
    }
});

function fixture({ gm = true, confirm = true } = {}) {
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
    const ceremony = { version: 1, test1: { formula: '1d20' }, runtime: {
        completed: true, dominance: { dominantKind: 'entidade', display: 'Entidade' },
        intensity: { name: 'Forte', awakeningCd: 17 }, trigger: { publicText: 'Gatilho' },
    } };
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
        combat: { id: 'combat', started: true, round: 2 } };
    globalThis.ui = { notifications: { warn: text => { warnings.push(text); }, info: () => {} } };
    globalThis.foundry = { applications: { api: { DialogV2: {
        confirm: async data => { dialogs.push(data); return typeof confirm === 'function' ? confirm() : confirm; },
        wait: async data => { dialogs.push(data); return 'close'; },
    } } } };
    globalThis.ChatMessage = { getSpeaker: () => ({}), create: async data => { chats.push(data); } };
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

test('Primeiro Despertar aplica 72 ao dano tomado: PDV 80 → 8; sem mexer nos hidden', async () => {
    const f = fixture();
    const result = await awakenSpecialWeapon({ actor: f.actor, item: f.item });
    assert.equal(result.ok, true);
    assert.equal(f.actor.system.props.pdv_slayer_atual, 8);
    const payment = f.writes.find(w => w.target === 'actor');
    assert.deepEqual(payment.patch, { 'system.props.pdv_slayer_dano_tomado': 92 });
    assert.equal(payment.options.naLifeDeath, true);
    assert.equal(payment.options.naBloodPact, true);
    assert.equal(f.chats.length, 1);
    assert.match(f.dialogs[0].content, /Sangue da arma/);
    await awakenSpecialWeapon({ actor: f.actor, item: f.item });
    assert.equal(f.writes.filter(w => w.target === 'actor').length, 1);
});

test('cancelar o ritual não cobra sangue', async () => {
    const f = fixture({ confirm: false });
    assert.equal(await awakenSpecialWeapon({ actor: f.actor, item: f.item }), null);
    assert.equal(f.writes.length, 0);
});

test('mudança de PDV durante a confirmação aborta sem cobrança obsoleta', async () => {
    const f = fixture({ confirm: () => { f.actor.system.props.pdv_slayer_atual = 70; return true; } });
    await awakenSpecialWeapon({ actor: f.actor, item: f.item });
    assert.equal(f.writes.length, 0);
    assert.match(f.warnings[0], /PDV mudou/);
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

test('Cerimônia concluída só oferece reset ao GM, sem cobrar sangue nem rerrolar', async () => {
    for (const gm of [false, true]) {
        const f = fixture({ gm });
        await openDualSoulCeremony({ actor: f.actor, item: f.item });
        assert.equal(f.dialogs[0].buttons.some(b => b.action === 'reset'), gm);
        assert.equal(f.writes.length, 0);
        assert.equal(f.chats.length, 0);
    }
});
