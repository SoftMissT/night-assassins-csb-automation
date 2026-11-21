import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { makeActor } from './fixtures/actor.mjs';
import { setupFoundryMocks } from './fixtures/foundry-mock.mjs';
import { MODULE_ID } from '../scripts/constants.mjs';
import { SETTINGS } from '../scripts/settings.mjs';
import { consumeOniActions, parseActionState } from '../scripts/action-service.mjs';
import { applyOniDamage } from '../scripts/damage-relay.mjs';
import { rollHit } from '../scripts/hit-service.mjs';
import { rollTest } from '../scripts/roll-service.mjs';
import { processActorStatusTiming } from '../scripts/status-engine.mjs';
import { registerOniRegenerationEngine, useOniRegeneration } from '../scripts/oni/regeneration-runtime.mjs';
import { chooseTitanImpact, useOniSpecialization } from '../scripts/oni/specialization-runtime.mjs';
import { ONI_TOXIC_PENDING, RECOVERY_MASTER, TITAN, TOXIC } from '../scripts/oni/specialization-rules.mjs';

let variant;
beforeEach(() => {
    setupFoundryMocks();
    variant = 'vanilla';
    game.user.isGM = true;
    game.settings = { get: (_id, key) => key === SETTINGS.rulesSelection ? JSON.stringify({ classes: variant }) : undefined };
    ChatMessage.create = async () => ({});
});

function oni(classKey, props = {}, uuid = 'Actor.oni') {
    const actor = makeActor({ uuid, props: {
        nome_oni: 'Oni', nvl_num: 12, na_vanilla_class: classKey, acoes_oni_dados: '',
        pdk_oni_total_conta: 12, pdk_oni_gasto_valor: 7, pdk_oni_curado: 0,
        pdv_oni_curado: 0, pdv_oni_total_conta: 40, status_oni_dados: '',
        fdv_display: 4, vit_display: 3, for_display: 5, ...props,
    } });
    const flags = {};
    actor.getFlag = (_module, key) => flags[key];
    actor.setFlag = async (_module, key, value) => { flags[key] = value; };
    actor.unsetFlag = async (_module, key) => { delete flags[key]; };
    actor.update = async (patch) => {
        for (const [key, value] of Object.entries(patch)) {
            if (key.startsWith('system.props.')) actor.system.props[key.slice('system.props.'.length)] = value;
            if (key.startsWith(`flags.${MODULE_ID}.`)) flags[key.slice(`flags.${MODULE_ID}.`.length)] = value;
        }
    };
    return actor;
}

const choose = (action, form) => {
    foundry.applications.api.DialogV2.wait = async config => config.buttons.find(button => button.action === action)?.callback(null, { form });
};

test('Carregar gasta 2 PDK e Ação Única e termina ao consumir Movimento', async () => {
    const actor = oni(TITAN);
    game.combat = { started: true, id: 'combat', round: 1, turn: 0, combatant: { actor } };
    choose('charge');
    await useOniSpecialization({ actor });
    const props = actor.system.props;
    assert.equal(props.pdk_oni_gasto_valor, 9);
    assert.equal(props.oni_vanilla_titan_charge, 5);
    assert.equal(parseActionState(props.acoes_oni_dados).round.unica, 1);
    await consumeOniActions(actor, 'ataque');
    assert.equal(props.oni_vanilla_titan_charge, 5);
    await consumeOniActions(actor, 'movimento');
    assert.equal(props.oni_vanilla_titan_charge, 0);
});

test('Carregar não atravessa a virada para outro combatente', async () => {
    const actor = oni(TITAN, { oni_vanilla_titan_charge: 5 });
    const combatant = { id: 'before', actor };
    const hooks = {};
    game.users = [{ ...game.user, active: true }];
    globalThis.Hooks = { on: (name, callback) => { hooks[name] = callback; } };
    registerOniRegenerationEngine();
    await hooks.combatTurnChange({ combatants: new Map([[combatant.id, combatant]]) },
        { round: 1, turn: 0, combatantId: combatant.id }, { round: 1, turn: 1, combatantId: 'next' });
    assert.equal(actor.system.props.oni_vanilla_titan_charge, 0);
});

test('Imposição usa FDV CD 12, Ação Especial e impede Regeneração no mesmo turno', async () => {
    const actor = oni(RECOVERY_MASTER, { pdk_oni_gasto_valor: 2 });
    choose('restore');
    let rolls = 0;
    Roll.create = (formula) => {
        assert.equal(formula, '1d20 + (4)');
        rolls++;
        return { evaluate: async () => ({ total: 12, toMessage: async () => {} }) };
    };
    assert.equal((await useOniSpecialization({ actor })).recovered, 2);
    assert.equal(actor.system.props.pdk_oni_curado, 2);
    assert.equal(parseActionState(actor.system.props.acoes_oni_dados).turn.especial, 1);
    await useOniRegeneration({ actor });
    assert.equal(rolls, 1);
});

test('Mestre soma +2 apenas na Regeneração bem-sucedida e escolhe um máximo uma vez', async () => {
    const actor = oni(RECOVERY_MASTER, { nvl_num: 7 });
    const formulas = [];
    Roll.create = formula => {
        formulas.push(formula);
        return { evaluate: async () => ({ total: formulas.length === 1 ? 12 : 8, toMessage: async () => {} }) };
    };
    const result = await useOniRegeneration({ actor });
    assert.equal(result.healing, 8);
    assert.match(formulas[1], /\+ 2$/);

    actor.system.props.nvl_num = 12;
    choose('pdv');
    assert.equal((await useOniSpecialization({ actor })).bonus, 15);
    assert.equal(actor.system.props.oni_vanilla_mestre_pdv_bonus, 15);
    choose('pdk');
    await useOniSpecialization({ actor });
    assert.equal(actor.system.props.oni_vanilla_mestre_pdk_bonus, undefined);
});

test('Impacto limita gasto ao atributo FDV e ao PDK disponível', async () => {
    const actor = oni(TITAN, { pdk_oni_gasto_valor: 9 });
    const request = value => choose('impact', { elements: { 'oni-impact': { value } } });
    request('4');
    assert.equal(await chooseTitanImpact(actor), 0);
    request('3');
    assert.equal(await chooseTitanImpact(actor), 3);
    variant = 'homebrew';
    assert.equal(await chooseTitanImpact(actor), 0);
});

test('Titan obtém crítico natural 19 apenas no Acerto desarmado Vanilla', async () => {
    const actor = oni(TITAN);
    Roll.create = () => ({ evaluate: async () => ({ total: 22, dice: [{ results: [{ result: 19 }] }], toMessage: async () => {} }) });
    const loadDialog = () => {
        const responses = [
            { mode: 'normal', bonusRaw: '', cdVal: 0, rollCount: 1, actionType: 'ataque', weaponId: '' },
            { hit: true },
        ];
        foundry.applications.api.DialogV2.wait = async () => responses.shift();
    };
    loadDialog();
    assert.equal((await rollHit({ actor, autoDamage: false, skipActionConsumption: true })).attempts[0].critical, true);
    variant = 'homebrew';
    loadDialog();
    assert.equal((await rollHit({ actor, autoDamage: false, skipActionConsumption: true })).attempts[0].critical, false);
});

test('Demolir usa Acerto e Dano contra o atacante declarado e Impacto gasta PDK nessa execução', async () => {
    const actor = oni(TITAN);
    const enemy = oni('', {}, 'Actor.enemy');
    game.combat = { id: 'combat', started: true, combatants: [{ actor }, { actor: enemy }] };
    const formulas = [];
    Roll.create = formula => {
        formulas.push(formula);
        const isD20 = formula.includes('d20');
        return { evaluate: async () => ({ total: isD20 ? 20 : 6, toMessage: async () => ({}),
            dice: [{ results: [{ result: isD20 && formulas.length === 1 ? 20 : 10 }] }] }) };
    };
    foundry.applications.api.DialogV2.confirm = async ({ window }) => {
        assert.match(window.title, /Demolir/u);
        return true;
    };
    foundry.applications.api.DialogV2.wait = async ({ window, content }) => {
        if (window.title === 'Acerto') return { mode: 'normal', bonusRaw: '', cdVal: 0, rollCount: 1, weaponId: '' };
        if (/Confirme|Confirmar/u.test(window.title)) return { hit: true };
        if (window.title === 'Impacto · Titan') return 2;
        if (/Autorizar/u.test(window.title)) return { approved: true, normalDamage: 8, woundDamage: 0, damageTypes: ['cortante'] };
        if (window.title.startsWith('Rolar Dano')) {
            assert.match(content, /2d8\+@DEX/u);
            return { nome: 'Garras', entradas: [{ dado: '2d8+@DEX', fixo: 0, selAttrs: [], selTiposDano: ['cortante'], tipoAcao: 'ataque' }] };
        }
        return { mode: 'normal', bonusRaw: '', cdVal: 10, attackerUuid: enemy.uuid };
    };
    const result = await rollTest({ actor, test: 'Esquiva', attr: 'DEX' });
    assert.equal(result.success, true);
    assert.equal(actor.system.props.pdk_oni_gasto_valor, 9);
    assert.equal(parseActionState(actor.system.props.acoes_oni_dados).turn.ataque, 0);
    assert.equal(enemy.system.props.pdv_oni_dano_tomado, 8);
});

test('Decomposição via relay dura um turno e reduz apenas o componente venenoso contra Tóxico Rank B', async () => {
    const source = oni(TOXIC, {}, 'Actor.source');
    const target = oni(TOXIC, {}, 'Actor.target');
    game.combat = { started: true, id: 'combat', combatants: [{ actor: source }, { actor: target }] };
    fromUuid = async uuid => uuid === source.uuid ? source : null;
    const result = await applyOniDamage(target, 10, {
        critical: true, oniToxicUnarmedCritical: true, hostile: true, sourceActorUuid: source.uuid,
        damageTypes: ['venenoso', 'concussao'],
        components: [{ types: ['venenoso'], subtotal: 4 }, { types: ['concussao'], subtotal: 6 }],
    });
    assert.equal(result.appliedDamage, 8);
    assert.equal(target.getFlag(MODULE_ID, ONI_TOXIC_PENDING).damage, 3);
    await processActorStatusTiming(target, 'end');
    assert.equal(target.system.props.pdv_oni_dano_tomado, 8);
    await processActorStatusTiming(target, 'start');
    assert.equal(target.system.props.pdv_oni_dano_tomado, 9);
    assert.equal(target.getFlag(MODULE_ID, ONI_TOXIC_PENDING), undefined);
    await processActorStatusTiming(target, 'start');
    assert.equal(target.system.props.pdv_oni_dano_tomado, 9);
});
