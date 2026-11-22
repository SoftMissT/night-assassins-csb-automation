import test from 'node:test';
import assert from 'node:assert/strict';
import { registerSettings, SETTINGS } from '../scripts/settings.mjs';
import {
    buildVanillaSelectionPatch,
    effectiveRulesAbility,
    getRuleSelection,
    getRulesProfile,
    isHomebrewExtra,
    isRulesStatusSelectable,
    migrateRulesSelection,
    openRulesProfileManager,
    openRulesTableManager,
    preserveVanillaSelectionsOnTemplateReload,
    ruleStatusCatalog,
    ruleVariant,
    saveRulesSelection,
    sheetRuleFlags,
    vanillaClassRank,
    vanillaDerivedBonuses,
    vanillaRuleCatalog,
    vanillaRuleSelection,
} from '../scripts/rules-profile.mjs';

test('atualizar template CSB preserva as escolhas Vanilla gravadas abaixo dos defaults computados', () => {
    const fields = ['na_vanilla_origin', 'na_vanilla_ability'];
    const actor = {
        system: { hidden: fields.map(name => ({ name, value: '' })) },
        toObject: () => ({ system: { props: {
            na_vanilla_origin: 'origem_aldeao', na_vanilla_ability: 'hab_escolhida_audicao',
            na_vanilla_metal: 'metal_preto',
        } } }),
    };
    const changes = { system: { hidden: [], props: {
        na_vanilla_origin: '', na_vanilla_ability: '', na_vanilla_metal: 'metal_despertar',
    } } };
    preserveVanillaSelectionsOnTemplateReload(actor, changes);
    assert.deepEqual(changes.system.props, {
        na_vanilla_origin: 'origem_aldeao', na_vanilla_ability: 'hab_escolhida_audicao',
        na_vanilla_metal: 'metal_despertar',
    });
    const ordinary = { system: { props: { na_vanilla_origin: '' } } };
    preserveVanillaSelectionsOnTemplateReload(actor, ordinary);
    assert.equal(ordinary.system.props.na_vanilla_origin, '');
});

test('registra seleção mundial e mantém oculto o perfil legado', () => {
    const previous = globalThis.game;
    const previousFoundry = globalThis.foundry;
    try {
        const registered = new Map();
        const menus = new Map();
        globalThis.foundry = { applications: { api: { ApplicationV2: class {} } } };
        globalThis.game = { settings: {
            register(_id, key, options) { registered.set(key, options); },
            registerMenu(_id, key, options) { menus.set(key, options); },
            get(_id, key) { return key === SETTINGS.rulesProfile ? 'vanilla' : undefined; },
        } };
        registerSettings();
        assert.equal(menus.get('rulesTableMenu').restricted, true);
        assert.equal(menus.get('rulesTableMenu').name, 'Regras da Mesa');
        const selection = registered.get(SETTINGS.rulesSelection);
        const legacy = registered.get(SETTINGS.rulesProfile);
        assert.equal(selection.scope, 'world');
        assert.equal(selection.config, false);
        assert.equal(selection.default, '');
        assert.equal(selection.requiresReload, true);
        assert.equal(legacy.scope, 'world');
        assert.equal(legacy.config, false);
        assert.deepEqual(Object.keys(legacy.choices), ['vanilla', 'homebrew']);
        assert.equal(getRulesProfile(), 'vanilla');
        assert.equal(effectiveRulesAbility({ hab_escolhida: 'hab_escolhida_tato', na_vanilla_ability: 'hab_escolhida_audicao' }),
            'hab_escolhida_audicao');
        assert.equal(effectiveRulesAbility({ hab_escolhida: 'hab_escolhida_audicao' }), '');
        assert.equal(effectiveRulesAbility({ hab_escolhida: 'hab_escolhida_tato' }, 'homebrew'), 'hab_escolhida_tato');
    } finally { globalThis.game = previous; globalThis.foundry = previousFoundry; }
});

test('catálogo separa origens e classes e mantém a progressão das fontes oficiais', () => {
    assert.equal(Object.keys(vanillaRuleCatalog('origin')).length, 7);
    assert.equal(Object.keys(vanillaRuleCatalog('origin', 'oni')).length, 6);
    assert.equal(Object.keys(vanillaRuleCatalog('class', 'oni')).length, 3);
    const classes = vanillaRuleCatalog('class');
    assert.equal(Object.keys(classes).length, 5);
    assert.equal(classes.classe_kakushi.page, 11);
    assert.equal(classes.classe_companheiro_oni.source, 'supplement');
    assert.deepEqual(classes.classe_usuario_de_duas_resp.secondaryLevels, [2, 6, 10, 14]);
    assert.equal(vanillaRuleCatalog('origin').origem_aldeao.pdvBase, 12);
    assert.equal(vanillaClassRank('nvl_3'), null);
    assert.equal(vanillaClassRank('nvl_4'), 'C');
    assert.equal(vanillaClassRank('nvl_12'), 'SS');
    assert.equal(vanillaClassRank(3, 'oni'), 'C');
    assert.equal(vanillaClassRank(11, 'oni'), 'B');
    assert.equal(vanillaClassRank(12, 'oni'), 'A');
});

test('metais e habilidades base exigem o contexto da rolagem', () => {
    const props = {
        na_vanilla_metal: 'metal_alvorada', na_vanilla_ability: 'hab_escolhida_audicao',
        metal_escolhido: 'metal_dourada', hab_escolhida: 'hab_escolhida_visao',
    };
    assert.deepEqual(vanillaDerivedBonuses(props), []);
    assert.deepEqual(vanillaDerivedBonuses(props, { isAttack: true }), []);
    assert.deepEqual(vanillaDerivedBonuses(props, { isAttack: true, isTechnique: true, dealsDamage: true })
        .map(({ channel, value }) => [channel, value]), [['acerto', 1]]);
    assert.deepEqual(vanillaDerivedBonuses(props, { testAttribute: 'CAR' }).map(({ channel, value }) => [channel, value]), [['teste', 1]]);
    assert.deepEqual(vanillaDerivedBonuses({ ...props, na_vanilla_metal: 'metal_serenidade' },
        { isTechnique: true, actionType: 'reacao', channel: 'bloqueio' })
        .map(({ channel, value }) => [channel, value]), [['bloqueio', 2]]);
    assert.deepEqual(vanillaDerivedBonuses({ na_vanilla_ability: 'hab_escolhida_tato' }, { channel: 'esquiva' }), []);
    assert.equal(vanillaDerivedBonuses({ na_vanilla_ability: 'hab_escolhida_tato' },
        { channel: 'esquiva', surpriseDefense: true })[0].value, 1);
});

test('Marechi usa nível do NPC e Metal Preto aplica o bônus; a seleção exige Descendente', () => {
    const props = { npc_nivel: 5, na_vanilla_ability: 'hab_escolhida_marechi', na_vanilla_metal: 'metal_preto' };
    assert.equal(vanillaRuleSelection(props, 'metal')?.key, 'metal_preto');
    assert.equal(vanillaDerivedBonuses(props).reduce((sum, { value }) => sum + value, 0), 6);
    props.na_vanilla_origin = 'origem_descendente';
    assert.equal(vanillaDerivedBonuses(props).reduce((sum, { value }) => sum + value, 0), 6);
    const defended = vanillaDerivedBonuses(props, { defenseAgainstAttack: true });
    assert.equal(defended.reduce((sum, { value }) => sum + value, 0), 7);
    assert.equal(buildVanillaSelectionPatch({ metal: 'metal_preto', origin: 'origem_isolado' }).ok, false);
    assert.equal(buildVanillaSelectionPatch({ metal: 'metal_preto', origin: 'origem_descendente' }).ok, true);
    assert.equal(buildVanillaSelectionPatch({ metal: 'metal_dourada' }).ok, false);
    assert.equal(buildVanillaSelectionPatch({ origin: 'origem_aldeao' }, 'oni').ok, false);
});

test('vanilla limita novos status e mantém os ativos anteriores removíveis', () => {
    const vanilla = ruleStatusCatalog({ profile: 'vanilla', active: ['distraido'] }).map(entry => entry.key);
    assert.ok(vanilla.includes('sangramento'));
    assert.ok(vanilla.includes('distraido'));
    assert.ok(!vanilla.includes('desorientado'));
    assert.equal(isRulesStatusSelectable('distraido', 'vanilla'), false);
    assert.equal(isRulesStatusSelectable('distraido', 'homebrew'), true);
});

test('migra o perfil legado uma vez, sem perder a escolha vanilla existente', async () => {
    const previous = globalThis.game;
    let stored = '';
    let writes = 0;
    try {
        globalThis.game = { settings: {
            get(_module, key) {
                if (key === SETTINGS.rulesSelection) return stored;
                if (key === SETTINGS.rulesProfile) return 'vanilla';
            },
            async set(_module, key, value) {
                assert.equal(key, SETTINGS.rulesSelection);
                stored = value;
                writes += 1;
            },
        } };
        const first = await migrateRulesSelection();
        const second = await migrateRulesSelection();
        const migrated = JSON.parse(stored);
        assert.equal(first.migrated, true);
        assert.equal(second.migrated, false);
        assert.equal(writes, 1);
        assert.equal(migrated.metal, 'vanilla');
        assert.equal(migrated.habilidades, 'vanilla');
        assert.equal(migrated.propriedades.nitoryu, 'vanilla');
        assert.equal(migrated.propriedades.sojutsu, false);
        assert.equal(Object.hasOwn(migrated, 'sojutsu'), false);
        assert.equal(migrated.sonhos, true);
        assert.equal(migrated.raposa, true);
    } finally { globalThis.game = previous; }
});

test('seleção granular mantém variantes independentes, propriedades e extras', () => {
    const previous = globalThis.game;
    try {
        globalThis.game = { settings: { get(_module, key) {
            if (key === SETTINGS.rulesSelection) return JSON.stringify({
                metal: 'vanilla', habilidades: 'homebrew', classes: 'vanilla',
                propriedades: { nitoryu: 'vanilla', morote: 'homebrew', sojutsu: false },
                raposa: false,
            });
            if (key === SETTINGS.rulesProfile) return 'vanilla';
        } } };
        assert.equal(ruleVariant('metal'), 'vanilla');
        assert.equal(ruleVariant('ability'), 'homebrew');
        assert.equal(ruleVariant('nitoryu'), 'vanilla');
        assert.equal(ruleVariant('morote'), 'homebrew');
        assert.equal(ruleVariant('propriedades'), null);
        assert.equal(getRuleSelection('classes'), 'vanilla');
        assert.equal(isHomebrewExtra('raposa'), false);
        assert.equal(isHomebrewExtra('sonhos'), true);
        assert.equal(isHomebrewExtra('sojutsu'), false);
        assert.equal(getRuleSelection('sojutsu'), false);
        assert.equal(Object.hasOwn(getRuleSelection(), 'sojutsu'), false);
        assert.equal(getRulesProfile(), 'homebrew');
    } finally { globalThis.game = previous; }
});

test('flags CSB refletem cada grupo e propriedade, mantendo o alias legado só no perfil total vanilla', () => {
    const previous = globalThis.game;
    try {
        globalThis.game = { settings: { get: (_module, key) => key === SETTINGS.rulesSelection
            ? JSON.stringify({ metal: 'vanilla', propriedades: { nitoryu: 'vanilla' } })
            : undefined } };
        const flags = sheetRuleFlags();
        assert.equal(flags.na_regras_metal, 1);
        assert.equal(flags.na_regras_propriedades_nitoryu, 1);
        assert.equal(flags.na_regras_propriedades_ryoto, 0);
        assert.equal(flags.na_regras_habilidades, 0);
        assert.equal(flags.na_rules_vanilla, 0);
    } finally { globalThis.game = previous; }
});

test('Sōjutsu fica desativado por padrão, sem desativar os extras antigos', () => {
    const previous = globalThis.game;
    try {
        globalThis.game = { settings: { get: () => undefined } };
        const selection = getRuleSelection();
        assert.equal(selection.propriedades.sojutsu, false);
        assert.equal(Object.hasOwn(selection, 'sojutsu'), false);
        assert.equal(isHomebrewExtra('sojutsu'), false);
        assert.equal(isHomebrewExtra('sonhos'), true);
        assert.equal(isHomebrewExtra('raposa'), true);
    } finally { globalThis.game = previous; }
});

test('salvar regras exige GM, valida schema e preserva grupos omitidos', async () => {
    const previous = globalThis.game;
    let stored = JSON.stringify({ metal: 'vanilla', habilidades: 'vanilla', raposa: false });
    try {
        globalThis.game = { user: { isGM: false }, settings: { get: (_module, key) => key === SETTINGS.rulesSelection ? stored : undefined,
            async set(_module, _key, value) { stored = value; } } };
        assert.deepEqual(await saveRulesSelection({ metal: 'homebrew' }), { ok: false, reason: 'gm-required' });
        globalThis.game.user.isGM = true;
        assert.deepEqual(await saveRulesSelection({ metal: 'invalid' }), { ok: false, reason: 'invalid-selection' });
        const result = await saveRulesSelection({ metal: 'homebrew' });
        assert.equal(result.ok, true);
        assert.equal(result.selection.metal, 'homebrew');
        assert.equal(result.selection.habilidades, 'vanilla');
        assert.equal(result.selection.raposa, false);
    } finally { globalThis.game = previous; }
});

test('Salvar na ficha grava somente as escolhas vanilla e fechar não grava', async () => {
    const previous = { game: globalThis.game, foundry: globalThis.foundry };
    const saved = [];
    const actor = {
        isOwner: true,
        system: { props: { npc_nome: 'NPC', metal_escolhido: 'metal_rosa', hab_escolhida: 'hab_escolhida_tsuyoi' } },
        async update(patch) { saved.push(patch); },
    };
    try {
        globalThis.game = { settings: { get: () => 'vanilla' } };
        let action = 'close';
        globalThis.foundry = { applications: { api: { DialogV2: { async wait(config) {
            assert.match(config.content, /Metal da Alvorada/);
            assert.match(config.content, /Kakushi/);
            return config.buttons.find(button => button.action === action).callback(null, { form: { elements: {
                metal: { value: 'metal_despertar' }, ability: { value: 'hab_escolhida_audicao' },
                origin: { value: 'origem_aldeao' }, class: { value: 'classe_kakushi' },
            } } });
        } } } } };
        await openRulesProfileManager({ actor });
        assert.deepEqual(saved, []);
        action = 'save';
        await openRulesProfileManager({ actor });
        assert.deepEqual(saved, [{
            'system.props.na_vanilla_metal': 'metal_despertar',
            'system.props.na_vanilla_ability': 'hab_escolhida_audicao',
            'system.props.na_vanilla_origin': 'origem_aldeao',
            'system.props.na_vanilla_class': 'classe_kakushi',
        }]);
    } finally { Object.assign(globalThis, previous); }
});

test('dono do Slayer só pode alterar escolhas da ficha que estão em Vanilla em perfil misto', async () => {
    const previous = { game: globalThis.game, foundry: globalThis.foundry, ui: globalThis.ui };
    const updates = [];
    const actor = {
        name: 'Slayer de QA', isOwner: true,
        system: { props: { nvl_pj: 'nvl_3', pdv_slayer_total_valor: 20, na_vanilla_origin: 'origem_aldeao' } },
        async update(patch) { updates.push(patch); },
    };
    try {
        globalThis.game = {
            user: { isGM: false },
            settings: {
                get: (_module, key) => key === SETTINGS.rulesSelection
                    ? JSON.stringify({ metal: 'vanilla', habilidades: 'homebrew', origens: 'homebrew', classes: 'homebrew' })
                    : undefined,
            },
        };
        globalThis.ui = { notifications: { info: assert.fail, warn: assert.fail } };
        globalThis.foundry = { applications: { api: { DialogV2: { async wait(config) {
            assert.equal(config.window.title, 'Escolhas Vanilla');
            assert.match(config.content, /<select name="metal">/u);
            assert.doesNotMatch(config.content, /<select name="(origin|class|ability)">/u);
            return config.buttons[0].callback(null, { form: { elements: {
                metal: { value: 'metal_alvorada' }, origin: { value: 'origem_isolado' },
            } } });
        } } } } };
        await openRulesProfileManager({ actor });
        assert.deepEqual(updates, [{ 'system.props.na_vanilla_metal': 'metal_alvorada' }]);
    } finally { Object.assign(globalThis, previous); }
});

test('Regras da Mesa salva categorias no mundo e escolhas vanilla da ficha só para o GM', async () => {
    const previous = { game: globalThis.game, foundry: globalThis.foundry, ui: globalThis.ui };
    let stored = '';
    const actorUpdates = [];
    const actor = {
        name: 'NPC de QA', isOwner: true,
        system: { props: { npc_nome: 'NPC', na_vanilla_metal: '', na_vanilla_origin: '' } },
        async update(patch) { actorUpdates.push(patch); },
    };
    try {
        globalThis.game = {
            user: { isGM: true },
            settings: {
                get: (_module, key) => key === SETTINGS.rulesSelection ? stored : undefined,
                async set(_module, _key, value) { stored = value; },
            },
        };
        globalThis.ui = { notifications: { info() {}, warn: assert.fail } };
        globalThis.foundry = { applications: { api: { DialogV2: { async wait(config) {
            assert.ok(config.classes.includes('na-table-rules-window'));
            assert.match(config.content, /<fieldset class="na-table-rule">\s*<legend>Metal da Nichirin<\/legend>/u);
            assert.match(config.content, /<span class="na-table-rule-label" aria-hidden="true">Metal da Nichirin<\/span>/u);
            assert.match(config.content, /name="rule_metal" value="homebrew" checked/u);
            assert.match(config.content, /<details><summary>Extras da mesa<\/summary>/u);
            const elements = {};
            for (const key of ['metal','habilidades','origens','status','classes','acoes','dano','vida_morte','respiracao','progressao'])
                elements['rule_' + key] = { value: key === 'metal' || key === 'origens' ? 'vanilla' : 'homebrew' };
            for (const key of ['nitoryu','ryoto','morote','acuidade','concussao','manejavel','municiada','precisao'])
                elements['property_' + key] = { value: 'homebrew' };
            for (const key of ['sonhos','raposa','forja_viva','corrente','brasas','veus','extras_pedra','extras_nevoa','extras_neve','troca_equivalente','olhos_escarlate'])
                elements['extra_' + key] = { checked: key !== 'raposa' };
            Object.assign(elements, {
                property_sojutsu: { checked: true },
                actor_metal: { value: 'metal_alvorada' },
                actor_origin: { value: 'origem_aldeao' },
                actor_class: { value: '' },
            });
            const save = config.buttons.find(button => button.action === 'save');
            return save.callback(null, { form: { elements } });
        } } } } };

        const result = await openRulesTableManager({ actor });
        assert.equal(result.ok, true);
        assert.equal(result.selection.metal, 'vanilla');
        assert.equal(result.selection.habilidades, 'homebrew');
        assert.equal(result.selection.propriedades.sojutsu, true);
        assert.equal(result.selection.raposa, false);
        assert.deepEqual(actorUpdates, [{
            'system.props.na_vanilla_metal': 'metal_alvorada',
            'system.props.na_vanilla_origin': 'origem_aldeao',
        }]);
        assert.equal(JSON.parse(stored).propriedades.sojutsu, true);
    } finally { Object.assign(globalThis, previous); }
});

test('Regras da Mesa oferece as classes Oni Vanilla e grava a escolha na ficha', async () => {
    const previous = { game: globalThis.game, foundry: globalThis.foundry, ui: globalThis.ui };
    const updates = [];
    const actor = {
        name: 'Oni de QA', isOwner: true,
        system: { props: { nome_oni: 'Oni', oni_especializacao_id: 'oni_especializacao_titan' } },
        async update(patch) { updates.push(patch); },
    };
    const vanillaClass = 'oni_especializacao_titan';
    try {
        globalThis.game = {
            user: { isGM: true },
            settings: {
                get: (_module, key) => key === SETTINGS.rulesSelection
                    ? JSON.stringify({ classes: 'vanilla' }) : undefined,
                async set() {},
            },
        };
        globalThis.ui = { notifications: { info() {}, warn: assert.fail } };
        globalThis.foundry = { applications: { api: { DialogV2: { async wait(config) {
            assert.match(config.content, /Titan/);
            assert.match(config.content, /Mestre da Recuperação/);
            assert.match(config.content, /crítico natural 19\+/);
            assert.doesNotMatch(config.content, /Mestre de Batalha/);
            const elements = Object.fromEntries(
                ['metal','habilidades','origens','status','classes','acoes','dano','vida_morte','respiracao','progressao']
                    .map(key => [`rule_${key}`, { value: key === 'classes' ? 'vanilla' : 'homebrew' }])
            );
            Object.assign(elements, {
                property_sojutsu: { checked: false },
                actor_metal: { value: '' }, actor_origin: { value: '' }, actor_class: { value: vanillaClass },
            });
            return config.buttons.find(button => button.action === 'save')
                .callback(null, { form: { elements } });
        } } } } };
        const result = await openRulesTableManager({ actor });
        assert.equal(result.ok, true);
        assert.deepEqual(updates, [{ 'system.props.na_vanilla_class': vanillaClass }]);
    } finally { Object.assign(globalThis, previous); }
});

test('Regras da Mesa bloqueia abertura por jogador antes de criar o diálogo', async () => {
    const previous = { game: globalThis.game, foundry: globalThis.foundry, ui: globalThis.ui };
    let warned = '';
    try {
        globalThis.game = { user: { isGM: false } };
        globalThis.ui = { notifications: { warn: value => { warned = value; } } };
        globalThis.foundry = { applications: { api: { DialogV2: { wait: assert.fail } } } };
        assert.equal(await openRulesTableManager(), undefined);
        assert.match(warned, /exclusivo do GM/u);
    } finally { Object.assign(globalThis, previous); }
});
